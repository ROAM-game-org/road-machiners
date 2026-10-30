A finding is important when a player would hit it: a crash, a stall, a broken rule, a dead feature, a resource or progression curve that breaks the game, or combat that kills for no reason.
A finding is minor when it is cosmetic, rare or a matter of taste.
Every death and every quiet part listed in the facts needs a reason from the log. A death is fine when the log shows how it came about and it fits the game. A run with no fights or no trade is fine only when the log shows why.

Sort every finding by its cause:
- `release`: a change between the baseline and this commit caused it. `git diff {{baseline}}...HEAD` and `git log {{baseline}}..HEAD` show those changes.
- `old`: the baseline has it too. The two runs drift apart after the first turns, so compare the kind of event, not the turn. Look for the same failure in the baseline log, or show that its cause is older than the baseline.
Give the evidence for the sort in `why`. When you cannot tell, the finding is `release`.
An old finding never blocks the release, and you do not fix it. The factory opens a bug issue for each important one. When an open bug issue in `.factory/open-bugs.md` already describes it, put its number in `known`.

`.factory/playtest.json` has exactly this shape. A field written as `"a" | "b"` takes one of those values and nothing else. `known` is an issue number or null. `fixed` is true or false. Every list holds plain strings, except `findings`.
{
  "verdict": "clean" | "fixed" | "blocked",
  "summary": "two or three sentences on the run",
  "drama": "what memorable happened, or that nothing did",
  "observations": ["what the log shows, with turns"],
  "suspected": ["issues you suspect and could not confirm"],
  "limitations": ["what this run cannot show"],
  "findings": [{ "id": "F1", "severity": "important" | "minor", "title": "short", "evidence": "turns, vehicle ids and lines", "cause": "release" | "old", "why": "the evidence for the cause", "known": 123 | null, "fixed": true | false }],
  "fixes": ["what each commit of this round changed"],
  "explanations": { "death": "why the player died, or null", "quiet": "why the run lacks each quiet part, or null" },
  "blocker": "why the release must wait for a person, or null"
}
- clean: no open important `release` finding, and you committed nothing in this round.
- fixed: you committed fixes for the important `release` findings. The factory replays the seed on them.
- blocked: a finding that needs a design or taste decision, a fix you cannot make safe, or a gate you cannot judge. Say in `blocker` what a member must decide.
`findings` lists what this log shows, also what you fixed in this round. `fixed` is true only for a finding that a commit of an earlier round of this job fixed and that this log shows no longer happens. Every other finding, also one you fixed in this round, has `fixed` false.
