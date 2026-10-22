# Saves fit or fail

**Status:** executing
**Branch:** saves-fit-or-fail
**Worktree:** .worktrees/saves-fit-or-fail
**Goal:** A save from any branch, build or format ends in one of four ways: it loads, it loads with the silent drift repair, it migrates through the steps or the carry, or it stops on the save screen, which says in plain words that it does not fit this version and offers a new game. No stored save reaches the crash screen, and none reaches a running game with a world this build cannot hold. Players and the user switching branches on one dev server rely on it. Useless if: the check looks at a few top-level keys only, a shipped save that loads today goes to the save screen, the check refuses drift that the repair would fix, a new content id makes the game refuse its own new saves, the save screen still shows only a raw error code, or a branch save passes the shape check with a step applied twice or skipped.
**Mode:** hands-off

## Context

- The crash on 2026-10-22 came from a save of the `accessory-layer` branch at format 2.102. On that branch step 101 to 102 was `withOddFronts`. On dev it is `withCrimes`. Dev ran no step, and the world loaded with no `crimes` list. The HUD crashed in `openCasesOn()`.
- `isWorld()` in `game/src/three/save.ts:284` checks 8 lists and a few numbers. Any other missing or mistyped field passes.
- Load turns any throw during load into a `SaveError`. A world that loads without a throw is trusted, so a misfit shows up later, in the UI or in a turn.
- The format number is the only proof of the saved shape. Two branches can give one number two meanings. Every branch served on localhost:5173 shares one IndexedDB.
- `game/src/three/main.ts:79` throws a plain Error for a save with no run id, and `main.ts:122` for an empty rescue. Both go to the crash screen.
- The save screen title is always "Your save needs migrating", even with Migrate off, and it shows the `SaveError` code untranslated.
- `saveOf()` returns `world: object`. No named type describes the saved world.
- The game builds with TypeScript 7, which has no compiler API. `ts-json-schema-generator` 2.9 runs on its own TypeScript 5.9, but it fails on this code: it cannot read the spread in the `LINE_IDS` array at `game/src/data/dialogue.ts:73`.
- A probe script on the TypeScript 5.9 type checker read the whole saved world type in about 1 second. It found 172 object types, 57 string-literal unions, 11 index-keyed records, 110 optional fields, and no type that cannot be stored.
- Content ids are string-literal unions, such as `TraitId`, `NoteId` and `LineId`. `LINE_IDS` holds hundreds of entries and grows with dialogue.
- Records keyed by an id union, like `player.standing`, get a new key through a tiny step when content adds one. Step 101 to 102 added `standing.marshals`.
- The progression harness never calls `writeSave()` or `saveOf()`.

## Design

Load gets one fit check: the world must match the saved world type of this build, field by field. A misfit is a `SaveError` and goes to the existing save screen. The check also runs on every write, so the game never stores a world it would refuse.

Approaches for the fit check:

1. Schema generated from the saved world type. Recommended. Our own script reads the type with the TypeScript 5.9 checker and writes a schema file. A small walker checks a world against it and names the first bad path. Pros: complete, nested and exact, and the types stay the only source. Cons: TypeScript 5.9 as a second dev compiler, about 150 lines of generator we own, and one checked-in generated file.
2. Key check from `save-shape.json`. Pros: no new tooling. Cons: the file is a sample of one new game. Empty lists give no element shape, union variants are hand-seeded, records keyed by id look like fixed structs, and a field that is null in a new game says nothing about its type. It catches a missing top-level field like `crimes` and little else.
3. Compare with a fresh new-game world at load. Pros: no file to keep. Cons: the same sample gaps as approach 2, and it costs a world build at every load.
4. Hand-written validators, or schema-first types with a library like zod. Pros: exact runtime errors. Cons: about 130 saved types written twice, or a rewrite of `types.ts`. Hand-written checks drift from the types.
5. Rehearsal: play a turn and draw the HUD on a copy at load. Pros: catches crashes whatever their cause. Cons: covers only the code paths that run, misses quiet broken state like a missing list that one screen reads, and labels real game bugs as save errors.

Chosen design, approach 1:

- A named `SavedWorld` type in `save-fit.ts` describes what `saveOf()` writes, with `explored` as its packed string. `saveOf()` returns it.
- `npm run save:shape` also writes `game/src/three/save-schema.json` from `SavedWorld`, with the TypeScript 5.9 checker. Every string-literal union becomes a plain string, so drift stays the repair's job and new content never changes the schema. The one exception is a tag: a property that every member of a union of object types holds, with a different literal in each, like a contract's `kind`. A tag stays exact, since it picks the member's shape. Tags are found from the types, so no hand list exists. A record keyed by an id union keeps its keys required, since tiny steps already add a new key. A test fails when the file is stale, and a schema change under an old format fails like a shape change does.
- `checkSavedWorld(world)` walks the schema. It refuses a missing field, a wrong type, an unknown key, a number that is not finite and any schema node it does not know. Its message names the path, like `world.crimes: missing`. `dropUnknownKeys(world)` is a separate command that removes keys the schema does not hold.
- `loadWorld()` runs `dropUnknownKeys()` on the migrated world before the repair, and runs the check on `saveOf(loaded).world` after the repair, so repaired drift passes and a structural misfit fails. Dropping an unknown key is part of the silent repair: an extra key causes no crash, and saves from other branches or old steps carry keys no one can list ahead. `isWorld()` and its list go, since the check covers them. The rescue checks the carried world the same way, and a carry that fails turns Migrate off.
- `writeSave()` runs the check before it stores. A misfit there is a game bug, and it takes the existing failed-save route through `SaveSlots.onError`: the slot keeps its old save, the HUD notes it and the error is reported. Tests run the strict check on harness worlds after play, since the harness never saves.
- Boot turns the missing run id and the empty rescue into `SaveError`s.
- With Migrate off, the save screen says the save does not fit this version and offers New game and Download save. The error code stays as a small line for bug reports. New text gets English and Russian entries and follows `game/docs/ui.md`.
- `game/docs/architecture/saves.md` and the save rules in `game/CLAUDE.md` describe the check.

Named steps:

A save can have the right shape and the wrong history. A minor number says how many steps a save went through, not which ones, and two branches can number different steps alike. An `accessory-layer` save loaded on that branch after its merge would get the odd-fronts step a second time, which is broken state that no shape check sees. Names fix it, as database migration tools do.

- Each tiny step gets a name: `{ name: 'crimes', step }`. Names are written strings, since production builds minify function names. A test refuses a duplicate name.
- Every save envelope writes `steps: { from, names }`: `from` is this build's `TINY_FROM`, and `names` lists every tiny step in this build, in order.
- Each release step gets `names`, the tiny step names it absorbed, or `null` for the folds made before named steps. A fold copies the names of the tiny steps it folds into its new release step. The fold procedure in `saves.md` gains this step.
- Load resolves a named save from its `from`. When `from` is `TINY_FROM`, every name must be a tiny step name, and load runs, in code order, each tiny step the list lacks. When `from` is an older anchor, the release step starting there must have names. A list that starts with all of them already holds that release step: load skips it and resolves the rest of the list from the release step's `to`. An empty list is a save at that anchor and takes the minor number path.
- Any other list, a name this build does not know, or a `from` no release step starts at throws `SaveError('unknownStep')`. It carries on load like `outOfReach`. It covers saves of other branches, saves of newer builds, and dev saves caught between two shipped formats. For named saves it replaces the `newer` check.
- A save with no `steps` list keeps the minor number path. That covers every save written before this change.
- The minor number stays in the envelope and keeps driving the game version, the shipped formats and the folds.
- A save can get an older step after a newer one, when a branch merged under steps it already had. Steps almost always touch separate fields, and the shape check catches a structural misfit after them.

TDD: yes. The walker, load routing, named steps and the write check are deterministic and need regression tests.

### Invariants

- IV1 — Every world `writeSave()` stores passes the strict check. Tests run the strict check on new games and on harness worlds after play.
- IV2 — Every world `loadWorld()` returns passes the check. A misfit throws `SaveError('invalidWorld')` with the bad path in its detail.
- IV3 — The save that crashed on 2026-10-22, a world at the current format with no `crimes`, ends on the save screen.
- IV4 — Every shipped anchor save in `save-fixtures/anchors/` still loads, and the 20-turn play test still passes.
- IV5 — A content id the build no longer has never fails the check by itself.
- IV6 — No stored save makes boot throw anything but a `SaveError`.
- IV7 — The checked-in schema equals the generator output, and a schema change without a new format fails a test.
- IV8 — A named save gets exactly the tiny steps its list lacks, each once, in code order. A save listing `withoutPricedHaulCalls` then `withOddFronts`, loaded on a build that lists `withoutPricedHaulCalls`, `withCrimes`, `withOddFronts`, gets the crimes step and no other.
- IV9 — A named save that this build cannot place carries on load and never runs a step. The same `accessory-layer` save on dev, which has no `withOddFronts`, is one.
- IV10 — Step names are unique across `TINY_STEPS` and the names of every release step.
- IV11 — A named save written before a fold loads after the fold: its list starts with the folded names, so load skips the release step and runs the rest.

### Assumptions

- AS1 — The TypeScript types describe what the game writes. Shipped anchors and harness worlds test it.

### Unknowns

- UK2 — Whether shipped saves hold non-finite numbers or values that break their types. Each case needs a repair rule or a tiny step, since committed steps are never edited.
- UK3 — How long the check takes on a late-game world, and how much the schema adds to the bundle.
- UK4 — Whether any current tiny step reads a field that a later step writes, which would break when it runs out of order.

## Plan

Approach: two implementers build the two independent parts in parallel, the schema check in new files and the named steps in the migration chain. The controller then wires the check into load, write, rescue and boot, and does the screen, text and docs.

### PH1 — Schema generator and checker
- 1.1 `game/package.json` (modify): dev dependency `typescript5` as `npm:typescript@5.9.3`.
- 1.2 `game/src/three/save-fit.ts` (create)
  - `export type SavedWorld` — what `saveOf()` writes: `World` without `terrain`, `events` and `removed`, vehicles without `trail`, `broken` as `{ id, turn }[]`, player without `visible`, `contacts` and `clouds`, `quests` without `live`, `explored` as a string.
  - `export type SchemaNode` — own compact node format: string, number, boolean, null, literal, array, tuple, object with required and optional properties, record, union, ref to a named definition.
  - `export function checkSavedWorld(world: unknown): void` — throws `Error` naming the first bad path. Refuses missing required properties, wrong types, unknown keys, non-finite numbers and unknown node kinds. An optional property may be absent or `undefined`. A union picks its member by tag when it has one, else accepts the first member that fits.
  - `export function dropUnknownKeys(world: unknown): void` — deletes keys the schema does not hold, wherever an object matches a schema object. It never throws on a misfit.
  - Reads `./save-schema.json`.
- 1.3 `game/src/test/save-schema.ts` (create): `savedWorldSchema(): { root: SchemaNode; defs: Record<string, SchemaNode> }` built with the TypeScript 5.9 checker from `SavedWorld`. String-literal unions widen to string, except tags of object unions. `true | false` becomes boolean. A number literal becomes number. A required property typed `T | undefined` becomes optional. Named aliases and interfaces become definitions, so recursion and reuse stay small. Any type kind it does not know throws with the path. Output is deterministic.
- 1.4 `game/scripts/save-shape.mjs` (modify): also writes `src/three/save-schema.json`, and refuses a changed schema under the recorded format, like the shape.
- 1.5 `game/src/three/save-fit.test.ts` (create): the walker on small hand schemas, the freshness test, new Roaming and Chaos Highway games pass, a world with no `crimes` fails naming `crimes`, a removed content id passes, an unknown key fails the check and goes with `dropUnknownKeys()`, `NaN` fails.
- Respects: IV5, IV7, AS1.
- Commit: Saves get a schema built from the saved world type and a checker that names the first misfit

### PH2 — Named steps
- 2.1 `game/src/three/save-migrations.ts:756-803` (modify): `TINY_STEPS: readonly NamedStep[]` with `NamedStep = { name: string; step: Step }`, one camelCase name per step, no digits. Identity steps get names from what they mark, as `saves.md` lists them. `ReleaseStep` gains `names: readonly string[] | null`, and the existing release steps take `null`.
- 2.2 `game/src/three/save.ts:36-82, 248-275, 318-331` (modify)
  - `SaveEnvelope` and `saveOf()` gain `steps: { from: TINY_FROM, names }`.
  - `namedSteps(releases, tinyFrom, tiny, steps): readonly Step[]` resolves a named save as the design says, and throws `SaveError('unknownStep')`.
  - `migratedWorld()` takes the named path when the envelope has `steps`, and the minor number path otherwise. The `newer` check applies to the minor number path only. A malformed `steps` is `noFormat`.
  - `SaveErrorCode` gains `unknownStep`, and `carriesOnLoad()` returns true for it.
- 2.3 Tests in `save-migrations.test.ts`, `save.test.ts` and `save-rescue.test.ts`: tiny step lookups by index use `.step`, names are unique, and IV8, IV9 and IV11 on small synthetic chains. A save written by `saveOf()` runs no step on load.
- Respects: IV8 to IV11.
- Commit: A save lists the names of the steps that made it, and load runs exactly the steps it lacks

### PH3 — Wire the check
- 3.1 `game/src/three/save.ts` (modify): drop the local `SavedWorld`, `isWorld()` and `WORLD_LISTS`. `loadedWorld()` runs `dropUnknownKeys()` on the migrated world and `checkSavedWorld(saveOf(loaded).world)` at the end, with a misfit as `SaveError('invalidWorld')`. `writeSave()` checks first, and on a misfit calls `slots.onError()` and stores nothing.
- 3.2 `game/src/three/save-rescue.ts:295-306` (modify): `carriedSave()` checks the carried world, with a misfit as `SaveError('invalidWorld')`.
- 3.3 `game/src/three/main.ts:79,122` (modify): no run id is `SaveError('invalidSave')`, and an empty rescue shows the save screen with Migrate off.
- 3.4 Tests: the 2026-10-22 save shape ends on `invalidWorld`, the 20-turn play of shipped saves passes the check after play, and a misfit write keeps the old save and reports.
- Respects: IV1 to IV4, IV6.
- Commit: Load and write check every save against the schema, and boot sends every bad save to the save screen

### PH4 — Save screen, text and docs
- 4.1 `game/src/ui/save-screen.ts:12-31,69-77` (modify): with Migrate off, the title says the save does not fit this version and a line says to start a new game. New entries in `src/text/en/screens.ts` and `src/text/ru/screens.ts`, Russian from agy.
- 4.2 `game/docs/architecture/saves.md`, `game/CLAUDE.md` save rules (modify): the check, named steps, the fold step that copies names.
- Commit: The save screen says plainly when a save does not fit, and the save docs describe the check and named steps

### Order & dependencies
- PH1 and PH2 run in parallel with disjoint files. PH3 needs both. PH4 needs PH3.

### Risks / rollback
- RK1 — A shipped save fails the check. Verify loads every anchor, and a failure gets a repair rule or a tiny step, never a looser check.
- RK2 — The generator meets a type kind it cannot read. It throws, and the implementer extends it rather than skipping the type.

## Conclusion

### Hands-off decisions
- make: size medium, full flow — the change spans load, write, boot, steps and docs.
- make: branch and worktree `saves-fit-or-fail` at `.worktrees/saves-fit-or-fail`, from dev at fbed633be.
- uplan: plan auto-approved (hands-off).
- uplan: tags of object unions found from the types instead of a hand list — no list to forget.
- uplan: an unknown step carries on load instead of showing the save screen — matches how `outOfReach` saves already behave.
