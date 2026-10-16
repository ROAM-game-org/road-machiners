import { downloadBody, DownloadFailed, HttpStatusError } from "../download";
import { publicUrl } from "../public-url";
import { BANK, beatLoopSeconds, type Cue, type SoundFormat } from "../data/sounds";

export type Bank = Map<string, AudioBuffer>;
export type FailureKind = "fetch" | "bytes" | "codec" | "decoder";
export type DecodeEvidence = {
  status: number | null;
  contentType: string;
  redirected: boolean;
  receivedBytes: number | null;
  expectedBytes: number;
  signature: boolean;
  contextState: string;
  pageVisible: boolean;
  decodedMegabytes: number;
  deviceMemory: number | null;
};
export type DecodeFailure = { file: string; kind: FailureKind; evidence: DecodeEvidence; errors: unknown[] };
export type LoadedBank = { bank: Bank; failures: DecodeFailure[]; unreachable: DecodeFailure[]; format: string };
export type BankOptions = {
  expectedBytes: Record<string, number>;
  support: Record<string, string>;
  progress?: (done: number, total: number) => void;
};

export class BeatLengthMismatch extends Error {
  constructor(file: string, seconds: number, expected: number) {
    super(`Sound ${file} is ${seconds.toFixed(3)} s long, a loop is ${expected.toFixed(3)} s`);
    this.name = "BeatLengthMismatch";
  }
}

const RECOVERABLE: FailureKind[] = ["bytes", "decoder"];
const BYTES_PER_MEGABYTE = 1e6;
const BYTES_PER_SAMPLE = 4;

class SoundFileFault extends Error {
  constructor(
    readonly kind: FailureKind,
    readonly evidence: DecodeEvidence,
    readonly error: unknown,
  ) {
    super(`Sound fault (${kind})`);
  }
}

export function formatSupport(): Record<string, string> {
  const audio = new Audio();
  return Object.fromEntries(BANK.formats.map((f) => [f.ext, audio.canPlayType(f.mime)]));
}

export class SoundDecodeFailure extends Error {
  readonly files: string[];

  constructor(kind: FailureKind, failures: DecodeFailure[], total: number, recovered: number, support: Record<string, string>) {
    const first = failures[0];
    super(`Sound decode failed (${kind}): ${failures.length} of ${total}, ${describe(first.evidence)}, recovered later ${recovered}: ${perFormat(first.errors, support)}`);
    this.name = "SoundDecodeFailure";
    this.files = failures.map((f) => f.file);
  }
}

function perFormat(errors: unknown[], support: Record<string, string>): string {
  return BANK.formats
    .map((format, i) => {
      const error = errors[i];
      const cause = error instanceof Error ? `${error.name}: ${error.message}` : error === undefined ? "untried" : String(error);
      return `${format.ext} "${support[format.ext] ?? ""}" ${cause}`;
    })
    .join("; ");
}

function describe(e: DecodeEvidence): string {
  return [bodyText(e), httpText(e), pageText(e), `${e.decodedMegabytes} MB decoded`, `device memory ${e.deviceMemory ?? "unknown"}`].join(", ");
}

function bodyText(e: DecodeEvidence): string {
  return `got ${e.receivedBytes ?? "no"} of ${e.expectedBytes} bytes, signature ${e.signature ? "yes" : "no"}`;
}

function httpText(e: DecodeEvidence): string {
  return `HTTP ${e.status ?? "none"} ${e.contentType || "no content type"}${e.redirected ? " redirected" : ""}`;
}

function pageText(e: DecodeEvidence): string {
  return `context ${e.contextState}, page ${e.pageVisible ? "visible" : "hidden"}`;
}

export function reportFailures(failures: DecodeFailure[], total: number, recovered: Set<string>, support: Record<string, string>): SoundDecodeFailure[] {
  const kinds = [...new Set(failures.map((f) => f.kind))];
  return kinds.map((kind) => {
    const ofKind = failures.filter((f) => f.kind === kind);
    return new SoundDecodeFailure(kind, ofKind, total, ofKind.filter((f) => recovered.has(f.file)).length, support);
  });
}

type Job = { ctx: BaseAudioContext; options: BankOptions; decodedMegabytes: () => number };

function cueOf(sounds: Record<string, Cue>, file: string): Cue {
  return Object.values(sounds).find((c) => c.files.includes(file))!;
}

function preferring(ext: string): SoundFormat[] {
  return [...BANK.formats].sort((a, b) => Number(b.ext === ext) - Number(a.ext === ext));
}

export async function loadBank(ctx: BaseAudioContext, sounds: Record<string, Cue>, options: BankOptions): Promise<LoadedBank> {
  const files = Object.values(sounds).flatMap((c) => c.files);
  const decoded = new Map<string, AudioBuffer>();
  const failed: DecodeFailure[] = [];
  const job: Job = { ctx, options, decodedMegabytes: () => megabytesOf(decoded.values()) };
  let order = BANK.formats;
  let done = 0;
  let next = 0;
  options.progress?.(0, files.length);
  async function worker(): Promise<void> {
    while (next < files.length) {
      const file = files[next++];
      const result = await decodeInFormats(job, file, cueOf(sounds, file), order, 0, BANK.tries);
      if ("buffer" in result) {
        decoded.set(file, result.buffer);
        if (result.format !== order[0]) order = preferring(result.format.ext);
      } else failed.push({ file, kind: result.kind, evidence: result.evidence, errors: result.errors });
      options.progress?.(++done, files.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(BANK.decodeAtOnce, files.length) }, worker));
  const bank: Bank = new Map(files.map((f) => [f, decoded.get(f) ?? standIn(ctx, sounds, decoded, f)]));
  const inFileOrder = files.flatMap((f) => failed.filter((x) => x.file === f));
  return {
    bank,
    failures: inFileOrder.filter((x) => !isUnreachable(x)),
    unreachable: inFileOrder.filter(isUnreachable),
    format: order[0].ext,
  };
}

export async function recoverBank(ctx: BaseAudioContext, loaded: LoadedBank, sounds: Record<string, Cue>, options: BankOptions): Promise<Set<string>> {
  const recovered = new Set<string>();
  const job: Job = { ctx, options, decodedMegabytes: () => megabytesOf(new Set(loaded.bank.values())) };
  for (const failure of loaded.failures.filter((f) => RECOVERABLE.includes(f.kind))) {
    const result = await decodeInFormats(job, failure.file, cueOf(sounds, failure.file), preferring(loaded.format), 1, 1);
    if (!("buffer" in result)) continue;
    loaded.bank.set(failure.file, result.buffer);
    recovered.add(failure.file);
  }
  return recovered;
}

function networkDown(kind: FailureKind, error: unknown): boolean {
  return kind === "fetch" && error instanceof DownloadFailed;
}

function isUnreachable(f: DecodeFailure): boolean {
  return networkDown(f.kind, f.errors.at(-1));
}

function megabytesOf(buffers: Iterable<AudioBuffer>): number {
  let bytes = 0;
  for (const b of buffers) bytes += b.length * b.numberOfChannels * BYTES_PER_SAMPLE;
  return Math.round(bytes / BYTES_PER_MEGABYTE);
}

type Decoded = { buffer: AudioBuffer; format: SoundFormat } | { kind: FailureKind; evidence: DecodeEvidence; errors: unknown[] };

async function decodeInFormats(job: Job, file: string, cue: Cue, order: SoundFormat[], firstAttempt: number, attempts: number): Promise<Decoded> {
  const errors: unknown[] = [];
  let fault!: SoundFileFault;
  for (const format of order) {
    for (let attempt = firstAttempt; attempt < firstAttempt + attempts; attempt++) {
      try {
        return { buffer: await decodeFile(job, file, format, cue, attempt), format };
      } catch (e) {
        if (!(e instanceof SoundFileFault)) throw e;
        fault = e;
        if (networkDown(e.kind, e.error)) break;
      }
    }
    errors.push(fault.error);
    if (networkDown(fault.kind, fault.error)) break;
  }
  return { kind: fault.kind, evidence: fault.evidence, errors };
}

type Probe = (res: Response | null, bytes: Uint8Array | null, status?: number | null) => DecodeEvidence;

function responseFacts(res: Response | null, status: number | null = null) {
  if (!res) return { status, contentType: "", redirected: false };
  return { status: res.status, contentType: res.headers.get("content-type") ?? "", redirected: res.redirected };
}

function hasSignature(format: SoundFormat, bytes: Uint8Array): boolean {
  return [...format.signature.text].every((c, i) => bytes[format.signature.at + i] === c.charCodeAt(0));
}

function browserFacts(ctx: BaseAudioContext, decodedMegabytes: number) {
  const navigator = globalThis.navigator as { deviceMemory?: number } | undefined;
  return {
    contextState: ctx.state,
    pageVisible: globalThis.document?.visibilityState !== "hidden",
    decodedMegabytes,
    deviceMemory: navigator?.deviceMemory ?? null,
  };
}

function probeOf(format: SoundFormat, job: Job, expectedBytes: number): Probe {
  return (res, bytes, status) => ({
    ...responseFacts(res, status),
    receivedBytes: bytes?.length ?? null,
    signature: bytes !== null && hasSignature(format, bytes),
    expectedBytes,
    ...browserFacts(job.ctx, job.decodedMegabytes()),
  });
}

function statusOf(e: unknown): number | null {
  const last = e instanceof Error && e.cause ? e.cause : e;
  return last instanceof HttpStatusError ? last.status : null;
}

async function fetchSound(url: string, attempt: number, probe: Probe): Promise<{ response: Response; bytes: Uint8Array }> {
  try {
    const { response, bytes } = await downloadBody(url, attempt > 0 ? { cache: "reload" } : undefined);
    return { response, bytes: new Uint8Array(bytes) };
  } catch (e) {
    throw new SoundFileFault("fetch", probe(null, null, statusOf(e)), e);
  }
}

async function decodeFile(job: Job, file: string, format: SoundFormat, cue: Cue, attempt: number): Promise<AudioBuffer> {
  const name = `${file.replace(/\.[^.]+$/, "")}.${format.ext}`;
  const expected = job.options.expectedBytes[name];
  if (expected === undefined) throw new Error(`Sound ${name} has no expected size`);
  const probe = probeOf(format, job, expected);
  const { response, bytes } = await fetchSound(publicUrl(`${format.dir}${name}`), attempt, probe);
  const facts = probe(response, bytes);
  if (bytes.length !== expected || !facts.signature) {
    throw new SoundFileFault("bytes", facts, new Error(`Sound ${name} arrived as ${bytes.length} of ${expected} bytes`));
  }
  try {
    const buffer = await job.ctx.decodeAudioData(bytes.buffer as ArrayBuffer);
    return cue.beat ? fitLoop(job.ctx, buffer, beatLoopSeconds(cue.beat), file) : buffer;
  } catch (e) {
    throw new SoundFileFault(job.options.support[format.ext] === "" ? "codec" : "decoder", facts, e);
  }
}

function fitLoop(ctx: BaseAudioContext, buffer: AudioBuffer, seconds: number, file: string): AudioBuffer {
  const length = Math.round(seconds * ctx.sampleRate);
  if (Math.abs(buffer.length - length) > BANK.beatSlackSeconds * ctx.sampleRate) {
    throw new BeatLengthMismatch(file, buffer.length / ctx.sampleRate, seconds);
  }
  if (buffer.length === length) return buffer;
  const fitted = ctx.createBuffer(buffer.numberOfChannels, length, ctx.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    fitted.getChannelData(c).set(buffer.getChannelData(c).subarray(0, length));
  }
  return fitted;
}

function standIn(ctx: BaseAudioContext, sounds: Record<string, Cue>, decoded: Map<string, AudioBuffer>, file: string): AudioBuffer {
  const cue = cueOf(sounds, file);
  for (const sibling of cue.files) {
    const buffer = decoded.get(sibling);
    if (buffer) return buffer;
  }
  const seconds = cue.beat ? beatLoopSeconds(cue.beat) : BANK.silentSeconds;
  return ctx.createBuffer(1, Math.max(1, Math.ceil(seconds * ctx.sampleRate)), ctx.sampleRate);
}
