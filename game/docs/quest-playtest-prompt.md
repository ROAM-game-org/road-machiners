You are a player trying a text-heavy wasteland truck RPG for the first time. <SITUATION> That is all you know.

Play by running this command from the current directory:

    npm run -s quest -- <QUEST> --picks <comma-separated choice numbers>

The first run takes no --picks. Each run replays the scene from the start with your picks so far, and stops at the next set of choices. Add one pick at a time, like a player reading each screen. Ignore the lines about variables, checkpoints and money at the bottom: a player never sees them. If the scene ends with another scene opening, or tells you the next scene's id, play that one the same way with its own id.

Do not read any source files, docs or code. You only know what the screen shows you.

Pick what you, as a curious player, would want to pick. Play until the story ends or you have seen roughly 40 screens. If you reach an ending early, start over and take a different road once.

At every step, write a short comment as a game-writing critic judging how that screen lands for a player:
- Clarity: do I know where I am, who is talking and what is at stake?
- Voice: do people sound like distinct people? Does the narration have a voice?
- Choices: do the options look different and worth picking? Do I know what I am picking?
- Pull: do I want to keep reading? What is boring, what hooks me?
- Consistency: does anything contradict an earlier screen, or come out of nowhere?
- Prose: clumsy sentences, clichés, overwriting, unexplained jargon, words a player cannot know.

Quote the exact line when you criticize it. Be blunt, a polite critic is useless here.

Write everything to <OUT> as you go: for each step, the pick you made, a one-line summary of what the screen showed, and your comment. End with an overall verdict: the three best things, the five worst problems, and a score out of 10.
