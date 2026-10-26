# Quests

Quests are scripts written in [ink](https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md), run by inkjs. They serve town talk and full text quests. Each local is one quest, named in `LOCALS` in `src/data/locals.ts`. A local lives at a place with a shop or at the Marshalls desk, and the People page of that place lists them. Radio calls keep their own engine in `src/sim/dialogue.ts`, and share only the text markup and the handoff below. [Writing quests](../writing/quests.md) walks through adding and changing a quest.

## Radio handoff

- A radio option with `go: questGo('<quest>')` in `src/data/dialogue.ts` runs its effects, ends the call and opens the quest at `start`, all in one command. A test checks that every handoff names a quest with a `start` checkpoint.
- The quest cannot read who was on the radio. Its lines name the speaker with `# speaker:`.
- Radio lines use the same markup and reveal as quest lines. The log prints them without markup.

## Content

- Each quest is one `.ink` file in `src/data/quests/`, named by its quest id. Every quest includes `world.ink`.
- `world.ink` declares the shared world variables and every `EXTERNAL` game function. A variable a quest declares itself belongs to that quest, and two quests may use the same name.
- Saved variables are int, float, bool or string. A `LIST` or a divert held in a variable fails the build, since a save cannot hold it.
- `npm run quests:build` compiles every quest into `src/data/quests.json`, which the game reads. A test fails when the bundle is stale. The bundle holds each quest's story, its variables with their types and initial values, and its checkpoints.

## Checkpoints

- A checkpoint is a knot or stitch whose first tag is `# checkpoint: <knot>` or `# checkpoint: <knot.stitch>`. The tag must name its own section, or the build fails.
- A quest starts at one of its checkpoints. While it runs, the session remembers the last checkpoint whose line played.
- A save keeps the last checkpoint, not ink's position. Load starts the quest again there, so the player sees the lines from that checkpoint on.
- Load restarts ink's own counts. So a once-only `*` choice, a `{knot}` visit count, `READ_COUNT` and `TURNS_SINCE` fail the build. A fact that must last past a load or into another quest lives in a variable, and a choice offered once is a sticky `+` choice with a variable guard.
- Every checkpoint must run on its own from a fresh story, so it may not rely on temporary variables or tunnels from before it.
- A load plays a checkpoint's opening again, up to its first choices. So that opening may call no effect and change no variable, or each load would pay or count again. Put them after a choice. `restoreQuest()` throws on either, and `npm run quests:check` tries a load at every state it walks.
- In a page quest, a load must show text before its choices. Put a checkpoint on a scene's opening line, and keep a choice list that loops back in an untagged stitch after it. A talk hub may stay a checkpoint, since a talk shows only the last pick, its reply and the choices. `npm run quests:check` fails a page load that shows choices and no line.

## State

`player.quests` in `src/sim/types.ts` holds the quest state.

- `world` and `local[quest]` hold variables whose value differs from their declaration. A new variable, or a new initial value, reaches old saves the way it reaches a new game.
- `session` is the open quest: its id, last checkpoint and the seed of ink's random numbers. One quest is open at a time.
- `live` holds ink's own state and the lines and choices on view. Saves skip it, and load rebuilds it from the session with `restoreQuest()`.

`src/sim/quests.ts` owns the runner. `startQuest()` and `chooseQuestOption()` are commands through `update()`, so a failed pick leaves the world unchanged. `questView()` gives the view kind, the lines with their tags, the choices with their costs and locks, the stats, the facts on view and whether the quest ended. A quest at its end closes its session and keeps its last lines on view. The turn and preview workers are separate module instances, so every task carries the quest language in force and the worker sets it before the turn runs. A turn that lands after a language switch is relanguaged on commit.

## Game functions

- Each `EXTERNAL` in `world.ink` has one function in `src/sim/quests.ts`: a query in `QUEST_QUERIES` or an effect in `QUEST_EFFECTS`.
- A query only reads the world. An effect changes the world of the running command, and ink never runs it ahead of a pick.
- Money crosses in whole M: `money()` reads it, `give_money(amount)` pays the player and `pay(amount)` takes from the player. `pay()` throws when the player holds less, so the quest checks `money()` first.
- `begin(quest)` opens another quest at its `start` once this one ends. It must come right before `-> END`, or the pick throws. Kovac starts the depot quest this way.
- `engine_missing()` tells whether the player's truck has no engine mounted. A line that says an engine was taken branches on it, so the scene matches the truck.
- `note(id)` writes a journal note and `has_note(id)` reads one. `found(site)` reads whether a town or location is found, and `searched(wreck)` whether a story wreck is searched. Each throws on an id the game does not know.
- `has_work()`, `has_offers()` and `board_full()` read the board of the town the truck is parked at, and `take_work()` takes its best offer as the Contracts tab does. They throw away from a town. The offer is the best-paying open contract the truck can take, from `townWork()` in `src/sim/dialogue-rules.ts`. `has_offers()` tells a board with open contracts the truck cannot take from an empty one.
- `short_of(good)` reads whether the shop the truck is parked at runs short of a good, by `shortHere()` in `src/sim/market.ts`, the same rule as the market's Short here tone. `works_down()` reads whether that site's works are broken down now. Both throw away from a shop. `short_of()` throws on a good the shop does not trade, and `works_down()` at a site with no breakdown in `SITE_EVENTS`. The veteran check world empties every good of the shop it is parked at and breaks its works down where they can break, so both branches are walked.
- `stretch_pay(stretch)` gives the Chaos Highway pay of a stretch in whole M, from `payOf()` in `src/sim/chaos-highway-director.ts`. It throws on a stretch under 1 or a non-integer. The road story quotes the pay with it.
- `skill(id)` reads the player's level in a skill: driving, perception, machining, toughness or social. It throws on any other id. The veteran check world holds every skill at the top level, so a skill check is walked both ways. Use it for what a skill lets the player see or say for free, like an extra line in a document.
- `passed()` tells whether the player meets the `# check` of the choice just picked. A choice that can fail carries the check, and the ink after the pick branches on `passed()`. It throws when the picked choice has no check, and on a load, which picks nothing.
- `holds_search()` reads whether the player holds an undelivered search. `marshal_lead()` reads whether `marshalLead()` finds a Marshall sighting newer than the held lead. `lead_price()` gives the lead fee in whole M and throws under 1. `take_marshal_lead()` moves the lead there and throws when there is none. Petra Quell's `roadhouse_petra.ink` uses them. The veteran check world for her quest holds a search and one Marshall car with a newer sighting, and a third world holds a search with no car, so both answers are walked.
- Game state such as money is read through a query, never copied into an ink variable.

## Top tags

Tags at the very top of a quest file, before `INCLUDE world.ink`, describe the whole quest. The build reads them into the bundle and fails on an unknown one.

- `# view: page` shows the quest as pages. Without it the quest is a talk.
- `# revision: <n>` is the quest's content revision, 1 without the tag. Raise it when old progress in the quest no longer makes sense. Load then resets the quest and the quests that stand on it. The Russian twin carries the same revision.
- `# stat: <variable> <Label>` shows a number variable in the page's right column. `# stat: money M's` shows the player's M's with the M icon and no label. `# stat: alarm Talk: quiet, talking, loud` shows a word for the value instead, and a value past the list shows the last word.
- `# fact: <variable> <text>` shows the text in the right column while the true or false variable is true. Facts are what the player found, written as raw observations, so the player draws the conclusion.

## Text and the talk window

- Inline markup is `<b>`, `<i>`, `<shake>`, `<pop>`, `<now>`, `<color=rust>` and `<term=bowl>`, closed by `</name>`. Square brackets would break ink choices, so markup uses angle brackets.
- `<now>` shows its text at once, and the rest of the line reveals after it. `<pause>` stands alone with no closing tag and holds back the rest of the line by `questPauseMs` in `src/config.ts`. A pause with no text after it fails the check.
- `<term=<id>>` underlines a word with dots, and hovering or focusing it opens its tip from `term.<id>` in the text catalog. An id not in `TERM_IDS` in `src/data/locals.ts` fails the check. `TermTip` in `src/ui/quest-text.ts` draws the one tip. [Term tips](../writing/quests.md#term-tips) has the writing rules.
- A line tag sets how the line reveals: `# reveal: all`, `word` or `char`, and `# speed: slow`, `normal` or `fast`. Speech reveals word by word and narration fades in a paragraph at a time. So talk lines, radio lines and page lines with `# speaker:` reveal by words, and other page lines reveal whole. A line's own `# reveal:` tag overrides that, for a few dramatic narration lines. `# speaker: <name>` puts the name before the line. `# work_offer` shows the town's best offer under the line.
- `# row` and `# head` make a line a table row, its cells split by `;`. Lines in a row form one table, for ledgers, logs and price boards.
- `# place: <name>` names where the page is and heads it until another place. `# page` starts a new page, behind a Next button. A page tag on the first line of a pick's output starts no new page, so a load opens on it directly.
- `# img: <key>` shows a picture. The keys, their files under `public/quest-art/` and the point each crop keeps are in `src/data/quest-art.json`, which `QUEST_ART` in `src/data/quest-art.ts` copies. The point is `focusX` and `focusY`, and `loadArt()` sets the picture's `object-position` and `transform-origin` to it. A page shows the latest picture in its art column until another replaces it, and a talk shows it among the lines. A key not in the list fails the check.
- The build lists each quest's pictures in the order the source first shows them, and a Russian twin with another list fails the build. The game never loads quest art at start. `QuestArtStage` in `src/ui/quest-screen.ts` loads and decodes every picture of the quest when it opens, so a branch that skips a picture still finds the next one ready and a new scene shows its picture with no pop. A picture that cannot be fetched, decoded or shown is left blank, never an error. Closing the quest drops them all.
- A load replays a quest from its last checkpoint, which may show no picture or place of its own. So the build gives each checkpoint the last `img` and `place` tags above it in the source, and the page shows them until the replayed lines name others.
- A page picture zooms in slowly while it shows. The zoom carries on across pages and starts over only when the picture changes.
- A choice tagged `# cost: <M>` takes that money when picked. The window shows it greyed with the player's money when they hold less, and a pick of it throws. The tag may hold an ink value: `+ [Pay her {price} M. # cost: {price}]`.
- A choice tagged `# check: <skill> <level>` tests a skill. The window shows the skill, the level it needs and the player's own level, so a failure is never a surprise rule. The level may be an ink value: `# check: social {gate_need()}`. A choice takes only `# cost` and `# check`.
- `MARKS` and `LINE_TAGS` in `src/ui/quest-text.ts` list them. A new effect is one entry there and its CSS in `style.css`. Unknown or unclosed markup and unknown tags fail `npm run quests:check`.
- `src/ui/quest-screen.ts` is the talk window. It shows whenever `player.quests.live` is set, so a start, a pick and a load all show it. It lies over every other screen, and while the town page is open it draws in the town's frame, as [Town scenes](#town-scenes) says. Digits pick. Each line is a paragraph, and a table is one paragraph. A page or reply shows one paragraph at a time: a click on the text, Space, Enter or the Next button adds the next one, and the choices show after the last. During a reveal, the same press shows the rest of it at once. A quest has no close button and Escape does nothing, so the player leaves only through the Leave choice once the quest ends. I, C and J are the exception: the window lets them through to the game, which opens the inventory, character or journal over the scene (`.over-scene`, `--z-over-scene`, with its own scrim) in a look-only state. `lookReason()` in `src/ui/unstuck-reason.ts` is the one reason, `look.inScene`, non-null exactly while `quests.live` is set, and every control of the inventory and character screens that changes the world takes it through `disabledWith()` first. `InventoryView.run()` throws if it is reached during a scene. The Menu button stays above the window, and while the menu or one of its panels is open the window lets every key through too (`ModalScreens` takes a `menuOpen` check). While a look screen is open, `ModalScreens.lookOver()` makes the window let every key through and act on none, so digits, Space and Enter pick and advance nothing. Escape closes the look screen and never the quest, and the page and paragraph stay where they were. The loot screen that a search opens under the Wagon Seven scene is not a look screen: it stays under the scene, look-only until the scene ends. On a phone the bar is hidden under the scene, so the window shows a `.quest-look` row of three icon buttons for those screens. `leaveQuest()` throws on a quest that has not ended. Text and choices stay hidden until they fade in, so a click where a choice will appear only shows the rest.
- A talk shows only the player's last pick, the reply and the choices. Earlier exchanges are not kept, so the player reads each reply. A `# page` tag splits a reply behind a Next button, as in the page view. It suits short talk, like asking around town.
- A page shows art on the left, one page of text with its choices in the middle, and the stats and facts on the right. A fact found in the last pick stands out, and so does money gained or paid in it, with the change in green or red before the new sum. Space or Enter after the last paragraph turns to the next page. On the last page it picks the only choice when there is one. Leave at a quest's end takes a click or its digit, never Space or Enter. It suits scenes that need full attention. `src/ui/quest-lines.ts` draws lines for both views.

## Saves

- A save holds `player.quests` without `live`, so it holds no ink state.
- The build derives each quest's links from its ink into the bundle: the world variables it reads, the literal values it writes to each, the notes it gives and tests with `has_note()`, and the quests it passes to `begin()`. A `# stat:` or `# fact:` on a world variable is a read. A world variable given a value worked out in play, or a `note()`, `has_note()` or `begin()` call on anything but one plain id, fails the build, since the repair could not tell who wrote it. `parseBundle()` throws on a link to an unknown quest, variable or note.
- The game writes some world variables and notes itself. `GAME_WORLD_VARS` in `src/data/quests.ts` lists the variables and the scene each gate opens, and `GAME_NOTES` in `src/data/locals.ts` the notes. A test fails on a sim write that names something missing from them.
- `repairQuests()` in `src/sim/quest-repair.ts` turns saved quest state and notes into state that fits the bundle. Load and the rescue both call it. It drops quests, world variables and types the bundle no longer has. Its broken roots are quests with progress whose revision rose since the save, or whose variables or open checkpoint no longer fit, and world values no quest writes. A quest has progress when it has variables, an open session, a world value it can write or a note it gives.
- A saved value belongs to the quests that can write it, and to the game when it is in `GAME_WORLD_VARS` or `GAME_NOTES`. A value resets only when it has a quest owner, no game owner, and every owner resets, so a shared outcome another live quest could have written stays. A scene gate resets with its scene. A quest with progress that reads a reset value or note resets too, until nothing changes. A quest with progress that a root begins resets as well, but a begin from a quest reset only as a dependent does not spread. Reset quests lose their variables and open session. Money, parts, skills and XP are never touched, so a reset quest pays again when replayed.
- The repair never resets a quest with no progress, and repairing its own output changes nothing.
- `src/three/save-shape.json` records every saved variable name with its type and every checkpoint. Removing, renaming or retyping one needs a migration step or a raised revision of its quest, and `npm run save:shape` refuses it under the recorded format. A removed world variable always needs a step, since it belongs to no single quest. Additions need no step.
- It records each quest's revision and links too. Under the same format, `npm run save:shape` refuses a value no longer written, a note no longer given, a new read and a begin added or removed, unless the quest's revision rose or `--compatible <quest>` names it. Its message lists the quests a raised revision would reset at most.
- `src/three/save-migrations.ts` has pure helpers for those steps: `renameQuestVar()`, `dropQuestVar()`, `moveQuestCheckpoint()`, `endQuestSession()` and `dropQuest()`. A null quest means a world variable.

## Tools

- `npm run quest -- <quest>` plays a quest in the terminal on a new game, with the truck parked at the local's place for a local's quest, compiled fresh from the sources, so an edit plays without a build. Choices are numbered from 1. `--checkpoint <name>` starts at another checkpoint than the first. `--picks 1,2` plays those choices, and without it the player types picks. `--set name=value` sets a world or quest variable before the start. `--save <file>` writes the quest state as a save holds it. `--load <file>` checks that state against the sources. With an open session of the quest it resumes at its checkpoint, and with no open session it starts the quest with the saved variables, so one quest's outcome carries into the next. `npm run quest -- list` prints every quest id.
- `npm run quest:view -- <quest>` builds the quests, starts the dev server and opens the game in the quest window, to look at a scene's text effects and art. `--checkpoint <name>` and `--picks 1,2` work as in `npm run quest`. `--page 4` opens that page of the last pick's output, counted from 1. `--lang ru` opens it in Russian. The picks go through the quest window, so pictures carry over as in play. It plays on a fresh new game under its own save key, so your saves stay untouched. The page address carries `?quest=`, `&checkpoint=`, `&picks=` and `&page=`, which only dev reads. The intro key turn is `npm run quest:view -- intro_arrival --checkpoint start.farm --picks 3,1 --page 4`.
- `npm run quests:check` fails on compile errors and warnings, broken checkpoint tags, saved types it cannot hold, game functions missing on either side and a stale bundle. It then walks every choice from every checkpoint through the runner and fails on ink errors, on states from which no choice leads to an end, on states from which only paid choices lead to an end, and on sections never reached. A player cannot leave a quest midway, so a broke player must always have a free way to an end. It names the picks that lead to each problem. A Vitest test runs the same check.
- The walk merges states by ink's position, variables, money, notes and held contracts. Visit counts play no part, since the build bans flow that reads them. The walk stops at 5,000 states per world and fails, since an unchecked quest must not pass. A pick that begins another quest ends the walk there, and the other quest is walked on its own.
- `gameScenes()` in `src/test/quest-check.ts` gives the worlds each quest is walked in: a new game, and a veteran who holds every note, has found every place, has searched every story wreck and holds a full board. A local's quest is walked parked at their town. So a branch on a game query is walked both ways when the two worlds answer it differently.
- Each value a quest assigns to a world variable with `~ name = value` adds one more world: the new game with that value set. So a branch on what another quest decided is walked too. Only literal assignments count, one variable at a time, so set world variables to literal values.
- The check worlds hold no obstacles, which no game function reads. That keeps a step cheap to clone.

## The depot leak

`nose_depot_leak.ink` is the first full text quest, shown as pages. Kovac at Nose starts it with "Anything off the books?". Fuel walks out of the Nose depot, and the player has 5 watches to find the seller. Each lead costs a watch and gives a fact. The ledger points at Pell, the clerk. The gate log, a shift swap, the trader's description, seals under a cot and a night watch point at Vance. Paying the trader for her lead costs 20 M.

- Naming Vance weighs the facts the player holds. The night watch counts 2 and each other Vance fact 1. With 3 or more Kovac pays 150 M.
- Naming Pell with the ledger jails the wrong man.
- A name without enough behind it raises the alarm.
- Taking the trader's envelope pays 60 M and lets the thief go.
- An alarm of 2, or letting it go, loses the trail.

The world variable `depot_thief` keeps the outcome. Kovac greets by it and Ibo talks about it.

## The first fall

`first_fall.ink` is a page scene the game opens by itself. It teaches that a knockout is not the end. It opens once per game, when the player's truck is first knocked out by other trucks.

- `checkKnockout()` in `src/sim/defeat.ts` calls `openFirstFall()` in `src/sim/quests.ts` when trucks fought the player. A knockout with no attacker, such as a hazard, opens nothing.
- `openFirstFall()` skips when another quest session is open or when the world variable `first_knockout_seen` is true. It sets that variable as it opens the scene, so saves keep it and `src/sim/types.ts` stays as it is.
- The scene offers no choice, since every choice would lead to the same outcome. Its pages run behind Next buttons, and the session ends as it opens. A save made while the pages show does not show them again on load.
- While a quest is on view, `waitsOnPlayer()` in `src/sim/world.ts` is true and `autoRuns()` is false. The knocked-out turns wait until the scene closes. The same rule holds every scene a turn opens, in automatic travel and with Space held: that turn plays to its end, the scene shows, and no turn begins until Leave closes it.
- `GAME_OPENED_QUESTS` in `src/data/quests.ts` names the quests the game opens. The arrival and `bowl_scale` are among them. The voice test counts it as a way in next to locals, radio calls and `begin()`.

## The fallen light

`fallen_light.ink` is a page scene the game opens by itself when the player dies in the reactor core. `applyHazards()` in `src/sim/hazard.ts` pushes a `coreBurn` event for every core burn, and `checkDeath()` in `src/sim/defeat.ts` gives the `death` event the cause `core` when the dying truck burned that turn, and calls `openCoreDeath()` in `src/sim/quests.ts`. The scene offers no choice. `deathShows()` in `src/ui/death.ts` holds the death screen back while a quest is on view, so Leave gives way to it. Any other death has the cause `injury` and opens nothing. No world variable gates it, since a dead world is never saved.

The game function `cult_broken()` reads `world.sunward.collapsed` and throws on Chaos Highway. Dag, Ibo, Sefa, Hattie and Ruben branch on it, and the veteran check world holds a fallen order, so both branches are walked.

## The ambush and the wake in Bowl

The world variable `intro_step` runs the second half of the arrival. Its values are `off`, `drive`, `patched`, `ambush` and `done`. `src/sim/intro.ts` sets every one of them.

- `introStep()` and `setIntroStep()` in `src/sim/quests.ts` read and write it, next to `openFirstFall()`.
- `advanceIntro()` runs each turn after `spawnNpcs()`. At `patched`, with the player active, driving and outside a site, it spawns one raider and sets `ambush`, once `openingOver()` in `src/sim/opening.ts` is true: the opening wreck step is done, or the truck is `OPENING.leaveDistance` from the wreck. While the truck stays parked, or the cage from the wreck is not mounted yet, it waits. No road runs from the farm toward Bowl, so the ambush does not need one.
- The raider is the `buggy` template with the gear and chassis in `AMBUSH` in `src/data/intro.ts`. It spawns out of the player's sight, ahead of the player's heading, on ground that is not a cliff or a site, so a driver going on meets it head on. Each turn of the ambush the raider's track is set to the player's real position, so it never stops at an old sighting. It gets a robbery feud and a fight goal on the player, the same as a raider that chose to rob. It also gets the `brave` trait, so it does not flee from a pickup with a machine gun. It carries no cargo, so it has room to rob.
- The raider drives and fights by the normal rules. It may radio a demand, and the player may refuse.
- A knockout plays the first fall as usual. When the knockout ends, `wakeInTown()` runs if the foes were not empty and the step is `ambush`. It parks the truck on a Bowl pad, sets `done`, sets the world variable `towed_to_bowl` and opens `intro_bowl` through `openWellScene()` at `again` when `hattie_met` was already set and at `start` when not. Only a player towed in this way can ask Hattie about the tow man and the stripped truck. The wake also puts each part of the arrival kit into the Bowl shop when the player lost it and the shop does not sell one, at the kit's wear. A robbed player can always buy back the engine, the machine gun and the panniers with the money the raider left.
- `intro_bowl.ink` is a page scene with Hattie at the well house, then a question hub. It has three entry checkpoints that share the hub: `start` is the wake for a player who never met her, `again` is the wake for one who did, and `meet` is the first meeting for a player who reached Bowl on their own. The hub offers the two knockout questions and the slate leave line only while `towed_to_bowl` is true.
- `greetAtWell()` in `src/sim/intro.ts` runs each turn. It calls `openWellScene()` at `meet` when the intro runs (`intro_step` is not `off`), the player is free to talk and parked on a pad of `WAKE_TOWN`, and neither `hattie_met` nor `towed_to_bowl` is set. `openWellScene()` sets the game-written `hattie_met` as it opens, so the meeting plays once per game and never after a load. Old saves with `towed_to_bowl` or a saved `bowl_hattie` variable get `hattie_met` from a save step.
- At `ambush`, `advanceIntro()` sets `done` when no raider that is up still hunts the player. That covers a win and an escape, and `endAmbush()` opens `intro_road` once, a page scene with no choice that points to the town in the haze and the open land. A knockout never opens it.
- A load at any step changes no variable. The step is saved, so a load never spawns a second raider.

## The weigher at the Bowl gate yard

`bowl_scale.ink` is a page scene the game opens by itself. It shows a new driver that the Bowl gate yard buys scrap and parts: the player watches a scavenger sell crates on the yard's beam scale, then the weigher Mags Corrin looks into the player's bed. The scene names no price and sells nothing. The sale goes through the town's Market like every sale.

- `bowl_scale` is a row of `TOWN_SCENES` in `src/data/quests.ts`: enter Market at Bowl, with the condition `newSeller`. It opens through `pickTownSection()` in `src/sim/quests.ts`, which the town page calls, so it opens when the player is free to talk (`freeToTalk()`), holds a crate of a good in `SALVAGE_GOODS` (scrap or parts) and `xpBySource.profit` is 0, so the player has never sold at a profit. No turn step opens it.
- `openScaleScene()` sets the world variable `scale_seen` as it opens the scene, so it plays once per game. A player woken on the Bowl bench with an empty bed meets it on a later visit with salvage. A player who first sold at a profit elsewhere never meets it.
- Asking where scavengers find iron writes the note `orchardIron`: dead trucks by the roads, and the barns and Army sheds at Old Orchard.

## Wagon Seven

Nose Army wagon Seven lies in a hollow below a bend in the Bowl north road as the story wreck `story-wagon-seven`, with its cannon on board. Hattie's rumor, Kovac's radio answer, Dag and the radio driver near the wreck point the player to it. The truth is in [Timeline](../lore/timeline.md#hidden-truths): the cheap brake rod snapped on the bend, and the crew reported raiders.

- `openWreckScene()` in `src/sim/quests.ts` opens `wagon_seven.ink` when the player finishes a search of the wagon. `finishSearch()` in `src/sim/search.ts` calls it after the `searched` event, so the loot screen opens under the scene. It sets the world variable `wagon_seen` as it opens, so it plays once. It skips while another quest is open and opens on the next search. The veteran check world holds `wagon_seen` too.
- The scene is pages at the wreck. Perception 2 sees no casing and no bullet hole and sets `wagon_saw`. A failure sets `wagon_watched`: the families' children saw the player from the ridge. Machining 1 reads the broken brake rod as snapped under load and sets `wagon_read`. After that, machining 2 works the rod half out whole and sets `wagon_rod` to `held`. A failure sets `bent`. Leaving with a rod half writes the note `wagonRod`.
- Lena at Nose takes a held or bent rod half and opens `wagon_bench.ink`, pages at her bench. Duvall's half fits a held rod half. Giving Kovac a held rod half, or a bent one the player read, sets `logged`. Kovac pays a finder's rate of 20 M and keeps the trucks with that rod in the yard. Social 2 on Teller gets his own admission and sets `admitted`, with the same fee. A failure sets `logged` with no fee, because Teller calls the player a looter. Selling the rod half to Teller pays 60 M and sets `buried`.
- Sefa at the Salvage Yard buys the rod half and the place for 30 M, or 15 M bent, and sets `sold`.
- Dag at Bowl, once `wagon_saw` holds, lets the player tell it at the well house beside him. That sets `told`.

The world variable `wagon_fate` keeps the outcome. Its values are `none`, `logged`, `admitted`, `buried`, `told` and `sold`. Kovac and Lena greet by it.

## Locals at stalls

Dustwell, the Granary, Green Pit and the Pump Station are stalls with no board of work. Their locals never call `has_work()`, `has_offers()`, `board_full()` or `take_work()`. The checker parks each local's quest at their place, as it does for Bowl and Nose, and `src/sim/locals.test.ts` talks to Odile.

Every site in `SITE_ECONOMY` has a local who answers what the site makes: Ruben at Bowl, Kovac at Nose, Sefa at the Salvage Yard, Agnes at Dustwell, Odile Marsh at the Granary, Hadiza Okon at Green Pit and Hollis Brennan at the Pump Station. The answer is a repeatable choice. It asks `short_of()` for every recipe input and upkeep good of the site, and `works_down()` where the works can break down, so the player hears what the site lacks that day. A test in `src/sim/locals.test.ts` fails when a site's input or upkeep good has no `short_of()` call in its locals' quests.

## The arrival

`intro_arrival.ink` is a page quest the game opens by itself on a new game. The player walks down into the basin with an empty canteen and finds an old pickup in a collapsed shed under a water tower. It names nobody and says nothing of who the player is. It offers one choice at the farm, to search the house first or go straight to the shed. The house pays 50 M, so the first pick teaches a new player that choices on a page change what they hold. The page shows money in its right column.

- `newGame()` in `src/sim/new-game.ts` builds the world from the start kit `arrival` and opens the quest at `start`. `newWorld()` opens nothing. With Skip the intro, `newGame()` builds the same world and opens no quest. The farm, the truck, the kit, the ambush and the wake in Bowl all stay the same. Only the arrival scene is missing.
- The kit `arrival` has the `intro` field: the pose of the truck, the farm pieces and the kit to use without the intro. `ARRIVAL` in `src/data/arrival.ts` holds them. The farm is non-baked landmark obstacles, so the map file and its hash stay as they are. The pieces are a water tower, a shed, a fallen house, a woodpile, drums and a fence. None of them can break. The tower and the shed are not loot spots.
- The farm lies at the foot of the southern rim, about 95 tiles from Green Pit. The nearest road is about 70 tiles north, out of sight, with no cliff on the way.
- The pickup is the scout with the opening condition of the standard start: a nearly dead engine, a worn cab and an opening wreck that holds 3 parts and a cage. The engine has no misfire rule. Low engine HP is what the rules give, and parts that wear down can fail. The opening tips teach driving, search, loot and patch.
- The world variable `intro_step` is `off`, `drive`, `patched`, `ambush` or `done`. The quest sets no variable. `advanceIntro()` in `src/sim/intro.ts` runs once each turn. It sets `drive` on the first turn after the scene, and `patched` once the engine needs no patch. A skipped intro builds the same farm, so it runs these steps the same way. The ambush and the wake in Bowl follow from `patched`.
- Sim code reads and writes a world variable through `worldVar()` and `setWorldVar()` in `src/sim/quests.ts`, and the intro step through `introStep()` and `setIntroStep()`. `setWorldVar()` throws on an unknown name, a wrong type or an open quest session, since the next pick would undo the write.
## The road story

Two page quests tell the story of Geezer and Ala on Chaos Highway. The player is Geezer, who drives the gun truck, and Ala drives the hauler. The canon is in [Chaos Highway](../lore/chaos-highway.md). The scenes pay nothing and change no run rule: a test checks that money, the run and the trucks are equal before and after each scene.

- `chaos_highway_intro` is the hiring at the southern outpost. `newGame()` opens it for a mode whose `opening` names it, when the intro is on and the kit has no arrival. It has no choices, and its end sets the world variable `ala_hired`.
- `ROAD_STORY` in `src/data/quests.ts` maps stretch 1 to a quest and a gate world variable, `road_seen_<n>`. Each gate is in `GAME_WORLD_VARS` and gates its quest.
- `openRoadScene()` in `src/sim/quests.ts` runs each turn after `advanceChaosHighway()`. It returns unless a run exists, no quest is open, `ala_hired` is true, `canDriveOn()` holds and the stretch ahead has a `ROAD_STORY` entry with an unset gate. Then it sets the gate and opens the quest at `start`, so a scene opens once per run and a save or a window move never opens it again. A run with the intro off never sets `ala_hired`, and a `newWorld()` world never plays the hiring, so neither meets a scene.
- A scene opening, the text before its first choice, states only what every run that reaches the outpost shares: hunters came, both trucks got through and the pay was settled. It never states an act of the player's in a fight. A test in `src/three/road-story.test.ts` greps the openings for the old ram phrases.
- Restart run on the death screen carries the story: `restartsWithStory()` in `src/ui/death.ts` sends the intro when the dead run was hired.
- Every page of every road scene shows a picture: the scene's first line carries an `# img`, and each checkpoint takes the last picture above it. The keys are `road_table`, `road_ala`, `road_geezer` and `road_hauler`, all in `QUEST_ART`.

## Language

- Each quest has a Russian twin in `src/data/quests/ru/<quest>.ink`. It is the same script with Russian words, and it includes the shared `world.ink`. [Russian copy](../writing/russian.md) says what a twin keeps and what it translates.
- The build compiles both twins into one bundle entry. The quest's variables, checkpoints and view are shared, and `text.en` and `text.ru` each hold a story, stats and facts. A quest with no twin, a twin with no quest, or a twin whose variables, checkpoints, view, stat names or fact names differ fails the build.
- `setQuestLanguage()` in `src/sim/quests.ts` picks the twin the runner plays. `src/three/main.ts` sets it at boot and on every language switch. Each turn request carries the language to the turn worker, which plays any scene the turn opens in it, and a turn prepared in another language is computed again. The pseudo locale plays English.
- The live state records its language. A pick on a quest live in another language throws. On a switch, `relanguageQuest()` reopens the open quest at its last checkpoint in the new language, as a load does, and keeps its variables. An ended quest on view closes.
- `npm run quests:check` walks both twins with the same picks. It fails where they part: a different choice count, cost, check, lock, fact count, end, variable, money, note or contract. Each twin's markup and loads are checked, and each twin's sections must be reached.
- Note titles, sources and texts, local names and roles, and term tooltips live in the catalog as `journalNote.<id>.*`, `local.<id>.*` and `term.<id>`. `src/data/locals.ts` keeps only their ids.
- Radio lines, including the Army wagon topic, are line ids like every other radio line.

## Town scenes

A scene the game opens in town belongs to a place, a section of the town page and a moment, entering or leaving it. `TOWN_SCENES` in `src/data/quests.ts` lists each row: place, section, moment, quest, checkpoint, gate world variable and an optional named condition from `TOWN_SCENE_CONDITIONS` in `src/sim/quests.ts`. The gate is declared in `GAME_WORLD_VARS` and `world.ink`.

- `pickTownSection(world, from, to)` is the command. `from` and `to` are sections, or null for the town's front page. The town page runs `pickTownSection(w, null, section)` when a choice turns to a section, and `pickTownSection(w, section, null)` on Back or Escape from it. Drive on and other closes run no pick. It throws away from a shop and into a section the place lacks. When the player is free to talk, it opens the first unseen scene whose condition holds: the leave scene of `from`, else the enter scene of `to`. It changes nothing but the gate and the quest session.
- `townSections()` says which sections a place has. `barDrivers()` lists the drivers parked on the place's pads that the player sees, nearest first.
- `nose_counter` is a talk scene at Nose on leaving Garage. Lena crosses the shed after the player steps away from the parts counter and says the shelf holds Army write-offs. It pays nothing and gives the `talkBrakeRod` note.
- A quest that goes live while the town page is open, such as a local's talk or a scene, draws in the town's frame: `QuestScreen` gets `TownScreen.frame()` from `ModalScreens` and takes the town's `.ink-page` box, its band element with the same zooming picture and its chips. The heading slot shows the local's name and role in a talk, else the page's `# place`, else the town page's heading. A page quest's own picture shows as a 3:1 inset in the band unless the band already shows it. The town page hides under it, and when the quest ends it shows the page the player was on or was going to.
- A new scene is one `TOWN_SCENES` row, its gate and its quest. No scene gets its own trigger.
