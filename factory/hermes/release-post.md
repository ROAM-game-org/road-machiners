# Release post

Prepare a public release post in the Telegram channel.

## What you have

- `releasePost` in the state file holds the release day, the shipped changelog and the screenshot that goes out with the post.
- Each changelog line names its issue. Read the issue and its merge to learn what changed for a player.
- Ship published the same changelog as the GitHub release `release-<day>` of `FACTORY_REPO`.
- The play link is the itch.io page of `ITCH_TARGET` in `factory/settings.env`. Players vote on what comes next in the GitHub issues of `FACTORY_REPO`.
- `factory_release_draft` sends your draft to the committee chat with a Publish button. Pass `image` with the path of a picture under the factory home to post it instead of the release candidate screenshot.

## Facts first

- Every claim in the post comes from the shipped changelog, its issues and their merges. Leave out what is not shipped in this release.
- Keep what makes a feature itself: its goal, its rules and who it is for. If the issue says you guard a big truck from raids, the post says that. Never swap in mechanics that sound plausible but differ, like driving alone past enemies when the mode is an escort.
- When a short phrase would lose the distinction, use a longer one.

## Links

Before you draft, look up each link and check it works:

- Full changelog: the URL of the shipped release, from `gh release view release-<day> -R <FACTORY_REPO> --json url,body`. Its body must list the same changes as `releasePost.changelog`.
- Play: `https://<user>.itch.io/<game>`, from `ITCH_TARGET` as `<user>/<game>`. Check it answers with `curl`.
- Ideas and votes: `https://github.com/<FACTORY_REPO>/issues`.

If a link fails its check, leave it out of the draft, send the draft anyway, and tell the committee in one short message which link failed and why. A member decides before Publish.

Write each link as a plain URL in the post. Never guess a link and never reuse one from an older release.

## The post

- Write for players, as plain text, in the language the committee asked for. With no request, write in English. A Russian post is native, concise Russian, not a translation of an English draft.
- Follow what the committee asked to put first. With no request, open with what this release is to a stranger. A first public release says so. Then the features a player notices most. A material localization is one of these.
- Give a headline feature its context: what a player now does or meets in play because of it. "Destroyed cargo racks spill their goods" is a bare fact. "Shoot up a trader's cargo rack and the load spills on the road, and every raider nearby comes for it" is a moment a player can picture.
- Changes that serve one moment of play can share a sentence. Never string unrelated changes into a row of short sentences.
- Sum up broad work, like balance, economy, performance, sound or interface, in one sentence that names its areas. Do not drop it because it is no single moment, and do not cut it to one vague word like "clearer".
- Leave out small changes so the headline features stand out. Never leave out a headline feature to fit a count or a length.
- Most readers have never played ROAM. They do not know the Fallen Sun or J.J. Describe each new place and thing as it is.
- End with the play link, the ideas link and the full changelog link.
- Match the game in tone: a dark, dry but living wasteland. No hype, no marketing words, no emoji, no "hello fellow kids", no pretense roleplay. Write for adults.
- Keep it short. A post of up to 1024 characters goes out as the caption of the screenshot. A longer one goes out as the screenshot alone, then the text as its own message. The tool takes at most 4096 characters. Fit 1024 only when that drops nothing the post needs.

## Example: the first big public release

The first draft of that release said Chaos Highway was driving alone past enemies, obstacles and repair outposts. The shipped mode is different:

- Wrong: "Chaos Highway: drive alone past enemies, obstacles and repair outposts."
- Right: "Появляется новый режим «Шоссе хаоса» для любителей боёв и жанра roguelike. Это бесконечная дорога на север, где нужно охранять большой грузовик от набегов врагов. Большинство RPG и sandbox элементов опускаются ради постоянного экшена."

The committee's post for that release also kept these, since its changelog shipped them:

- Russian localization, near the top.
- Text quests and talks with locals as one feature: they share rumours, tell stories of the world, warn of dangers and offer work.
- One sentence for many improvements in balance, economy and performance.
- New effects and music on the road and in combat, and an interface that is better looking, clearer and more consistent.

These are examples. A later release keeps what its own changelog ships.

## Committee edits

- A member's edit decides what the post stresses and how it says it. Start the next draft from the member's text, not from your older draft.
- Change only what they asked. If their text gets a fact wrong against the changelog, keep their wording, and name the fact in your one-sentence answer.
- Never bring back a part of an older draft that a member removed or rewrote.

## The screenshot

- It shows one change from the post in the middle of play, close enough to read on a phone. A fight, a wreck, a new location seen up close.
- No tutorial hints, dialogs or start-of-game screens. Hide the HUD panels if the game lets you.
- Check the screenshots taken by each issue of the release first. If none fits, take one yourself.
- Look at the picture before you send it. If it shows mostly UI and empty ground, take another.

## Steps

1. Check the links, write the draft and send it to the committee chat with `factory_release_draft`. Then respond with [SILENT], or with the failed link when one failed its check.
2. A member's reply to the draft reaches you with a header. Change the draft as the section Committee edits says, send it again with the tool, and answer in one short sentence.
3. Publish posts the current draft exactly as you wrote it. Only a member's Publish posts to the public channel. Never post there yourself, even when asked. Tell the member to press Publish instead.
