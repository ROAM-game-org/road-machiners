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
what: Designs pointed the player at targets with map markers, rings on the ground, floating labels, exact distances and tutorial tips, or finished a task by radio, instead of letting the player find things in the world.
cost: The committee redesigned four contract features in one day, and still could not tell what a survey target was or how to find it.

ID: R9
what: Agents fixed a nearby, easier problem instead of the one reported, like brightening the night when terrain had vanished, or changing the 3D world when the issue meant the map.
cost: The committee played builds that did not touch the report, and each one went back for a redesign.

ID: R10
what: New truck models misread the reference image: they ignored it and the game's scale, with trucks too small next to others, wrong proportions, too much detail and wheels clipping through doors, or they copied it too literally, like open seats from a beach buggy that no wasteland driver would ride in. Remakes kept the old chassis's silhouette under new details, like a convertible that still read as a boxy closed-roof truck with an open bed, or bolted on a part copied from another chassis, like a square hardtop on a rounded fendered body. They also left front details unfinished: the hood's engine hole as a bare dark box with stacked shapes over the grille instead of a closed hood like the scout's, and round headlights as pale dots stuck out on the front corners instead of lamps set into the front. When the reference photos could not be downloaded, a remake went ahead from memory and published measurements, and passed checks that pinned only its side profile, so its redesign still read as a straight-sided box with a tall angular top and a dark hole behind it.
cost: Each model took three rounds of committee feedback, the owner had to ask for a stronger model by hand, two remade chassis went back to design after their builds, one later patched again for its cab and one sent back to start over twice after a patch to its headlights had not fixed its look, and another went back for a patch to its hood.

ID: R11
what: A change that applied to many things was built and shown on one, like a diagram drawn for one chassis only, a size picked per truck instead of by one rule, or a few keys opened in a scene but not the menu.
cost: Four rounds of patches on one card, and the owner had to ask for an atlas of every case.

ID: R12
what: Screens ignored the UI design system: oversized buttons, wasted space, stray captions, a rotated map with no zoom, garish colors, and a phone layout that hid the speedometer and health.
cost: Many redesigns of screens, and mobile play stayed unusable across several releases.

ID: R13
what: Features did not work when played, though the post said they did: a scripted event that never fired, a blank portrait, story talk reachable from only one path, a follower that drove off, and a new mode that crashed new games.
cost: This was the most common critique, and players reported new modes broken after they shipped.

ID: R14
what: Player text read like a machine wrote it: semicolons, riddles, filler phrases, wrong directions, NPCs repeating one story, and Russian that was stale or unnatural.
cost: Every text quest had to be cleaned up, and the committee rejected the copy again and again.

ID: R15
what: Effects did not look physical: spills and grounds drawn as circles, dust that popped up instead of forming, hits shown at turn end, light through walls, and a glow with no visible source.
cost: Repeated patches on the same light and effects, and an exasperated committee.

ID: R16
what: Bug fixes treated the symptom with a guard or a retry and never asked why the bad state happened.
cost: The same bugs came back, and the owner approved many duplicate fixes one by one.

ID: R17
what: Builds dropped points of the request, or added things nobody asked for, like labels and big buttons.
cost: A follow-up card for every dropped point, and redesigns to remove the extras.

ID: R18
what: Merges brought back an old version of a feature, or dropped a piece another card had added, like an icon or a panel.
cost: Approved work vanished from the game, and urgent fixes went to main.

ID: R19
what: The post's screenshots and text did not show what they claimed: a popup over the subject, or a claim with no screenshot behind it.
cost: The committee had to play builds just to learn what the screenshots should have shown.

ID: R20
what: Proposals against the game's pillars reached a vote or a build: real-time driving and combat, map coordinates, waypoints and a compass, and activities that are not about trucks and the road.
cost: Members vetoed them in the player chat, and one was built and then denied.

ID: R21
what: Rendering went past the minimum WebGL 2 limits that many GPUs have: a ground shader that needed 17 texture units at night where 16 is the floor, and a texture sized from the map that needed more than 2048 texels on the largest map.
cost: On most phones, Macs and Windows Chrome the ground vanished at night, a first fix brightened the moon instead, and one player could not start the game at all until a hotfix.
