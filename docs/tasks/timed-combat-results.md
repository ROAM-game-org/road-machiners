# Timed combat results

Timed combat reduced combined damage per turn in the matched duel set. Each highway seed reached one more stretch. One of three highway runs cleared three stretches, compared with none before. This is a comparison of these runs, not an estimate of general survival odds.

## Game behavior

Timed combat is the default in `feature/timed-combat`. The simulation schedules firing attempts, moves projectiles, and applies damage at impact. A blocked attempt is lost. Later attempts keep their original times. Broken parts affect the remaining movement and firing in that turn. Flights survive turn boundaries and save loads. Playback uses the recorded launches and impacts.

All 19 registered weapons use the same projectile settings in simulation and playback. Armor, splash, shotgun pellets, strays, harpoons, defeat, salvage, and experience use their existing owners. No weapon balance setting was changed. The main checkout has not been merged.

Play the staged fight at <http://127.0.0.1:5189/?play&combatPrototype>. The query stages the fight. It does not select a separate combat system.

## Duel comparison

Each version ran 18 fights. Each armor group contains three weapon pairs and seeds 1337, 41, and 73. Both sides use the `buggy` driver policy, a full-condition hauler, one gun, an initial gap of 8 tiles, an orbit setting of 6 tiles, and a limit of 120 turns. The arena is open ground. Both versions use the real physics mover.

Damage means recorded part damage across both trucks. The rate divides total damage by total fight turns in that group. It excludes passive wear and includes hits on trucks destroyed during the turn. Hit rate divides recorded rounds that hit by recorded rounds fired. Fight length includes truces and retreats. It is not time to kill.

| Armor | Mean turns before | Mean turns after | Damage per turn before | Damage per turn after | Damage rate change | Hit rate before | Hit rate after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| None | 12.00 | 16.78 | 17.78 | 12.01 | -32.5% | 50.9% | 41.2% |
| Plates | 31.67 | 29.56 | 10.25 | 8.10 | -21.0% | 52.6% | 54.6% |

Unarmored fights lasted 39.8% longer on average. Armored fights ended 6.7% sooner. The effect differs by matchup. Plated machine gun versus shotgun produced slightly more damage per turn after the change.

| Armor | Pair | Mean turns before | Mean turns after | Damage per turn before | Damage per turn after |
| --- | --- | ---: | ---: | ---: | ---: |
| None | Machine gun versus cannon | 3.00 | 15.33 | 49.56 | 11.93 |
| None | Machine gun versus shotgun | 17.00 | 15.67 | 15.10 | 14.77 |
| None | Cannon versus shotgun | 16.00 | 19.33 | 14.67 | 9.83 |
| Plates | Machine gun versus cannon | 35.00 | 15.00 | 12.00 | 11.69 |
| Plates | Machine gun versus shotgun | 34.33 | 41.67 | 10.25 | 10.66 |
| Plates | Cannon versus shotgun | 25.67 | 32.00 | 7.87 | 3.07 |

Before the change, the unarmored group ended with eight truces and one side a win. After the change, it ended with five truces, two side a wins, one side a loss, and one side a retreat. The armored group changed from eight truces and one side b retreat to nine truces. No fight reached the turn limit. A win means that the other side was knocked out of the fight. It does not require every part to be destroyed.

The same seeds do not imply the same shot rolls. Canceled attempts and earlier damage change later random draws and decisions. These results measure the resulting combat system. They do not isolate projectile travel from its effects on driving and firing.

## First three highway stretches

Each version ran the existing escort policy with physics on seeds 1337, 41, and 73. Every run stopped at three completed stretches or the game's loss event. The safety limit was 1200 turns. No run reached it. Damage, fuel use, supply use, and enemy gear growth remained at 1.

| Seed | Before stretches | Before stop | Before world turn | After stretches | After stop | After world turn |
| --- | ---: | --- | ---: | ---: | --- | ---: |
| 1337 | 0 | Abandoned | 120 | 1 | Abandoned | 309 |
| 41 | 1 | Wrecked | 231 | 2 | Abandoned | 472 |
| 73 | 2 | Abandoned | 452 | 3 | Completed | 501 |

The before runs cleared three stretches in zero of three cases. The after runs cleared them in one of three cases. All player trucks were scouts. All haulers were semis. Driver health is out of 106. Cab values below show current and maximum condition at the stop.

| Seed | Version | Driver health | Player cab | Hauler driver health | Hauler cab | Player damage received | Hauler damage received |
| --- | --- | ---: | --- | ---: | --- | ---: | ---: |
| 1337 | Before | 99 | 60 / 120 | 100 | 120 / 120 | 264.4 | 20.0 |
| 1337 | After | 102 | 71 / 120 | 94 | 106 / 120 | 380.2 | 308.4 |
| 41 | Before | 77 | 0 / 117 | 89 | 81 / 120 | 485.4 | 254.0 |
| 41 | After | 91 | 36 / 120 | 96 | 120 / 120 | 1004.0 | 568.0 |
| 73 | Before | 106 | 63 / 120 | 87 | 95 / 120 | 993.4 | 220.0 |
| 73 | After | 93 | 120 / 120 | 90 | 120 / 120 | 1016.5 | 397.0 |

No hauler was wrecked or lost its driver in these six runs. The game marks the player state as dead when a run is abandoned. That state does not mean the driver lost all health. The loss event is the source of the stop reason in this report.

| Seed | Version | Broken player parts at stop | Broken hauler parts at stop |
| --- | --- | --- | --- |
| 1337 | Before | Stock engine | None |
| 1337 | After | Steel plate, stock engine | Two heavy wheels |
| 41 | Before | Machine gun, pickup cab | None |
| 41 | After | Two plates, steel plate, stock engine, machine gun, transmission | None |
| 73 | Before | Ram, spaced armor, steel plate, stock engine, wheel | None |
| 73 | After | Ram | None |

The original protocol asked for the same purchases. The runs use the same purchasing policy instead. Purchases and repairs respond to damage and fort arrivals. Different combat outcomes therefore produce different purchases. This measures survivability under the existing policy. It is not a fixed-inventory damage trial. Total damage received can rise because a run survives longer and receives repairs.

## Verification

The final focused run passed 704 tests across 21 files. It covers timed combat, direct damage, far movement, defeat, cab knockout, highway starts and loss, physics, harpoon lines, landing, workers, playback, saves, and migrations. The production build passed. The final browser playtest passed 12 turns at 60.5 frames per second on the local graphics hardware. Night ground and reload checks passed in roaming and highway play.

The staged browser fight recorded machine gun launches near 83, 250, 417, 583, 750, and 917 milliseconds. The narrow-angle case canceled 16 attempts and kept the final two launches near 917 milliseconds. Neither case produced a page error. A separate pause check kept both airborne shots visible while the simulation clock was stopped.

Independent review found that far movement was not following the combat clock and that the duel harness could stop with shots still in flight. Both were fixed and checked with regressions. Follow-up review found an empty-target crash during flight settlement. That was fixed too. A highway run exposed removal of a destroyed truck before physics settlement. Removal now waits for settlement while the truck stops at its impact time.

The initial damage counter omitted hits on trucks removed during a turn. Both comparison versions now count recorded impacts. The baseline's outcomes, durations, rounds, and hit counts match the original capture. The corrected counter changes measurement only. Early comparison numbers are superseded by this report.

## Evidence and reproduction

[Raw evidence](../evidence/timed-combat/) contains both duel sets, configurations, aggregate totals, compressed turn traces, all six highway results, and browser records. Duel source revisions are `a00bcf4fd13eeb9f384fe0abd87e15c629e1d51e` before and `062adae19e8a6eb4ae503b390f0474e69b74865e` after. Highway observer revisions are `539537be661a2e652b76980af1536acd14d5069b` before and `68ed6525bbb8f544d89f09125179f56a13f8d7cd` after. The observer commits do not change game source. The archived source tree identifiers match the duel source trees on each side.

Both highway versions ran with Node `v26.12.1` and the identical collector hash `8d4856caffef3a02fdbba4a57fa1745996789ddeb6e2cd6e17070e6be44ade14`. Run the following command from `game` at each observer revision. Use a new output directory and repeat for seeds 41 and 73.

```sh
npm run combat:highway -- --seed 1337 --turns 1200 --stretches 3 --out tmp/highway-1337
```

The archived `duels.mjs` is the exact comparison runner. Copy it into `game/tmp/combat-rollout-current.mjs` in the selected revision. Run the following from `game`. Use `before` at the baseline revision and `after` at the timed revision. Its output directory must not already exist.

```sh
npx vite-node tmp/combat-rollout-current.mjs before
```
