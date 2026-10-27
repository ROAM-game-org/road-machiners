import { describe, expect, it } from "vitest";
import { HostileSighting } from "./hostile-sighting";

describe("HostileSighting", () => {
  it("flags a hostile when it comes into sight after a whole turn out of it", () => {
    const watch = new HostileSighting();
    expect(watch.observe(1, ["a"]).sighted).toBe(true);
    expect(watch.observe(1, ["a"]).sighted).toBe(false);
    expect(watch.observe(2, []).sighted).toBe(false);
    expect(watch.observe(4, ["a"]).sighted).toBe(true);
  });
  it("does not flag a truck that was known last turn by other means, like plain sight", () => {
    const watch = new HostileSighting();
    expect(watch.observe(1, [], ["a"]).sighted).toBe(false);
    expect(watch.observe(2, ["a"]).sighted).toBe(false);
    expect(watch.observe(4, ["a"]).sighted).toBe(true);
  });
  it("ignores sight flicker inside a turn and into the next", () => {
    const watch = new HostileSighting();
    watch.observe(1, ["a"]);
    watch.observe(1, []);
    expect(watch.observe(1, ["a"]).sighted).toBe(false);
    watch.observe(2, []);
    expect(watch.observe(2, ["a"]).sighted).toBe(false);
  });
});
