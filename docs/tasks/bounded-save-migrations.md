# Bounded save migrations

**Status:** executing
**Branch:** bounded-save-migrations
**Worktree:** .worktrees/bounded-save-migrations
**Goal:** Save migration code stays bounded as the game ships. Small steps live only between two shipped builds, each shipped format gets one release step, and the last 10 releases keep full migration. Every older save loads through a carry migration that keeps progression and refunds what it cannot carry, and no save in format 2 at or below the current minor ever ends at a refusal. Players keep their saves, and maintainers stop paying for steps that grow without end. Useless if: the step count drops but a save at a shipped format loads to a different world than the old chain gave, a carried save loses more than today's rescue loses, the code still grows with every release, or a player save at 2.62 reads as "from a newer version".
**Mode:** interactive

## Context

- `SAVE_FORMAT.minor` is `MIGRATIONS.length`, and load throws `newer` when a save's minor is above it. Shrinking the list would break every player save.
- `MIGRATIONS` holds 89 steps. `save-migrations.ts` is 1,196 lines with about 680 lines of helper tables in other files, and `save-migrations.test.ts` is 1,974 lines over 79 fixtures of 424 KB.
- Only 6 formats ever reached players, the formats at the `release-*` and `hotfix-*` tags: 2.1, 2.6, 2.25, 2.61, 2.62 and 2.63. The other 83 minors lived only on dev builds. Two hotfixes changed the format, on 2026-10-14 and 2026-10-19.
- Factory dev and candidate builds keep saves in their own scopes. Release builds and local `npm run dev` use the empty scope.
- Each per-step fixture is trimmed to the fields its own step touches. No fixture is a full save, and minors 45, 46, 65, 66, 76 to 81, 83 and 88 have none.
- The rescue in `save-rescue.ts` already rebuilds a world from progression with `carriedWorld()` and refunds what no longer fits. It reads the raw saved world defensively, and it imports `CENTS_PER_MONEY_29_30` and `pooledSkills_9_10` from the steps.
- A save of another major format shows `save.error.incompatible`, "Start a new game". That is the refusal the goal rules out.

## Design

Formats and anchors:

- The minor keeps counting tiny steps and never goes down. The current minor is an explicit value, the `to` of the last span.
- An anchor is a format that reached players: the format in `save-shape.json` at any `release-*` or `hotfix-*` tag. The anchor list is checked into the game, since the browser cannot read git. A test compares it with the tags.
- The window holds the anchors of the last 10 release tags, with the hotfix anchors between them.

Migration list:

- `MIGRATIONS` becomes a list of spans `{ from, to, step }`. A span from one anchor to the next is a release step. Spans after the newest anchor are tiny steps of one minor each, as today.
- A release step is one hand-merged function that does what its tiny steps did. A field one step adds and a later step renames is written once under its final name.

Load routing:

- A minor above the current one stays the `newer` error.
- A minor that is a window anchor or a tiny step's `from` runs the spans.
- Any other minor of major 2 goes to the carry migration: a minor that never shipped, or an anchor that left the window. Load shows the Save updated report with what was carried, refunded and lost. No error screen.
- Another map, another major and a step that throws keep today's rescue screen. `save.error.incompatible` loses "Start a new game".

Carry migration:

- It reuses today's rescue: the defensive reader in `save-rescue.ts` and `carriedWorld()`. Load does not write the carried world, as with today's repair, so the stored save stays downloadable until the next save.
- The reader owns its knowledge of old forms of progression fields, with its own copies of the cents factor and the pooled skills. A step that moves a progression field also teaches the reader the old form. This happened twice in 83 steps.
- A part or good id that a step removes gets a row in a price table the rescue owns. The carry migration turns it into that price in cash and lists it in the report.

Fold, after each ship that brings a new format:

- Dev adds the shipped format to the anchors and folds the tiny steps up to it into one release step. Folding happens on dev, never on the release branch, so tiny steps dev adds meanwhile stay untouched.
- The fold change deletes the spans, fixtures and tests below the window.
- Saves of dev and candidate scopes at folded minors go to the carry migration.

Fixtures and proof:

- Each anchor keeps full saves for good: one Roaming and one Chaos Highway save, played for some days on the build at the tag.
- In the fold change, a test runs the old tiny chain and the new release step on the anchor's full saves and on the trimmed fixtures at that anchor's format, and requires equal worlds. The fold records the chain's output as a golden file and then deletes the tiny steps. The release step's lasting test compares its output with the golden file.

This change, on today's history:

- Convert `MIGRATIONS` to spans with the current minor at 89.
- Fold history into 5 release steps: 2.1 to 2.6, 2.6 to 2.25, 2.25 to 2.61, 2.61 to 2.62 and 2.62 to 2.63. Step 0 to 1 goes, since 2.0 never shipped. Steps 63 to 89 stay as tiny steps until the next ship.
- Capture full saves at the 6 anchors.
- Move the cents factor and pooled skills into the rescue, add its removed-id price table, and route old saves to automatic carry on load.
- Rewrite the save rules in `game/CLAUDE.md` and `game/docs/architecture/saves.md`: the minor is no longer the step count, committed tiny steps are edited at a fold, and tiny steps no longer each keep a test after their fold.

TDD: yes. Load routing, spans and the fold equivalence are deterministic and need regression tests.

### Invariants

- IV1 — A save at each window anchor loads to the same world the old chain gave it. The golden file test checks this on full saves.
- IV2 — Every major 2 save at or below the current minor loads through spans or through the carry migration. Only a newer minor, another map, another major or a throwing step ends on the rescue screen.
- IV3 — The current minor never goes down, and a new tiny step's `to` is the current minor plus 1.
- IV4 — The carry migration keeps everything today's rescue keeps: ranks, XP, perks, money, truck, parts with wear, storage, cargo, fuel, supplies, places, valid settings, notes and the quest variables `repairQuests()` keeps.
- IV5 — A carried part or good whose id a step removed becomes its price from the rescue's table in cash and appears in the report.
- IV6 — No span and no carry reader imports sim or data code.
- IV7 — Load through the carry migration awards nothing beyond the refund and writes nothing until the next save.

### Assumptions

- AS1 — Players hold saves only at tagged formats. `npm run itch` can publish any commit, so untagged formats may exist. The carry migration covers them.
- AS2 — Only the committee plays dev and candidate builds, so carrying their saves at a fold costs no player progress.
- AS3 — A hand-merged release step is much smaller than its tiny steps put together. The first fold, 2.25 to 2.61 with 36 steps, measures it.
- AS4 — Factory clones and GitHub Actions hold the release and hotfix tags. The CI checkout uses `fetch-depth: 0`.

### Unknowns

- UK1 — How to capture full saves at old tags: run the harness on a checkout of the tag, or export from the browser build.
- UK2 — How the fold gets done after every ship without blocking dev cards. The factory could open a fold issue at ship, or a test could fail while dev holds tiny steps below the newest anchor.
- UK3 — Which old forms of progression fields the reader must learn for the 6 anchors, beyond cents and pooled skills.

## Plan

Approach: first make the list hold release steps and tiny steps with an explicit start minor, with behavior unchanged. In parallel, capture full saves at the 6 anchors and make the rescue own its old-form knowledge. Then fold history into 5 release steps, prove each against the old chain, delete the folded steps, and add the gates that keep it bounded. Tiny steps keep their implicit numbering, so parallel factory cards still append to one array without renumbering.

### PH1 — Spans and routing

- 1.1 `game/src/three/save-migrations.ts:771-860,1196` (modify)
  - `type Step = (world: SavedJson) => SavedJson`.
  - `type ReleaseStep = { from: number; to: number; step: Step }`.
  - `RELEASE_STEPS: readonly ReleaseStep[]`, empty in this phase.
  - `TINY_FROM: number`, 0 in this phase. `TINY_STEPS: readonly Step[]` is today's `MIGRATIONS` array. Step at index i goes from `TINY_FROM + i` to `TINY_FROM + i + 1`.
  - `SAVE_FORMAT.minor = TINY_FROM + TINY_STEPS.length`. `MIGRATIONS` is removed.
  - `stepsFrom(minor: number): readonly Step[] | null` — the steps that carry a save at this minor to the current one, or null when the minor is out of reach. It throws when the release steps do not chain into each other and into `TINY_FROM`.
  - `anchorMinors(): number[]` — the `from` of every release step, plus `TINY_FROM`.
  - Respects: IV3, IV6.
- 1.2 `game/src/three/save.ts:36-38,188-200` (modify)
  - `SaveErrorCode` gains `'outOfReach'`.
  - `migratedWorld()` uses `stepsFrom()`. A null throws `SaveError('outOfReach', { major, minor })`. The `newer` check compares with `SAVE_FORMAT.minor`.
  - Respects: IV2.
- 1.3 `game/src/three/main.ts:74-113` (modify)
  - `bootSlot()` sends an `outOfReach` error to `carriedOrNew(slot)`. That function runs `carriedSave()` from IF1, shows `showCarryReport()` and boots the carried world. It never shows `chooseSaveFate()` and never writes.
  - Other errors keep `rescuedOrNew()`.
  - Respects: IV2, IV7.
- 1.4 Tests, written first:
  - `game/src/three/save-steps.test.ts` (create): `stepsFrom()` gives null below `TINY_FROM` and for non-anchor minors, gives the right chain from an anchor, throws on a broken chain.
  - `game/src/three/save.test.ts:499-518` (modify): `outOfReach` routing. Uses `SAVE_FORMAT.minor` in place of `MIGRATIONS.length`.
  - The step tests in `save-migrations.test.ts` and `text/fixtures.test.ts:40` index `TINY_STEPS` in place of `MIGRATIONS`.
- Commit: Save steps: release steps and tiny steps with an explicit start minor, old saves out of reach carry over on load

### PH2 — Full saves at anchors

- 2.1 `tmp/anchors/` (scratch, not committed): one detached checkout per anchor tag with its own `npm ci` in `game/`, about 160 MB each. Disk has 36 GB free.
- 2.2 `tmp/capture-save.mjs` (scratch): takes a checkout path and a mode, imports that checkout's sim, plays a new game for 2 game days with the harness bot of that tag, and writes `saveOf(world)` as a save envelope. Adapt it per tag where the API differs.
- 2.3 `game/src/three/save-fixtures/anchors/2-<minor>-roaming.json` and `2-<minor>-highway.json` (create) for minors 1, 6, 25, 61, 62 and 63. Chaos Highway saves exist only where the tag has the mode.
- Resolves: UK1. If a capture is over 1 MB, record it under RK2 before committing.
- Commit: Save fixtures: full saves played on each shipped build

### PH3 — Rescue owns old forms and refunds removed ids

- 3.1 `game/src/three/save-rescue.ts:7,163-199` (modify)
  - Holds its own `CENTS_PER_MONEY_29_30` and `pooledSkills_9_10` copies and no longer imports `save-migrations.ts`.
  - `RETIRED_PRICES_RESCUE: Record<string, number>` — the cash value of every part and good id a step removed, copied from those steps' tables.
  - `readCarried()` turns a retired id into money and lists it.
  - IF1: `carriedSave(slots, slot, icarus, kit, freshSeed, freshRunId): { world: World; report: CarryReport; runId: string } | null` — the query. `rescueSave()` becomes `carriedSave()` plus `writeSave()`.
  - Respects: IV4, IV5, IV6.
- 3.2 `game/src/sim/world.ts:539-545` (modify): `CarryReport` gains `refunded: { id: string; money: number }[]`.
- 3.3 `game/src/ui/save-screen.ts` and `game/src/text/{en,ru}/screens.ts` (modify):
  - One report line per refunded id.
  - `saveErrorText()` accepts `outOfReach` with its format.
  - `save.error.incompatible` drops "Start a new game".
  - EN text here, Russian from agy.
- 3.4 `game/src/three/save-rescue.test.ts` (modify): a save holding a retired part refunds its price, a 2.1 trimmed save carries money in cents and pooled skills, `carriedSave()` writes nothing. Line 45 indexes `TINY_STEPS`.
- Resolves: UK3. Survey the steps for any other moved progression field.
- Commit: Save rescue: owns old money and skill forms, refunds removed parts and goods

### PH4 — Fold history

- 4.1 `game/src/three/save-releases.ts` (create): five hand-merged release steps as named functions: 1 to 6, 6 to 25, 25 to 61, 61 to 62 and 62 to 63. Each takes the format of its `from` anchor only. No-op steps vanish, a field one step adds and a later step changes is written once in its final form, and helper tables move here from `save-layouts-2-2.ts`, `save-layouts-2-34.ts`, `save-text-2-19.ts` and `save-steps-late.ts` when a release step still needs them.
- 4.2 `game/src/three/save-folds.test.ts` (create, first commit of this phase): for each release step, the old tiny chain and the release step give equal worlds on the full anchor saves from PH2 and on the trimmed fixture at that anchor. Both throwing counts as equal.
- 4.3 `game/src/three/save-migrations.ts` (modify, second commit): `RELEASE_STEPS` holds the five, `TINY_FROM = 63`, `TINY_STEPS` keeps only steps 63 to 88. Delete steps 0 to 62, their helpers, their tests and fixtures, except the anchor fixtures.
- 4.4 `game/src/three/save-folds.test.ts` (modify, second commit): the old-chain comparison goes, since the chain is gone. Each release step's output on the full anchor saves is compared with a recorded hash. On a mismatch the test writes the actual world to `tmp/` for a diff.
- 4.5 `game/src/three/save.test.ts`, `game/src/text/fixtures.test.ts:64` (modify): loads at minors 13 and 33 now expect the carry route, or move to an anchor minor.
- Respects: IV1, IV3, IV6. Measures AS3: record the line counts before and after.
- Commits: Save steps: fold shipped history into release steps, proved against the old chain. Then: Save steps: drop the folded tiny steps.

### PH5 — Gates

- 5.1 `game/src/three/save-anchors.test.ts` (create). It reads `release-*` and `hotfix-*` tags and their `save-shape.json`, and throws in a clone with no tags.
  - Every major 2 tag format of the last 10 releases and the hotfixes since is in reach.
  - Every release step's `from` is a tag format.
  - At most one tag format sits above `TINY_FROM`. So dev may ship once more before the fold, and a second ship without a fold fails this test.
  - No release step starts before the window.
- Resolves: UK2 for the game side. Opening a fold issue from the factory at ship is a follow-up task.
- Commit: Save gates: anchors match shipped tags, folds and window stay bounded

### PH6 — Docs

- 6.1 `game/CLAUDE.md` "Save migrations" (modify): tiny steps append to `TINY_STEPS`, the fold rule after a ship, the window, the carry route, editing tiny steps at a fold, the anchor fixtures.
- 6.2 `game/docs/architecture/saves.md` "Versions", "Rescue", "Migration details" (modify): the minor is no longer the step count, routing, how to fold, the gates. Step notes for folded steps move into the release step names or go.
- Commit: Docs: bounded save migrations

### Test strategy

- TDD: write `save-steps.test.ts` and the `outOfReach` routing tests before PH1 code, and the old-chain comparison before the release steps.
- Side effects: a player save at 2.63 loads with no report. A dev save at a folded minor carries with a report and leaves the stored save as it was. `npm run save:shape` still records 2.89.
- Run only touched test files, per the slow-tests rule.

### Order & dependencies

- PH1, PH2 and PH3 run in parallel on disjoint files. PH1 consumes IF1 by its signature.
- PH4 waits for PH1, PH2 and PH3.
- PH5 waits for PH4, since its gates fail while `TINY_FROM` is 0.
- PH6 is last.

### Risks / rollback

- RK1 — A hand-merged release step differs from the chain on a rare save state the fixtures lack. The trimmed anchor fixtures and two full saves per anchor shrink that gap, and the merge keeps each step's logic rather than rewriting it.
- RK2 — Full saves are large and bloat the repo. Measure in PH2 and trim far NPC trucks only if a file is over 1 MB.
- RK3 — An old tag no longer builds or its harness differs. Capture by hand in that checkout and note it in Verify.
- RK4 — Factory agents keep appending to `TINY_STEPS` during this work. Rebase on `origin/dev` before PH4 and again before merge.
- Rollback: each phase is its own commit, and PH4's equivalence commit stands before the deletion commit.

### Interfaces

- IF1 — `carriedSave(slots, slot, icarus, kit, freshSeed, freshRunId)` in `save-rescue.ts`: returns the carried world, report and run id without writing, or null for an unreadable save.
- IF2 [blocks] — Full anchor saves in `save-fixtures/anchors/`. PH4 needs the real files to prove its folds.
- IF3 [blocks] — `RELEASE_STEPS`, `TINY_FROM` and `TINY_STEPS` with real values after PH4. PH5's gates read them.

### Interface graph

- PH1 IF1 -> @ game/src/three/save-migrations.ts, game/src/three/save.ts, game/src/three/main.ts, game/src/three/save-steps.test.ts, game/src/three/save.test.ts, game/src/three/save-migrations.test.ts, game/src/text/fixtures.test.ts
- PH2 -> IF2 @ game/src/three/save-fixtures/anchors/
- PH3 -> IF1 @ game/src/three/save-rescue.ts, game/src/three/save-rescue.test.ts, game/src/sim/world.ts, game/src/ui/save-screen.ts, game/src/text/en/screens.ts, game/src/text/ru/screens.ts
- PH4 IF2 -> IF3 @ game/src/three/save-releases.ts, game/src/three/save-folds.test.ts, game/src/three/save-migrations.ts
- PH5 IF3 -> @ game/src/three/save-anchors.test.ts
- PH6 -> @ game/CLAUDE.md, game/docs/architecture/saves.md

## Verify

Result: passed

Happy-path:
- CK1 (IV1) — a release step ends at a different world than the old chain — held: equal on all 9 full saves and their carries to later shipped formats, and removing any of 3 merged steps fails the proof.
- CK2 — a player save at 2.62 or 2.63 reads as newer or out of reach — held: `loadSave` on every anchor save gets past routing and stops only at `otherMap`.

Negative:
- CK3 (IV2) — saves at minors 0, 13 and 30 refuse, and minor 90 loads — held: the first three give `outOfReach`, and 90 gives `newer`.
- CK4 — a save with a broken world at an anchor escapes as a crash — held: minor 1 with `{ vehicles: 5, player: 7 }` gives `notMigrated`.

Invariants / assumptions:
- CK5 (IV4) — the rescue keeps less from an old raw save than from the same save migrated — held: on 7 of 9 anchor saves the carried worlds match. On 2.6 only the report adds "mg to garage". On 2.25 the raw carry mounts the machine gun and sells one tools crate for 3,667, while the migrated carry stores the gun. Both keep the value, and the rescue read these saves the same way before this change.
- CK6 (IV7) — the carry route writes the stored save at boot — held: in the browser the stored save stayed at 2.45 with its money after boot.
- CK7 (AS4) — factory clones lack the tags `save-anchors.test.ts` reads — held: `factory/src/repo.ts:222` makes a full clone, and fetches follow tags by default. CI uses `fetch-depth: 0`.
- CK8 (AS1) — players hold saves at untagged formats — deferred: itch upload history is not in the repo. Such saves go to the carry route.

Interfaces:
- CK9 (IF1) — `main.ts` calls `carriedSave()` with a different shape than it returns — held: typecheck passes, and the browser smoke boots its world.

Smoke: `node tmp/smoke-out-of-reach.mjs` on a dev server. It planted a current save labeled 2.45 and reloaded. The result was the "Save migrated, Everything carried over" report with no Migrate save screen, money 123456 carried one to one, the stored save unchanged after boot, and no page errors.

Notes:
- Every shipped anchor save fails `loadSave` with `otherMap`, since Icarus and the highway were rebaked after each tag. So every old player save already reaches the rescue screen and its Migrate save button, before any step runs. This predates the change, and the design leaves another map on that screen.
- `phys/ai.test.ts` and `text/catalog.test.ts` fail on base 9e12a126b too. See Code smells.

## Code smells

- game/src/phys/ai.test.ts — "travels between towns without entering either site" and "two NPCs closing head-on never touch: second goal offset -3,-3" fail on base 9e12a126b too.
- game/src/text/catalog.test.ts — 50 entries such as `state.cavalcade` have no Russian words; fails on base 9e12a126b too.
- game/src/version.ts:1-3 — a header comment in a source file, which the repo bans.

## Conclusion

Outcome: the code side of the goal is met at ac994704b. Steps are bounded by release steps, a fold gate and a window of 10 releases, and old saves carry over with no refusal. Whether the fold keeps happening after each ship needs the next real ship to confirm.

Invariants:
- IV1 — the one-time proof against the old chain on 9 full saves plus their carries, and the hashes in `save-folds.test.ts`.
- IV2 — routing probes: 0, 13 and 30 go to `outOfReach`, and 90 gives `newer`. The browser smoke shows the report, not a refusal.
- IV3 — `SAVE_FORMAT.minor` stays 89 and `npm run save:shape` records 2.89.
- IV4 — carried worlds from raw and migrated anchor saves match. `save-rescue.test.ts` compares progression on every anchor save.
- IV5 — a refund test with an injected price table. The real table is empty.
- IV6 — the release steps import only the step helpers, and `save-rescue.ts` no longer imports `save-migrations.ts`.
- IV7 — the browser smoke kept the stored save unchanged after boot.

### Assumptions check
- AS1 — unverifiable — the itch upload history is not in the repo. Untagged formats go to the carry route.
- AS2 — held — dev and candidate builds use their own `SAVE_SCOPE`.
- AS3 — violated — the code shrank 17%, from 1,196 to 999 lines. Tests shrank 66% and fixture files 70%. The full anchor saves add 3.2 MB. The real bound comes from the window and the fold gate, not from merge savings.
- AS4 — held — the factory makes full clones, and CI uses `fetch-depth: 0`.

### Unknowns outcome
- UK1 — resolved — the harness ran inside a checkout of each tag, through `tmp/capture-save.mjs`.
- UK2 — resolved on the game side — `save-anchors.test.ts` fails at a second unfolded shipped format. Having the factory open a fold issue at ship is future work.
- UK3 — resolved — renamed cab cores, notes, quest variables, the old mode name and gear growth.

Review findings:
- Important, reviewer said the 2.62 and 2.63 saves are carried copies of 2.61 — rejected. Each file has its own run id and capture log, and the highway sim did not change between those tags.
- Important, the "never edit a committed step" rule had been dropped — fixed in ac994704b.
- Important, the rescue's old-form tables can drift from the steps unnoticed — fixed in ac994704b with a raw versus migrated comparison on every anchor save. It catches only fields the anchor saves hold.

Future work:
- The factory opens a fold issue after a ship that brings a new format. This was left out of scope in design.
- A script that captures anchor saves at a tag. `tmp/capture-save.mjs` was adapted per tag and is not committed.

Verified by: a browser smoke of an out-of-reach save on boot, the old-chain proof with 3 mutation checks, and a carry comparison on all 9 anchor saves.

### Deviations from plan

- PH1 and PH3 landed in one commit, e2ee09f01. The pre-commit hook typechecks the staged tree, and each phase needs the other's symbols.
- Routing, `SAVE_FORMAT` and `stepsFrom()` live in `save.ts`, and `RELEASE_STEPS` and `TINY_FROM` in `save-migrations.ts`. A new `save-steps.ts` or `save-releases.ts` broke the quality gate's fragmentation limit for `src/three`.
- The old-chain equivalence test ran but is not committed, since it imports the old chain from `tmp/old-chain/`. It passed on 6 shipped formats with 2 to 12 inputs each, every full save ran without errors, and removing `withTracks_22_24`, `withDutyLegs_59_60` or `withWideMg_42_43` made it fail.
- `RETIRED_PRICES_RESCUE` is empty. No step ever removed a part or good id outright. The rescue reader also learned renamed cab cores, notes and quest variables, the old mode name and the gear growth setting.
- `text/fixtures.test.ts` now renders the shipped 2.25 save carried to the current format. The test that loaded a hand-made minor 33 save is gone, since minor 33 never shipped.
- AS3 did not hold for code. `save-migrations.ts` went from 1,196 to 999 lines. Its tests went from 1,974 to 668 lines, and the trimmed fixtures from 79 files to 24. The full anchor saves add about 3.2 MB.
