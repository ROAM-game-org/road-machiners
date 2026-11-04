import { readFileSync } from 'node:fs';
const p = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const self = new Map();
const total = new Map();
const skip = Number(process.argv[3] ?? 0);
const label = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber + 1}`;
let t = 0;
p.samples.forEach((id, i) => {
  t += p.timeDeltas[i];
  if (t / 1e6 < skip) return;
  const dt = p.timeDeltas[i] / 1000;
  const key = label(byId.get(id));
  self.set(key, (self.get(key) ?? 0) + dt);
  const seen = new Set();
  for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
    const k = label(byId.get(cur));
    if (seen.has(k)) continue;
    seen.add(k);
    total.set(k, (total.get(k) ?? 0) + dt);
  }
});
const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v.toFixed(0).padStart(7)} ms  ${k}`).join('\n');
console.log(`SELF\n${top(self, 30)}\n\nTOTAL\n${top(total, 50)}`);
