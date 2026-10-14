import { BANK, beatLoopSeconds, type Cue } from "../data/sounds";

export type Bank = Map<string, AudioBuffer>;
export type DecodeFailure = { file: string; error: unknown };
export type LoadedBank = { bank: Bank; failures: DecodeFailure[] };

export type OggShape = "ok" | "not-ogg" | "truncated";
type OggPage = { bodyStart: number; end: number; lastPage: boolean };

const OGG_CAPTURE = [0x4f, 0x67, 0x67, 0x53];
const OPUS_HEAD = [0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64];
const OGG_FIXED_HEADER = 27;
const OGG_END_OF_STREAM = 4;

export const SFX_DIR = `${import.meta.env.BASE_URL}sfx/`;

export class SoundDecodeFailure extends Error {
  readonly files: string[];

  constructor(failures: DecodeFailure[], total: number, opusSupport: string) {
    const first = failures[0]?.error;
    const name = first instanceof Error ? first.name : "unknown";
    super(`Sounds failed to decode: ${failures.length} of ${total}, Ogg Opus support "${opusSupport}": ${name}`);
    this.name = "SoundDecodeFailure";
    this.files = failures.map((f) => f.file);
  }
}

export async function loadBank(
  ctx: BaseAudioContext,
  sounds: Record<string, Cue>,
  progress?: (done: number, total: number) => void,
): Promise<LoadedBank> {
  const files = Object.values(sounds).flatMap((c) => c.files);
  const decoded = new Map<string, AudioBuffer>();
  const failures: DecodeFailure[] = [];
  let done = 0;
  let next = 0;
  progress?.(0, files.length);
  async function worker(): Promise<void> {
    while (next < files.length) {
      const file = files[next++];
      const result = await decodeWithRetry(ctx, file);
      if (result.buffer) decoded.set(file, result.buffer);
      else failures.push({ file, error: result.error });
      progress?.(++done, files.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(BANK.decodeAtOnce, files.length) }, worker));
  const bank: Bank = new Map(files.map((f) => [f, decoded.get(f) ?? standIn(ctx, sounds, decoded, f)]));
  return { bank, failures: files.flatMap((f) => failures.filter((x) => x.file === f)) };
}

async function decodeWithRetry(ctx: BaseAudioContext, file: string): Promise<{ buffer?: AudioBuffer; error?: unknown }> {
  let error: unknown;
  for (let attempt = 0; attempt < BANK.tries; attempt++) {
    try {
      return { buffer: await decodeFile(ctx, file) };
    } catch (e) {
      error = e;
    }
  }
  return { error };
}

async function decodeFile(ctx: BaseAudioContext, file: string): Promise<AudioBuffer> {
  const res = await fetch(SFX_DIR + file);
  if (!res.ok) throw new Error(`Sound ${file} failed to load: HTTP ${res.status}`);
  return ctx.decodeAudioData(await res.arrayBuffer());
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

export function oggShape(bytes: Uint8Array): OggShape {
  if (!startsWith(bytes, OGG_CAPTURE, 0)) return "not-ogg";
  const first = pageAt(bytes, 0);
  if (!first) return "truncated";
  if (!startsWith(bytes, OPUS_HEAD, first.bodyStart)) return "not-ogg";
  return endsWhole(bytes, first) ? "ok" : "truncated";
}

function endsWhole(bytes: Uint8Array, first: OggPage): boolean {
  let page = first;
  while (page.end < bytes.length) {
    const next = pageAt(bytes, page.end);
    if (!next) return false;
    page = next;
  }
  return page.lastPage;
}

function pageAt(bytes: Uint8Array, start: number): OggPage | undefined {
  const segmentsAt = start + OGG_FIXED_HEADER - 1;
  if (!startsWith(bytes, OGG_CAPTURE, start) || segmentsAt >= bytes.length) return undefined;
  const bodyStart = segmentsAt + 1 + bytes[segmentsAt];
  if (bodyStart > bytes.length) return undefined;
  const end = bytes.subarray(segmentsAt + 1, bodyStart).reduce((sum, lacing) => sum + lacing, bodyStart);
  return end <= bytes.length ? { bodyStart, end, lastPage: (bytes[start + 5] & OGG_END_OF_STREAM) !== 0 } : undefined;
}

function startsWith(bytes: Uint8Array, pattern: number[], at: number): boolean {
  return at + pattern.length <= bytes.length && pattern.every((b, i) => bytes[at + i] === b);
}
