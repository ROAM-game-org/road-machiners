# Voting moves to Telegram

**Status:** validating
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

Approach: the contract (PH1) is committed first. PH2 to PH6 then run in parallel worktrees with disjoint paths and merge back. PH7 wires, documents and checks the whole.

### PH1 — Contract (done, e3b4f9f2)
- `factory/src/public/store.ts` (create): `openStore(home)`, `PublicStore` with every query, `PublicEvent` types.
- `factory/src/types.ts`, `factory/src/config.ts`, `factory/settings.env`, `factory/.env.example`: the new keys and the labels `voting`, `player-report`, the sender `public` and the two player headings.

### PH2 — Triage and intake
- `factory/src/intake.ts`: drop `isMarked` votes and the committee path. Keep the age gate. Respects IV8.
- `factory/src/github.ts`: `candidates()` stops reading thumbs-up. `Issue.thumbsUp` goes where nothing else reads it.
- `factory/src/stages/triage.ts`: verdict `vote` with `pitch`. `vote()` applies the routing labels, adds `voting`, writes the pitch with `addProposal`, comments once, and leaves the card in Triage. Parser refuses `vote` with `hotfix`, `releaseFix` or a bug label.
- `factory/prompts/triage.md`: the bug, improvement and vote rules and the `pitch` field.
- `factory/src/stages/bundle.ts`: `voting` blocks a bundle candidate.
- `factory/src/tick.ts`: `voting` keeps triage from running like `needs-info` and adds the wait reason `voting`.
- `factory/src/dashboard/labels.ts`, `factory/src/position.ts`: the `voting` wait reason and flag.
- Commit: Triage sends bugs and improvements to work and puts real features to a vote.

### PH3 — Hermes plugin public handlers
- `factory/hermes/plugin/public.py` (create): `make_public_factory(cfg)` wires a `MessageReactionHandler` for counts and per-user reactions, and a `MessageHandler` for the discussion group and for replies in `FACTORY_PROPOSAL_CHAT` when it is a group. Each writes an IF2 file and raises `ApplicationHandlerStop`, except a committee chat reply, which goes on to Hermes. Respects IV1, IV4, PC1.
- `factory/hermes/plugin/__init__.py`: register it before the button factory, read the two new keys.
- `factory/hermes/compose.yaml`: pass `FACTORY_PUBLIC_DISCUSSION`, `FACTORY_PROPOSAL_CHAT` and the public inbox path.
- `factory/hermes/test_public.py` (create): fixtures of each update type.
- Commit: Hermes's plugin hands reactions and player comments to the factory and keeps them from Hermes.

### PH4 — Tick public steps
- `factory/src/public/tick-steps.ts` (create): `publicTick(ctx)` runs ingest, classify, proposals, votes, digests and routes, each its own function. A failing step records a failure for Hermes and the next steps still run.
- `factory/src/public/ingest.ts`, `proposals.ts`, `votes.ts`, `digest.ts`, `routes.ts`, `build-post.ts` (create).
- `factory/src/telegram.ts`: `sendMessage` gains a reply-to post id if it lacks one.
- `factory/src/stages/checks.ts`: `post()` calls `postBuild` (IF5) after the committee post.
- `factory/src/stages/approval.ts`: `routeFeedback` takes the heading, so `public` gets `## Player report`. Respects IV4, IV5.
- `factory/src/inbox.ts`: unchanged. Public routes never pass through it.
- `factory/src/ctl.ts`: read command `factory public` prints proposals, votes and open build posts.
- `factory/src/ledger.ts`: line kind `voted`.
- `factory/prompts/test.md`, `factory/prompts/design.md`: the player headings are untrusted player text.
- Commit: The tick posts proposals, counts votes, sends player comments to GitHub and routes player bug reports.

### PH5 — Filter and feedback route
- `factory/src/public/filter.ts` (create): `classify` (IF3) with one Responses API call and a strict schema.
- `factory/src/error-reports/feedback.ts` (create): `takeFeedback` for `POST /feedback`: origin, per-address limit in the store, size, filter, build lookup from `state.json`, then a stored comment or a new issue within `FACTORY_REPORT_DAILY_ISSUES`. Respects IV7.
- `factory/src/error-reports/service.ts`: route `/feedback` beside `/errors`.
- `factory/src/sourcemaps.ts`, `factory/src/deploy.ts` and the checks build: every build gets `FEEDBACK_URL`.
- `factory/infra/stacks/caddy/Caddyfile`, `factory/infra/deploy/errors.py`: route `/feedback` to the error socket.
- Commit: The error service takes in-game reports through the filter.

### PH6 — Game form (branch `feedback-form` off `origin/dev`)
- `game/src/ui/feedback-form.ts` (create): the panel. `game/src/ui/hud.ts`: the menu opens it. `game/src/ui/hud-readout.ts`: the GitHub links go. `game/vite.config.ts`: `__FEEDBACK_URL__`. Strings in both languages.
- Commit: Players send bug reports and ideas from the game.

### PH7 — Wiring, docs and check
- Merge PH2 to PH5, run the factory suite parts they touched, typecheck and the plugin tests.
- `factory/docs/process.md`, `stages.md`, `state.md`, `operations.md`, the `.dot` diagrams and their renders, `hermes/SOUL.md` pointer, `.github/ISSUE_TEMPLATE` vote text.
- Replay recorded update fixtures through the plugin, then `publicTick` against a fake GitHub and Telegram.

### Interfaces
- IF1 — `PublicStore` in `factory/src/public/store.ts`, committed.
- IF2 — `$FACTORY_HOME/public-inbox/<updateId>.json` holds one `PublicEvent`, written to a temp name and renamed.
- IF3 — `filterWith(cfg: FilterConfig, fetch: typeof globalThis.fetch): Classify` in `factory/src/public/filter.ts`. The types live in `factory/src/public/decision.ts`, committed. The returned function throws on any failed call or bad answer.
- IF4 — `publicTick(ctx: Ctx, classify: Classify): Promise<void>` in `factory/src/public/tick-steps.ts`. PH7 wires it into `tick.ts` with the real filter, since PH2 and PH4 typecheck apart.
- IF5 — `postBuild(ctx: Ctx, issue: number, build: string, url: string, description: string): Promise<void>` in `factory/src/public/build-post.ts`. It does nothing for an issue with no posted proposal.
- IF6 — `POST /feedback` takes JSON `{ kind: 'bug' | 'idea', text, version, build }`, where `build` is the first folder of the page path or `release`. It answers 200 with `{ status: 'sent' | 'refused', message }`, or an error status with a plain text message.

### Interface graph
- PH2 IF4 -> @ factory/src/intake.ts, factory/src/github.ts, factory/src/stages/triage.ts, factory/src/stages/bundle.ts, factory/prompts/triage.md, factory/src/tick.ts, factory/src/dashboard/labels.ts, factory/src/position.ts
- PH3 -> IF2 @ factory/hermes/
- PH4 IF2, IF3 -> IF4, IF5 @ factory/src/public/ except store.ts and filter.ts, factory/src/telegram.ts, factory/src/stages/checks.ts, factory/src/stages/approval.ts, factory/src/ctl.ts, factory/src/ledger.ts, factory/prompts/test.md, factory/prompts/design.md
- PH5 -> IF3, IF6 @ factory/src/public/filter.ts, factory/src/error-reports/, factory/src/sourcemaps.ts, factory/src/deploy.ts, factory/infra/
- PH6 IF6 -> @ game/

### Risks / rollback
- RK1 — Every key is required, so the factory stops on a host whose `.env` lacks the three new keys. The deferred list says to add them before the merge into `main`.
- RK2 — PH6 lands on `dev` and PH2 to PH5 on `main`. A game build before the factory route deploys gets 404 from `/feedback` and shows a failed send.

## Verify

- Touched factory test files: 27 files, 451 tests pass after the merge. Typecheck clean. Hermes plugin tests 200 pass. Infra tests 22 pass. Game form tests pass on `feedback-form`.
- End-to-end replay, `factory/tmp/e2e.ts` (gitignored): real posts in the committee chat as `FACTORY_PROPOSAL_CHAT`, recorded Bot API updates through the plugin's `handle_public_update`, then `publicTick` with a fake GitHub and a fake filter.
  - The proposal posted to the committee chat. A repeated `update_id` counted once. Two thumbs-up and a fire gave 2 votes and no GitHub call. The third thumbs-up removed `voting` and moved the card to Design.
  - The build post went out as a reply to the proposal. A reply on it became a digest under `## Player comments`. The ad was rejected and never reached GitHub.
  - The bug reply routed the card to Testing under `## Player report`, edited the committee post, and closed both posts. The public inbox was empty after each tick.
  - Reactions stopped before Hermes. Committee chat replies went on to Hermes.
- Found and fixed while verifying: a player patch never reached the testing agent, since `taskText` read only `## Committee feedback`. A failed public build post threw after the committee post. One failing route blocked the rest every tick. `factory move` left `voting` on a moved card, which blocks every job.
- Not checked live: channel `message_reaction_count` updates and discussion group forwards, since the bot is not in the discussion group yet (AS2, AS3). The real OpenAI call, since no key exists.

## Conclusion

Outcome: built, verified and reviewed on `telegram-voting` at 9352fc7b, and the game form on `feedback-form` at 46407788. The Goal waits for the live run on the server.

Invariants:
- IV1 — no new `setWebhook`, `deleteWebhook` or `getUpdates`; the plugin reads Hermes's existing stream.
- IV2 — `votes.test.ts` checks no call below the threshold. The replay made no call for 2 votes.
- IV3 — `store.test.ts` and the replay counted a repeated `update_id` once.
- IV4 — the replay put the player route under `## Player report`. Discussion group updates and reactions stop before Hermes in `test_public.py`.
- IV5 — public routes call `routeFeedback` only for an open build post with an open committee post. They never write the inbox.
- IV6 — `proposals.test.ts` and `digest.test.ts` check the caps.
- IV7 — `feedback.test.ts` finds the issue from `state.json` only.
- IV8 — the triage parser refuses `vote` on a `bug` issue.
- IV9 — the new keys are required by `loadConfig` and by the plugin's `REQUIRED_KEYS`.

### Assumptions check
- AS1 — held: `node:sqlite` loads under vitest and vite-node on Node 23.9. The server runs Node 24.
- AS2 — unverifiable tonight: group `message_reaction` was replayed from recorded shapes, and channel counts need the bot's live stream.
- AS3 — unverifiable until the bot joins the discussion group.
- AS4 — unverifiable with no key. The parser fails loud on a bad answer.
- AS5 — unverifiable: the pinned v2026.9.24 image was not pulled. The plugin's own tests pass.

### Unknowns
- UK1 — open until the live run.
- UK2 — deferred: proposals never expire.

Review: the reviewer found four retry problems and no permission leak. All are fixed in 9352fc7b. Fixing them also surfaced that `reportFailure` with an issue labels the card `factory-stuck`, so a public failure would have blocked a card. The `public` stage is now exempt, like `catch-up`.

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
- udesign: `FACTORY_PUBLIC_DIGEST_MINUTES=60`, `FACTORY_REPORT_DAILY_ISSUES=20`, `FACTORY_REPORT_IP_PER_HOUR=5`, `FACTORY_REPORT_MAX_CHARS=3000` — new numbers with their reasons in settings.env. Change any of them there.
- udesign: `FACTORY_PROPOSAL_CHAT` is its own key, so a test can point proposals at the committee chat.
- uplan: plan auto-approved (hands-off).
- uplan: PH6 goes on its own branch `feedback-form` off `origin/dev`, since game work lands on `dev` and factory work on `main`.

- uexecute: the plugin's public handlers run in handler group -1, so a committee chat reply still reaches Hermes's group 0.
- uexecute: a report on a feature build or the candidate is filtered as a comment on that build, so it can route.
- ureview: a comment whose filter call fails is stored rejected and reported once, not retried. An OpenAI outage drops those comments from the digest.
- ureview: `FACTORY_FILTER_TIMEOUT_SECONDS=30`, with its reason in settings.env.
- ureview: a passed proposal closes before its GitHub writes. A failed move is reported once, and Hermes moves the card by hand.

### Deferred (needs user input)
- Before merging into `main`, add to the server `.env`: `FACTORY_PUBLIC_DISCUSSION=-1004432761257`, `FACTORY_PROPOSAL_CHAT` set to the channel id `-1003923325496`, and `OPENAI_API_KEY` with a spend limit. Every key is required, so the factory, the error service and Hermes stop without them.
- Add the bot to the channel's discussion group as admin.
- Have agy check the Russian strings of the game form on `feedback-form`.
- Merge `telegram-voting` into `main` and `feedback-form` into `dev`. Then watch one real proposal: votes from the channel, a build reply, a comment digest.
