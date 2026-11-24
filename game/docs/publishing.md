# Publishing

The game is published on itch.io as a browser game. `npm run itch` runs from `game/`. It builds the last commit in a clean worktree and uploads it with butler, the itch.io upload tool. Uncommitted edits never ship. Each upload is named after its commit.

## One-time setup

1. Install butler. Download it from <https://itch.io/docs/butler/installing.html> and put it on your `PATH`.
2. Create an API key at <https://itch.io/user/settings/api-keys> and set `BUTLER_API_KEY` in `.env`. Running `butler login` in a real terminal works too.
3. Create the project at <https://itch.io/game/new>. Set the kind of project to HTML and save it as a draft.
4. Set `ITCH_TARGET` in `.env` to `user/game`, the two parts of the page address `user.itch.io/game`.
5. Run `npm run itch` for the first upload.
6. On the project edit page, mark the `html5` upload as "This file will be played in the browser".
7. Set the viewport to 1280 by 720 and turn on the fullscreen button.
8. Set visibility to public, or to restricted with a password for test players, and save.

## New versions

Commit, then run `npm run itch`. Butler uploads only the changed files. Page settings stay as they are. itch.io checks an HTML5 upload only after butler exits, like its 1000 file limit, so the script then waits up to 10 minutes. It ends only when `butler status` shows the new version completed and itch.io serves that build's page. Otherwise it fails and names what itch.io shows.

## Notes

- Saves live in the browser storage of the itch.io game domain, so players keep them across versions. The Help entry of the Menu shows the version as `x.y.z+commit`, where the commit matches the upload name.
- The debug console with cheats opens in every build.
- itch.io rejects an HTML5 upload with more than 1000 files, and it shows the error only on the game page. `npm run build` fails when `dist` has more than 1000 files, so a release can never ship over the limit.
