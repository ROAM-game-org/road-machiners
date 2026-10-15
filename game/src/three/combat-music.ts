import SONGS from "../data/combat-songs.json";
import { soundsWith } from "../data/sounds";
import { loadBank, type BankOptions } from "../audio/bank";
import { BlockSession, type BlockEvent, type BlockSong, type Fired } from "./block-session";
import { BlockVoices, type KitBuffers } from "./block-voices";

export const COMBAT_SONGS = SONGS as Record<string, BlockSong>;

export type Kit = { name: string; song: BlockSong; buffers: KitBuffers };
export type KitLoader = (name: string) => Promise<Kit>;

const TICK_MS = 100;

export function bankKitLoader(ctx: BaseAudioContext, options: BankOptions): KitLoader {
  return async (name) => {
    const song = COMBAT_SONGS[name];
    if (!song) throw new Error(`Unknown combat song ${name}`);
    const files = [song.file, song.guitars, song.cymbals.file];
    const loaded = await loadBank(ctx, soundsWith(files), options);
    const failed = [...loaded.failures, ...loaded.unreachable];
    if (failed.length > 0) throw new Error(`Combat song ${name} did not load: ${failed.map((f) => `${f.file} ${f.kind}`).join(", ")}`);
    const [main, guitars, cymbals] = files.map((f) => loaded.bank.get(f)!);
    return { name, song, buffers: { song: main, guitars, cymbals } };
  };
}

export class CombatMusic {
  private kit: Kit | null = null;
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
    this.loading = this.loadNext();
  }

  ready(): Promise<void> {
    return this.loading;
  }

  get session(): BlockSession | null {
    return this.current;
  }

  get title(): string | null {
    return this.kit?.song.title ?? null;
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

  tick(): void {
    this.current?.tick(this.ctx.currentTime);
  }

  private start(): void {
    const kit = this.kit;
    if (!kit) throw new Error("Combat started before any combat song loaded");
    this.voices.use(kit.buffers);
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
    const kit = await this.load(name);
    this.kit = kit;
  }
}
