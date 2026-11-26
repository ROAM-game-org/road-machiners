import SONGS from "../data/combat-songs.json";
import { SCORE_BLOCKS, soundsWith } from "../data/sounds";
import { loadBank, reportFailures, type BankOptions } from "../audio/bank";
import { BlockSession, type BlockEvent, type BlockSong, type Fired } from "./block-session";
import { BlockVoices, type KitBuffers } from "./block-voices";

export const COMBAT_SONGS = SONGS as Record<string, BlockSong>;

export type Kit = { name: string; song: BlockSong; buffers: KitBuffers };
export type KitLoader = (name: string) => Promise<Kit | null>;

const TICK_MS = 100;
const LOG_LINES = 100;

export function bankKitLoader(ctx: BaseAudioContext, options: BankOptions, report: (err: unknown) => void): KitLoader {
  return async (name) => {
    const song = COMBAT_SONGS[name];
    if (!song) throw new Error(`Unknown combat song ${name}`);
    const files = [song.file, song.guitars, song.cymbals.file];
    const loaded = await loadBank(ctx, soundsWith(files), options);
    if (loaded.failures.length > 0) {
      for (const failure of reportFailures(loaded.failures, files.length, new Set(), options.support)) report(failure);
      return null;
    }
    if (loaded.unreachable.length > 0) {
      console.warn(`Combat song ${name} could not be fetched, so the next fight asks for another song`, loaded.unreachable);
      return null;
    }
    const [main, guitars, cymbals] = files.map((f) => loaded.bank.get(f)!);
    return { name, song, buffers: { song: main, guitars, cymbals } };
  };
}

export class CombatMusic {
  readonly log: string[] = [];
  private kit: Kit | null = null;
  private loadingKit = false;
  private missed: string | null = null;
  private wanted = false;
  private playingTitle: string | null = null;
  private loading: Promise<void>;
  private current: BlockSession | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private voices: BlockVoices;

  constructor(
    private ctx: BaseAudioContext,
    out: AudioNode,
    private load: KitLoader,
    private roll: () => number,
    private onError: (e: unknown) => void,
  ) {
    this.voices = new BlockVoices(ctx, out);
    this.loading = Promise.resolve();
    this.requestKit();
  }

  ready(): Promise<void> {
    return this.loading;
  }

  get session(): BlockSession | null {
    return this.current;
  }

  get title(): string | null {
    return this.playingTitle ?? this.kit?.song.title ?? null;
  }

  get inCombat(): boolean {
    return this.current?.inCombat ?? false;
  }

  setCombat(on: boolean): void {
    this.wanted = on;
    if (on && !this.kit) this.requestKit();
    if (on === this.inCombat) return;
    if (on) this.start();
    else this.stop();
  }

  fire(kind: BlockEvent, at: number): Fired | null {
    return this.current?.fire(kind, at) ?? null;
  }

  nextSong(): void {
    if (this.loadingKit) return;
    const names = Object.keys(COMBAT_SONGS);
    const name = names[(names.indexOf(this.kit?.name ?? names[0]) + 1) % names.length];
    this.loading = this.fetchKit(name)
      .then((kit) => {
        if (kit) this.switchTo(kit);
      })
      .catch(this.onError);
  }

  private switchTo(kit: Kit): void {
    this.kit = kit;
    const old = this.current;
    if (!old?.inCombat) return this.startIfWanted();
    const at = old.end(this.ctx.currentTime);
    const tail = old.played.at(-1)!;
    for (const v of tail.voices) v.fadeOut(at + old.beatSeconds, old.beatSeconds / 2);
    this.note(`end ${this.playingTitle}`);
    this.voices.use(kit.buffers);
    this.playingTitle = kit.song.title;
    this.note(`start ${kit.song.title}`);
    this.current = new BlockSession(kit.song, this.voices, this.roll);
    this.current.start(at - SCORE_BLOCKS.startLeadSeconds);
  }

  tick(): void {
    this.current?.tick(this.ctx.currentTime);
  }

  private start(): void {
    const kit = this.kit;
    if (!kit) return;
    this.voices.use(kit.buffers);
    this.playingTitle = kit.song.title;
    this.note(`start ${kit.song.title}`);
    this.current = new BlockSession(kit.song, this.voices, this.roll);
    this.current.start(this.ctx.currentTime);
    this.timer ??= setInterval(() => this.tick(), TICK_MS);
  }

  private startIfWanted(): void {
    if (this.wanted && !this.inCombat) this.start();
  }

  private stop(): void {
    this.current?.end(this.ctx.currentTime);
    this.note(`end ${this.playingTitle}`);
    this.voices.release();
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.requestKit();
  }

  private requestKit(): void {
    if (this.loadingKit) return;
    this.loading = this.loadNext().catch(this.onError);
  }

  private async loadNext(): Promise<void> {
    const name = this.pickSong();
    if (this.kit?.name === name) return;
    this.kit = (await this.fetchKit(name)) ?? this.kit;
    this.startIfWanted();
  }

  private pickSong(): string {
    const names = Object.keys(COMBAT_SONGS);
    const choices = names.length > 1 ? names.filter((n) => n !== this.missed) : names;
    return choices[Math.floor(this.roll() * choices.length)];
  }

  private async fetchKit(name: string): Promise<Kit | null> {
    this.loadingKit = true;
    this.noteKit(name, "asked");
    try {
      const kit = await this.load(name);
      this.settle(name, kit !== null);
      return kit;
    } catch (e) {
      this.settle(name, false);
      throw e;
    } finally {
      this.loadingKit = false;
    }
  }

  private settle(name: string, landed: boolean): void {
    this.missed = landed ? null : name;
    this.noteKit(name, landed ? "landed" : "missing");
  }

  private noteKit(name: string, outcome: string): void {
    this.note(`kit ${name} ${outcome}`);
  }

  private note(line: string): void {
    this.log.push(line);
    if (this.log.length > LOG_LINES) this.log.shift();
  }
}
