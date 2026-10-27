import { TERRAIN } from "../data/terrain";
import { playerVehicle } from "../sim/damage";
import type { GameEvent, SimNote, World } from "../sim/types";
import { dist } from "../sim/vec";

type Of<K extends GameEvent["t"]> = Extract<GameEvent, { t: K }>;
type StopTable = { [K in GameEvent["t"]]: (event: Of<K>, world: World) => boolean };

const NOTE_STOPS: Record<SimNote["id"], boolean> = {
  engineHot: true,
  engineOverheat: true,
  engineDoused: false,
  overdriveCutOut: true,
  outOfSupplies: true,
  noRoomFuel: true,
  noRoomSupplies: true,
  tankLeak: false,
  filledSupplies: false,
  fuelLow: true,
  stranded: true,
  setDown: true,
  stormEntered: true,
  hazard: true,
  core: true,
  spawnBlocked: false,
};

const CONTRACT_STOPS: readonly string[] = ["expiring", "overdue", "failed", "lapsed", "apart"];
const ESCORT_STOPS: readonly string[] = ["strayed", "hostile", "knockedOut"];
const GUARD_STOPS: readonly string[] = ["knockedOut", "hostile"];

function ownIds(world: World): string[] {
  return [world.player.vehicleId, ...(world.chaosHighway ? [world.chaosHighway.hauler.id] : [])];
}

function isOwn(world: World, id: string): boolean {
  return ownIds(world).includes(id);
}

function isTruck(world: World, id: string): boolean {
  return world.vehicles.some((v) => v.id === id);
}

function smashedProp(world: World, id: string): boolean {
  return world.broken.some((b) => b.obstacle.id === id && b.turn === world.turn);
}

function ramsTruck(event: Of<"collision">, world: World): boolean {
  const other = isOwn(world, event.a) ? event.b : isOwn(world, event.b) ? event.a : null;
  return other !== null && isTruck(world, other);
}

function hurtsByCrash(event: Of<"collision">, world: World): boolean {
  return isOwn(world, event.a) && event.hitsA.some((hit) => hit.damage > 0) && !smashedProp(world, event.b);
}

function stormInSight(event: Of<"weather">, world: World): boolean {
  const weather = event.event;
  if (weather.kind !== "storm") return true;
  return dist(playerVehicle(world).pos, weather.pos) - weather.radius <= TERRAIN.vision.radius;
}

function weatherBites(event: Of<"weather">, world: World): boolean {
  return event.outcome === "started" && event.event.kind !== "overcast" && stormInSight(event, world);
}

function hitsWall(event: Of<"claymore">, world: World): boolean {
  return isOwn(world, event.vehicle) && world.obstacles.some((o) => o.id === event.other);
}

const no = (): boolean => false;
const yes = (): boolean => true;
const ownVehicle = (event: { vehicle: string }, world: World): boolean => isOwn(world, event.vehicle);

const STOPS: StopTable = {
  activity: no,
  stall: no,
  collision: (e, w) => ramsTruck(e, w) || hurtsByCrash(e, w),
  empty: no,
  shot: (e, w) => isOwn(w, e.shooter) || isOwn(w, e.target),
  partDisabled: ownVehicle,
  cargoSpilled: ownVehicle,
  destroyed: ownVehicle,
  npcKnockout: no,
  npcWake: no,
  arrived: no,
  spawn: no,
  despawn: no,
  hostile: no,
  joins: no,
  standing: no,
  preyPassed: no,
  practice: no,
  skillUp: no,
  money: no,
  contract: (e) => CONTRACT_STOPS.includes(e.outcome),
  claimRival: no,
  claimLead: no,
  discover: no,
  encounter: no,
  note: no,
  supply: (e) => NOTE_STOPS[e.note.id],
  death: yes,
  coreBurn: no,
  sunwardFallen: no,
  knockout: yes,
  wake: no,
  scrapPatch: no,
  engineCredit: no,
  townPatch: no,
  siteEvent: no,
  towOffer: no,
  towHitched: no,
  towDone: no,
  escortPaid: no,
  guardPaid: no,
  shopMoney: no,
  transfer: no,
  holdUp: no,
  escortHired: no,
  escortRefused: no,
  escortEnded: (e) => ESCORT_STOPS.includes(e.end),
  crewAsked: no,
  crewFormed: no,
  crewFailed: no,
  crewLeft: no,
  crewLed: no,
  crewDisbanded: no,
  guardHired: no,
  guardEnded: (e) => GUARD_STOPS.includes(e.end),
  towDropped: no,
  stateEnded: no,
  lookedOver: no,
  job: no,
  breakdown: ownVehicle,
  searched: no,
  weather: weatherBites,
  say: no,
  call: no,
  honk: no,
  aidStarted: no,
  patch: no,
  aid: no,
  plea: no,
  lootArgument: no,
  info: (e) => NOTE_STOPS[e.note.id],
  utility: no,
  lineTorn: ownVehicle,
  pulse: no,
  claymore: hitsWall,
  claymoreCookOff: ownVehicle,
  caltrops: ownVehicle,
  found: no,
  outpostReached: no,
  roadOpened: no,
  runLost: yes,
  bountyFiled: no,
  bountyClosed: no,
  settlement: no,
  asked: no,
  huntWithdrawn: no,
};

export function stopsTravel(event: GameEvent, world: World): boolean {
  return (STOPS[event.t] as (event: GameEvent, world: World) => boolean)(event, world);
}
