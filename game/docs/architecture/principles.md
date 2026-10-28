# Architecture principles

These are the architecture principles of this project. Each one has a rule, the reason behind it and a check a plan must answer when a change touches it. A design that deviates from a principle names it and says why. [The incident log](../../../docs/incident-log.md) has the full entries behind the incidents named here. The review in the factory checks every change against these principles.

## 1. One rulebook for every truck

The player and NPCs go through the same rule functions. The only allowed split is the level of detail near and far from the player, and `src/sim/far.ts` owns that split. A rule that branches on the player does so only because DESIGN.md says so.

Why: DESIGN.md asks that player and NPCs play by the same rules. A split that leaks into a rule is hard to see and changes the game for one side only.

Plan check: name every place where the change treats the player differently from NPCs, and the design reason for each.

## 2. The simulation owns the rules, and everything else reads them

Rendering, UI, harnesses and tools call sim functions and commands. They never keep their own copy of a rule. A harness that needs less detail switches the level of detail through the sim, never through a rewritten rule.

Why: the old economy harness kept its own copies of travel, fights and part wear. It measured a different game, and prices were set from it.

Plan check: list each rule the change reads outside `src/sim/`, and name the sim function that owns it.

## 3. Hot code uses an index

Code that runs per turn, per frame, per truck or per pair never scans a whole world list. It queries an index. `ObstacleBuckets` in `src/sim/nav/buckets.ts` answers questions about obstacles near a point or along a segment. `RoadIndex` answers questions about roads. Cached nav layers in `src/sim/nav/layer.ts` hold route data.

A filter over `world.obstacles`, `world.roads` or `world.vehicles` inside a function that runs per point, per segment or per check is a violation. So is a filter that only narrows the list after a full pass over it.

Derived data that many calls need is built once and cached, never rebuilt per call.

Why: full scans in hot code were found and fixed four times, and new code kept adding them.

Plan check: for each new loop in hot code, name the size of the list, the rate of the calls and the index the code uses.

Incidents: R1, R2, R3, R4.

## 4. Value is conserved, and every source and sink has a name

Money, parts and goods move between owners. They appear or vanish only in places the design names. A new way to create or destroy value is a design decision, never a side effect.

Why: DESIGN.md says nothing appears offscreen to keep the economy going. An unnamed source, like a free new loadout for every recovered raider, turns fights into a source of unlimited gear.

Plan check: list every source or sink of value the change adds or changes, with how much it pays and how often.

## 5. Save facts, derive the rest

`World` holds facts only. Derived data and caches live outside it and are rebuilt from the facts. A cache key compares ids, not object identity, because the world is cloned every turn. Any change to a type reachable from `World` needs a save migration, as [Saves](saves.md) and `CLAUDE.md` describe.

Why: a stored derived value drifts away from the facts it came from. Players keep their saves across updates.

Plan check: name each saved type the change touches and its migration, and each new cache with its key.

## 6. Same seed, same game

All sim randomness goes through `src/sim/rng.ts` with its state in the world. Each concern draws from its own stream: shops from `world.marketRng`, driver names from `world.nameRng` and search reveals from `world.searchRng`. A new concern whose draws must not shift others gets its own stream. Render and audio may use `Math.random()` or `src/render/noise.ts`.

Why: harness runs, replays and bug reports mean something only when a run repeats exactly.

Plan check: name each new random draw and the stream it uses.

## 7. Impossible states fail loud

A rule throws on a state that should never happen. It never returns a default, a zero or an empty result in its place. A driver that stops making progress raises a `stall` event, and a stall is always a bug.

Why: a silent default turns a bug into a wrong number that nobody notices until the balance is off.

Plan check: name the new invariants and where each one throws.

## 8. Show it, don't say it

A feature shows state with what the player already sees: the grid, the 3D view, an icon, a color or a drawn shape. Text is added only when no visual can carry the information. A tooltip, label or log line never repeats in words what a drawing on screen already shows.

Why: agents keep adding text that explains what the screen shows. Example of what not to do: a gun's tooltip read "arc 270°, facing rear" while the inventory grid already drew its arc fan and a triangle on the side it faces. Both the number and the words were noise.

Plan check: list each new word of UI text, and name the visual that already shows it or say why none can.

## 9. Player progress survives updates

A change to content a save holds keeps that progress, or resets the least of it. It never throws away the whole world for one part that no longer fits. Load repairs what it can in place and tells the player what it reset. The rescue screen is only for what no repair can fix, like another map or another major format.

Why: players keep their saves across updates. A rescue rebuilds the world from a new game, so one bad quest variable used to cost the player their NPCs, shops, contracts and place on the map.

Plan check: name each saved fact the change invalidates, and whether a migration step keeps it, a raised quest revision resets it, or the rescue carries it.

## 10. Work that grows with the map picks a home

Work whose cost grows with map area picks one of four homes, by who reads it and when its input changes.

- Bake it offline when the baked map fixes its input and the result is small.
- Build it per 32-tile cell on first use when readers ask about one place. The 3D views stream this way through `src/three/render/streamer.ts`.
- Keep a small whole-map summary when readers ask about the whole map, like connected areas or the road to a town.
- Touch only the changed cells when game state changes in a few places each turn, like explored tiles.

Work that grows with the count of trucks or shops is not area work and falls under principle 3.

Why: the 7.5 km map made boot build every prop, scatter cell and route grid for the whole map, though the player sees a small disc. Boot took 20 s.

Plan check: for each new piece of work that grows with map area, name its home. For a whole-map summary, give its size in the download or in memory.
