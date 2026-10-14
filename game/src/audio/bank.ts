import { DownloadFailed, fetchBytes } from "../fetch-bytes";
import { BANK, beatLoopSeconds, type Cue } from "../data/sounds";

export type Bank = Map<string, AudioBuffer>;
export type DecodeFailure = { file: string; error: unknown };
export type LoadedBank = { bank: Bank; failures: DecodeFailure[] };

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
      if (e instanceof DownloadFailed) break;
    }
  }
  return { error };
}

async function decodeFile(ctx: BaseAudioContext, file: string): Promise<AudioBuffer> {
  return ctx.decodeAudioData(await fetchBytes(SFX_DIR + file));
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
