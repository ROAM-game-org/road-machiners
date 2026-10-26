import { TIME } from '../data/time';
import { setThinning } from '../sim/fidelity';
import type { Ledger } from '../sim/progression/orders';
import { errorText, SimRun, simWorld, type FromSim, type ToSim } from '../sim/progression/sim-mode';
import type { BakedMap } from '../sim/terrain';
import type { World } from '../sim/types';
import { SIM_TEXT } from '../ui/sim/sim-text';
import { fetchMap } from './map-file';
import { idbBackend, SaveSlots } from './save-db';
import { resumedRun, SIM_SAVES, SIM_SLOT, simEnvelope } from './sim-save';

const SAVE_EVERY = Math.round(TIME.turnsPerDay / 24);
const RANDOM_SEEDS = 1_000_000;

let run: SimRun | null = null;
let slots: SaveSlots | null = null;

const post = (message: FromSim) => self.postMessage(message);

self.onmessage = (event: MessageEvent<ToSim>) => {
  const message = event.data;
  if (run) return handle(run, message);
  if (message.kind !== 'start') throw new Error(`The sim got ${message.kind} before start`);
  void begin(message.seed);
};

function handle(current: SimRun, message: ToSim): void {
  if (message.kind === 'save') return save(current);
  if (message.kind === 'download') return download(current);
  current.handle(message);
  if (message.kind === 'pause') save(current);
}

function postAndSave(message: FromSim): void {
  post(message);
  if (run && message.kind === 'frame' && message.frame.turn % SAVE_EVERY === 0) save(run);
}

async function begin(seed: number | null): Promise<void> {
  try {
    setThinning(true);
    const map = await fetchMap();
    slots = await openSimSaves();
    const { world, ledger } = runStart(slots, map, seed);
    post({ kind: 'started', seed: world.seed, turn: world.turn, resumed: ledger !== undefined });
    run = new SimRun(world, SIM_TEXT, postAndSave, ledger);
  } catch (error) {
    post({ kind: 'failed', turn: 0, message: errorText(error) });
  }
}

function runStart(saves: SaveSlots, map: BakedMap, seed: number | null): { world: World; ledger?: Ledger } {
  const resumed = seed === null ? resumedRun(saves, map) : null;
  return resumed ?? { world: simWorld(map, seed ?? randomSeed()) };
}

async function openSimSaves(): Promise<SaveSlots> {
  const saves = await SaveSlots.open(await idbBackend(SIM_SAVES), null, SIM_SAVES, [SIM_SLOT]);
  saves.onError = (error) => post({ kind: 'failed', turn: 0, message: `The sim could not save: ${errorText(error)}` });
  return saves;
}

function randomSeed(): number {
  return Math.floor(Math.random() * RANDOM_SEEDS);
}

function save(current: SimRun): void {
  const { world, ledger } = current.current();
  if (!slots || world.player.state === 'dead') return;
  try {
    slots.put(SIM_SLOT, simEnvelope(world, ledger, Date.now()));
    post({ kind: 'saved', turn: world.turn });
  } catch (error) {
    post({ kind: 'failed', turn: world.turn, message: `The sim could not save: ${errorText(error)}` });
  }
}

function download(current: SimRun): void {
  const { world, ledger } = current.current();
  const json = JSON.stringify(simEnvelope(world, ledger, Date.now()));
  post({ kind: 'saveFile', name: `roam-sim-seed-${world.seed}-turn-${world.turn}.json`, json });
}
