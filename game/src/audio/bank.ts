import { download, DownloadFailed } from "../download";
import { BANK, beatLoopSeconds, type Cue, type SoundFormat } from "../data/sounds";

export type Bank = Map<string, AudioBuffer>;
export type DecodeFailure = { file: string; errors: unknown[] };
export type LoadedBank = { bank: Bank; failures: DecodeFailure[]; unreachable: DecodeFailure[]; format: string };

export class SoundUnreachable extends Error {
  constructor(file: string, cause: unknown) {
    super(`Sound ${file} could not be fetched`, { cause });
    this.name = "SoundUnreachable";
  }
}

export class BeatLengthMismatch extends Error {
  constructor(file: string, seconds: number, expected: number) {
    super(`Sound ${file} is ${seconds.toFixed(3)} s long, a loop is ${expected.toFixed(3)} s`);
    this.name = "BeatLengthMismatch";
  }
}

export class SoundDecodeFailure extends Error {
  readonly files: string[];

  constructor(failures: DecodeFailure[], total: number, support: Record<string, string>) {
    const errors = failures[0]?.errors ?? [];
    const perFormat = BANK.formats.map((format, i) => {
      const error = errors[i];
      const name = error instanceof Error ? error.name : error === undefined ? "untried" : "unknown";
      return `${format.ext} "${support[format.ext] ?? ""}" ${name}`;
    });
    super(`Sounds failed to decode: ${failures.length} of ${total}, ${perFormat.join(", ")}`);
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
  const failed: DecodeFailure[] = [];
  let order: SoundFormat[] = BANK.formats;
  let done = 0;
  let next = 0;
  progress?.(0, files.length);
  async function worker(): Promise<void> {
    while (next < files.length) {
      const file = files[next++];
      const cue = Object.values(sounds).find((c) => c.files.includes(file))!;
      const result = await decodeInFormats(ctx, file, cue, order);
      if (result.buffer) {
        decoded.set(file, result.buffer);
        if (result.format !== order[0]) order = [result.format!, ...order.filter((f) => f !== result.format)];
      } else failed.push({ file, errors: result.errors });
      progress?.(++done, files.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(BANK.decodeAtOnce, files.length) }, worker));
  const bank: Bank = new Map(files.map((f) => [f, decoded.get(f) ?? standIn(ctx, sounds, decoded, f)]));
  const inFileOrder = files.flatMap((f) => failed.filter((x) => x.file === f));
  const isUnreachable = (x: DecodeFailure) => x.errors.some((e) => e instanceof SoundUnreachable);
  return {
    bank,
    failures: inFileOrder.filter((x) => !isUnreachable(x)),
    unreachable: inFileOrder.filter(isUnreachable),
    format: order[0].ext,
  };
}

async function decodeInFormats(
  ctx: BaseAudioContext,
  file: string,
  cue: Cue,
  order: SoundFormat[],
): Promise<{ buffer?: AudioBuffer; format?: SoundFormat; errors: unknown[] }> {
  const errors: unknown[] = [];
  for (const format of order) {
    const result = await decodeWithRetry(ctx, file, format, cue);
    if (result.buffer) return { buffer: result.buffer, format, errors };
    errors.push(result.error);
    if (result.error instanceof SoundUnreachable) break;
  }
  return { errors };
}

async function decodeWithRetry(ctx: BaseAudioContext, file: string, format: SoundFormat, cue: Cue): Promise<{ buffer?: AudioBuffer; error?: unknown }> {
  let error: unknown;
  for (let attempt = 0; attempt < BANK.tries; attempt++) {
    try {
      return { buffer: await decodeFile(ctx, file, format, cue) };
    } catch (e) {
      error = e;
      if (e instanceof SoundUnreachable) break;
    }
  }
  return { error };
}

async function decodeFile(ctx: BaseAudioContext, file: string, format: SoundFormat, cue: Cue): Promise<AudioBuffer> {
  const url = `${import.meta.env.BASE_URL}${format.dir}${file.replace(/\.[^.]+$/, "")}.${format.ext}`;
  const bytes = await download(url).catch((e: unknown) => {
    throw e instanceof DownloadFailed ? new SoundUnreachable(file, e) : e;
  });
  const buffer = await ctx.decodeAudioData(bytes);
  return cue.beat ? fitLoop(ctx, buffer, beatLoopSeconds(cue.beat), file) : buffer;
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
  const cue = Object.values(sounds).find((c) => c.files.includes(file))!;
  for (const sibling of cue.files) {
    const buffer = decoded.get(sibling);
    if (buffer) return buffer;
  }
  const seconds = cue.beat ? beatLoopSeconds(cue.beat) : BANK.silentSeconds;
  return ctx.createBuffer(1, Math.max(1, Math.ceil(seconds * ctx.sampleRate)), ctx.sampleRate);
}
