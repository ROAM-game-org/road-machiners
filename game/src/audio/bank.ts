import { AssetUnreachable, fetchAsset } from "../fetch-asset";
import { BANK, beatLoopSeconds, SOUND_FRAME_RATE, SOUND_FRAMES, type Cue } from "../data/sounds";

export type SoundFormat = "ogg" | "m4a";
export type Bank = Map<string, AudioBuffer>;
export type DecodeFailure = { file: string; error: unknown };
export type LoadedBank = { bank: Bank; failures: DecodeFailure[]; unreachable: DecodeFailure[] };

export class SoundUnreachable extends Error {
  constructor(file: string, cause: unknown) {
    super(`Sound ${file} could not be fetched`, { cause });
    this.name = "SoundUnreachable";
  }
}

export const SFX_DIR = `${import.meta.env.BASE_URL}sfx/`;

export class SoundDecodeFailure extends Error {
  readonly files: string[];

  constructor(failures: DecodeFailure[], total: number, formats: SoundFormat[], opusSupport: string) {
    const first = failures[0]?.error;
    const name = first instanceof Error ? first.name : "unknown";
    super(`Sounds failed to decode: ${failures.length} of ${total}, tried ${formats.join(", ")}, Ogg Opus support "${opusSupport}": ${name}`);
    this.name = "SoundDecodeFailure";
    this.files = failures.map((f) => f.file);
  }
}

export function soundFormats(opusSupport: string): SoundFormat[] {
  return opusSupport === "" ? ["m4a", "ogg"] : ["ogg", "m4a"];
}

export async function loadBank(
  ctx: BaseAudioContext,
  sounds: Record<string, Cue>,
  formats: SoundFormat[],
  progress?: (done: number, total: number) => void,
  lengths: Record<string, number> = SOUND_FRAMES,
): Promise<LoadedBank> {
  const files = Object.values(sounds).flatMap((c) => c.files);
  const decoded = new Map<string, AudioBuffer>();
  const failed: DecodeFailure[] = [];
  const order = [...formats];
  let done = 0;
  let next = 0;
  progress?.(0, files.length);
  async function worker(): Promise<void> {
    while (next < files.length) {
      const file = files[next++];
      const result = await decodeAny(ctx, file, order, lengths);
      if (result.buffer) decoded.set(file, result.buffer);
      else failed.push({ file, error: result.error });
      progress?.(++done, files.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(BANK.decodeAtOnce, files.length) }, worker));
  const bank: Bank = new Map(files.map((f) => [f, decoded.get(f) ?? standIn(ctx, sounds, decoded, f)]));
  const inFileOrder = files.flatMap((f) => failed.filter((x) => x.file === f));
  return {
    bank,
    failures: inFileOrder.filter((x) => !(x.error instanceof SoundUnreachable)),
    unreachable: inFileOrder.filter((x) => x.error instanceof SoundUnreachable),
  };
}

async function decodeAny(ctx: BaseAudioContext, file: string, order: SoundFormat[], lengths: Record<string, number>): Promise<{ buffer?: AudioBuffer; error?: unknown }> {
  let error: unknown;
  for (const format of [...order]) {
    const result = await decodeWithRetry(ctx, file, format, lengths);
    if (result.buffer) {
      if (order[0] !== format) order.splice(0, order.length, format, ...order.filter((f) => f !== format));
      return result;
    }
    error = result.error;
    if (error instanceof SoundUnreachable) break;
  }
  return { error };
}

async function decodeWithRetry(ctx: BaseAudioContext, file: string, format: SoundFormat, lengths: Record<string, number>): Promise<{ buffer?: AudioBuffer; error?: unknown }> {
  let error: unknown;
  for (let attempt = 0; attempt < BANK.tries; attempt++) {
    try {
      return { buffer: await decodeFile(ctx, file, format, lengths) };
    } catch (e) {
      error = e;
      if (e instanceof SoundUnreachable) break;
    }
  }
  return { error };
}

async function decodeFile(ctx: BaseAudioContext, file: string, format: SoundFormat, lengths: Record<string, number>): Promise<AudioBuffer> {
  const url = format === "m4a" ? file.replace(/\.ogg$/, ".m4a") : file;
  const bytes = await fetchAsset("Sound", SFX_DIR + url).catch((e: unknown) => {
    throw e instanceof AssetUnreachable ? new SoundUnreachable(file, e) : e;
  });
  let buffer: AudioBuffer;
  try {
    buffer = await ctx.decodeAudioData(bytes);
  } catch (e) {
    throw Object.assign(new Error(`Sound ${url} failed to decode: ${e}`, { cause: e }), { name: e instanceof Error ? e.name : "Error" });
  }
  return format === "m4a" ? trimToMaster(ctx, buffer, file, lengths) : buffer;
}

function trimToMaster(ctx: BaseAudioContext, buffer: AudioBuffer, file: string, lengths: Record<string, number>): AudioBuffer {
  const frames = lengths[file];
  if (frames === undefined) throw new Error(`No length for ${file} in sound-lengths.json`);
  const target = Math.round((frames * buffer.sampleRate) / SOUND_FRAME_RATE);
  if (buffer.length <= target) return buffer;
  const cut = ctx.createBuffer(buffer.numberOfChannels, target, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) cut.copyToChannel(buffer.getChannelData(c).subarray(0, target), c);
  return cut;
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
