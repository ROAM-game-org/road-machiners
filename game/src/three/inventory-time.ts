import { inCombat } from "../sim/combat";
import { playerVehicle } from "../sim/damage";
import type { World } from "../sim/types";
import { waitsOnPlayer } from "../sim/world";
import type { InventoryScreen } from "../ui/inventory";
import { lookReason } from "../ui/unstuck-reason";

function interrupted(world: World): boolean {
  return inCombat(world, playerVehicle(world)) || waitsOnPlayer(world) || world.player.state !== "active";
}

export class InventoryTime {
  private running = false;

  constructor(private readonly inventory: InventoryScreen) {}

  holds(): boolean {
    if (!this.inventory.isOpen()) this.running = false;
    return this.inventory.isOpen() && !this.running;
  }

  refuses(world: World): boolean {
    return this.inventory.isOpen() && lookReason(world) !== null;
  }

  press(): void {
    if (!this.inventory.isOpen()) return;
    this.inventory.view.commitPlan();
    this.running = true;
  }

  closeOn(world: World, event: boolean): void {
    if (this.running && this.inventory.isOpen() && (event || interrupted(world))) this.inventory.close();
  }
}
