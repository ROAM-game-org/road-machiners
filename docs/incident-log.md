# Incident log

An entry is a class of bug that cost players, saves, data or a lot of work. A new bug of a known class updates that class's entry. A one-off bug that fits no class gets no entry. Design plans around these classes, testing plays their checks, and hardening reviews the change against them. A repeat of a class is a serious finding.

Each entry has five lines: `ID`, `repo`, `rule`, `check` and `seen`. The repo is `game` or `factory`. The rule says what the code must do. The check says how a reviewer or a playtest finds a break. The seen line lists the bugs of the class and what they cost. Ids run R1, R2 and so on. A blank line separates entries.

ID: R1
repo: game
rule: Code that runs per point, per segment, per turn or per frame finds things through a spatial index or a cached result, never a full pass over a world list. Data that does not change is built once. Turn work runs off the main thread, with its preview and warm-up.
check: For each loop in turn, frame or map setup code, ask what it walks. A pass over all obstacles, props, road segments or chassis inside another loop is a repeat. So is derived data rebuilt on every call, and turn work left on the main thread.
seen: Terrain and scatter scanned every road segment per point until RoadIndex in commits 03c81e69 and 962f671b, after the scan was written twice. Route planning took most of a turn until ObstacleBuckets in commit 3a977fde. propsNear() still filters all 2148 obstacles, and sight checks took 32% of headless turn time on 2026-10-02. Commits 99230d56 and 9241e607 fixed rebuilds on every call in armor.ts and NPC loadouts. Hotfix #494 moved the path preview off the main thread after turn seams froze for 115 to 265 ms, a repeat of issue #40.

ID: R2
repo: game
rule: A price, wage or fee comes from a measured run of the economy harness or from a formula on a measured number, never from a guess or a run that crashed.
check: For each new or changed number in game/src/data, find the run or formula it comes from. A number with no source, or with a source run that crashed, is a repeat.
seen: EFFORT.wage tier 1 in market.ts came from a 30-day calibration that crashed on 2026-09-28, and every item price followed it in commit 4c78d169. The contracts bot lost money. TOW fees in tow.ts came from a guessed trade-run profit, so stranded players got offers of 300 to 400 until issue #97 derived the fee from the wage.

ID: R3
repo: game
rule: A stranded truck is never stuck for good, as DESIGN.md says. Every rescue finishes for a player with no money, and every claim on a rescue has a timer.
check: Play a stranded player with money 0 or less, and a responder whose path is blocked. The rescue must arrive, must not cost more than the player can pay, and must free its claim when it cannot get through.
seen: Issue #97 fixed tow offers of 2.4 days of earnings. Issue #94 fixed a blocked tower that held its claim for good, and a responder that rammed a patrol. Issue #93 fixed an offer that put a broke player into debt. All three shipped until release 2026-10-07.

ID: R4
repo: game
rule: The boot survives the failure of any one asset, fetch or browser feature. It retries a dropped fetch for about 10 seconds, gives a failed asset a stand-in, reports it and goes on. A model or map download that fails all its tries shows the player a connection screen, not a crash. Each error names its real cause. This covers every script the game loads after boot too, such as the turn and preview workers.
check: Boot with one sound, model or map fetch dropped, with one sound that never decodes, and with IndexedDB refused. Play a turn with the worker script fetch dropped, and read the report it gives. The game must reach the menu each time. A network failure must not be reported as a decode failure. Before planning a fix for a boot report, check whether main already has it, since a dev build can lag main. A boot report from a build older than main's last R4 hotfix gets that check at triage, before any design.
seen: Hotfixes #483, #482, #493 and #496 fixed sound and asset failures on release 2.61.0, after Safari, Firefox on Android and Android Chrome players could not start the game. Hotfix #519 fixed an iPhone Safari player whose browser refused IndexedDB. A wrong "failed to decode" message sent triage toward a corrupt file. Hotfix #485 fixed an Android Chrome player on 2.61.0 whose sound fetch failed and was reported as a decode failure, so the game did not boot. It also made a model or map download that fails every retry throw DownloadFailed and show a connection screen instead of a crash report. Hotfix #509 came from two players on 2.61.0 and 2.61.30, on Windows Chrome and Android Yandex Browser, whose boot stopped on one dropped model fetch out of 222. It rebuilt the retry and the connection screen that #485 had shipped, so the work was done twice, and its testing ran 140 minutes before it shipped without factory checks. Hotfix #538 came from a dev build at 2.61.59 that lacked #485 and #509, so the design planned the same retry and screen a third time, conflicted with main twice, and spent 137 minutes in testing before an approval build with no factory checks. It widened the retry window from 4 to about 11.5 seconds, added a Reload button, and added boot checks that drop and lose a model fetch. Hotfix #556 came from a Mac Chrome player on 2.62.34 whose turn worker failed on turn 1 with the report "Turn worker failed: undefined", since a worker that fails to load gives no message. The fix only names the load failure and its script in the turn and preview worker reports. The turn still fails with no retry. Hotfix #539 came from a dev build at 2.61.59 whose map download failed after 3 tries. Its design planned the retry and connection screen a fourth time, it was held, conflicted with main twice, and shipped with no change of its own, since #538 had already fixed it.

ID: R5
repo: game
rule: Save code survives a browser that refuses, closes or aborts IndexedDB. It reopens a dropped connection, falls back to local storage, uses default transaction options, and sends every backend error to the save note instead of out of the turn.
check: Run a save with the connection closed mid-session, and with a transaction that aborts with no error. The turn must finish, and later saves must land.
seen: Hotfix #519 fixed a refused open on iPhone Safari. Hotfix #524 fixed a connection Safari closed, after which no save in the session could land. Hotfix #481 dropped `durability: 'strict'`, which made every Safari write abort from turn 1. All three were on release 2.61.x and put a player's progress at risk.

ID: R6
repo: game
rule: A view asks the sim only about state the sim holds. A planned or pending state is answered from the plan. A sim lookup for a placement the rules allow never throws.
check: For each view call into game/src/sim, list the states the rules allow for its input, such as a planned refit or a part on a bare nose or tail cell. Each must return a value.
seen: Hotfix #515 fixed the inventory, which asked repairPlan() about a part mounted only in the pending refit and crashed on releases 2.61.0 to 2.61.43. Hotfix #502 fixed a buggy with caltrops on its nose cell, which crashed every frame it was in view. 35 placements on 7 chassis could do the same. Hotfix #563 came from a player on release 2.61.43 whose game crashed on turn 129 drawing a raider buggy with panniers on its bare tail cell. Main had already fixed it with #502, so the hotfix shipped only regression tests for that loadout and every hidden part kind on the buggy rim, after a hold and a committee review.

ID: R7
repo: game
rule: A restore or copy of a snapshot deep-copies every record it may change. A physics handle is checked with a named error.
check: For each copy of a snapshot, world or drive, find the records it later changes, and confirm the source does not share them.
seen: restoreDrive() shared records with the playback snapshot, so the worker got a missing Rapier handle, and a player could not pass turn T58. It shipped from release 2026-10-01 until issue #96 in release 2026-10-07.

ID: R8
repo: game
rule: Code that reads a browser size or event handles the zero, missing and refused cases. A zero-size view keeps its last good state. A browser unlock retries until it works. A non-finite number fails loud where it is made.
check: Play with the view at zero width, the page hidden and the phone rotated, and start a game with mouse clicks only. Turns must play, and sound must start.
seen: Hotfix #537 fixed a zero-size view on Android Chrome that made a NaN sound pan, so turn 8 failed. Hotfix #492 fixed an audio unlock that fired only on the first input, so a player who clicked heard nothing.

ID: R9
repo: factory
rule: The factory writes to GitHub as an App, and as little as it can. It never reacts or votes, never comments progress, and never repeats a write on each tick.
check: For each new GitHub write, count how often it runs per card and per tick. A write that can repeat before the board catches up, a comment that only reports progress, and any reaction are repeats.
seen: GitHub suspended the bot account on 2026-10-14. Hermes thumbs-upped at least 27 issues to pass the vote gate. 866 of 1,780 bot comments from Oct 3 to Oct 8 were "finished after N min" notes. Intake re-added cards with a comment on each tick, 19 extra times in one day. About 355 issues and PRs were hidden, and the factory moved to a new org. Commits e6b21614, 04708b06 and e66c407b moved the factory to a GitHub App, stopped the re-adds and made the gh wrapper refuse reactions.
