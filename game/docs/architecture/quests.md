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

- `# view: page` shows the quest as pages. Without it the quest is a transcript.
- `# stat: <variable> <Label>` shows a number variable in the page's right column. `# stat: money Money` shows the player's money. `# stat: alarm Talk: quiet, talking, loud` shows a word for the value instead, and a value past the list shows the last word.
- `# fact: <variable> <text>` shows the text in the right column while the true or false variable is true. Facts are what the player found, written as raw observations, so the player draws the conclusion.

## Text and the talk window

- Inline markup is `<b>`, `<i>`, `<shake>`, `<pop>` and `<color=rust>`, closed by `</name>`. Square brackets would break ink choices, so markup uses angle brackets.
- A line tag sets how the line reveals: `# reveal: all`, `word` or `char`, and `# speed: slow`, `normal` or `fast`. Words is the default. `# speaker: <name>` puts the name before the line. `# work_offer` shows the town's best offer under the line.
- `# row` and `# head` make a line a table row, its cells split by `;`. Lines in a row form one table, for ledgers, logs and price boards. The voice test reads no numbers in them.
- `# place: <name>` names where the page is and heads it until another place. `# page` starts a new page, behind a Next button. A page tag on the first line of a pick's output starts no new page, so a load opens on it directly.
- `# img: <key>` shows a picture. The keys and their files under `public/quest-art/` are in `QUEST_ART` in `src/data/quest-art.ts`. A page shows the latest picture in its art column until another replaces it, and a transcript shows it in the log. A key not in the list fails the check.
- A choice tagged `# cost: <M>` takes that money when picked. The window shows it greyed with the player's money when they hold less, and a pick of it throws. The tag may hold an ink value: `+ [Pay her {price} M. # cost: {price}]`. A choice takes no other tag.
- `MARKS` and `LINE_TAGS` in `src/ui/quest-text.ts` list them. A new effect is one entry there and its CSS in `style.css`. Unknown or unclosed markup and unknown tags fail `npm run quests:check`.
- `src/ui/quest-screen.ts` is the talk window. It shows whenever `player.quests.live` is set, so a start, a pick and a load all show it. It lies over every other screen. Digits pick, a click, Space or Enter shows the rest of the reveal at once, and Escape leaves the quest.
- A transcript keeps the exchanges of this talk above the newest one. It suits short talk, like asking around town.
- A page shows art on the left, one page of text with its choices in the middle, and the stats and facts on the right. A fact found in the last pick stands out. Space or Enter after the reveal turns to the next page. It suits scenes that need full attention. `src/ui/quest-lines.ts` draws lines for both views.

## Saves

- A save holds `player.quests` without `live`, so it holds no ink state.
- Load raises a `SaveError` on a stored quest, variable, type or checkpoint the current bundle does not declare.
- The rescue screen then carries every variable the bundle still declares with the same type, lists the rest as lost, and closes the open quest. `fittingQuestVars()` decides.
- `src/three/save-shape.json` records every saved variable name with its type and every checkpoint. Removing, renaming or retyping one needs a migration step, and `npm run save:shape` refuses it under the recorded format. Additions need no step.
- `src/three/save-migrations.ts` has pure helpers for those steps: `renameQuestVar()`, `dropQuestVar()`, `moveQuestCheckpoint()`, `endQuestSession()` and `dropQuest()`. A null quest means a world variable.

## Tools

- `npm run quest -- <quest>` plays a quest in the terminal on a new game, compiled fresh from the sources, so an edit plays without a build. Choices are numbered from 1. `--checkpoint <name>` starts at another checkpoint than the first. `--picks 1,2` plays those choices, and without it the player types picks. `--set name=value` sets a world or quest variable before the start. `--save <file>` writes the quest state as a save holds it. `--load <file>` checks that state against the sources. With an open session of the quest it resumes at its checkpoint, and with no open session it starts the quest with the saved variables, so one quest's outcome carries into the next.
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
- `openFirstFall()` skips when another quest session is open or when the world variable `first_knockout_seen` is true. The quest sets that variable after its first choice, so saves keep it and `src/sim/types.ts` stays as it is.
- Leaving the scene before the first choice sets nothing, so the next knockout opens it again.
- While a quest is on view, `autoRuns()` is false. The knocked-out turns wait until the scene closes.
- `GAME_OPENED_QUESTS` in `src/data/quests.ts` names the quests the game opens. The arrival is one of them. The voice test counts it as a way in next to locals, radio calls and `begin()`.
- Both checkpoints open with text only, so a load at any page changes no variable and opens nothing twice.

## The ambush and the wake in Bowl

The world variable `intro_step` runs the second half of the arrival. Its values are `off`, `walk`, `drive`, `patched`, `ambush` and `done`. `src/sim/intro.ts` sets `ambush`, and `intro_bowl.ink` and `src/sim/intro.ts` set `done`.

- `introStep()` and `setIntroStep()` in `src/sim/quests.ts` read and write it, next to `openFirstFall()`.
- `advanceIntro()` runs each turn after `spawnNpcs()`. At `patched`, with the player active and on a road tile outside a site, it spawns one raider and sets `ambush`. Off the road it waits.
- The raider is the `buggy` template with the gear and chassis in `AMBUSH` in `src/data/intro.ts`. It spawns on a road out of the player's sight and nearer to Green Pit than the player. It gets a robbery feud and a fight goal on the player, the same as a raider that chose to rob. It also gets the `brave` trait, so it does not flee from a pickup with a machine gun. It carries no cargo, so it has room to rob.
- The raider drives and fights by the normal rules. It may radio a demand, and the player may refuse.
- A knockout plays the first fall as usual. When the knockout ends, `wakeInTown()` runs if the foes were not empty and the step is `ambush`. It parks the truck on a Bowl pad and opens `intro_bowl`. Bowl has a garage, so a player whose engine was taken can buy another.
- `intro_bowl.ink` is a page scene with Hattie at the well house. Its first choice sets `done`. Leaving before that choice sets nothing, so the next knockout plays it again.
- At `ambush`, `advanceIntro()` sets `done` when no raider that is up still hunts the player. That covers a win and an escape, and it opens no scene.
- A load at any step changes no variable. The step is saved, so a load never spawns a second raider.

## Emil's pin

`pin_emil.ink` is a page quest. Mara Kessel, a local at the Salvage Yard stall, starts it from `yard_mara.ink` with "You look like someone with a problem." She wants the one-pin swivel ring from her brother Emil's wreck. Each lead gives a fact. The wreck shows a torch cut, the yard tally names a Kiln hauler, Otto Brann at Ridge Wrecks tells the player how to know a Nose ring, and the crane office drawer holds the patrol roster copied twice in Mara's hand. Ridge Wrecks and Kiln Camp are gated on `found()`. The ring costs 40 M from the Kiln rider.

- Giving the ring to Mara pays 60 M. If the player saw the roster, they may tell Mara they know. That changes only her words.
- Giving it to Captain Silver pays 150 M and the ring goes into the slag drum. If the player saw the roster, Silver asks whose hand wrote it, and naming Mara pays 100 M more and puts her in the post cell.
- Giving it to the Administrator pays 90 M and the ring goes into the crane office drawer.
- The stall local calls none of `has_work`, `has_offers`, `board_full` or `take_work`.

The world variable `pin_fate` keeps who holds the ring: `none`, `mara`, `silver` or `sully`. `pin_pact` is `silver` once Silver learned of Mara's pact, else `hidden`. Mara talks by both.

## The north bend

`bend_north.ink` is a page quest. Captain Silver, a local at the Salvage Yard, starts it from `yard_silver.ink` with "Is there work for me?" Silver pays 150 M to clear Ash Kerimov off the north bend. A Kiln rider at the yard brings Kaplan's offer of 180 M for the same, with the request that Ash is not hurt. A ride to the bend gives Ash's story.

- Taking Silver's job drives Ash out, and a Nose truck takes the bend on a single pin.
- Taking Kaplan's job also drives Ash out, and Kiln riders sit at the bend.
- Warning Ash pays nothing and he stays.
- Leaving 60 M for pins pays Ash's tin and he stays.

The world variable `bend_fate` keeps the outcome: `none`, `silver`, `kiln` or `ash`. Silver greets by it. A player who leaves the quest unfinished hears Silver's pitch again.

## The hook crates

`crates_hook.ink` is a page quest. Constance Pierce, a local at Nose, starts it from `nose_constance.ink` with "You look like someone with a problem." She suspects her cousin Lucan sent the hook crates north and cannot prove it. Four facts are evidence: the filing room manifests, the crane book, Otto Brann's remark about the straps he signed, and the lid he kept. The lid counts 2 and each other fact 1. The crane book costs 40 M. Evidence only ever shows a chalked initial. The quest never says what Lucan ordered.

- Bringing 3 or more to Constance pays 180 M and the pages go to the Pierce board.
- Selling 2 or more to Lucan Pierce pays 240 M and he asks the player to tell Constance they found nothing.
- Burying any of it pays nothing.

The world variable `crates_fate` keeps the outcome: `none`, `proof`, `lucan` or `buried`. Constance greets by it, and Mara reacts to `proof`.

## The Archon's pipe

`pump_agnes.ink` is the talk of Agnes Ondra, a local at the Pump Station, which is a stall. Her question about the pillow opens `pump_pipe.ink`, shown as pages. She gives the player a sealed copy of her pump book to carry to South Lock. A steward of the Archon's household meets the player on the Bowl road and offers 150 M to lose it.

- Delivering the copy to Mirela Duarte pays 80 M. The choice shows only once `found("south-lock")` holds.
- Selling it to the steward pays 150 M.
- Reading it out at the Granary gate costs a fine of 40 M, or whatever the player holds if less.
- Dropping it in a ditch pays and costs nothing, and Agnes offers a new copy.
- Cutting the seal to read the book first writes the journal note `pipeDraw` and shows a table of the weekly lines.

The world variable `pipe_fate` keeps the outcome of the first three. Agnes greets by it, and Odile asks about the book read at her gate.

## The Kiln sack

`granary_odile.ink` is the talk of Odile Marsh, a local at the Granary, which is a stall. Her question about the count opens `granary_sack.ink`, shown as pages. The sacks out of the store are more than the two boards on the gate add up to.

- The gate log, the store book, a carter and a watch at the Kiln drop each give a fact. The night weigher is a false lead that explains only a few sacks.
- Naming the Kiln collector with 3 or more proof points pays 90 M. The drop counts 2 and each other fact 1.
- Naming the weigher gets him thrown out, and the skim goes on.
- Taking the collector's envelope pays 60 M and leaves the tenants short.
- Chalking the true counts on a new board costs 10 M and sets the carters asking who holds the stick.

The world variable `sack_fate` keeps the outcome. Odile greets by it.

## Juno's lamps

Odile's question about lamp oil opens `granary_lamps.ink` once `found("podfield")` holds. Until then she only says where Podfield lies. The Bowl buys Juno Pell's lamp oil, and the coin goes to a Pierce clerk against the lien painted on each lamp. The last lamp is dry and tagged for seizure.

- Paying the clerk the lien on the dark lamp costs 120 M and lights it.
- Sending the carter away without oil keeps every lamp lit and leaves the Granary on tallow.
- Taking the Granary's offer for the lamps pays 100 M, and a Bowl crew keeps them lit from then on. It needs Tam's word about the dry lamp first.

The world variable `lamps_fate` keeps the outcome. Odile talks about it.

## Ilya's count

Odile's question about the Old Orchard patrol opens `orchard_count.ink` once `found("orchard")` holds. Ilya Moreno counts the motor pool every dawn and paints the number on the blockhouse wall. This morning one truck is gone. The gate stub book and a release paper show a Pierce cart took it with the seal of the Archon's household.

- Showing Ilya the paper pays nothing. He gives the player a torn page of the Army's motor pool book and writes the note `countLog`.
- Painting the old number back costs 10 M and leaves Ilya counting an empty slot.
- Selling the paper to the gate corporal pays 70 M, and Ilya blames the tenants at the orchard edge.

The world variable `count_fate` keeps the outcome. Odile talks about it.

## Locals at stalls

The Granary and the Pump Station are stalls with no board of work. Their locals never call `has_work()`, `has_offers()`, `board_full()` or `take_work()`. The checker parks each local's quest at their place, as it does for Bowl and Nose, and `src/sim/locals.test.ts` talks to both.

## The last courier

`nose_courier.ink` is a page quest. Tamsin Roe at Nose starts it with "Why no gun?" and "I will ride behind you". Vesna Hale is sick, so the player rides as Tamsin's pair on the south loop, told as narrated scenes at the Pump Station, South Lock, Green Pit and the south bend.

- Vesna can lend her rifle. The Green Pit hooks give a rumor about the new Kiln rider only if the player hangs the rifle there.
- The bag holds a letter for Karl Vosk at Kiln Camp. Handing it over or paying the 30 M toll lets the truck pass.
- Raising the rifle also passes, and Tamsin pays but will not ride behind it again. Doing nothing strips the truck, costs 40 M and the rifle, and pays nothing.

The world variable `courier_fate` is `"armed"` or `"stripped"`. A pass without the rifle leaves it `"none"`. The notes `courierLetter` and `courierRider` feed the Reading of Names.

## The Reading of Names

`bowl_names.ink` is a page quest. Lusa Fenwick at Bowl starts it. The player stands through the reading at Canyon Bridge, and a drunk man at the toll hut says that Karl Vosk shot Hal Sorensen. No line says it as fact.

- Evidence is the drunk man's word, his brass (10 M for a drink), Dario Feld's book, and the Guild letter if the player holds the note `courierLetter`.
- The Bowl road patrol rides only on three pieces of evidence. It pays 80 M, and Kiln shuts the south bend to Bowl trucks.
- Telling Hal's widow at the Granary or saying nothing pays nothing.

The world variable `names_vosk` is `"patrol"` or `"kin"`. Saying nothing leaves it `"none"`.

## The hook house

`salvage_hooks.ink` is a page quest. Pim Arslan, a stall local at the Salvage Yard, sells a smoke lens for 15 M and sends the player to Hadiza Okon at Green Pit. A Nose soldier from Silver's post writes down who hangs which rifle.

- The lens lets the player watch him and read his sheet. Asking the tables and following him to Silver's post shows what he reports and to whom.
- Telling Hadiza pays 50 M. Paying the soldier costs 40 M. Reading the sheet aloud empties the hooks.

The world variable `hooks_report` is `"told"` or `"exposed"`. Paying the soldier leaves it `"none"`.

## The arrival

`intro_arrival.ink` is a page quest the game opens by itself on a new game. The player walks down into the basin with an empty canteen and finds an old pickup in a collapsed shed under a water tower. It names nobody and says nothing of who the player is. All picks only change the words, and every path reaches the shed.

- `newGame()` in `src/sim/new-game.ts` builds the world from the start kit `arrival` and opens the quest at `start`. `newWorld()` opens nothing. With Skip the intro, `newGame()` builds the kit named by `withoutIntro` instead, which is the old stranded start.
- The kit `arrival` has the `intro` field: the pose of the truck, the farm pieces and the kit to use without the intro. `ARRIVAL` in `src/data/arrival.ts` holds them. The farm is non-baked landmark obstacles, so the map file and its hash stay as they are. The pieces are a water tower, a shed, a fallen house, a woodpile, drums and a fence. None of them can break. The tower and the shed are not loot spots.
- The farm lies at the foot of the southern rim, about 95 tiles from Green Pit. The nearest road is about 70 tiles north, out of sight, with no cliff on the way.
- The pickup is the scout with the opening condition of the standard start: a nearly dead engine, a worn cab and an opening wreck that holds 3 parts and a cage. The engine has no misfire rule. Low engine HP is what the rules give, and parts that wear down can fail. The opening tips teach driving, search, loot and patch.
- The world variable `intro_step` is `off`, `walk`, `drive`, `patched`, `ambush` or `done`. The quest sets `walk` on its first choice and `drive` when the scene ends. `advanceIntro()` in `src/sim/intro.ts` runs once each turn. It sets `drive` when the scene was left early, and `patched` once the engine needs no patch. Those two steps need the farm, so a skipped intro stays `off`. The ambush and the wake in Bowl follow from `patched`.
- Sim code reads and writes a world variable through `worldVar()` and `setWorldVar()` in `src/sim/quests.ts`, and the intro step through `introStep()` and `setIntroStep()`. `setWorldVar()` throws on an unknown name, a wrong type or an open quest session, since the next pick would undo the write.
