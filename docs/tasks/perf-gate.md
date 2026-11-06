# Perf gate

Status: executing

Branch: perf-rework

Worktree: .worktrees/perf-rework

Goal: One command plays the bench on the Ally and says whether a commit is slower than the last stored numbers, beyond what the same code varies by. Child tasks of `docs/tasks/perf-rework.md` use it for their before and after, and landings can use it to catch slowdowns. Useless if: the band is wide enough to hide a real slowdown; it fails unchanged code; it passes an untrusted run; it hides fight turn waits inside a pooled number.

Mode: hands-off

## Context

See `docs/tasks/perf-rework.md`. The Ally is a ROG Xbox Ally, Ryzen Z2 A, with no other jobs on it. The bench plays there with `--use-angle=d3d11`, and the GPU and its timer work over plain SSH. On Windows the bench reads machine load at start and end only, since other programs' CPU use is not measured.

## Design

- Turn starts: the report lists every turn start with its scene, wait and whether a turn was already computed. Fight and the first drive turn are timed from the press. Later drive turns are timed from the moment playback ended.
- Drive trust: the two cold passes on opposite routes stay. The spread check skips drive, and the gate judges each pass by itself.
- Stored numbers: `game/scripts/perf-landed.json` holds per machine, per measure, a value and a limit. It comes from at least 3 trusted reports of one commit. The limit is the value plus the noise, which is the larger of the range between reports and the largest pass difference inside one report. No fixed percentage.
- Measures: median, p99 and frames over 100 ms per scene, each drive pass alone, turn wait, plan preview and boot.
- Commands: `npm run perf -- --land <reports>` writes the stored numbers and refuses to raise a value past its old limit. `npm run perf -- --gate <report>` exits 0 on pass, 1 on a slowdown and 2 on an untrusted run or a report that lacks a measure. `npm run perf:remote -- <runs>` sends HEAD to the host in `PERF_HOST`, plays the bench and fetches the reports.

TDD: yes for the pure report code and the drive gap tracker. The remote script is checked by running it.

### Invariants

- IV1 — Unchanged code passes the gate at its stored numbers.
- IV2 — A measure over its limit fails, and an untrusted run never passes.
- IV3 — Stored numbers never rise without a person editing the file.

## Plan

### PH1 — Turn starts in the report
- `game/src/bench/report.ts` `TurnStart`, `BenchReport.turns.starts`, `turnStats()`.
- `game/src/bench/bench.ts` `startTurn()`, `playDrive()`, `driveTurnGaps()`.

### PH2 — Gate
- `game/scripts/perf-report.mjs` `spreadProblems()`, `gateMeasures()`, `landedFrom()`, `gateLines()`, `gateSummary()`; `perf-report.d.mts`; `game/src/test/perf-report.test.ts`.
- `game/scripts/perf.mjs` `--land`, `--gate`.

### PH3 — Remote runner
- `game/scripts/perf-remote.mjs`, `game/package.json`, `game/.env.example`, `game/docs/tools.md`.

### PH4 — Stored numbers
- Three full runs on the Ally at the PH3 commit, landed into `game/scripts/perf-landed.json`.

## Verify

## Conclusion

### Hands-off decisions

- make: the gate host is the Ally — it has no factory on it, and the bench is trusted there.
- udesign: the gate is on demand, not tied to landings — pushing it into `land-dev.sh` and the factory changes how every landing runs, so it waits for the user.

### Deferred (needs user input)

- Running the gate on each landing — dev has up to 47 landings a day, so the choice is between per-landing runs and batches once a run's length is known.
