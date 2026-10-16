import SONGS from "../data/combat-songs.json";
import { SCORE_BLOCKS, soundsWith } from "../data/sounds";
import { loadBank, type BankOptions } from "../audio/bank";
import { BlockSession, type BlockEvent, type BlockSong, type Fired } from "./block-session";
import { BlockVoices, type KitBuffers } from "./block-voices";

export const COMBAT_SONGS = SONGS as Record<string, BlockSong>;

export type Kit = { name: string; song: BlockSong; buffers: KitBuffers };
export type KitLoader = (name: string) => Promise<Kit | null>;

const TICK_MS = 100;

export function bankKitLoader(ctx: BaseAudioContext, options: BankOptions): KitLoader {
  return async (name) => {
    const song = COMBAT_SONGS[name];
    if (!song) throw new Error(`Unknown combat song ${name}`);
    const files = [song.file, song.guitars, song.cymbals.file];
    const loaded = await loadBank(ctx, soundsWith(files), options);
    if (loaded.failures.length > 0) throw new Error(`Combat song ${name} did not decode: ${loaded.failures.map((f) => `${f.file} ${f.kind}`).join(", ")}`);
    if (loaded.unreachable.length > 0) {
      console.warn(`Combat song ${name} could not be fetched, so this fight keeps the last song`, loaded.unreachable);
      return null;
    }
    const [main, guitars, cymbals] = files.map((f) => loaded.bank.get(f)!);
    return { name, song, buffers: { song: main, guitars, cymbals } };
  };
}

export class CombatMusic {
  private kit: Kit | null = null;
  private playing: Kit | null = null;
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
    this.loading = this.loadNext().catch(onError);
  }

  ready(): Promise<void> {
    return this.loading;
  }

  get session(): BlockSession | null {
    return this.current;
  }

  get title(): string | null {
    return (this.playing ?? this.kit)?.song.title ?? null;
  }

  get inCombat(): boolean {
    return this.current?.inCombat ?? false;
  }

  setCombat(on: boolean): void {
    if (on === this.inCombat) return;
    if (on) this.start();
    else this.stop();
  }

  fire(kind: BlockEvent, at: number): Fired | null {
    return this.current?.fire(kind, at) ?? null;
  }

  nextSong(): void {
    const names = Object.keys(COMBAT_SONGS);
    const name = names[(names.indexOf(this.kit?.name ?? names[0]) + 1) % names.length];
    this.loading = this.load(name)
      .then((kit) => {
        if (kit) this.switchTo(kit);
      })
      .catch(this.onError);
  }

  private switchTo(kit: Kit): void {
    this.kit = kit;
    const old = this.current;
    if (!old?.inCombat) return;
    const at = old.end(this.ctx.currentTime);
    const tail = old.played.at(-1)!;
    for (const v of tail.voices) v.fadeOut(at + old.beatSeconds, old.beatSeconds / 2);
    this.voices.use(kit.buffers);
    this.playing = kit;
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
    this.playing = kit;
    this.current = new BlockSession(kit.song, this.voices, this.roll);
    this.current.start(this.ctx.currentTime);
    this.timer ??= setInterval(() => this.tick(), TICK_MS);
  }

  private stop(): void {
    this.current?.end(this.ctx.currentTime);
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.loading = this.loadNext().catch(this.onError);
  }

  private async loadNext(): Promise<void> {
    const names = Object.keys(COMBAT_SONGS);
    const name = names[Math.floor(this.roll() * names.length)];
    if (this.kit?.name === name) return;
    this.kit = (await this.load(name)) ?? this.kit;
  }
}
