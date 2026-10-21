# Incident log

An entry is a class of mistake that cost the committee a round, cost players, saves or data, or cost a lot of work. Its sources are committee patches, redesigns and denies, proposal vetoes, and bugs found after a feature shipped. A new case of a known class updates that class's entry. A one-off gets no entry. A repeat of a logged class is a serious finding, and the stage that finds it fixes it.

Each entry has six lines: `ID`, `repo`, `catch`, `rule`, `check` and `seen`. The repo is `game` or `factory`. The catch line names the earliest stage that must stop the class: `groom`, `design`, `test` or `playtest`. Each stage applies the entries of its own stage and of the stages before it. The rule says what the work must do. The check says how a reviewer or a player finds a break from a diff, a screenshot or a short run. The seen line gives the count, the last date and at most three examples with their cost. Ids run R1, R2 and so on, and a removed id is never reused. A blank line separates entries.

ID: R1
repo: game
catch: test
rule: Code that runs per point, per segment, per turn or per frame finds things through a spatial index or a cached result, never a full pass over a world list. Data that does not change is built once. Turn work runs off the main thread, with its preview and warm-up.
check: For each loop in turn, frame or map setup code, ask what it walks. A pass over all obstacles, props, road segments or chassis inside another loop is a repeat. So is derived data rebuilt on every call, and turn work left on the main thread.
seen: 6 times, last 2026-10-13. Route planning took most of a turn until ObstacleBuckets in commit 3a977fde. Sight checks took 32% of headless turn time on 2026-10-02. Hotfix #494 moved the path preview off the main thread after turn seams froze for 115 to 265 ms, a repeat of issue #40.

ID: R2
repo: game
catch: design
rule: A price, wage, fee, reward or pay comes from a measured run of the economy harness or from a formula on a measured number, never from a guess or a run that crashed. A job pays for the hassle it costs, and no activity has a negative expected reward.
check: For each new or changed number in game/src/data or a new contract, find the run or formula it comes from. A number with no source, a source run that crashed, or a reward that a player would refuse for its effort is a repeat.
seen: 8 times, last 2026-10-19. Wages came from a calibration that crashed on 2026-09-28, and the contracts bot lost money. #500 paid 37 m for a person hunt, and #766 offered 13 m, both "too little, run the econ sim". #370 priced panniers at 4k and showed cents instead of M.

ID: R3
repo: game
catch: playtest
rule: A player is never stuck for good, as DESIGN.md says. Every rescue finishes for a player with no money, every claim on a rescue has a timer, and every story path that takes a part leaves a way to get one back.
check: Play a stranded player with money 0 or less, a responder whose path is blocked, and a player who reaches each town by every route the story allows, with a stripped engine too. The player must be able to drive on.
seen: 5 times, last 2026-10-19. Issues #93, #94 and #97 shipped tows a broke player could not pay, and a tower that held its claim for good, until release 2026-10-07. Hotfix #789 fixed a Bowl softlock after the engine was stripped, with no engine for sale.

ID: R4
repo: game
catch: test
rule: The boot, saves and sound survive any one failed asset, fetch or browser feature. A failed fetch retries, a failed asset gets a stand-in, a refused or closed IndexedDB reopens or falls back to local storage, a zero-size view keeps its last good state, and every error names its real cause.
check: Boot with one sound, model or map fetch dropped, with a sound that never decodes, with IndexedDB refused and closed mid-session, with the view at zero width, and with mouse clicks only. The game must reach the menu, keep saving and play sound.
seen: 14 times, last 2026-10-17. Hotfixes #481 to #496, #519, #524, #537 and #750 fixed boot, save and sound failures on Safari, Firefox and Android players on releases 2.61.x. The owner asked on 2026-10-15 why the same sound bug needed "like a thousand fixes".

ID: R6
repo: game
catch: test
rule: A view asks the sim only about state the sim holds. A planned or pending state is answered from the plan. A sim lookup for a placement the rules allow never throws.
check: For each view call into game/src/sim, list the states the rules allow for its input, such as a planned refit or a part on a bare nose or tail cell. Each must return a value.
seen: 2 times, last 2026-10-14. Hotfix #515 fixed the inventory crash on a part mounted only in the pending refit. Hotfix #502 fixed a buggy with caltrops on its nose cell, which crashed every frame it was in view.

ID: R7
repo: game
catch: test
rule: A restore or copy of a snapshot deep-copies every record it may change. A physics handle is checked with a named error.
check: For each copy of a snapshot, world or drive, find the records it later changes, and confirm the source does not share them.
seen: 1 time, last 2026-10-07. restoreDrive() shared records with the playback snapshot, so a player could not pass turn T58 until issue #96.

ID: R9
repo: factory
catch: design
rule: The factory writes to GitHub as an App, and as little as it can. It never reacts or votes, never comments progress, and never repeats a write on each tick.
check: For each new GitHub write, count how often it runs per card and per tick. A write that can repeat before the board catches up, a comment that only reports progress, and any reaction are repeats.
seen: 1 time, last 2026-10-14. GitHub suspended the bot account after 866 of 1,780 bot comments were progress notes and Hermes thumbs-upped 27 issues. About 355 issues and PRs were hidden.

ID: R10
repo: game
catch: design
rule: The player learns the world from the world. A target is found from in-world clues, talk, landmarks and what the player has charted, never from a map marker, a ring on the ground, a floating label, an exact bearing or distance, or a tutorial tip. Money moves only where a deal is made. An NPC knows and says only what a person there would.
check: In the screenshots and the plan, look for markers, rings, hover labels, tips, meter distances, compass bearings and remote payments. Each one is a repeat unless DESIGN.md names it.
seen: 11 times, last 2026-10-20. #506 survey markers and rings, #507 a floating Claim label, #500 "radio them" and #660 a floating tip were redesigned on 2026-10-14 and 2026-10-16. #814 left the owner asking what a hulk is and how to find it.

ID: R11
repo: game
catch: test
rule: The build fixes the thing the issue names, at the place it names. Before the fix, the agent reproduces the reported symptom in the game. A screenshot or reference image of a different thing is never the target.
check: Compare the reported symptom and place with the first screenshot of the fix. A fix of a nearby or easier symptom, like darkness for missing terrain, the world for the map, or the pad for the dark circle around it, is a repeat.
seen: 22 times, last 2026-10-20. #593 fixed night darkness when the terrain vanished. #744 removed Nose's pad instead of the dark circle under it. #815 hid places in the 3D world when the issue meant the map.

ID: R12
repo: game
catch: test
rule: A model is sized and shaped against a real reference: the reference image or concept, the scout, a pickup, the wheels and the grid cell, per axis. It follows the concept's silhouette and keeps the detail level of the other chassis. Parts sit on or inside the body, never floating or half outside it, except weapons and armor.
check: Render the new model beside the scout and the reference at one scale, from the side, the front and the top. Measure length, width, height and wheel size against them. Look for floating, clipping and parts hanging past the body.
seen: 12 times, last 2026-10-20. #795 took three rounds on the Scout's proportions, #760 two on the Sorokonoga against its concept, and #442's hauler was "comically small" next to the scout. #770 wheels clipped through bus doors.

ID: R13
repo: game
catch: test
rule: A change that applies to a set applies to every member, and the evidence shows every member: every chassis, every location of the kind, both languages, desktop and phone, every entry path into a scene.
check: List the members the change touches. An atlas or contact sheet must show each one. A fix shown on one member, like the scout alone, is a repeat.
seen: 8 times, last 2026-10-19. #691 "show atlas of how it looks on all chassis, don't bandaid just the scout". #770 wheel size had to become a rule for every chassis. #764 opened I, C and J in text scenes but not the menu, save, load or language.

ID: R14
repo: game
catch: test
rule: Every screen and overlay follows docs/ui.md: its shared pieces, its grid and spacing, the world kept clear, and the fewest words that stay clear. A control is small and placed by its zone, never full width or centered by default. On a phone, every action is an on-screen button and the HUD essentials stay visible.
check: Hold the screenshots against the ui.md tests for P12, P13, P14 and P18. Look for empty blocks larger than the facts beside them, oversized controls, new styles outside the tokens, and text a drawing already shows.
seen: 29 times, last 2026-10-20. #594 "ugly UI, remake via ui system", #571 a rotated minimap outside the UI system, #765 wasted space and a huge Back button. #488 and #786 left mobile play unusable.

ID: R15
repo: game
catch: test
rule: A feature works when a player plays it from a fresh game, through every path that reaches it, to its end, on the build the committee gets. A quest chain is played to its last step in both languages, and a scripted event fires when the player arrives the way the plan says.
check: Follow the post's how-to-try steps from a fresh game, then from a save made before the feature, then by the other routes the world allows. Each step must do what the plan says, with no dead wait, blank panel or missing trigger.
seen: 54 times, last 2026-10-21. #607 "I waited till dusk, nothing happened", #703 a blank portrait panel, #580 intro talk only after a knockout. #758 left a follower driving away from an overheated truck.

ID: R16
repo: game
catch: test
rule: Player text is plain, short and true. No semicolons, no writerly riddles, no machine-sounding phrases, no system words in character voices. Directions, names and facts match the map and the lore. The Russian twin is natural Russian in context and changes with the English.
check: Read every new or changed line aloud in both languages. Check each direction, place and name against the map and lore files. A semicolon, a riddle, a stale twin or a fact the player cannot know yet is a repeat.
seen: 32 times, last 2026-10-20. #814 "remove ai slop text", #788 semicolons and unreadable dialogue, #781 an intro that said north for east. #792 left the Russian twin stale.

ID: R17
repo: game
catch: test
rule: Effects look physical and run on the turn clock. A spill, dust or a crater is shaped like the thing, not a circle. Plumes form gradually from trails. Shots, hits and casings happen when the shot lands. Light has a visible source and never passes through walls.
check: Play the effect at normal and fast playback, at night and by day, and look at it from the player's camera. A disc, an instant pop, an effect at turn end, a glow with no source or light through a wall is a repeat.
seen: 15 times, last 2026-10-20. #804 took two rounds: first no visible reactor light, then light on the sand with no source. Oil spills and city grounds drew as circles on 2026-10-04 and 2026-10-06. #582 dust plumes rose too fast.

ID: R18
repo: game
catch: design
rule: A bug fix names the cause, not only the symptom. The task file says why the bad state happened, and the fix removes that cause or says why it cannot.
check: Read the fix's explanation. A guard, a retry or a clamp with no answer to "why did this happen" is a repeat. So is a new issue for a bug an earlier fix claimed.
seen: 10 times, last 2026-10-19. #482 and #490 fixed sound decode failures several times before the cause was found. #177 stopped a crippled raider hunting without asking why it hunted.

ID: R19
repo: game
catch: design
rule: The plan delivers every point of the request and of each committee reply, and nothing the request did not ask for. Each point maps to a plan step or a stated reason.
check: List each point of the issue and each feedback reply. Find it in the plan and in the build. A dropped point, a half-done point or added chrome nobody asked for is a repeat.
seen: 15 times, last 2026-10-21. #758 shipped without the follower fixes the owner had asked for. #163 added an unasked "Pinned" label and a huge aim button. #111 lacked the perimeter the issue named.

ID: R20
repo: game
catch: test
rule: A merge keeps what the committee already approved. A change never brings back an older version of a feature or drops a piece another card added.
check: Diff the merged result against the base for each file both sides touched. A removed panel, icon or behavior that an earlier card added is a repeat.
seen: 7 times, last 2026-10-20. An old version of the power explanation got merged on 2026-10-07. The M icon and the active contract panel disappeared after unrelated changes. #771 broke the tutorial.

ID: R21
repo: game
catch: test
rule: The evidence shows the change itself, unobstructed and from the player's view, and the post claims only what the screenshots show.
check: For each claim in the post, find the screenshot that proves it. A claim with no screenshot, a popup over the subject, or a view from where no player stands is a repeat.
seen: 5 times, last 2026-10-20. #804 "I don't see any reactor light on those screenshots", with a tutorial popup over the breach. #815's post claimed the map already behaved right.

ID: R22
repo: game
catch: groom
rule: A proposal that goes against DESIGN.md's pillars is refused at grooming, not put to a vote. ROAM is turn-based, explored by driving and charting, and its activities are about trucks and the road.
check: Ask whether the request adds real-time control, an omniscient map tool such as coordinates, waypoints or a compass, or an activity outside trucks and the road. Each one goes to wont-do with the reason.
seen: 6 times, last 2026-10-21. Members vetoed #346 WASD driving, #658 real-time combat movement, #858 map coordinates and waypoints and #859 a compass. #727 fishing was built and denied on 2026-10-18.
