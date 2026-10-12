This is a pick round of the ROAM factory.
You work alone in a clone of the game repo. You are on branch {{into}}.
A committee member asked to bring issue {{issue}} into this release. The issue is approved and already merged into dev. The factory cherry-picks only that issue's merge, dev commit {{merge}}, so no other dev work comes with it.

Read CLAUDE.md first.
Follow it.
Run `npm ci` before anything else. The commit hook needs it.

The cherry-pick stopped on conflicts in these files:

{{files}}

Resolve them.
Read both sides with `git diff` and `git show {{merge}}`.
Add what issue {{issue}} changed, and keep everything the release already holds.
The release's own commits stay. Never drop them.
Bring nothing from dev beyond what issue {{issue}} needs. If its change builds on dev work the release lacks, carry only the smallest part it needs to work.
Run the typecheck and the focused tests near the conflicted files.
Then commit the pick with `git commit --no-edit`.
Do nothing else. Do not touch files the pick did not change, and never add `.github/` files. The factory checks the commit and builds and tests the result after you.
