# Incident log

ID: R1
what: Code that runs per point, per segment, per turn or per frame walked whole world lists instead of a spatial index or a cached result. Terrain and scatter scanned every road segment per point, route planning scanned every obstacle, and armor and NPC loadouts were rebuilt on every call. The path preview ran on the main thread.
cost: Route planning took most of a turn until ObstacleBuckets. Sight checks took 32% of headless turn time. Turn seams froze for 115 to 265 ms until hotfix #494, a repeat of issue #40.

ID: R2
what: Prices, wages, fees and rewards were guessed instead of measured with the economy harness. Wages came from a calibration that crashed. Tow fees came from a guessed trade profit. The #500 person hunt paid 37 m, a #766 contract paid 13 m, and #370 priced panniers at 4k and showed cents instead of M.
cost: The contracts bot lost money and stranded players got tows they could not pay. The committee sent #500 back with "run the econ sim to understand what's fair pay", and asked the same about #766.

ID: R3
what: A player could get stuck for good. Tows were offered to broke players, a blocked tower held its rescue claim forever, and a player who reached Bowl with a stripped engine found no engine for sale.
cost: Issues #93, #94 and #97 shipped until release 2026-10-07. Hotfix #789 fixed the Bowl softlock.

ID: R4
what: The boot, saves and sound broke when one browser feature or fetch failed: a sound that did not decode, a dropped fetch, IndexedDB refused or closed, a strict write that Safari aborted, a zero-size view that made a NaN sound pan, and an audio unlock on the first input only. Each fix patched one symptom, and errors blamed the wrong cause.
cost: About 14 hotfixes on releases 2.61.x, from #481 to #750. Safari, Firefox and Android players could not start the game or lost saves. The owner asked why the same sound bug took "like a thousand fixes" before anyone found the cause.

ID: R5
what: Views asked the sim about states the sim does not hold. The inventory asked repairPlan() about a part mounted only in the pending refit, and a buggy with caltrops on its nose cell had no surface lookup.
cost: Crashes on releases 2.61.0 to 2.61.43 until hotfixes #515 and #502. 35 placements on 7 chassis could do the same.

ID: R6
what: restoreDrive() shared records with the playback snapshot instead of copying them, so the worker got a missing Rapier handle.
cost: A player could not pass turn T58 from release 2026-10-01 until issue #96.

ID: R7
what: The factory wrote to GitHub too often. Hermes thumbs-upped issues to pass the vote gate, every job posted a "finished after N min" comment, and intake re-added cards with a comment on every tick.
cost: GitHub suspended the bot account on 2026-10-14. About 355 issues and PRs were hidden, and the factory moved to a new org.

ID: R8
what: Designs used markers and tips instead of the world. #506 survey sites had map markers and selection rings, #507 had a floating Claim label, #500 finished a person hunt with "radio them", #660 taught selling with a floating tip, and NPCs gave distances in meters.
cost: Four redesigns in one day on 2026-10-14, then #660 and #814. The owner still asked "what is a hulk and how am I supposed to find it" after the second round of #814.

ID: R9
what: Agents fixed a nearby, easier problem instead of the reported one. #593 brightened the night when the terrain had vanished. #744 removed Nose's pad instead of the dark circle under it. #815 hid places in the 3D world when the issue meant the map.
cost: A redesign each, after the committee played a build that did not touch the report. About 22 critiques of this kind since 2026-10-01.

ID: R10
what: New models ignored the reference and the scale of the game. The #442 hauler was tiny next to the scout. The #795 Scout did not look like the reference pickup. The #760 Sorokonoga ignored its concept and then copied it with too much detail. #770 wheels were huge on the Bukhanka and clipped through the bus doors.
cost: #795 took three rounds, #760 three, #442 three and #770 a redesign. The owner had to say "send Opus" each time.

ID: R11
what: Changes were shown and fixed on one case when they applied to many. #691 drew the condition diagram for the scout only. #770 sized wheels per truck instead of by one rule. #764 opened I, C and J in text scenes but not the menu, save, load or language.
cost: #691 took four patches. The owner asked for "an atlas of all chassis, don't bandaid just the scout".

ID: R12
what: Screens ignored the UI design system. #594 had an oversized Continue button and a stray tiny caption. #571 added a rotated minimap with no zoom or pan. #765 wasted vertical space and had a huge centered Back button. #769 offered a toxic palette. #488 hid the speedometer and health on phones.
cost: About 29 critiques, with redesigns of #571, #765 and #769. Mobile play stayed unusable through #784 to #790.

ID: R13
what: Features did not work when played, though the post said they did. At #607 the owner waited at the Hollow until dusk and nothing happened. #703 had a blank portrait. #580 intro talk fired only after a knockout. #758's follower drove away from an overheated truck. Chaos Highway crashed new games in #714 and let enemies block the outpost in #808.
cost: About 54 critiques, the largest group. Players reported Chaos Highway and the mobile controls broken after they shipped.

ID: R14
what: Player text read like a machine wrote it. Quests had semicolons and riddles, #814 had "ai slop" contract text, the intro said north for east, NPCs repeated the same lamp story, and the #792 Russian twin kept the old law. Russian lines were not natural.
cost: About 32 critiques. #788 had to remove slop from every text quest.

ID: R15
what: Effects did not look physical. Oil spills and city grounds drew as circles, dust plumes popped up instead of forming from trails, part breaks and shots happened at turn end, and light passed through walls. #804's reactor first showed no light, then a glow on the sand with no source.
cost: About 15 critiques. #804 took two patches and the owner wrote "God please fix".

ID: R16
what: Bug fixes treated the symptom. Sound decode failures were fixed one file at a time. A crippled raider was stopped from hunting without asking why it hunted. #490 was fixed again and again.
cost: About 10 critiques and many duplicate hotfix cards, which the owner had to approve one by one.

ID: R17
what: Builds dropped points of the request or added things nobody asked for. #758 shipped without the follower fixes. #163 added a "Pinned" label and a huge aim button. #111 lacked the perimeter and barriers the issue named.
cost: About 15 critiques, and a follow-up card for each dropped point.

ID: R18
what: Merges brought back old versions or dropped other cards' work. An old version of the power explanation was merged, the M icon and the active contract panel vanished, and #771 broke the tutorial.
cost: About 7 critiques and urgent fixes on main.

ID: R19
what: Post screenshots and text did not show what they claimed. #804's screenshots hid the reactor behind a tutorial popup. #815's post claimed the map already behaved right.
cost: The committee played builds to learn what the screenshots should have shown.

ID: R20
what: Proposals against the game's pillars reached a vote or a build: WASD driving #346, real-time combat movement #658, map coordinates and waypoints #858, a compass #859, and fishing #727.
cost: Members vetoed five proposals. #727 fishing was built and then denied on 2026-10-18.
