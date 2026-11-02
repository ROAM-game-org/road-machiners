import { describe, expect, it } from "vitest";
import { driveOn } from "../sim/chaos-highway";
import { chaosHighwayWorld, parkInYard } from "../sim/testkit";
import { endTurn } from "../sim/world";
import { outpostControls } from "./outpost";

const still = () => {};

describe("the controls of the outpost screen", () => {
  it("offer Leave and no Drive on while the gates are open", () => {
    const early = chaosHighwayWorld();
    parkInYard(early, 1);

    expect(outpostControls(early)).toEqual({ leave: true, driveOn: false });
  });

  it("keeps no Leave once the gates are shut, with Drive on as the one way out", () => {
    const w = chaosHighwayWorld();
    parkInYard(w, 1);
    const shut = endTurn(w, still);

    expect(outpostControls(shut)).toEqual({ leave: false, driveOn: true });
  });

  it("offers Leave again with no Drive on after the road opened", () => {
    const w = chaosHighwayWorld();
    parkInYard(w, 1);
    const after = driveOn(endTurn(w, still));

    expect(outpostControls(after)).toEqual({ leave: true, driveOn: false });
  });
});
