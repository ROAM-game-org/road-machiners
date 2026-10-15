import { downloadBody, DownloadFailed, HttpStatusError } from "../download";
import { BANK, beatLoopSeconds, type Cue } from "../data/sounds";

export type Bank = Map<string, AudioBuffer>;
export type FailureKind = "fetch" | "bytes" | "codec" | "decoder";
export type DecodeEvidence = {
  status: number | null;
  contentType: string;
  redirected: boolean;
  receivedBytes: number | null;
  expectedBytes: number;
  ogg: boolean;
  contextState: string;
  pageVisible: boolean;
  decodedMegabytes: number;
  deviceMemory: number | null;
};
export type DecodeFailure = { file: string; kind: FailureKind; evidence: DecodeEvidence; error: unknown };
export type LoadedBank = { bank: Bank; failures: DecodeFailure[]; unreachable: DecodeFailure[] };
export type BankOptions = {
  expectedBytes: Record<string, number>;
  opusSupport: string;
  progress?: (done: number, total: number) => void;
};

export const SFX_DIR = `${import.meta.env.BASE_URL}sfx/`;

const OGG_MAGIC = [0x4f, 0x67, 0x67, 0x53];
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

export class SoundDecodeFailure extends Error {
  readonly files: string[];

  constructor(kind: FailureKind, failures: DecodeFailure[], total: number, recovered: number) {
    const first = failures[0];
    const cause = first.error instanceof Error ? `${first.error.name}: ${first.error.message}` : String(first.error);
    super(`Sound decode failed (${kind}): ${failures.length} of ${total}, ${describe(first.evidence)}, recovered later ${recovered}: ${cause}`);
    this.name = "SoundDecodeFailure";
    this.files = failures.map((f) => f.file);
  }
}

function describe(e: DecodeEvidence): string {
  return [bodyText(e), httpText(e), pageText(e), `${e.decodedMegabytes} MB decoded`, `device memory ${e.deviceMemory ?? "unknown"}`].join(", ");
}

function bodyText(e: DecodeEvidence): string {
  return `got ${e.receivedBytes ?? "no"} of ${e.expectedBytes} bytes, Ogg ${e.ogg ? "yes" : "no"}`;
}

function httpText(e: DecodeEvidence): string {
  return `HTTP ${e.status ?? "none"} ${e.contentType || "no content type"}${e.redirected ? " redirected" : ""}`;
}

function pageText(e: DecodeEvidence): string {
  return `context ${e.contextState}, page ${e.pageVisible ? "visible" : "hidden"}`;
}

export function reportFailures(failures: DecodeFailure[], total: number, recovered: Set<string>): SoundDecodeFailure[] {
  const kinds = [...new Set(failures.map((f) => f.kind))];
  return kinds.map((kind) => {
    const ofKind = failures.filter((f) => f.kind === kind);
    return new SoundDecodeFailure(kind, ofKind, total, ofKind.filter((f) => recovered.has(f.file)).length);
  });
}

export async function loadBank(ctx: BaseAudioContext, sounds: Record<string, Cue>, options: BankOptions): Promise<LoadedBank> {
  const files = Object.values(sounds).flatMap((c) => c.files);
  const decoded = new Map<string, AudioBuffer>();
  const failed: DecodeFailure[] = [];
  const decodedMegabytes = () => megabytesOf(decoded.values());
  let done = 0;
  let next = 0;
  options.progress?.(0, files.length);
  async function worker(): Promise<void> {
    while (next < files.length) {
      const file = files[next++];
      const result = await decodeWithRetry(ctx, file, options, decodedMegabytes);
      if ("buffer" in result) decoded.set(file, result.buffer);
      else failed.push({ file, kind: result.fault.kind, evidence: result.fault.evidence, error: result.fault.error });
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
  };
}

export async function recoverBank(ctx: BaseAudioContext, loaded: LoadedBank, options: BankOptions): Promise<Set<string>> {
  const recovered = new Set<string>();
  for (const failure of loaded.failures.filter((f) => RECOVERABLE.includes(f.kind))) {
    try {
      loaded.bank.set(failure.file, await decodeFile(ctx, failure.file, 1, options, () => megabytesOf(new Set(loaded.bank.values()))));
      recovered.add(failure.file);
    } catch (e) {
      if (!(e instanceof SoundFileFault)) throw e;
    }
  }
  return recovered;
}

function isUnreachable(f: { kind: FailureKind; error: unknown }): boolean {
  return f.kind === "fetch" && f.error instanceof DownloadFailed;
}

function megabytesOf(buffers: Iterable<AudioBuffer>): number {
  let bytes = 0;
  for (const b of buffers) bytes += b.length * b.numberOfChannels * BYTES_PER_SAMPLE;
  return Math.round(bytes / BYTES_PER_MEGABYTE);
}

async function decodeWithRetry(
  ctx: BaseAudioContext,
  file: string,
  options: BankOptions,
  decodedMegabytes: () => number,
): Promise<{ buffer: AudioBuffer } | { fault: SoundFileFault }> {
  let fault: SoundFileFault | undefined;
  for (let attempt = 0; attempt < BANK.tries; attempt++) {
    try {
      return { buffer: await decodeFile(ctx, file, attempt, options, decodedMegabytes) };
    } catch (e) {
      if (!(e instanceof SoundFileFault)) throw e;
      fault = e;
      if (isUnreachable(e)) break;
    }
  }
  return { fault: fault! };
}

type Probe = (res: Response | null, bytes: Uint8Array | null, status?: number | null) => DecodeEvidence;

function responseFacts(res: Response | null, status: number | null = null) {
  if (!res) return { status, contentType: "", redirected: false };
  return { status: res.status, contentType: res.headers.get("content-type") ?? "", redirected: res.redirected };
}

function hasOggMagic(bytes: Uint8Array): boolean {
  return OGG_MAGIC.every((b, i) => bytes[i] === b);
}

function bodyFacts(bytes: Uint8Array | null) {
  return { receivedBytes: bytes?.length ?? null, ogg: bytes !== null && hasOggMagic(bytes) };
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

function probeOf(ctx: BaseAudioContext, expectedBytes: number, decodedMegabytes: () => number): Probe {
  return (res, bytes, status) => ({ ...responseFacts(res, status), ...bodyFacts(bytes), expectedBytes, ...browserFacts(ctx, decodedMegabytes()) });
}

function statusOf(e: unknown): number | null {
  const last = e instanceof Error && e.cause ? e.cause : e;
  return last instanceof HttpStatusError ? last.status : null;
}

async function fetchSound(file: string, attempt: number, probe: Probe): Promise<{ response: Response; bytes: Uint8Array }> {
  try {
    const { response, bytes } = await downloadBody(SFX_DIR + file, attempt > 0 ? { cache: "reload" } : undefined);
    return { response, bytes: new Uint8Array(bytes) };
  } catch (e) {
    throw new SoundFileFault("fetch", probe(null, null, statusOf(e)), e);
  }
}

async function decodeFile(
  ctx: BaseAudioContext,
  file: string,
  attempt: number,
  options: BankOptions,
  decodedMegabytes: () => number,
): Promise<AudioBuffer> {
  const expected = options.expectedBytes[file];
  if (expected === undefined) throw new Error(`Sound ${file} has no expected size`);
  const probe = probeOf(ctx, expected, decodedMegabytes);
  const { response, bytes } = await fetchSound(file, attempt, probe);
  const facts = probe(response, bytes);
  if (bytes.length !== expected || !facts.ogg) {
    throw new SoundFileFault("bytes", facts, new Error(`Sound ${file} arrived as ${bytes.length} of ${expected} bytes`));
  }
  try {
    return await ctx.decodeAudioData(bytes.buffer as ArrayBuffer);
  } catch (e) {
    throw new SoundFileFault(options.opusSupport === "" ? "codec" : "decoder", facts, e);
  }
}

function standIn(ctx: BaseAudioContext, sounds: Record<string, Cue>, decoded: Map<string, AudioBuffer>, file: string): AudioBuffer {
  const cue = Object.values(sounds).find((c) => c.files.includes(file))!;
  for (const sibling of cue.files) {
    const buffer = decoded.get(sibling);
    if (buffer) return buffer;
  }
  const seconds = cue.beat ? beatLoopSeconds(cue.beat) : BANK.silentSeconds;
  return ctx.createBuffer(1, Math.max(1, Math.ceil(seconds * ctx.sampleRate)), ctx.sampleRate);
}
