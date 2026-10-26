import { errorText, SimRun, simWorld, type FromSim, type ToSim } from '../sim/progression/sim-mode';
import { SIM_TEXT } from '../ui/sim/sim-text';
import { fetchMap } from './map-file';

let run: SimRun | null = null;
const post = (message: FromSim) => self.postMessage(message);

self.onmessage = (event: MessageEvent<ToSim>) => {
  const message = event.data;
  if (run) return run.handle(message);
  if (message.kind !== 'start') throw new Error(`The sim got ${message.kind} before start`);
  void begin(message.seed);
};

async function begin(seed: number): Promise<void> {
  try {
    run = new SimRun(simWorld(await fetchMap(), seed), seed, SIM_TEXT, post);
  } catch (error) {
    post({ kind: 'failed', turn: 0, message: errorText(error) });
  }
}
