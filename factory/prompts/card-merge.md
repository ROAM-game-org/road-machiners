This is a merge round for your card, issue #{{issue}}. The committee approved the build you made in this session.

The factory now merges {{branch}} into {{into}}, for this reason: {{reason}}
The merge runs in a fresh clone of the game repo, not in the clone you worked in. You are on branch {{into}} with the merge open.

It stopped on conflicts in these files:

{{files}}

You know what your change is for, so you resolve them.
Read the other side's commits with `git log --merge` and `git diff`.
Every part of your approved change must survive, and every change from the other side must survive too.
Where the other side moved, renamed or rewrote the code your change relies on, rewrite your change onto the new code so it still does what the committee approved.
Never take one side of a conflict just to finish the merge.
Run `npm ci` before any code, test or check. The commit hook needs it.
Run the typecheck and the focused tests near the conflicted files, and check that your approved behavior still holds.
Then commit the merge with `git commit --no-edit`.
Do nothing else. Do not touch files the merge did not change, and never add `.github/` files. The factory checks the commit and builds and tests the result after you.
