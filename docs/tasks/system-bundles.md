# System bundles at Design start

**Status:** validating
**Branch:** system-bundles, from `origin/main`
**Worktree:** `.worktrees/system-bundles`
**Goal:** Reports on the same game system reach one Design agent together, so it fixes shared causes once and not one symptom per card. It is for the user, whose reports arrive in bursts of 30 to 50 after a play session and today become one card each. Confirming it needs a real burst of reports to pass through triage and Design on the server, with the design comment listing every bundled report and its fix. Useless if: tags are missing or all `none`, so nothing bundles; bundles pull cards of unrelated systems; a blocker waits inside a big bundle; the plan drops bundled reports without a word; a release task or hotfix carries `dev` work onto another base.
**Mode:** interactive

## Context
- Each report becomes its own card, and each Design agent sees one symptom. The user's reports keep coming back in the same classes after local fixes.
- Triage bundles today only "the same bug, or a bug in the same code" (`prompts/triage.md:50`), or a request the groomed version serves (`prompts/groom.md:104`). Candidates come from the Triage column only (`bundleCandidates`, `src/stages/bundle.ts:9`).
- A `ready` card moves to Design at once (`pass`, `src/stages/triage.ts:88`). So related reports from one burst sit in the Design column, unbundled, waiting for a worker.
- Bundles already flow through every later stage. `writeIssueInput` (`src/stages/common.ts:70`) puts each bundled issue and its comments into `.factory/issue.md`. The PR closes them, the changelog lists them, Ship closes them, and Deny or a refused design releases them to Triage (`releaseBundle`, `bundle.ts:47`).
- The Design job sets up the clone, then writes the issue input, then runs the agent (`src/stages/design.ts:8-20`). Nothing records that Design started on a card.
- Bundled cards go to Done, and only the lead's branch is built on the lead's base (`baseBranchFor`, `src/stages/common.ts:20`). Nothing checks that a bundle shares one base.
- Hotfix cards start in Design and skip triage (`src/intake.ts:30`).
- The design prompts never mention bundled issues.

## Design
Two pieces. Triage tags each card with one system. A Design job, when it starts fresh, pulls every same-system card that has not started Design into its own bundle. Everything after Design is unchanged, since it already works on bundles.

Systems. A fixed list in factory code: the 14 game mechanics pages by name, `chaos-highway`, `character`, `content`, `crime`, `defeat`, `detection`, `economy`, `factions`, `npcs`, `social`, `truck`, `turns`, `world`, `world-settings`, plus `ui`, `art`, `sound` and `writing`, plus `none`. The factory never imports game files, so the list lives in the factory.

Tagging. Triage and groom return a required `system` field for `ready` and `vote`. The factory adds the label `system:<name>` to the issue. A report that blocks play, like a crash or a stuck truck, gets `none`, and so does a report that fits no system. A `none` card neither pulls nor is pulled. Hotfix cards skip triage, so they have no tag and stay alone.

Pull at Design start. In `design.ts`, after the clone is ready and before `writeIssueInput`, the lead's first Design job does this:
- Under the state lock, it records the lead and the candidates in `state.designStarted`, and the candidates under `bundles`, before any card moves.
- Candidates are cards in the Design column with the lead's system label, the lead's base, no running job, no hold, not in `designStarted`, not a bundle lead, and not labeled stuck, `needs-info`, `voting`, `hotfix`, `adhoc` or `bundled`. A card in Triage still needs its own triage.
- It then comments, labels and moves each bundled card still in Design to Done. A retry after a failure finishes the moves the failed job left.
- If it moved any card, it removes `design-sonnet` from the lead, since a bundle is no longer a trivial card.
- The tick starts no job on a card a bundle carries.

Design prompt. `prompts/design.md`, which also holds the bug prompt, gains one rule: look for causes the issues share, and the plan lists every bundled issue with the fix that covers it, or says why it gets none.

Triage keeps its same-code bundling and its duplicate joining as they are.

Tradeoffs.
- A bundle can grow large after a burst. There is no cap, since any number would be arbitrary. Design spend per card rises, and spend per report should fall.
- A report that arrives after its system's card started Design waits for the next same-system card, which forms when that report's own card starts Design.

Backwards compatibility. Cards already on the board have no system label. They neither pull nor are pulled, so they finish as today. `state.designStarted` starts empty. No migration.

TDD: yes. The pull rule is deterministic code with clear cases, and a regression would silently stop bundling.

### Invariants
- IV1 — A Design job pulls only cards with the lead's system label, the lead's base branch and no `none` system.
- IV2 — A card that started Design, has a running job, leads a bundle, or carries stuck, `needs-info`, `voting`, `hotfix` or `bundled` is never pulled.
- IV3 — A resumed Design job pulls nothing, so the running agent's input never changes under it.
- IV4 — `ready` and `vote` verdicts without a valid `system` fail parsing, like a missing `complexity` does today.
- IV5 — Two Design jobs starting together never pull each other, since each is in `state.jobs`.

### Principles
- PC1 — Reuse `addToBundle`, `bundleOf` and `releaseBundle`. A pulled card behaves exactly like a triage-bundled card from then on.
- PC2 — The label `system:<name>` is the one record of a card's system. Code reads the label and never infers the system from text.

### Assumptions
- AS1 — Haiku triage and the groom run tag systems well enough that bundles hold related reports.
- AS2 — The user's reports arrive in bursts, so several same-system cards wait in Design when the first starts.

### Unknowns
- UK1 — Whether one Design session copes with a bundle of 15 or more reports within its time and spend limits. Watch the first real burst.

## Plan

### PH1 — Systems list and triage tagging
- New `src/systems.ts`: the system list, the label prefix, and `systemOf(labels)` returning the system or null.
- `src/stages/groom.ts`: `readSystem` next to `readBundle` (`groom.ts:99`). Require it in `readGroomed` for `ready` and `vote`.
- `src/stages/triage.ts`: require `system` in `readReady` (209) for a `ready` bug. In `pass` and `vote`, add the `system:<name>` label through `ctx.github.addLabel`.
- `prompts/triage.md` and `prompts/groom.md`: a short `System.` section with the list and the `none` rule for blockers, and the field in the JSON shape and the required-fields lines.
- Tests in `src/stages/triage.test.ts`: a `ready` verdict without `system` fails; a valid one labels the issue; `none` labels `system:none`.

### PH2 — Pull at Design start
- `src/types.ts` and `src/state.ts`: `designStarted: number[]`, empty by default. Drop an issue from it when its card closes, in the same place `closeBundle` forgets bundles.
- `src/stages/bundle.ts`: `systemCandidates(state, cards, lead)` applying IV1 and IV2, sorted by issue number like `bundleCandidates`.
- `src/stages/design.ts`: `pullSystemBundle(ctx, issue)` called after `prepareWorkClone` and before `writeIssueInput`, only when not `isResuming`. It runs under the state lock, records `designStarted`, calls `addToBundle`, and removes `design-sonnet` when it pulled any card.
- Tests in `src/stages/design.test.ts`: pulls same-system cards from Triage and Design; skips other systems, `none`, other bases, started, running, held and labeled cards; a resume pulls nothing; `design-sonnet` is removed only when cards were pulled.

### PH3 — Design prompts and docs
- `prompts/design.md` and `prompts/design-bug.md`: the shared-cause rule and the per-issue line in the plan.
- `docs/stages.md`: Triage gains the system tag. The bundle paragraph at line 38 gains the pull at Design start. Design gains the prompt rule.
- `docs/state.md`: the `designStarted` field and the `system:*` labels. `src/position.ts` and `src/ctl.ts` get whatever the factory state rule in `factory/CLAUDE.md` requires for the new field.
- `docs/process.md:50`: the meaning of bundled includes same-system pulls.

### Risks
- RK1 — Triage puts most reports into one or two systems, like `npcs`, so bundles get huge. Mitigation: UK1 watch on the first burst.
- RK2 — A mis-tagged blocker gets pulled into a big bundle and is fixed late. Mitigation: the `none` rule in both prompts, with a blocker example.

### Code smell found, out of scope
- `src/public/votes.ts:99` `reject` moves a rejected vote to Done without `releaseBundle`, so its bundled issues stay in Done.

## Verification
- `npm test` for the touched test files and `npm run typecheck` in `factory/`.
- A local tick run is not possible without GitHub, so the end check is on the server: the next play burst passes triage, every card gets a `system:*` label, and the first Design job per system shows "This card also carries" for its same-system cards. The design comment lists each bundled issue with its fix.

## Conclusion
Built on branch `system-bundles` from `origin/main`. Triage and groom tag every `ready` or `vote` card with a `system:*` label, and a Design job's first start pulls every undesigned same-system card waiting in Design into its bundle. The full factory suite passes, 1978 tests, and so do typecheck and the quality hook.

Deviations from the plan, all from the review:
- The pull records the bundle in state before any card moves, and a retry finishes moves a failed job left. The first version moved cards first and could strand them on a GitHub failure.
- Only cards in the Design column are pulled. A card in Triage still needs its own triage, like a card a released bundle sent back.
- `designStarted` is never pruned. A card can come back to Design after it closes, and the list grows by one number per designed card.
- The tick starts no job on a card a bundle carries, which closes the short gap between the state write and the move to Done.
- A lead re-running Design pulls nothing, which covers resumes, retries and redesigns with one rule, so no `isResuming` check was needed.

Left open:
- A card's labels and column come from one board read before the state lock. A control command that moves a Design card in the seconds between can still be bundled. The tick and the agent stages never touch a Design card without a job, so only a manual move can hit this.
- AS1, AS2 and UK1 need the first real burst on the server, so the Goal is not confirmed yet.
