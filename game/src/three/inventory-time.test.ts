import { describe, expect, it, vi } from 'vitest';
import { addState } from '../sim/states';
import { addVehicle, emptyWorld } from '../sim/testkit';
import type { InventoryScreen } from '../ui/inventory';
import { InventoryTime } from './inventory-time';

function setup(open = true) {
  const state = { open };
  const inventory = {
    isOpen: () => state.open,
    close: vi.fn(() => { state.open = false; }),
    view: { commitPlan: vi.fn() },
  };
  return { state, inventory, time: new InventoryTime(inventory as unknown as InventoryScreen) };
}

describe('time from the open inventory', () => {
  it('holds time until the player presses for a turn, then starts any planned refit', () => {
    const { inventory, time } = setup();
    expect(time.holds()).toBe(true);
    time.press();
    expect(inventory.view.commitPlan).toHaveBeenCalledOnce();
    expect(time.holds()).toBe(false);
  });

  it('holds again the next time the inventory opens', () => {
    const { state, time } = setup();
    time.press();
    state.open = false;
    expect(time.holds()).toBe(false);
    state.open = true;
    expect(time.holds()).toBe(true);
  });

  it('closes on an event, but only after the player passed time from it', () => {
    const { inventory, time } = setup();
    const w = emptyWorld();
    time.closeOn(w, true);
    expect(inventory.close).not.toHaveBeenCalled();
    time.press();
    time.closeOn(w, false);
    expect(inventory.close).not.toHaveBeenCalled();
    time.closeOn(w, true);
    expect(inventory.close).toHaveBeenCalledOnce();
  });

  it('closes when a fight starts', () => {
    const { inventory, time } = setup();
    const w = emptyWorld();
    const raider = addVehicle(w, 'scrapjaw', 'buggy', [], { x: 40, y: 30 });
    time.press();
    addState(w, 'combat', raider.id, w.player.vehicleId, { kind: 'none' });
    time.closeOn(w, false);
    expect(inventory.close).toHaveBeenCalledOnce();
  });

  it('refuses a turn in look mode and leaves a closed inventory alone', () => {
    const w = emptyWorld();
    w.player.state = 'knockedOut';
    expect(setup().time.refuses(w)).toBe(true);
    expect(setup(false).time.refuses(w)).toBe(false);
    expect(setup().time.refuses(emptyWorld())).toBe(false);
  });
});
