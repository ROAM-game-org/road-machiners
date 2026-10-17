
import { canHireGuard, dismissGuard, guardFee, guardTaken, hireGuard, isPlayerGuard } from './hire';
import { COLD_LINES, TOPIC_GATES, type ConditionId, type EffectId, type LineId, type PrepareId, type TopicId } from '../data/dialogue';
import { REFUSE_KNOWN_AT } from '../data/npc-behavior';
import { bandAtLeast, personalTerm, stanceToward } from './relations';
import { CONTRACTS } from '../data/market';
import { GAME_NOTES, isNoteId, LOCALS, type LocalDef, type NoteId } from '../data/locals';
import { TRADE_TIP } from '../data/npcs';
import { PERK_NUMBERS } from '../data/skills';
import { WAGON_SEVEN } from '../data/salvage';
import { REGION, type TownDef } from '../data/region';
import { playerVehicle } from './damage';
import { discoverSite } from './locations';
import { inCombat, isHostile } from './combat';
import { defyThreat, patchGoal, startTow, topGoal } from './npc-activities';
import { heldSearch, noteSearchLead, haulBlocked, searchRefusal, isExpired, shopAt, shopState, takeContract, type Contract, type SearchContract, goodValue, priceAtPressure, standingPrice, vehicleValue } from './market';
import { escortBlocked, heldEscort, holdEscort, releaseHold, type EscortContract } from './escort-job';
import { recall, sightingOf } from './memory';
import { askHandover, handoverWith, parcelFor } from './parcel';
import { heardRumor, siteRumor, tradeTip, type Rumor } from './rumors';
import { closeEncounter, encounterOfTopic, favorAmount, moveStory, pendingFor, requirePending, storyBeatDue, tipPrice, tipTarget } from './encounters';
import { hasPerk, practice } from './progress';
import { abandonSpill, answerPlea, standDownBeggar, backOffClaims, defyClaims, guardsClaim, answersPlea, answersSurrender, offeredSurrenderBy, answersThreat, giveUpTo, handedOver, hasStrandedPrey, hasStrippable, judgedWorthOffer, makePeace, offersGiveUp, pendingPlea, playerPleaded, settlePlayerPlea, settleThreat, spillClaimOn, standDownTo, surrenderTo, yieldTo, type ThreatAnswer } from './parley';
import { answerLootWarning, answerWarning, lootsBesidePlayer, pendingWarningTo, playerWarns, warnRefusalOf, type WarnAnswer } from './loot-warning';
import { talkOf } from './dialogue';
import { cargoHaul, haulVar, showsHaul, surrenderHaul } from './haul';
import { hasCargo, hasSalvage, isStoryWreck, storyStock, type ClaimContract } from './salvage';
import { claimPartHeld, leadOf, rivalRunning } from './claims';
import { agreePatch, canFixItself, canTakeWornPatch, needsPatch, patchTerms } from './patch';
import { decide, isWeak, npcProfile, wantsLoot } from './npc-decisions';
import { isStranded } from './stats';
import { addState, aidData, declareFeud, stateOf, towData } from './states';
import { agreeAid, aidHolds, aidPrice, canSpareFor, hasAid, isLow, playerAid, refuseAid, spareAid, wantedAid, type AidAmounts } from './aid';
import { spread, startTrade, tradeWith, transfer } from './economy';
import { acceptOffer, canTowNpc, isTowing, hitchNpc, isOnRope, npcTowTerms, playerTow, playerTowing, refuseOffer, releaseNpc, strandedPlayerAt } from './tow';
import type { Call, CallVar, CallVars, DirectionTarget, GridItem, MemoryFact, NpcState, Plea, TopicOutcome, Vehicle, World } from './types';
import { bearing, dist, type Vec } from './vec';
import { craterNews, giveWord, prepareVigilCall, refuseVigil, vigilCallDue } from './sunward-crater';
import { directionsTo } from './directions';

function demandsOnTop(world: World, npc: Vehicle): boolean {
  const top = topGoal(npc);
  return top?.kind === 'fight' && top.targetId === world.player.vehicleId && top.demands === true && cargoHaul(npc, playerVehicle(world)).length > 0;
}

function requireOpenSearch(world: World): SearchContract {
  const search = heldSearch(world);
  if (!search || search.delivered) throw new Error('No open search to talk about');
  return search;
}

function sightingVar(vars: CallVars): Extract<CallVar, { kind: 'sighting' }> {
  const v = vars.sighting;
  if (v?.kind !== 'sighting') throw new Error('The call has no sighting value');
  return v;
}

export type Condition = (world: World, npc: Vehicle, vars: CallVars) => boolean;
export type Effect = (world: World, npc: Vehicle, call: Call) => void;
export type Prepare = (world: World, npc: Vehicle) => CallVars;

function knownTowns(npc: Vehicle): TownDef[] {
  return npcProfile(npc).towns.map((id) => {
    const town = REGION.towns.find((t) => t.id === id);
    if (!town) throw new Error(`Unknown town ${id}`);
    return town;
  });
}

function nearestKnownTown(world: World, npc: Vehicle): TownDef {
  const me = playerVehicle(world).pos;
  const towns = knownTowns(npc);
  if (towns.length === 0) throw new Error(`${npc.id} knows no town`);
  return towns.reduce((a, b) => (dist(me, a.pos) <= dist(me, b.pos) ? a : b));
}

function settleDemand(world: World, npc: Vehicle, outcome: TopicOutcome): void {
  world.player.talked[npc.id] = { ...world.player.talked[npc.id], demand: outcome };
}

function settle(world: World, npc: Vehicle, call: Call, outcome: TopicOutcome): void {
  if (!call.topic) throw new Error('Only a topic can be settled');
  world.player.talked[npc.id] = { ...world.player.talked[npc.id], [call.topic]: outcome };
}

function answerOf(vars: CallVars): string | null {
  const v = vars.answer;
  if (v === undefined) return null;
  if (v.kind !== 'answer') throw new Error(`The answer value holds a ${v.kind}`);
  return v.option;
}

function namesHaul(vars: CallVars): boolean {
  const v = vars.haul;
  return v?.kind === 'haul' && (v.parts.length > 0 || Object.keys(v.goods).length > 0);
}

function shownHaul(world: World, npc: Vehicle, call: Call, surrender: boolean): GridItem[] {
  const me = playerVehicle(world);
  const haul = surrender ? surrenderHaul(npc, me) : handedOver(world, me, npc);
  if (!showsHaul(call.vars.haul, haul)) throw new Error(`${npc.id} named a different haul than the one the player drops`);
  return haul;
}

function settleOpen(world: World, npc: Vehicle, call: Call, outcome: TopicOutcome): void {
  if (!call.topic) throw new Error('Only a topic can be settled');
  if (world.player.talked[npc.id]?.[call.topic] === undefined) settle(world, npc, call, outcome);
}

function settleTopic(world: World, npc: Vehicle, topic: TopicId, outcome: TopicOutcome): void {
  world.player.talked[npc.id] = { ...world.player.talked[npc.id], [topic]: outcome };
}

function closeCall(world: World, npc: Vehicle, call: Call): void {
  if (!call.topic) throw new Error('Only a topic can end an encounter');
  closeEncounter(world, npc, encounterOfTopic(call.topic));
}

function rumorVars(world: World, rumor: Rumor): CallVars {
  const me = playerVehicle(world).pos;
  if (rumor.site) return { site: { kind: 'site', id: rumor.id }, way: wayVar(world, me, { kind: 'site', id: rumor.id }) };
  return { way: wayVar(world, me, { kind: 'spot', pos: rumor.pos, clue: 'wreck' }) };
}

function discoverNewsSite(world: World, call: Call): void {
  const v = call.vars.site;
  if (v?.kind !== 'site' || world.player.discovered.includes(v.id)) return;
  const site = [...REGION.towns, ...REGION.locations].find((s) => s.id === v.id);
  if (!site) throw new Error(`Unknown site ${v.id}`);
  discoverSite(world, site);
}

function markNewsWreck(world: World, npc: Vehicle, call: Call): void {
  const rumor = heardRumor(world, npc);
  if (call.vars.site === undefined && call.vars.way !== undefined && rumor && !rumor.site) world.player.rumored.push(rumor.id);
}

function angerCourier(world: World, npc: Vehicle): void {
  declareFeud(world, npc, world.player.vehicleId);
  addState(world, 'revenge', npc.id, world.player.vehicleId, { kind: 'none' });
}

function backOff(world: World, npc: Vehicle): void {
  addState(world, 'backedOff', npc.id, world.player.vehicleId, { kind: 'none' });
}

function answerChallenge(world: World, npc: Vehicle, call: Call): void {
  const answer = threatAnswer(call);
  if (answer === 'comply') {
    backOff(world, npc);
    practice(world, 'deal', 1, null, npc.id);
  } else defyThreat(world, npc, playerVehicle(world), answer, answer === 'fightBack' ? 'calledOut' : undefined);
  settle(world, npc, call, answer === 'comply' ? 'agreed' : 'refused');
}

function playerPlea(call: Call): Plea {
  if (call.topic === 'truce') return 'truce';
  if (call.topic === 'mercy') return 'mercy';
  throw new Error(`Topic ${call.topic} holds no plea`);
}

function threatAnswer(call: Call): ThreatAnswer {
  const option = answerOf(call.vars);
  if (option !== 'comply' && option !== 'fightBack' && option !== 'flee') throw new Error(`Bad threat answer ${option}`);
  return option;
}

function warnAnswer(call: Call): WarnAnswer {
  const option = answerOf(call.vars);
  if (option !== 'comply' && option !== 'refuse' && option !== 'fightBack') throw new Error(`Bad warning answer ${option}`);
  return option;
}

function warnRefusal(call: Call): 'leave' | 'fight' {
  const option = answerOf(call.vars);
  if (option !== 'leave' && option !== 'fight') throw new Error(`Bad warning refusal ${option}`);
  return option;
}

function inPatch(world: World, id: string): boolean {
  return world.states.some((s) => s.kind === 'patch' && (s.holder === id || s.other === id));
}

function offerBy(world: World, npc: Vehicle) {
  const tow = playerTow(world);
  return tow?.holder === npc.id && !towData(tow).hitched ? tow : null;
}

type PriceFact = Extract<MemoryFact, { kind: 'prices' }>;

function lastTownMemory(npc: Vehicle): PriceFact | null {
  const memory = recall(npc, 'prices').find((m) => REGION.towns.some((t) => t.id === m.fact.shop));
  return memory?.fact ?? null;
}

function rememberedPrices(world: World, fact: PriceFact): { good: string; buy: number; sell: number }[] {
  const margin = spread(world);
  return Object.entries(fact.pressure).map(([good, pressure]) => ({
    good,
    buy: priceAtPressure(fact.shop, good, pressure, 'buy', margin),
    sell: priceAtPressure(fact.shop, good, pressure, 'sell', margin),
  }));
}

function trucePrice(npc: Vehicle): number {
  return Math.round(vehicleValue(npc) * PERK_NUMBERS.paidTruce.share);
}

function aidVar(a: AidAmounts): CallVar {
  return { kind: 'aid', fuel: a.fuel, supplies: a.supplies };
}

function namedAid(call: Call): AidAmounts {
  const v = call.vars.aid;
  if (v?.kind !== 'aid') throw new Error('The topic named no fuel or supplies');
  return { fuel: v.fuel, supplies: v.supplies };
}

function namedPrice(call: Pick<Call, 'vars'>): number {
  const v = call.vars.price;
  if (v?.kind !== 'money') throw new Error('The topic named no price');
  return v.amount;
}

function pendingAid(world: World, npc: Vehicle): NpcState | null {
  const s = stateOf(world, 'aid', npc.id, world.player.vehicleId);
  return s && !aidData(s).agreed ? s : null;
}

function requirePendingAid(world: World, npc: Vehicle): NpcState {
  const s = pendingAid(world, npc);
  if (!s) throw new Error(`${npc.id} has no aid offer pending`);
  return s;
}

function aidAnswer(world: World, npc: Vehicle): CallVars {
  const gives = canSpareFor(world, npc) && decide(world, npc, 'aidAsked', world.player.vehicleId, null) === 'give';
  if (!gives) return { answer: { kind: 'answer', option: 'refuse' } };
  return { answer: { kind: 'answer', option: 'give' }, aid: aidVar(spareAid(world, npc)) };
}

const HELP_TOPICS: readonly TopicId[] = ['offerAid', 'offerTow', 'offerPatch', 'offerPatchWorn', 'patchRequest'];

export function helpedByPlayer(world: World, npc: Vehicle): boolean {
  const talked = world.player.talked[npc.id];
  return HELP_TOPICS.some((topic) => talked?.[topic] === 'done' || talked?.[topic] === 'agreed');
}

export function opensHelp(world: World, npc: Vehicle): boolean {
  return helpedByPlayer(world, npc) || bandAtLeast(stanceToward(world, npc), 'friendly');
}

export function talksTo(world: World, npc: Vehicle): boolean {
  return bandAtLeast(stanceToward(world, npc), 'neutral');
}

export function gateOpen(world: World, npc: Vehicle, topic: TopicId): boolean {
  const gate = TOPIC_GATES[topic];
  if (gate === 'service') return talksTo(world, npc);
  return gate !== 'rescue' || stanceToward(world, npc) !== 'hostile';
}

export function coldLine(world: World, npc: Vehicle, topics: readonly TopicId[]): LineId | null {
  if (talksTo(world, npc) || !topics.some((id) => TOPIC_GATES[id] === 'service')) return null;
  return personalTerm(npc, world.player.vehicleId) <= REFUSE_KNOWN_AT ? COLD_LINES.known : COLD_LINES.kind;
}

export const CONDITIONS: Record<ConditionId, Condition> = {
  firstVigilCall: (world, npc) => vigilCallDue(world, npc, 1),
  secondVigilCall: (world, npc) => vigilCallDue(world, npc, 2),
  lastVigilCall: (world, npc) => vigilCallDue(world, npc, 3),
  canPayTalk: (world, _npc, vars) => world.player.money >= namedPrice({ vars }),
  mercForHire: (world, npc) => world.player.talked[npc.id]?.hireGuard !== 'refused' && canHireGuard(world, npc),
  takesGuard: (_world, _npc, vars) => answerOf(vars) === 'take',
  refusesGuard: (_world, _npc, vars) => answerOf(vars) === 'decline',
  canPayGuard: (world, _npc, vars) => world.player.money >= namedPrice({ vars }),
  guardOfMine: (world, npc) => isPlayerGuard(world, npc),
  knowsTown: (_world, npc) => knownTowns(npc).length > 0,
  offersPaidTow: (world, npc) => {
    const tow = offerBy(world, npc);
    return tow !== null && towData(tow).fee > 0;
  },
  offersFreeTow: (world, npc) => {
    const tow = offerBy(world, npc);
    return tow !== null && towData(tow).fee === 0;
  },
  canTowPlayer: (world, npc) => strandedPlayerAt(world, npc) !== null && topGoal(npc)?.kind !== 'tow',
  playerNeedsPatch: (world) => needsPatch(world, playerVehicle(world)) && !inPatch(world, world.player.vehicleId),
  npcNeedsPatch: (world, npc) => needsPatch(world, npc) && !canFixItself(world, npc) && !inPatch(world, npc.id),
  npcWorn: (world, npc) => canTakeWornPatch(world, npc) && !canFixItself(world, npc) && !inPatch(world, npc.id) && !isTowing(world, npc.id) && !isStranded(world, playerVehicle(world)),
  npcOffRope: (world, npc) => !isOnRope(world, npc.id),
  escortFollowed: (world, npc) => {
    const job = heldEscort(world);
    return job !== null && job.client === npc.id && job.holdUntil === null;
  },
  escortHeld: (world, npc) => {
    const job = heldEscort(world);
    return job !== null && job.client === npc.id && job.holdUntil !== null;
  },
  noTrade: (world, npc) => tradeWith(world, npc) === null,
  npcCalm: (world, npc) => !inCombat(world, npc),
  hasDeal: (_world, _npc, vars) => vars.deal !== undefined,
  noDeal: (_world, _npc, vars) => vars.deal === undefined,
  hasHaul: (_world, _npc, vars) => namesHaul(vars),
  noHaul: (_world, _npc, vars) => !namesHaul(vars),
  demandsCargo: (world, npc) => !isStranded(world, npc) && !hasStrandedPrey(world, npc) && demandsOnTop(world, npc),
  demandsSurrender: (world, npc) => hasStrandedPrey(world, npc) && wantsLoot(world, npc, playerVehicle(world)) && hasStrippable(world, npc, playerVehicle(world)),
  demandsGiveUp: (world, npc) => offersGiveUp(world, npc) && judgedWorthOffer(world, npc),
  npcBeaten: (world, npc) => isWeak(world, npc),
  notOfferedYield: (world, npc) => !offeredSurrenderBy(world, npc, playerVehicle(world)),
  guardsClaim: (world, npc) => guardsClaim(world, npc),
  claimsSpill: (world, npc) => spillClaimOn(world, npc) !== null,
  atOdds: (world, npc) => isHostile(world, npc, playerVehicle(world)),
  atPeace: (world, npc) => !isHostile(world, npc, playerVehicle(world)),
  noPlayerPlea: (world, npc) => !playerPleaded(world, npc),
  npcHasCargo: (_world, npc) => hasCargo(npc),
  offersTruce: (world, npc) => pendingPlea(world, npc) === 'truce',
  begsMercy: (world, npc) => pendingPlea(world, npc) === 'mercy',
  demandsToll: (_world, _npc, vars) => answerOf(vars) === 'demand',
  accepts: (_world, _npc, vars) => answerOf(vars) === 'yes',
  refuses: (_world, _npc, vars) => answerOf(vars) === 'no',
  complies: (_world, _npc, vars) => answerOf(vars) === 'comply',
  resists: (_world, _npc, vars) => answerOf(vars) === 'fightBack',
  runs: (_world, _npc, vars) => answerOf(vars) === 'flee',
  claimsPlayerLoot: (world, npc) => lootsBesidePlayer(world, npc),
  holdsOn: (_world, _npc, vars) => answerOf(vars) === 'refuse',
  warnsPlayerOff: (world, npc) => pendingWarningTo(world, npc) !== null,
  yieldsLoot: (_world, _npc, vars) => answerOf(vars) === 'leave',
  fightsForLoot: (_world, _npc, vars) => answerOf(vars) === 'fight',
  canTowNpc: (world, npc) => canTowNpc(world, npc),
  towedByPlayer: (world, npc) => playerTowing(world)?.other === npc.id,
  knowsLastTown: (world, npc) => hasPerk(world, 'marketEars') && lastTownMemory(npc) !== null,
  hearsRumor: (world, npc) => hasPerk(world, 'rumorMill') && heardRumor(world, npc) !== null,
  rumorOfSite: (_world, _npc, vars) => vars.site !== undefined,
  rumorOfWreck: (_world, _npc, vars) => vars.site === undefined,
  canPayTruce: (world, npc) => hasPerk(world, 'paidTruce') && world.player.money >= trucePrice(npc),
  npcLow: (world, npc) => hasAid(wantedAid(world, npc)),
  playerLow: (world) => isLow(world, playerVehicle(world)),
  noAid: (world) => playerAid(world) === null,
  aidHolds: (world, npc) => aidHolds(world, npc, playerVehicle(world)),
  aidGiven: (_world, _npc, vars) => answerOf(vars) === 'give',
  aidRefused: (_world, _npc, vars) => answerOf(vars) === 'refuse',
  offersAid: (world, npc) => pendingAid(world, npc) !== null,
  offersTale: (world, npc) => pendingFor(world, npc, 'tale'),
  offersTip: (world, npc) => pendingFor(world, npc, 'tip'),
  callsOut: (world, npc) => pendingFor(world, npc, 'challenge'),
  asksCourierAid: (world, npc) => pendingFor(world, npc, 'courier'),
  newsOfSite: (_world, _npc, vars) => vars.site !== undefined,
  newsOfWreck: (_world, _npc, vars) => vars.site === undefined && vars.way !== undefined,
  newsOfTip: (_world, _npc, vars) => vars.tip !== undefined,
  courierThanksDue: (world, npc) => storyBeatDue(world, npc) === 'courierThanks',
  courierSquareDue: (world, npc) => storyBeatDue(world, npc) === 'courierSquare',
  courierColdDue: (world, npc) => storyBeatDue(world, npc) === 'courierCold',
  courierGrudgeDue: (world, npc) => storyBeatDue(world, npc) === 'courierGrudge',
  courierFavorDue: (world, npc) => storyBeatDue(world, npc) === 'courierFavor',
  seeksSomeone: (world, npc) => {
    const search = heldSearch(world);
    return search !== null && !search.delivered && search.target !== npc.id;
  },
  hasParcelFor: (world, npc) => parcelFor(world, npc) !== null,
  noHandover: (world, npc) => handoverWith(world, npc) === null,
  sawSought: (_world, _npc, vars) => sightingVar(vars).seen !== null,
  missedSought: (_world, _npc, vars) => sightingVar(vars).seen === null,
  heardWagonNearby: (world, npc) => holdsNote(world, 'wagonBowl') && dist(npc.pos, storyStock(world, WAGON_SEVEN).pos) <= PERK_NUMBERS.rumorMill.radius,
  nearClaimWreck: (world, npc) => claimSeenBy(world, npc) !== null,
  rivalAsked: (world, npc) => rivalNearWreck(world, requireClaimSeen(world, npc)),
  noRivalAsked: (world, npc) => !rivalNearWreck(world, requireClaimSeen(world, npc)),
};

export const EFFECTS: Record<EffectId, Effect> = {
  acceptOffering: (world, npc) => { giveWord(world, playerVehicle(world), npc); },
  refuseVigil: (world, npc) => refuseVigil(world, npc),
  payTalk: (world, npc, call) => transfer(world, playerVehicle(world), npc, namedPrice(call)),
  revealTown: (world, _npc, call) => {
    const v = call.vars.town;
    if (v?.kind !== 'town') throw new Error('revealTown needs a town value');
    const town = REGION.towns.find((t) => t.id === v.id)!;
    if (!world.player.discovered.includes(town.id)) discoverSite(world, town);
  },
  acceptTow: (world) => acceptOffer(world),
  refuseTow: (world) => refuseOffer(world),
  askTow: (world, npc) => startTow(world, npc, playerVehicle(world), strandedPlayerAt(world, npc)!),
  startTrade: (world, npc) => startTrade(world, npc),
  holdEscort: (world) => holdEscort(world, requireEscort(world)),
  releaseHold: (world) => releaseHold(requireEscort(world)),
  agreePatch: (world, npc, call) => {
    const terms = call.vars.deal;
    if (terms?.kind !== 'deal') throw new Error('agreePatch needs deal terms');
    const deal = agreePatch(world, npc, terms);
    patchGoal(world, npc, playerVehicle(world), deal.holder === npc.id);
    settle(world, npc, call, 'agreed');
  },
  handOver: (world, npc, call) => {
    yieldTo(world, playerVehicle(world), npc, shownHaul(world, npc, call, false));
    settle(world, npc, call, 'agreed');
    practice(world, 'deal', 1, null, npc.id);
  },
  abandonSpill: (world, npc, call) => {
    const stock = spillClaimOn(world, npc);
    if (!stock) throw new Error(`${npc.id} claims no spilled cargo of the player`);
    abandonSpill(world, playerVehicle(world), npc, stock);
    settle(world, npc, call, 'agreed');
    practice(world, 'deal', 1, null, npc.id);
  },
  surrender: (world, npc, call) => {
    shownHaul(world, npc, call, true);
    surrenderTo(world, playerVehicle(world), npc);
    settle(world, npc, call, 'agreed');
    practice(world, 'deal', 1, null, npc.id);
  },
  yieldToPlayer: (world, npc, call) => {
    standDownTo(world, npc, playerVehicle(world));
    settle(world, npc, call, 'agreed');
    practice(world, 'deal', 1, null, npc.id);
  },
  askStandDown: (world, npc, call) => { call.vars = PREPARES.yieldAnswer(world, npc); },
  standDownPlea: (world, npc) => {
    standDownBeggar(world, npc);
    practice(world, 'deal', 1, null, npc.id);
  },
  giveUp: (world, npc, call) => {
    giveUpTo(world, playerVehicle(world), npc);
    settle(world, npc, call, 'agreed');
    practice(world, 'deal', 1, null, npc.id);
  },
  backOffClaim: (world, npc) => backOffClaims(world, npc),
  defyClaim: (world, npc, call) => {
    defyClaims(world, npc);
    settle(world, npc, call, 'refused');
  },
  acceptPlea: (world, npc) => answerPlea(world, npc, true),
  refusePlea: (world, npc) => answerPlea(world, npc, false),
  settlePlea: (world, npc, call) => {
    if (playerPlea(call) === 'mercy' && answerOf(call.vars) === 'yes') shownHaul(world, npc, call, false);
    settlePlayerPlea(world, npc, playerPlea(call), answerOf(call.vars) === 'yes');
  },
  withdrawPlea: (world, npc, call) => {
    settlePlayerPlea(world, npc, playerPlea(call), false);
    if (answerOf(call.vars) === 'demand') settleDemand(world, npc, 'refused');
  },
  payToll: (world, npc, call) => {
    if (answerOf(call.vars) !== 'demand') throw new Error('payToll needs a demand answer');
    settlePlayerPlea(world, npc, 'truce', false);
    yieldTo(world, playerVehicle(world), npc, shownHaul(world, npc, call, false));
    settleDemand(world, npc, 'agreed');
    practice(world, 'deal', 1, null, npc.id);
  },
  refuseToll: (world, npc, call) => {
    if (answerOf(call.vars) !== 'demand') throw new Error('refuseToll needs a demand answer');
    settlePlayerPlea(world, npc, 'truce', false);
    settleDemand(world, npc, 'refused');
  },
  hitchNpc: (world, npc) => hitchNpc(world, npc, false),
  hitchNpcFree: (world, npc) => hitchNpc(world, npc, true),
  releaseNpc: (world, npc) => releaseNpc(world, npc),
  settleThreat: (world, npc, call) => {
    const answer = threatAnswer(call);
    settleThreat(world, npc, answer);
    settle(world, npc, call, answer === 'comply' ? 'agreed' : 'refused');
    if (answer === 'comply') practice(world, 'deal', 1, null, npc.id);
  },
  settleWarning: (world, npc, call) => {
    const answer = warnAnswer(call);
    playerWarns(world, npc, answer);
    settle(world, npc, call, answer === 'comply' ? 'agreed' : 'refused');
  },
  leaveLootWarning: (world, npc, call) => {
    answerLootWarning(world, npc, 'comply', warnRefusal(call));
    settle(world, npc, call, 'agreed');
  },
  refuseLootWarning: (world, npc, call) => {
    answerLootWarning(world, npc, 'refuse', warnRefusal(call));
    settle(world, npc, call, 'refused');
  },
  fightLootWarning: (world, npc, call) => {
    answerLootWarning(world, npc, 'fightBack', warnRefusal(call));
    settle(world, npc, call, 'refused');
  },
  hangUpLootWarning: (world, npc, call) => {
    if (pendingWarningTo(world, npc)) EFFECTS.refuseLootWarning(world, npc, call);
  },
  revealRumor: (world, npc, call) => {
    const rumor = heardRumor(world, npc);
    if (!rumor || (rumor.site !== null) !== (call.vars.site !== undefined)) throw new Error(`${npc.id} has no rumor to reveal`);
    if (rumor.site) discoverSite(world, rumor.site);
    else world.player.rumored.push(rumor.id);
  },
  hireGuard: (world, npc, call) => hireGuard(world, npc, namedPrice(call)),
  dismissGuard: (world, npc) => {
    if (!isPlayerGuard(world, npc)) throw new Error(`${npc.id} guards no one the player can dismiss`);
    dismissGuard(world);
  },
  payTruce: (world, npc, call) => {
    const price = call.vars.price;
    if (price?.kind !== 'money') throw new Error('payTruce needs a price');
    transfer(world, playerVehicle(world), npc, price.amount);
    makePeace(world, playerVehicle(world), npc);
  },
  giveAidPaid: (world, npc, call) => { agreeAid(world, npc, { giver: 'player', ...namedAid(call), price: namedPrice(call), free: false }); },
  giveAidFree: (world, npc, call) => { agreeAid(world, npc, { giver: 'player', ...namedAid(call), price: 0, free: true }); },
  takeAid: (world, npc, call) => { agreeAid(world, npc, { giver: 'npc', ...namedAid(call), price: 0, free: true }); },
  acceptAidOffer: (world, npc) => {
    const { giver, fuel, supplies, price, free } = aidData(requirePendingAid(world, npc));
    agreeAid(world, npc, { giver, fuel, supplies, price, free });
  },
  refuseAidOffer: (world, npc) => refuseAid(world, npc),
  noteWagonRoad: (world) => learnNote(world, GAME_NOTES.wagonRoad),
  noteLead: (world, npc, call) => {
    const search = requireOpenSearch(world);
    const told = sightingVar(call.vars);
    const memory = sightingOf(npc, search.target);
    if (!memory || told.seen === null || told.seen.turns !== world.turn - memory.turn) throw new Error(`${npc.id} no longer remembers the sighting it told`);
    noteSearchLead(world, memory.fact.at, memory.turn);
  },
  startHandover: (world, npc) => askHandover(world, npc),
  noteClaimLead: (world, npc) => noteClaimLead(world, npc),
  tellTale: (world, npc, call) => {
    requirePending(world, npc, 'tale');
    discoverNewsSite(world, call);
    settle(world, npc, call, 'done');
  },
  buyTip: (world, npc, call) => {
    requirePending(world, npc, 'tip');
    const target = tipTarget(world, npc);
    if (!target) throw new Error(`${npc.id} has no wreck to sell`);
    transfer(world, playerVehicle(world), npc, namedPrice(call));
    world.player.rumored.push(target.id);
    settle(world, npc, call, 'done');
  },
  declineEncounter: (world, npc, call) => {
    settleOpen(world, npc, call, 'refused');
    closeCall(world, npc, call);
  },
  endEncounter: (world, npc, call) => {
    settleOpen(world, npc, call, 'done');
    closeCall(world, npc, call);
  },
  backDown: (world, npc, call) => {
    backOff(world, npc);
    settle(world, npc, call, 'agreed');
    closeCall(world, npc, call);
  },
  answerChallenge: (world, npc, call) => answerChallenge(world, npc, call),
  acceptChallenge: (world, npc, call) => {
    defyThreat(world, npc, playerVehicle(world), 'fightBack', 'calledOut');
    settle(world, npc, call, 'refused');
    closeCall(world, npc, call);
  },
  courierFree: (world, npc, call) => {
    EFFECTS.giveAidFree(world, npc, call);
    moveStory(world, npc, ['asked'], 'promised', true);
    settle(world, npc, call, 'agreed');
    closeCall(world, npc, call);
  },
  courierPaid: (world, npc, call) => {
    EFFECTS.giveAidPaid(world, npc, call);
    moveStory(world, npc, ['asked'], 'promised', false);
    settle(world, npc, call, 'agreed');
    closeCall(world, npc, call);
  },
  courierRefuse: (world, npc, call) => {
    moveStory(world, npc, ['asked'], 'refused');
    settleOpen(world, npc, call, 'refused');
    closeCall(world, npc, call);
  },
  courierThank: (world, npc, call) => {
    discoverNewsSite(world, call);
    markNewsWreck(world, npc, call);
    moveStory(world, npc, ['helped'], 'owed');
    settle(world, npc, call, 'done');
  },
  courierSquareUp: (world, npc, call) => {
    moveStory(world, npc, ['paid'], 'ended');
    settle(world, npc, call, 'done');
  },
  courierColdShoulder: (world, npc, call) => {
    moveStory(world, npc, ['refused'], 'ended');
    settleTopic(world, npc, 'askAid', 'refused');
    settle(world, npc, call, 'done');
  },
  courierCallEven: (world, npc, call) => {
    const peace = answerOf(call.vars) === 'yes';
    settlePlayerPlea(world, npc, 'truce', peace);
    if (!peace) angerCourier(world, npc);
  },
  courierFight: (world, npc) => angerCourier(world, npc),
  courierEnd: (world, npc, call) => {
    moveStory(world, npc, ['helped', 'paid', 'refused', 'owed'], 'ended');
    settleOpen(world, npc, call, 'done');
  },
  courierPayFavor: (world, npc, call) => {
    const amount = favorAmount(world, npc);
    if (amount > 0) transfer(world, npc, playerVehicle(world), amount);
    moveStory(world, npc, ['owed'], 'ended');
    settle(world, npc, call, 'done');
  },
  settleDone: (world, npc, call) => settle(world, npc, call, 'done'),
  settleRefused: (world, npc, call) => settle(world, npc, call, 'refused'),
};

export const PREPARES: Record<PrepareId, Prepare> = {
  vigilCall: (world) => prepareVigilCall(world),
  craterNews: (world) => craterNews(world),
  truceAnswer: (world, npc) => ({ answer: { kind: 'answer', option: answersPlea(world, npc, playerVehicle(world), 'truce') }, haul: haulVar(handedOver(world, playerVehicle(world), npc)) }),
  mercyAnswer: (world, npc) => ({ answer: { kind: 'answer', option: answersPlea(world, npc, playerVehicle(world), 'mercy') }, haul: haulVar(handedOver(world, playerVehicle(world), npc)) }),
  demandHaul: (world, npc) => ({ haul: haulVar(handedOver(world, playerVehicle(world), npc)) }),
  surrenderHaul: (world, npc) => ({ haul: haulVar(surrenderHaul(npc, playerVehicle(world))) }),
  yieldAnswer: (world, npc) => ({ answer: { kind: 'answer', option: answersSurrender(world, npc, playerVehicle(world)) ? 'yes' : 'no' } }),
  threatAnswer: (world, npc) => ({ answer: { kind: 'answer', option: answersThreat(world, npc) } }),
  warnAnswer: (world, npc) => ({ answer: { kind: 'answer', option: answerWarning(world, npc, playerVehicle(world)) } }),
  lootWarningTerms: (world, npc) => ({
    warnLine: { kind: 'line', line: talkOf(npc).warnOff },
    answer: { kind: 'answer', option: warnRefusalOf(world, npc, playerVehicle(world)) },
  }),
  npcTowTerms: (world, npc) => {
    const { site, fee } = npcTowTerms(world, npc);
    return { site: { kind: 'site', id: site.id }, fee: { kind: 'money', amount: fee } };
  },
  patchTerms: (world, npc): CallVars => {
    const deal = patchTerms(world, npc);
    return deal ? { deal } : {};
  },
  towOffer: (world, npc) => {
    const tow = offerBy(world, npc);
    if (!tow) throw new Error(`${npc.id} made no tow offer`);
    const { site, fee } = towData(tow);
    return { town: { kind: 'town', id: site }, fee: { kind: 'money', amount: fee } };
  },
  lastTownPrices: (world, npc) => {
    const memory = lastTownMemory(npc);
    if (!memory) throw new Error(`${npc.id} remembers no town`);
    const town = memory.shop;
    return { town: { kind: 'town', id: town }, prices: { kind: 'prices', town, goods: rememberedPrices(world, memory) } };
  },
  nearestRumor: (world, npc): CallVars => {
    const rumor = heardRumor(world, npc);
    if (!rumor) throw new Error(`${npc.id} knows no rumor`);
    return rumorVars(world, rumor);
  },
  taleNews: (world, npc): CallVars => {
    const site = siteRumor(world, npc);
    return site ? rumorVars(world, site) : { tip: { kind: 'tip', tip: tradeTip(npc) } };
  },
  tipTerms: (world, npc): CallVars => {
    const target = tipTarget(world, npc);
    if (!target) throw new Error(`${npc.id} has no wreck to sell`);
    return { price: { kind: 'money', amount: tipPrice() }, ...rumorVars(world, target) };
  },
  courierNews: (world, npc): CallVars => {
    const rumor = heardRumor(world, npc);
    return rumor ? rumorVars(world, rumor) : { tip: { kind: 'tip', tip: tradeTip(npc) } };
  },
  courierFavorTerms: (world, npc): CallVars => ({ price: { kind: 'money', amount: favorAmount(world, npc) } }),
  lastSighting: (world, npc) => {
    const search = requireOpenSearch(world);
    const memory = sightingOf(npc, search.target);
    const me = playerVehicle(world).pos;
    const seen = memory && { bearing: bearing(me, memory.fact.at), tiles: dist(me, memory.fact.at), turns: world.turn - memory.turn, heading: memory.fact.heading };
    return { sighting: { kind: 'sighting', driver: search.driver, seen } };
  },
  tradeTip: (_world, npc) => ({ tip: { kind: 'tip', tip: tradeTip(npc) } }),
  trucePrice: (_world, npc) => ({ price: { kind: 'money', amount: trucePrice(npc) } }),
  guardOffer: (world, npc) => ({
    answer: { kind: 'answer', option: guardTaken(world, npc) ? 'take' : 'decline' },
    price: { kind: 'money', amount: guardFee(world, npc) },
  }),
  courierNeed: (world, npc) => {
    const wanted = wantedAid(world, npc, true);
    return { aid: aidVar(wanted), price: { kind: 'money', amount: aidPrice(world, npc, wanted) } };
  },
  aidWanted: (world, npc) => {
    const wanted = wantedAid(world, npc);
    return { aid: aidVar(wanted), price: { kind: 'money', amount: aidPrice(world, npc, wanted) } };
  },
  aidAnswer,
  aidOffered: (world, npc) => ({ aid: aidVar(aidData(requirePendingAid(world, npc))) }),
  claimWreckBearing: (world, npc) => {
    const claim = requireClaimSeen(world, npc);
    const lead = leadOf(claim.at, playerVehicle(world).pos);
    return { bearing: { kind: 'bearing', rad: lead.angle }, distance: { kind: 'distance', tiles: lead.distance } };
  },
  nearestTown: (world, npc) => {
    const town = nearestKnownTown(world, npc);
    return { town: { kind: 'town', id: town.id }, way: wayVar(world, playerVehicle(world).pos, { kind: 'site', id: town.id }) };
  },
};

function wayVar(world: World, from: Vec, target: DirectionTarget): CallVar {
  return { kind: 'directions', steps: directionsTo(world, from, target) };
}

export function localsAt(town: string): LocalDef[] {
  return Object.values(LOCALS).filter((l) => l.town === town);
}

export function localOfQuest(questId: string): LocalDef | null {
  return Object.values(LOCALS).find((l) => l.quest === questId) ?? null;
}

export function boardFull(world: World): boolean {
  return world.player.contracts.length >= CONTRACTS.maxActive;
}

export function townOffers(world: World): Contract[] {
  const town = shopAt(world);
  if (!town) throw new Error('Not parked at a town, so no board is in reach');
  return shopState(world, town).contracts.filter((c) => !isExpired(world, c));
}

export function townWork(world: World): Contract | null {
  const open = townOffers(world).filter((c) => !haulBlocked(world, c) && !(c.kind === 'escort' && escortBlocked(world, c)) && searchRefusal(world, c) === null);
  if (boardFull(world)) return null;
  return open.reduce<Contract | null>((best, c) => (best === null || c.reward > best.reward ? c : best), null);
}

export function takeTownWork(world: World): void {
  const offer = townWork(world);
  if (!offer) throw new Error('The board offers no work to take');
  takeContract(world, offer.id);
}

export function learnNote(world: World, id: NoteId): void {
  if (!isNoteId(id)) throw new Error(`No note ${id}`);
  if (holdsNote(world, id)) return;
  world.player.notes.push({ id, turn: world.turn });
  world.events.push({ t: 'note', id });
}

export function holdsNote(world: World, id: NoteId): boolean {
  return world.player.notes.some((n) => n.id === id);
}

function nearWreck(v: Vehicle, claim: ClaimContract): boolean {
  return dist(v.pos, claim.at) <= PERK_NUMBERS.rumorMill.radius;
}

export function claimSeenBy(world: World, npc: Vehicle): ClaimContract | null {
  const held = world.player.contracts.filter((c): c is ClaimContract => c.kind === 'claim');
  return held.find((c) => c.rival !== npc.id && nearWreck(npc, c) && claimPartHeld(world, c) === 'stock') ?? null;
}

function requireClaimSeen(world: World, npc: Vehicle): ClaimContract {
  const claim = claimSeenBy(world, npc);
  if (!claim) throw new Error(`${npc.id} has seen no claimed wreck`);
  return claim;
}

function rivalNearWreck(world: World, claim: ClaimContract): boolean {
  const rival = rivalRunning(world, claim);
  return rival !== null && nearWreck(rival, claim);
}

function noteClaimLead(world: World, npc: Vehicle): void {
  const claim = requireClaimSeen(world, npc);
  const driver = npc.brain?.driver;
  if (!driver) throw new Error(`${npc.id} has no driver to give a lead`);
  if (claim.leads.some((l) => l.driver === driver)) return;
  claim.leads.push({ turn: world.turn, from: { ...playerVehicle(world).pos }, driver });
  world.events.push({ t: 'claimLead', contract: claim.id, driver });
}

function requireEscort(world: World): EscortContract {
  const job = heldEscort(world);
  if (!job) throw new Error('The player holds no escort job');
  return job;
}
