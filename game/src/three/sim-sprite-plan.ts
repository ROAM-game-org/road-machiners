import { CHASSIS, PAINT, type TruckPaint } from "../data/chassis";
import { FACTIONS } from "../data/npc-behavior";
import { NPCS, type NpcTemplate } from "../data/npcs";
import { GANG_PAINT, TEMPLATE_PAINT, paintOf } from "../render/palette";
import { bareVehicle } from "../sim/factory";
import type { Faction, NpcBrain, NpcFactionId, Vehicle } from "../sim/types";

export const SPRITES = { yaws: 16, pxPerMeter: 18, folder: "sim-sprites", manifest: "manifest.json", cellsAcross: 4 };

export type SpritePaint = { faction: string; template: string | null; player: TruckPaint };
export type SpriteWant = { chassisId: string; paint: SpritePaint; key: string };

type GangId = keyof typeof GANG_PAINT;

const GANGS = Object.keys(GANG_PAINT) as GangId[];

function factionOf(text: string): Faction {
  if (text === "player") return text;
  const found = (Object.keys(FACTIONS) as NpcFactionId[]).find((id) => id === text);
  if (!found) throw new Error(`The faction ${text} is not in the game`);
  return found;
}

function brainOf(templateId: string): NpcBrain {
  return { templateId, driver: "", traits: [], personality: "kind", goals: [], noticed: {}, tracks: {}, hurt: 0, attackers: {}, goal: null, home: { x: 0, y: 0 }, stepIndex: 0, memories: [] };
}

export function truckOf(chassisId: string, paint: SpritePaint): Vehicle {
  const faction = factionOf(paint.faction);
  const brain = faction === "player" || paint.template === null ? null : brainOf(paint.template);
  return bareVehicle({ nextId: 1 }, { faction, chassisId, pos: { x: 0, y: 0 }, heading: 0, brain });
}

function hex(color: number): string {
  return color.toString(16).padStart(6, "0");
}

export function spriteKey(chassisId: string, paint: SpritePaint): string {
  const colors = paintOf(truckOf(chassisId, paint), paint.player);
  return `${chassisId}-${hex(colors.body)}-${hex(colors.cab)}-${hex(colors.gear)}`;
}

function canBeGang(tpl: NpcTemplate): boolean {
  const rule = tpl.allegiance;
  if (rule.kind === "fixed") return GANGS.some((g) => g === rule.faction);
  return rule.kind === "site" || rule.kind === "leader";
}

function townFactionOf(tpl: NpcTemplate): string {
  const rule = tpl.allegiance;
  if (rule.kind === "fixed") return rule.faction;
  return rule.kind === "town" ? "independent" : rule.fallback;
}

function paintsOf(tpl: NpcTemplate): SpritePaint[] {
  const paints: SpritePaint[] = [];
  if (tpl.id in TEMPLATE_PAINT) paints.push({ faction: townFactionOf(tpl), template: tpl.id, player: PAINT.standard });
  if (canBeGang(tpl)) for (const gang of GANGS) paints.push({ faction: gang, template: tpl.id, player: PAINT.standard });
  return paints;
}

function wants(): { chassisId: string; paint: SpritePaint }[] {
  const npc = Object.values(NPCS).flatMap((tpl) => tpl.loadout.chassis.flatMap((c) => paintsOf(tpl).map((paint) => ({ chassisId: c.value, paint }))));
  const own = Object.keys(CHASSIS).map((chassisId) => ({ chassisId, paint: { faction: "player", template: null, player: PAINT.standard } }));
  return [...npc, ...own];
}

export function spritePlan(): SpriteWant[] {
  const byKey = new Map<string, SpriteWant>();
  for (const { chassisId, paint } of wants()) {
    const key = spriteKey(chassisId, paint);
    if (!byKey.has(key)) byKey.set(key, { chassisId, paint, key });
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export type SpriteCell = { x: number; y: number; w: number; h: number; fromCenterX: number; fromCenterY: number };
export type SpriteEntry = { file: string; radiusM: number; cells: SpriteCell[] };
export type SpriteManifest = { yaws: number; pxPerMeter: number; chassis: string[]; sprites: Record<string, SpriteEntry> };
