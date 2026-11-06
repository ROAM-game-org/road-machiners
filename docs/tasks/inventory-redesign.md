# Inventory redesign

**Mode:** approved plan, executed in the branch `inventory-redesign`.

## Context

- The inventory confused players: buttons of different sizes held their costs as text, related facts sat far apart and the free cell chip told nothing.
- The user settled a new screen through a mockup, whose decisions are in `game/tmp/inventory-mockups/ROUNDS.md` in the main checkout.
- `game/docs/ui.md` prescribed parts of the old screen and missed about seven rules, so agents kept building it.

## Desired design

- The field screen matches mockup R3. `game/docs/ui.md`, under "The working screen pattern" and "Worked example: the inventory", describes it.
- Screens the mockup did not cover are design calls for the user to judge on screenshots: loot and a downed truck in the left well, the shop hosts with the new card, and Dump as the drop target.
- The phone keeps its stacked layout and scroll, and needs its own task.

## Invariants

- Drag, drop, rotate, plan, refit queue, touch preview and look mode behave as before.
- Shop rows keep their headline stat, which `headlineFirst()` in `src/ui/cards.ts` picks past mass.
- A click never refits the grid unless it adds cargo rows.
- `src/ui/inventory-draw.ts` owns cell geometry.

## Verification

- `scripts/layout-check.mjs` audits every pick on the start truck and the sorokonoga.
- `npm run ui-playtest`, `npm run mobile` and `npm run playtest` run one at a time, muted.
