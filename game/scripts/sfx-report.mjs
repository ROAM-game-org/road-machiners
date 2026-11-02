import { MIX, SOUNDS } from '../src/data/sounds.ts';
import { bandBalance, isField, measure, presenceOf, SFX_DIR } from './sfx-lib.mjs';

const SLACK_DB = 1;
const anchor = SOUNDS[MIX.anchors.sfx].files[0];
const row = (file) => {
  const path = `${SFX_DIR}/${file}`;
  const { low, high } = bandBalance(path, 'anull');
  const presence = presenceOf(path, 'anull');
  const loudness = measure(path, 'anull').loudness;
  const out = [['low', low], ['presence', presence], ['high', high]].filter(([band, db]) => Math.abs(db - MIX.tone[band]) > MIX.tone.spread + SLACK_DB).map(([band]) => band);
  const cells = [loudness, low, presence, high].map((n) => n.toFixed(1).padStart(9)).join('');
  return `${file.padEnd(26)}${cells}  ${out.length ? `outside on ${out.join(' and ')}` : ''}`;
};
const isSfxLoop = (cue) => cue.bus === 'sfx' && cue.loop;

console.log(`target: low ${MIX.tone.low} dB, presence ${MIX.tone.presence} dB, high ${MIX.tone.high} dB, spread ${MIX.tone.spread} dB; sfx level ${MIX.level.sfx} LUFS`);
console.log('low is below 250 Hz, presence 1 to 4 kHz, high above 4 kHz, each in dB against the 250 Hz to 4 kHz mids');
console.log(`${'file'.padEnd(26)}     LUFS      low presence     high`);
console.log(`${row(anchor)}  anchor`);
for (const cue of Object.values(SOUNDS).filter(isField)) for (const f of cue.files) if (f !== anchor) console.log(row(f));
console.log('loops');
for (const cue of Object.values(SOUNDS).filter(isSfxLoop)) for (const f of cue.files) console.log(row(f));
