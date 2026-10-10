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

`pin_emil.ink` is a page quest. Mara Kessel, a local at the Salvage Yard stall, starts it from `yard_mara.ink` with "You look like someone with a problem." She asks for her brother Emil's one-pin ring so she can hold it. She also needs a witness whose name goes on a page, and she does not say so. Her question shows only after she has said who Emil was.

Leads:

- The wreck shows a torch cut. A man on the ammunition box names the rust-red cab. A read of the ground with `skill("perception")` shows soldiers' boots under the stripper's tracks, so the post saw the ring first and left it.
- The yard tally names the Kiln hauler, but a Nose soldier at the end of the bench hears it. That sets `post_ahead`.
- Otto Brann tells how to know a Nose ring. The crane office drawer holds the patrol roster copied twice in Mara's hand.
- Otto Brann's bench stands in the Salvage Yard, so the walk to him needs no gate. Kiln Camp is gated on `found()`.

Ways to get the ring at Kiln Camp:

- Pay 40 M, or 80 M once the post is bidding. A buyer who does not know the stamp, from Otto or from `skill("perception")`, pays for a Brann ring and must buy again.
- Tell the rider how Emil died with `skill("social")`. She gives the ring free and lies to the post. A failed talk costs 10 M and sends a boy running to the Yard, which sets `post_ahead`.
- Rebuild her mount with `skill("machining")` and swap rings. A failed weld costs 20 M for the plate.

When `post_ahead` holds, a sergeant searches the beds at the post gate. The ways through are the scrap lane with `skill("driving")`, a weld that makes the ring a bed bracket with `skill("machining")`, a talk with the sergeant with `skill("social")`, and a call to Sully's crane crew when the player saw the roster. A failed try, or opening the bed, seizes the ring. Silver burns it, takes 30 M and writes the player into his file.

Who gets the ring:

- Mara pays 40 M. She asks the player to sign two pages naming the player as the buyer. Signing sets `pin_pact` to `signed` and `post_file` to `named`. The pages and the ring then go to the crane office in a sack. Refusing keeps the file clean and loses Mara's trust.
- Silver pays 80 M and burns the ring. He asks the player to sign that a Kiln rider took it off a dead Nose man. Signing sets `kiln_word` to `named`. Refusing sets `post_file` to `named`. A player who saw the roster may name Mara for 40 M more, and she goes to the post cell.
- The Administrator pays 40 M and locks the ring beside the Pierce book. He warns that a boy at the gate will name the player to the captain, and `post_file` becomes `named`.
- The Pierce office at Nose pays 30 M and writes the name in Constance's book.

The world variable `pin_fate` keeps who holds the ring: `none`, `mara`, `silver`, `sully` or `pierce`. `pin_pact` is `silver` once Silver learned of Mara's pact, `signed` once the player signed her pages, else `hidden`. `yard_power` is `even`, `post` or `yard` and tilts toward whoever holds the Yard gate. `post_file` is `clean` or `named` and records Silver's file on the player. `kiln_word` is `named` once Kiln read a page that names the player against Kiln. Mara, Silver, the bend quest and the hook crates read them.

## The north bend

`bend_north.ink` is a page quest. Captain Silver, a local at the Salvage Yard, starts it from `yard_silver.ink` with "Is there work for me?" Silver says he wants a man off the north bend because the man talks. The real reason is that Ash's pin checks undercut the post's cause and the Nose line's mount. A Kiln rider brings Kaplan's offer for the same, and Ain wants the same result. A player whose `post_file` is `named` gets no pay from Silver and only a shorter file. A player whose `kiln_word` is `named` hears no offer from Kiln.

Ways through:

- Silver's job with `skill("toughness")` drives Ash off. A failed stand pays nothing, and soldiers take Ash. Both set `bend_fate` to `silver`.
- Kaplan's job with `skill("social")` persuades Ash to leave on his own legs. A failed talk pays nothing, and Ain's riders take the bend. Both set `bend_fate` to `kiln`.
- Warning Ash pays nothing. Leaving 60 M for pins pays Ash's tin. Both set `ash`.
- A bench at the bend with `skill("machining")` bores free second pins. It ends Ash's reason to sit there and costs the Administrator his fee. It sets `bench`. A failed bore costs 40 M for the ring of a driver whose gun swung.
- A night on the rise with `skill("perception")` shows a Nose cart leaving a crate of rifles with Kiln red cloth on it. A failed watch writes the player into Silver's file. The player may take a scarf from the crate.
- The Administrator, given the scarf, shows it to the post and sets `exposed`. Without it his crews find bare rock and charge 40 M. Silver, given the scarf, burns it, pays 80 M and sets `hush`. Without it he has the player walked out and writes the name.

`bend_fate` is `none`, `silver`, `kiln`, `ash`, `bench`, `exposed` or `hush`. Silver greets by it.

## The hook crates

`crates_hook.ink` is a page quest. Constance Pierce, a local at Nose, starts it from `nose_constance.ink` with "You look like someone with a problem." Her question shows only after she has talked about where the guns came from. She says she wants a paper a board will read against her cousin Lucan. She also wants his chair, and she needs a name on the paper that is not a Pierce. The quest never says what Lucan ordered.

Evidence and its weight:

- The filing room manifests count 1. The crane book counts 1 and costs 40 M, or 80 M once Lucan's clerk has been to Sully. Otto Brann's remark about the straps counts 1.
- The lid counts 2. Otto gives it to a player who took a Nose ring out of the Yard, or to a player who wins him over with `skill("social")`. A player with `skill("machining")` can forge a lid.
- Mara Kessel's second case copy counts 2. Sully gives it to a player who signed Mara's pages or who gave him the ring.
- A ring given to the Pierce office counts 1.

Failed checks:

- A failed read of the cut page with `skill("perception")` sets `caught`. Lucan's clerk learns it, the crane book costs more, and Otto's lid is gone. Lenka gives a rubbing that counts 1.
- A failed wager with Sully raises the price.
- A failed plea or a failed forging closes Otto for good.

Outcomes:

- Bringing 3 or more to Constance means signing a page that names the player as the source. It pays 60 M and sets `crates_fate` to `proof`. A forged lid pays 30 M and sets `forged`, and Constance keeps the player's name for leverage.
- Selling 2 or more to Lucan pays 80 M and a receipt over the player's name. Asking for his word and not coin, with `skill("social")`, gets a card that names the bearer a friend of the underwriting floor. A failed ask gets nothing. All set `lucan`.
- Burying any of it sets `buried`.

`crates_fate` is `none`, `proof`, `lucan`, `buried` or `forged`. Constance greets by it, and Mara reacts to `proof`.

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

The world variable `pipe_fate` keeps the outcome. Its values are `none`, `delivered`, `filed`, `sold`, `read`, `seized` and `metered`. The world variable `marr_regard` is `bought` after a sale and `enemy` after any other move against the household. Agnes greets by both outcomes, Odile asks about the book read at her gate, and Ilya's count reads `marr_regard`.

## The Kiln sack

`granary_odile.ink` is the talk of Odile Marsh, a local at the Granary, which is a stall. Her questions follow from each answer: the gate boards, the sack paid to Kiln, the road patrol, what troubles her count. The last one opens `granary_sack.ink`, shown as pages. The sacks out of the store are more than both boards on the gate add up to. Odile says she wants a small man she can put out of the gate, and the quest shows why: a large name would cost the Granary its peace with Kiln.

- The gate log with the store book, a carter and a watch at the Kiln drop each give a fact. The night weigher is a false lead that explains only a few sacks.
- Machining 2 on the weighing block finds a poise weight filed a hand light, so every sack reads heavy. A failure bends the knife edge and costs 20 M. Telling Odile pays 50 M and sets `mended`. The gap shrinks and does not close, and nobody learns who held the file.
- Social 2 at the drop offers the collector a written fee on the gate. Success sets `dealt`, with a third column on the board. Failure costs 40 M and the second wagon vanishes, so the drop shows nothing more.
- Toughness 3 takes the collector's stick. It counts 3 as proof. A failure costs 60 M and also hides the wagon.
- Naming the collector needs 4 proof points. The drop counts 2 and each other fact 1. It pays 70 M and sets `closed`, or `forced` with the stick, and then Kiln strips a pair of Granary carts.
- Naming the weigher pays 40 M and sets `blamed`, and the skim goes on.
- Taking the collector's envelope pays 60 M and sets `cut`.
- Chalking the true counts on a new board costs 10 M and sets `posted`.

The world variable `sack_fate` keeps the outcome. Odile greets by it.

## Juno's lamps

Odile's question about the oil she burns opens `granary_lamps.ink` once `found("glass-flats")` holds. Until then she only says where the pod field lies, at the edge of the Glass Flats. The Bowl buys Juno Pell's lamp oil, and the coin goes to a Pierce clerk against the lien painted on each lamp. The last lamp is dry and tagged for seizure. Odile asked for a look, but the Granary carter already holds a sale paper dated before the lamp went dark.

- Perception 2 at the slip sees the paper in the carter's coat. It lowers the social check for a lease by one rank.
- Paying the clerk the lien costs 120 M and sets `paid`. The clerk writes the player's name beside the number and `lien_standing` becomes `debtor`.
- Machining 2 cuts the lien plate off the post and brings up the old stamped number. It costs nothing and sets `plated`. The clerk has a number and no plate, and `lien_standing` becomes `enemy`. A failure scorches the tank, costs 40 M, raises the lien by that amount and posts armed men by the cart. Both the plate and the track are then closed.
- Toughness 3 in the track sends the cart away and sets `held`. Armed men follow next quarter and `lien_standing` becomes `enemy`. A failure costs 40 M and the same lien rise and guard.
- Social 3, or 2 with the paper seen, turns the sale into a lease and sets `leased`. A Bowl crew lights the lamps, Juno and Tam keep the ladder and the Granary pays rent in oil. A failure sets `sour` and closes the lease and the sale.
- Sending the carter away keeps every lamp lit and leaves the Granary on tallow. That sets `kept`.
- Taking the Granary's offer pays 100 M, needs Tam's word and a witness mark, and sets `sold`.

The world variable `lamps_fate` keeps the outcome. The world variable `lien_standing` is `none`, `debtor` or `enemy`. Odile talks about the outcome, and Ilya's count reads `lien_standing`.

## Ilya's count

Odile's question about the message from Old Orchard opens `orchard_count.ink` once `found("orchard")` holds. Ilya Moreno counts the motor pool every dawn and paints the number on the blockhouse wall. This morning one truck is gone. The gate stub book and a release paper show a Pierce cart took it with the seal of the Archon's household, and fresh chalk ticks on the cabs beside it show more are marked.

- Perception 2 on the rows sees the chalk ticks. Machining 2 pulls the injectors from the cabs beside the slot and sets `pulled`. A failure costs 20 M and Ilya turns his back for good, which closes the talk with him.
- Driving 3 runs the Pierce cart down on the north road and brings the truck back. It sets `reclaimed` and `lien_standing` becomes `enemy`. With `lien_standing` already `enemy` it needs driving 4. A failure costs 60 M and marks the player.
- Showing Ilya the paper pays nothing and sets `told`. He gives the player a torn page of the Army's motor pool book and writes the note `countLog`.
- Social 2 asks Ilya to say the true number at the gate where the patrol can hear. It sets `posted`. He loses his coat and `marr_regard` becomes `enemy`. A failure closes the talk with him.
- Painting the old number back costs 10 M and sets `painted`. Ilya keeps counting an empty slot.
- Selling the paper to the gate corporal pays 70 M and sets `sold`, and Ilya blames the tenants at the orchard edge.
- The gate corporal asks 20 M for his stub book when `marr_regard` is `enemy`.

The world variable `count_fate` keeps the outcome. Odile talks about it.

## Locals at stalls

The Granary and the Pump Station are stalls with no board of work. Their locals never call `has_work()`, `has_offers()`, `board_full()` or `take_work()`. The checker parks each local's quest at their place, as it does for Bowl and Nose, and `src/sim/locals.test.ts` talks to both.

## The last courier

`nose_courier.ink` is a page quest. Tamsin Roe at Nose starts it with her first hub and "I'll ride behind you". Vesna Hale is sick, so the player rides as Tamsin's pair on the south loop, told as narrated scenes at the Pump Station, the Bowl gate, Green Pit and the south bend. Tamsin writes the player's name on the loop sheet as the pair. A copy goes to the Guild board, and the board sells what it holds.

- Vesna can lend her rifle. At Green Pit, where every gun hangs on a hook by Hadiza's door, the tables talk about the new rider only if the player sits down with Tamsin or hangs the rifle there.
- The bag holds a thick letter sealed with a Burnt Convoy tin seal for Karl Vosk at Kiln Camp.
- At the Bowl gate a Bowl patrol corporal asks to look in the bag. Tamsin refuses. A player may let her hold her ground, talk him down with `skill("social")`, hide the letter in the door panel with `skill("machining")`, or hand him the bag. A failed try or handing him the bag lets him read the address and sets `letter_fate` to `read`.
- At the south bend the player may hand over the letter, which sets `delivered`. The player may also pay the 30 M toll, raise Vesna's rifle, read the rider with `skill("perception")` or take the wheel with `skill("driving")`. Both skill paths pass the rider. A failed read or a failed run strips the truck.
- Doing nothing strips the truck, costs 40 M and the rifle, and pays nothing.

`courier_fate` is `none`, `armed`, `stripped` or `ran`. `letter_fate` is `none`, `read` or `delivered`. The notes `courierLetter` and `courierRider` feed the Reading of Names, and `courierKarl` opens its southern road.

## The Reading of Names

`bowl_names.ink` is a page quest. Lusa Fenwick at Bowl starts it. She explains what the reading is and who the dead are before the first choice. The player stands through the reading on the Canyon Bridge deck, where each name carries a line about the person. A drunk man at the toll hut says that Karl Vosk shot Hal Sorensen. No line says it as fact.

- Evidence is the drunk man's word, his brass for 10 M, Dario Feld's book, and the Guild letter if the player holds the note `courierLetter`. A look at the drunk man with `skill("perception")` shows a wheel burned into his boot heel.
- The Bowl road patrol rides on three pieces of evidence. It pays 40 M, and Kiln shuts the south bend to Bowl trucks. A letter the corporal read at the Bowl gate counts as the Guild piece.
- A player named on the Guild sheet as the pair who carried the letter faces a doubting sergeant. A failed `skill("social")` costs 30 M and a night in the cell.
- Telling Hal's widow at the Granary pays nothing. Saying nothing pays nothing.
- A player who held the note `courierKarl` may ride south and talk to the rider. Success with `skill("social")` gets the rider to answer at the next reading. Failure costs a flat tire and 30 M, and the rider flees.

`names_vosk` is `none`, `patrol`, `kin`, `answered` or `fled`. Saying nothing leaves it `none`.

## The hook house

`salvage_hooks.ink` is a page quest. Pim Arslan, a stall local at the Salvage Yard, sells a smoke lens for 15 M. She explains the hooks at Green Pit and sends the player to Hadiza Okon. A Nose soldier from Silver's post writes down who hangs which rifle. Pim does not say that her own line is on his sheet.

- The lens, or `skill("perception")`, lets the player watch him. Without either, he sees the watcher and writes the face. That sets `post_file` to `named`.
- The tables, the soldier and his sheet give facts. Following him to the post gate with `skill("driving")` shows the clerk's second hand. A failed tail names the player.
- Sitting with the soldier with `skill("social")` gives more. A failed try names the player.

Ways to settle it with Hadiza:

- Telling her pays 20 M and sets `told`.
- Paying the soldier costs 40 M and sets `bought`. A harder soldier comes later.
- Talking the soldier into writing only stamps, with `skill("social")`, sets `turned`. A failed talk names the player.
- Reading the sheet aloud empties the hooks, sets `exposed` and tilts `yard_power` to `post`.
- Giving the clerk's line to the Administrator sets `sully`, tilts `yard_power` to `yard` and names the player to the post.

`hooks_report` is `none`, `told`, `bought`, `turned`, `exposed` or `sully`.

## The arrival

`intro_arrival.ink` is a page quest the game opens by itself on a new game. The player walks down into the basin with an empty canteen and finds an old pickup in a collapsed shed under a water tower. It names nobody and says nothing of who the player is. All picks only change the words, and every path reaches the shed.

- `newGame()` in `src/sim/new-game.ts` builds the world from the start kit `arrival` and opens the quest at `start`. `newWorld()` opens nothing. With Skip the intro, `newGame()` builds the kit named by `withoutIntro` instead, which is the old stranded start.
- The kit `arrival` has the `intro` field: the pose of the truck, the farm pieces and the kit to use without the intro. `ARRIVAL` in `src/data/arrival.ts` holds them. The farm is non-baked landmark obstacles, so the map file and its hash stay as they are. The pieces are a water tower, a shed, a fallen house, a woodpile, drums and a fence. None of them can break. The tower and the shed are not loot spots.
- The farm lies at the foot of the southern rim, about 95 tiles from Green Pit. The nearest road is about 70 tiles north, out of sight, with no cliff on the way.
- The pickup is the scout with the opening condition of the standard start: a nearly dead engine, a worn cab and an opening wreck that holds 3 parts and a cage. The engine has no misfire rule. Low engine HP is what the rules give, and parts that wear down can fail. The opening tips teach driving, search, loot and patch.
- The world variable `intro_step` is `off`, `walk`, `drive`, `patched`, `ambush` or `done`. The quest sets `walk` on its first choice and `drive` when the scene ends. `advanceIntro()` in `src/sim/intro.ts` runs once each turn. It sets `drive` when the scene was left early, and `patched` once the engine needs no patch. Those two steps need the farm, so a skipped intro stays `off`. The ambush and the wake in Bowl follow from `patched`.
- Sim code reads and writes a world variable through `worldVar()` and `setWorldVar()` in `src/sim/quests.ts`, and the intro step through `introStep()` and `setIntroStep()`. `setWorldVar()` throws on an unknown name, a wrong type or an open quest session, since the next pick would undo the write.
