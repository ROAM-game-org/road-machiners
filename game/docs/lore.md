# Lore

The world of ROAM. Everything here answers to [Theme](theme.md).

- [World facts](lore/world.md): the timeline, technology, population and what lies beyond the basin.
- [Peoples](lore/peoples.md): towns, groups and faiths, and how each copes with the world.
- [Characters](lore/characters.md): named people.
- [Rumors](lore/rumors.md): what people say.
- [Stories](lore/stories.md): seeds for events and jobs.
- [Story game](lore/story-game.md): a turn-based game that generates history and stories with agents.

## Icarus

Icarus was a fertile farming basin before the collapse. Orchards, fields, canals, irrigation gates, farm roads, and market towns shaped the land. It was not a spaceflight center. The name Icarus came after the crash. Its old name has not been chosen.

A huge spaceship broke apart while descending through the atmosphere. Its largest hull section lies in the central crater and is called the Fallen Sun. Engines, cargo sections, and escape pods fell across the basin, leaving a trail of wrecks and impact scars. No one in the basin agrees whether the crash happened before, during, or after the wider collapse. It happened in the middle of the Chaos, as [World facts](lore/world.md) records.

People still live and trade here. Farmers protect the canals that still work and the remaining seed stores. Salvagers recover metal and machinery from the wrecks. Truckers carry food, water, fuel, and parts between settlements. An irrigation gate can matter as much as a cargo hold.

The landscape shows all three histories: old field boundaries and canals, the ship's debris trail, and newer truck roads connecting useful places. Hills, valleys, a canyon, and a dried riverbed divide the routes. The crash's date and the basin's old name remain open.

After the Chaos, Nose and Bowl fought a war over the basin. The Old Army ended it and kept the peace between them, until it ran short of food and left Old Orchard. The towns have not fought openly since. Each one expects the other to start.

### Open questions

Each of these needs one true answer, written here once it is chosen. The game will show it only as evidence.

- What the ship was and why it fell.
- Whether Nose's wreck is part of the Fallen Sun's ship or a second ship.
- What lies in the Fallen Sun's crater, and what the green glow does to people.
- Why the Old Army left Old Orchard.
- What the Given were. Many basin people descend from these pod survivors, as [Peoples](lore/peoples.md) records. Whether they were sleeping passengers or people the ship grew, and why they woke remembering nothing, is open.
- What the basin was called before.

Chosen answers live in the hidden truths of [Timeline](lore/timeline.md). The fused glass of the Glass Flats is answered there.

### Mood references

- Huge Old World structures turned into homes: a cruise liner, an aircraft carrier, the oil platforms of Neft Daşları on the Caspian Sea.
- Ernst Haeckel's Art Forms in Nature, for beauty found in strange shapes.

### Concept image prompt

Create a square, straight-down concept painting of Icarus for a post-apocalyptic truck RPG. This image is a reference for designing the playable 3D world, not a minimap or interface. Show the former farming basin with orchards, field boundaries, canals, irrigation gates, farm roads, and market towns. A huge spaceship broke apart during descent: the Fallen Sun, its largest hull section, lies in a central crater, while engines, cargo sections, and escape pods left a visible debris trail across the region. Show the living economy through surviving farms, salvagers at work, and truck routes between settlements. Include hills, valleys, a dramatic canyon, and a dried riverbed. Keep the old farm grid, violent impact trail, and newer winding roads visually distinct. Make the region large enough for long journeys between destinations. Use a hand-painted low-poly wasteland style, warm dust against traces of orchard green and cold ship metal. No text, labels, icons, borders, grid overlay, legend, interface, or perspective view.

## Item lore

Every part, good and the parcel has a lore entry in `src/text/en/lore.ts` and `src/text/ru/lore.ts`. It shows under the name in the item's hover tip and as the last paragraph of the inspection card and the shop row's open detail. It is in-world common knowledge, like a term tip: one or two plain, dry sentences on what the thing is in the basin, who makes or uses it, why drivers pick it and what is odd about it.

Writing rules:

- No game rule, stat, tier or number, and no digits. Never restate what the card shows: mass, range, arc, damage, footprint or condition. A claim about how an item behaves is road wisdom that matches a real rule in the [mechanics pages](wiki/mechanics/).
- Every fact matches this lore. It is evidence, never a conclusion: no hidden truth from [Timeline](lore/timeline.md), no ship name, no use for the M's, no crash date and no old name of the basin. No faction is right.
- Name only Bowl, Nose and groups any driver hears of on day one: the Old Army, the Nose Army, the Bowl Farmers, raiders and Pierce. Name no other site and no person.
- Each entry has its own image of New World use of Old World leftovers where it fits. No two entries share a template sentence.
- At most 200 characters in English and 270 in Russian. `src/text/catalog.test.ts` checks digits, length, the out-of-character words and repeats.

Bad: "A machine gun turret with a wide arc that fires six rounds." It states stats. Good: "The workshop line at Nose turns these out by the crate. Nobody calls it a good gun, but it fires when it is dirty, and every welder in the basin can fix it."

## M's

The currency of the basin is the M, and many are M's. An M is a smooth, indestructible metal disc inscribed with an M. M's were used for something aboard the colony ship before it crashed. The inscribed M is the ship's logo, because the ship's real name began with M. Drivers do not know this. To them an M is simply what things cost.

The Fallen Sun is the basin's name for the ship's largest hull section. It is not the ship's name.

Writing rules:

- In game text say "M's" for an amount and "M" for one. Never call this currency "money", "coin", "cash" or "credits", in labels, tooltips or lines. The code keeps `money` as its internal name.
- An M is a metal coin. There is no paper money: never write notes, bills, «купюры» or «бумажки».
- In Russian say «М» for any amount, like «50 М» and «Не хватает М». Never «деньги» or «монеты».
- A label never names the currency next to the M icon. The icon says it.
- Never name the ship, and never say what the discs were used for. Both are still open.
- Show an amount as a number with the coin glyph in panels, and as "N M's" in the log, dialogue and errors. `src/ui/money.ts` owns both.

### Future hook: the first pod

Not built yet. It waits for separate loot tables and text events (see issue #156 for the related map debris work). The first time a player searches a space pod, they find some M's among skeletons and wonder how the discs got there. Only the first pod search does this. It is the first clue that M's came from the ship. It explains nothing.

## Waste Of Time Radio

Jill Jane, "J.J.", runs Waste Of Time Radio from a mast nobody has found. Her broadcasts stream onto the pager screen of the truck's radio. `src/data/radio.ts` holds her lines. Keep new lines in this voice:

- She reads the wasteland like an Old World farm-and-weather report, with crop-report formality, though no crops are left. That is the New World against the Old World.
- She is dry and gallows-funny. She calls listeners "road machiners" or "boys" and signs off with "Waste some time."
- She reports raids as business and never judges how anyone lives. She does frown on killing.
- She stays in character. She never says turns, quests, XP, levels, HP, keys, clicks, the player or the game. She never states a game stat as a number, like damage, HP or a rule value. Ordinary numbers people say are fine.
- Hints are road wisdom someone in the wasteland would say, like "Noon sun cooks an engine. Park in shade." Each matches a real rule in the [mechanics pages](wiki/mechanics/). A hint never says what to do next or how a control works.
- She names only places the listener has found. Anywhere else is a basin direction like "up north" or "in the southwest basin". She never quotes prices. The Rumor mill and Market ears perks keep that work.
- A line fits the three-line screen: 90 characters at most once its names are filled in.

## Settlement people

Bowl and Nose have locals the player talks to in town. `src/data/locals.ts` holds them and the journal notes their rumors leave. What each says is an ink quest in `src/data/quests/`. Keep new lines in these voices:

- Bowl is run by the canal families, a say for every gate, and guarded by the Bowl Farmers. Its people talk warm and slow, of crops, canals, water and seed. They think Nose is soldiers playing at a town.
- Nose is an Army post that became a town. The Army runs it: command gives orders, dispatch hands them out. Its people talk short and to the point. They think Bowl is slow but needed, since its grain feeds them.
- The locals are Ruben the canal warden, Hattie of the well house and Dag of the Farmers patrol at Bowl, and Sergeant Kovac at dispatch, Lena the mechanic and Old Ibo the radio man at Nose. Nose Army wagon Seven went dark on the Dustwell water run to Bowl, and its crew walked home.
- Talk about the recent years comes from more locals. Jory Baptiste and Bo Lindqvist are at Bowl, a Bowl patrol driver is at the Granary, Sefa Krol trades at the Salvage Yard, and Ines Abend and an Order Bureau clerk are at Nose.
- Jory speaks for the tenants and ends every answer with a short joke. His subjects are the vote, the patrol, Kiln and the grain, and the household's tanker to the top terraces.
- Bo is gentle and plain. He tells the fight at the Burnt Convoy once and does not excuse it.
- The patrol driver talks like a working Bowl hand: the Granary count, the road no one guards and the western tale. The Bureau clerk talks short and low, afraid of the corridor, and says only what the corridor says.
- Sefa is blunt and dry. She speaks for the families off the Burnt Convoy, who live at the Salvage Yard now. She takes what the road is done with and leaves the water.
- Ines is level and open. She reads the count aloud to anyone who stops and says plainly what she does not know.
- The six older locals also talk about the gun law, the swivel and its pins, Pierce paper, the Kiln fee, the tenants, Green Pit and the Glass Flats, each in their own voice. Ruben, Hattie and Dag disagree with Kovac, Lena and Ibo on who is to blame.
- A rumor from [Rumors](lore/rumors.md) reaches the journal as a note that records what the speaker said, never the truth. A biased speaker says so in character, and two locals may contradict each other, as Sefa and Ibo do on the old Burnt Convoy stretch.
- Locals point to the people of other jobs by name and place only: Agnes Ondra at Dustwell, Odile Marsh at the Granary, Mara Kessel at the Salvage Yard, Constance Pierce at the Pierce office in Nose, Tamsin Roe the courier, Lusa Fenwick and Pim Arslan the lens cutter. They never speak for them.
- Locals may be wrong, biased or out of date. Two of them may contradict each other. No line settles the crash date, the basin's old name or what the Fallen Sun was.
- Lines stay in character, as J.J.'s do. They never say turns, quests, XP, levels, HP, markers, waypoints, the map, clicks, the player or the game. They never state a game stat as a number, like damage, HP or a rule value. Ordinary numbers people say are fine, like "a decade of service" or "two cans".
- A clue describes land the listener can see: a compass direction from a town, a named road or place, and the terrain there, like a hollow or an old farm with a water tower. It may give a rough spoken distance, like "half a day north", but never a map unit or an exact spot.
