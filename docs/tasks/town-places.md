# Town pages as places

Status: validating
Branch: town-places
Worktree: .worktrees/town-places
Goal: A player who opens any town page sees the settlement's outsider area as a list of named places they can visit, starts on Bowl gateway, and finds parts, goods, jobs, people and maps with one click each, as fast as today. Useless if: only the button labels change while charts stay inside the market; a place has nothing to do; a place adds walking or an extra screen; Russian text is missing; the text still says "gate yard" in Bowl; or a screenshot check passes while the names were never approved by the user.
Mode: hands-off

## Context

The town page is a list of functions: garage, market, board, locals, parked drivers. A new player reads it as a shop menu, and the board reads as a literal plank of notes. The lore says otherwise. Bowl keeps outsiders in one section at its gate, and Nose has a compound for outsiders. The page should show that place.

Read first: `game/CLAUDE.md`, `game/docs/DESIGN.md`, `game/docs/ui.md` (lines on `.ink-page` and "Worked example: the town page"), `game/docs/lore/README.md` (Sense check), `game/docs/lore/peoples.md`, `game/docs/writing/character-lines.md`, `game/docs/writing/russian.md`.

Code that owns this today:

- `TOWN_SECTIONS`, `TOWN_SCENES` and `TownSection` in `game/src/data/quests.ts`.
- `townSections()` and `pickTownSection()` in `game/src/sim/quests.ts`.
- `frontChoices()`, `oddJobsChoice()`, `marketTabs()`, `MarketTab` and `Tab` in `game/src/ui/town.ts`, with `game/src/ui/town.test.ts`.
- `town.go.*`, `town.section.*` in `game/src/text/en/screens.ts` and `town.place.*`, `town.line.*`, `local.*.role` in `game/src/text/en/story.ts`, with their Russian twins.
- Section art in `game/src/data/quest-art.ts`. Only Bowl's market has section art today.
- `charts` on each shop in `game/src/data/market.ts`. Only Bowl and Nose sell charts. `game/src/sim/charts.ts` owns the sale.
- Scripts that name the current labels or tabs: `scripts/ui-playtest.mjs`, `scripts/garage-ui-check.mjs`, `scripts/mobile-check.mjs`, `scripts/layout-check.mjs`, `scripts/shop-parts-check.mjs`, and `src/ui/guide/pieces.ts`.

## Design

Every shop site shows the same four function places under the same names, plus one canteen with its own name. The names are the only player text that says which function a row opens.

### Places

Rows run in this order on every site. The fuel and supplies rows stay on the front page and show their price before the click, such as "+5 L, 1 M" and "Fill 160 L, 32 M". Rows carry no function tag on the right, since the names say what each place does.

1. Machiners' yard: buy parts, sell parts and repair. Bowl and Nose add trucks and paint, as the garage kind does today.
2. Trading post: goods only. At Bowl, Mags Corrin runs it, and the `bowl_scale` scene and art stay.
3. Contract depot: every job the board holds today.
4. The site's canteen: the locals and the parked drivers on one page. It replaces Look for locals and See who is parked.
5. Guidestar post, at Bowl and Nose only: buy maps and talk to a Guidestar manager. Charts leave the Market page and show their price before the purchase.
6. Odd jobs: the same shift and the same limit, with the limit shown as the reason when it is off.
7. Drive on.

### Sites

The Marshall desk at the Roadhouse is not a shop and keeps its own page. Only Bowl and Nose keep outsiders apart in the lore, so the outposts keep their site name as the heading.

- Bowl: heading "Bowl gateway", Hattie's canteen.
- Nose: heading "Nose compound", Drivers' mess.
- Salvage Yard: Cutters' mess.
- Granary: Cookhouse.
- Pump Station: Still yard mess.
- Dustwell: Tank wall canteen.
- Green Pit: Hook house.

### Structure

- `TOWN_SECTIONS` becomes `garage`, `market`, `board`, `people`, `maps`. The `bar` section merges into `people`.
- `townPlaces()` replaces `townSections()` and leaves `maps` out where the shop's `charts` is false. The `charts` flag stays the one owner of who sells maps.
- The four shared names stay one text key each. Each site adds a canteen name key, and Bowl and Nose add a heading key.
- Each section keeps one `town.line.*` line, rewritten to fit every site. "A plank wall of notes" goes away.
- The canteen is always open, since every shop site has a local. Parked drivers show as a list on that page, and an empty list shows the existing no drivers reason.
- A local gains the section that lists them. Guidestar managers list under `maps`, so they do not also appear in the canteen.
- The supply rows leave the Trading post list, since the front page holds them.
- `game/docs/ui.md` changes "a digit always means the same place" to same order, since outposts have no maps row and Odd jobs moves from key 6 to key 5 there.

### Lore and text

- Bowl's "gate yard" becomes "gateway" in `bowl_scale.ink` with its `# place` tag, `intro_bowl.ink`, `story.ts` with its `journalNote.*.from` lines, `bowl-scale.test.ts`, `characters.md`, `voices.md`, `lore/README.md`, `docs/architecture/quests.md`, `docs/wiki/mechanics/content.md` and `stories.md`, and in the Russian twins.
- Hattie runs a canteen instead of a water stand. Update her character sheet, her voice sheet and `local.hattie.role`. The "water stand" joke at `bowl_hattie.ink:56` needs a new line, and her other lines get read for fit.
- Bowl and Nose each get a new Guidestar manager local, written by the voice sheet and character line process. They talk about maps, courier routes and news for sale. The Guild serves every side and is owned by both towns, so it holds a post at both.
- Rewrite `town.place.bowl` for standing in the gateway, keeping the terraces seen past the inner gate and the smell of diesel and wet clay.
- agy writes all Russian text, with the fallbacks in `game/CLAUDE.md`. "Machiners" follows `docs/writing/russian.md`: механтист, never машинист.

TDD: yes for `townSections()`, the front page choices and the listing of locals by section, in the existing test files. No for text and art, since a person reads them.

### Invariants

- IV1: Every function stays reachable in one click from the front page, and every place keeps the number keys working.
- IV2: A place appears only if the player can do something there.
- IV3: Places keep the same relative order on every site.
- IV4: No sim rule, price, stock or contract changes. Town scenes still fire on the same moments.
- IV5: Old saves load. Section ids are not in the saved world types, so no migration is needed.

### Principles

- PC1: Keep ids that mean a function, such as `garage`, and change only player text, except for the `bar` merge and the new `maps`.
- PC2: Every screen change follows `game/docs/ui.md`, and that doc is updated in the same change.

### Assumptions

- AS1: The existing Bowl band art fits a busy gateway and stays.
- AS2: New section art is not part of this task.

## Plan

Approach: since every shop site offers every place except maps, section access has no off state left. Replace it with a plain list of places per shop, so the front page, the page guard and the reopen rule share one answer. Text follows in the order the code needs it: English labels with the code, then lore, then managers, then Russian last so agy translates final English.

### PH1 — Places in the sim

- 1.1 `game/src/data/quests.ts:61` (modify): `TOWN_SECTIONS` becomes `garage`, `market`, `board`, `people`, `maps`. Respects IV3, IV4, PC1.
- 1.2 `game/src/sim/quests.ts:736,755-777` (modify): remove `SectionAccess`, `townSections()` and `requireOpenSection()`'s access lookup. Add `townPlaces(shopId: string): TownSection[]`, which drops `maps` when the shop's `charts` is false. `pickTownSection()` throws when `to` is not in that list. Respects IV1, IV2, IV4.
- 1.3 `game/src/data/locals.ts:32,34-49` (modify): `LocalDef` gains `section: 'people' | 'maps'`, set on every entry. Quests stay as they are.
- 1.4 `game/src/sim/dialogue-rules.ts:801` (modify): add `localsIn(town: string, section: LocalDef['section']): LocalDef[]`. `localsAt()` stays for existing callers.
- 1.5 Tests first in `game/src/sim/town-scenes.test.ts:57-58,101` and `game/src/sim/locals.test.ts`: section list, places per shop, a throw on `maps` at Dustwell, town scenes still firing, every shop having a `people` local. That last test is what keeps IV2 true for the canteen.
- Commit: Town places replace section access

### PH2 — Town page

- 2.1 `game/src/ui/town.ts:118-122` (modify): `townPageOnOpen()` drops its `access` argument, since a kept page at the same shop stays valid. Update `game/src/ui/town.test.ts:158-177`.
- 2.2 `game/src/ui/town.ts:262-275,365-372` (modify): `go()` loses the off branch. `frontChoices()` maps `townPlaces(shopId)`, and labels come from a new `placeName(shopId, section)`.
- 2.3 `game/src/ui/town.ts:361-363` (modify): `heading()` uses `placeName()` on a section page and `townHeading(shopId)` on the front page, which gives "Bowl gateway" and "Nose compound" and `siteName()` elsewhere.
- 2.4 `game/src/ui/town.ts:390-411,441-445` (modify): `sectionChoices()` lists `localsIn(shopId, page)` for `people` and `maps`. `sectionPanel()` shows parked drivers on `people` and the charts map on `maps`. Rename `bar()` to `parkedDrivers()`.
- 2.5 `game/src/ui/town.ts:85,91,129,400-402,492-517,528` (modify): remove `MarketTab`, `marketTab`, `chartsShown()`, `marketTabs()` and the supply rows in the goods list. `sectionReason()` at `:846` keeps only the no drivers reason. Respects IV1.
- 2.6 `game/src/ui/town.ts:345,321-325` stays: the Roadhouse desk keeps `town.go.people` and `town.section.people`.
- 2.7 `game/src/text/en/screens.ts:588-601` (modify): `town.section.garage`, `market`, `board` and new `maps` hold the shared names and serve both the row and the heading. Remove `town.go.garage`, `market`, `board`, `bar`, `town.section.bar` and `town.reason.noLocals`. Add `town.canteen.<shopId>` and `town.heading.bowl`, `town.heading.nose`.
- 2.8 `game/src/text/en/story.ts:25-29` (modify): rewrite the `town.line.*` lines to fit every site, add `town.line.maps`, remove `town.line.bar`. `game/src/text/en/log.ts:233` says Machiners' yard.
- 2.9 `game/src/ui/guide/pieces.ts:75`, `game/scripts/layout-check.mjs:324-327,479,487` (modify): new labels, `maps` replaces `market-charts`. Check `ui-playtest`, `mobile-check`, `garage-ui-check` and `shop-parts-check` still run, since their `garage` and `market` ids stay.
- 2.10 Test that every shop has a canteen name in both languages, next to the prose test in `game/src/ui/town.test.ts:179`. It stays red until PH5.
- Commit: Town page shows places

### PH3 — Lore and fixed text

- 3.1 Change "gate yard" to "gateway" in every file the Design lists, then grep for any left. The Bowl `# place` tag and the `describe` name in `bowl-scale.test.ts` change with it.
- 3.2 Hattie runs a canteen in `characters.md:576-592`, `voices.md:23-35`, `lore/README.md:141` and `local.hattie.role`. Her spoken line at `bowl_hattie.ink:56` and any other misfit goes through one codex call per line, per `docs/writing/character-lines.md`.
- 3.3 Rewrite `town.place.bowl` at `game/src/text/en/story.ts:18`.
- Commit: Bowl gateway and Hattie's canteen

### PH4 — Guidestar managers

- 4.1 Sense check both posts against `lore/README.md:18-24`, then add two sheets in `characters.md` and `voices.md`.
- 4.2 Add `bowl_guild.ink` and `nose_guild.ink` with lines from codex, `LOCALS` entries with `section: 'maps'`, the `LocalId` union, and `local.<id>.name` and `.role`. Follow `docs/writing/quests.md:66`. The talks set no notes and change no sim state. Respects IV4.
- 4.3 Run `quest-voice`, `quest-compile` and `locals` tests.
- Commit: Guidestar managers at Bowl and Nose

### PH5 — Russian

- 5.1 agy writes every new or changed Russian line: `screens.ts`, `story.ts`, `log.ts`, the ink twins in `src/data/quests/ru/`, and "двор у ворот" where it stands for the gateway. Keep the unrelated "двор" senses. Follow the fallbacks in `game/CLAUDE.md`. A missing line is reported and never written by hand.
- Commit: Russian for town places

### PH6 — Docs

- 6.1 `game/docs/ui.md:336,383-386`: new order, same order rule, panels. Respects PC2.
- 6.2 `game/docs/wiki/mechanics/social.md:48`, `economy.md`, `crime.md:88`, `content.md`, `game/docs/architecture/quests.md:148-150`: match the new names.
- Commit: Docs for town places

### Test strategy

- TDD on PH1 and PH2 logic. Run only touched test files, then `npm run quality` from the root.
- AS1 and the charts map's fit in the text column get checked on screenshots in Verify.

### Order & dependencies

- PH1, then PH2, then PH3, PH4, PH5, PH6. PH5 waits on all English text.

### Risks / rollback

- RK1 — agy can hit a quota that lasts days, which holds PH5 and the Goal's Russian check. Use the `game/CLAUDE.md` fallbacks, and report any line still missing.
- RK2 — The charts map may not fit the text column once the truck column is gone, which would need a wide panel. Layout check and screenshots catch it in PH2.
- Rollback is a branch drop, since nothing touches saves.

## Verify

Result: failed once, then fixed. Three checks are deferred and listed below.

Happy-path:
- CK1 — A site shows the wrong heading, names or order, in either language — held on all 7 sites in English and Russian.
- CK2 — A chart cannot be bought at the Guidestar post — held: a picked square showed Buy 34, and money fell by 34.
- CK3 — The manager does not open, or the scale scene no longer fires at the Trading post — held on screen, with no page errors.

Negative:
- CK4 (IV2) — A site with no maps can reach a post — held: `pickTownSection()` throws, and the front page has no row.
- CK5 (IV1) — Number keys point at the wrong place — held: key 5 opens the post at Bowl, and key 4 opens the canteen at Dustwell.

Purpose:
- CK6 — Fuel and supplies show no price before the click — broke: buttons read "+5 L" with a unit price beside them. Fixed: they read "+5 L, 1 M" and "Fill 155 L, 31 M's", priced by `supplyCharge()`.
- CK7 — The canteen hides its locals — broke at 1280x720: the panel's minimum height pushed Hattie below the fold. Fixed with `.ink-panel.fit`, confirmed on a screenshot.
- CK8 — The text still says "gate yard", or code still names the old tab and bar labels — held by grep over `src`, `docs` and `scripts`.

Smoke: `tmp/town-check.mjs` drove every site and Bowl place in headless Chromium, with no page errors. Touched tests, `quests:check`, `typecheck` and `src/text` tests pass.

Notes:
- Deferred: `npm run layout`, `npm run playtest` and `npm run mobile`. The harness stopped them because the machine ran low on memory. Layout reached the 700x800 English pass and gave no verdict. They need a rerun when memory allows.
- Deferred: pressing Radio on a parked driver. The row and button show on the canteen page, and `callVehicle` is unchanged.
- Deferred: the user reads every new or changed line of game text before merge.

## Code smells

## Conclusion

Outcome: the town page shows named places on every shop site, in both languages. The Goal still needs the user to read the text and the three browser checks to rerun.

Invariants:
- IV1 — Every place opens from a front page row, and the number keys were checked on screen.
- IV2 — `townPlaces()` drops `maps` where `charts` is false, and a test confirms every shop has a local in its canteen.
- IV3 — `TOWN_SECTIONS` sets one order, and a test checks it on every shop.
- IV4 — No sim rule, price, stock or contract changed. Town scene tests pass.
- IV5 — Section ids are not in the saved world types. The new locals' quests add nothing to old saves, but no old save was loaded in a browser.

### Assumptions check
- AS1 — unverifiable by the agent — the Bowl band art stays, and the user judges the fit on the screenshots.
- AS2 — held — no art was added.

Plan adherence: PH1 to PH6 went into one commit, since the type check needs code and both languages together. Fuel and supplies buttons gained totals only after verify showed them missing, and `SupplyLimit.pricedButtons` keeps the outpost rows as they were.

Review findings:
- Important: the price change also altered the outpost rows through the shared `limitedSupplyRow`. Fixed with `pricedButtons`, and a test covers both callers.

Verified by: `tmp/town-check.mjs` on all sites in both languages, and screenshots read by the agent. Layout, playtest and mobile checks did not finish.

### Hands-off decisions
- ureview: fixed the outpost supply rows changing by accident — added `pricedButtons`, on for the town front page only.
- uplan: plan auto-approved — the user switched to hands-off after reading the plan.

- uexecute: all phases went into one commit — the pre-commit type check needs code and both languages together.
- uexecute: manager names Renata Sayle and Emil Tarn were picked by the agent — the design left them open, and the user reads them before merge.
- uexecute: Hattie's existing lines got single-word swaps without a codex call — only place names changed, and the character line process allows edits.
- uexecute: agy's Nose heading in Russian is "Огороженный двор" — "Компаунд" was too obscure, and this is the word the game already uses.

### Deferred (needs user input)
- Run `npm run layout`, `npm run playtest` and `npm run mobile` — the harness stopped them on low memory and said not to restart unasked — the user says when memory allows.
- Read all new and changed game text, in `docs/tasks/town-places.md` scope — the Goal requires user sign-off on the words — the user approves or edits them.
