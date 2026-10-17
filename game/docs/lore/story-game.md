# Story game

A turn-based game that generates history and stories for Icarus. Agents play the factions or characters, and a game master resolves what they do. The result reads like history: nobody wrote the plot, so it has the twists, failures and odd turns of real events. The rules are a simplified version of Fate Core, which treats any group as a character.

Use it to write the past of a place, the rise and fall of a faction, a town's quarrel, one character's life, or the situation behind a quest. [Making a quest](../writing/quests.md#making-a-quest) shows where it fits. Everything it produces answers to [Theme](../theme.md) and [World facts](world.md).

## Roles

- The game master is the main agent. It keeps the board, writes each turn's events, rolls the dice, resolves every action and writes the log.
- Each player is one agent playing one faction or character. Run players on a small fast model. Start each player once, then continue the same agent every turn, so it remembers its own past.
- A player knows only its own sheet, the public news and the messages it received. It never sees the anchors, the other sheets or the game master's secrets.

## Setup

1. Pick the scale. A turn can be a decade for history, a season for a town quarrel, or a day for one character's journey.
2. Pick the start and end points on the calendar.
3. Write the anchors: facts from the lore that the story must reach. The game master steers toward them, and the players decide how they happen. A story with no anchors runs free.
4. Write the issues. A current issue is a problem that already exists, like "The river is dying". An impending issue is a threat that has just appeared, like "Something is falling from the sky". Issues are aspects of the whole world.
5. Write a sheet for every starting faction or character.
6. Write the game master's truths: the hidden answers behind the mysteries. Players never see them, and the log keeps them apart from public events.

## The sheet

Every faction or character has a sheet:

- Name and a one-line description.
- High concept: an aspect that says what it is, like "Last staff of the Old World canal authority".
- Way: one of the five ways of coping from the theme.
- Trouble: an aspect that makes its life harder, like "Nobody pays the army".
- One or two more aspects.
- Skills, rated on the ladder below. For a faction use People, Arms, Supplies, Know-how and Influence. For a character use Fight, Drive, Notice, Know-how, Will and Talk.
- Leader: a name, an age, a goal, a fear and a habit. A character sheet is its own leader.
- Fate points: three at the start of each turn.

The ladder runs Terrible -2, Poor -1, Mediocre 0, Average +1, Fair +2, Good +3, Great +4. Give each faction one Good, two Fair, one Average and one Mediocre skill. A small faction starts lower.

## A turn

1. The game master announces the turn's dates, one event and any change to the issues.
2. The game master sends each player a brief: its last result, its sheet, the public news, the messages it received and the event.
3. Each player answers with one action:
   - Aim: what it wants this turn.
   - How: what it does.
   - Kind: overcome, create an advantage, attack or defend.
   - Skill: which skill it uses.
   - Invoke: any aspects it invokes, one fate point each.
   - Message: an optional offer, threat or deal to one named player.
   - Voice: one line its leader says.
4. The game master resolves every action, writes the results and secrets into the log, and ages the leaders.

## Resolution

Roll four Fate dice. Each die reads -1, 0 or +1. Add the skill. Compare the total with the difficulty: Average +1 for something easy, Fair +2 for something normal, Great +4 for something hard. When another player opposes the action, its own roll and skill set the difficulty instead.

- Fail: under the difficulty. The action fails, or succeeds at a serious cost the game master chooses.
- Tie: equal. The player gets a lesser version of the aim, or the full aim at a minor cost.
- Succeed: one or two over. The player gets the aim.
- Succeed with style: three or more over. The player gets the aim and something extra.

An invoked aspect adds +2 or allows a reroll, if the player can say why it helps. Its own aspects, the world's issues and aspects created on others all count.

Each kind of action has its own result:

- Overcome gets past an obstacle or reaches a goal.
- Create an advantage puts a new aspect on the world, a place or another player, with one free invocation, or two with style.
- Attack harms another player. Each shift of the attack must be absorbed by that player.
- Defend opposes another player's action.

## Harm and consequences

A faction absorbs harm with consequences instead of numbers. A consequence is an aspect that sticks, like "Granary empty" or "Trucks in Pierce's yard". A mild one absorbs 2 shifts and clears after one turn. A moderate one absorbs 4 and clears after two turns. A severe one absorbs 6 and stays until someone acts to clear it. Anyone may invoke a consequence against the faction that carries it.

A faction that cannot absorb harm is taken out. The game master decides what that means: the faction ends, merges into another, splits or goes into hiding. Killing is easy during the Chaos and costs Influence after it, as the theme requires.

## Compels

The game master moves the story through compels. A compel offers a player a fate point to act on one of its aspects, its fear or its habit, against its own interest. The player takes the point and acts that way, or pays a point to refuse.

Compels are how the game master reaches the anchors. When every player wants peace and the anchors need a war, the game master compels a leader's fear instead of overruling the dice.

## Leaders

Each turn a leader ages by the turn's length. A leader over 60 dies on a roll of +2 or more on the four dice, and a leader over 75 on a roll of 0 or more. The game master writes the successor: a new name, age, goal, fear and habit. A successor usually keeps the same way of coping, but the change of leader is the best moment for a faction to change direction.

The game master may break this rule for an anchor, and must give a reason inside the world. The Apprentice lives past 150 because of the ship's lens, not because the dice allowed it.

## New players

Bring in a new player when the story makes a new group: a split, a desertion, a new faith or a newcomer from outside. Start it small, with one Fair skill and the rest Average or lower. When two players merge, the larger one continues with the merged sheet.

## Smaller passes

A second pass zooms in on a stretch of history that a bigger game already wrote. It turns the bigger game's results into history the players live through.

- The bigger game's results become fixed events. The game master announces them as the turn's events. Players can take part in them, profit from them or suffer from them, but cannot change them. An action that would change a fixed event fails, or it succeeds around the event and leaves the fact standing.
- Players are minor characters and small groups spread across the map, one or two per place. Give each one a tie to another player, like a debt, a dead friend or a shared well.
- Give the pass one question to answer, like why every truck carries a gun. Make the answer an anchor that play must reach. It ends as a plain fact in [World facts](world.md), and only its details stay hidden.
- Ask each player for a scene as well as an action: one concrete moment from the turn. Scenes become story seeds and character details.
- Scale the death rule to the turn length. At two-year turns, a character over 60 dies on +3 or more, and one over 75 on +2 or more.
- When a player dies, start a successor as a new player with the same place and a new sheet.

## The log

The game master keeps three files during play, in project-local `tmp/`:

- The board: every sheet as it stands after each turn.
- The log: each turn's event, each action with its roll and result, deaths and successors, and the game master's truths marked as hidden.
- The shared news for the next brief.

After the game, the game master writes the log into a timeline in `docs/lore/` and moves any new names, groups and characters into the lore pages. Hidden truths go into the lore as answers, and the timeline shows only what people could know. [Chaos Highway](chaos-highway-story-game.md) keeps the logs of two smaller passes run for the highway story, with their combination.

## Lessons from play

- Players drift toward peace, deals and inquiries. Real history needs mistakes, so let the dice fail them and use compels.
- Players remember well when the same agent continues each turn. Restate the leader's personality in the brief after every change of leader.
- Give each player the messages sent to it, even when it ignored them. Unanswered offers become grudges.
- Keep the turn's event short and concrete. A dead driver and a missing grain cart start more story than a description of tension.
- Decide hidden truths early, like who fired the shots, and write them in the log before any player guesses.
- Players chase whatever thread the brief hands them. A player's private knowledge, like a crate it was ordered to pack, starts the longest plots.
- Players who share a place converge. Several players gathered at one grave in the first turn, and that grave stayed the center of the story.
- For a quest, end the pass on the turn the player arrives. Ask each player what they do in the week after each ending the quest could have. Those answers become the endings and the return visits, so the world reacts to what the player did.
- A good idea that the fixed events forbid, like a road guard paid by both towns, still belongs in play. Let it half succeed and fail where the anchor needs it to. The failure explains the world.
