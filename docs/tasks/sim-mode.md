# Simulation mode

**Status:** validating
**Branch:** sim-mode
**Worktree:** .worktrees/sim-mode
**Goal:** `/sim.html?seed=<n>` on the dev server plays the markov bot's headless run and shows every truck on a 2D map with pan and zoom, the full world event log and a card for any truck, the player included. The user watches it to debug NPC behavior and the player's experience. Useless if the page plays a different game than `progression:playthrough` for the same seed, the viewer changes what the bot knows, the log drops events, or a thrown turn or stall goes by silently. Confirming it needs the user to watch a run.
**Mode:** interactive

## Context

The progression harness already plays the real turn pipeline with no 3D and no Rapier: `FAR_MOVER` moves every truck by the far rules. Its output was text only. A headless markov turn costs about 270 ms in Node, so the sim must run off the page's main thread.

## Design

- `src/sim/progression/sim-mode.ts`: `SimRun` steps `playTurns` with the markov bot and `SIM_OPTIONS`, and posts a small frame per turn: markers, `describe()` log lines with the trucks they name, and the watched truck's card. The `World` never leaves it.
- `src/three/sim-worker.ts` runs `SimRun` in a worker on the map from `fetchMap()`.
- `src/ui/sim/page.ts` draws `MapView` with an overlay of markers and holds the log and card. It never holds a `World`.
- `startWorldOn(map, …)` and `archetypeWorldOn()` in `record.ts` take the map, and the `TEST_MAP` wrappers moved to `record-node.ts`, so the browser never loads the test map.
- `MapView.update()` takes a `MapScene` of terrain, sites and fog. `openScene()` shows every site with no fog without touching any world.
- The page is a dev page like `ui.html`, English only, not in the production build.

### Invariants

- IV1: The viewer never changes the world the sim plays. The bot reads `player.discovered`, so the view uses `openScene()` instead of revealing the map.
- IV2: Same seed, same game as `playTurns` in Node.
- IV3: The page never holds a `World`.
- IV4: A thrown turn stops the run and shows its stack. A stall shows in red.

## Verify

- `sim-mode.test.ts`: 20 steps of `SimRun` match `playTurns` from `startWorld(1)` in player position and events per turn. Cards and log ids are checked too.
- Browser, seed 1: after 20 steps the page shows turn 21, 36 trucks and 204 log lines, the same as Node. Pan and zoom hold 60 fps while turns play.
- `map-view`, `record` and `activity` tests pass, and the quality gate passes.
