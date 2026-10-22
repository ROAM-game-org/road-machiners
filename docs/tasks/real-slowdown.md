# Real turn-end slowdown

**Status:** validating
**Branch:** real-slowdown
**Worktree:** .worktrees/real-slowdown
**Goal:** One world clock moves everything in the world: trucks, rounds, casings, particles, smoke, weather, world sounds, the engine sound and the camera follow. Information for the player, like the HUD, damage number fades and music, runs on real time. A turn ends once, for everything, at the end of its 1 s of movement. At that end the clock eases to a stop over 1 s on an exponential curve, the trucks coast on real physics, and rounds and shells in the air drift and then hang. Utilities act at turn start. A pause holds the clock at zero, and resuming lets everything continue from where it stopped. Damage shows when the round lands. The next turn starts from the pose the trucks reached and never pulls them back. Confirming it needs the user to play a session, since the feel is a visual judgment. The user plays ROAM and uses this so turn ends feel continuous and readable. Useless if: anything in the world keeps moving while the trucks are stopped; the camera stops with a jolt; damage shows before its round lands; the slowdown draws motion the world does not keep; a panel, the menu or a hidden tab leaves anything moving; a turn waits out a fixed read or band time after its movement.
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

### Round 2: one play clock

Context, from the user's play of round 1:
- In combat, casings kept falling while the trucks stood still.
- The camera stops with a jolt at a turn end.
- Four clocks keep time. The playback clock moves trucks by real time. The creep clock eases the tail. The world `PlayClock` moves rounds, casings and particles, and `animStep` forces it to full rate after the movement through `impactAtMs`, the 1000 ms utility band and the 1100 ms combat read. The camera chase runs on real time and drops its target in one frame when the turn stops.
- Rounds, damage labels, landing sounds and per-round part breaks already run on play time through `Fx3D` pending jobs. Utility sounds and the dry gun click are delayed on audio time. Damage text fades on real time. Utility shells and flares fly on `play.nowMs()`.
- The rest of the turn result is revealed at once in `landImpacts`: HUD events, the after-world in the HUD, explosions, crater reveal, loot and the remaining breaks.

Design:
- There are two clocks. The world clock runs everything that happens in the game world: trucks, rounds, casings, particles, smoke, weather, world sounds, the engine sound and the camera's follow of the truck. The real clock runs everything shown to the player as information: the HUD, panels, damage numbers, notices, map overlays, music, UI sounds and the camera controls.
- The game's `PlayClock` is the world clock. Each frame it takes the real frame time, capped at `playbackFrameMs`, or 0 while held. Its rate eases to 1 while time is wanted and to 0 otherwise, with `PLAY_EASE`, and fast travel multiplies it. It ticks once at the start of the frame, and every world user reads that one frame time.
- Time is wanted while a turn is moving, or while travel advances, the next turn is ready and no radio call is open. A turn from rest eases time in over `playEaseMs`.
- The turn playback advances by the clock's frame time. `Travel.advanceClock` and the playback's own frame timing go away.
- A turn ends once, when its last round lands, and every round lands by `MOVE_MS` of play time. Moving rounds already do. The late-round fallback that fires at `MOVE_MS` fires instead at the latest moment that still lands by it. The overshoot past `MOVE_MS` carries into the creep or into a chained turn.
- The creep keeps the committed tail but no clock of its own. It advances by the same frame time and stops at the tail end.
- Delayed world effects go through the `Fx3D` pending list, opened as `later(ms, run)`. Damage labels already use it to appear at landing.
- Each round's landing already plays its sound, label and part breaks at landing time. The rest of the turn result, `landImpacts`, runs at the last landing, and the playback ends in the same frame. The playback stays the one owner of the shown result until then, as today.
- A round whose flight is longer than the whole turn can still land after `MOVE_MS`. If the world clock comes to rest with the result still pending, the result shows at once, so nothing waits on a stopped clock.
- The utility band and the combat read hold are removed. Utility and dry gun sounds go through the world-time pending list. Utility shells and flares keep flying on world time, so they hang while the world is stopped.
- Damage numbers appear on the world clock, at landing. They float and fade on the real clock, as today.
- A panel, the menu, a focused text control or a hidden tab holds the world clock, also during a turn. The radio call is not a hold. It makes time not wanted, so a turn still plays to its end and the world eases to rest.
- The engine sound follows the world clock. While the world is stopped, the engine keeps the pitch and level it had and continues from there. A pause never sounds like the truck stopped.
- The camera follows the drawn truck whenever it follows, and its chase runs on world time, so it slows and stops with the world. User panning and recentering run on real time.
- Music runs on the real clock. Its combat cues come from world events, so they are keyed to absolute world time and outlive the turn that queued them.

Rejected: letting rounds land in the next turn's time. A result pending on a stopped clock deadlocks every wait on the playback: the death screen, rescue commands and the radio call. Unlocking those early shows the HUD or applies world changes before the result.

#### Invariants
- IV8 — Nothing in the game world advances by any time but the world clock's frame time. That covers truck poses, rounds, casings, particles, smoke, weather, world sounds, the engine sound and the camera chase. Only information for the player runs on the real clock.
- IV9 — While held, the play clock adds no time, also during a turn.
- IV10 — A turn's playback ends at its last landing, by `MOVE_MS` of play time unless a flight is longer than the turn. Nothing waits after it.
- IV11 — The HUD shows a turn's result at its last landing, and never waits on a stopped world clock.
- IV1 to IV7 still hold.

#### Assumptions
- AS3 — Firing a late round earlier so it lands by `MOVE_MS` does not change how combat reads.
- AS4 — Holding the engine loop at its last pitch through a long pause does not grate. The user judges it.

#### Unknowns
- UK4 — Whether any screen opened during a turn waits for the playback to end, which would deadlock now that panels hold the turn.

### Round 3: tuning from play

The user played round 2 and asked for these changes:
- The stop after a turn lasts `turnStopMs`, 1 s, on an exponential curve. It falls fast at first and fades out slowly, set by `turnStopFolds`. The user tried 2 s first, then settled on 1 s. The trucks' slowdown tail is sized to the stop's world time, so the clock still comes to rest exactly at the tail end.
- Utilities act at turn start in the sim, before the trucks move. A Sprout smokes the spot its truck drives off from, and oil and caltrops drop behind the truck before it moves. NPCs pick utilities at turn start too. Smoke, flares and drops age just before the new uses, so a new effect keeps all its turns. Harpoon lines still age after the move, since they belong to a gun.
- Smoke, flares, mortar shells and ground drops show from the first frame of the move, and their use sounds play at turn start. Caltrop hits and torn lines still sound as the move ends.
- Mortar shells fly 1.2 s and flares 1.6 s on the world clock. A shell still in the air when the world stops hangs there and lands when time runs again. Tying the flight to the stop length was tried and rejected: it made the shell near instant.
- Smoke clouds grow to full size over 0.5 s.
- The engine sound reads the turn's world time each frame. Its pitch and level hold while the world rests, and it fades out only when the truck comes to a stop or stays parked.

Review findings fixed in this round:
- A late burst's rounds after the first landed past the move end. Each late round now fires early enough that the last one lands as the move ends.

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

### Round 2 plan: one play clock

#### PH4 — World clock drives the turn and the creep
- `game/src/three/travel.ts`: `Creep` loses its `PlayClock`. `tick(ms)` adds world frame time and stops at the tail end. `joinOf` reads its own ms. `Travel.advanceClock` and `Playback.lastTick` go. `Travel.timeWanted(world, now)` is `isAdvancing(null, now) && turns.isReady(world)`. `tickCreep(ms)` takes only the frame time.
- `game/src/three/game.ts`: `frame()` ticks the world clock first. While a turn moves it runs at full rate, else it coasts toward `timeWanted` with the radio call counted as not wanted. Held for the clock is panels, menu, focused text and a hidden tab, without the call. `animStep` advances the playback by the clock's frame time, and the call after a turn begins reads the step without adding time. The finish time is the last landing, with no read hold or utility band. When the clock rests with the result pending, the result shows at once.
- `game/src/config.ts`: drop `utilityBandMs`. `combatReadMs` stays as the damage text life.
- Tests: `travel.test.ts` and `play-clock.test.ts` for the creep on world time, the join overshoot spent once, and `timeWanted`.
- Commit: One world clock runs the turn, the slowdown and the world effects, and a turn ends at its last landing

#### PH5 — Rounds and world sounds on world time
- `game/src/three/render/fx.ts`: `later(ms, run)` on the pending list. `label` uses it.
- `game/src/three/volley.ts`: utility and dry gun sounds go through `fx.later`. The `latestFire` fallback fires at the latest moment that still lands by the movement end.
- Tests: `volley.test.ts` for the fallback landing by `moveMs`.
- Commit: Late rounds land by the end of the move, and utility and empty gun sounds wait on world time

#### PH6 — Camera follow on world time
- `game/src/three/render/camera.ts`: `TruckFollow.update` takes the world frame time too. While following it always aims at the drawn truck. Its chase ticks on world time, and on real time while recentering. Key panning stays on real time.
- `game/src/three/game.ts`: passes the world frame time and `play.isMoving()`.
- Tests: `camera.test.ts` for a chase that holds still at zero world time and does not stop in one frame when play stops.
- Commit: The camera follow slows and stops with the world instead of halting in one frame

#### Verify
- Touched tests, tsc, the quality gate and `npm run playtest`.
- A browser probe of one combat turn that stops: casing and round positions stay constant while stopped, the camera's step per frame falls smoothly to zero, and a menu opened mid-turn freezes the trucks and the rounds.

## Verify
- Touched tests pass: turn-task, turn-language, turn-preparation, travel and play-clock, 103 tests. tsc and the quality gate pass. `game.ts` shrank by 2 lines.
- `npm run playtest` on the worktree server passes at 60.5 fps with no errors.
- Browser probe `game/tmp/slowdown-probe.mjs` at 120 Hz, 829 frames over three turns. The turn end flows into the slowdown at the same per-frame step, the trucks rest 0 mm from the committed world pose, and a panel opened mid-slowdown holds the pose for 20 frames, then it resumes. The only backward frames are 2 of 0.2 mm inside a normal turn's physics, not at a join.
- First probe run broke the goal: a press mid-slowdown finished the tail before the worker had the next turn, so the truck halted 3 frames at full speed and the turn's first frame repeated the pose. Fixed: the tail clock speeds up only once the next turn is ready, and the turn starts at the tail end with the time past it. Rerun: no standstill frame at the join.
- Remaining feel point: at that join the per-frame step goes from 0.039 m to 0.080 m in one frame, since the ramp has not reached full speed when the tail ends. Before this change the same press started from a full stop.
- UK1: worker turn time is unchanged against the dev server, 55 to 113 ms per turn in both. The press-to-start wait grew by about 17 ms on turns pressed during the slowdown.

### Round 2: one play clock
- Touched tests pass: travel, play-clock, volley, camera, truckMotion and vehicleWear. tsc and the quality gate pass. `npm run playtest` passes at 60.5 fps.
- `game/tmp/clock-probe.mjs`, one combat turn that stops: 24 casings, the camera and the trucks hold still over 72 frames of stopped time. The camera step falls from 0.25 to 0 over 16 frames. A menu opened 400 ms into a turn holds the trucks, casings and 8 rounds in flight for 40 frames. The playback ends at 1 s with no hold after it.
- `game/tmp/enemy-probe.mjs`, six battle turns: no truck moves backward. The first run showed two breaks, both fixed. A turn started from rest jumped to full speed with a 17 ms skip, since the world clock's stop ran one frame past the tail end. The clock now stops exactly at the tail end and eases back in. A truck body snapped when the engine shake switched off at a stop, and when a rebuilt model started its sway from rest. Body sway now runs on world time, and a rebuild carries it over. After the fixes the max body change while stopped is 0.
- The user played a combat turn and found the enemy truck snapping a little after the stop. That matches the body snap above.

### Round 3
- Touched tests pass: play-clock, travel, shade, volley, hazards, hazards-smoke, sound, utility, smoke, flare, ground-fields, claymore, npc-utility, harpoon, cheats, modes and the world and drive turn tests. tsc and the quality gate pass. `npm run playtest` passes at 60.5 fps with no errors.
- `game/tmp/enemy-probe.mjs` with the 2 s stop: both trucks' per-frame step falls smoothly to rest and the next turn starts with no skip.
- `game/tmp/call-probe.mjs` opens a radio call on a moving turn's result. The turn plays to its end under the call screen, the world eases to rest over 57 frames, the truck step falls smoothly to 0, and pressing end turn while the call is open starts no turn. No page errors.
- The engine sound on the world clock is covered by unit tests only. The user listens to it in play.
- The user confirmed the smoke now acts at turn start.
- The Roaming world fingerprint test failed on dev before this branch. Dev's merge of #777, boat props in dried rivers, added 13 obstacles and a salvage spot. The fingerprint is re-pinned.

## Conclusion

### Hands-off decisions
- make: size Medium, full flow; the change spans the worker, travel and the game loop.
- make: branch `real-slowdown` from dev in `.worktrees/real-slowdown`.
- udesign: commit the whole tail at the stop instead of cutting it at the press; it needs no partial turns and keeps planning free.
- udesign: slowdown length reuses `playEaseMs` instead of a new setting; one ease for trucks and world visuals, and no invented number.
- udesign: a turn with contacts or arrivals in its tail stops as today; those need world rules the tail does not run.
- uplan: plan auto-approved (hands-off).
- udesign: the turn playback keeps running under panels; holding it could deadlock against a radio call screen that waits for the playback. Replaced in round 2: panels hold the turn, and the radio call only makes time not wanted.
- udesign round 2: every round lands by the end of the move, and a result still pending when the clock rests shows at once; letting rounds land in the next turn deadlocks every wait on the playback.
- uexecute round 2: a turn from rest eases time in over `playEaseMs`; the instant start read as a thump in the probe.
- uexecute round 2: the stop after a move uses the world rate at speed 1, so fast travel cannot run the world past the tail.

- uexecute round 3: `EngineStrain.next` runs every turn, also parked ones, so strain decays while the truck stands; it only records a log line and a level.
- uexecute round 3: the full shop mounts a taken part on a free mount spot when the plain cells are full; stowing still keeps parts off mount cells in play.

### Deferred (needs user input)
- The user listens to the engine through a stop, a pause and a panel opened mid-turn, and confirms it never sounds like the truck stopped while it still moves.
