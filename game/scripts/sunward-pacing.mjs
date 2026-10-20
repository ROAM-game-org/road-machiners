import { REGION } from '../src/data/region.ts';
import { SUNWARD } from '../src/data/sunward.ts';
import { startKit } from '../src/data/start.ts';
import { TEST_MAP } from '../src/test/map.ts';
import { newWorld, endTurn } from '../src/sim/world.ts';
import { defaultSetup } from '../src/sim/settings.ts';
import { setHeadless } from '../src/sim/fidelity.ts';
import { advanceFar } from '../src/sim/far.ts';
import { playerVehicle } from '../src/sim/damage.ts';
import { fillHollow } from '../src/sim/spawn.ts';
import { refreshVision } from '../src/sim/vision.ts';
import { hangUp } from '../src/sim/dialogue.ts';
import { dawnAfter, duskTurn, huntTonight, inCraterZone, inFallenSun, isSunwardMember, membersOf, returnTurn, sunwardFacts } from '../src/sim/sunward.ts';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? argv[at + 1] : fallback;
};
const seeds = flag('seeds', '1,2,3').split(',').map(Number);
const dayTurns = Number(flag('day-turns', '190'));
const MORNING_TURNS = 120;

function moveAllFar(w) {
  for (const v of w.vehicles) advanceFar(w, v);
}

function strangersInZone(w) {
  return w.vehicles.filter((v) => v.brain && !isSunwardMember(v) && inCraterZone(v.pos)).length;
}

function huntsPerWeek(w) {
  const facts = sunwardFacts(w);
  const saved = facts.lastHunt;
  let hunts = 0;
  for (let day = 1; day <= 70; day++) {
    if (!huntTonight(w, day)) continue;
    hunts++;
    facts.lastHunt = day;
  }
  facts.lastHunt = saved;
  return (hunts / 10).toFixed(1);
}

function playNight(seed) {
  let w = newWorld(seed, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
  const bowl = REGION.towns.find((t) => t.id === 'bowl');
  playerVehicle(w).pos = { x: bowl.pos.x + bowl.radius + 6, y: bowl.pos.y };
  fillHollow(w);
  const dusk = duskTurn(2);
  w.turn = dusk - dayTurns;
  refreshVision(w);
  const out = { seed, dayZone: 0, nightZone: 0, arrivals: [], home: null, stalls: 0, roster: 0, hunt: false, beforeDawn: false, homeAtDawn: 0 };
  while (w.turn < dawnAfter(dusk) + MORNING_TURNS) {
    if (w.player.call) w = hangUp(w);
    w = endTurn(w, moveAllFar);
    out.stalls += w.events.filter((e) => e.t === 'stall').length;
    if (w.turn < dusk) out.dayZone += strangersInZone(w);
    else if (w.turn < dawnAfter(dusk)) out.nightZone += strangersInZone(w);
    noteNight(w, dusk, out);
  }
  out.away = membersOf(w).filter((v) => !atHome(v)).map((v) => `${v.brain.templateId}:${v.brain.goals.at(-1)?.kind ?? '-'}/${v.brain.goals.at(-1)?.reason ?? '-'}${v.defeat ? '/' + v.defeat.phase : ''}@${Math.round(Math.hypot(v.pos.x - v.brain.home.x, v.pos.y - v.brain.home.y))}`);
  return out;
}

function noteNight(w, dusk, out) {
  const night = sunwardFacts(w).night;
  if (!night || night.dusk !== dusk) return;
  out.roster = night.roster.length;
  out.hunt = night.hunt !== null;
  noteArrivals(w, dusk, night, out);
  if (w.turn === dawnAfter(dusk)) out.homeAtDawn = membersOf(w).filter(atHome).length;
  noteHome(w, dusk, out);
}

function noteHome(w, dusk, out) {
  if (w.turn <= returnTurn(dusk) || out.home !== null || !membersOf(w).every(atHome)) return;
  out.home = w.turn - returnTurn(dusk);
  out.beforeDawn = w.turn <= dawnAfter(dusk);
}

function atHome(v) {
  return Math.hypot(v.pos.x - v.brain.home.x, v.pos.y - v.brain.home.y) < 2;
}

function noteArrivals(w, dusk, night, out) {
  for (const id of night.roster) {
    const v = w.vehicles.find((x) => x.id === id);
    if (v && inFallenSun(v.pos) && !out.arrivals.some((a) => a.id === id)) out.arrivals.push({ id, turn: w.turn - dusk });
  }
}

setHeadless(true);
console.log(`driveTurns ${SUNWARD.driveTurns}, returnMarginTurns ${SUNWARD.returnMarginTurns}, huntChance ${SUNWARD.huntChance}, cooldown ${SUNWARD.huntCooldownNights}`);
for (const seed of seeds) {
  const r = playNight(seed);
  const arrive = r.arrivals.map((a) => a.turn);
  console.log(`seed ${seed}: roster ${r.roster}, hunt ${r.hunt}, arrived ${arrive.length} in ${Math.min(...arrive)}..${Math.max(...arrive)} turns after dusk, all home ${r.home} turns after the return began (before dawn ${r.beforeDawn}), ${r.homeAtDawn} of ${SUNWARD.cavalcade + SUNWARD.hunters} in their bays at dawn, strangers in the crater zone per turn: day ${(r.dayZone / dayTurns).toFixed(2)} night ${(r.nightZone / (dawnAfter(duskTurn(2)) - duskTurn(2))).toFixed(2)}, stalls ${r.stalls}, away at the end [${r.away.join(' ')}], hunts per week ${huntsPerWeek(newWorld(seed, startKit('standard'), TEST_MAP, defaultSetup('roaming'), false))}`);
}
