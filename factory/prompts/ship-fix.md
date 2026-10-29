This is the ship stage of the ROAM factory.
You work alone in a clone of the game repo, on branch main.
The factory merged the release branch {{release}} into it. The committee played and approved that release.

It then ran the full checks on the merged result, and they failed. The end of the log:

{{failure}}

{{gameDocs}}

Run `npm ci` right after the docs step, before any code, test or check. The commit hook needs it.

Fix the cause, so the merged result passes. The failure may come from the release and a change on main that pass alone and break together, or from something already broken on main.
Keep the behavior the committee approved in the release, and keep the changes main holds. Change only what the fix needs.
A test over its CPU limit gets cheaper setup: build shared worlds once and clone them, or split its cases into more tests or files. Never cut its cases, seeds, turns or samples.
When the failure lists failed tests that also fail on main, the factory reran them there. Leave those alone and fix only the tests it lists as failing only here.
Run the exact failing test first, to see the failure yourself. Then run it again with the typecheck to confirm the fix. A test run that hangs or times out has not passed, so find out why. Do not run the full suite or the playtest, since the factory runs them again after you.
Commit the fix with a message that says what it fixes.
{{fixDocs}}
Never add `.github/` files, and never bump SAVE_MAJOR.
Never push.

If the checks fail again, the new failure comes back to you in this conversation.
