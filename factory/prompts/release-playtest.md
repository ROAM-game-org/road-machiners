This is the release playtest of the ROAM factory.
You work alone in a clone of the `dev` branch at commit {{sha}}. Every change merged into `dev` since the baseline is in it, and `.factory/release-features.md` lists the features of this playtest.
You review the run, fix what this release broke, and the factory replays the seed on your fixes. This is play 1 of at most {{runs}} in this job. The last play of this job can only pass or block. Plays of earlier jobs count toward no limit of this job.

{{gameDocs}}

Change only game code, its tests and its docs, and commit each fix. Do not push, change git branches or rewrite history. Write the factory files only in `.factory/`.

{{browser}}
The factory runs the game's full suite on GitHub Actions on the commit {{sha}} and on your fixes. Never run the whole suite here, since it takes longer than your job limit on the CPUs you share. Run the test files near each change.

The factory played one progression run of the release and one of the baseline: seed {{seed}}, {{turns}} turns, the markov bot, which plays a random one of the other bot archetypes for a stretch of turns, then draws again.
- `.factory/playtest/log.jsonl` is the release at commit {{sha}}.
- `.factory/playtest/baseline.jsonl` is the baseline at commit {{baseline}}, {{baselineKind}}. Its harness may be older, so read its `run` line for its bot and limits.
Each line is JSON with a `k` field:
- `run`: the seed, turns, commit and the limits of the harness.
- `event`: one game event with its turn. `e.t` names the event. `src/sim/types.ts`, type `GameEvent`, describes each one.
- `snapshot`: the player and every NPC every 50 turns: position, top goal, resources and defeat state.
- `end`: complete, death or error, with the error message.
- `summary`: counts of events, NPC goals, shots, rounds that hit, kills, the player's money gained and spent, and XP.
`.factory/playtest-facts.json` and `.factory/playtest-baseline-facts.json` hold the facts the factory read from each log. `.factory/playtest-history.md` lists the plays of earlier jobs on this release and the committee's decisions. Respect those decisions. `.factory/open-bugs.md` lists the open bug issues.

Read the whole release log, start to end. It is long, so read it in chunks with jq, grep or a short script, and keep going until you covered every turn.
`.factory/release-features.md` lists every feature the release brings, with its issue, title and issue text. The seed run does not play them, so you play each one yourself, to its end:
- Use the progression harness or a Playwright script on the dev server, whichever reaches the feature. A quest chain is played to its last step. Every new chassis is driven on the road. Every new screen is opened in both languages.
- Read `../docs/incident-log.md`. Each entry is an incident: what went wrong and what it cost. For each incident this release could repeat, play the release the way that incident would show.
- Never claim you played a feature you only read. When you cannot play one, say so in the report and in `limitations`.
A replay re-checks only the features you fixed.

Check:
- movement and goals: trucks that go somewhere and arrive, goals that start and end, trucks that stop moving, stall events.
- interactions: trade, scavenging, tows, aid, calls, jobs and contracts, and who did them.
- combat: shots, hits, part damage, knockouts, kills and deaths. Whether fights start for a reason and end.
- progression: XP by source, level ups, money, fuel and supplies over the run. Resources that run out, pile up or never move.
- errors: an error ending, a stall, impossible values like negative money, NaN or positions off the map, and repeated loops.
- drama: whether anything memorable happens, or the run is empty.
The harness has limits. Every truck travels in far mode, so physics, close driving and crashes never run, and the bot makes only the choices its archetype makes. Never claim coverage of what the run cannot show. Name those gaps as limitations.
To confirm a suspicion, read the code, run the tests near it, or play a short run with `npm run progression:playthrough -- --seed {{seed}} --turns <n> --out tmp/check.jsonl`.

The rules of the review follow. `.factory/playtest-review.md` holds the same text.
{{review}}

Fix every important `release` finding with the smallest change, most important first. Never remove or disable a feature, and never change unrelated behavior to silence a finding. Run the tests near each change and the game typecheck. Commit each fix with a message that names it.
{{fixDocs}}

Read `.factory/playtest-review.md` again right before you write `.factory/playtest.json`, and follow its shape exactly. The factory reads no other values.

Write `.factory/playtest.md`, the report for the committee, in plain words, under 400 lines. Keep it up to date in each round, so it covers the whole job:
## Run
Seed, turns, commit, baseline, how the run ended.
## Features
One line per feature of the release: how you played it and what happened. Say plainly which features you could not play and why.
## Observations
## Suspected issues
## Limitations
## Findings
Each with its cause and why.
## Fixes
## Verdict
