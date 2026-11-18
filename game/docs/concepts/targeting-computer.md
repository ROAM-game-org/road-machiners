# Targeting computer redesign

The approved design for the targeting computer on the dashboard. Open [targeting-computer.html](targeting-computer.html) in a browser for the interactive mockup. It fixes the layout and the behavior. The hardware in it is drawn flat, and the game version is baked.

## Why

The old screen stranded one gun in the corner of a 3 by 2 grid. A gun was a tiny icon, a number and a round count, so the player could not tell guns apart or see why one waited. The dashboard rewrite in `832fbed0a` also dropped the Hold, Reload and Cut line keys, while `docs/wiki/mechanics/turns.md` still lets the player drop a magazine. `reloadWeapon()` and `cutPlayerLine()` in `src/sim/world.ts` exist with no UI calling them.

## The screen

The screen is always a grid of six gun cards, three rows of two, so it shows up to six guns at once. Past six, the existing page key flips pages. An empty mount shows only an unlit digit in the ghost color, so every gun keeps one fixed place.

Every card uses one strict grid and one text size, `--hud-text-s`, in the screen font `--font-hud`. The screen never uses the calculator font.

- The gun number sits on the left, centered on the card.
- The gun picture spans both lines.
- Line 1 holds the part name.
- Line 2 holds one cell per round on the left and the status on the right.

The number and the name are always dim amber, since the player reads the ammo, the status and the hit chance first. The cards sit close to the screen edges, with a wide gap between the two columns and a small gap between rows.

## Cells

A lit amber cell is a round left, and a ghost cell is a spent one. There are no bars. During a reload the spent cells fill in dim amber as the turns pass. A gun that holds fire and refills a half-empty magazine fills its spent cells the same way. Broken guns and the harpoon show no cells.

## Statuses

A card shows one status, right aligned on line 2, and nothing the screen already shows elsewhere:

- Aiming: the aimed part and the hit chance, such as cab 38%, with the chance in green.
- No target: every wait reason, such as out of arc or out of range, in dim amber.
- Reloading: any reload, whether the magazine is empty or a half-empty one refills.
- Error: broken or shut down. Only the status and the picture turn red.
- Got 'em: a harpoon whose line is out.

The target truck's name is not shown, since the truck carries the gun numbers in the world. Cooldown is 1 turn on every gun and clears in the same turn, so it has no status.

## Selection

A selected card has corner brackets in a solid dim amber, `#94672b`, so the corners never double up.

- A click on a card selects that gun alone, and a second click clears it.
- All replaces All fire. It selects every gun, and a second press clears the selection.
- With nothing selected, Reload, Hold and aiming do nothing and give the reason No gun selected, a new text entry.

## Keys

The top device and the lower box are two devices strapped together. Every weapon control sits on the top device's right column, and the lower box holds only the utilities. Keys are physical, so each key always does the same job.

- All is a wide, short red key across the top of the column.
- Reload and Hold are two icon keys side by side under it, about 1.6 times the old small key. Their names show in the hover tooltip.
- Reload drops the magazine of every selected gun that is half empty. On a harpoon with its line out, it cuts the line. There is no Cut line key.
- Hold clears the target of every selected gun and turns auto fire off.
- Auto fire keeps its label and rocker at the bottom of the column.
- A key with nothing to act on does nothing and gives its reason: Magazine full, Reloading, Broken, No target set or No line out.

The Hold icon is new: a ring with a slash, on the 16 unit icon grid. Reload uses the existing reload icon.

## Utilities

Each utility slot keeps its lamp, its tape label with the short name, such as SMK or CLTR, and its rocker. Each slot sits on a bolted metal plate in a dark warm steel with four screws. A wire leaves the plate's right side and runs down behind the lower box edge.

The lamps are green for ready, yellow for aiming and for fires this turn, and red for recharging, and off when blocked. Today `UTILITY_LAMPS` in `src/ui/dash/weapon-blocks.ts` makes a set utility green.

## Screen look

The screen has a static amber CRT look: faint scanlines, a soft phosphor glow on text and cells, a slight blur, a light vignette, rounded inner corners and a faint glass sheen. Nothing moves or flickers. The strengths in the mockup are the approved ones and become tokens.

## Baked art

Every piece of hardware is modeled in `tools/hud-bake/parts/weapons.js` and baked with `npm run hud-bake`, like the rest of the computer. Nothing is drawn flat in CSS.

- The housing margin left of the screen and above it gets about 40 and 25 plate px thinner.
- The All key, and the Reload and Hold keys, each with up and down frames, and All with a lit frame.
- One metal plate per utility slot with its screws and wire.

## Text

New English entries: All, No gun selected, no target, reloading, error and got 'em. Every Russian entry comes from agy, as `CLAUDE.md` requires. The Russian words in the mockup are placeholders.

## Build steps

1. Bake the new hardware in `tools/hud-bake/parts/weapons.js` and update the boxes the game reads.
2. Port the reload and hold logic from `832fbed0a~1:game/src/ui/weapons.ts`: `reloadBlock()` and the hold action. Reload on a harpoon calls `cutPlayerLine()`. Gate both by `ordersLocked()` in `WeaponOrders` in `src/ui/weapons.ts`.
3. Replace the single picked gun with the selection above, so All selects every gun and a second press clears it.
4. Extend `GunCellView` in `src/ui/dash/weapon-blocks.ts` with the name, magazine, refill cells and one of the five statuses. Fill it in `gunCell()` from `getWeaponReadout()`.
5. Rebuild `GunCell` and the grid in `WeaponsPanel` as cards, and restyle `.gun-screen`, `.gun-grid` and `.gun-cell` in `src/ui/styles/dash.css`.
6. Delete the stale `.weapon-hold`, `.weapon-reload` and `.weapon-cut` selectors in `src/ui/styles/base.css`.
7. Update the fixture views in `src/ui/dash/atlas.ts` and the pattern in `docs/ui.md` section 4.5.

## Checks

- `npm run typecheck` and `npm test` from `game/`, with tests for the key reasons, the select-all case and the harpoon cut.
- `npm run layout` with the dev server running, which fails on clipped Russian and pseudo-long text.
- In the running game, empty a gun and watch the cells refill, press Reload on a half-full gun, press Hold, and cut a harpoon line with Reload.
