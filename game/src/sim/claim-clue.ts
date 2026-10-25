import { CONTRACTS, type ClaimLook } from '../data/market';
import { REGION } from '../data/region';
import { BIG_SHELL_RADIUS, CLUE_PIECES, CLUE_SPOTS, type CluePiece } from '../data/territory';
import { gridSquareOf, sameGridSquare, type GridSquare } from './map-grid';
import CLAIM_CLUES_FILE from '../data/claim-clues.json';
import { territoryAt } from './territory';
import type { World } from './types';
import { bearing, dist, type Vec } from './vec';

export type ClaimClueTier = 'shop' | 'piece' | 'offset';
export type ClueRelation = 'in' | 'beside';
export type ClueWords = { tier: 'piece' | 'offset'; piece: CluePiece; relation: ClueRelation | null; angle: number; tiles: number; at: Vec };
export type CluePlace = { piece: CluePiece; pos: Vec; r: number; open: boolean; territory: string };
export type ClaimWreck = { id: string; pos: Vec; look: ClaimLook; territory: string | null };
export type ClaimClue = { look: ClaimLook; from: Vec; angle: number; distance: number; point: Vec; territory: string | null; square: GridSquare; where: ClueWords | null };

export type WreckClues = { piece: ClueWords | null; offset: ClueWords | null; tiers: Record<string, ClaimClueTier> };
export type ClaimClueBake = { mapHash: string; wrecks: Record<string, WreckClues> };

const COMPASS_POINTS = 8;
const TIERS: readonly ClaimClueTier[] = ['shop', 'piece', 'offset'];
const CLAIM_CLUES = CLAIM_CLUES_FILE as ClaimClueBake;

export function compassSector(rad: number): number {
  return ((Math.round(rad / ((2 * Math.PI) / COMPASS_POINTS)) % COMPASS_POINTS) + COMPASS_POINTS) % COMPASS_POINTS;
}

export function snapAngle(rad: number): number {
  const step = (2 * Math.PI) / COMPASS_POINTS;
  return Math.round(rad / step) * step || 0;
}

export function roundTo(n: number, step: number): number {
  return Math.max(step, Math.round(n / step) * step);
}

const PLACES_BY_MAP = new Map<string, CluePlace[]>();

function placeOfLandmark(o: World['obstacles'][number]): CluePlace | null {
  if (o.kind !== 'landmark') return null;
  const rule = CLUE_PIECES[o.look];
  const territory = territoryAt(o.pos);
  if (!rule || !territory) return null;
  const piece = o.look === 'hullShell' && o.r > BIG_SHELL_RADIUS ? 'bigShell' : rule.piece;
  return { piece, pos: { ...o.pos }, r: o.r, open: rule.open, territory: territory.id };
}

function spotPlaces(): CluePlace[] {
  return Object.entries(CLUE_SPOTS).flatMap(([id, spots]) => {
    const origin = REGION.locations.find((l) => l.id === id)!.pos;
    return spots.map((s) => ({ piece: s.piece, pos: { x: origin.x + s.at.x, y: origin.y + s.at.y }, r: s.r, open: s.open, territory: id }));
  });
}

export function cluePlaces(world: World): CluePlace[] {
  const cached = PLACES_BY_MAP.get(world.mapHash);
  if (cached) return cached;
  const places = [...world.obstacles.flatMap((o) => placeOfLandmark(o) ?? []), ...spotPlaces()];
  PLACES_BY_MAP.set(world.mapHash, places);
  return places;
}

function edgeGap(place: CluePlace, pos: Vec): number {
  return dist(place.pos, pos) - place.r;
}

export function nearestPlace(places: readonly CluePlace[], wreck: ClaimWreck): CluePlace | null {
  const own = places.filter((p) => p.territory === wreck.territory);
  return own.sort((a, b) => edgeGap(a, wreck.pos) - edgeGap(b, wreck.pos))[0] ?? null;
}

export function relationTo(place: CluePlace, pos: Vec): ClueRelation | null {
  if (place.open && dist(place.pos, pos) <= place.r) return 'in';
  return edgeGap(place, pos) <= CONTRACTS.claim.clue.besideTiles ? 'beside' : null;
}

export function wordsFor(places: readonly CluePlace[], wreck: ClaimWreck, tier: 'piece' | 'offset'): ClueWords | null {
  const place = nearestPlace(places, wreck);
  if (!place) return null;
  const clue = CONTRACTS.claim.clue;
  if (tier === 'piece') {
    const relation = relationTo(place, wreck.pos);
    return relation ? { tier, piece: place.piece, relation, angle: 0, tiles: 0, at: { ...place.pos } } : null;
  }
  const far = dist(place.pos, wreck.pos);
  if (far > clue.offsetRange) return null;
  return { tier, piece: place.piece, relation: null, angle: snapAngle(bearing(place.pos, wreck.pos)), tiles: roundTo(far, clue.offsetStepTiles), at: { ...place.pos } };
}

function fitsShop(clue: ClaimClue, wreck: ClaimWreck): boolean {
  if (wreck.look !== clue.look || wreck.territory !== clue.territory) return false;
  if (!sameGridSquare(gridSquareOf(wreck.pos), clue.square)) return false;
  if (compassSector(bearing(clue.from, wreck.pos)) !== compassSector(clue.angle)) return false;
  return Math.abs(dist(clue.from, wreck.pos) - clue.distance) <= CONTRACTS.claim.clue.shopBand;
}

function fitsWords(places: readonly CluePlace[], words: ClueWords, wreck: ClaimWreck): boolean {
  const same = places.filter((p) => p.piece === words.piece && p.territory === wreck.territory);
  if (words.tier === 'piece') return same.some((p) => relationTo(p, wreck.pos) === words.relation);
  const band = CONTRACTS.claim.clue.offsetBand;
  return same.some((p) => compassSector(bearing(p.pos, wreck.pos)) === compassSector(words.angle) && Math.abs(dist(p.pos, wreck.pos) - words.tiles) <= band);
}

export function fitsClue(places: readonly CluePlace[], clue: ClaimClue, wreck: ClaimWreck): boolean {
  return fitsShop(clue, wreck) && (clue.where === null || fitsWords(places, clue.where, wreck));
}

export function shopClue(wreck: ClaimWreck, from: Vec): ClaimClue {
  const angle = snapAngle(bearing(from, wreck.pos));
  const distance = roundTo(dist(from, wreck.pos), CONTRACTS.claim.clueStepTiles);
  const point = { x: from.x + Math.cos(angle) * distance, y: from.y + Math.sin(angle) * distance };
  return { look: wreck.look, from: { ...from }, angle, distance, point, territory: wreck.territory, square: gridSquareOf(wreck.pos), where: null };
}

export function withWords(clue: ClaimClue, where: ClueWords | null): ClaimClue {
  if (!where) return clue;
  const reach = where.tier === 'offset' ? { x: Math.cos(where.angle) * where.tiles, y: Math.sin(where.angle) * where.tiles } : { x: 0, y: 0 };
  return { ...clue, where, point: { x: where.at.x + reach.x, y: where.at.y + reach.y } };
}

function isFair(places: readonly CluePlace[], wrecks: readonly ClaimWreck[], wreck: ClaimWreck, clue: ClaimClue): boolean {
  return wrecks.every((q) => q.id === wreck.id || dist(q.pos, wreck.pos) <= CONTRACTS.claim.clue.nearby || !fitsClue(places, clue, q));
}

export function fairTier(places: readonly CluePlace[], wrecks: readonly ClaimWreck[], wreck: ClaimWreck, from: Vec): ClaimClueTier | null {
  const base = shopClue(wreck, from);
  for (const tier of TIERS) {
    const words = tier === 'shop' ? null : wordsFor(places, wreck, tier);
    if (tier !== 'shop' && !words) continue;
    if (isFair(places, wrecks, wreck, withWords(base, words))) return tier;
  }
  return null;
}

export function makeClaimClues(places: readonly CluePlace[], wrecks: readonly ClaimWreck[], shops: Record<string, Vec>): Record<string, WreckClues> {
  return Object.fromEntries(
    wrecks.map((wreck) => {
      const tiers: Record<string, ClaimClueTier> = {};
      for (const [shop, from] of Object.entries(shops)) {
        const tier = fairTier(places, wrecks, wreck, from);
        if (tier) tiers[shop] = tier;
      }
      return [wreck.id, { piece: wordsFor(places, wreck, 'piece'), offset: wordsFor(places, wreck, 'offset'), tiers }];
    }),
  );
}

export function claimClueBake(map: { hash: string }): ClaimClueBake {
  if (CLAIM_CLUES.mapHash !== map.hash) throw new Error(`Claim clues were baked for map ${CLAIM_CLUES.mapHash}, not ${map.hash}. Run npm run old-spots.`);
  return CLAIM_CLUES;
}

export function bakedTier(stockId: string, shop: string): ClaimClueTier | null {
  return CLAIM_CLUES.wrecks[stockId]?.tiers[shop] ?? null;
}

export function bakedWords(stockId: string, shop: string): ClueWords | null {
  const entry = CLAIM_CLUES.wrecks[stockId];
  if (!entry) return null;
  const tier = entry.tiers[shop];
  if (tier === 'shop') return null;
  if (tier === 'piece') return entry.piece;
  return entry.offset ?? entry.piece;
}
