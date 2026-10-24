
import type { PartHit, Side } from "./armor";
import type { FireBlock } from "./combat";
import type { GearLevel, TraitId } from "../data/npcs";
import type { Band } from "../data/npc-behavior";
import type { PropKind, Terrain } from "./terrain";
import type { Vec } from "./vec";
import type { LineId, TopicId } from "../data/dialogue";
import type { PersonalityId } from "../data/personalities";
import type { DecisionOptions } from "../data/npcs";
import type { Contract, PastContract, ShopState } from "./market";
import type { TruckPaint } from "../data/chassis";
import type { Rng } from "./rng";
import type { PerkId } from "../data/skills";
import type { NoteId } from "../data/locals";
import type { UtilityEffectType } from "../data/parts";
import type { QuestLanguage, QuestValue } from "../data/quests";

export type PatchDeal = DecisionOptions["patchDeal"];

export type NpcFactionId = "bowl" | "nose" | "guidestar" | "administrators" | "scrapjaw" | "kiln" | "sunward" | "marshals" | "independent";
export type StandingFactionId = Exclude<NpcFactionId, "independent">;
export type Faction = "player" | NpcFactionId;
export type WrongDeed = "attacked" | "robbed" | "stole";
export type HelpDeed = "aided" | "towed" | "patched" | "defended";
export type DeedId = WrongDeed | HelpDeed | "killed" | "contract";
export type StandingCause = { kind: 'deed'; deed: DeedId } | { kind: 'drift'; toward: 'up' | 'down' } | { kind: 'settled' };
export type Deed = { subject: string; faction: StandingFactionId; deed: DeedId; delta: number; turn: number };
export type SkillId = "driving" | "perception" | "machining" | "toughness" | "social";
export type XpSource =
  | "roughTiles" | "ram" | "escape"
  | "hit" | "contact" | "discover"
  | "fieldJob" | "patch" | "search"
  | "heat" | "damage" | "knockout"
  | "profit" | "deal" | "call" | "honk" | "contract" | "freeTow" | "aid";

export type PartInstance = {
  id: string;
  defId: string;
  hp: number;
  gun?: GunState;
  charge?: ChargeState;
  wear: number;
  rebuilt?: true;
};

export type GunState = { cooldown: number; ammo: number; reloadWork: number };

export type ChargeState = { reload: number; armed?: true };

export type Rot = 0 | 1 | 2 | 3;

export type GridItem =
  | {
      id: string;
      x: number;
      y: number;
      rot: Rot;
      kind: "part";
      part: PartInstance;
    }
  | {
      id: string;
      x: number;
      y: number;
      rot: Rot;
      kind: "good";
      good: string;
    }
  | {
      id: string;
      x: number;
      y: number;
      rot: Rot;
      kind: "parcel";
      contract: string;
    };

export type Aim = "body" | string;
export type WeaponOrder = { targetId: string; aim: Aim };
export type UtilityOrder =
  | { kind: 'self' }
  | { kind: 'point'; pos: Vec }
  | { kind: 'disarm' };

export type Pose = { x: number; y: number; heading: number; bend?: number };

export type MoveOrder =
  | { kind: "through"; dest: Vec; pace?: number }
  | { kind: "stopAt"; dest: Vec }
  | { kind: "brake" };

export type SalvageStock = {
  id: string;
  pos: Vec;
  radius: number;
  goods: Record<string, number>;
  parts: PartInstance[];
  fuel?: number;
  supplies?: number;
  pile?: Pile;
  emptySince?: number;
  hidden: HiddenLoot;
};

export type HiddenLoot = { goods: Record<string, number>; parts: PartInstance[]; fuel: number; supplies: number };

export type PileClaim = { by: string; until: number; warned: string[] };
export type Pile = { until: number; fromPlayer: boolean; basis: Record<string, number>; claim?: PileClaim };

export type RefitMove = {
  itemId: string;
  from: { x: number; y: number; rot: Rot };
  to: { x: number; y: number; rot: Rot };
};

export type RefitPickup =
  | { from: 'stock'; stockId: string; partId: string; itemId: string; to: RefitMove['to'] }
  | { from: 'truck'; vehicleId: string; partId: string; itemId: string; to: RefitMove['to'] };

export type RefitJob = {
  kind: 'refit';
  moves: RefitMove[];
  pickup: RefitPickup | null;
  turnsLeft: number;
  total: number;
};

export type Job =
  | {
      kind: "repair";
      partId: string;
      parts: number;
      turnsLeft: number;
      total: number;
      auto?: true;
    }
  | { kind: "search"; stockId: string; turnsLeft: number; total: number }
  | { kind: "strip"; partId: string; turnsLeft: number; total: number }
  | { kind: "weld"; turnsLeft: number; total: number }
  | { kind: "firstAid"; turnsLeft: number; total: number }
  | { kind: "survey"; contractId: string; site: string; turnsLeft: number; total: number }
  | { kind: "business"; siteId: string; deal: BusinessDeal; turnsLeft: number; total: number }
  | RefitJob;

export type BusinessDeal = "resupply" | "sell" | "trade";

export type Contact = {
  vehicleId: string;
  center: Vec;
  radius: number;
  sources: ("sound" | "dust" | "radio" | "beacon" | "mark" | "flare")[];
  loudness: number | null;
};

export type DustCloud = {
  id: string;
  source: string;
  pos: Vec;
  vel: Vec;
  age: number;
  range: number;
  screen?: true;
};

export type SmokeCloud = { id: string; source: string; pos: Vec; r: number; turnsLeft: number };
export type GroundField = { id: string; kind: 'caltrops' | 'oil'; source: string; pos: Vec; r: number; turnsLeft: number; hit: string[] };
export type Flare = { id: string; source: string; pos: Vec; r: number; turnsLeft: number };
export type HarpoonLine = { id: string; from: string; fromPart: string; to: string; toPart: string; length: number; turnsLeft: number };

export type WeatherEvent =
  | {
      id: string;
      kind: "storm";
      pos: Vec;
      radius: number;
      vel: Vec;
      turnsLeft: number;
      born: number;
    }
  | { id: string; kind: "heatwave" | "overcast"; turnsLeft: number };


export type GoalReason =
  | 'arrived' | 'calledOut' | 'avoidCostlyFight' | 'bringAid' | 'buyCargo' | 'cannotAffordCargo' | 'cannotDrive' | 'cargoFullLoad'
  | 'cargoFullLoot' | 'cargoFullSalvage' | 'choseNew' | 'claimedWreck' | 'claimOver' | 'claimRun' | 'collectSalvage' | 'combatStopsLooting' | 'combatStopsRepair'
  | 'combatStopsSearch' | 'contactGone' | 'damagedThreatened' | 'defendLoot' | 'deliverCargo' | 'droppedTow'
  | 'escapeAttacker' | 'escapeThreat' | 'explore' | 'exploredSpot' | 'fightBack' | 'fightHostile' | 'finishedRepairs'
  | 'finishedService' | 'fitAgain' | 'followLeader' | 'foundNothing' | 'heardHostile' | 'helpStranded'
  | 'homeToLieUp' | 'idle' | 'inCombat' | 'keepWord' | 'leftLeader' | 'legacy' | 'lieUp' | 'loadCargo'
  | 'lootClaimed' | 'lootDowned' | 'lootGone' | 'lootOnTheWay' | 'lootRobbed' | 'lootTaken' | 'lostSalvage'
  | 'lostTarget' | 'lowFuel' | 'lowSupplies' | 'meetingOff' | 'needsRepairs' | 'noExplorePoint' | 'noGun'
  | 'noHostile' | 'noProgress' | 'nothingToDo' | 'nothingToLoot' | 'nowhereToRun' | 'patchOff' | 'patchParts'
  | 'patchTruck' | 'patrolCamp' | 'patrolTown' | 'patrolledRoad' | 'pickUpAid' | 'prowl' | 'prowledRoad' | 'pullOver'
  | 'raid' | 'reachedGround' | 'refitted' | 'refuseThreat' | 'retreatHome' | 'robCargo' | 'salvageExhausted'
  | 'salvageGone' | 'searchSite' | 'searchSpot' | 'sellCargo' | 'soldCargo' | 'spottedHeard' | 'strandedRobbery'
  | 'takeClaimedLoot' | 'takeHandedCargo' | 'towNotNeeded' | 'towOff' | 'towOfferLeft' | 'towPlayer' | 'towStranded'
  | 'towUnanswered' | 'towedPlayer' | 'towedStranded' | 'tripToSite' | 'truckGotAway' | 'unfitToHunt' | 'waitPatch'
  | 'waitTow' | 'waitTowAnswer' | 'warnedOff' | 'answeredCall'
  | 'avoidRanFrom' | 'breakOffFight' | 'cannotWearDown' | 'holdFull' | 'leftPost' | 'lootWontFit' | 'ranFromIt' | 'salvageOutOfReach'
  | 'takeSpilledCargo' | 'watchedRoad' | 'cornered' | 'defeated'
  | 'awaitEscort' | 'escortHired' | 'fightOverLoot' | 'looterWontLeave' | 'warningUnanswered' | 'defendPromisedLoot' | 'keepLoot' | 'searchOldHulks' | 'searchOldBoats' | 'searchOldRuin' | 'springOnPrey'
  | 'musterCrew' | 'crewLeader' | 'hiredGuard'
  | 'restHollow' | 'rideVigil' | 'keepVigil' | 'rideHome' | 'huntRoad' | 'dragToLight' | 'leaveCrater' | 'orderFell' | 'meetStranger'
  | 'sizingUp' | 'poorLoad' | 'sizedUpBy'
  | 'bountyHunt' | 'atPost' | 'caseClosed' | 'huntGaveUp';

export type SimNote =
  | { id: 'engineHot' }
  | { id: 'engineOverheat'; hp: number }
  | { id: 'engineDoused'; supplies: number }
  | { id: 'overdriveCutOut' }
  | { id: 'outOfSupplies'; health: number }
  | { id: 'noRoomFuel'; fuel: number }
  | { id: 'noRoomSupplies'; supplies: number }
  | { id: 'tankLeak'; fuel: number }
  | { id: 'filledSupplies'; site: string }
  | { id: 'hazard' }
  | { id: 'core' }
  | { id: 'spawnBlocked'; template: string };

export type MoneyReason = { kind: 'contract' } | { kind: 'failedHaul' } | { kind: 'towing'; vehicle: string } | { kind: 'outpost' } | { kind: 'holdUp'; vehicle: string };

export type PlacementRefusal = { id: 'noFit' } | { id: 'inTheWay' } | { id: 'armorOnly' };

export type Refusal =
  | PlacementRefusal
  | { id: 'badLayout'; cause: PlacementRefusal }
  | { id: 'itemGone' }
  | { id: 'refitRunning' }
  | { id: 'gatesShut' }
  | { id: 'twoInTheWay' }
  | { id: 'refitItemMoved' }
  | { id: 'builtInFixed' }
  | { id: 'parcelKept' }
  | { id: 'salvageOutOfReach' }
  | { id: 'salvagePartGone' }
  | { id: 'builtInStays' }
  | { id: 'emptyRackFirst' }
  | { id: 'truckOutOfReach' }
  | { id: 'truckPartGone' }
  | { id: 'looting'; by: string; place: 'here' | 'wreck' | 'truck' }
  | { id: 'needsSpotter' }
  | { id: 'needsBasic'; skill: SkillId }
  | { id: 'lookOverFar' }
  | { id: 'lookOverUnseen' }
  | { id: 'lookOverKnown' }
  | { id: 'lookOverRunning' }
  | { id: 'lookOverDown' }
  | { id: 'cannotAct' }
  | { id: 'noTruck' }
  | { id: 'unseen' }
  | { id: 'notActive'; state: 'dead' | 'knockedOut' }
  | { id: 'topRank'; skill: SkillId }
  | { id: 'needsXp'; cost: number; have: number }
  | { id: 'noMoney' }
  | { id: 'notAtDesk' }
  | { id: 'payBountiesFirst'; faction: StandingFactionId }
  | { id: 'noCargoRoom' }
  | { id: 'unhurt' }
  | { id: 'noSupplies' }
  | { id: 'noStock' }
  | { id: 'onOrder' }
  | { id: 'theyHaveNoRoom' }
  | { id: 'noSupplyRoom' }
  | { id: 'inCombat' }
  | { id: 'stopFirst' }
  | { id: 'busy'; job: Job['kind'] }
  | { id: 'atRepairCap' }
  | { id: 'noParts' }
  | { id: 'utilityPassive'; part: string }
  | { id: 'utilityOrder'; part: string; order: 'point' | 'self' }
  | { id: 'utilityBlocked'; part: string; block: UtilityBlock };

export type UtilityBlock = FireBlock | 'armed' | 'unarmed' | 'fuel';

export type UnitId = 'part';

export type DriverResources = {
  money: number;
  fuel: number;
  supplies: number;
  health: number;
};

export type NpcActivity = {
  kind:
    | 'scavenge' | 'prowl' | 'sell' | 'trade' | 'resupply' | 'raid' | 'fight' | 'flee' | 'wait' | 'investigate' | 'tow' | 'loot' | 'repair' | 'patch'
    | 'meet' | 'retreat' | 'rearm' | 'patrol' | 'travel' | 'explore' | 'follow' | 'claim' | 'muster' | 'sizeUp' | 'pursue';
  targetId: string | null;
  destination: Vec | null;
  phase: "travel" | "act";
  reason: GoalReason;
  purchase?: { good: string; sellShop: string };
  shipment?: Shipment;
  perceived?: number;
  worn?: { turn: number; condition: number };
  demands?: boolean;
  until?: number;
  watchUntil?: number;
  leg?: { from: Vec; turn: number };
  claim?: string;
  left?: string[];
  posted?: true;
  asked?: string[];
  heard?: Vec;
};

export type Shipment = { good: string; from: string; to: string };

export type RoadNewsKind = 'robbed' | 'destroyed' | 'knockedOut';

export type RoadNews = { turn: number; kind: RoadNewsKind; good: string; units: number; from: string; to: string };

export type NpcBrain = {
    templateId: string;
    driver: string;
    traits: TraitId[];
    personality: PersonalityId;
    goals: NpcActivity[];
    noticed: Record<string, number>;
    tracks: Record<string, Track>;
    hurt: number;
    fullAt?: number;
    unfit?: string[];
    attackers: Record<string, boolean>;
    goal: Vec | null;
    home: Vec;
    stepIndex: number;
    lastPos?: Vec;
    stalled?: number;
    stuck?: number;
    progress?: { key: string; since: number; at: Vec };
    recovery?: number;
    recoveryGoal?: Vec;
    ramChoice?: string;
    ramTarget?: string;
    fightTurn?: 1 | -1;
    targetSeen?: { id: string; turn: number; pos: Vec; heading: number; speed: number };
    whim?: { kind: 'keep' | 'rush' | 'halt' | 'veer'; until: number; angle: number };
    farRoute?: { dest: Vec; points: Vec[]; offRoad: boolean; night?: true };
    musteredAt?: number;
    memories: Memory[];
};

export type TrackChoice = 'keep' | 'fight' | 'flee' | 'investigate';
export type Track = { at: Vec; turn: number; sighted: boolean; seenSince: number | null; choice: TrackChoice | null; chosenInSight: boolean };

export type MemoryFact =
  | { kind: 'prices'; shop: string; pressure: Record<string, number> }
  | { kind: 'stripped'; stock: string }
  | { kind: 'wronged'; by: string; deed: WrongDeed }
  | { kind: 'helped'; by: string; deed: HelpDeed }
  | { kind: 'sighting'; vehicle: string; at: Vec; heading: number }
  | { kind: 'witnessed'; crime: string; by: string; victim: string; offense: CrimeOffense; at: Vec; heading: number };
export type SightingFact = Extract<MemoryFact, { kind: 'sighting' }>;
export type Memory = { turn: number; fact: MemoryFact };

export type Vehicle = {
  id: string;
  faction: Faction;
  chassisId: string;
  items: GridItem[];
  pos: Vec;
  heading: number;
  bend?: number;
  speed: number;
  stormExposure: Record<string, number>;
  strandedTurns?: number;
  strandedAt?: Vec;
  stalledUntil?: number;
  order: MoveOrder | null;
  direct: boolean;
  weaponOrders: Record<string, WeaponOrder>;
  utilityOrders: Record<string, UtilityOrder>;
  shutDown?: { from: number; until: number };
  trail: Pose[];
  brain: NpcBrain | null;
  resources: DriverResources | null;
  lastHitBy: string | null;
  job: Job | null;
  defeat?: Defeat;
};

export type Defeat = { phase: 'out' | 'retreat'; turns: number; unseen: number; foes: string[]; gaveUp: boolean };

export type LandmarkLook = Exclude<PropKind, "rock">;

export type Hulk = { chassisId: string; yaw: number; bend?: number };

export type Obstacle =
  | { id: string; pos: Vec; r: number; kind: "rock" | "wreck" | "building" | "water" | "site"; hulk?: Hulk }
  | { id: string; pos: Vec; r: number; kind: "landmark"; look: LandmarkLook; yaw: number };

export type BrokenProp = { obstacle: Obstacle; turn: number };

export type StateKindId = 'feud' | 'backedOff' | 'tow' | 'turnedDown' | 'towPromise' | 'answering' | 'patch' | 'truce' | 'grievance' | 'plea' | 'helpRefused' | 'trade' | 'handover' | 'revenge' | 'escort' | 'strayFire' | 'aid' | 'combat' | 'lootWarning' | 'crew' | 'hire' | 'cavalcade' | 'offering' | 'drag' | 'lookOver' | 'sizedUp' | 'bountyStop';
export type StateEnding = 'expired' | 'fulfilled' | 'broken';
export type Plea = 'truce' | 'mercy';
export type StateData =
  | { kind: 'tow'; site: string; fee: number; waived: number; hitched: boolean }
  | { kind: 'feud'; robbery: boolean }
  | { kind: 'towPromise'; site: string; fee: number }
  | { kind: 'plea'; plea: Plea; answered: boolean }
  | { kind: 'escort'; site: string | null; fee: number }
  | { kind: 'crew'; camp: string }
  | { kind: 'hire'; fee: number }
  | { kind: 'patch'; deal: PatchDeal; parts: number; partIds: string[]; price: number; work: number; workLeft: number }
  | { kind: 'strayFire'; damage: number }
  | { kind: 'aid'; giver: 'player' | 'npc'; fuel: number; supplies: number; price: number; free: boolean; agreed: boolean; started: boolean; work: number; workLeft: number }
  | { kind: 'lootWarning'; targetId: string; answer: LootWarnAnswer | null }
  | { kind: 'offering'; core: Vec; closest: number }
  | { kind: 'drag'; drop: Vec }
  | { kind: 'bountyStop'; owed: number; answered: boolean }
  | { kind: 'none' };
export type LootWarnAnswer = 'comply' | 'refuse' | 'fightBack';
export type NpcState = {
  id: string;
  kind: StateKindId;
  holder: string;
  other: string;
  turnsLeft: number | null;
  born: number;
  data: StateData;
};

export type Octant = 'east' | 'southEast' | 'south' | 'southWest' | 'west' | 'northWest' | 'north' | 'northEast';
export type Span = 'near' | 'fair' | 'far';
export type Cue =
  | { kind: 'site'; id: string }
  | { kind: 'deck'; id: string }
  | { kind: 'prop'; look: LandmarkLook }
  | { kind: 'fork'; nth: number }
  | { kind: 'none' };
export type RoadName = { kind: 'to'; site: string } | { kind: 'heading'; octant: Octant };
export type TurnSide = 'left' | 'right' | 'keepLeft' | 'keepRight';
export type DirectionTarget = { kind: 'site'; id: string } | { kind: 'spot'; pos: Vec; clue: 'wreck' };
export type DirectionStep =
  | { do: 'join'; octant: Octant; span: Span }
  | { do: 'follow'; road: RoadName; heading: Octant | null; span: Span }
  | { do: 'turn'; side: TurnSide; at: Cue; road: RoadName; span: Span }
  | { do: 'arrive'; site: string; area: boolean }
  | { do: 'leave'; at: Cue; octant: Octant; span: Span }
  | { do: 'straight'; octant: Octant; span: Span }
  | { do: 'search'; clue: { kind: 'site'; id: string } | { kind: 'wreck' }; rough: boolean }
  | { do: 'askAgain' }
  | { do: 'noRoad'; octant: Octant; span: Span };

export type CallVar =
  | { kind: "town"; id: string }
  | { kind: "site"; id: string }
  | { kind: "money"; amount: number }
  | { kind: "count"; n: number; unit: UnitId }
  | { kind: "deal"; deal: PatchDeal; patcher: "player" | "npc"; price: number; parts: number; turns: number }
  | { kind: "haul"; goods: Record<string, number>; parts: string[] }
  | { kind: "aid"; fuel: number; supplies: number }
  | { kind: "prices"; town: string; goods: { good: string; buy: number; sell: number }[] }
  | { kind: "tip"; tip: { shop: string; good: string; dear: boolean } | null }
  | { kind: "sighting"; driver: string; seen: { bearing: number; tiles: number; turns: number; heading: number } | null }
  | { kind: "bearing"; rad: number }
  | { kind: "distance"; tiles: number }
  | { kind: "answer"; option: string }
  | { kind: "line"; line: LineId }
  | { kind: "directions"; steps: DirectionStep[] };
export type CallVars = Record<string, CallVar>;

export type Repeat = { count: number; turn: number };

export type Call = { with: string; topic: TopicId | null; node: string; vars: CallVars; line: { line: LineId; vars: CallVars } };


export type QuestVars = Record<string, QuestValue>;
export type QuestSession = { quest: string; checkpoint: string; seed: number };
export type QuestLine = { text: string; tags: string[] };
export type QuestCheck = { skill: SkillId; level: number };
export type QuestLive = { quest: string; lang: QuestLanguage; ink: string; lines: QuestLine[]; choices: string[]; costs: (number | null)[]; checks: (QuestCheck | null)[] };
export type QuestState = { world: QuestVars; local: Record<string, QuestVars>; session: QuestSession | null; live: QuestLive | null };
export type TopicOutcome = "agreed" | "refused" | "done";

export type EncounterId = 'tale' | 'tip' | 'challenge' | 'courier';
export type PendingEncounter = { encounter: EncounterId; driver: string; until: number };
export type CourierBeat = 'asked' | 'promised' | 'helped' | 'paid' | 'refused' | 'owed' | 'ended';
export type CourierTopic = 'courierShort' | 'courierThanks' | 'courierSquare' | 'courierCold' | 'courierGrudge' | 'courierFavor';
export type CourierStory = { driver: string; beat: CourierBeat; turn: number; aidValue: number; free: boolean };
export type EncounterLog = { next: number; pending: PendingEncounter | null; story: CourierStory | null };

export type Player = {
  vehicleId: string;
  money: number;
  standing: Record<StandingFactionId, number>;
  deeds: Deed[];
  xp: number;
  ranks: Record<SkillId, number>;
  xpToday: Record<SkillId, number>;
  xpDay: number;
  repeats: Record<string, Repeat>;
  xpBySource: Record<XpSource, number>;
  perks: PerkId[];
  paint: TruckPaint;
  health: number;
  fuel: number;
  supplies: number;
  autoFire: boolean;
  autoRepair: boolean;
  townPatched: boolean;
  engineHeat: number;
  overdrive: boolean;
  headlights: boolean;
  discovered: string[];
  scavenged: string[];
  storage: PartInstance[];
  contracts: Contract[];
  pastContracts: PastContract[];
  costBasis: Record<string, number>;
  knockouts: number;
  state: "active" | "knockedOut" | "dead";
  knockoutTurns: number;
  god: boolean;
  fullLog: boolean;
  frozen: boolean;
  beacon: boolean;
  call: Call | null;
  talked: Record<string, Partial<Record<TopicId, TopicOutcome>>>;
  quests: QuestState;
  explored: Uint8Array;
  visible: number[];
  contacts: Contact[];
  clouds: string[];
  marked: { vehicleId: string; until: number }[];
  rumored: string[];
  notes: { id: NoteId; turn: number }[];
  hostilesSeen: string[];
  encounters: EncounterLog;
};

export type ShotRound = {
  hit: boolean;
  crit: boolean;
  offset: number;
  struck: string | null;
  hits: PartHit[];
  blast: VehicleHits[];
  burst: Vec | null;
};
export type VehicleHits = { vehicle: string; hits: PartHit[] };

export type PassReason = 'nothing' | 'busy' | 'outgunned' | 'poorLoad' | 'chance';

export type ShopMoneyKind = 'fuel' | 'supplies' | 'repair' | 'cargoBuy' | 'cargoSale' | 'partSale' | 'partCredit' | 'campSale' | 'patrolPay' | 'dispatchPay' | 'claimReward' | BountyMoneyKind;
export type BountyMoneyKind = 'bountyFund' | 'bountyCoffers' | 'bountyOffice' | 'bountyEscrow';

export type CrewAskCause = 'joined' | 'grudge' | 'weak' | 'busy' | 'declined';
export type CrewLeftCause = 'fled' | 'knockedOut' | 'hostile';
export type GuardEnd = 'expired' | 'dismissed' | 'knockedOut' | 'hostile';

export type EscortEnd = 'arrived' | 'strayed' | 'hostile' | 'knockedOut' | 'stuck' | 'apartAtArrival' | 'lost';

export type GameEvent =
  | { t: 'activity'; vehicle: string; previous: NpcActivity['kind'] | null; activity: NpcActivity['kind'] | null; reason: GoalReason }
  | { t: 'stall'; vehicle: string; goal: NpcActivity['kind'] | null; reason: GoalReason }
  | { t: 'collision'; a: string; b: string; hitsA: PartHit[]; hitsB: PartHit[] }
  | { t: 'empty'; vehicle: string; weapon: string }
  | { t: 'shot'; shooter: string; weapon: string; target: string; aim: Aim; chance: number; damageChance: number; side: Side; rounds: ShotRound[] }
  | { t: 'partDisabled'; vehicle: string; part: string }
  | { t: 'cargoSpilled'; vehicle: string; part: string; pile: string | null; units: number }
  | { t: 'destroyed'; vehicle: string; by: string }
  | { t: 'npcKnockout'; vehicle: string; by: string }
  | { t: 'npcWake'; vehicle: string }
  | { t: 'arrived'; vehicle: string }
  | { t: 'spawn'; vehicle: string }
  | { t: 'despawn'; vehicle: string }
  | { t: 'hostile'; vehicle: string; against: string }
  | { t: 'joins'; vehicle: string; against: string; victim: string }
  | { t: 'standing'; faction: StandingFactionId; band: Band; cause: StandingCause }
  | { t: 'preyPassed'; vehicle: string; prey: string; reason: PassReason }
  | { t: 'practice'; source: XpSource; amount: number; difficulty: number | null; target: string; xp: number }
  | { t: 'skillUp'; skill: SkillId; level: number }
  | { t: 'money'; amount: number; reason: MoneyReason }
  | { t: 'contract'; contract: Contract; outcome: 'accepted' | 'expiring' | 'fulfilled' | 'done' | 'failed' | 'lapsed' | 'released' | 'apart'; cause?: 'rival' }
  | { t: 'contract'; contract: Contract; outcome: 'found' | 'surveyed'; site: string; cause?: undefined }
  | { t: 'claimRival'; contract: string; vehicle: string }
  | { t: 'claimLead'; contract: string; driver: string }
  | { t: 'discover'; location: string }
  | { t: 'encounter'; vehicle: string; encounter: EncounterId | CourierTopic }
  | { t: 'note'; id: NoteId }
  | { t: 'supply'; what: string; note: SimNote }
  | { t: 'death'; cause: DeathCause }
  | { t: 'coreBurn'; vehicle: string }
  | { t: 'sunwardFallen' }
  | { t: 'knockout' }
  | { t: 'wake' }
  | { t: 'scrapPatch'; fuel: number }
  | { t: 'engineCredit'; part: string }
  | { t: 'townPatch' }
  | { t: 'siteEvent'; shop: string; kind: 'surge' | 'breakdown'; recipe: string }
  | { t: 'towOffer'; by: string; town: string; fee: number }
  | { t: 'towHitched'; by: string; client: string; site: string }
  | { t: 'towDone'; by: string; client: string; fee: number }
  | { t: 'escortPaid'; by: string; client: string; fee: number }
  | { t: 'guardPaid'; by: string; guard: string; fee: number }
  | { t: 'shopMoney'; vehicle: string; amount: number; kind: ShopMoneyKind }
  | { t: 'transfer'; from: string; to: string; amount: number }
  | { t: 'holdUp'; robber: string; victim: string; paid: 'cargo' | 'money'; value: number }
  | { t: 'escortHired'; by: string; client: string; site: string; fee: number }
  | { t: 'escortRefused'; by: string; client: string }
  | { t: 'escortEnded'; contract: string; client: string; end: EscortEnd }
  | { t: 'crewAsked'; leader: string; member: string; answer: 'join' | 'decline'; cause: CrewAskCause }
  | { t: 'crewFormed'; leader: string; members: string[] }
  | { t: 'crewFailed'; leader: string }
  | { t: 'crewLeft'; leader: string; member: string; cause: CrewLeftCause }
  | { t: 'crewLed'; leader: string; fallen: string }
  | { t: 'crewDisbanded'; leader: string }
  | { t: 'guardHired'; merc: string; fee: number; until: number }
  | { t: 'guardEnded'; merc: string; end: GuardEnd }
  | { t: 'towDropped'; by: string; client: string; reason: 'refused' | 'unhitched' | 'danger' | 'stranded' | 'gone' | 'blocked' }
  | { t: 'stateEnded'; state: NpcState; ending: StateEnding }
  | { t: 'lookedOver'; by: string; target: string }
  | { t: 'job'; vehicle: string; job: Job; outcome: 'started' | 'done' | 'cancelled' }
  | { t: 'breakdown'; vehicle: string; part: string }
  | { t: 'searched'; stock: string }
  | { t: 'weather'; event: WeatherEvent; outcome: 'started' | 'ended' }
  | { t: 'say'; speaker: string; line: LineId; vars: CallVars }
  | { t: 'call'; with: string; outcome: 'opened' | 'ended' }
  | { t: 'honk'; vehicle: string }
  | { t: 'aidStarted'; giver: string; receiver: string }
  | { t: 'patch'; patcher: string; client: string; outcome: 'started' | 'lapsed' | 'broken' }
  | { t: 'patch'; patcher: string; client: string; outcome: 'done'; price: number }
  | { t: 'aid'; giver: string; receiver: string; fuel: number; supplies: number; paid: number }
  | { t: 'plea'; from: string; to: string; plea: Plea; accepted: boolean | null }
  | { t: 'lootArgument'; warner: string; looter: string; place: 'wreck' | 'pile' | 'spot' | 'truck'; end: 'yielded' | 'backedOff' | 'fight' }
  | { t: 'info'; note: SimNote; debug?: true }
  | { t: 'utility'; vehicle: string; part: string; effect: UtilityEffectType | 'claymore'; point: Vec | null }
  | { t: 'lineTorn'; line: string; vehicle: string; part: string; damage: number }
  | { t: 'pulse'; vehicle: string; pos: Vec; hit: string[] }
  | { t: 'claymore'; vehicle: string; part: string; other: string; pos: Vec; hits: PartHit[]; selfHits: PartHit[] }
  | { t: 'claymoreCookOff'; vehicle: string; part: string; pos: Vec; hits: PartHit[] }
  | { t: 'caltrops'; vehicle: string; field: string; source: string; hits: PartHit[] }
  | { t: 'found'; vehicle: string; stock: string; goods: Record<string, number>; parts: string[]; fuel: number; supplies: number }
  | { t: 'outpostReached'; milestone: number; pay: number; wrecks: number }
  | { t: 'roadOpened'; stretch: number }
  | { t: 'runLost'; stretch: number; cause: RunLossCause }
  | { t: 'bountyFiled'; case: string; target: string; reporter: string; offense: CrimeOffense; victim: string; site: string; owed: number }
  | { t: 'bountyClosed'; case: string; target: string; status: Exclude<CaseStatus, 'open'>; amount: number; collector: string | null }
  | { t: 'settlement'; faction: StandingFactionId; price: number }
  | { t: 'asked'; by: string; of: string; target: string; told: boolean };

export type GameModeId = 'roaming' | 'furyRoad';
export type ModeRules = { traffic: boolean; looting: boolean; npcKnockouts: boolean; playerKnockouts: boolean; yielding: boolean; radio: boolean; rescue: boolean; roadWrecks: boolean; run: boolean; standing: boolean; bounties: boolean };
export type MapKind = 'icarus' | 'highway';
export type RunLossCause = 'wrecked' | 'abandoned' | 'haulerLost';
export type HaulerFacts = { id: string; alarmUntil: number | null };
export type OutpostFacts = { milestone: number; stock: PartInstance[]; paid: boolean; trucksSold: string[] };
export type WaveGroup = {
  id: string;
  stretch: number;
  from: GroupSide;
  at: number;
  templates: string[];
  money: number;
  elite: boolean;
  level: GearLevel;
  spawned: boolean;
  vehicles: string[];
  wrecked: number;
  counted: string[];
  retryUntil: number | null;
};
export type GroupSide = 'ahead' | 'left' | 'right';
export type FuryRoadRun = { window: number; outposts: OutpostFacts[]; groups: WaveGroup[]; earned: number; wrecks: number; waitingAt: number | null; hauler: HaulerFacts };
export type WorldSettings = { damage: number; fuelUse: number; supplyUse: number; enemyGearGrowth: number };
export type WorldSetup = { mode: GameModeId; settings: WorldSettings };

export type DeathCause = 'core' | 'injury';
export type VigilCalls = { count: number; turn: number };
export type SunwardHunt = { party: string[]; grounds: Vec[]; prey: string | null; over: boolean; breaks: number };
export type SunwardNight = { dusk: number; roster: string[]; beaten: string[]; calls: Record<string, VigilCalls>; hunt: SunwardHunt | null; shouted: string[]; offered: string[] };
export type SunwardFacts = { collapsed: number | null; night: SunwardNight | null; lastHunt: number | null };

export type Crater = { id: string; pos: Vec; radius: number; turn: number };

export type CrimeOffense = 'attacked' | 'robbed' | 'killed';
export type CaseStatus = 'open' | 'paid' | 'collected' | 'lapsed';
export type CaseIssuer = { kind: 'faction'; faction: StandingFactionId } | { kind: 'driver'; id: string };
export type CaseLead = { at: Vec; turn: number; heading: number | null };
export type CrimeCase = {
  id: string;
  crime: string;
  offense: CrimeOffense;
  target: string;
  victim: string;
  issuer: CaseIssuer;
  reporters: string[];
  site: string;
  at: Vec;
  turn: number;
  filed: number;
  owed: number;
  escrow: number;
  status: CaseStatus;
  closed: number | null;
  hunter: string | null;
  retryAt: number | null;
  offered: number | null;
  lead: CaseLead;
};

export type World = {
  seed: number;
  rngState: number;
  marketRng: Rng;
  nameRng: Rng;
  turn: number;
  size: number;
  nextId: number;
  vehicles: Vehicle[];
  obstacles: Obstacle[];
  broken: BrokenProp[];
  craters: Crater[];
  salvage: SalvageStock[];
  shops: Record<string, ShopState>;
  roadNews: RoadNews[];
  terrain: Terrain;
  mapHash: string;
  setup: WorldSetup;
  player: Player;
  events: GameEvent[];
  removed: Vehicle[];
  spawnTimer: Record<string, number>;
  weather: WeatherEvent[];
  dustClouds: DustCloud[];
  states: NpcState[];
  smoke: SmokeCloud[];
  fields: GroundField[];
  flares: Flare[];
  lines: HarpoonLine[];
  searchRng: Rng;
  furyRoad: FuryRoadRun | null;
  sunward: SunwardFacts | null;
  crimes: CrimeCase[];
};
