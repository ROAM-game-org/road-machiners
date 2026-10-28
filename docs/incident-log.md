# Incident log

ID: R1
what: Code that runs every point, turn or frame walked whole world lists, like every road segment or every obstacle, instead of using a spatial index or a cached result. Derived data was rebuilt on every call, and turn work ran on the main thread.
cost: Turns took seconds and froze between moves, and the same slowness was fixed several times over.

ID: R2
what: Prices, wages, fees and contract rewards were guessed instead of measured with the economy harness, or taken from a run that had crashed.
cost: Jobs paid too little to bother with, items cost absurd amounts, broke players got tows they could not pay, and the committee had to send features back to run the economy sim.

ID: R3
what: A player could end up stuck for good: a rescue that cost more than a broke player had, a rescuer that held its claim forever, a town that rolled no engine for sale for a player whose engine was stripped, and a truck hung on a rock or rocking on a tank trap that the flipped-truck set-down never freed.
cost: Real players got stuck and could only load an older save, and the softlock needed a hotfix on main.

ID: R4
what: The boot, saves and sound broke when one browser feature or download failed: a dropped fetch or a 404 that was never retried, a sound format the browser refused, a worker script that did not load, a stale copy of a file from an earlier build in the browser cache, IndexedDB refused or closed, or a zero-size view. Each fix patched one symptom, the errors blamed the wrong cause, and the same retry was designed several times because a dev build lacked the fix already on main.
cost: Players on Safari, Firefox and Android could not start the game or lost saves, and it took a long string of hotfixes before anyone fixed the cause.

ID: R5
what: The UI asked the sim about a state the sim does not hold, like a part mounted only in a planned refit, or a part on a cell the lookup did not expect, and the lookup threw.
cost: The game crashed for players until hotfixes on main.

ID: R6
what: Restoring a snapshot shared records with the original instead of copying them, so later changes corrupted both.
cost: A player could not get past one turn of their game until a fix shipped.

ID: R7
what: The factory wrote to GitHub too often: reactions to pass the vote gate, progress comments on every job, and the same write repeated on every tick.
cost: GitHub suspended the bot account, hundreds of issues were hidden, and the factory had to move to a new organization.

ID: R8
what: Designs pointed the player at targets with map markers, rings on the ground, floating labels, exact distances and tutorial tips, or finished a task by radio, instead of letting the player find things in the world. A dashed circle of a clue's general area went back, and so did making an old map mark easier to see with a dark edge and a hover name, though the design said it only fixed how an existing mark reads. When the committee then wrote only "no map markers", the patch read it as markers that could not be seen and made the rings bigger, when it meant to remove them. The committee wants the place named in words, like a large square of a coarse map grid, with nothing drawn on the map.
cost: The committee redesigned four contract features in one day, a built map area for survey and claim clues went back for a whole redesign, and a rumored-wreck fix took a patch round that enlarged the rings before an angry redesign.

ID: R9
what: Agents fixed a nearby, easier problem instead of the one reported, like brightening the night when terrain had vanished, changing the 3D world when the issue meant the map, or halving a faint night glow over the player truck when "cars are too bright" meant the daytime light on every truck. The redo of that quick fix met a correction that named a light "from the camera" that no lamp in the game is, picked the sky fill on trucks by its own measurement, built a truck-only shader hook for it, and went to approval without the screenshots its own plan required. When a request names no time, place or screen, check it where the player meets it most, treat a result the eye can barely see as a sign of the wrong target, and when the words match no real light or part, show the candidates side by side before building one.
cost: The committee played builds that did not touch the report, each one went back for a redesign, and a quick fix was denied after two builds.

ID: R10
what: New truck models misread the reference or the role: wrong scale, proportions or detail level, a part copied from another chassis, a remake that kept the old boxy silhouette, a reference picked for its look over the truck's job, remakes built from memory when the agent had only photo links, a light tube frame turned into a slab-sided box, and an open cockpit picked by default though a wasteland truck needs a closed cab. Stacked, overlapping and clipping parts, like wheels in doors, hood, wing and bumper edges, cab frames, window bars, louvers, arches and bucket lips, drew noisy outlines, dark gaps and heavy shading at game camera size, and cleanup rounds deleted wanted details like rails, ladders, lamps and ribs to hide the noise instead of finding the faces that clip or overlap, fixing them in place and checking that view against the committee's screenshot.
cost: Each model took three or more committee rounds and one took six, the owner had to ask by hand for a stronger model, the actual images, a closed cab, the root cause of the artifacts and the return of details a cleanup had removed, and photo-faithful remakes went back round after round even after the committee had attached the photos.

ID: R11
what: A change that applied to many things was built and shown on one, like a diagram drawn for one chassis only, a size picked per truck instead of by one rule, a few keys opened in a scene but not the menu, or a game-wide copy sweep whose design called a small diff a valid result and that rewrote about a dozen lines, among them the one example the owner had pointed out, while the post claimed every line was read.
cost: Four rounds of patches on one card, the owner had to ask for an atlas of every case, and the copy sweep went back for a whole redesign.

ID: R12
what: Screens ignored the UI design system: oversized buttons, wasted space, stray captions, a rotated map with no zoom, garish colors, and a phone layout that hid the speedometer and health.
cost: Many redesigns of screens, and mobile play stayed unusable across several releases.

ID: R13
what: Features did not work when played, though the post said they did: a scripted event that never fired, a blank portrait, story talk reachable from only one path, a follower that drove off, a new mode that crashed new games, and a garage grid drawn from the truck model whose own approval screenshot showed a broken bus, with guns drawn under armor, clipped parts and damage highlights off their parts. Look at every screenshot before posting it, and check layer order and highlight placement on every chassis. A build also went to approval with no browser check because the host was out of memory, so the committee was asked to do the testing.
cost: This was the most common critique, players reported new modes broken after they shipped, the garage grid went back for a patch round over faults its own post showed, and the unchecked build went back for a patch round to be verified first.

ID: R14
what: Player text read like a machine wrote it: semicolons, riddles, filler phrases, item lore with empty rhetoric and no plain fact, wrong directions, NPCs repeating one story, and Russian that was stale or unnatural. A rewrite of a line the committee called confusing swapped one riddle for another, with a pronoun of unclear referent, a metaphor in place of the rule it stood for and a punchline that did not follow, so read each rewritten line cold and check that a stranger gets the plain fact. The opposite fault went back too: a checklist of tells written for AI chat was turned into rules applied word for word to fiction, with no room for the narrator or a character's voice to break them where the story needs it.
cost: Every text quest had to be cleaned up, the committee rejected the copy again and again, a sweep to fix confusing lines went back for a patch round because its fix of the reported line was confusing too, and the writing guidance went back for a redesign to follow the checklist in spirit.

ID: R15
what: Effects did not look physical: spills and grounds drawn as circles, dust that popped up instead of forming, hits shown at turn end, light through walls, and a glow with no visible source.
cost: Repeated patches on the same light and effects, and an exasperated committee.

ID: R16
what: Bug fixes treated the symptom with a guard or a retry and never asked why the bad state happened.
cost: The same bugs came back, and the owner approved many duplicate fixes one by one.

ID: R17
what: Builds dropped points of the request, or added or changed things nobody asked for, like labels and big buttons, a game-wide copy sweep that also rewrote the intro quests the owner had written by hand without asking which text was off limits, or a reputation change that kept the money charge the request and a committee comment said must go, and added a day-long board lockout nobody asked for. A request to hold a slow speed got a new three-position switch and hotkey beside the existing controls, when the choice belonged on the colored speed zones the player already clicks, so extend the existing control before adding a new one.
cost: A follow-up card for every dropped point, redesigns to remove the extras, a patch round to restore the owner's own lines byte for byte, an approved build stopped before its merge to be redesigned and then patched again, and a built route speed control went back for a whole redesign from an annoyed committee.

ID: R18
what: Merges brought back an old version of a feature, or dropped a piece another card had added, like an icon or a panel.
cost: Approved work vanished from the game, and urgent fixes went to main.

ID: R19
what: The post's screenshots and text did not show what they claimed: a popup over the subject, a claim with no screenshot behind it, a model atlas of the truck fitted with armor and guns that hid the bare body the change was about, or a photo-versus-render compare sheet that labeled mismatched features as matches.
cost: The committee had to play builds just to learn what the screenshots should have shown, a model remake went back for a patch round only to get an unobstructed atlas, and the committee had to spell out that a compare sheet must not call a mismatch a match.

ID: R20
what: Proposals against the game's pillars reached a vote or a build: real-time driving and combat, map coordinates, waypoints and a compass, and activities that are not about trucks and the road.
cost: Members vetoed them in the player chat, and one was built and then denied.

ID: R21
what: Rendering went past the minimum WebGL 2 limits that many GPUs have: a ground shader that needed 17 texture units at night where 16 is the floor, and a texture sized from the map that needed more than 2048 texels on the largest map.
cost: On most phones, Macs and Windows Chrome the ground vanished at night, a first fix brightened the moon instead, and one player could not start the game at all until a hotfix.

ID: R22
what: An agent ran two traffic harness runs at once, and each started one sim process per seed of about 1.4 GB. It stopped the runs with factory-job stop, but a vite-node process busy in a sim ignores that stop signal, and the agent never checked that the seeds ended. Six of them kept running beside the other jobs' tests and browsers on a host that was already short of memory.
cost: The factory server ran out of memory and swap and froze for eleven hours, with Hermes, the dashboard and the public site down, until a person power-cycled it by hand.

ID: R23
what: A request to make a visual effect calmer and lighter was overdone until the effect was nearly gone: besides the asked-for lighter, larger and softer look, the build cut a number the request said to keep to a tenth of its value, and the committee was shown only that one result. When tuning a look, keep the effect plainly visible, change only the numbers the request names, and show the before and a middle step next to the result in video.
cost: The committee could not see the effect at all, and the card went back for a patch round to record before, after and halfway videos for the committee to pick from.
