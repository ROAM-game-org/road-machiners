# Timed combat

## Goal

Players use one combat system in normal play, Chaos Highway, and the combat harness. Firing attempts have fixed times, blocked attempts are lost, and damage happens on impact. Compare damage and duel length against the unchanged combat system with matched seeds and equipment. Compare player and hauler survival through the first three Chaos Highway stretches. Useless if the harness uses different combat rules, the highway bot avoids its fights, timed shots only change rendering, or lower damage comes from silently dropping unsupported weapons.

## Context

The accepted prototype runs inside the game and supports machine guns, cannons, and shotguns. It stores flight state outside the saved world. Its stationary endpoint check does not yet cover every projectile interaction. Existing combat resolves weapons after all movement. The combat harness uses real physics. The existing escort bot supplies a repeatable Chaos Highway driving policy.

## Design

The simulation owns firing schedules, projectile travel, impacts, damage, and the effects of broken parts on later steps. Playback reads recorded events. Every supported weapon uses the same rules for player and computer drivers. Weapon-specific behavior includes shotgun pellets, splash, strays, harpoons, and gun reloads. Flights continue across turns and save loads. Movement previews must not consume combat randomness or mutate the live world. Far simulation must preserve the same combat outcomes at its declared level of detail.

Use existing armor, damage, experience, hostility, defeat, salvage, and contract owners. Apply impact outcomes once. Preserve live shots after their shooter is disabled. Keep the existing game settings and weapon balance for the first comparison. Keep one registered projectile specification for simulation and rendering. Add a save migration that starts old saves with no flights in progress.

## Implementation order

1. Capture and inspect a baseline duel before changing production behavior.
2. Complete the simulation contract and tests for all weapons, flight persistence, and movement effects.
3. Connect normal turns, worker requests, playback, saves, and the combat harness to the completed simulation.
4. Verify one duel and one highway run in detail before running the matched comparison set.
5. Report damage, hit rate, fight length, outcomes, and survival with the configuration and revision for each run.

## Comparison protocol

The duel set uses the same driver policy, hauler chassis, full condition, starting gap, and seed on both revisions. Compare machine gun versus cannon, machine gun versus shotgun, and cannon versus shotgun with bare and plated trucks. Use three fixed seeds after the first case passes inspection. Retain retreats, truces, and timeouts as distinct outcomes. Inspect the baseline pilot, which ends in a truce after two turns, before interpreting its duration as a defeat.

The highway comparison uses the existing escort policy and the same seeds, purchases, settings, physics, and stopping rule on both revisions. Stop at the third completed stretch or defeat. Record player survival, hauler survival, completed stretches, health, disabled parts, incoming damage, and turns. Keep failed runs and report any stopping limit separately from survival. Do not change the policy or balance to improve the result.

## Verification

Use test-driven development for the production simulation. Tests cover canceled firing attempts, impact ordering, save and worker round trips, shots crossing turns, disabled guns and engines, destroyed shooters, moving targets, every weapon family, and unchanged behavior outside combat. Run focused tests, the quality gate, and a real browser fight. Keep the prototype worktree available for comparison. Do not merge or publish.

## Validation

Timed combat is now the default in the feature worktree. The final focused suite passed 704 tests across 21 files. The production build and final graphics browser playtest passed. Browser records confirm fixed firing times, canceled attempts, and paused flights at turn boundaries. Independent review findings were fixed and covered by regressions. The main checkout remains unmerged.

The matched comparison contains 18 duels per version and three highway seeds per version. Recorded damage includes fatal impacts on removed trucks. Every highway run uses the same collector, settings, escort policy, and stopping rule. The purchasing policy is identical, but realized purchases differ as damage and fort arrivals change. This deviates from the original fixed-purchases wording. See [results and evidence](timed-combat-results.md) for the measurements and revision identifiers.

## Conclusion

Timed combat is the default at runtime source revision `062adae19e8a6eb4ae503b390f0474e69b74865e`. The matched runs show lower duel damage rates and one additional highway stretch reached on each seed.
