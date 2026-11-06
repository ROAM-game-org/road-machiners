import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyWorld } from "../sim/testkit";
import type { BootRequest } from "../three/save-slots";
import { stubPage, type FakeNode } from "../test/fake-dom";
import { isConfirmOpen } from "./confirm-dialog";
import { confirmEndRun, DeathScreen, restartsWithStory } from "./death";

const chaos = vi.hoisted(() => ({ canAbandon: false }));

vi.mock("../sim/chaos-highway", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  canAbandonRun: () => chaos.canAbandon,
  runEarnings: () => ({ pay: 0, wrecks: 0, reached: 0, north: 0 }),
}));

async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r));
}

function deadRun() {
  const page = stubPage();
  const world = emptyWorld();
  world.player.state = "dead";
  world.chaosHighway = {} as never;
  const requests: BootRequest[] = [];
  const reload = vi.fn();
  const noSlots = { list: () => [], manualSlots: () => [], mode: () => "roaming" as const, save: vi.fn(), reboot: vi.fn(), exportSave: vi.fn(), exportLog: vi.fn(), importSave: vi.fn() };
  const screen = new DeathScreen({ ...noSlots, hasSave: () => false, newGame: { requestBoot: (r) => requests.push(r), reload } });
  screen.show(world);
  const death = page.ui.withClass("death") as FakeNode;
  const dialog = () => page.ui.withClass("confirm-dialog");
  return { ...page, world, requests, reload, death, dialog };
}

describe("Restart run on the Chaos Highway defeat screen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks first and starts nothing on Cancel", async () => {
    const { death, dialog, requests, reload } = deadRun();
    death.button("Restart run").fire("click");
    expect(dialog()!.textContent).toContain("Start a new game?");
    dialog()!.button("Cancel").fire("click");
    await settle();

    expect(requests).toEqual([]);
    expect(reload).not.toHaveBeenCalled();
    expect(isConfirmOpen()).toBe(false);
  });

  it("boots the same setup once on the Restart run button of the dialog", async () => {
    const { death, dialog, requests, reload, world } = deadRun();
    death.button("Restart run").fire("click");
    dialog()!.button("Restart run").fire("click");
    await settle();

    expect(requests).toEqual([{ new: world.setup, intro: restartsWithStory(world) }]);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("starts nothing on Escape", async () => {
    const { death, win, requests, dialog } = deadRun();
    death.button("Restart run").fire("click");
    win.fire("keydown", { code: "Escape" });
    await settle();

    expect(requests).toEqual([]);
    expect(dialog()).toBeNull();
  });
});

describe("End run", () => {
  afterEach(() => {
    chaos.canAbandon = false;
    vi.unstubAllGlobals();
  });

  it("is refused without a dialog while the sim says the run cannot be abandoned", async () => {
    const { ui, world } = deadRun();
    chaos.canAbandon = false;

    expect(await confirmEndRun(world)).toBe(false);
    expect(ui.withClass("confirm-dialog")).toBeNull();
  });

  it("asks when the run can be abandoned and answers yes on End run, no on Cancel", async () => {
    const { ui, world } = deadRun();
    chaos.canAbandon = true;

    const no = confirmEndRun(world);
    expect(ui.withClass("confirm-dialog")!.textContent).toContain("End the run here?");
    ui.withClass("confirm-dialog")!.button("Cancel").fire("click");
    expect(await no).toBe(false);

    const yes = confirmEndRun(world);
    ui.withClass("confirm-dialog")!.button("End run").fire("click");
    expect(await yes).toBe(true);
  });
});
