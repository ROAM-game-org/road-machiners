import { createReadStream, readdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { JobTally } from '../src/sim/progression/job-checks.ts';
import { HUNT } from '../src/data/npc-behavior.ts';
import { moneyText } from '../src/ui/units.ts';
import { ECONOMY } from '../src/data/goods.ts';
import { TIME } from '../src/data/time.ts';

const LOSS_SHARE = 0.1;
const LOSS_TURNS = 30;
const CONTEXT_TURNS = 5;
const STALL_TILES = 5;
const STALL_TURNS = 60;

const FLAP_COUNT = 6;
const FLAP_TURNS = 40;
const FLAP_KINDS = new Set(['towDropped', 'towOffer', 'towHitched', 'stateEnded', 'hostile']);

const HUNT_ROAD_TARGET = 0.25;
const HUNT_GOALS = new Set(HUNT.offRoadGoals);
const GANGS = new Set(['scrapjaw', 'kiln']);

const BROKE_BELOW = Math.min(ECONOMY.supplyPrice.fuel, ECONOMY.supplyPrice.supplies);
const SOLVENCY_DAYS = 5;

const argv = process.argv.slice(2).filter((a) => a !== '--');
const dir = argv[0];
if (!dir) throw new Error('Usage: npm run progression:analyze -- <dir> [--run trader-1]');
const runAt = argv.indexOf('--run');
const wanted = runAt < 0 ? null : `${argv[runAt + 1]}.turns.jsonl`;
const files = readdirSync(dir).filter((f) => f.endsWith('.turns.jsonl') && (wanted === null || f === wanted)).sort();
if (files.length === 0) throw new Error(`No turn logs in ${dir}`);
for (const file of files) {
  const name = file.replace('.turns.jsonl', '');
  analyze(name, await readLines(`${dir}/${file}`));
  await analyzeWorld(name, `${dir}/${name}.world.jsonl`);
}

async function readLines(path) {
  const lines = [];
  for await (const text of createInterface({ input: createReadStream(path) })) if (text) lines.push(JSON.parse(text));
  return lines;
}

function analyze(name, turns) {
  const last = turns[turns.length - 1];
  console.log(`\n=== ${name}: turns ${turns[0].t}-${last.t}, net worth ${moneyText(turns[0].nw)} -> ${moneyText(last.nw)}, money ${moneyText(last.money)}, ${last.chassis}`);
  printTime(turns);
  printJob(name.slice(0, name.lastIndexOf('-')), turns);
  printFights(turns);
  printLosses(turns);
  printTows(turns);
  printStalls(turns);
  printEpisodes('debt', turns, (l) => l.money < 0);
  printEpisodes('dry tank', turns, (l) => l.fuel <= 0);
}

function printTime(turns) {
  const share = (test) => `${Math.round((100 * turns.filter(test).length) / turns.length)}%`;
  const flags = ['combat', 'stranded', 'towed', 'beacon'].map((f) => `${f} ${share((l) => l.flags.includes(f))}`);
  console.log(`time: ${flags.join(', ')}, job ${share((l) => l.job !== null)}, no order ${share((l) => l.order === null)}`);
}

function printJob(archetype, turns) {
  const tally = new JobTally();
  for (const line of turns) {
    tally.note(line);
    const failure = tally.failure(archetype);
    if (failure) return console.log(`job: FAIL turn ${line.t}: ${failure}`);
  }
  console.log('job: ok');
}

function episodes(turns, test) {
  const found = [];
  let from = 0;
  while (from < turns.length) {
    if (!test(turns[from])) {
      from++;
      continue;
    }
    let to = from;
    while (to + 1 < turns.length && test(turns[to + 1])) to++;
    found.push({ from, to });
    from = to + 1;
  }
  return found;
}

function printEpisodes(label, turns, test) {
  const found = episodes(turns, test);
  if (found.length === 0) return;
  const list = found.map((e) => `${turns[e.from].t}-${turns[e.to].t}`).join(' ');
  console.log(`${label}: ${found.length} stretches, ${found.reduce((n, e) => n + e.to - e.from + 1, 0)} turns: ${list}`);
}

function printFights(turns) {
  const stretches = episodes(turns, (l) => l.flags.includes('combat'));
  const hasShot = (e) => turns.slice(e.from, e.to + 1).some((l) => l.ev.some((x) => x.startsWith('shot ')));
  printStandoffs(turns, stretches.filter((e) => !hasShot(e)));
  for (const e of stretches.filter(hasShot)) {
    const span = turns.slice(Math.max(0, e.from - CONTEXT_TURNS), e.to + 1);
    const fight = turns.slice(e.from, e.to + 1);
    const before = turns[Math.max(0, e.from - 1)];
    const after = turns[Math.min(turns.length - 1, e.to + 1)];
    const firstShot = span.flatMap((l) => l.ev.filter((x) => x.startsWith('shot ')).map((x) => `${l.t} ${x}`))[0] ?? 'none';
    const foes = firstSeen(fight);
    const still = fight.filter((l, i) => i > 0 && l.pos[0] === fight[i - 1].pos[0] && l.pos[1] === fight[i - 1].pos[1]).length;
    console.log(`fight ${turns[e.from].t}-${turns[e.to].t}: me speed ${before.speed}, foes ${[...foes.values()].map((f) => `${f.who} win ${f.odds}% s${f.speed}`).join(', ') || 'unseen'}`);
    console.log(`  first shot ${firstShot}; still ${still} turns; nw ${moneyText(before.nw)} -> ${moneyText(after.nw)}; ${outcome(fight, before, after)}`);
  }
}

function printStandoffs(turns, standoffs) {
  if (standoffs.length === 0) return;
  const list = standoffs.map((e) => `${turns[e.from].t}-${turns[e.to].t}`).join(' ');
  console.log(`standoffs, combat with no shots: ${standoffs.length} stretches, ${standoffs.reduce((n, e) => n + e.to - e.from + 1, 0)} turns: ${list}`);
}

function firstSeen(fight) {
  const foes = new Map();
  for (const f of fight.flatMap((l) => l.foes)) if (!foes.has(f.id)) foes.set(f.id, f);
  return foes;
}

function outcome(fight, before, after) {
  const notes = fight.flatMap((l) => l.ev.filter((x) => /^(knockout|npcKnockout|say|plea|surrender|death)/.test(x)).map((x) => `${l.t} ${x.slice(0, 90)}`));
  const lost = before.parts.filter((p) => !after.parts.some((q) => q.split(':')[0] === p.split(':')[0])).map((p) => p.split(':')[0]);
  const cargo = `cargo ${count(before.goods)} -> ${count(after.goods)}`;
  return [cargo, lost.length ? `parts gone ${lost.join(' ')}` : '', ...notes].filter(Boolean).join('; ');
}

function count(goods) {
  return Object.values(goods).reduce((a, b) => a + b, 0);
}

function printLosses(turns) {
  let i = 0;
  while (i < turns.length) {
    const j = lossEnd(turns, i);
    if (j === null) {
      i++;
      continue;
    }
    console.log(`loss ${turns[i].t}-${turns[j].t}: nw ${moneyText(turns[i].nw)} -> ${moneyText(turns[j].nw)}, money ${moneyText(turns[i].money)} -> ${moneyText(turns[j].money)}, at ${turns[j].pos.join(',')}`);
    for (const l of turns.slice(Math.max(0, j - CONTEXT_TURNS), j + 1)) for (const x of l.ev) console.log(`  ${l.t} ${x.slice(0, 160)}`);
    i = j + 1;
  }
}

function lossEnd(turns, i) {
  for (let j = i + 1; j < Math.min(turns.length, i + LOSS_TURNS); j++) if (turns[i].nw - turns[j].nw > turns[i].nw * LOSS_SHARE) return j;
  return null;
}

function printTows(turns) {
  const tows = episodes(turns, (l) => l.flags.includes('towed'));
  if (tows.length === 0) return;
  console.log(`tows: ${tows.length}`);
  for (const e of tows) {
    const end = turns[Math.min(turns.length - 1, e.to + 1)];
    const fee = end.ev.find((x) => x.startsWith('towDone')) ?? 'no towDone';
    console.log(`  ${turns[e.from].t}-${end.t}: ${turns[e.from].pos.join(',')} -> ${end.pos.join(',')}, ${fee.slice(0, 60)}, money ${moneyText(end.money)}, fuel ${end.fuel}, parts ${end.parts.filter((p) => p.endsWith(':0')).join(' ') || 'sound'}`);
  }
}

function printStalls(turns) {
  const stalls = [];
  for (let i = 0; i + STALL_TURNS < turns.length; i += STALL_TURNS) {
    const window = turns.slice(i, i + STALL_TURNS);
    const [x, y] = window[0].pos;
    const moved = Math.max(...window.map((l) => Math.hypot(l.pos[0] - x, l.pos[1] - y)));
    const busy = window.every((l) => l.job !== null || l.flags.includes('towed') || l.state !== 'active');
    if (moved < STALL_TILES && !busy) stalls.push(`${window[0].t} at ${x},${y} order ${window[0].order} flags ${window[0].flags.join('+')}`);
  }
  if (stalls.length > 0) console.log(`still ${STALL_TURNS}+ turns: ${stalls.join('; ')}`);
}

async function worldLog(path) {
  const lines = [];
  for await (const text of createInterface({ input: createReadStream(path) })) if (text) lines.push(JSON.parse(text));
  return lines;
}

async function analyzeWorld(name, path) {
  const lines = await worldLog(path);
  const events = lines.flatMap((line) => (line.events ?? []).map((e) => ({ e, turn: line.t })));
  console.log(`--- ${name} world: ${eventTotals(events)}`);
  const flaps = flapping(events);
  if (flaps.length > 0) console.log(`flapping: ${flaps.slice(0, 12).join('; ')}`);
  printPopulation(lines);
  printOffRoad(lines);
  printRouteStyles(lines);
  printAmbushes(lines);
  printNpcDeaths(lines);
  printSolvency(lines);
}

function eventTotals(events) {
  const totals = new Map();
  for (const { e } of events) totals.set(e.t, (totals.get(e.t) ?? 0) + 1);
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).slice(0, 14).join(', ');
}

function actorOf(e) {
  return e.vehicle ?? e.by ?? e.shooter ?? e.state?.holder;
}

function flapping(events) {
  const seen = new Map();
  const flaps = new Set();
  for (const { e, turn } of events.filter(({ e }) => FLAP_KINDS.has(e.t) && actorOf(e))) {
    const key = `${e.t}:${actorOf(e)}`;
    const recent = [...(seen.get(key) ?? []).filter((t) => turn - t <= FLAP_TURNS), turn];
    seen.set(key, recent);
    if (recent.length > FLAP_COUNT) flaps.add(`${key} x${recent.length} by turn ${turn}`);
  }
  return [...flaps];
}

function printPopulation(lines) {
  const snaps = lines.filter((l) => l.trucks);
  if (snaps.length === 0) return;
  for (const snap of [snaps[0], snaps[Math.floor(snaps.length / 2)], snaps[snaps.length - 1]]) {
    const by = new Map();
    for (const v of snap.trucks) by.set(v.faction, [...(by.get(v.faction) ?? []), v]);
    const text = [...by.entries()].map(([f, vs]) => `${f} ${vs.length} (${moneyText(vs.reduce((s, v) => s + v.money, 0) / vs.length)}, hp ${Math.round(vs.reduce((s, v) => s + v.hp, 0) / vs.length)})`).join(', ');
    console.log(`turn ${snap.t}: ${text}`);
  }
}

function printOffRoad(lines) {
  const moving = lines.flatMap((l) => l.trucks ?? []).filter((v) => GANGS.has(v.faction) && v.speed > 0);
  if (moving.length === 0) return;
  const share = (vs) => `${vs.filter((v) => v.onRoad).length}/${vs.length} on road`;
  const by = Map.groupBy(moving.filter((v) => v.style === 'hidden'), offRoadReason);
  const off = [...by.entries()].map(([why, vs]) => `${why} ${share(vs)}`).join(', ') || 'none';
  console.log(`raiders keeping off roads: ${off}; healthy raiders ${share(moving.filter((v) => v.style !== 'hidden'))}`);
  const hunting = by.get('hunting') ?? [];
  const onRoad = hunting.filter((v) => v.onRoad).length;
  if (hunting.length > 0) {
    const within = (tiles) => hunting.filter((v) => v.roadGap <= tiles).length;
    console.log(`hunting raiders within 6 tiles of a road ${within(6)}/${hunting.length}, within 10 tiles ${within(10)}/${hunting.length}`);
  }
  if (hunting.length > 0 && onRoad / hunting.length > HUNT_ROAD_TARGET) console.log(`MISS: hunting raiders on road above ${100 * HUNT_ROAD_TARGET}%`);
}

function printRouteStyles(lines) {
  const moving = lines.flatMap((l) => l.trucks ?? []).filter((v) => v.speed > 0 && v.who !== 'player');
  if (moving.length === 0) return;
  const text = (vs) => `${vs.filter((v) => v.onRoad).length}/${vs.length} on road, mean road gap ${(vs.reduce((s, v) => s + v.roadGap, 0) / vs.length).toFixed(1)}`;
  const byWho = Map.groupBy(moving, (v) => v.who);
  console.log(`route styles: ${[...byWho.entries()].map(([who, vs]) => `${who} ${text(vs)}`).join('; ')}`);
  const byStyle = Map.groupBy(moving, (v) => v.style);
  console.log(`by style: ${[...byStyle.entries()].map(([style, vs]) => `${style} ${text(vs)}`).join('; ')}`);
}

function printAmbushes(lines) {
  const events = lines.flatMap((l) => l.events ?? []);
  const passes = Map.groupBy(events.filter((e) => e.t === 'preyPassed'), (e) => e.reason);
  const passText = [...passes.entries()].map(([reason, es]) => `${reason} ${es.length}`).join(', ') || 'none';
  const trucks = new Map(lines.flatMap((l) => l.trucks ?? []).map((v) => [v.id, v]));
  const hunting = new Set(['raid', 'patrol', 'investigate']);
  const started = events.filter((e) => e.t === 'activity' && e.activity === 'fight' && GANGS.has(trucks.get(e.vehicle)?.faction) && hunting.has(e.previous));
  const byPrevious = Map.groupBy(started, (e) => e.previous);
  const fightText = [...byPrevious.entries()].map(([previous, es]) => `${previous} ${es.length}`).join(', ') || 'none';
  console.log(`raider passes on visible prey: ${passText}; raider fights begun from a hunt: ${fightText}`);
}

function offRoadReason(v) {
  const top = v.goals.at(-1)?.split(':')[0];
  if (top === 'retreat' || top === 'flee') return top;
  return HUNT_GOALS.has(top) ? 'hunting' : 'stranded';
}

function printNpcDeaths(lines) {
  const lost = lines.flatMap((l) => (l.events ?? []).filter((e) => e.t === 'destroyed' || e.t === 'npcKnockout').map((e) => `${l.t} ${e.t} ${e.vehicle}${e.by ? ` by ${e.by}` : ''}`));
  if (lost.length > 0) console.log(`lost trucks: ${lost.length}: ${lost.slice(0, 20).join('; ')}`);
}

function printSolvency(lines) {
  const snaps = lines.filter((l) => l.trucks);
  if (snaps.length === 0) return;
  const roles = new Map(snaps.flatMap((l) => l.trucks).map((v) => [v.id, v.who]));
  console.log('solvency by role (broke/starving/stranded at each day end; flows in money per NPC-day over days 1-5, start cash apart):');
  for (const role of [...new Set(roles.values())].filter((r) => r !== 'player').sort()) printRoleSolvency(role, lines, snaps, roles);
  console.log(`  all NPCs: ${dayEndSnaps(snaps).map((snap) => `t${snap.t} ${solvencyCounts(snap.trucks.filter((v) => v.who !== 'player'))}`).join(', ')}`);
  const starved = new Set(snaps.flatMap((snap) => snap.trucks.filter((v) => v.who !== 'player' && v.sup <= 0).map((v) => v.id)));
  console.log(`  starving at any snapshot: ${starved.size} trucks${starved.size > 0 ? ` (${[...starved].map((id) => `${id}:${roles.get(id)}`).join(', ')})` : ''}`);
  printDeals(lines.flatMap((l) => l.events ?? []));
}

function printDeals(events) {
  const lieUps = events.filter((e) => e.t === 'activity' && e.activity === 'rearm').length;
  const hires = events.filter((e) => e.t === 'escortHired');
  const paid = events.filter((e) => e.t === 'escortPaid' && e.fee > 0);
  const guards = events.filter((e) => e.t === 'guardPaid');
  const mean = (es, pick) => (es.length > 0 ? moneyText(es.reduce((sum, e) => sum + pick(e), 0) / es.length) : 'none');
  console.log(`  lie-ups ${lieUps}; escort hires ${hires.length} at a mean fee of ${mean(hires, (e) => e.fee)}, ${paid.length} paid; guard pays ${guards.length} at a mean of ${mean(guards, (e) => e.fee)}`);
}

function solvencyCounts(trucks) {
  const broke = trucks.filter((v) => v.money < BROKE_BELOW).length;
  const starving = trucks.filter((v) => v.sup <= 0).length;
  const stranded = trucks.filter((v) => v.stranded).length;
  return `${broke}/${starving}/${stranded} of ${trucks.length}`;
}

function printRoleSolvency(role, lines, snaps, roles) {
  const counts = dayEndSnaps(snaps).map((snap) => {
    return `t${snap.t} ${solvencyCounts(snap.trucks.filter((v) => v.who === role))}`;
  });
  const flows = roleFlows(role, lines, roles);
  const kinds = [...flows.byKind.entries()].sort((a, b) => a[1] - b[1]).map(([kind, total]) => `${kind} ${moneyText(total / flows.days)}`).join(', ');
  const nets = [...flows.byTruck.values()].sort((a, b) => a - b);
  const median = nets.length > 0 ? nets[Math.floor(nets.length / 2)] : 0;
  console.log(`  ${role}: ${counts.join(', ')}; start cash ${moneyText(flows.start)}; median net ${moneyText(median)} a day; ${kinds || 'no flows'}`);
}

function dayEndSnaps(snaps) {
  return snaps.filter((snap, i) => i === snaps.length - 1 || snap.t % TIME.turnsPerDay === 0);
}

function roleFlows(role, lines, roles) {
  const inWindow = lines.filter((l) => l.t <= SOLVENCY_DAYS * TIME.turnsPerDay);
  const { presence, starts } = rolePresence(role, inWindow, snapStep(lines));
  const { byKind, byTruck } = roleMoney(role, inWindow, roles, presence);
  for (const [id, total] of byTruck) byTruck.set(id, total / Math.max(1, presence.get(id) / TIME.turnsPerDay));
  const days = Math.max(1e-9, sum([...presence.values()]) / TIME.turnsPerDay);
  const start = starts.size > 0 ? sum([...starts.values()]) / starts.size : 0;
  return { byKind, byTruck, days, start };
}

function sum(values) {
  return values.reduce((total, n) => total + n, 0);
}

function rolePresence(role, lines, step) {
  const presence = new Map();
  const starts = new Map();
  for (const v of lines.flatMap((l) => l.trucks ?? []).filter((t) => t.who === role)) {
    presence.set(v.id, (presence.get(v.id) ?? 0) + step);
    if (!starts.has(v.id)) starts.set(v.id, v.money);
  }
  return { presence, starts };
}

function roleMoney(role, lines, roles, presence) {
  const byKind = new Map();
  const byTruck = new Map([...presence.keys()].map((id) => [id, 0]));
  const rows = lines.flatMap((line) => Object.entries(line.money ?? {})).filter(([id]) => roles.get(id) === role && presence.has(id));
  for (const [id, row] of rows) for (const [kind, amount] of Object.entries(row)) {
    byKind.set(kind, (byKind.get(kind) ?? 0) + amount);
    byTruck.set(id, byTruck.get(id) + amount);
  }
  return { byKind, byTruck };
}

function snapStep(lines) {
  const turns = lines.filter((l) => l.trucks).map((l) => l.t);
  return turns.length > 1 ? turns[1] - turns[0] : 1;
}
