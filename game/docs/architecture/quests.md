# Quests

Quests are scripts written in [ink](https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md), run by inkjs. They serve town talk and full text quests. Each local is one quest, named in `LOCALS` in `src/data/locals.ts`. A local lives at a place with a shop, and its People tab lists them. Radio calls keep their own engine in `src/sim/dialogue.ts`, and share only the text markup and the handoff below. [Writing quests](../quest-authoring.md) walks through adding and changing a quest.

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

## State

`player.quests` in `src/sim/types.ts` holds the quest state.

- `world` and `local[quest]` hold variables whose value differs from their declaration. A new variable, or a new initial value, reaches old saves the way it reaches a new game.
- `session` is the open quest: its id, last checkpoint and the seed of ink's random numbers. One quest is open at a time.
- `live` holds ink's own state and the lines and choices on view. Saves skip it, and load rebuilds it from the session with `restoreQuest()`.

`src/sim/quests.ts` owns the runner. `startQuest()` and `chooseQuestOption()` are commands through `update()`, so a failed pick leaves the world unchanged. `questView()` gives the view kind, the lines with their tags, the choices with their costs and locks, the stats, the facts on view and whether the quest ended. A quest at its end closes its session and keeps its last lines on view.

## Game functions

- Each `EXTERNAL` in `world.ink` has one function in `src/sim/quests.ts`: a query in `QUEST_QUERIES` or an effect in `QUEST_EFFECTS`.
- A query only reads the world. An effect changes the world of the running command, and ink never runs it ahead of a pick.
- Money crosses in whole M: `money()` reads it, `give_money(amount)` pays the player and `pay(amount)` takes from the player. `pay()` throws when the player holds less, so the quest checks `money()` first.
- `begin(quest)` opens another quest at its `start` once this one ends. It must come right before `-> END`, or the pick throws. Kovac starts the depot quest this way.
- `note(id)` writes a journal note and `has_note(id)` reads one. `found(site)` reads whether a town or location is found, and `searched(wreck)` whether a story wreck is searched. Each throws on an id the game does not know.
- `has_work()`, `has_offers()` and `board_full()` read the board of the town the truck is parked at, and `take_work()` takes its best offer as the Contracts tab does. They throw away from a town. The offer is the best-paying open contract the truck can take, from `townWork()` in `src/sim/dialogue-rules.ts`. `has_offers()` tells a board with open contracts the truck cannot take from an empty one.
- `skill(id)` reads the player's level in a skill: driving, perception, machining, toughness or social. It throws on any other id. The veteran check world holds every skill at the top level, so a skill check is walked both ways.
- Game state such as money is read through a query, never copied into an ink variable.

## Top tags

Tags at the very top of a quest file, before `INCLUDE world.ink`, describe the whole quest. The build reads them into the bundle and fails on an unknown one.

- `# view: page` shows the quest as pages. Without it the quest is a talk.
- `# stat: <variable> <Label>` shows a number variable in the page's right column. `# stat: money Money` shows the player's money. `# stat: alarm Talk: quiet, talking, loud` shows a word for the value instead, and a value past the list shows the last word.
- `# fact: <variable> <text>` shows the text in the right column while the true or false variable is true. Facts are what the player found, written as raw observations, so the player draws the conclusion.

## Text and the talk window

- Inline markup is `<b>`, `<i>`, `<shake>`, `<pop>` and `<color=rust>`, closed by `</name>`. Square brackets would break ink choices, so markup uses angle brackets.
- A line tag sets how the line reveals: `# reveal: all`, `word` or `char`, and `# speed: slow`, `normal` or `fast`. Words is the default. `# speaker: <name>` puts the name before the line. `# work_offer` shows the town's best offer under the line.
- `# row` and `# head` make a line a table row, its cells split by `;`. Lines in a row form one table, for ledgers, logs and price boards. The voice test reads no numbers in them.
- `# place: <name>` names where the page is and heads it until another place. `# page` starts a new page, behind a Next button. A page tag on the first line of a pick's output starts no new page, so a load opens on it directly.
- `# img: <key>` shows a picture. The keys and their files under `public/quest-art/` are in `QUEST_ART` in `src/data/quest-art.ts`. A page shows the latest picture in its art column until another replaces it, and a talk shows it among the lines. A key not in the list fails the check.
- A choice tagged `# cost: <M>` takes that money when picked. The window shows it greyed with the player's money when they hold less, and a pick of it throws. The tag may hold an ink value: `+ [Pay her {price} M. # cost: {price}]`. A choice takes no other tag.
- `MARKS` and `LINE_TAGS` in `src/ui/quest-text.ts` list them. A new effect is one entry there and its CSS in `style.css`. Unknown or unclosed markup and unknown tags fail `npm run quests:check`.
- `src/ui/quest-screen.ts` is the talk window. It shows whenever `player.quests.live` is set, so a start, a pick and a load all show it. It lies over every other screen. Digits pick, a click, Space or Enter shows the rest of the reveal at once, and Escape leaves the quest.
- A talk shows only the player's last pick, the reply and the choices. Earlier exchanges are not kept, so the player reads each reply. A `# page` tag splits a reply behind a Next button, as in the page view. It suits short talk, like asking around town.
- A page shows art on the left, one page of text with its choices in the middle, and the stats and facts on the right. A fact found in the last pick stands out. Space or Enter after the reveal turns to the next page. It suits scenes that need full attention. `src/ui/quest-lines.ts` draws lines for both views.

## Saves

- A save holds `player.quests` without `live`, so it holds no ink state.
- Load raises a `SaveError` on a stored quest, variable, type or checkpoint the current bundle does not declare.
- The rescue screen then carries every variable the bundle still declares with the same type, lists the rest as lost, and closes the open quest. `fittingQuestVars()` decides.
- `src/three/save-shape.json` records every saved variable name with its type and every checkpoint. Removing, renaming or retyping one needs a migration step, and `npm run save:shape` refuses it under the recorded format. Additions need no step.
- `src/three/save-migrations.ts` has pure helpers for those steps: `renameQuestVar()`, `dropQuestVar()`, `moveQuestCheckpoint()`, `endQuestSession()` and `dropQuest()`. A null quest means a world variable.

## Tools

- `npm run quest -- <quest>` plays a quest in the terminal on a new game, compiled fresh from the sources, so an edit plays without a build. Choices are numbered from 1. `--checkpoint <name>` starts at another checkpoint than the first. `--picks 1,2` plays those choices, and without it the player types picks. `--set name=value` sets a world or quest variable before the start. `--save <file>` writes the quest state as a save holds it. `--load <file>` checks that state against the sources. With an open session of the quest it resumes at its checkpoint, and with no open session it starts the quest with the saved variables, so one quest's outcome carries into the next. `npm run quest -- list` prints every quest id.
- `npm run quests:check` fails on compile errors and warnings, broken checkpoint tags, saved types it cannot hold, game functions missing on either side and a stale bundle. It then walks every choice from every checkpoint through the runner and fails on ink errors, on states from which no choice leads to an end, and on sections never reached. It names the picks that lead to each problem. A Vitest test runs the same check.
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
- While a quest is on view, `autoRuns()` is false. The knocked-out turns wait until the scene closes.
- `GAME_OPENED_QUESTS` in `src/data/quests.ts` names the quests the game opens. The arrival is one of them. The voice test counts it as a way in next to locals, radio calls and `begin()`.

## The ambush and the wake in Bowl

The world variable `intro_step` runs the second half of the arrival. Its values are `off`, `drive`, `patched`, `ambush` and `done`. `src/sim/intro.ts` sets every one of them.

- `introStep()` and `setIntroStep()` in `src/sim/quests.ts` read and write it, next to `openFirstFall()`.
- `advanceIntro()` runs each turn after `spawnNpcs()`. At `patched`, with the player active and on a road tile outside a site, it spawns one raider and sets `ambush`. Off the road it waits.
- The raider is the `buggy` template with the gear and chassis in `AMBUSH` in `src/data/intro.ts`. It spawns on a road out of the player's sight and nearer to Green Pit than the player. It gets a robbery feud and a fight goal on the player, the same as a raider that chose to rob. It also gets the `brave` trait, so it does not flee from a pickup with a machine gun. It carries no cargo, so it has room to rob.
- The raider drives and fights by the normal rules. It may radio a demand, and the player may refuse.
- A knockout plays the first fall as usual. When the knockout ends, `wakeInTown()` runs if the foes were not empty and the step is `ambush`. It parks the truck on a Bowl pad, sets `done` and opens `intro_bowl`. Bowl has a garage, so a player whose engine was taken can buy another.
- `intro_bowl.ink` is a page scene with Hattie at the well house. It offers no choice and plays once.
- At `ambush`, `advanceIntro()` sets `done` when no raider that is up still hunts the player. That covers a win and an escape, and it opens no scene.
- A load at any step changes no variable. The step is saved, so a load never spawns a second raider.

## The Archon's pipe

`pump_agnes.ink` is the talk of Agnes Ondra, a local at the Pump Station, which is a stall. Each question follows from her last answer: the pump, the numbers, the meter the Senate took off one pipe, the second copy. The second copy opens `pump_pipe.ink`, shown as pages. Agnes gives the player a sealed copy of her pump book to carry to Mirela Duarte in Bowl. Her stated reason is that a driver passes the patrol unseen. The margin of the book shows the real one: she wants a driver named as the finder, so the Pump Station is not.

A steward of the Archon's household meets the player on the Bowl road. He has already sent word to the patrol at the Bowl gate, so the road into Bowl has a checkpoint. The quest variable `sluice` keeps how the player stands with it.

- Social 3 on the steward gets a household pass and half the offer, and the player keeps the book. A failure sends his rider ahead, and every later check at the gate needs one more rank.
- The gate itself is run by driving the dry canal cut round it, talked past by social, or bribed with 50 M. A failed run or talk loses the bundle to the Archon's desk, costs a fine of 40 M and sets `pipe_fate` to `seized`. A bribe passes, but the patrol writes the player's name down.
- Mirela's lock house sits on the lowest canal in Bowl, right under the Archon's terraces. It needs no `found()` gate, because the player is already in Bowl once the gate is passed. The checkpoints keep their old names, and the variable `sluice` keeps the player's standing at the gate.
- At the lock Mirela asks the player to sign the Canal book as the driver who found it. Signing sets `delivered` and the household turns on the player. Leaving the name off sets `filed`, and the Canal word stands alone. Both pay 60 M.
- Machining 2 reads the terrace valve and finds the empty meter flange. Machining 3 bolts a spare meter to it for 30 M and sets `metered`. A failure shears the flange, costs a fine and marks the player.
- Perception 2 while reading the book shows the first pipe line in Wendell's hand, a year older than the order. Mirela reads it two ways and the player does not learn which is true.
- Selling to the steward pays 100 M and sets `sold`. Reading at the Granary gate sets `read`, keeps the book with social 2 and otherwise costs 40 M and the book. Dropping the bundle in a ditch changes nothing, and Agnes offers again.

The world variable `pipe_fate` keeps the outcome. Its values are `none`, `delivered`, `filed`, `sold`, `read`, `seized` and `metered`. The world variable `marr_regard` is `bought` after a sale and `enemy` after any other move against the household. Agnes greets by both outcomes.

## Locals at stalls

The Pump Station is a stall with no board of work. Its locals never call `has_work()`, `has_offers()`, `board_full()` or `take_work()`. The checker parks each local's quest at their place, as it does for Bowl and Nose, and `src/sim/locals.test.ts` talks to Agnes.

## The arrival

`intro_arrival.ink` is a page quest the game opens by itself on a new game. The player walks down into the basin with an empty canteen and finds an old pickup in a collapsed shed under a water tower. It names nobody and says nothing of who the player is. It offers one choice at the farm, to search the house first or go straight to the shed. The house pays 50 M, so the first pick teaches a new player that choices on a page change what they hold. The page shows money in its right column.

- `newGame()` in `src/sim/new-game.ts` builds the world from the start kit `arrival` and opens the quest at `start`. `newWorld()` opens nothing. With Skip the intro, `newGame()` builds the kit named by `withoutIntro` instead, which is the old stranded start.
- The kit `arrival` has the `intro` field: the pose of the truck, the farm pieces and the kit to use without the intro. `ARRIVAL` in `src/data/arrival.ts` holds them. The farm is non-baked landmark obstacles, so the map file and its hash stay as they are. The pieces are a water tower, a shed, a fallen house, a woodpile, drums and a fence. None of them can break. The tower and the shed are not loot spots.
- The farm lies at the foot of the southern rim, about 95 tiles from Green Pit. The nearest road is about 70 tiles north, out of sight, with no cliff on the way.
- The pickup is the scout with the opening condition of the standard start: a nearly dead engine, a worn cab and an opening wreck that holds 3 parts and a cage. The engine has no misfire rule. Low engine HP is what the rules give, and parts that wear down can fail. The opening tips teach driving, search, loot and patch.
- The world variable `intro_step` is `off`, `drive`, `patched`, `ambush` or `done`. The quest sets no variable. `advanceIntro()` in `src/sim/intro.ts` runs once each turn. It sets `drive` on the first turn after the scene, and `patched` once the engine needs no patch. Those two steps need the farm, so a skipped intro stays `off`. The ambush and the wake in Bowl follow from `patched`.
- Sim code reads and writes a world variable through `worldVar()` and `setWorldVar()` in `src/sim/quests.ts`, and the intro step through `introStep()` and `setIntroStep()`. `setWorldVar()` throws on an unknown name, a wrong type or an open quest session, since the next pick would undo the write.
## Language

The talk window's controls take their words from `src/text/`, in English and Russian. Quest text is English only for now, and shows as it is in Russian: the ink of every quest, and the note titles, sources and texts in `NOTES` and the local names and roles in `LOCALS` in `src/data/locals.ts`. `src/text/untranslated.ts` lists that file as an exception, since the writing will change before it is translated. Radio lines, including the Army wagon topic, are line ids like every other radio line.
