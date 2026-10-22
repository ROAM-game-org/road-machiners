# Real turn-end slowdown

**Status:** executing
**Branch:** real-slowdown
**Worktree:** .worktrees/real-slowdown
**Goal:** When travel pauses at a turn end, the trucks ease to a stop instead of freezing, and every pose drawn during the slowdown is real simulation: the next turn starts from the pose the trucks actually reached and never pulls them back. A pause between turns stops time, and resuming continues from the same pose. Confirming it needs the user to play a session, since the feel of the slowdown is a visual judgment. The user plays ROAM and uses this so turn ends feel continuous. Useless if: the slowdown draws motion the world does not keep, so a new order or a reload moves the truck back; the slowdown hides a jump by blending fast toward a pose it did not show; it plays only on some kinds of pause; it keeps moving while a panel is open or the tab is hidden; it adds a visible hitch or delay when the next turn starts.
**Mode:** hands-off

## Context
- A turn is a fixed 60 physics steps of 1 s. The world stores only turn-end states, and `this.drive` is the physics snapshot at the turn end.
- Today the trucks freeze at the last frame of a turn. Only world visuals ease to rest, through `PlayClock.coast` over `CONFIG.playEaseMs`.
- The removed creep played the next prepared turn slowly. That turn was not committed, so a new order or any world change snapped the truck back to the stored turn end.
- `run()` in `src/phys/drive.ts` already takes a step count, and `simulateTurn` calls it with `TURN_STEPS`.
- `applyDriven` in `src/phys/turn.ts` copies pose, heading, speed and bend from the physics body into the world vehicle.
- Turns chain without a stop when travel advances or runs on its own. `Travel.prepareNext` prepares the next turn only then.
- Travel pauses on Space, danger, arrival, panels and focus loss. Panels, a focused text control and a hidden tab hold turns back, as `held` in `advanceTurn`.
- A turn that produces a radio call sets `world.player.call` at turn start, which counts as a modal. So holding the turn playback itself on `held` could deadlock against screens that wait for the playback to end.

## Design
The slowdown is a short real continuation of the physics after the turn, called the tail. The worker computes it with every turn and the game commits it when travel stops at that turn.

- The worker simulates the tail after each turn's 60 steps. It uses the same drive and the world as the turn left it, with the same orders. The step count comes in the turn request, so the worker reads no display config.
- The tail length covers the whole eased stop. An eased stop from full rate over `playEaseMs` advances play time by half of `playEaseMs`, so the tail is that many milliseconds rounded up to whole steps, 11 steps at 350 ms.
- A tail is clean when it has no crashes, breaks, landings or rope tears, no vehicle passes its order point, and no vehicle is on a rope. Those events need the world rules, so a turn with an unclean tail stops as today, without a slowdown.
- The worker returns the tail frames, the tail-end snapshot and each driven vehicle's tail-end pose, heading, speed and bend. Pose copying is shared with `applyDriven`.
- When the movement of a turn ends and travel does not continue, the game commits the tail at once. The world takes the tail-end poses, `this.drive` takes the tail-end snapshot, and the save log notes the new world. This happens before the autosave at the playback end, so a save holds the committed pose.
- The trucks then play the tail on their own eased clock. It is a `PlayClock` with `playEaseMs` that starts at full rate, so the trucks and the world visuals stop on the same curve. The clock eases up again when travel advances, and its pose never runs past the tail end.
- While a panel is open, a text control is focused or the tab is hidden, the truck clock and the world play clock add no time. Frame time for both is capped at `CONFIG.playbackFrameMs`, so the first frame after a hidden tab does not jump.
- A new turn begins only once the drawn trucks are within one physics step of the tail end. Pressing Space mid-slowdown speeds the truck clock back up, the rest of the tail plays at rising speed, and the turn starts from the tail end. The existing start blend covers the last step, so the turn joins without a skip.
- The next turn is prepared from the committed world and snapshot, so its plan, the plan preview and the save all start where the trucks stopped.
- A vehicle keeps playing its tail only while its world pose still equals the committed tail-end pose. A rule that moves it ends its slowdown, as rule moves do today.
- The turn playback itself keeps running while a panel is open. Only the time between turns is held.

Rejected: cutting the tail at the pose reached when the player presses. It needs the physics state partway through the tail under the old orders, a re-simulation per press, and world rules for a partial turn. Rejected: slowly playing the next prepared turn and committing it. That commits the player to a whole turn of old orders, so planning is no longer free.

TDD: yes. The tail rules, the commit and the truck clock gating are deterministic and regressions there bring back the snap.

### Invariants
- IV1 — Every pose drawn during a slowdown is a frame of the committed tail or a blend between two consecutive committed frames.
- IV2 — After a slowdown starts, `this.world` vehicle poses and `this.drive` both equal the tail end.
- IV3 — The next turn's first frame follows the tail end, so no drawn pose moves backward along the path at the join.
- IV4 — While held, neither the truck clock nor the world play clock advances.
- IV5 — A turn with an unclean tail has no slowdown and no world change after its turn end.
- IV6 — Chained turns, while travel advances or runs on its own, ignore the tail and play exactly as today.
- IV7 — `game.ts` and `drive.ts` do not grow in net lines, and the quality gate passes.

### Principles
- PC1 — The tail is plain physics after the turn. It runs no world rules, so the world changes it makes are poses, heading, speed, bend and the snapshot only.

### Assumptions
- AS1 — Rapier physics resumed from the tail-end snapshot continues the motion without a visible jerk at the next turn start.
- AS2 — The user accepts a slowdown of `playEaseMs`, 350 ms, covering half that time of motion, since it reuses the one play-clock ease.

### Unknowns
- UK1 — How much the 11 tail steps add to the worker's turn time.
- UK2 — Whether a clean tail is common in combat, where trucks often touch.
- UK3 — Whether drive memory carried through the tail, such as route progress and stall counters, changes the next turn's driving in a visible way.

## Plan

Approach: the worker adds a tail to every prepared turn, `travel.ts` owns a `Creep` that commits and plays it, and `game.ts` only wires it in. A tail is unclean on `passed`, not on `arrived`: arrival is a distance check the next turn repeats, while passing depends on `mem.ahead`, which the tail would consume.

### PH1 — Tail in the worker
- 1.1 `game/src/phys/drive.ts:241-261` modify
  - `export function simulateSteps(d: Drive, w: World, steps: number): TurnResult` replaces the private `runFreed`; `simulateTurn` calls it with `TURN_STEPS`. No net lines. Respects IV7.
- 1.2 `game/src/phys/turn.ts:28-36,136-150,260-264` modify
  - `TurnTask` gains `tailSteps: number`.
  - `export type TailPose = { pos: Vec; heading: number; speed: number; bend?: number }`
  - `export type Tail = { frames: TurnFrames; next: DriveSnapshot; poses: Record<string, TailPose> }`
  - `PreparedTurn` gains `tail: Tail | null`; the worker transfers `tail.next.snapshot.buffer` too.
  - `bodyPose(d: Drive, v: Vehicle): TailPose` holds the pose copy that `applyDriven` uses today.
  - `export function isCleanTail(w: World, r: TurnResult): boolean` checks no crashes, breaks, landings, tears, `passed`, or vehicle on a rope.
  - `tailOf(d: Drive, w: World, steps: number): Tail | null` syncs the drive to the world, runs `simulateSteps`, returns null when unclean, and frees its drive.
  - `computeTurnIn` captures the turn snapshot before the tail runs. Respects PC1, IV5.
- 1.3 Callers of `computeTurn` pass `tailSteps`: `src/three/travel.ts` `TurnPreparation.post`, `src/phys/turn-task.test.ts`, `src/three/turn-preparation.test.ts`, `scripts/error-replay.mjs`.
- Commit: Every prepared turn carries a short clean physics tail for the turn-end slowdown

### PH2 — Creep in travel
- 2.1 `game/src/three/play-clock.ts` modify
  - `export function easedStopMs(easeMs: number): number` returns the play time an eased stop from full rate adds, half the ease time.
  - `PlayClock.isMoving(): boolean` is true while the rate is above zero.
- 2.2 `game/src/three/travel.ts` modify
  - `export function tailStepsFor(easeMs: number): number` rounds `easedStopMs` up to whole physics steps.
  - `export function withTail(world: World, poses: Record<string, TailPose>): World` returns the world with tail-end poses.
  - `export class Creep` with `constructor(tail: Tail, starts: Record<string, VehicleFrame>, easeMs: number, overshootMs: number)`, `tick(ms: number, wanted: boolean): void`, `frameOf(v: Vehicle): VehicleFrame | undefined`, `holdsTurn(): boolean`, `isMoving(): boolean`. Its clock starts at full rate with the overshoot past the movement end. `frameOf` returns nothing for a vehicle whose world pose differs from its tail-end pose. `holdsTurn` is true while more than one step of tail is left. Respects IV1, IV3, IV4.
  - `Travel` constructor takes `tailSteps` and passes it to `TurnPreparation`.
  - `Travel.continues(world: World, now: number): boolean` is the condition `prepareNext` uses today; `prepareNext` calls it. Respects IV6.
  - `Travel.creepAfter(playback: Playback, world: World, shown: Record<string, VehicleFrame>, now: number, overshootMs: number): { creep: Creep; world: World; drive: DriveSnapshot } | null` returns null when travel continues or the tail is null.
  - `takeReady` prepares the turn before it checks `held`, so a turn held back by the slowdown is ready when the slowdown ends.
- Commit: Travel commits the turn tail when it stops and plays it on its own eased clock

### PH3 — Game wiring
- 3.1 `game/src/three/game.ts:172,793-840,985-1042,1120-1130` modify
  - `creep: Creep | null` field; `finishMovement(a, now)` commits `creepAfter` into `this.world`, `this.drive` and the save log; `beginTurn` clears it.
  - `frame()` computes `held` once and passes it to `advanceTurn`. Play time for the world clock and the creep is 0 while held and capped at `CONFIG.playbackFrameMs`.
  - `tryBeginTurn` treats `creep.holdsTurn()` as held.
  - `syncVehicles` falls back to `creep.frameOf(v)` when no turn frame plays.
  - The follow camera counts a moving creep as playing.
  - Net lines do not grow: move `lightTurn` and `turnClock` into `travel.ts` as functions of the playback if needed. Respects IV2, IV7.
- 3.2 `game/docs/architecture/movement.md` modify: describe the tail, the commit at a stop and the held clocks.
- Commit: Turn ends ease the trucks to a stop along real physics, and the next turn starts where they stopped

### Test strategy
- PH1, failing first in `src/phys/turn-task.test.ts`: a driving truck's turn has a tail of `tailSteps` frames whose poses continue ahead of the turn end; a turn computed from the tail world and snapshot starts within one step of the tail end; `isCleanTail` rejects a result with a crash or a `passed` order.
- PH2, failing first in `src/three/travel.test.ts` and `src/three/play-clock.test.ts`: an eased stop adds at most `easedStopMs`; the creep plays tail frames, adds no time on a zero tick, never passes the tail end, holds the turn until one step is left, and drops a vehicle whose pose a rule changed; `withTail` sets poses only; `continues` matches the old `prepareNext` rule; `takeReady` prepares while held.
- PH3 in the browser: a probe on the worktree dev server records the drawn player pose every frame through a stop, a panel opened mid-slowdown, and the next turn. Checks: the distance along the path never decreases, the pose is constant while the panel is open, and the world pose equals the last tail frame.

### Risks / rollback
- RK1 — The tail adds worker time per turn; measure the turn perf before and after, and report it under UK1.
- RK2 — Tail frames make worker messages larger; the snapshot buffer is transferred, not copied.
- Rollback: revert the three commits.

## Verify
- Touched tests pass: turn-task, turn-language, turn-preparation, travel and play-clock, 103 tests. tsc and the quality gate pass. `game.ts` shrank by 2 lines.
- `npm run playtest` on the worktree server passes at 60.5 fps with no errors.
- Browser probe `game/tmp/slowdown-probe.mjs` at 120 Hz, 829 frames over three turns. The turn end flows into the slowdown at the same per-frame step, the trucks rest 0 mm from the committed world pose, and a panel opened mid-slowdown holds the pose for 20 frames, then it resumes. The only backward frames are 2 of 0.2 mm inside a normal turn's physics, not at a join.
- First probe run broke the goal: a press mid-slowdown finished the tail before the worker had the next turn, so the truck halted 3 frames at full speed and the turn's first frame repeated the pose. Fixed: the tail clock speeds up only once the next turn is ready, and the turn starts at the tail end with the time past it. Rerun: no standstill frame at the join.
- Remaining feel point: at that join the per-frame step goes from 0.039 m to 0.080 m in one frame, since the ramp has not reached full speed when the tail ends. Before this change the same press started from a full stop.
- UK1: worker turn time is unchanged against the dev server, 55 to 113 ms per turn in both. The press-to-start wait grew by about 17 ms on turns pressed during the slowdown.

## Conclusion

### Hands-off decisions
- make: size Medium, full flow; the change spans the worker, travel and the game loop.
- make: branch `real-slowdown` from dev in `.worktrees/real-slowdown`.
- udesign: commit the whole tail at the stop instead of cutting it at the press; it needs no partial turns and keeps planning free.
- udesign: slowdown length reuses `playEaseMs` instead of a new setting; one ease for trucks and world visuals, and no invented number.
- udesign: a turn with contacts or arrivals in its tail stops as today; those need world rules the tail does not run.
- uplan: plan auto-approved (hands-off).
- udesign: the turn playback keeps running under panels; holding it could deadlock against a radio call screen that waits for the playback.
