# Writing quests

This guide covers how to add a quest, change one safely and keep all quests healthy. Quests are ink scripts in `src/data/quests/`. [Quests](../architecture/quests.md) is the reference for every tag, game function and save rule, and this guide links there instead of repeating it. The ink language itself is in [Writing with ink](https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md).

## Making a quest

A quest is built in three steps: play out the story behind it, write it, then playtest it with a fresh agent until every criterion scores 5 out of 5.

1. Build the situation with the [Story game](../lore/story-game.md). Run a smaller pass at the quest's place and time. Agents play the people of the quest, and the earlier history stays fixed. Give the pass one question, like who drains the pump. The log gives you the factions, what each one wants, the hidden truth and the scenes. Nobody wrote that plot, so it has real twists and failures. Move new names and facts into the lore pages.
2. Write the quest from the log with this guide and [Writing dialogue](dialogue.md). Every line a named person speaks comes from [Character lines](character-lines.md). Each player in the story game becomes a person the player can meet, and the hidden truth becomes what the player can find out.
3. Playtest it with Codex. Run it in the background, with a log:

   ```
   npm run quest:playtest -- pump_agnes --situation "You drive a truck, and you just rolled into a water outpost where a woman is at work." --out tmp/playtest-pump.md > tmp/playtest.log 2>&1 &
   ```

   The situation is one or two sentences about what the player sees on arrival. Tell it nothing else, so it plays like a player. The script shows Codex one screen at a time, as the player sees it, and Codex answers with a comment and one choice. It never runs commands or reads the source. The comments follow the rubric in [the playtest prompt](playtest-prompt.md): clarity, voice, choices, pull, consistency and prose. When the story ends, Codex may start over once on a different road. Then it gives three best things, up to five worst problems, a score from 1 to 5 for each criterion by the scale in the prompt, and what would make every criterion a 5. The run's score is the lowest of the six. The notes file holds every screen, comment and pick. `--screens` caps the screens, 40 by default. `--lang ru --prompt docs/writing/playtest-prompt-ru.md` plays the Russian twins with a native Russian reader, who marks every line that reads as a translation with «ПЕРЕВОД:». In Russian the player is agy in place of Codex, since agy reads Russian better, and `--model` then names an agy model. `--player codex` or `--player agy` overrides that choice. Write its situation and `--then` lines in Russian.

   A new game has every skill at 0, so every check fails. Give each run the skills of a driver who would arrive at this place with `--skill <skill>=<level>`, which may repeat. Run at least three times, with a different driver each time and one short line in the situation about how they play, like "You like machines, and you want to see things for yourself." Runs with the same situation and skills pick the same road.

   Quests that follow each other, like the intro, are played by one agent in order. Name them all, and give one `--then` line before each quest after the first, which says in plain words what the player did in between. Codex may start over only in the last one. Each quest starts with the world variables the quest before it ended with, so a pin taken in one quest is still held in the next. `npm run quest -- <quest> --play <run file> --from <earlier run file>` does the same by hand. `--set name=value` sets a variable before each quest, such as `--set intro_step=ambush`:

   ```
   npm run quest:playtest -- intro_arrival first_fall intro_bowl bowl_hattie --situation "You start a new game. You are on foot in a desert, with no water." --then "You patch the engine and drive north. A raider truck opens fire, and you lose the fight." --then "You stay out cold." --then "You walk around Bowl. Hattie has time to talk." --set intro_step=ambush --out tmp/playtest-intro.md > tmp/playtest.log 2>&1 &
   ```
4. Check every problem it names in the source, then fix the real ones. Rerun the quest checks in [The loop](#the-loop).
5. Repeat steps 3 and 4 with a new Codex run each time. A fresh run has not seen the old version. The quest is done when fresh runs with different drivers each score it 5 out of 5.

A run that hits a load error or a broken runner does not count. Fix the error and run again.

## The loop

1. Edit or add a `.ink` file in `src/data/quests/`, and have agy make the same change in its Russian twin in `src/data/quests/ru/`, as [Russian copy](russian.md) says.
2. Play it in the terminal: `npm run quest -- <quest>`, and `--lang ru` plays the twin. `npm run quest -- list` prints every quest id. It compiles fresh from the sources, so no build is needed. `--picks 1,2,1` plays fixed choices, `--checkpoint <name>` starts elsewhere, `--set name=value` sets a variable first, and `--skill social=2` sets a skill. `--play tmp/run.json` keeps a game in a file: each call with `--pick 2` makes one choice and shows only the next screen. A new file starts a new game. Under each screen, both views print the tip of every marked term, like `[hover Bowl: ...]`, so a playtest agent reads the tips a player can hover.
3. Run `npm run quests:check`. It fails on compile errors, broken tags, dead ends, sections never reached, effects that a load would repeat and a twin that plays out differently from its English quest. It names the picks that lead to each problem.
4. Run `npm run quests:build` to write `src/data/quests.json`. The game reads only this bundle, and a test fails when it is stale.
5. Run the touched tests: `npx vitest run src/test/quest-voice.test.ts src/test/quest-compile.test.ts src/sim/locals.test.ts`.
6. See it in the game with `npm run dev`. Open the console with backquote and type `tp nose` or `tp bowl`, then open the town and pick Look for locals.

## A new quest

A quest is one file named by its id, such as `bowl_mira.ink`. Its first section must be a checkpoint named `start`, because every way into a quest opens it there.

```ink
INCLUDE world.ink

VAR asked_seed = false

=== start ===
# checkpoint: start
Mira wipes flour off her hands. # speaker: Mira
-> hub

= hub
# checkpoint: start.hub
+ {not asked_seed} [Where does the seed come from?]
  ~ asked_seed = true
  From the vault under the granary. Nobody outside Bowl sees it. # speaker: Mira
  -> hub
+ [Goodbye.]
  -> END
```

Every quest needs a way in. The voice test fails on a quest that nothing starts.

- A town local: add an entry to `LOCALS` in `src/data/locals.ts` with the quest id, and its `local.<id>.name` and `local.<id>.role` in `src/text/en/story.ts` and `src/text/ru/story.ts`. The People tab lists them.
- A radio call: give a radio option `go: questGo('<quest>')` in `src/data/dialogue.ts`. The call ends and the quest opens.
- Another quest: call `~ begin("<quest>")` right before `-> END`. Kovac opens the depot quest this way.

## Talk or pages

A quest without top tags is a talk. The window shows only the player's last pick, the reply to it and the choices. Earlier replies are gone, so each reply must make sense on its own. Use it for short talk, such as asking a local about rumors.

A scene that needs full attention, like an investigation or an intro sequence, uses pages. The top tags go above `INCLUDE`. ink ignores them anywhere else, so the build fails on one placed lower:

```ink
# view: page
# stat: watches Watches
# stat: money M's
# fact: saw_cut_seal Dispatch: a fuel can on Kovac's desk, its Army seal cut clean.
INCLUDE world.ink
```

- Give each scene a `# place:` on its first line. The heading stays until another place.
- Put `# page` on the first line of a hub that follows an outcome. The outcome then shows on its own page with Next, and the hub opens fresh.
- Write documents as tables with `# head` and `# row` lines, cells split by `;`. Use them for ledgers, logs and price boards.
- `# img: <key>` shows a picture. Make it by [Quest art](../art/quest-art.md), which writes it to `public/quest-art/`, and add the key with its `file`, `focusX` and `focusY` to `src/data/quest-art.json`. `focusX` and `focusY` are the percents across and down the picture that every crop keeps in the same place. [Quest art](../art/quest-art.md#crop-sheet) says how to set them. Put the same tag on the same line of the Russian twin. Repeat the tag on the first line of a checkpoint whose page should show it after a load.
- A paid choice carries `# cost: <M>` inside its brackets. The runner charges it on the pick and greys the choice out when the player holds less.
- A choice that can fail carries `# check: <skill> <level>` inside its brackets, and the ink after it branches on `passed()`. The window shows the skill and level next to the choice. [Skill checks in talk](dialogue.md#skill-checks-in-talk) has the writing rules.

[Quests](../architecture/quests.md#top-tags) lists every tag and its exact rules.

## Quest design

Age of Decadence is the model. Its designer held every quest to three rules: no delivery errands, several ways through that each use a different skill, and outcomes that shift the factions.

- No errands. A job that sounds like "carry this" or "find out who" opens a fight between factions. The cargo, the paper or the answer matters more to someone else than to the player.
- Each quest has several ways through, and each uses a different skill or something the player holds. Social talks, bribes or lies. Perception sees what is off. Machining reads a weld or fixes the problem. Driving outruns or rams. Force, a forged paper and walking away are ways through too.
- A failed check has a consequence. It does not only close a door. A driver who asks about brake rods and knows nothing of trucks makes the yard wonder who sent them.
- An outcome shifts power between factions, and it opens or closes later quests. A player thrown out of a faction loses its help for good.
- People use the player. Someone who helps for free may want the player's name on a paper, then use it to steal and leave the player to take the blame. The reason a person gives for a job is often not the real one.
- The world moves without the player. The person they came to see may already be dead. Opponents are as competent as the player, and they act on what they know.
- Information is earned and partial. Two people can tell different versions, and the player does not always learn which was true. No fact depends on one person alone, so killing or angering anyone never locks the player out.
- Money is a tool, not the prize. A plain deal pays a plain fee. Larger rewards are standing with a faction, an open door, a tool, or the way into the next quest.
- Everything costs something. A good outcome for one faction is a bad outcome for another.

## Writing rules

[Writing dialogue](dialogue.md) holds the house style for narration and talk, and every rule for speech: voices, answers, player questions, dodges, skill checks in talk and sentence style. These rules cover the rest.

- Show, do not tell. Give the player what their character sees and let them draw the conclusion. Write "Pell's name is on every line of the ledger" and never "the ledger points at Pell". A fact in the right column records an observation, never a verdict. Narration never states the answer to a clue the player is meant to work out. The character may still judge and guess, like "Somebody paid him lately".
- Narration in page scenes uses full, concrete sentences. They run through the character's head, as [Writing dialogue](dialogue.md#a-voice-not-a-camera) asks, and every line makes sense to a player who has read only the screens before it. Detail of sight, sound, heat and touch goes where the scene turns. Vary sentence length. A page of three-word sentences reads as a telegram, not a scene.
- Stay in character. Text never talks about game systems: turns, quests, XP, levels, HP, the map or the player. The words keep their everyday meaning, so "the road turns" and "an old map" are fine. Ordinary numbers are fine. The voice test in `src/test/out-of-character.ts` checks the game phrases.
- No semicolons, and in English no dashes or stock AI phrases, in narration, speech, choices or notes. [Sentences](dialogue.md#sentences) has the rule and `src/test/prose-tells.ts` the list. Read the rest against the [Humanizer](humanizer.md#how-roam-uses-it) the way its How ROAM uses it section says for fiction. A `;` is allowed only to split the cells of a `# row` or `# head` table line.
- `<b>` is only for a name or a sum in a written document, like a ledger row. A page carries one or two highlights at most: `<shake>`, `<pop>` or `<color>`, for a physical event or a word the scene introduces.
- Speech reveals word by word and narration fades in a paragraph at a time, with no tag needed. Give a narration line `# reveal: word` or `char`, `<pause>` or `<now>` only where its timing is the point, like the first link in the intro.
- A word that locals use as if everyone knows it gets a term tip. [Term tips](#term-tips) has the rules.
- A rumor goes into the journal with `~ note("<id>")`. Add the id to `NOTE_IDS` in `src/data/locals.ts` first, and its `journalNote.<id>.title`, `from` and `text` to `src/text/en/story.ts` and `src/text/ru/story.ts`.

- Every choice changes something real: what the player learns, what they hold, who knows them or where the story goes. A choice whose options all lead to the same outcome is no choice. Cut it and let the page run on behind Next.

## Term tips

Locals name places, groups and road slang as if everyone knows them, and a stranger does not. A term tip fills that gap without a "What is X?" question. The player hovers the word and reads what any local could have told them. It makes the world feel known without stopping the talk.

Mark the word in ink, add its id to `TERM_IDS` in `src/data/locals.ts`, and write its tip as `term.<id>` in `src/text/en/story.ts` and `src/text/ru/story.ts`:

```ink
Water costs here, talk doesn't, and I hear everything that happens in <term=bowl>Bowl</term> twice.
```

```ts
'term.bowl': 'A farm town cut in terraces down the inside of an old crater. Canals carry the water to the fields, and the well house sells it by the bucket.',
```

What a tip may say:

- A tip holds common knowledge: what any driver in the basin would tell a stranger over a cup of water.
- A tip is in-world. It names no game rule, number, stat, skill or mechanic.
- A tip adds a fact the line does not say. If Hattie says the Glass Flats are melted ground, the tip says something else about them.
- A tip never tells a secret, an outcome, a hidden motive or anything a quest lets the player find out. The player discovers those in play.
- A tip is one or two short, plain sentences, in the voice of narration. It is never a riddle.
- Every fact in a tip matches `docs/lore/`. Check the lore before you write it.
- A tip is never needed to choose. A fact the player needs for a choice goes in the line itself.

Where to mark a word:

- Mark a word only on a line where the player may know everything its tip says. The writer decides this, and the game does not check it.
- Mark a term once per screen, on its first use.
- Mark terms in spoken and narrated lines only, never in a choice. Choice buttons print their text as it is, so a mark would show as raw text.
- When the player later learns more about a term, add a new entry with its own id, like `bowl_well` beside `bowl`. Mark the new id only on lines after the player has learned it. Never change an old entry to hold the new fact.
- A tip replaces a question whose answer is only a definition, like "What is this place?". Keep the question when its answer is a story, an opinion or a lead.

How to check:

- `npm run quests:check` fails a term id that is not in `TERM_IDS`, and tsc fails a term with no tip in either language.
- `npm run quest` prints the tips of every marked term under each screen, like `[hover Bowl: ...]`. Read them as a player who has seen only the screens before.
## Rules the build enforces

A save keeps only the variables and the last checkpoint. Load replays the quest from that checkpoint, so ink's own memory is gone after a load. The build and the checker hold quests to that.

- Use sticky `+` choices with a variable guard. A once-only `*` choice fails the build, because it would come back after a load.
- Keep facts in variables. Reading a visit count, such as `{knot}`, `READ_COUNT` or `TURNS_SINCE`, fails the build.
- A checkpoint's opening, up to its first choice, may change no variable and call no effect. A load plays it again. Put `~ x = ...`, `pay()` and `note()` after a choice.
- In a page quest, a load must show text before its choices. Put a checkpoint on a scene's opening line, and keep a choice list that loops back in an untagged stitch after it. A talk hub may stay a checkpoint, since a talk shows only the last pick, its reply and the choices.
- A checkpoint must run from a fresh story. It may not rely on temporary variables or tunnels from before it.
- `begin()` must come right before `-> END`.
- Check `money()` before `pay()`, or use `# cost:`. `pay()` throws when the player holds less.

## Keeping the checker fast

`npm run quests:check` walks every reachable state of every quest in a new game and in a veteran game. It stops and fails at 5,000 states per world. Each variable multiplies the states, so:

- Prefer one choice over a sequence of picks that can come in any order. Picking facts one by one at an accusation multiplied the depot quest past 35,000 states. One pick of a name followed by a fixed review keeps it near 10,000 in total.
- Reset short-lived variables as soon as they stop mattering. Use `~ temp` for a value that only one passage needs, as the depot quest's review does.
- Derive values with an ink function, like `facts_held()`, instead of keeping a counter in sync.
- Assign world variables only literal values, like `~ depot_thief = "vance"`. The checker builds one extra world per literal value, so branches on another quest's outcome get walked.

## Changing a shipped quest

Players' saves hold quest variables by name and the checkpoint by name. `src/three/save-shape.json` records both, and `npm run save:shape` refuses a change that would break an old save.

- Adding a variable, a checkpoint, a section or a line is safe. Old saves get the new variable's initial value.
- Renaming or removing a variable or a checkpoint, or changing a variable's type, needs a save migration step. Add one tiny step to `TINY_STEPS` in `src/three/save-migrations.ts` with the quest helpers: `renameQuestVar()`, `dropQuestVar()`, `moveQuestCheckpoint()`, `endQuestSession()` and `dropQuest()`. Pass `null` as the quest for a world variable. A renamed variable or note also gets a row in `src/three/save-rescue.ts`, so the rescue carries it from saves older than the step.
- Give the step a test on a small fixture in `src/three/save-fixtures/`, then run `npm run save:shape`.
- Changing the text before a checkpoint changes nothing in saves. A player who loads sees the new text from the checkpoint on.
- Changing what a quest reads, writes, gives or begins makes `npm run save:shape` ask whether old progress still makes sense. If it does, run `npm run save:shape -- --compatible <quest>`. If it does not, raise the quest's `# revision:` tag in both twins. A load then resets that quest and the quests whose saved progress stands on it. Everything else in the world stays.
- Example: A begins B, B begins C, and a rework puts a new quest Z between B and C. Old saves hold B's outcome, which C was built on. Raise B's revision. On load B resets, C resets because it reads B's outcome or was begun by B, and A keeps its state. The player can go back to whoever begins B and play B, Z and C.
- A raised revision also lets a quest drop or retype its own variables and checkpoints with no step, since its variables reset.
- Prefer a migration step for a scene the game opens, like `first_fall` and `wagon_seven`. A raised revision resets its gate, and the game opens it again only on its next trigger, which a player who searched the wagon may never meet.

## A new game function

A quest can only ask the game through functions in `world.ink`.

1. Declare it in `world.ink` as `EXTERNAL name(args)`.
2. Add it to `QUEST_QUERIES` in `src/sim/quests.ts` if it only reads the world, or to `QUEST_EFFECTS` if it changes it. Validate every argument and throw on a bad one.
3. The checker fails when a function is missing on either side.
4. If the answer can differ between a new game and a veteran, `gameScenes()` in `src/test/quest-check.ts` must set it up so both branches get walked.

## When something fails

- "Expected end of line but saw `|`": a bare `|` is ink syntax. Split table cells with `;`.
- "A view, stat or fact tag sits below other content": move the top tags above `INCLUDE world.ink`.
- "Effect ran while loading checkpoint": move the effect after the checkpoint's first choice.
- "Loading checkpoint changed its variables": move the `~` line after the first choice.
- "a load at checkpoint X shows no text before its choices": a page quest checkpoint sits on a bare choice list. Move the checkpoint to the scene's opening line and put the choices in an untagged stitch.
- "no choice leads to an end from here": a loop has no exit. Give it one, or cost each lap something, such as a watch.
- "only paid choices lead to an end": the player cannot leave a quest midway, so a player with no money is stuck there. Add a free choice that leads to an end.
- "section is never reached": a condition can never hold in either check world, or the section is dead. Fix the condition or delete it.
- "stopped after 5000 states": see [Keeping the checker fast](#keeping-the-checker-fast).
- The voice test names a line that talks about a game system: reword it in character.
