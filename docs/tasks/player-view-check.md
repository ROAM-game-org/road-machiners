# Player view check in Testing

**Status:** executing
**Branch:** factory/player-view-check
**Worktree:** .worktrees/player-view-check
**Goal:** The Testing stage catches work a player would hate, before the card reaches the committee. The committee is one person who plays only some cards, so agent checks carry most of the QA. Confirming it needs real cards to pass through Testing, with screenshots that show the change as a player meets it and the check's findings fixed. Useless if: the reviewer reads the code, the task file, the issue or the rules docs and so judges by the rules again; the screenshots do not show the change, so the reviewer judges empty frames; findings send the card to another stage; the check adds rounds or a gate that can stall a card; the post grows a report nobody reads; a finding kept on purpose is hidden from the committee.
**Mode:** interactive

## Context
- Slop in ROAM is work that feels out of place, so it is clear no person designed it. Two examples follow.
- On the scout, a gun in the bed cannot point forward. The truck rules say every cab is tall, so the cab blocks the line of fire. By the rules that is right. By the picture it is absurd, since a pickup with a gun firing over the cab is the classic wasteland truck.
- Driver tips spell out game mechanics, like how long a truce lasts. No wasteland driver talks about truces. Card #772 was titled "Drivers give immersive mechanics tips", so the request itself carried the slop, and every stage built it faithfully.
- Both come from one cause. Agents design from the rules and the request, while a person designs from the picture of the world. A rule like "NPCs never mention game mechanics" already exists in DESIGN.md and still fails.
- Every look the factory takes is anchored on the rules. The Testing stage fixes looks that differ from the issue, the task file, DESIGN.md and `ui.md`. The Testing attack subagent sees the issue, task file and diff, and reports only repeats of logged incidents. See "Attack before the post" in `factory/prompts/test.md`.
- Testing screenshots often do not show the change. On card #1313, a ram change, the primary shot is the game start with the truck tiny in the distance, a second is studio renders on a flat floor, and the third has a tip popup over the inventory. On card #1323, a report form change, every shot is the form alone on a blank page, since the full game crashed.
- Local `main` is thousands of commits stale. `origin/main` holds the same factory files as `origin/dev`.

## Design
Two changes to `factory/prompts/test.md`: screenshot rules that show the change as a player meets it, and a second fresh subagent that judges those screenshots against a player rubric.

Screenshot rules:
- Every shot is from the running game, in the place where a player meets the change. Model renders and separate test pages go in extra shots only.
- The change fills a large part of the frame. Zoom or move the camera to it.
- Changed player text shows in place, like a tip in its dialog.
- Tips and popups that are not part of the change get closed before the shot.
- Each image description in `.factory/evidence.json` says what a player is doing at that moment.

The player view subagent:
- It runs next to the incident attacker, before `approval.json` is written. A card with no visible change and no changed player text skips it.
- It gets only the screenshots, their descriptions and `game/docs/theme.md`, and opens nothing else. The issue stays out, since the request itself can carry the slop.
- It first names any shot where it cannot tell what a player is looking at. The testing agent retakes those shots before it acts on the rubric.
- It judges each shot against the rubric and reports each finding with the shot, the rubric line and what a player would hate about it.

The rubric, built from playtest question guides, the HEP playability heuristics and player complaints about broken immersion:
1. World fit: does anything look or read like it does not belong in the world `theme.md` describes?
2. Voice: does any character say game words, rules, numbers or UI terms they could not know?
3. Picture sense: does anything look wrong next to how the real thing works, even if a rule allows it?
4. Convenience showing: does anything exist only for the player's convenience and look like it?
5. Confusion: would a player know what they are looking at and what to do next?
6. Flow breaks: does a popup, a wall of text or a repeated message stop play for no good reason?
7. Consistency: does any art, font, colour or scale differ from the rest of the game?
8. Frustration: what on this screen would make a player groan or quit?

Acting on findings:
- A finding outranks the issue's wording. The testing agent fixes it even when the issue asked for it, recaptures the changed shots and commits.
- The post does not report on the check. The committee reads it to decide at a glance, so it stays shots, a short description and how to try.
- Findings the agent drops stay in the session log only.
- When the agent keeps on purpose something a player might hate, the description gets one short line for the committee to judge, like "Kept: the ram hides the headlights, as real ram bars do." Its reason is about the world or the player, never "the issue asked for it". Most posts get no line.
- No stage moves and no counters. No new column, no send-back, no fixed round count and no new gate. The 45-minute stage budget is the only bound.

Docs: the Testing section of `factory/docs/stages.md` gets the subagent and the screenshot rules.

Work on a branch off `origin/main`.

TDD: no. The change is prompt and doc text with no code.

### Invariants
- IV1 — The subagent brief names only the screenshots, their descriptions and `game/docs/theme.md`, and forbids every other file.
- IV2 — The brief carries all 8 rubric lines and the retake step for unclear shots.
- IV3 — `test.md` says a finding outranks the issue's wording, dropped findings stay off the post, and only a finding kept on purpose gets one short "Kept:" line in the description.
- IV4 — The change adds no code, board column, state field, counter, send-back or gate.

### Assumptions
- AS1 — Agents can take in-game shots that show the change, given the rules. #1323 shows the game can crash in the testing clone, and then only extra shots are possible.
- AS2 — A blind subagent with the world doc and the rubric catches slop like the tall-cab gun and the truce tips. Only real cards through Testing confirm it.

## Plan

Approach: prompt and doc text only, per IV4. `readShown` in `factory/src/evidence.ts` already reads a description for `screenshot.png` when `evidence.json` lists it, so every shot can carry a player-moment description with no code change.

### PH1 — Testing prompt
- 1.1 `factory/prompts/test.md:68-76` (modify), screenshot section
  - Add the five screenshot rules from the design after "Take screenshots of the finished game".
  - Change the `evidence.json` line so it lists every image, the primary included, and each description says what a player is doing at that moment.
  - Respects: AS1.
- 1.2 `factory/prompts/test.md` (modify), new section `## Player view before the post`, placed after the screenshot section and before the `approval.json` section
  - Skip rule for a card with no visible change and no changed player text.
  - Start one fresh subagent with the Agent tool. Give it only the screenshot paths, their descriptions from `evidence.json` and `game/docs/theme.md`. Tell it to open no other file.
  - The brief, quoted like the attack brief: first name each shot where a player could not tell what they are looking at; then judge each shot against the 8 rubric lines; report each finding with the shot, the rubric line and what a player would hate.
  - Retake unclear shots, then fix each finding the agent agrees with, even when the issue asked for it. Recapture changed shots and commit.
  - Run it once per round. A finding is never a reason for `.factory/needs-redesign.md`.
  - Respects: IV1, IV2, IV3, AS2.
- 1.3 `factory/prompts/test.md:32` (modify): add that the player view outranks the issue's wording, so the issue list there does not override it.
- 1.4 `factory/prompts/test.md:80` (modify): a finding kept on purpose gets one short "Kept:" line in the description with a reason about the world or the player. Dropped findings never go on the post.
- Commit: Testing judges in-game screenshots with a blind player view subagent

### PH2 — Docs
- 2.1 `factory/docs/stages.md:63` (modify), the session bullet in `## Testing`: one or two sentences on the screenshot rules and the player view subagent, its blind input, the retake step, and the "Kept:" line.
- Commit: stages.md describes the player view check

### Test strategy
- `npx vitest run src/container.test.ts` in `factory/`, since it reads `prompts/test.md`.
- No new test: the change is prompt text.

### Risks / rollback
- RK1 — The agent can drop real slop to save work, and only the session log shows it. The first real cards' session logs get read to check this.
- RK2 — The stage gets slower with a second subagent and retakes. The 45-minute budget stays the only bound.
- Rollback: revert the two commits.
