# Testing

Tests are part of the game. Each test guards one rule, has a cost that every later run pays, and fails only when that rule breaks. Read this doc before you write, change, speed up or fix a test. [Tools](tools.md#tests) has the commands, the CPU limits and the shared worlds. The [testing practices skill](../.agents/skills/testing-practices/SKILL.md) has the general practice. Incidents R24 to R27 in the [incident log](../../docs/incident-log.md) show what happens when these rules break.

## Why the suite works against us

These are the design faults of the suite. The rules below exist to stop each one from growing.

- Tests reach rules through whole worlds. About half the test files build a world, many of them on the real map with every NPC the seed draws. Their cost grows with the game's content, and a content change breaks tests that never meant to check content.
- Time limits measured the machine, not the test. Agents raised them test by test, then the factory switched them off. A hang there has no deadline, and a slow test shows no cost.
- Cost showed only at merge time. The CPU limits ran only on GitHub Actions, so the agent who wrote a slow test never saw it, and a later merge fixer paid for it.
- Goldens pin side effects. A test that pins the random stream or the next id after world creation moves with every new prop or truck. Each agent re-pins it, so it guards nothing.
- Fixers are rewarded for green. The cheapest way to pass is to cut a sample, loosen a threshold or re-pin a value. Nothing stopped that.
- Nobody owned the size of the suite. It grew from about 250 test files to over 600 in three weeks, and the suite outgrew its time budget twice.

## Rules

Each rule has the check that enforces it. A rule with no automated check is checked in review.

### T1. Test the rule at its owner, with the smallest world that shows it

Call the function that owns the rule. Build the world with `emptyWorld()`, `flatTerrain()` and `addVehicle()` from the test kit, with only the trucks, sites and goods the rule reads. An empty world costs milliseconds, and a start world on the real map costs seconds. When the rule reads one real object, like a claim wreck, a shop or a pad, add a stand-in for that object to an empty world instead of building the start world to get it. Use `standardWorld()` or the real map only when the rule is about the real map or the start world, like a spawn spot or a road on the baked map. Never rebake the map or rebuild nav layers in a test.

Check: the CPU limits, on every run.

### T2. Build the case you test

Put the truck, the site and the state the rule needs into the world yourself. Never pick the first trader, wreck or id the world happened to draw, and never search the start world for a truck that fits. A drawn truck changes when content changes, and the test then fails in a file the change never touched.

Check: review. A test that reads `world.vehicles.find(...)` on a generated world to get its subject breaks this rule.

### T3. Stay inside the budget

A test should take under 2 s and a file under 10 s on a laptop. The hard CPU limits in [Tools](tools.md#tests) apply on every run, scaled by the speed of the machine, so a file that passes on your machine passes on CI.

To fix a slow file, first find where its time goes. Time its setup and its hot helpers, and look for repeated work: the same world built per case, the same geometry checked many times, objects never freed. Make that work cheaper, and keep every case. Share one world per file with `reusedWorld()` and clone it. Split a file only when each case is already cheap and the file is still over its budget. A split lowers the cost of one file but not of the suite, and the suite's total time is the budget that ran out.

Check: the CPU limits, on every run.

### T4. No time limit in a test

Never pass a timeout to `it`, `test`, a hook or `describe`. Never call `budget()` or read `TEST_TIMEOUTS` in a test. A slow test needs a cheaper setup, not more time. A hang must fail and name where it hung, and the stall watch does that.

Check: the pre-commit hook rejects a new time limit in a test file.

### T5. Keep every case, seed, turn and roll

Never cut a sample to make a test faster or to make it pass. A cut sample hides the rare case it was there to catch. To cut cost, make each case cheaper or share the setup, as T3 says. When you split cases over files, the split keeps the total: two files of 10 seeds replace one file of 20.

Check: the pre-commit hook rejects a commit that lowers the total of a sample count in test files.

### T6. Pin only what the player keeps

Pin exact values only for a contract that must never change by accident, like the saved shape. For determinism, run the same seed twice and compare the two results. Never pin the random stream, the next id or a drawn position to show that a change left world creation alone. Assert what the rule says instead, like "the new wreck takes no draw from the shared stream".

A re-pin is right only when your change was meant to move that value. The commit message then names the change and why the value moved. A re-pin to whatever the new code produced is never a fix.

Check: review.

### T7. A failing test you did not touch guards a rule

Read the test name and find the rule it guards before you edit it. If your change broke that rule by accident, fix the code. If the request changed that rule, change the test to the new rule and name the request in the commit. Never move a threshold to the value the code now gives.

Check: review, and T5 for sample counts.

### T8. Run tests in proportion

While you work, run only the test files near the change with `npx vitest run <files>`. The full suite runs only on GitHub Actions, through `scripts/land-dev.sh` or the factory. On the factory host, run targeted files with `TEST_WORKERS=1`, and never the full suite. A stopped run is confirmed gone by its process tree, since a busy vite-node worker ignores the stop signal.

Check: the factory host caps the memory of the factory user's processes.

### T9. A hang fails loud

Every test and playtest run has a stall deadline from `TEST_STALL_MINUTES`. A run that prints nothing for that long fails and names the last step it finished. Never switch a stall watch off, and never answer a hang by rerunning the same commit.

Check: the stall watch in `test:cached` and in `npm run playtest`.

## Checks

- The pre-commit hook rejects a new time limit in a test file, and a lower total of a sample count over the test files of the commit. `quality/README.md` describes both.
- The CPU limits of 30 s per test and 90 s per file run on every Vitest run, scaled by the speed of the machine.
- `npm run test:cached` and `npm run playtest` stop with a failure when they print nothing for `TEST_STALL_MINUTES`.
