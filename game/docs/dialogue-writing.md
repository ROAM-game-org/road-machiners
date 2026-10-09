# Writing dialogue

This guide covers how people in the basin talk and how the player talks back. It holds for town locals, radio calls and the spoken lines inside page scenes. [Writing quests](quest-authoring.md) covers ink, quest structure and page narration. [Voices](lore/voices.md) keeps one sheet per speaker.

The examples are written for ROAM. A line marked Bad is the kind of line that has shipped before and confused players.

## Before you write a person

Write their voice sheet in [Voices](lore/voices.md) first. A sheet answers five questions.

1. What one speech rule shows in every line they say? Kovac states one fact, then what follows from it. Hattie names her source, then doubts it. Ruben winds through water and his grandmother before he lands.
2. What do they want from the player? A stranger is a buyer, a pair of hands, a witness, a messenger or a risk. A person with nothing to want has nothing to say.
3. What do they notice first about the player? It is the most visible thing: a battered truck, a Nose seal on the door, a stranger towed in on a chain, a name on someone's list.
4. How long do their sentences run? A boaster runs long. A veteran runs short. A frightened clerk starts sentences and abandons them.
5. What do they avoid talking about? The thing a person steers around tells the player more than the thing they say.

Match the voice to the place. Bowl talks of fields, seasons and family. Nose talks of orders, rations and the log. The Yard talks of prices and what things are worth. A stranger learns the town from how its people speak before anyone explains it.

A minor speaker gets a clear job and no quirk. A gate sentry with a funny tic reads as someone important, and the player wastes time on him.

### One question, three voices

The player asks "Is the north road safe?"

Kovac: "No. Kiln riders work it past the second ridge. Go in daylight, and log out with me first, so somebody knows where to look for you."

Hattie: "Safe? My cousin drove it last week and came back with all his teeth, so somebody must think so. Mind, he came back without his spare wheel."

Ruben: "Safe is a word for a canal with good walls, and the north road has no walls at all. Go early, while the dust is still lying down. You'll see anyone coming from a long way off."

Each answer tells the player the road is risky and what to do about it. Hide the names and you still know who spoke.

## The first line

The opening line gives the speaker's name, what they do and what they offer, in one breath. Then it reacts to the player if there is something to react to.

Bad: "The wind talks, if you know how to listen."

Good: "Lena. I fix the Army's trucks, and anybody else's if they pay. If it's broken, put it on the bench."

Good, after the first fall: "You're the one they dragged in on a chain. Sit down before you fall down. I'm Hattie, and this is my well."

Vary the greeting on what changed since the last visit. Kovac greets a player who caught the depot thief differently from a stranger. A person who sees the player for the third time with the same question says so.

## Answers

### Answer first

The first sentence answers the question that was asked. Attitude, memory and color come after.

Asked "Where can I buy fuel?":

Bad: "Fuel is a matter of who you know, and who knows you."

Good, Sefa: "At the pump by the Yard gate. Ours is cheaper, but it's mixed with whatever was in the drum before."

Asked "Why pay Kiln at all?":

Good, Odile: "Because if we don't, Kiln takes the grain trucks on the road, and a Granary that loses its trucks loses its winter. My grandmother lived through the year the grain ran out. She ate boiled sacking. I'd rather pay raiders every season than see that again."

### Facts come through a life

A world fact comes up as part of what the speaker wants: a complaint, a price, a habit, a debt, a memory. The player learns the fact and why it matters in the same line.

Bad: "Pierce Corporation insures trucks and lends money to the towns."

Good, a Granary driver: "Pierce wouldn't pay when my axle went. They're the insurers at Nose. They take your coin every season, and when my truck broke they found a reason: my gun ring had only one pin."

People live inside the basin's facts. Guns on every truck, the Kiln fee and the Senate are old and ordinary to them. Nobody announces them.

Bad: "Every truck carries a gun now."

Good: "Check your pins before the bend. A loose ring will swing your own gun into the cab."

### Explain local words in the same answer

The player is a stranger. When a speaker uses a local word, the same answer says what it is, in the speaker's own way. Each answer makes sense to someone who heard nothing before it.

Bad: "Some. Good drivers, bad paper. They wear the same coat."

Good, Dag: "A few, yes. They drive well, but Pierce won't insure a tenant's truck. So they ride in our coats, and the Senate keeps their names off the roll that would earn them a vote."

### Depth on the player's terms

Give the short answer first. Let the player ask for more with a follow-up choice. A follow-up opens only after the answer that mentions its subject.

Ruben, asked "Who runs Bowl?": "The canal families, through the Senate. It's slow, and nobody I know has starved waiting for it."

Then the choice "[What's the Senate?]" opens, and the longer answer lives there.

### Important facts live in more than one mouth

A fact the player needs to move on, such as where South Lock is or who buys stolen fuel, comes from at least two people or from a person and a document. A player who skipped one talk is never stuck.

## Questions the player asks

### A reason to ask this person

The player only asks about what they have heard: something the speaker said earlier in this talk, a note they hold, or a place they have found. Gate the choice on the variable that the earlier answer sets, on `has_note()` or on `found()`.

A question also needs a reason to ask this person in particular. It follows from what the player just saw or heard from them.

Bad, asked of a stranger at a gate: "Were you in the Old Army?"

Good, after the driver said his uncle starved at the Old Orchard gate: "What happened at Old Orchard?"

### Options are short and do one thing

An option states one intent in a few words, usually under eight. The answer carries the voice, not the option.

Bad: "[I was wondering whether you might tell me something about the raiders and also the road.]"

Good: "[Who are the raiders?]"

A hub shows two to four questions plus a way out. More than that means the talk has no subject. Give each talk one subject and let it end.

### A spread of tones

When the moment calls for a reaction, offer real attitudes, including a cold one and a foolish one. The player builds who they are by choosing.

After Bo says he shot Jens Vosk on the road:

- "[He'd have shot you first.]"
- "[You killed a man over grain.]"
- "[Say nothing.]"

Each choice changes what Bo says next. None of them is a test with a right answer.

### Exits and actions

The way out is always there. It can be plain, like "[Goodbye.]", or in the moment, like "[Leave him to his pins.]". An action the player does instead of saying uses a bracketed verb, like "[Put the brass on the table.]".

## Dodges, lies and refusals

A dodge must look like a dodge. The speaker hedges, changes the subject or answers a different question, and the player gets a clear choice to press.

```ink
+ [Who brings you the fuel?]
  People with cans. Next? # speaker: Sabine
  ~ sabine_dodged = true
  -> hub
+ {sabine_dodged} [A corporal brings it, doesn't he?]
  She stops wiping the board. "Big hands. A scar on his chin. He never gives a name, and I never ask." # speaker: Sabine
  -> hub
```

A person who refuses gives a reason tied to the player. The refusal tells the player how the town sees them.

Good: "I don't sell to anyone on Kovac's sheet. Get your name off it and come back."

A speaker who talks in riddles says plainly that they won't answer, and still gives one plain fact before the talk ends. A riddle with no exit is a wall.

## Skill checks in talk

Show the skill on the choice so the player learns the rule. Narrate the success or the failure plainly, never the difficulty.

A failure changes how people treat the player. It costs money, a door, a name on a list, or trust. It never only closes the choice.

Good, a failed machining check at the Yard: the player calls a weld bad, and Lena says, "My brother laid that weld. Find another bench."

An unlocked option can still be a bad idea. Knowing more than the speaker can make them close up. A player who reads the ledger aloud to the clerk who wrote it learns the clerk's name and loses his help.

Never chain a hidden second check behind a passed one. If a talk needs two skills, show both choices at once.

A failed check still gives a full scene. Write every failure as carefully as the success, because many players see it first.

## What people want

Every speaker who matters wants something from the player and goes after it in the talk. They raise their own topic, steer back to it and offer a trade.

The reason a person gives is often not the real one. Odile asks the player to find who takes the sacks. What she wants is a small man she can put out of the gate, so the tenants see something done.

Warm voices carry plans too. A friendly steward who pays well for a lost bundle is still buying the player's silence.

## Remembering the player

Decide what each speaker would notice first, and react to that. Keep the callback small and specific. One line that remembers what the player did is worth more than a branch nobody sees.

Good, Kovac after the player named Vance: "Sergeant Kovac, dispatch. The depot's been quiet since you came through. Don't make me miss you."

Repeat visits can escalate. A person asked the same favor three times grows short, and says so in character.

Cover the first town fully and the far places lightly. A reaction most players never see is a line nobody reads.

## Humor

Humor comes from the speaker's own logic. The speaker does not know they are funny.

Good, Jory: "Either the pipe exists or those cabbages are saints."

Say a grim fact flat and let the player react. The flatness is what lands.

Good, Sefa: "What we find of their dead, we bury with their boots on. Nobody on either side likes it, which is how you know it works."

No jokes that need knowledge from outside the basin. No jokes about the game itself, its skills, its menus or its numbers.

## Sentences

- Use contractions. How often a person contracts is part of their voice. "I do not" and "it is" in every line make everyone sound like the same stiff translator.
- Write whole sentences with the rhythm of speech. Do not stack clipped fragments as shorthand.
- Terse is a voice, not a license to be cryptic. A short-spoken Nose sergeant still says complete things a stranger understands.
- Do not chain clauses with "and" and "which" to fit in explanation. Split the run-on and cut what the answer does not need.
- Keep a reply under about forty words. A longer answer splits into two lines, each with one idea.
- Never bold speech. A person stresses a word through how the sentence is built.
- Stay in character. The voice test rejects game words and any count other than days and hours. Write "a pair of soldiers", not "two soldiers".

## Before you commit

1. Hide every name and read the talk. If a line could belong to anyone else, rewrite it.
2. Read it as a stranger who has heard nothing. Every word they meet is either explained or plain.
3. Read it aloud. A line you stumble on is a line the player skips.
4. Play every branch with `npm run quest -- <quest>`, including the failures.
