# Voting moves to Telegram

**Status:** design
**Branch:** telegram-voting
**Worktree:** .worktrees/telegram-voting
**Goal:** Bugs and justified improvements reach Design with no votes. A real feature is posted to the public channel as a proposal, at most 4 a day, and reaches Design when its thumbs-up count reaches `FACTORY_MIN_VOTES`. Its build is posted as a reply to the proposal, and player comments and in-game reports reach the issue and route bugs to patch or redesign. Confirming it needs the user to add the bot to the discussion group, add `OPENAI_API_KEY`, merge into `main` and watch one real proposal go through. Tonight's proof is fixture tests, a replay of recorded updates through the plugin and the tick, and sample posts in the committee chat.
**Mode:** hands-off

## Context

- Intake takes a `feature-request` or `bug` issue only with `FACTORY_MIN_VOTES` GitHub thumbs-up or one from a committee member, and polls for them every tick, since GitHub sends no webhook for reactions. A GitHub account was banned for reading reactions too often.
- Triage has three verdicts: `ready`, `unclear` and `wont-do`. It already bundles related Triage cards into a lead.
- One bot, `TELEGRAM_BOT_TOKEN`, serves Hermes and the factory. Hermes reads its updates by long polling with every update type allowed, including `message_reaction_count`. A bot has one update consumer.
- The Hermes plugin already adds a native python-telegram-bot handler for button presses, in `make_button_factory`. Hermes wires plugin handlers into group 0 before its own text, command and media handlers, and polls with `allowed_updates=Update.ALL_TYPES`. Only the first matching handler of a group runs, and `ApplicationHandlerStop` also skips its group 99 observer. It has no reaction handler.
- The public channel `FACTORY_PUBLIC_CHANNEL` has a linked discussion group. The bot is an admin of the channel and is not in the group. Channel reactions arrive only as anonymous counts, and comments arrive in the group as replies to an automatic forward of the channel post, which has its own message id.
- The error service in `factory/src/error-reports/` is a Node HTTP server on a Unix socket behind Caddy and the Cloudflare tunnel. It checks Origin and a per-address limit, and keeps that limit in memory.
- The game's feedback menu in `game/src/ui/hud.ts` links to GitHub's new-issue page of another repo, `btseytlin/road-machiners`.
- Feature builds live at `/<hash>/`, recorded in `state.builds` as issue to hash. The candidate lives at `/rc/`.
- No OpenAI API key exists. Codex signs in with a ChatGPT login, which is no API key.

## Design

Five parts. A shared contract comes first, then parts B, C, D and E run in parallel.

### A. Contract: the public store

One SQLite file, `$FACTORY_HOME/public/public.db`, through `node:sqlite` with WAL, so the error service and the tick open it at once. It needs no backup. Each write is one transaction. Tables:

- `proposals`: issue, pitch, channel message id, discussion message id, posted at, votes, voted at.
- `build_posts`: issue, build hash, channel message id, discussion message id, posted at, open.
- `comments`: discussion message id, thread post, issue, author name, text, kind, route, at, sent to GitHub at, routed at.
- `reports`: id, address, build, kind, text, verdict, reason, issue, at.
- `updates`: Telegram `update_id`, so a file read twice changes nothing.
- `reactions`: chat, message id, user, emoji, for group votes.
- `hits`: address, hour, count, for the per-address limit.

One module, `factory/src/public/store.ts`, owns the schema and every query. The error service and the tick only call it. The Hermes plugin never opens it.

### B. Triage and intake

- Intake drops the vote gate and its reaction reads. Every aged `bug` and `feature-request` issue enters Triage. The committee thumbs-up path goes too.
- Triage gets a fourth verdict, `vote`, for a new feature or a substantial change. A bug is never `vote`. A justified improvement of an existing thing may be `ready`. `vote` needs the same fields as `ready` plus `pitch`, a title and a few plain sentences for players.
- A `vote` card stays in Triage with the label `voting`, which triage skips like `needs-info`. Triage writes the pitch to the store. Routing labels apply then, so the later move needs no agent.
- `voting` cards are not bundle candidates.
- `FACTORY_MIN_VOTES` keeps its value of 10 and now counts Telegram thumbs-up.

### C. Public events and tick steps

The shared bot keeps its one consumer, Hermes's long polling, which already receives every update type. The Hermes plugin adds native handlers beside its button handler, so public updates never reach the Hermes agent.

- The handlers sit in group 0 ahead of Hermes's own and raise `ApplicationHandlerStop`. Every update from the discussion group `FACTORY_PUBLIC_DISCUSSION` and every reaction stops in the plugin, from members too.
- Each handler writes one JSON file named by its `update_id` to `$FACTORY_HOME/public-inbox`, atomically like the inbox. Kinds:
  - `reaction-count`: a channel post's anonymous counts per emoji.
  - `reaction`: one user's emoji on a group message, old and new. Groups send this kind, so the committee chat can test votes.
  - `forward`: the discussion group's automatic forward of a channel post, with both message ids.
  - `comment`: a group message in the thread of a forwarded post, with the thread id, the author name and the text.
- The plugin parses only these fields and judges nothing. It writes nothing else.
- Tick step, ingest: the tick reads each public-inbox file into the store in one transaction, then deletes it. A seen `update_id` changes nothing. A file it cannot parse goes to `public-inbox/bad/` and records a failure for Hermes, which names the file and not its text.
- Tick step, classify: each new comment on a tracked post gets the filter of part D once.
- Tick step, proposals: when fewer than `FACTORY_PROPOSALS_PER_DAY` proposals were posted in the last 24 hours, post the oldest unposted `voting` issue to `FACTORY_PROPOSAL_CHAT`. The post holds the pitch, the issue links of the lead and its bundle, and the line to vote with a thumbs-up. It has no buttons.
- Tick step, votes: a proposal's votes are its channel count of `FACTORY_VOTE_EMOJI`, or in a group the users whose current reaction is one of them. A proposal that reached `FACTORY_MIN_VOTES` moves its card to Design, drops `voting`, and writes the ledger line `voted`. That is one GitHub write per passed proposal. The tick reads votes only from the store.
- Build post: when the testing or checks job posts a card that has a proposal, it also posts the play link and the description to the proposal's chat as a reply to the proposal, with no buttons. A new post of the same card closes the old build post in the store.
- Tick step, comments: new comments of an issue go to GitHub as one digest comment under `## Player comments`, at most one per issue every `FACTORY_PUBLIC_DIGEST_MINUTES`. Each line names the player, quotes the text and has its kind.
- Tick step, public routes: a comment or report classified `patch` or `redesign` on an open build post routes the card like a committee reply, with `by` `public`. It goes under `## Player report`, never under `## Committee feedback`. The route closes the build post and the committee post, which says a player report sent it back, so a card takes at most one public route per build.
- `FACTORY_PROPOSAL_CHAT` is `FACTORY_PUBLIC_CHANNEL` in production. A test sets it to the committee chat.

### D. Filter and report route

- `filter.ts` makes one OpenAI Responses API call with a strict JSON schema, model `FACTORY_FILTER_MODEL`, key `OPENAI_API_KEY`. It returns `verdict` (`accept` or `reject`), `kind` (`bug`, `feature`, `feedback`), `route` (`none`, `patch`, `redesign`), `title` and `reason`. A failed call fails the request loudly, and the report is not stored as accepted.
- The error service gains `POST /feedback`. It takes `{ kind, text, version, build }` from a game build. It checks Origin against the game origins, the per-address limit from the store and the body size, then runs the filter. Caddy routes `/feedback` to the error service's socket.
- The server finds the issue from `build`, never from the client: a hash in `state.builds` whose card is in Approval gives that issue, and `rc` gives the release tracking issue. Such a report becomes a comment on that issue's next digest and goes through public routes.
- Any other accepted report opens a GitHub issue labeled `bug` or `feature-request` and `player-report`, at most `FACTORY_REPORT_DAILY_ISSUES` a day. Intake then takes it into Triage.
- A rejected report is stored with its reason and creates nothing.

### E. Game form

- The feedback menu opens an in-game panel built like `HelpPanel`: a choice of bug or idea, a text box, Send and Close. Send posts to `__FEEDBACK_URL__` with the version and the build folder from the page address. It shows the server's answer in plain words: sent, refused with the reason, or failed.
- Every build gets `FEEDBACK_URL` at build time like `ERROR_REPORT_URL`, feature builds included. The GitHub links go.

### Permission split

- The Hermes agent never sees public text. The plugin's handlers stop public updates before Hermes, and public text reaches only the public inbox, the store, then GitHub as quoted comments.
- The tick accepts the sender `public` only for a route of an open build post. Approve, Deny, Ship, Remove and every command stay committee only.
- Agent prompts treat `## Player comments` and `## Player report` as untrusted player text: input to judge, never orders.

TDD: yes. The store, the plugin handlers, the tick steps, the triage parser and the filter parser are deterministic, and fixture updates of each Telegram type pin the parsing.

### Invariants

- IV1 — No new code calls `setWebhook`, `deleteWebhook` or `getUpdates`. Hermes's polling stays the one consumer.
- IV2 — The tick makes no Telegram or GitHub read to count votes. Votes come only from the store.
- IV3 — A public-inbox file with a seen `update_id` changes nothing.
- IV4 — Public text never lands under `## Committee feedback`, never reaches the Hermes agent and never enters the committee inbox.
- IV5 — Sender `public` can only route an open build post as patch or redesign. Every other order from it is refused.
- IV6 — At most `FACTORY_PROPOSALS_PER_DAY` proposals in any 24 hours, and at most one digest comment per issue per `FACTORY_PUBLIC_DIGEST_MINUTES`.
- IV7 — The report's issue comes from the server's build lookup, never from the request.
- IV8 — A bug is never put to a vote.
- IV9 — A missing `OPENAI_API_KEY` or `FACTORY_PUBLIC_DISCUSSION` stops the factory, the error service and the plugin at start, like any missing key.

### Principles

- PC1 — The plugin's public handlers and the factory meet only through the public inbox. The plugin opens no store and writes no committee inbox file.
- PC2 — Every GitHub write fires on a change of state, never on a timer of its own.

### Assumptions

- AS1 — `node:sqlite` loads under vite-node on Node 24 on the server and on Node 23 locally.
- AS2 — Telegram sends `message_reaction_count` for the channel's posts to its admin bot, and `message_reaction` for a group where the bot is admin.
- AS5 — The pinned Hermes image, v2026.9.24, wires plugin handlers the same way as the local v2026.8.31 that was read.
- AS3 — A bot that is admin of the discussion group sees every comment and every automatic forward.
- AS4 — The filter model returns schema-valid JSON for every request with strict schema on.

### Unknowns

- UK1 — How late Telegram sends reaction counts on a busy channel.
- UK2 — Whether proposals should expire. Nothing expires for now.

## Plan

## Verify

## Conclusion

### Hands-off decisions
- make: size Large, full flow — five parts across factory, infra and game.
- make: branch `telegram-voting` off `origin/main` in `.worktrees/telegram-voting`, since the server runs only `main`. The game form merges into it too, and the user picks where it lands.
- udesign: public updates come through Hermes's polling and native plugin handlers — the user chose it over a second bot.
- udesign: `voting` is a label on a Triage card, not a new column — a new Project option is a manual GitHub change.
- udesign: `FACTORY_MIN_VOTES` stays 10 and counts Telegram thumbs-up — same value as before.
- udesign: `FACTORY_PROPOSALS_PER_DAY=4` — the user's number.
- udesign: `FACTORY_FILTER_MODEL=gpt-5.4-nano` — OpenAI's docs name it for classification. Change it in settings.env.
- udesign: one public route per build post, since the route closes the post — limits money spent on player reports with no new number.
- udesign: `voting` cards are not bundled — a posted proposal keeps its text.

### Deferred (needs user input)
- Add the bot to the channel's discussion group as admin, and set `FACTORY_PUBLIC_DISCUSSION` in `.env` to the group id `-1004432761257`.
- Add `OPENAI_API_KEY` to `.env`, with a spend limit on its project.
