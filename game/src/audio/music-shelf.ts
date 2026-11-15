import { soundsWith } from '../data/sounds';
import { loadBank, reportFailures, type BankOptions, type SoundBank } from './bank';

export interface MusicTracks {
  want(file: string): Promise<boolean>;
  release(file: string): void;
}

export type TrackLoader = (file: string) => Promise<AudioBuffer | null>;

export function bankTrackLoader(ctx: BaseAudioContext, options: BankOptions, report: (err: unknown) => void): TrackLoader {
  return async (file) => {
    const loaded = await loadBank(ctx, soundsWith([file]), options);
    for (const failure of reportFailures(loaded.failures, 1, new Set(), options.support)) report(failure);
    for (const failure of loaded.unreachable) console.warn(`Music ${failure.file} could not be fetched, so it stays silent`, failure.errors);
    if (loaded.failures.length > 0 || loaded.unreachable.length > 0) return null;
    return loaded.bank.get(file) ?? null;
  };
}

export class MusicShelf implements MusicTracks {
  private holds = new Map<string, number>();
  private loading = new Map<string, Promise<boolean>>();
  private failed = new Set<string>();

  constructor(private bank: SoundBank, private load: TrackLoader, private report: (err: unknown) => void) {}

  want(file: string): Promise<boolean> {
    this.holds.set(file, (this.holds.get(file) ?? 0) + 1);
    if (this.bank.has(file)) return Promise.resolve(true);
    if (this.failed.has(file)) return Promise.resolve(false);
    const running = this.loading.get(file) ?? this.fetch(file);
    this.loading.set(file, running);
    return running;
  }

  release(file: string): void {
    const holds = (this.holds.get(file) ?? 0) - 1;
    if (holds > 0) return void this.holds.set(file, holds);
    this.holds.delete(file);
    this.bank.delete(file);
  }

  private async fetch(file: string): Promise<boolean> {
    try {
      const buffer = await this.load(file);
      if (buffer) this.bank.set(file, buffer);
      else this.failed.add(file);
      return buffer !== null;
    } catch (error) {
      this.failed.add(file);
      this.report(error);
      return false;
    } finally {
      this.loading.delete(file);
    }
  }
}
