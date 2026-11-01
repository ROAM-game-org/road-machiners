import { CONFIG, ERROR_REPORT_BUILD, GAME_VERSION } from '../config';
import type { DriveSnapshot } from '../phys/drive';
import type { World } from '../sim/types';
import { saveOf } from './save';
import type { SaveSlots } from './save-db';
import { listSaves } from './save-slots';
import { noteError } from './crash';
import { TurnFailure } from './travel';
import { uiSize } from '../ui/ui-size';

export type ReportContext = {
  build: string;
  version: string;
  userAgent: string;
  language: string;
  screen: { width: number; height: number; pixelRatio: number; uiSize: number };
  turn: number | null;
  log: string[];
  world: object | null;
  autosave: string | null;
  autosaveIsWorld: boolean;
};

export type ErrorReport = ReportContext & {
  error: { name: string; message: string; stack: string };
  drive: (Omit<DriveSnapshot, 'snapshot'> & { snapshot: string }) | null;
};

export type ReportSource = { world: () => World; log: () => string[] };

type Post = (url: string, init: RequestInit) => Promise<Response>;

type LiveGame = Pick<ReportContext, 'turn' | 'log' | 'world'> & { worldTurn: number | null };

const NO_GAME: LiveGame = { turn: null, log: [], world: null, worldTurn: null };

export class GameContext {
  private source: ReportSource | null = null;
  private slots: SaveSlots | null = null;

  constructor(
    private readonly build: string,
    private readonly version: string,
    private readonly onCaptureFailure: (err: unknown) => void,
  ) {}

  watchSaves(slots: SaveSlots): void {
    this.slots = slots;
  }

  watch(source: ReportSource): void {
    this.source = source;
  }

  capture(): ReportContext {
    const { worldTurn, ...game } = this.liveGame();
    const autosave = this.autosaveOf();
    const autosaveIsWorld = autosave !== null && worldTurn !== null && autosaveTurn(this.slots) === worldTurn;
    return { ...this.head(), ...game, autosave: autosaveIsWorld ? null : autosave, autosaveIsWorld };
  }

  private head() {
    return {
      build: this.build,
      version: this.version,
      userAgent: navigator.userAgent,
      language: document.documentElement.lang,
      screen: { width: window.innerWidth, height: window.innerHeight, pixelRatio: window.devicePixelRatio, uiSize: uiSize().applied() },
    };
  }

  private autosaveOf(): string | null {
    return this.slots?.has('auto') ? JSON.stringify(this.slots.get('auto')) : null;
  }

  private liveGame(): LiveGame {
    if (!this.source) return NO_GAME;
    try {
      const world = this.source.world();
      return { turn: world.turn, log: this.source.log(), world: saveOf(world), worldTurn: world.turn };
    } catch (err) {
      this.onCaptureFailure(err);
      return NO_GAME;
    }
  }
}

export const gameContext = new GameContext(ERROR_REPORT_BUILD, GAME_VERSION, noteError);

function autosaveTurn(slots: SaveSlots | null): number | null {
  if (!slots) return null;
  const info = listSaves(slots, CONFIG.saveSlots).find((slot) => slot.slot === 'auto');
  return info ? info.turn : null;
}

export class ErrorReporter {
  private readonly sent = new Set<string>();

  constructor(
    private readonly url: string,
    private readonly context: GameContext,
    private readonly post: Post = (url, init) => fetch(url, init),
  ) {}

  report(err: unknown): Promise<void> {
    const error = describeError(err);
    const key = `${error.name}: ${error.message}`;
    if (this.sent.has(key)) return Promise.resolve();
    this.sent.add(key);
    return this.send(err, error).catch((failure: unknown) => console.warn('Error report not sent:', failure));
  }

  private async send(err: unknown, error: ErrorReport['error']): Promise<void> {
    const report: ErrorReport = { ...this.context.capture(), error, drive: driveOf(err) };
    const body = await gzip(JSON.stringify(report));
    const response = await this.post(this.url, { method: 'POST', headers: { 'content-type': 'application/gzip' }, body });
    if (!response.ok) throw new Error(`the error endpoint answered ${response.status}`);
  }
}

function driveOf(err: unknown): ErrorReport['drive'] {
  return err instanceof TurnFailure ? encodeDrive(err.drive) : null;
}

function describeError(err: unknown): ErrorReport['error'] {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack ?? '' };
  return { name: 'NonError', message: String(err), stack: '' };
}

function encodeDrive(drive: DriveSnapshot): NonNullable<ErrorReport['drive']> {
  const { snapshot, ...handles } = drive;
  return { ...handles, snapshot: toBase64(snapshot) };
}

const BASE64_SLICE = 0x8000;

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += BASE64_SLICE) text += String.fromCharCode(...bytes.subarray(i, i + BASE64_SLICE));
  return btoa(text);
}

export async function gzip(text: string): Promise<Blob> {
  return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
}
