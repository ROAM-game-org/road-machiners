import { expect, it } from "vitest";
import { timerLines } from "./perf-panel";

const stat = (last: number, calls = 1) => ({ last, max: last, total: last * calls, calls });

it("shows the felt turn wait and the route time of the newest turn beside the session route count", () => {
  const lines = timerLines({ "turn-wait": stat(812.4), turn: stat(112), route: stat(0.4, 1895) }, 63.25);
  expect(lines).toContain("wait     812.4");
  expect(lines).toContain("route     63.3");
  expect(lines).toContain("routes    1895");
});

it("shows a dash for a wait or route time not measured yet", () => {
  const lines = timerLines({}, null);
  expect(lines).toContain("wait         -");
  expect(lines).toContain("route        -");
});
