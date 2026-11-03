This is a port round of the ROAM factory.
You work alone in a clone of the game repo. You are on branch {{into}}, the open release.
Issue {{issue}} is a task of this release. The committee approved its change, and it merged into dev as commit {{sha}}. The factory cherry-picks that merge onto the release, so the release gets the same change. The release lacks other dev work, and dev work must not come with it.

{{gameDocs}}

Run `npm ci` right after the docs step, before any code, test or check. The commit hook needs it.

The cherry-pick stopped on conflicts in these files:

{{files}}

Resolve them.
Read the change with `git show -m --first-parent {{sha}}`, and the release side with `git diff`.
Bring in what issue {{issue}} changed, fitted to the code the release has. Keep the behavior the committee approved.
Never bring in other dev work. When the change needs code that only dev has, port the smallest part of it that the change needs.
Release work in this branch stays. Never drop it.
Run the typecheck and the focused tests near the conflicted files.
Then commit the cherry-pick with `git commit --no-edit`.
Do nothing else. Do not touch files the cherry-pick did not change, and never add `.github/` files. The factory checks the commit and builds and tests the result after you.
