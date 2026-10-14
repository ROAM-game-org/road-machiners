# Incident log

An entry is a bug that cost players, saves, data or a lot of work, or that repeats a known class. The factory adds entries from shipped bug fixes. The change review reads this file and treats a repeat of an entry as a serious finding.

Each entry has four lines: `ID`, `repo`, `what` and `cost`. The repo is `game` or `factory`. Ids run R1, R2 and so on. A blank line separates entries.

ID: R1
repo: game
what: Terrain, elevation, ground scatter and obstacle placement measured the distance to every road segment for every point. Commits 03c81e69 and 962f671b fixed it with RoadIndex.
cost: Map and world setup ran slowly until two fixes on two days. The same full scan was written again in a second place after the first fix.

ID: R2
repo: game
what: Route planning rebuilt the nav data and tested every blocker for every segment. Commit 3a977fde fixed it with cached nav layers and ObstacleBuckets.
cost: Route planning took most of a turn. The index existed after this fix, and later code still did not use it.

ID: R3
repo: game
what: Commit 8dd44e05 added propsNear() to limit sight checks to nearby props. It still filters all 2148 world.obstacles on every check, so it only narrows the list after a full pass.
cost: On 2026-10-02 a profile showed sight checks take 32% of headless turn time. One in-game day costs 49 seconds, so a 30-day tuning run takes about 25 minutes. Balance tuning waits on that.

ID: R4
repo: game
what: Derived data was rebuilt on every call. Gun layout scoring in armor.ts built one tall-part map per gun in commit 99230d56. NPC loadouts recomputed the armed choices on every roll in commit 9241e607.
cost: Two more slow spots found by hand in two days, each fixed alone. The class kept coming back.

ID: R5
repo: game
what: EFFORT.wage tier 1 in game/src/data/market.ts was set on 2026-09-28 from an `npm run econ` run whose 30-day calibration crashed with "No sellable part". Tiers 2 and 3 were never measured. Every item price was set from that wage the same day in commit 4c78d169.
cost: On 2026-10-02 the same harness measured 0.23 over 30 days and 0.80 over 5 days. The contracts bot lost money with 48 taken and 2 done. The greedy bot ended below the haul-only bot. Prices across the game rest on an unmeasured number.

ID: R6
repo: game
what: TOW.base 40 and TOW.perTile 1.5 in game/src/data/tow.ts were set from a guessed profit of one trade run, never checked against what a player earns. A tow of about 240 tiles cost about 400 with no cap. Issue #97 fixed it by deriving the fee from EFFORT.wage tier 1 with a cap of about 167.
cost: Stranded players got paid tow offers of 300 to 400, about 2.4 days of tier-1 earnings, so a rescue became another money dead end. It shipped until release 2026-10-07. It repeats the class of R5: a price set from an unmeasured number.

ID: R7
repo: game
what: restoreDrive() in game/src/phys/drive.ts copied only the top level of the snapshot, so the restored drive shared its obstacle, body and memory records with the playback snapshot. A main-thread sync then wrote new collider handles into the snapshot that the worker read for the next turn. Rapier got a missing handle and threw "Cannot read properties of null (reading 'handle')" in removeCollider. The bug came in on 2026-09-30 and issue #96 fixed it by deep-copying the records and checking every handle with a named error.
cost: A player on /dev/ could not advance past turn T58, and every retry failed the same way because the bad records carried into the next drive. The game was not saved, so the progress since the last save was lost to a reload. The bug shipped in release 2026-10-01 and stayed until release 2026-10-07, so held-Space and auto-travel turns near props could stop any player's game.

ID: R8
repo: game
what: A tower's `answering` claim on a stranded truck had no timer, and parked on a fixed approach-side spot without checking whether another truck stood there. A tower that could not get through kept its tow goal and its claim for good, since the unstick move counted as progress and no stall was raised. While it held the claim, no other driver could answer. Issue #94 fixed it with a 20-turn claim timer in sight and out of combat, and a free parking spot around the client.
cost: A tow responder rammed a city patrol on its approach and was killed by its gatling. A blocked tower could leave a stranded truck with no rescue, which breaks the DESIGN.md rule that a stranded truck is never stuck for good. The untimed claim shipped in releases 2026-09-30 and 2026-10-01 and stayed until release 2026-10-07.

ID: R9
repo: game
what: offer() in game/src/sim/tow.ts gave a stranded player the full route fee whatever the player's money was, and payTow() in game/src/sim/states.ts took it on arrival even into debt. An NPC client already paid only what it could, so a broke NPC was towed free while a broke player was not. Issue #93 fixed it by making an NPC's offer to a player with money 0 or less free, decided at the offer, with its own "No charge" radio line.
cost: A stranded player with no money got a rescue offer that could not be paid, and accepting it put the player into debt, where nothing can be bought. It shipped until release 2026-10-07. It repeats the class of R6 and R8: a rescue for a stranded player that ends in a dead end.

ID: R10
repo: game
what: The boot downloaded about 120 assets at once, the 104 sounds, every model and the map, and none of them retried a network failure. One dropped download rejected the whole boot. decodeFile() in game/src/audio/bank.ts read the body inside the same check as the decode, so a broken download was reported as "Sound music-calm-3.ogg failed to decode: TypeError: Load failed". Hotfix #483 added fetchBytes() in game/src/fetch-bytes.ts, which retries a dropped connection or a 5xx up to 3 times for sounds, models and the map.
cost: A Safari player on the itch.io release 2.61.0 could not start the game, and the boot screen stayed on the failed step. Issue #485 reported the same file failing on another browser. The wrong "decode" message sent triage toward a corrupt file or a format bug instead of the network.

ID: R11
repo: game
what: A quest load replays from the last checkpoint up to its first choices. The checkpoints of the arrival farm, the wagon_seven hub and the wagon_bench hub sat on bare choice lists in page quests, so a load showed the image, heading and choices with an empty story panel. The arrival shed had no checkpoint of its own, so a save at the shed seat loaded back into the house and offered the 50 M house loot again. Hotfix #478 moved the checkpoints to each scene's opening line, added a start.shed checkpoint, added save step 61 to 62 for old hub saves, and made `npm run quests:check` fail a page load that shows choices and no text.
cost: Any player who loaded a save in the first scene of a new game, or at either wagon hub, lost the text that explains the choice. A save and reload at the shed paid the house loot twice. It shipped on main and itch.io until the hotfix. The fix took two issues, #474 and #478, and three test runs that hit the 45-minute limit, so it shipped with no factory checks.

ID: R12
repo: game
what: The boot decoded every sound and threw "Sound X failed to decode" when one file failed decodeAudioData, so one sound the browser could not decode stopped the whole boot. The sound files were valid. Firefox on Android failed to decode them. Hotfix #482 retried each decode and gave a file that still failed a sibling's buffer or a silent stand-in, so the game boots and reports the failures. Hotfix #493 only added a test for a two-file cue with one file that never decodes.
cost: A Firefox on Android player on release 2.61.0 could not start the game when mortar-fire-2.ogg failed to decode, after the same failure with hit-metal-2.ogg in #482. It took two hotfix issues. It repeats the class of R10: one asset failure at boot rejected the whole boot.

ID: R13
repo: game
what: The path preview ran on the main thread in the first frame after each turn. It cloned the world and simulated up to three physics turns there, so each turn seam froze a frame. warmAfterBoot() in game/src/three/main.ts also built route grids for every chassis radius on the main thread right after boot. Issue #40 had moved turns to a worker but left the preview and this warm-up on the main thread. Hotfix #494 moved the preview into its own worker and removed the main-thread warm-up.
cost: A committee player on the main release saw pauses between turns right after starting a new game. Their overlay showed the last preview at 59.9 ms against a 50 ms budget and the last turn at 189.5 ms against 100 ms, while FPS read 60. On the factory host, each seam froze for 115 to 265 ms and boot ran 10 long tasks of 250 to 990 ms. It repeats the turn-seam stutter of issue #40 and took a hotfix with cross-system profiling.

ID: R14
repo: game
what: In release 2.61.0, loadBank() in game/src/audio/bank.ts fetched every sound in one Promise.all, so one rejected fetch stopped the boot with "TypeError: Failed to fetch". Hotfixes #482 and #483 had already added the retry and the stand-in, but decodeFile() still sent a network failure into the same SoundDecodeFailure report as a missing or broken file. Hotfix #496 split out unreachable sounds, which get a stand-in and a console warning and send no error report.
cost: An Android Chrome player on release 2.61.0 could not start the game. After the earlier hotfixes, every dropped mobile connection at boot would still have sent an error report and shown a line in the release error console for a game that ran fine. It took a third hotfix issue. It repeats the class of R10 and R12: one asset failure at boot rejected the whole boot.

ID: R15
repo: game
what: CameraRig.resize() in game/src/three/render/camera.ts built the camera frustum from the container size with no check. When the game view had zero width or height, as a phone can report for a moment while it rotates, hides the page or switches fullscreen, the projection held NaN or Infinity. spatial() in game/src/audio/pick.ts passed the NaN screen x through Math.min and Math.max as a pan, and Web Audio threw "The provided float value is non-finite" at the start of a turn. Hotfix #537 kept the last frustum on a zero-size view, centred the pan with no width and made spatial() throw a named error on a non-finite position.
cost: An Android Chrome player on release 2.61.43 had turn 8 fail with the error, so the turn did not play. Any phone player whose view briefly had no size could hit it. It took a hotfix to main and itch.io.

ID: R16
repo: game
what: Mixer.unlockOn() in game/src/audio/mixer.ts called ctx.resume() once on the first pointerdown or keydown, with each listener set to fire only once. A browser can refuse to start audio on a mouse or touch pointerdown, so the AudioContext stayed suspended and the listener was already spent. A player who only clicked heard nothing until a key press, and the game seemed muted though mute was off. Hotfix #492 retried the unlock on pointerup, click and keydown until the context ran.
cost: The committee found the shipped game on main silent at the start of a fresh game. Any new player who started with the mouse heard no music, UI or gameplay sound until they pressed a key. It took a hotfix to main and itch.io.

ID: R17
repo: game
what: Boot in game/src/three/main.ts awaited idbBackend() with no catch, so a browser that refused indexedDB.open() stopped the whole boot on the crash screen with "The game keeps saves in IndexedDB, and this browser refused it: The operation was aborted." There was no retry and no other place to keep saves, though local storage worked and the save code could already read saves from it. Hotfix #519 added openSaves() in game/src/three/save-db.ts, which retries the open once and then keeps saves in local storage under the old keys with the run log in memory.
cost: An iPhone Safari player on release 2.61.43 could not start the game at all. Any browser that refuses IndexedDB, like iOS Safari in the itch.io frame, could not play. It took a hotfix to main and itch.io. It repeats the class of R10, R12 and R14: one browser refusal at boot rejected the whole boot.

ID: R18
repo: game
what: idbBackend() in game/src/three/save-db.ts opened one IndexedDB connection at boot and kept it for the whole session. It never listened for a close and never reopened. When Safari closed the connection on its own, db.transaction() threw "InvalidStateError: The database connection is closing" synchronously, before SaveSlots.put() could catch it. The throw went up through saveWorld and finishPlayback and out of the turn, and every later save and log write in that session failed the same way. Hotfix #524 reopens a dropped or closing connection and retries the call once, and makes SaveSlots and RunLog send any backend throw to the existing save note.
cost: A Safari player on macOS on release 2.61.43 had the turn 21 autosave crash the turn. The save did not land, and no later save in that session could land, so progress since the last good save was at risk. It took a hotfix to main and itch.io. It repeats the class of R17: a browser IndexedDB failure that the save code did not survive.

ID: R19
repo: game
what: The inventory in game/src/ui/inventory.ts decided whether a selected part was mounted from the truck with the pending refit plan applied, then built its field patch button by asking repairPlan() about the real truck. A part dragged onto a mount cell but not yet refitted was mounted in the plan only, so findRepairPart() in game/src/sim/repair.ts threw "p48 is not a mounted part on v1" and the inventory render died. Hotfix #515 shows the patch button only for a part mounted on the real truck.
cost: A player on release 2.61.0 had the inventory crash at turn 10 after a drag, and the same error came again from players on releases 2.61.30 and 2.61.43 before the fix. Each time the inventory stopped working in the middle of a refit. It took a hotfix to main and itch.io.
