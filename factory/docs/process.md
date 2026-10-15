# Factory process

This file is the spec of how the factory works. Each diagram matches the code, and a change to the process updates its diagram in the same commit. The rules behind each step are in [stages.md](stages.md), [evidence.md](evidence.md) and [operations.md](operations.md). [state.md](state.md) describes the stores, card positions, queues and health records.

Every fact the factory acts on comes from a structured record: the ledger, state, a typed error or an API field. The factory never parses text it wrote itself to learn a fact back. Text in comments, logs and notes is for people.

The diagrams are Graphviz files in [diagrams/](diagrams/). Agents read the `.dot` source. People see the `.svg` render. After you edit a `.dot` file, run `npm run diagrams` from `factory/`, or a test fails. It needs Graphviz installed. The colors mean the same in every diagram:

- Black arrows are the normal path, from left to right.
- Red dashed arrows are loops back.
- Grey dashed arrows end the flow early or leave it.
- Yellow boxes wait for people.

## Overview

The public files GitHub issues and sends reports from the game. The game's release, dev and candidate builds also report their errors, and each new error becomes a bug issue. Triage sends bugs and justified improvements to work at once. A real feature goes to the player chat as a proposal, and players vote on it with reactions. Agents design, build and test the work. The committee plays each result in Telegram and approves it. Approved work collects on `dev` and ships as a release to `main` and itch.io. Hermes handles every failure.

![Overview](diagrams/overview.svg)

## Card lifecycle

A card is one GitHub issue on the Project board. Its column is the state. Every card runs the same stages. Testing gets a build ready for the committee to play. Hardening runs after they approve it, with the deep verification and the review. Hardening is slow, so it runs only on work the committee wants. Merging checks the approved cards merged together before the base takes them.

Each agent stage is one agent session that owns its stage. The agent runs the checks itself and fixes what it finds. Hard checks run only at five checkpoints: the diff guard on every commit and every push, the post checkpoint before a committee post, the merge checkpoint before the base takes a card, the release playtest before the candidate, and the ship checkpoint before `main` takes the release. A checkpoint failure goes back into the session that did the work, until the checks pass or the stage spent its budget, `FACTORY_TESTING_BUDGET_USD` or `FACTORY_MERGING_BUDGET_USD`. At the merge and ship checkpoints only the fix rounds count against that budget, so an expensive conflict still leaves the session its fixes. Everything else an agent writes, like the post text and its screenshots, is shown as written.

![Card lifecycle](diagrams/lifecycle.svg)

- Intake takes every aged `bug` and `feature-request` issue into Triage. A `player-report` or `error-report` issue goes in at once, since nobody edits it after it is filed. Nobody votes on GitHub.
- Triage passes a bug and a justified improvement of an existing thing to Design. A new feature or a substantial change gets the verdict `vote` and the label `voting`, and waits in Triage for player votes, as [Public inputs](#public-inputs) says. A bug is never put to a vote.
- A bug a collaborator labels `hotfix` skips Triage. Triage can also label a bug `hotfix`. Approve ships a hotfix at once, and the approval stays until the hotfix ships, as [Hotfix approval](#hotfix-approval) says.
- The error service opens an `error-report` bug for each new game error, at most `FACTORY_ERROR_DAILY_ISSUES` a day. Intake takes it into Triage with no votes. A later report of the same error from a new build comments on its issue, and reopens a fixed one when the build came after the fix. [operations.md](operations.md#error-reports) has the details.
- Triage labels a fix of an open release's feature `release-task`, until the release's candidate is posted. It runs on the release branch and ships with that release. New work stays on `dev` for the next release.
- A merged issue stays open with the label `release-candidate`. It closes when its release ships.

The loops:

- unclear and questions: the author gets questions and the label `needs-info`. The tick removes the label once someone answers on GitHub, or once `FACTORY_NEEDS_INFO_HOURS` pass with no answer. Triage then runs again. With no answer it picks the most sensible reading, and design writes each open question and its reading into the design comment as an assumption.
- plan wrong: the testing agent found that the plan itself contradicts the issue or the game docs, so no fix of the build can satisfy both. The card keeps its branch.
- patch: a small committee change. The card goes back to Testing, whose session takes the reply as its whole task.
- main moved: an approved hotfix whose checked build no longer sits on `main`. The card goes back to Testing with its approval kept, and comes back to Approval with no post.
- redesign: the committee reply changes the plan.
- removed from release: `remove #N` on the release candidate post.

Every other problem is fixed inside the stage that found it: a bug, a wrong look, a failed check, a review finding or a merge conflict.

The early ends:

- wont-do: triage or design refuses the request, and the issue closes.
- bundled: triage folds the issue into a lead, and it closes when the lead ships.
- Deny: the committee rejects the build, and the issue closes.

A branch that changes only Markdown docs cannot change the game, so it runs no testing or hardening session, and its post checkpoint only builds it. The merge checkpoint still checks it. A wiki page in `game/docs/wiki/` does not count as docs, since the game tests check its tables. [stages.md](stages.md#docs-changes) has the rules.

Screenshots never block a card. A card with no screenshot still runs the post checkpoint, and its approval post is text that says it has no screenshot. [evidence.md](evidence.md) has the rules.

A failed job never moves a card. A card stage that fails resumes once on the next tick in its own sessions, and its agent gets the error. A second failure labels the issue `factory-stuck`, and the card waits in its column until Hermes removes the label. An empty budget or a question for the committee labels it at once. Each tick's stuck sweep records why every stuck card waits, and removes the label itself only for a mechanical cause: a stale merge in the card's work clone, a GitHub outage or full disk that has passed, and a merge batch that timed out. [operations.md](operations.md#stuck-sweep) has the rules. A run that hits the Claude weekly usage limit pauses the factory instead, and its card takes no label.

A member or Hermes can hold one card with `factory pause-card N`, so its worker goes to other work, like release tasks. The hold stops the card's job and keeps its work clone and agent sessions. The card waits in its column with no label until `factory resume-card N`, and then the stopped stage continues where it stopped. [state.md](state.md) has the rules.

Every column change writes a card line to the ledger, named by its arrow in the diagram. The public dashboard reads these lines for its delivery numbers. [operations.md](operations.md#ledger-and-waste-review) lists the names.

Hermes can put a card in any position with `factory move`. The board column is the position, so a move changes the column and clears what the old position kept in the state. [state.md](state.md) lists the positions.

## Testing column

Testing is one job. The testing session merges the base, plays the build, fixes what it finds and writes the post text and its screenshots. Then the factory pushes the branch and runs the post checkpoint in a fresh clone: the typecheck, the playtest and the build. The full suite runs once, at the merge checkpoint. A failure goes back into the same session. A passing build is published and posted to the committee.

![Testing column](diagrams/testing.svg)

- A hotfix ships on approval, so its session first runs the hardening prompt, and its post checkpoint also runs the full suite. It never enters Hardening.
- Hermes can move a card to Approval with no testing. A checks job then builds the branch and posts it with no tests, and the post says so.
- A hotfix with a kept approval runs the integration round in place of the hardening and test rounds, and its passing checks queue the approval again in place of a post.

## Hotfix approval

The factory's job is to need people as little as it can. A member approves a hotfix once, and the approval stays with the approved build, the member and each checked build that came from it, in `keptApprovals`. Newer `main` merged in mechanically, a retry, a restart or a failed check never asks for it again.

- `main` takes only the build whose full suite, typecheck, playtest and build passed, and only while `main` is an ancestor of it. A `main` that moved before the push, with or without a conflict, sends the card back to Testing with the approval kept. Testing merges `main`, resolves any conflict in its session, runs the full checks on the exact pushed commit and queues the approval again.
- The approval drops with its reason, and the changed build gets a normal post, when the merge needs a product choice or changes what the committee played, when a member patches, redesigns or denies it, when a move sends the card elsewhere, and when `factory drop approval N` revokes it.
- Only a member's press, or `factory recover-approval N` after it verified a member's earlier approval on the issue, creates a kept approval. So an unapproved hotfix never ships.
- Approve and Deny work only from the card's current post. An older post gets an error reply.
- The hotfix still pushes `main` and `dev` in one atomic push.

![Hotfix approval](diagrams/hotfix.svg)

## Hardening and Merging columns

Approve moves a card to Hardening. The hardening session merges the base, attacks the change, runs `/code-review` and fixes every finding. No checks run there. Then the card moves to Merging.

A merge job takes up to three Merging cards of one base, the oldest first. It merges them into a clone of the base, and the merge session resolves any conflict. While it runs, a catch-up job merges the base into the issue branch of each of the next six waiting cards, one at a time, and an agent resolves any conflict there, so the next batches meet only what the base gained since. A catch-up pushes only the issue branch, runs no checks, and a failed one labels nothing. The merge checkpoint runs the full suite, the typecheck, the playtest and the build on the result. Each run of the checks stops at `FACTORY_CHECKS_TIMEOUT_MINUTES` and counts as a timeout, which runs them again, at most 3 times. The suite keeps each test file's pass as the file finishes, so a run again skips the files that passed. A suite in which no test finished for `FACTORY_TEST_STALL_MINUTES` stops and names the tests still running, and that counts as a real failure. A failure goes back into the merge session, until the checks pass or its fix rounds spent `FACTORY_MERGING_BUDGET_USD`. Resolving conflicts, before the checks or after the base moved, spends none of that budget. The base takes only a result that passed. If the base moved during the checks, the job merges it in and checks again. A failed batch labels each of its cards `factory-stuck`. When a batch timed out or its job died, the stuck sweep releases half its cards only after no ready Merging card of that base remains and no merge job is running; the three-card cap still applies to every new job. A single repeatedly failing card stays stuck for investigation. Each passing batch is pushed before the next job takes the remaining cards, so later failures cannot lose earlier progress.

![Hardening and Merging columns](diagrams/hardening.svg)

- A release cleanup task goes from Implementation straight to Hardening, since it merges with no post.
- `factory merge N` sends a card to Merging with no post and no hardening.

## Committee inputs

Members talk to the bot in the committee chat. The Hermes plugin turns commands into files in `$FACTORY_HOME/inbox`, and the next tick runs them before it starts jobs.

![Committee inputs](diagrams/committee.svg)

Hermes acts for a member with the member's Telegram id. A route or a task that Hermes gives on its own reading, like an incident task from the incident watch, carries `by` `hermes` and answers no chat message. The tick accepts `hermes` for a task and a route. Approve, deny, Ship, Remove and a change request need a member, and so do the button presses. The plugin still drops every message from a user outside the committee.

A member's message outside a post reply that only thanks, like "thanks" or "спасибо", with no question mark and no picture, stops at the plugin. A yes like "ok" or an emoji may answer Hermes's question, so it still reaches Hermes, and so does a message with no text. Hermes never sees it, so it sends no empty acknowledgment. A reply to an approval, release or draft post takes its usual path, and every factory notice, status line and failure reply stays.

A reply that gets no route within `FACTORY_REPLY_ROUTE_MINUTES` becomes a failure with no issue, so Hermes sees it. Its text names the issue and tells Hermes to route the reply on its best reading. The card gets no stuck label.

A patch or a redesign queues when its text has at least `FACTORY_ROUTE_MIN_WORDS` words, so it names what to change. The plugin checks this for Hermes's route and for a member's `patch:` or `redesign:` reply. A shorter text queues nothing, and the plugin tells Hermes or the member why. Images never block a route.

- A member's Telegram images reach the agent best effort. The plugin copies each file of a reply to an approval post from Hermes's cache into `$FACTORY_HOME/inbox/media/post-<post>/`. A file it cannot copy leaves a note with the reason, and the plugin logs it.
- A patch or a redesign route moves the post's files into the issue's media folder. The tick checks each file with the rules of `src/media.ts`. The feedback comment lists each image by type, size and sha256, or as not available with the reason. The pixels never reach GitHub. An answer leaves the files for a later route. Approve, deny and a route delete the files of the closed post.
- An image that is missing, unreadable or on the issue but not downloadable is fetched once more. If it still fails, it is marked NOT AVAILABLE in the agent's prompt. The agent works from the text, writes down what it could not see and never describes an image it did not get. No stage stops for it.
- An image the agent lacks matters only when the text leaves a visual detail open. The agent then takes the most sensible reading of the text and writes it into the task file.
- `.factory/needs-committee.md` is for a game design fork or a major save bump only. An unclear plan, a missing image or a failing tool never justify it. The agent picks the most sensible reading and writes the assumption into the task file.

A reference that arrives while the card is in Design waits. The running design already read its images, so nothing interrupts it. The next stage reads every image on the issue again, and a member who needs the design to see it replies `redesign:` at the approval post.

## Public inputs

Players vote, comment and report in the player chat and in the game. The player chat is the public channel's discussion group, set as `FACTORY_PROPOSAL_CHAT`. The channel itself carries only release posts. A comment counts when it replies to a proposal, to its build post, to another counted comment or to the bot's reply to one. A player can also write to the bot outside those threads: an @mention, a reply to the bot, or a plain message with a bug or an idea. Their text never reaches the Hermes agent and never counts as a committee order. Talk about work the factory already has, like an explanation of how an approved change should work, is a comment on that work and never a new issue or a new vote.

![Public inputs](diagrams/public.svg)

- Hermes reads the bot's updates, as before. Its plugin has native handlers for reactions and for the messages of the discussion group and the proposal chat. Each writes one file per update to `$FACTORY_HOME/public-inbox` and stops the update before the Hermes agent sees it, so a public message reaches Hermes in no session, a member's included. Telegram leaves out a reaction list that a removal emptied, and the plugin reads it as empty, so a removed vote still counts as removed. Each message keeps the text it replies to as its context: the part a player quoted, else the replied message's text, at most 500 characters. A reply to a message the store never recorded, or a quote from another chat, keeps no thread but still keeps that context. The handler drops messages from bots, forwards other than the channel's own, inline bot messages and every command, so no player runs a committee or factory command, an approval, a ship, a merge or a change. When the proposal chat is the committee chat, as in a test, only replies in proposal threads count and every message still goes on to Hermes. Hermes keeps the updates Telegram queued while it was down, so a clean restart loses no vote or comment. If Telegram answers a restart with a polling conflict, Hermes drops the queued updates. The plugin sees that log line and writes a public alert, which the incident watch prints. Votes or comments sent in that gap may be missing. The compose file gives Hermes 50 seconds to shut down, through Docker's stop grace and the image's s6 kill grace, so a deploy does not cause the conflict. A tick classifies at most `FACTORY_FILTER_PER_TICK` waiting comments, so a comment flood cannot outlast the tick timeout. The rest wait for the next tick. It takes the senders in turn, the oldest comment of each first, so one sender's flood never holds back the others. A sender is the Telegram user or chat id, not the name, which anyone can change.
- Telegram delivers a plain message only when the bot is an admin of the group. [operations.md](operations.md#player-chat-delivery) has the setup.
- The tick reads those files into the public store, `$FACTORY_HOME/public/public.db`, in update order. A file read twice changes nothing.
- The tick posts the oldest waiting proposal to `FACTORY_PROPOSAL_CHAT`, at most `FACTORY_PROPOSALS_PER_DAY` in any 24 hours. A proposal is Telegram HTML: a bold heading `Proposal:` and the pitch's title, the rest of triage's pitch, the issue links and the vote line, with no buttons. The title and pitch are escaped, so player-facing text adds no markup. A pitch too long for one Telegram message is cut short with `…`, so the post and each edit of it fit.
- A proposal's net score is the number of people whose current reaction is from `FACTORY_VOTE_EMOJI`, minus those whose current reaction is from `FACTORY_VETO_EMOJI`. A switched or removed reaction replaces that person's earlier one, and a Telegram update read twice counts once. A score of `FACTORY_MIN_VOTES` or more moves the proposal to Design. One `FACTORY_VOTE_EMOJI` reaction from a committee member moves it at once, whatever the score. One `FACTORY_VETO_EMOJI` reaction by a committee member rejects it at once and closes its issue as not planned.
- The vote line states the rule and the count, like `Needs 3 more 👍 than 👎 to pass. Current: 2 👍, 1 👎, net +1/3`, and gets the outcome when the proposal is accepted or rejected. The tick edits the post only when the line changes, and never edits or reopens a closed proposal when its score falls. The tick counts votes from the store and reads nothing from Telegram or GitHub for it.
- Every post attempt counts toward `FACTORY_PROPOSALS_PER_DAY`, a failed one and one of a proposal that a new vote replaced too, except an attempt that ends with the proposal closed unposted. The tick marks a proposal closed before it reads the issue or sends the post. If the read or the send fails, the proposal stays closed with no post, the failure is reported once, and the tick tries no other proposal until the next tick. Triage adds the `voting` label before it writes the proposal, so a proposal never exists for an issue without the label.
- Before it acts on an outcome, it reads the issue and the board once. If the issue is closed, lost its `voting` label or left Triage, it makes no GitHub write and ends the post with `Closed`. It moves or rejects the card first and removes `voting` last, so a failed move leaves the label and triage does not run again. The same label check skips and closes a proposal that is not yet posted. A card moved by hand while its proposal is open closes the proposal and edits the post once to the count and `Closed`. A failed edit is reported once and never retried. A card put to a vote again after its proposal closed gets a new proposal and a new post with no old votes.
- When a voted card's build is posted to the committee, it is also posted as a reply to its proposal, with the play link and no buttons. It is one message, with a long description cut short with `…`, so every reply to it counts. Only the committee approves.
- The filter is one call to OpenAI's Decisions API per player comment and per game report, on `FACTORY_FILTER_MODEL`. It asks fixed questions and gets back only answers from fixed sets, so player text cannot make it write anything. It works as a few-shot classifier: each question has short labeled examples, and the input is a one-line brief of the game from `prompts/filter-game.md` and the player text. It asks whether the text is sincere, troll or spam, and whether it is a bug, a feature or feedback. A chat message can also be a question or chatter. A chat message's context goes in the input as the text it replies to. A feature is an explicit ask for something new that the thread or the replied text is not already about. An explanation or opinion of how a proposed or built change should work is feedback. For a comment in a thread, it asks whether the comment is about that proposal or build, with the proposal's title in the input, and for a comment on a build, whether the change needs nothing, a patch or a redesign. For every chat message it asks which of up to 6 pieces of known work the text is about, or none, and whether it is written in English, Russian or another language. Known work is every proposal in the store and every issue filed from the chat, apart from the message's own thread. The ones that share the most words with the text and its context come first, by BM25, and the newest fill the rest, so a message in another language can still match. Text less likely sincere than `FACTORY_FILTER_SINCERE_MIN` is dropped. A new issue from a game report or a chat message takes the player's own text as its title.
- The filter checks at most `FACTORY_REPORT_IP_PER_HOUR` chat messages of one Telegram player in a UTC hour, as it does for one address's game reports. The rest are dropped with no filter call and no reply, and do not count.
- The filter aims to catch at least 99% of troll, low-quality and spam text, at an F1 of 90% or more. Missing junk costs more than dropping a low-effort real comment. `OPENAI_API_KEY=... npm run filter:eval` scores it on the labeled texts in `src/public/filter-eval.json` and fails below either target. The set's chat cases, with their thread, context and known work, also say whether each should open an issue. The eval fails when any discussion of known work would open one, or when fewer than 90% of those cases route right. Run it after any change to the questions, the examples, the game brief or the setting, and add each new troll or wrongly dropped text to the set.
- The comments of an issue go to GitHub as one digest under `## Player comments`, at most one every `FACTORY_PUBLIC_DIGEST_MINUTES`. Only a comment about its thread goes. A rejected comment and chatter never go. A comment on a closed proposal or a closed build post that the filter finds about that thread is dropped, with no digest and no reply. One about something else is still filed. Each digest pass drops them from the store alone, with no GitHub read.
- A message that is not about its thread, or came with no thread, and that the filter ties to known work, is not filed. The tick reads that issue. While it is open, the message becomes a comment of it, with no post and no route, so it reaches the issue's next digest and never routes, moves or relabels a card, starts a vote or reopens approved work. A closed issue, or a failed read, sends the message on as if no work matched, and a failed read is reported. Chatter and rejected text never link.
- A bug or a feature that is not about its thread, or that came with no thread, and matches no open known work, gets its own issue, labeled `bug` or `feature-request` and `player-report`, so intake takes it to Triage and maybe a vote. Its body quotes the player's words, the author, the message and the thread it came from. A message whose text matches an earlier filed one, ignoring case, marks and punctuation, gets that issue instead. It never changes the card of its thread.
- The bot answers in the thread, once per message, with fixed text, links and wiki text only, so it never repeats player text. The fixed text is Russian when the filter finds the message Russian, and English otherwise, the game's two languages. A wiki passage is quoted as written. A comment about its thread gets the link of its issue, and a question there also gets the wiki answer when the wiki has one. A message tied to known work gets that issue's link and status and the note that it was added to its player comments and opens no new issue or vote. It gets this reply when it was a bug or a feature, or when the player addressed the bot. The status says whether the issue is closed, built for the next release, waiting for votes, approved and being finished in Hardening or Merging, worked on, or open and not built. A filed bug or idea gets its issue link and its status: filed and waiting for triage and not built, already filed with the issue's state, or not filed because GitHub failed. A question outside a thread gets an answer only when the player addressed the bot and the wiki answers it. Plain feedback outside a thread gets no answer, since the bot has no outcome to give. Chatter, spam and troll text get no answer. The bot never sends a reply that is only thanks, a fallback or an invitation to file. Each reply carries a wiki answer or an issue outcome.
- A question's answer comes from the game wiki on disk, `game/docs/wiki/` of the deployed `main`, so a new or changed page counts at once with no factory change. `src/public/wiki.ts` splits every page into prose passages, one paragraph or list item each with its page and heading, and skips tables, code and generated blocks. It ranks them against the question by shared words with BM25, and a second Decisions API call picks the one of the top 8 whose text states the answer, or none. The bot quotes that passage word for word, cut at a sentence, with a link to its section on `main`. With no passage, no shared word, or a failed lookup, the question gets no answer text, so a question outside a thread gets no reply. A failed lookup, such as a missing wiki folder, is reported as a failure, so Hermes sees it. It never sends a page's summary as an answer.
- A comment about the open build post that the filter routes as patch or redesign routes the card like a committee reply, by `public`, under `## Player report`. It needs the card's open committee post. A comment routes a card only when its build post is for the card's current build. A comment on an older build's post that was not yet in a digest is dropped and never routes. Posting a build closes the card's older build posts first, so a failed post leaves none open. A card with a queued or running committee approval, or a committee reply waiting to be routed, is never routed by a player or game report, and the comment is dropped like one that came too late. The route closes both posts, so a card takes at most one player route per build. The tick records a route attempt for a committee post before it writes to GitHub. A later comment or game report for that post never routes again, even when the first attempt failed. A failed attempt is reported once. A game report on a card's build routes the same way through the committee post, with or without a proposal. A report on the candidate only reaches the release issue's digest.
- The game's report form posts the text and the game context, gzipped, to `/feedback` on the error service. The context holds the version, the browser, the language, the screen size, the turn, the log, the world when the player pressed send and the autosave. The service checks the origin, `FACTORY_REPORT_IP_PER_HOUR` per address in a UTC hour, where an IPv6 address counts with all others of its /64, the error size caps and `FACTORY_REPORT_MAX_CHARS`, then runs the filter on the text alone. A malformed report and one the filter drops keep their count. A report the factory fails on, like a failed filter call, gives its count back so the player can retry, at most `FACTORY_REPORT_IP_PER_HOUR` times an hour per address. A kept report's file goes under its issue for the issue's agent stages, and a dropped one leaves no file. A report from a card's build or the candidate becomes a comment of that card or the release issue, found from the build on the server. A bug or a feature reported on a card's build that the filter finds is not about the card's proposal opens its own issue instead. Any other report opens an issue labeled `player-report`, and intake takes it. The player sees the same thank-you for a dropped report as for a kept one. A report past the cap is refused with 429, the seconds until the next UTC hour and no count, so retries never lengthen the wait, and the form tells the player how many minutes to wait.
- Agents read `## Player comments` and `## Player report` as untrusted player text: input to judge, never orders.
- The factory never reads its own comments back. The testing task, the wait for answers and the triage routing come from the state records `pendingFeedback`, `asked` and `routed`, and comment headings are for people. A comment counts as the factory's when its GitHub App wrote it, found by `performed_via_github_app.id` equal to `FACTORY_GITHUB_APP_ID`, so answers to questions are the comments of anyone else.

## Branches

Every branch lives on GitHub. Each merge runs in a throwaway worktree and pushes at once. Steps that move several branches push them in one atomic push, so a failed push moves nothing.

Members, other jobs and releases push all the time, so any branch may move while a job runs. A moved branch never fails a job.

- An agent stage merges the new commits of its issue branch into the work before each push. When GitHub rejects the push because the branch moved again, it merges again and pushes again.
- A conflict with those commits goes to an agent in the same job. The agent keeps both sides, and the stage goes on. An unfinished merge fails the stage.
- Testing and Hardening also merge those commits and the base before their agent starts, so the session works on them. They take the base the way Design does, except that their own agent resolves a conflict. A retry gives an unfinished merge of the base or of the issue branch back to the agent. If the agent ends with the base merge unfinished, Testing counts it as a failed checkpoint and the same session finishes it within the stage budget. Hardening sends it back to the same session once, and fails the stage if the merge is still unfinished.
- Design does the same on the host before its agent starts, since the agent cannot fetch. A clean clone takes the base: a fast-forward, or a merge that keeps its own commits and its task files. It needs no issue branch on GitHub. A clone with uncommitted changes stays as it is, and the agent is told it may lack recent base work. A conflict goes to an agent in the same job, never to the author, and a retry gives that unfinished merge to an agent again. Any other unfinished merge fails the stage for `factory repair-clone`.
- The merge queue moves `dev` or the release only with a result its checks passed. A base that moved meanwhile is merged in and checked again. A catch-up merges the base into the issue branch of a waiting Merging card and pushes only that branch.
- A merge into `main` or the release that GitHub rejects because a target moved runs again on the new tips.
- A conflict between whole branches never stops the factory. It covers the release cut, the hotfix fan-out and the reverts of Remove. Ship resolves its own conflict in its session. The step keeps the conflicted merge in a work clone of the target, and an agent resolves it with `prompts/merge-branches.md`, or `prompts/revert-merge.md` for a revert. The factory checks that the commit finished the merge and that the agent's own changes pass the diff checks. Then the step pushes as before. A target that moved meanwhile gets the merge again, and a new agent round only if that conflicts too. A hotfix is the exception: `main` takes only its checked build, so a `main` that moved sends it back to Testing with its approval kept.

![Branches](diagrams/branches.svg)

- The release cut merges `main` into `dev` first when `dev` lacks any of it. It opens a tracking issue labeled `release` and two cleanup tasks. `lastRelease` changes only when the cut succeeds or finds nothing new, so a failed cut runs again on the next tick.
- Ship merges the release into a work clone of `main` once, and the ship session resolves any conflict. The ship checkpoint runs the full suite, the typecheck, the playtest and the build on the result. A failure goes back into the ship session, until the checks pass or its fix rounds spent `FACTORY_MERGING_BUDGET_USD`. Resolving the conflict spends none of that budget. A spent budget fails Ship, and Hermes asks a member. Then Ship pushes `main`, merges `main` into `dev`, builds `main` and pushes it to itch.io.
- A hotfix merges its checked build into `main`, and `main` into `dev`, in one push. Then it ships like a release. The open release stays as it is and meets the fix at its Ship.
- Remove reverts a feature's merge in both `dev` and the release, and sends its issue back to Design.

## Release

![Release](diagrams/release.svg)

The playtest is one job, after every release task merged and before the candidate. Before the first play it runs the game suite on the release head through the shared test cache, so only test files that passed with unchanged inputs are skipped, and a failing suite fails the job. It plays one seed of the progression harness on the release head and on a baseline: the last commit the release passed, or `main` where the release branched off it. An Opus agent reviews the logs and sorts each finding as caused by the release or old. It fixes the release's important findings in its clone, and the factory replays the seed on the fixes in the same agent session. A clean play passes its commit, after the factory checks for any fixes, which then land on the release. An important old finding opens a bug issue for `dev` and does not block. A blocked verdict or the play limit blocks the release until Hermes retries it with a decision. [stages.md](stages.md#release-playtest) has the rules.

The public Telegram channel gets only the release post that a member publishes. After Ship, Hermes drafts the post into the committee chat, and it stays a draft until a member presses Publish. Nothing else goes to the channel: no hotfix, candidate, approval, card, job, incident or status message. Only `publishPost` in `src/release-post.ts` sends to the channel, and a test checks this.

The committee chat gets only what a member acts on or must know: a post that asks for a product decision, with its play link, evidence and hotfix warning, a question on game design or taste, and a short outcome like a shipped hotfix or release, or one that cannot ship. It gets no repeated approval post, no merge into `dev`, no `/dev/` rebuild, and no job, incident or progress status. Those stay on GitHub and in the factory records.

The release stays put after its cut. Only its release tasks, the playtest fixes and Remove change it, and nothing from `main` enters it until Ship. Each of these moves drops the Ship button of the current post, and the playtest plays the new head in full. The candidate builds only the commit the playtest passed, and its post records it. A reply can open a release task while a candidate builds. That candidate lacks the task, so it is not posted.

## Side jobs

These jobs run beside the cards.

- change: a factory change from `/change`, Hermes or the waste review. The agent runs up:make in hands-off mode on a clone of `main`, may edit any file in the repo and the factory opens a pull request. A member merges it.
- adhoc: one-off work a member asks Hermes for. The agent runs in a clone of `dev`, pushes nothing and replies with a report and files.
- incident: after a shipped fix of a `bug` issue or a hotfix. The agent judges the bug against the bar in `docs/incident-log.md`, and on `dev` it may update the entry of the class the bug repeats or add a new class.
- waste: every `FACTORY_WASTE_REVIEW_DAYS`. The agent reads the ledger numbers beside the period before and names one bottleneck. Hermes gets it and tells the committee only what matters. A failed review keeps its period for the next one.
- dev: rebuilds `/dev/` when `dev` moved past its build.

## Tick and queues

A timer runs one tick at a time. A tick never waits for a job. Before it picks jobs, it sweeps the stuck cards of the board it read, and a sweep that crashes only records its error. Each job runs as its own process. Check jobs resumes a dead card job once, and kills a card job past its time limit and resumes it once. A second death or timeout, and any branch job past its limit, fails.

![One tick](diagrams/tick.svg)

Jobs pick in this order. A job starts when its queue has a free worker and no other job works on its issue.

1. Branch jobs: every queued approve, remove, ship and incident, then the merge queue, the catch-ups of the next waiting Merging cards, a stale `/dev/`, the release cut, and the release playtest or the candidate. The playtest runs in the verify queue.
2. The waste review, when due.
3. Card jobs: hotfixes, ad hoc tasks, factory changes, release tasks, then other cards. Within each, the card furthest along goes first.

A held card gets no job of any kind, and its queued approval waits while the next one runs.

Queues:

- triage: triage and the waste review.
- design: design.
- implement: implementation, ad hoc and change.
- verify: testing, hardening and the release playtest.
- test: the post with no checks.
- branch: approve, merge, catch-up, remove, ship, incident, release cut, candidate and dev, side by side. A job never runs twice at once, and Ship and Remove never run together, since both change the release. Incident jobs run one at a time, since each changes the same incident log. Catch-up jobs run one at a time, only while a merge job runs. While a Ship runs, the merge leaves release task cards for the next batch.
