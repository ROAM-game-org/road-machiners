import type { StockCause } from '../market';
import type { RecipeRun } from '../production';
import type { World } from '../types';
import type { SimText } from './sim-mode';

export type EconGood = { good: string; name: string; stock: number; target: number; pressure: number; buy: number; sell: number; buyText: string; sellText: string; tags: string[] };
export type EconLine = { recipe: string; name: string; run: RecipeRun; runText: string; inputs: string[]; outputs: string[]; everyHours: number; event: string | null };
export type EconFlow = { good: string; name: string; cause: StockCause; causeText: string; units: number };
export type EconShop = { id: string; name: string; x: number; y: number; goods: EconGood[]; lines: EconLine[]; flows: EconFlow[]; contracts: number; parts: number };
export type EconShipment = { truck: string; truckName: string; good: string; goodName: string; units: number; from: string; to: string; fromXY: { x: number; y: number }; toXY: { x: number; y: number } };
export type EconNews = { hoursAgo: number; kindText: string; goodName: string; units: number; from: string; to: string };
export type EconEdge = { good: string; goodName: string; from: string; to: string };
export type Economy = { turn: number; flowHours: number; shops: EconShop[]; shipments: EconShipment[]; news: EconNews[]; edges: EconEdge[] };

export function economyOf(_world: World, _flows: StockFlows, _text: SimText): Economy {
  throw new Error('economyOf is not built yet');
}

export class StockFlows {
  record(_turn: number, _shopId: string, _good: string, _delta: number, _cause: StockCause): void {
    throw new Error('StockFlows is not built yet');
  }
}
