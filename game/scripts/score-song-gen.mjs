import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const API = 'https://api.elevenlabs.io/v1';
const MODEL = 'music_v2_5';
const OUT_DIR = 'tmp/score-song';
const BEATS_PER_BAR = 4;

if (existsSync('.env')) process.loadEnvFile('.env');
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error('ELEVENLABS_API_KEY is missing from .env');

const [planPath, takesArg] = process.argv.slice(2).filter((a) => a !== '--');
const takes = Number(takesArg);
if (!planPath || !Number.isInteger(takes) || takes <= 0) throw new Error('Usage: npm run score:song -- <plan.json> <takes>');
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const barMs = (BEATS_PER_BAR * 60000) / plan.bpm;

function chunks() {
  return plan.sections.map((s, i) => ({
    text: s.text,
    duration_ms: Math.round(s.bars * barMs),
    positive_styles: i === 0 ? [...plan.styles, ...s.styles] : ['instrumental', ...s.styles],
    negative_styles: plan.negative,
  }));
}

function prepPlan() {
  let from = 1;
  const sections = [];
  for (const s of plan.sections) {
    sections.push({ role: s.role, from, bars: s.bars });
    from += s.bars;
  }
  const end = sections.at(-1);
  return { bpm: plan.bpm, bars: from - 1, barOneAtFirstBeat: true, sections: sections.slice(0, -1), end: end.from };
}

async function credits() {
  const res = await fetch(`${API}/user/subscription`, { headers: { 'xi-api-key': key } });
  if (!res.ok) throw new Error(`ElevenLabs subscription failed: ${res.status} ${await res.text()}`);
  const s = await res.json();
  return s.character_limit - s.character_count;
}

async function compose(seed) {
  const body = { model_id: MODEL, seed, composition_plan: { chunks: chunks() } };
  const res = await fetch(`${API}/music?output_format=mp3_48000_192`, { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`ElevenLabs /music failed: ${res.status} ${await res.text()}`);
  const ids = [...res.headers].filter(([name]) => name.includes('song') || name.includes('id')).map(([name, value]) => `${name}=${value}`);
  return { audio: Buffer.from(await res.arrayBuffer()), ids };
}

const name = path.basename(planPath, '.json');
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/${name}-prep.json`, JSON.stringify(prepPlan(), null, 1));
const before = await credits();
console.log(`${name}: ${takes} takes of ${(plan.sections.reduce((n, s) => n + s.bars, 0) * barMs / 1000).toFixed(1)} s, ${before} credits left`);
for (let i = 0; i < takes; i++) {
  const seed = Date.now() % 1_000_000;
  const { audio, ids } = await compose(seed);
  const out = `${OUT_DIR}/${name}-${seed}.mp3`;
  writeFileSync(out, audio);
  console.log(`wrote ${out}, seed ${seed}, headers ${ids.join(' ')}`);
}
console.log(`spent ${before - (await credits())} credits`);
