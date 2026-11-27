import { mkdirSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { chromium } from 'playwright';
import { launchChromium } from './gpu.mjs';
import { playUrl } from './game-url.mjs';
import { startNewGame, waitForGame } from './night-ground.mjs';

const USAGE = 'Usage: npm run stream:cost -- (--at <site id | x,y> | --all) [--radius 160] [--map icarus|chaos] [--limit <ms>] [--out <file>] [--url http://localhost:5173]';
const BOOT_LIMIT_MS = 600000;
const STEP_LINES = [4, 8, 16];
const CHAOS_FORTS = 2;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function options() {
  const all = process.argv.includes('--all');
  const at = arg('at');
  if (all === Boolean(at)) throw new Error(USAGE);
  const map = arg('map', 'icarus');
  if (map !== 'icarus' && map !== 'chaos') throw new Error(`Unknown map ${map}. ${USAGE}`);
  const limit = arg('limit');
  return { all, at, map, radius: Number(arg('radius', '160')), limit: limit === undefined ? null : Number(limit), out: arg('out'), url: arg('url', 'http://localhost:5173') };
}

async function openGame(url, map) {
  const run = await launchChromium(chromium, { headless: true, args: ['--mute-audio'] });
  if (run.software) {
    await run.browser.close();
    throw new Error('stream:cost times builds on the GPU; Chromium fell back to software here');
  }
  const page = await run.browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
  await page.goto(playUrl(url));
  await waitForGame(page, BOOT_LIMIT_MS);
  if (map === 'chaos') await startNewGame(page, 'chaosHighway', BOOT_LIMIT_MS);
  return { browser: run.browser, page, errors };
}

function placesOf(page, { all, at, map }) {
  return page.evaluate(
    async ({ all, at, map, chaosForts }) => {
      const world = window.__ROAM__.state;
      const { atlasOf } = await import('/src/sim/atlas.ts');
      const { HOLLOW } = await import('/src/data/sunward.ts');
      const atlas = atlasOf(world.terrain);
      const sites = [...atlas.towns, ...atlas.locations.filter((l) => l.kind !== 'territory')].map((s) => ({ name: s.id, x: s.pos.x, y: s.pos.y, site: s.id }));
      if (!all) {
        const site = sites.find((s) => s.name === at);
        if (site) return [site];
        const [x, y] = at.split(',').map(Number);
        if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`No site ${at} on this map, and it is no x,y point`);
        return [{ name: at, x, y, site: null }];
      }
      if (map === 'chaos') return sites.slice(0, chaosForts);
      const decks = atlas.decks.decks.map((d) => ({ name: d.id, x: d.from.x + (d.axis.x * d.length) / 2, y: d.from.y + (d.axis.y * d.length) / 2, site: null }));
      return [...sites, { name: 'hollow', x: HOLLOW.site.pos.x, y: HOLLOW.site.pos.y, site: null }, ...decks];
    },
    { all, at, map, chaosForts: CHAOS_FORTS },
  );
}

function drainNear(page, place, radius) {
  return page.evaluate(
    async ({ place, radius }) => {
      const { wantedCells } = await import('/src/three/render/streamer.ts');
      const streamer = window.__ROAM__.streamer;
      const steps = [];
      const prepares = [];
      const kindOf = (obj) => obj.userData.streamKind ?? `untagged:${obj.name || obj.type}`;
      const timedStep = (scope, cell) => {
        const start = performance.now();
        const step = scope.buildNext(cell);
        return { step, ms: performance.now() - start };
      };
      const drainScope = (scope, cell) => {
        let run = [];
        let built = false;
        for (let next = timedStep(scope, cell); next.step !== null; next = timedStep(scope, cell)) {
          run.push(next.ms);
          if (next.step === 'stepped') continue;
          built = true;
          const kind = kindOf(scope.groupOf(cell).children.at(-1));
          steps.push(...run.map((ms) => ({ kind, ms })));
          run = [];
        }
        return built;
      };
      const prepareCell = (scope, cell) => {
        const start = performance.now();
        streamer.prepare(scope.groupOf(cell));
        prepares.push(performance.now() - start);
      };
      for (const cell of wantedCells(streamer.scopes, place, radius))
        for (const scope of streamer.scopes) if (drainScope(scope, cell)) prepareCell(scope, cell);
      return { steps, prepares };
    },
    { place, radius },
  );
}

function siteLooks(page, siteIds) {
  return page.evaluate(
    async ({ siteIds }) => {
      const world = window.__ROAM__.state;
      const { atlasOf } = await import('/src/sim/atlas.ts');
      const { siteLook } = await import('/src/sim/sites.ts');
      const { siteSteps } = await import('/src/three/render/sites.ts');
      const atlas = atlasOf(world.terrain);
      const sites = [...atlas.towns, ...atlas.locations].filter((s) => siteIds.includes(s.id));
      return sites.map((site) => {
        const run = siteSteps(world.terrain, site);
        const ms = [];
        for (;;) {
          const start = performance.now();
          const step = run.next();
          ms.push(performance.now() - start);
          if (step.done) break;
        }
        return { site: site.id, look: siteLook(site), ms };
      });
    },
    { siteIds },
  );
}

function summary(ms) {
  const sorted = [...ms].sort((a, b) => a - b);
  const over = Object.fromEntries(STEP_LINES.map((line) => [`over${line}`, sorted.filter((m) => m > line).length]));
  return { steps: sorted.length, totalMs: round(sorted.reduce((a, b) => a + b, 0)), maxMs: round(sorted.at(-1) ?? 0), ...over };
}

function round(ms) {
  return Math.round(ms * 10) / 10;
}

function groupBy(rows, keyOf) {
  const groups = new Map();
  for (const row of rows) groups.set(keyOf(row), [...(groups.get(keyOf(row)) ?? []), row.ms]);
  return Object.fromEntries([...groups].map(([key, ms]) => [key, summary(ms)]).sort((a, b) => b[1].maxMs - a[1].maxMs));
}

function printTable(title, table) {
  console.log(`\n${title}`);
  for (const [key, s] of Object.entries(table)) console.log(`  ${key.padEnd(28)} steps ${String(s.steps).padStart(5)}  max ${String(s.maxMs).padStart(7)} ms  >4 ${s.over4}  >8 ${s.over8}  >16 ${s.over16}`);
}

const opts = options();
const loadBefore = loadavg();
const { browser, page, errors } = await openGame(opts.url, opts.map);
const places = await placesOf(page, opts);
const streamed = [];
const prepares = [];
const perPlace = {};
for (const place of places) {
  const { steps, prepares: prepared } = await drainNear(page, place, opts.radius);
  streamed.push(...steps);
  prepares.push(...prepared.map((ms) => ({ kind: 'prepare', ms })));
  perPlace[place.name] = summary(steps.map((s) => s.ms));
  console.log(`${place.name}: ${steps.length} steps, max ${perPlace[place.name].maxMs} ms`);
}
const looks = await siteLooks(page, places.filter((p) => p.site).map((p) => p.site));
await browser.close();
const lookSteps = looks.flatMap((l) => l.ms.map((ms) => ({ look: l.look, site: l.site, ms })));
const report = {
  map: opts.map,
  radius: opts.radius,
  load: { before: loadBefore.map(round), after: loadavg().map(round) },
  kinds: groupBy([...streamed, ...prepares], (s) => s.kind),
  looks: groupBy(lookSteps, (s) => s.look),
  sites: groupBy(lookSteps, (s) => s.site),
  places: perPlace,
};
printTable('Largest step per placement kind (streamed)', report.kinds);
printTable('Largest step per site look (one fresh build per site)', report.looks);
console.log(`\nload average before ${report.load.before.join(' ')}, after ${report.load.after.join(' ')}`);
const out = opts.out ?? `tmp/stream-cost/${opts.map}-${opts.all ? 'all' : opts.at}-${Date.now()}.json`;
mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`wrote ${out}`);
if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);
const worst = Math.max(...[...streamed, ...lookSteps].map((s) => s.ms));
if (opts.limit !== null && worst > opts.limit) {
  console.error(`A step took ${round(worst)} ms, over the ${opts.limit} ms limit`);
  process.exit(1);
}
