# ROAM

This repo holds ROAM, a turn-based wasteland truck RPG, and the AI coding agent-based software factory that builds it.

## Layout

- `game/` is the game. It is one npm package with its own `node_modules` and `.env`.
- `factory/` is the factory. It turns triaged GitHub issues and player-voted proposals into kanban workflows that lead to game changes and releases. It is one npm package with its own `node_modules` and `.env`.
- `desktop/` is the Electron shell that wraps `game/dist` as a desktop app. It is one npm package with its own `node_modules`. The game reaches it only through `window.roamDesktop`.
- `quality/` is the quality gate for both packages. The root `package.json`, `.oxlintrc.json`, `.quality.json` and `.githooks/` belong to it.

## Where to work

- Work on the game from `game/`. Read `game/CLAUDE.md` first.
- Read `game/docs/DESIGN.md` before any game change and before answering any question about the game.
- Work on the factory from `factory/`. Read `factory/CLAUDE.md` first.
- Game and factory never import each other.
- Work on the desktop shell from `desktop/`. Build `game/` first, since the shell serves `game/dist`.
- In `desktop/`, `npm run typecheck` runs tsc, `npm test` runs its Vitest files, `npm run smoke` plays 3 turns in the app, and `npm run pack:mac` builds the Mac dmg with signing off. The root gate does not cover `desktop/`.
- Every Electron launch sets `ROAM_SMOKE=1` and passes `--mute-audio`, so the window stays hidden and silent. `npm start` opens a visible window with sound, so do not run it from an agent.

## Landing on dev

GitHub refuses a push to `dev` unless the full game suite passed on that exact commit. Land a branch with `scripts/land-dev.sh <branch>` from the repo root. It merges `dev` in, runs the suite on GitHub Actions in about 10 minutes, and pushes when it passes. Run it in the background.

## No comments

Comments are banned in source files, including module docstrings. Write code that explains itself with clear names and small functions. The pre-commit hook strips any comment it finds, so a comment is wasted work.

## Quality gate

The gate blocks new lint and architecture debt and runs tsc for `game/` and `factory/`. It is documented in `quality/README.md`.

- Run `npm ci` at the root, then in `game/` and `factory/`.
- Run `npm run hooks:install` at the root, from the main checkout. It installs the pre-commit hook.
- `npm run quality` checks the working tree against HEAD.
- `npm run test:quality` tests the gate itself.
- Do not bypass the hook.
- Do not add suppressions.
- Do not raise the limits.
- A change to quality policy needs the user's approval.
