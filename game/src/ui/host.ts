
import type { World } from "../sim/types";
import type { GarageRenders } from "../three/render/garageRender";

export type UiHost = {
  world(): World;
  apply(next: World): void;
  announce(next: World): void;
  selectedWeapon(): string | null;
  selectWeapon(id: string | null): void;
  selectedUtility(): string | null;
  selectUtility(id: string | null): void;
  pressTurn(): void;
  releaseTurn(): void;
  runKey(code: string): void;
  menuOpen(): boolean;
  searchStock(stockId: string): void;
  autoTravel(): boolean;
  travelSpeedIndex(): number;
  travelPlaySpeed(): number | null;
  stepTravelSpeed(delta: 1 | -1): void;
  getTurnPhase(): "moving" | "firing" | "results" | null;
  garageRenders?(): GarageRenders;
};
