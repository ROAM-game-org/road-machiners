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
import { clockOf } from '../src/sim/sun.ts';
import { dawnAfter, duskTurn, holdsPost, huntTonight, inCraterZone, nextRideOut, phaseAt, rideOutTurn, isSunwardMember, membersOf, returnTurn, sunwardFacts } from '../src/sim/sunward.ts';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? argv[at + 1] : fallback;
};
const seeds = flag('seeds', '1,2,3').split(',').map(Number);
const LEAD_IN = 5;
const LEFT_AFTER = 5;
const LATE_AFTER = 19;

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

const clockText = (turn) => {
  const { day, hour } = clockOf(turn);
  const whole = Math.floor(hour);
  return `day ${day} ${String(whole).padStart(2, '0')}:${String(Math.floor((hour - whole) * 60)).padStart(2, '0')}`;
};

function playNight(seed) {
  let w = newWorld(seed, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
  const bowl = REGION.towns.find((t) => t.id === 'bowl');
  playerVehicle(w).pos = { x: bowl.pos.x + bowl.radius + 6, y: bowl.pos.y };
  fillHollow(w);
  const dusk = duskTurn(2);
  const out = rideOutTurn(dusk);
  const next = nextRideOut(dawnAfter(dusk));
  w.turn = out - LEAD_IN;
  refreshVision(w);
  const night = { seed, out, dusk, next, dayZone: 0, nightZone: 0, held: new Map(), homeAt: new Map(), away: new Map(), late: [], leftPost: null, home: null, stalls: 0, roster: 0, hunt: false, homeAtDawn: 0 };
  while (w.turn < next) {
    if (w.player.call) w = hangUp(w);
    w = endTurn(w, moveAllFar);
    for (const e of w.events.filter((x) => x.t === 'stall')) {
      night.stalls++;
      noteStall(w, e);
    }
    if (w.turn < dusk) night.dayZone += strangersInZone(w);
    else if (w.turn < dawnAfter(dusk)) night.nightZone += strangersInZone(w);
    noteNight(w, night);
  }
  night.stragglers = membersOf(w).filter((v) => !atHome(v)).map((v) => `${v.brain.templateId}:${v.brain.goals.at(-1)?.kind ?? '-'}/${v.brain.goals.at(-1)?.reason ?? '-'}${v.defeat ? '/' + v.defeat.phase : ''}${foeOf(w, v)}@${Math.round(Math.hypot(v.pos.x - v.brain.home.x, v.pos.y - v.brain.home.y))}`);
  return night;
}

function noteStall(w, e) {
  const v = w.vehicles.find((x) => x.id === e.vehicle);
  const at = v ? `${v.brain?.templateId} at (${v.pos.x.toFixed(0)}, ${v.pos.y.toFixed(0)}), ${Math.round(Math.hypot(v.pos.x - v.brain.home.x, v.pos.y - v.brain.home.y))} from home` : 'gone';
  console.log(`stall at ${clockText(w.turn)} (${phaseAt(w.turn)}): ${e.vehicle} ${at}, goal ${e.goal}/${e.reason}`);
}

function noteNight(w, night) {
  const facts = sunwardFacts(w).night;
  if (!facts || facts.dusk !== night.dusk) return;
  night.roster = facts.roster.length;
  night.hunt = facts.hunt !== null;
  noteHolds(w, facts, night);
  if (w.turn === night.dusk + LATE_AFTER) noteLate(w, facts, night);
  if (w.turn === dawnAfter(night.dusk)) night.homeAtDawn = membersOf(w).filter(atHome).length;
  noteHome(w, night);
}

function noteLate(w, facts, night) {
  night.late = facts.roster.filter((id) => !night.held.has(id)).map((id) => {
    const v = w.vehicles.find((x) => x.id === id);
    const top = v?.brain.goals.at(-1);
    return v ? `${id} ${top?.kind}/${top?.reason}${foeOf(w, v)} ${Math.round(Math.hypot(v.pos.x - v.brain.home.x, v.pos.y - v.brain.home.y))} tiles from the bay${v.defeat ? ` ${v.defeat.phase}` : ''}` : `${id} gone`;
  });
}

function noteHolds(w, facts, night) {
  for (const v of facts.roster.map((id) => w.vehicles.find((x) => x.id === id)).filter(Boolean)) {
    if (holdsPost(v)) noteHeld(w, v, night);
    else noteAway(w, v, night);
  }
}

function noteHeld(w, v, night) {
  if (!night.held.has(v.id)) night.held.set(v.id, w.turn);
  night.away.set(v.id, 0);
}

function noteAway(w, v, night) {
  if (!night.held.has(v.id) || w.turn >= returnTurn(night.dusk)) return;
  const gone = (night.away.get(v.id) ?? 0) + 1;
  night.away.set(v.id, gone);
  if (gone === LEFT_AFTER && night.leftPost === null) night.leftPost = w.turn - LEFT_AFTER + 1;
}

function noteHome(w, night) {
  if (w.turn <= returnTurn(night.dusk)) return;
  const members = membersOf(w);
  for (const v of members.filter((x) => atHome(x) && !night.homeAt.has(x.id))) night.homeAt.set(v.id, w.turn);
  if (night.home === null && night.homeAt.size === members.length) night.home = Math.max(...night.homeAt.values());
}

function foeOf(w, v) {
  const targetId = v.brain.goals.at(-1)?.targetId;
  const foe = w.vehicles.find((x) => x.id === targetId);
  return foe?.brain ? `~${foe.brain.templateId}` : '';
}

function atHome(v) {
  return Math.hypot(v.pos.x - v.brain.home.x, v.pos.y - v.brain.home.y) < 2;
}

setHeadless(true);
console.log(`rideLeadTurns ${SUNWARD.rideLeadTurns}, driveTurns ${SUNWARD.driveTurns}, returnMarginTurns ${SUNWARD.returnMarginTurns}, huntChance ${SUNWARD.huntChance}, cooldown ${SUNWARD.huntCooldownNights}`);
for (const seed of seeds) {
  const r = playNight(seed);
  const last = r.held.size > 0 ? Math.max(...r.held.values()) : null;
  const first = r.held.size > 0 ? Math.min(...r.held.values()) : null;
  const nightTurns = dawnAfter(r.dusk) - r.dusk;
  console.log(`seed ${seed}: roster ${r.roster}, hunt ${r.hunt}, ride-out ${clockText(r.out)}, ${r.held.size} of ${r.roster} hold a post from ${first === null ? '-' : clockText(first)} to ${last === null ? '-' : clockText(last)} (last arrival ${last === null ? '-' : last - r.out} turns after ride-out, ${last === null ? '-' : last - r.dusk} after dusk, by dusk+19 ${last !== null && last <= r.dusk + LATE_AFTER}; not yet at a post at dusk+19: [${r.late.join('; ')}]), first car leaves its post ${r.leftPost === null ? 'never before the return' : clockText(r.leftPost)} (return ${clockText(returnTurn(r.dusk))}), all home ${r.home === null ? `NOT before the next ride-out (${r.homeAt.size} of ${SUNWARD.cavalcade + SUNWARD.hunters} came home)` : clockText(r.home)} (${r.home === null ? '-' : r.next - r.home} turns before the next ride-out), ${r.homeAtDawn} of ${SUNWARD.cavalcade + SUNWARD.hunters} in their bays at dawn, strangers in the crater zone per turn: day ${(r.dayZone / (r.dusk - r.out + LEAD_IN)).toFixed(2)} night ${(r.nightZone / nightTurns).toFixed(2)}, stalls ${r.stalls}, away at the end [${r.stragglers.join(' ')}], hunts per week ${huntsPerWeek(newWorld(seed, startKit('standard'), TEST_MAP, defaultSetup('roaming'), false))}`);
}
