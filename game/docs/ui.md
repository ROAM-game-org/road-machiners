# UI design system

The HTML UI and the in-world overlays share one look: warm ink on dark metal, Barlow Semi Condensed for words and IBM Plex Mono for numbers.

A design system has three layers. Principles say what the UI is for and how to judge it. Patterns say how a kind of problem is solved every time, like a shop row, a disabled button or an alert. Tokens and shared pieces say what it is built from. A person or an agent who builds a new screen follows all three, so it makes the same choices as the screens before it.

Every change a player sees in the HTML UI or an overlay goes through this document: a new screen, panel, tooltip, notice, button, label or line of UI text. Start with section 13, "How to build a screen". A change that breaks a principle names it and says why. A new or changed principle needs the user's approval. A new pattern or shared piece is added here in the same change, so the next screen can reuse it.

Open <http://localhost:5173/ui.html> with `npm run dev` to see every token and shared piece drawn with the real CSS.

## 1. What the UI is for

The source is DESIGN.md: the game shows what the player needs to decide and hides what they should discover. Every rule below comes from that sentence or from another line of DESIGN.md.

The UI serves decisions, not data. A screen exists because the player makes a choice there. A fact is on screen because that choice needs it.

## 2. Principles

Each principle has a reason from the game and a test you can run on a screenshot.

P1. Start from the decision. Before a screen gets a layout, write the question the player answers there and the facts that answer it. Test: every element on the screen answers that question or helps act on it.

P2. Key facts are never one step away. A fact the player needs to choose now is visible without a hover, a click or a scroll. Test: cover every tooltip and closed panel, and the choice can still be made.

P3. The world is the main screen. Most choices happen with the cursor on the map: where to drive, who that is, whether to fight. So the card under the cursor is the most important panel in the game, and the HUD stays at the edges. Test: the center of the screen is free during planning.

P4. State on the HUD, events in the log. A state stays visible while it is true. An event is told once, in order. Test: nothing the player must track lives only in the log, and the log holds no mechanical state.

P5. Every number can explain itself. DESIGN.md says chances are shown with their causes. The cause lives on the number: hovering the number opens it in the shared tooltip, and a dotted underline marks a number that has one. The cause is reference, so it is not repeated in the glance view. The same holds for a price the player cannot pay, a button that does not work and a stat that will change. Test: hovering any chance shows its cause, and no disabled control lacks a reason.

P6. Show what the truck knows, no more. Information is a resource. The UI shows a fact with the certainty the player has. A vague contact looks vague and an unknown driver looks unknown. A fact a perk reveals is absent without the perk. It is not a locked slot, because DESIGN.md says no hand-holding and a slot is a hint. Test: no screen shows a value the player's truck could not know.

P7. Show it, don't say it. A drawing, an icon or a position carries meaning on its own. A word never repeats it, and a detail never repeats its row. Test: delete each label in turn and ask whether anything was lost.

P8. One thing, one look. The same fact kind prints the same way on every screen. The same state looks the same on every control. One icon means one concept. Test: money, condition and selection look identical in the shop, the inventory and the HUD. One deliberate exception: on both truck drawings, the condition panel and the truck card, a healthy part keeps its own color and only damage gets a tier color. The drawings show no green for a healthy part, because a green wash hides the look of a rendered truck and only damage is news.

P9. Planned and committed look different. Planning is free and a turn is a commitment. The player must always see which marks are still a plan. Test: a screenshot taken mid-plan and one taken mid-turn are easy to tell apart.

P10. Two voices, never mixed. Radio talk, dialogue and story lines are in character and never talk about game systems such as the turn, tiers or quests. The words keep their everyday meaning, like "the road turns". Labels, buttons, tooltips and tips are game chrome and may. Test: every text channel has one voice.

P11. Restraint. Color, size and weight carry meaning, so each is used for one job. One emphasis at a time: a word is bright or bold, never both. Decoration never uses a meaning color. A fact is said in color once: a hostile tag and a red relation line are two reds for one fact. Labels never use the accent, so the accent always means the player's choice. Emphasis follows the value, not the slot: values of one kind share one size, a high value is brighter and a zero is faint. A panel uses at most four text roles: title, body, caption and value. Test: on a grayscale screenshot the hierarchy still reads, and in color every colored thing means something.

P12. Space follows structure. A fact gets room in proportion to its importance. Related things sit tight, and groups are separated by space, not by lines or headings. A label that a unit, an icon or a position already makes clear is dropped, and a phrase that every row shares is said once. A panel that cannot scroll grows sideways before it grows down. A fact sits next to the thing it describes. Groups are split by space. Inside one list, the faint `.row` hairline between rows is fine. Test: no line splits one group from another, and no empty block is larger than the facts beside it.

P13. Everything sits on a grid. A panel has a head row and one or two columns below it. A column that holds a drawing has a fixed width. The column edges never depend on content, so the same panel has the same edges for every truck, part or place. Every left edge sits on a column line. Every number and every tag ends on the right edge. Side by side columns start on the same row. Vertical space has two steps only: tight within a group and wide between groups. Test: draw the column lines over a screenshot, and every element starts or ends on one.

P14. One kind of panel, one size. A panel's width, height and drawing box are set by its kind, never by its content. The size is set for the largest content it must hold, and smaller content leaves space at the end of a group, not between groups. Controls keep a fixed place, such as the bottom of their column. Test: two instances of the same panel with different content have the same outline.

P15. Separate lists that mean different things. Two lists the player must not confuse each sit in their own well. The well edge and the value ink carry whose list it is, such as a danger edge for the guns aimed at the player. Test: at a glance, without reading the heads, the player can tell which list is which.

P16. A tooltip is a small panel. It follows every rule above: text roles, grid, one name per concept and value-driven emphasis. It opens on the thing it explains, so it never repeats that value or restates what the panel around it already says. Its body is label and value rows, with labels in the UI face and values right aligned in mono. A breakdown speaks in the unit of the number it explains. It starts with Base and then adds one cause per row, so the rows add up to the number on screen. An internal unit, such as degrees of scatter, never reaches the player. The sim gives the steps, as `chanceSteps()` does for hit chances, and the UI only prints them. Base is muted ink, a step that lowers the number is in danger ink and a step that raises it is in good ink. A tooltip is as wide as its content, and it opens over the part of its panel that is not needed while it is open, never over a value the player is comparing. Words match the panel it opens from, so a cause called far on the card is never called range in the tooltip. Raw engine terms and debug strings never appear. Test: every number in the tooltip is in a unit the player already sees elsewhere, and the tooltip uses the same word as the card for each cause.

P17. Never narrate the screen. Text is allowed only when it adds a fact the screen does not already show. A word never restates a number, whose number it is, or which way it points, when position, color, grouping or the element the cursor is on already says it. A heading never names what its content plainly is. This is DESIGN.md's no hand-holding, applied to every label. Test: delete the text. If the player can still answer the same question from the screen, the text was hand-holding and stays deleted.

P18. The world is the most precious space. Every pixel a panel covers hides the desert, the trucks and the road. A panel takes the smallest area its content needs. It sits at the screen edge, never in the middle of play, and it opens only while it is needed. Transient overlays such as tooltips fit their content and never cover a value the player is comparing. A wider or taller panel needs a reason in the decision it serves. Test: in a field screenshot with every always-on panel shown, the center of the screen is clear, and no panel has an empty block wider than its content column.

P19. Controls are physical things. The truck's own controls look like hardware in a cab: toggle switches, knobs, keys and LCD displays like an old Casio. A setting that stays on is a switch, a level is a knob, and a readout of the truck is a display. A flat button is for a one-time action, like Buy or End turn, and for screens that are not part of the truck, like the menu. A new truck control picks the nearest existing piece in `drawings.css` before it gets a new look. Test: every control on the truck's HUD looks like something you could touch in a cab.

## 3. Information tiers

Every fact on a screen belongs to one tier for the decision that screen serves. The tier decides where the fact goes, how big it is and when it shows. The same fact can be key on one screen and supporting on another. Price is key in the shop and absent on the map.

| Tier | What it is | When it shows | How it looks |
| --- | --- | --- | --- |
| Key | Needed to choose now | Always, at every density | Value role, full ink, first after the name |
| Supporting | Helps compare or confirm | In the same view, at row and card density | Body or caption role, muted ink, after the key facts |
| Reference | Explains a rule, a cause in depth or the lore | On hover, on open or in help | Tooltip, open detail or the help panel |
| Ambient | Mood with no decision | Any time | The radio, flavor text, the world itself |

- A key fact never lives only in a tooltip, only in color or only in the log.
- A screen shows at most a few key facts. When everything looks key, nothing is. If a screen has more, split the decision or move facts down a tier.
- Supporting facts sit after the key facts in reading order and are visibly quieter.
- Reference text is never needed to act. If the player has to read a tooltip to choose, that fact is key and moves up.
- Ambient elements never carry a fact the player must act on.
- Moving down a tier is how a screen gets simpler. Deleting a fact is better still.

## 4. Where things go

### 4.1 Placement rules

- A thing in the world is labeled in the world. A place is the exception. Its walls, gate and pads show it, and its name lives on the map, the minimap and the town page, never as a plate over it in the world.
- The state of my own truck lives in the HUD.
- A comparison between my truck and another lives on the cursor card.
- An explanation sits next to the number it explains, inside the same block.
- An action sits at the end of the line it changes. A Buy button is inside its row. The turn commits at the bottom right.
- A choice the game waits for opens a notice at the top center and stops nothing else on screen.
- A task that takes the whole attention, like a shop or a save, opens a modal in the center.
- The quest page and the `.ink-page` take the layer above the instruments and the log, and those hide while one is open, so nothing of the HUD lies over a page. The call notice still shows over it, since a call waits for an answer.
- A look screen over a scene: while a talk window or page scene is on view, I, C and J open the inventory, character screen and journal over it in a look-only state. The screen lifts to `--z-over-scene`, with its own scrim, and its world controls are off with one reason, "Not during a scene". Escape closes it and the scene stays at the same paragraph. The Menu button stays on view above the scene (`--z-feedback`), and its save, load, options, help and report panels open over the scene and take every key while they are open; the scene lets the keys through then. On a phone the bar is hidden under the scene, so the scene window shows a row of three icon buttons (`.quest-look`) in its top corner for the same screens.
- The game menu may hold a rare world action that is a way out, not a truck control, like Get unstuck. It is a flat menu button, and when the sim would refuse it the entry is off with that reason in the shared tooltip, read from `unstuckBlock()`.
- A modal that is the only thing the player can do at that place keeps no Leave button, and its one way out is its action button. The outpost screen behind shut gates is the case: Drive on closes it, and neither Escape nor the game's close-all does. The Menu button stays over it, in the corner the Leave button would take, so saving, options and help stay reachable.

### 4.2 Zones

The screen has fixed zones. Each zone has one job, and an element never moves between zones. A new element goes in the zone whose job it shares. If none fits, the element is probably not always-on and belongs in a panel the player opens.

| Zone | Job | Lives there |
| --- | --- | --- |
| Top left | System, then the map | Feedback button, then the minimap |
| Top center | Transient and waiting | Action bar at the edge, toast below it, then notices and tips |
| Top right | System, then the cursor card | Menu at the edge, the hover card below it |
| Right side | Ambient and waiting on | Radio, then contracts |
| Bottom right | Events and commit | Log above End turn, one stack |
| Bottom left | My truck | Truck diagram, then the hauler gauge, above the instruments and the weapons bar |
| Center | Task | Modals, dialogue, save and new game |

Two zones may never cover each other. A new element that needs room takes it from its own zone.

The boot screen draws the sign of the six words from [The end of the Old World](lore/old-world-end.md) above the game title. `src/render/sign.ts` owns its shapes, and `index.html` holds a copy that a test keeps equal. The sign builds up with the load: nothing before a fifth of it, then Spiral, Race, Exodus and Chaos at each next fifth. Each stage fades in and holds for half a second before the next one, so a fast load still shows every stage. The whole sign holds for a second before the boot screen fades out. With reduced motion, the boot screen leaves at once. The sign carries no text and is hidden from screen readers, since the progress bar already says how far the load is.

Before boot builds a world, the start menu fills the screen alone, with no zones. It shows the game title in the boot screen's title style over one column of large buttons: Continue, Load, New game and Options. A caption under Continue names the save it resumes with the Load row's pieces: slot, mode and game clock, or "Old or damaged save" in danger ink, with the real date in its tooltip. Continue and Load are off with no save, and focus starts on the first button that is on. Load opens the save list over the menu, and a pick there loads at once with no confirm. New game opens the New game screen over it.
### 4.3 The always-on budget

The always-on HUD answers a short list of questions without a click: can I keep going, is my truck okay, what is around me, what will this turn do, what just happened and what am I waiting on. A new always-on element names the question it answers. If it answers none, it goes in a panel.

### 4.4 Phone layout

`#ui.phone` is a small UI layer: at most 560px wide or 480px tall, counted in the layer's pixels (see "The UI layer" below). `src/ui/input-mode.ts` owns the threshold and sets the class, and `phone.css` holds every rule under it. A desktop window above the threshold keeps the layout of 4.2. The phone layout answers the same always-on questions on a screen a quarter of the size.

- The top row holds Menu at the right, inside the safe area, with nothing else and nothing at the left. Report a bug or request a feature is a Menu entry on a phone. The action bar, toast, notices and tips sit under it at full width.
- The bottom bar holds four drawer tabs (`.drawer-tabs`) that show the drawer's word, the speed dial, every LCD readout including health, the action buttons and End turn, all always on. The readouts sit right of the dial on a fixed three by three grid with a named cell each, so a readout never moves when another is absent: health, fuel and supplies, then engine, heat and weather, then money, the clock and the run readout. The action buttons make one touch-height row with centered labels, and their switches drop the drawn lever. Desktop and phone both keep the key off the button face (see 12). End turn has a fixed narrow width and no icon. The log strip (`.log-strip`) is one row with the newest log line, cut with an ellipsis and with the whole line as its title. It sits right above End turn: in portrait across the width above the tabs and End turn, in landscape over the right half above the bar. A tap on it opens the Log drawer like the tab, and the bar grows by the strip and one gap, so drawers open above it. In portrait the instruments take their own block above the tabs, and the tabs share the width End turn leaves.
- A drawer holds what the bar does not: Truck (the truck diagram and the hauler gauge), Guns (the weapons), Radio (the radio and the contracts) and Log. One is open at a time. A tap on its tab opens or closes it, and a tap on the map leaves it open, so the player can aim with Guns open. In portrait a drawer spans the width above the bar. In landscape Truck and Guns open over the left half and Radio and Log over the right half. A drawer scrolls inside and is never taller than the space between the top row and the bar.
- The Guns tab takes the danger edge while the player is in combat. This is the attention level of 7, a mark that stays while the state is true. Nothing opens by itself.
- The cursor card is right-aligned under the top row and ends one gap above the bar, the drawer or Center on truck under it. It scrolls inside. When the truck can be aimed at, it grows left to the layer width in portrait or a drawer's width in landscape, and down to its drawing's need, so its aim targets reach `--touch-target`. A tap that pins a truck never clicks the card that opens under the finger.
- A modal fills the viewport inside the safe area and scrolls inside, with its close button in view. The head of the town, inventory, character and journal screens wraps: the title and the screen's own controls on the first row, the chips on the next, and a chip never breaks inside. The character screen stacks each skill into one block. The bar and the drawers hide while one is open, and while Options is open.
- Drawer state lives in the UI and is not saved.

This layout bends three rules, and each is a new pattern, not a changed principle. P19, controls are physical things: the action switches drop their lever, since a button 40px wide cannot hold a lever and a word, and the word already names the state. The switch keeps its metal plate. P2, key facts never one step away: the diagram, the weapons, the radio and the log are one tap away (the newest log line is still on screen in the strip), since a 390 by 844 screen cannot hold them without covering the playfield, which breaks P3 and P18. The key facts for the turn stay on screen: the speed dial, the readouts, the health, the action switches, End turn and the action bar. 4.2, an element never moves between zones: in portrait a drawer spans the width. It keeps the content and the job of its zone, but not the edge.

### 4.5 The UI layer

Options holds the device settings: language, UI size, the minimap, the camera and sound. Sound is the four volume knobs (music, wind, effects, interface) and the mute switch, drawn as the radio's hardware, since a level is a knob (P19) and the same piece looks the same everywhere (P8). The radio keeps only the mute switch and the next key. `SoundSettings` in `src/ui/sound.ts` owns the levels and the mute, and every `OptionsPanel` is built with it. The minimap is Off or On (see `.map-view`). The camera is Auto or Centered, and `src/ui/camera-setting.ts` keeps it in local storage, never in the save. V flips it, and an open row follows. UI size is 80%, 90%, 100%, 115% or 130%. It is kept in local storage, never in the save, and applies at once. `src/ui/ui-size.ts` owns it. At a size other than 100%, `#ui` and `#overlay` are laid out in a box of the window divided by the size and scaled up or down from the top left corner, so every pixel value, the drawn hardware and the map labels scale together. At 100% no transform is set. The boot screen and the crash screens stay at 100%.

- The layer, not the window, is the screen. The layer must stay at least 640 by 360 (long side by short side). A size that would make it smaller is off in Options with the reason "Too big for this screen", and the game applies the largest step that fits, at most the stored pick.
- `input-mode.ts` sets `phone`, `slim` (480px wide or less), `narrow` (720px or less) and `compact` (1100px or less) on `#ui` from the layer size. CSS breakpoints are these classes, never a width media query. Orientation queries are fine.
- CSS never uses `vw`, `vh`, `dvh`, `svh` or `vmax`. It uses `--layer-w` and `--layer-h`, which are the window divided by `--ui-scale`. `--safe-*` divide the device inset by the same scale.
- `--touch-target` is `max(32px, 32px / --ui-scale)`, so a touch target is never under 32 real pixels.
- Code that sets `left`, `top`, `width` or `height` from a screen rect or a pointer converts through `uiSize()`: `layerRect()`, `layerPoint()`, `toLayer()` and `layerSize()`. Comparing a screen rect with a screen rect or a pointer needs no conversion. A new UI calculation never reads `window.innerWidth` or `innerHeight` for placement.

## 5. Entity anatomy

Parts, trucks, drivers, goods, contracts and places appear on many screens. Each has three densities with fixed slots in a fixed order: identity, then state, then key numbers, then cost, then action.

| Density | Use | Shows |
| --- | --- | --- |
| chip | Inside a sentence, a list of many, a slot | Identity only: icon and name |
| row | A list the player compares | Identity, key facts, cost, action |
| card | One thing the player studies | Everything key and supporting, reference on hover |

- A slot keeps its place at every density. A density drops slots from the end, never reorders them.
- A missing or unknown value keeps its slot empty or marked unknown. The layout never shifts.
- Numbers right align in fixed width columns in the mono face, so a list reads down a column.
- The open detail of a row adds facts. It never repeats one.

## 6. Interaction states

One grammar for every control and every selectable thing.

| State | Meaning | Look |
| --- | --- | --- |
| rest | Can be used | Surface and line tokens |
| hover | Under the cursor | Hover line and hover surface. Only things that react to a click change on hover. |
| focus | Keyboard focus | One accent outline everywhere |
| selected | The player's current choice | Accent border and accent wash |
| planned | A choice that is not committed yet | Dashed accent outline |
| working | Timed work in progress | Accent progress meter |
| disabled | Cannot be used now | Dimmed, with its reason |
| unaffordable | Needs more money | Price in danger ink |
| locked | Needs progress, like a rank | Lock icon |

- A control uses only the states in this table.
- A screen that is only for looking, like the inventory over a scene, gives every control that changes the world the disabled state with one reason read from one function (`lookReason()`), before any reason of its own.
- A disabled control still takes hover and focus, so its reason can show. It uses `aria-disabled` and the shared tooltip, and the reason is one short fact like Need 12 M more.
- Unaffordable and locked look different, because the player fixes one by earning and the other by progressing. A locked switch shows the lock icon in place of its lever, and a locked instrument button puts it before its word. Both give the rank they need as their reason.
- Touch has no hover, so it fills the gap. The first tap shows what hover would show: a tap on a truck only pins its card, and a tap on a point utility only sets its marker. A tap on the thing already shown does what a click does. A long press of 500ms on a control opens what hover opens, its title or its reason, and a tap on a disabled control opens its reason. A mouse click on a disabled control opens the same reason in the shared tooltip at the cursor, and the hover reason hides while it is open. The ground needs no preview tap, since a plan is free and the drawn path is its preview. In the inventory, a tap on an item selects it, a tap on the grid shows a placement preview there, Rotate turns the preview, and a tap on the preview places the item. A long press on the ground is Shift-click. `#ui.touch` is the primary pointer being coarse, and it only decides what the screen shows: no keycaps in labels or titles (`keyLabel()` in `src/ui/input-mode.ts` adds one off touch), the Call, Mark, Horn, Rotate and close buttons, and touch wording in tips and help. Under it the small button is 32px and a click target is at least `--touch-target`.
- A click target is at least the small button height, 24px. The aim target of a part on the truck hover card follows this rule too, with `--touch-target` on a phone, so the card grows to give its drawing room. A part's hit area is its own drawn pixels, plus the body and deck pixels over its grid cells. Armor also takes the box it is drawn in, since plates sit outside the cells. A drawn part wins over the cells under it, so the part under the pointer is the part you see. The cell map is rendered once per truck build. Other drawn hardware is exempt and keeps the size of its drawing.

## 7. Feedback and alerts

Every event gets a level before it gets a channel. A level fires on its channels and on no others.

| Level | Meaning | Channels |
| --- | --- | --- |
| info | Worth a record | Log line |
| notable | Worth a glance now | Log line and toast |
| attention | A state the player must watch | A mark on the HUD that stays while true, and one log line when it starts |
| choice | The game waits for the player | A notice with its buttons |
| critical | The run changes | Full screen |
| refusal | A command the rules turned down | The toast in danger ink, with no log line. A modal shows it on its own status line. |

- A state alert lives on the HUD for as long as it is true. The log only records that it started.
- A notice always has the controls to answer it. A notice with nothing to press is not a choice and drops a level.
- Sound follows the level, and every sound follows `docs/sound.md`.

## 8. Words and numbers

- A unit is written once per value and in one style. Money is whole M's. Fuel is L. Mass is kg. Speed is km/h. Work and cooldowns are in turns. Deadlines are game hours.
- `src/ui/units.ts` owns money. On a screen, money is `moneyEl()`: the M's coin, then the number. In a sentence, a log line or a title it is `moneyText()`, as "1 M" or "15 M's". A button with a price uses `pricedEl()`, as "Buy" then the coin and the number. Debt is a negative amount with a real minus sign, in danger ink. A change in money prints through `moneyDelta()` as "+15 M's" or "−15 M's". A test fails when a screen builds money text by hand.
- A count of turns prints through `turnsText()` as "2 turns". Value and unit are plain text, never "2t".
- Each fact kind has one formatter in `src/ui/format.ts` or `src/ui/units.ts`, and every screen calls it.
- A number that the player's choice will change shows its after value before the choice, like the truck's mass before a buy.
- A label is a noun. A button is a verb. A reason is a short fact.
- Every UI word costs. Use the fewest words that stay clear, such as You and Them for the two gun lists.
- No arrow characters as connectors in UI text, such as You → it. Name the thing in words. An arrow is allowed only as the name of an arrow key.
- A tip says one thing to do in one sentence.
- Check tips, help text and reasons against the [Humanizer](writing/humanizer.md). A label stays a noun and a button a verb.

## 9. Visual language

| Channel | One job |
| --- | --- |
| Accent mustard | Selection, focus, progress and the player's choice |
| Danger | Loss, hostility and failure |
| Good | Gain, health and success |
| Ink levels | Text hierarchy only, never a state |
| Size | Tier: key facts larger than supporting ones |
| Weight | Names and titles only |
| Dashed line | Provisional: a plan, or knowledge that is not exact |
| Flood fill | The thing under the cursor or selected, never a whole diagram |

The own truck's condition panel and the truck card show one picture, the real truck rendered from above. The camera is tilted 25 degrees and the front of the truck is at the bottom. The picture is rendered once per truck build, never per frame, and it uses the same wheel positions and armor as the truck in the world. It draws only the parts that have a condition: the core parts, the engine, the guns and the armor. Cargo, spare parts and other gear stay off it, so loading cargo never renders it again. The body and the cab are drawn clearly darker than the parts, in their own hue, and the parts show their true paint, so the parts read first.

The picture is built in the background while the truck is in sight, so a card finds it ready. A card whose picture is not built yet shows everything else at once and keeps the picture's box, sized from the chassis, empty with no word or spinner. It takes no click on a part until the picture lands. A rebuilt picture, after a refit, keeps the old one on screen until the new one is ready.

A healthy part keeps its own color. Guns, tires and armor get a thin dark edge, so each reads as its own shape over the body, and a gun painted like the body still shows. Tires also get a lighter rubber tint and armor a steel tint. Only damage gets a tier color on both drawings: yellow under 70%, orange under 40% and red when broken. A damaged part glows: it is tinted in its tier color and gets a soft halo of that color, so a thin gun still reads. A broken part also gets a light hatch. This is a deliberate break of P8, which asks that one state looks the same on every control. A green wash hides the look of a rendered truck, and only damage is news.

Hover shows the part name and its condition in a tip, on both drawings. The part under the pointer gets an outline and a light fill over its cells. On a truck that can be aimed at, a click aims at it. On touch, the first tap shows the tip and a tap on the part already shown aims. The gun marks and the repair meter sit at the middle of their part. A part that has no pixels in the picture, like the transmission and the tank on a chassis that does not show its cores, shows on the body over its cells. The panel is black at 30% opacity with a 6px blur of the game behind it, with no border and no shadow.

World colors keep their meaning in the 3D view. The UI does not reuse the cold cyan of dead ship tech or the green glow of the reactor.

## 10. Where styles live

- `src/ui/tokens.css` holds every raw value: colors, fonts, type sizes, spacing, radii, shadows, layers and UI sizes. It is the only file that writes one.
- `src/ui/style.css` imports the tokens, then the files under `src/ui/styles/`. Its import order is the cascade.
- `src/ui/styles/components.css` holds the shared pieces below. Each other file under `styles/` holds one screen area and adds only its own layout.
- `src/ui/styles/drawings.css` holds drawn hardware: the switch, the speed dial, the volume knobs of Options and the radio keys. Its shapes keep their own sizes, and its colors still come from tokens.
- `src/ui/tokens.ts` reads `tokens.css` for Three.js. `tokenColor("--path-plan")` gives a color number and throws on an unknown name.
- `src/ui/style-guard.test.ts` fails on a raw value outside `tokens.css`. It reads every file under `styles/`, `truck-condition.css`, the HTML page and the inline styles of the UI and overlay scripts.

## 11. Tokens

Name a token by its role, like `--ink-muted` or `--panel-l`, never by its value. Use the nearest token. When a value falls halfway between two steps, take the smaller one. Add a token only when two or more places need a value no token gives.

- Type: `--font-ui` for words and `--font-mono` for numbers and readouts. `--font-lcd` is the slanted fourteen-segment Casio face for the HUD clock and the LCD readouts beside the dial. It has Latin letters only, so the day label D stays the same in every language, like WOT RADIO. The time has faint unlit segments behind it. Six sizes only: `--text-caption` 10px, `--text-dense` 12px, `--text-body` 14px, `--text-lead` 16px, `--text-heading` 24px and `--text-hero` 40px. HUD panels and data use `--text-dense`. Modals and dialogs use `--text-body`. Quest text and its choices, in the talk window and the page view, use `--text-lead` at line height 1.55, since they are read as prose. Quest choices wrap and align left. A new size needs the user's approval. The boot gate holds the first paint of text until the faces of the language load, capped at 2.5 s, so text never swaps its face; after the cap the fallback shows.
- Surfaces from dark to light: `--surface-sunk` for wells and tracks, `--surface-well` for inputs, chips and tiles, `--surface-dock` for the right dock, `--surface-panel` for panels and dialogs, `--surface-highlight` for a hovered row, `--surface-raised` for buttons and notices, `--surface-hover` for a hovered button. Overlays over the 3D view use `--surface-overlay`.
- Lines from faint to bright: `--line-faint` between rows, `--line-soft` around chips and tiles, `--line` around small controls, `--line-strong` for the edge of a panel and a button, `--line-bright` for the frame of a dialog or notice. `--line-hover` edges a hovered control.
- Text: `--ink` by default, `--ink-bright` above it, `--ink-title` for headings, `--ink-label` for table heads and small labels, `--ink-muted` for secondary text, `--ink-faint` for an option that is off. `--ink-overlay` is the text over the 3D view. `--ink-on-accent` is text on an accent fill.
- Accent marks selection, focus, progress and the player's choice: `--accent`, `--accent-bright`, `--accent-warm`, `--accent-dim` for utilities, `--accent-deep`, and `--accent-wash` for a light fill.
- Danger marks loss, hostility and failure: `--danger`, `--danger-bright`, `--danger-ink` for text, `--danger-deep`, `--danger-dark` and the `--danger-well` fills. `--alarm` is the part that is about to break.
- Good marks gain, health and success: `--good`, `--good-bright`, `--good-deep` and `--good-well` for a meter track.
- The condition ramp `--cond-pristine` to `--cond-junk` colors part condition and must fall in brightness. A test checks it.
- `--cell-*` colors the truck grid in the inventory and `--map-*` the small grid on truck cards. The cargo bay cell `C` of the semi has its own look: a green hatch in the inventory (`--cell-bay`, `--cell-bay-line`) and a flat green on truck cards (`--map-bay`). It differs from the deck cell, so the grid shows by itself that a gun has no place on the hauler.
- `--path-*` colors the path preview on the ground through `tokenColor()`.
- `--steel-0` to `--steel-11`, `--lcd-*` and `--dial-*` color the drawn hardware only.
- Spacing steps run `--space-1` 2px to `--space-10` 32px. Padding, margin and gap use them. A 1px hairline and 0 stay raw.
- `--radius-s` and `--radius-m` round corners. A circle stays `50%`.
- `--icon-xs` 12px to `--icon-hero` 56px size icon boxes. `--icon-sign` 112px sizes the sign on the boot screen. `--meter-s`, `--meter-m` and `--meter-l` set bar heights, and `--pip` sets a rank pip or a footprint cell.
- Panel widths are `--panel-s` 260px, `--panel-m` 300px, `--panel-l` 420px and `--panel-xl` 520px. `--dock-width` is the right dock, and it narrows on small windows. `--modal-width` and `--modal-height` cap a modal.
- Phone layout: `--safe-top`, `--safe-right`, `--safe-bottom` and `--safe-left` are `--hud-inset` or the device inset divided by the UI scale, whichever is larger, and place every HUD zone. `--touch-target` is the smallest touch target, 32 real pixels. `--ui-scale` is the applied UI size, and `--layer-w` and `--layer-h` are the window divided by it. `--phone-readouts-h` is the height of the readouts in the bottom bar, `--phone-bar-h` is the bar with its tabs, `--phone-strip-h` is the log strip, `--phone-end-w` is the width of End turn and `--phone-tab-w` the width of a drawer tab in landscape.
- `--lcd-cell-w` is the minimum width of an LCD readout cell beside the dial, 88px, and 0 in the narrow layer.
- HUD placement: `--hud-inset` from the window edge, `--hud-gap` between HUD panels, `--hud-hover-top` for the hover panel and `--hud-notice-top` for notices.
- Layers run `--z-hud` to `--z-crash`. A new layer goes between two others in `tokens.css`, never as a raw number.

## 12. Shared pieces

Use a shared piece before writing a new rule. A screen may add its own layout to a piece, but not its own colors, type or frame.

- The instrument button is the desktop pattern of the bottom left instruments and the weapons head. A switch (`button.switch`) and a flat instrument button are one line at `--btn-h-s`: the lever, or the lock icon of a locked one, sits before the word. The lever is drawn at half scale and the plate keeps room for both rivets. The key leaves the face and shows on hover through `keyLabel()`, and in the help panel (P7). Horn shows on touch only. The readout cells of the instruments grid are at least `--lcd-cell-w` wide, sized for four-digit money, so their edges do not move with the truck's values (P13). The narrow layer drops the minimum, since it wraps the button row instead. The clock keeps its two cells with the day and the time together in the middle.
- `.map-view`: the canvas of the map painter in `src/ui/map-view.ts`, always compass north up, turned to match the fixed 3D view, so the square map shows as a diamond. The whole map at its fitted zoom covers about half the drawing, with empty corners, which P18 accepts because zoom and pan reach every tile at full size. It marks only explored and charted ground, towns and places whose ground is explored or charted (a square for a town, a dot for a place, named once found and "???" until then) and rumored wrecks (a dashed ring, since dashed means knowledge that is not exact). Every view prints the map grid over the whole sheet, explored or not: 8 by 8 squares (`src/sim/map-grid.ts`) in thin solid lines of `--surface-sunk` ink at partial strength, over the ground and under the chart sheets, marks and names. The grid turns with the map, so its lines run diagonally. Columns take letters along the upper right edge of the drawn map, A to H from the top corner toward the south-east (А to З in Russian), and rows take numbers 1 to 8 along its upper left edge, toward the south-west. Each label is a `--text-caption` word in `--ink-muted` on a small `--surface-overlay` plate, letters in the UI face and numbers in mono, on its column's or row's middle line, at the first visible point from the top corner, so it stays on screen as the map zooms or follows the truck. A label drops when a plate or mark is in its way. On the minimap the labels sit inside the band of the edge-pinned marks. Every square looks the same: nothing on the map marks a contract place or the square its clue names. Unexplored land is bare paper, darker than any explored ground, like the blank part of a sheet not drawn yet. Explored ground is painted through the quest-art look: the ground colours go through the rust-to-cream ramp in 12 steps with part of the original colour and a light grain (`paintBase` in `src/render/minimap-paint.ts`, whose ramp a test keeps equal to `tools/quest-art/post.py`). The truck is a `--ink-bright` arrow in a dark ring, and only the selected chart sheet takes the accent. Three views use it:
  - The Map tab of the character screen. K or the Map instrument button, right after Driver and shown only where the exploration map exists, opens the character screen on Map and C on Skills, and the same key or button closes it. The tabs sit in the head row after the chips, with the − and + zoom buttons at its right. The map fills the body below. The wheel zooms around the cursor by how far it turns, so a trackpad swipe is gentle and a notch is one 1.25x step, the buttons double or halve the scale, and a drag pans. Zoom runs from the whole map to 8 px a tile, and the pan keeps the view centre inside the map. Each open starts at the whole map. Each place has its name beside its mark on a `--surface-overlay` plate, placed right, left, below or above, whichever overlaps no other mark or name.
  - The minimap, off by default. Options turns it on, and `src/ui/minimap-setting.ts` keeps the choice in local storage, never in the save. It is a square `.panel` in the top left zone with a head row of − and + (50, 100 or 200 tiles from centre to edge) and the log's ⤢ expand mark, which opens the Map tab like a click on the drawing does. It follows the truck. A known place past its edge sits on the edge in its direction, drawn smaller, and hovering a mark shows the place's name in the tooltip. It hides on a narrow UI layer, 720px wide or less, where the top-centre notices span its place.
  - The Charts tab of a chart town, the whole map fitted with each sheet for sale as a diamond.
- `.panel` is the base of every HUD box: panel surface, strong edge, shadow and the standard padding of `--space-4` by `--space-5`. The radio, the instruments and the weapons are drawn hardware and use the compact padding of `--space-2` by `--space-4`. Only the help panel sets its own, since its rows carry their own margins.
- `.dialog` frames a modal, the save panel and the New game screen, with the scrim over the game and padding of `--space-9` on every side.
- `.dock-panel` is a panel of the right dock: the log, the contracts and the radio.
- The desktop right dock scrolls inside when held contracts exceed the space above the log and End turn. The phone Radio drawer uses its existing scroll area.
- `.notice` is a box at the top middle of the HUD that waits for a choice: rescue, stranded and dialogue.
- `.crash-screen` is the critical full-screen surface for a crash, missing WebGL and files that did not arrive. It holds `.crash-title`, the lines, an optional `.crash-reload` button that takes focus and a `.crash-hint` detail.
- `.panel-title` is the heading of a small HUD panel. A dialog uses a plain `h3`.
- A text button has one of three heights: `--btn-h-s` 24px, `--btn-h-m` 32px and `--btn-h-l` 44px. A plain `button` is medium. `.btn-s` makes a small one for rows, cards, table cells and small panels. `.btn-l` makes a large one for a screen's main choice. `.btn-danger` marks a hostile action. `.on` marks a pressed toggle.
- Only `components.css` sets a button's height, padding or type size. A screen file places a button and sets its width. The small group of buttons that size themselves are tiles and drawn hardware, and the list is in `components.css`. A new button joins a size, and the guard test fails when a screen file sizes one.
- `.tabs` is a row of medium tab buttons, and `.tabs.sub` the small row inside a tab.
- `.row` is a list line with a faint line under it. `.tile` is a boxed list item edged in its `--tone`.
- `.skill-level` is a row of small pips that fill from the left for a level out of a few: a skill rank, and an escort offer's danger (`.skill-level.threat`, three pips, with the level in its tooltip).
- `.chip` is a small boxed value. `.tag` is an outlined word in the color of its text.
- `.contract-clue` is one told clue per survey place still open, on its own line under its contract. It starts with the place kind, then the map grid square the place lies in, like "square C4" (`gridSquareText()` in `src/ui/format.ts`, the one way a square prints), and ends with a `.tag` marked "found" when the place has been spotted but not surveyed. On a held row it tells the posting shop's way to the place, the square it lies in, then what it looks like. The board and the HUD dock keep the short compass clue.
- `.log-strip` is the newest log line on one row, on a phone above End turn. It is a `.panel` with a button role, one line at `--phone-strip-h` (`--touch-target`) high, and it takes a tap to open the Log drawer. It is hidden under a modal and under Options with the rest of the bar.
- `.drawer-tabs` is the tab row of the phone layout: one `.btn-l` per drawer, its word its accessible name, `.selected` on the open one and `.marked` for the danger edge of attention. Its drawer is the panel of its zone, set to scroll inside.
- `.key` is a keyboard key or a mouse button, drawn as a keycap, as in the help panel. A shortcut listens for the physical key (`KeyboardEvent.code`), never the typed character, so it works in every keyboard layout. The keycap text is only a label.
- `.amount .coin` is money from `moneyEl()`: the coin, sized in em by the text around it, then the number. The coin colors are the `--coin-*` tokens.
- The HUD's truck diagram (`TruckConditionView` with `CONDITION_ROWS` in `src/ui/hud.ts`) shows at most 12 grid rows at full size. A longer chassis, like the 16-row sorokonoga, zooms the whole diagram down until it fits, so the bottom left zone keeps its height and the parts keep their icons and colors. Only the HUD diagram shrinks. The inspection card and the inventory draw the grid full size and scroll.
- An inventory edge cell can hold two items, an armor part and an accessory over it. `itemBox()` in `src/ui/inventory-draw.ts` draws a mounted accessory as an `.inv-item.outer` box on the outer half of its cells, above the armor box, so both stay visible and each takes its own click and drag.
- `.hauler-gauge` is the hauler's chassis portrait beside a `.meter` of its condition, in the bottom left zone under the truck diagram, shown only in a run. Its tooltip reads "Hauler, 82% in one piece". It answers whether the hauler is okay, and the grid and the world answer the rest.
- `.truck-switch` is a `.tabs` row of two buttons with a chassis portrait each, the player's truck and the hauler, above the grid on the outpost screen. `.on` marks the truck the grid, the repair bar, the supplies and the Buy parts tab act on. The hauler button is disabled with the reason in its tooltip while the hauler is not parked on the pad.
- `.meter` is a bar that fills from the left. `.s` and `.l` change its height. `.broken` turns the track to danger. `.progress` fills it with the accent for timed work and recharge.
- `.selected` is the one look of a chosen item: accent border and accent wash. A pressed `button.on` uses it too. No screen draws its own selected look. Drawn hardware, like a switch or a truck instrument, keeps its metal and takes the accent edge only.
- `[aria-disabled="true"]` dims a control that cannot be used now. It keeps hover and focus, so its tooltip can say why.
- `.tooltip` is a note that opens over its anchor. Words use the UI face and numbers use `.num`. It also gives the reason for a disabled control, as one short fact like "Need 12 M more".
- Item tip: the picture or box of a part, good or parcel on the inventory, shop, market, trade and outpost screens opens `itemTip()` from `src/ui/cards.ts`, the name and below it the item's lore. The inspection card and a shop row's open detail end with the lore as a `<p class="dim">`. The HUD weapons bar, bare symbol icons and a card's own head icon keep the plain name. The name line repeats a visible name on rows, against P16, because the same tip opens from icon-only grid cells and ellipsized names. [Item lore](lore/README.md#item-lore) has the writing rules.
- `.chassis-feature` is the one dim line on a truck card in the shop: the ability name in bold, then its effect in one sentence with its numbers filled in from the chassis data. The inventory header shows the name as a chip with the effect as its title. The line is key information, so it never lives in a tooltip alone.
- `.qt-term` is a word in quest text with a term tip: a dotted underline, and the `.term-tip` tooltip on hover and focus. A term tip is story text, so it keeps the in-character voice of P10, not the chrome voice of other tooltips. It is reference, never needed to choose. [Term tips](writing/quests.md#term-tips) has the writing rules.
- The quest page view fills most of the screen, up to `--quest-page-width` by `--quest-page-height`, in three columns: the picture, the text and the quest's numbers and facts. The picture column is about as wide as the window is tall, and it shrinks first on small screens. The text column stays at least `--quest-text-min` wide, and its text is centered and capped at `--quest-text-width`, so lines stay readable. The right column keeps `--quest-side-width`. Where the picture column would fall under `--quest-art-min`, the page stacks like the phone page: a picture band on top, then the text, then the side column. `questPageStacks()` sets `.stacked` from the window width. The picture keeps a shape between 3:4 and 3:1 (`--quest-frame-column`, `--quest-frame-band`) on every window. `questFrameFits()` checks it for `npm run layout`.
- `.art-band` is a wide picture across the top of a page, `--art-band-height` high (`--art-band-phone-height` on a phone), loaded with `loadArt()` and held by `ArtBand` so redraws keep its zoom running. It zooms like `.quest-frame` and shows a plain striped band while the picture loads or when a place has none. The place name and its chips sit over its lower edge.
- `.survey-picture` is the 4:3 picture of one survey place, `--survey-picture-w` wide, at the left of its journal place block (`.journal-place.survey`), and stacked above the text on a slim layer. It adds no words and is hidden from screen readers. It shows the striped surface of `.art-band` while the picture loads or when it never arrives.
- `.ink-page` is the frame of the town page and of a quest that opens while the town page is open, so a quest in town reads as the next page of the town. It has the quest page's box and layer, the `.art-band` across the top with the truck chips over its lower edge, then `.ink-body`: a centered text column of `--quest-text-width` with the heading and prose (`.ink-head`), an optional panel (`.ink-panel`, `.wide` for the full width), the numbered `.quest-choice` buttons (`.ink-choices`) and the status line. A quest's stats and facts sit in `.ink-side` at the right. A choice that is off keeps its slot, is `aria-disabled` and shows its reason at its right end, where a quest choice shows its skill check. On a phone or a narrow layer the band is `--art-band-phone-height`, the chips flow under it and the columns stack.
- The town page is an `.ink-page`. Its front page names the place, gives a short paragraph and offers six choices in a fixed order: Garage, Market, Board, People, Bar and Drive on. A section page has its heading, one line, its panel and Back. Garage and Market set the truck column and a shop column into a wide panel. Board and Bar sit in the text column, and on People the locals are the choices. Garage holds the repair bar and a `.tabs.sub` row of Buy parts, Sell parts and, at garages, Trucks. The Bar lists the drivers in sight on the place's pads, each with a Radio button that is the map's hail. Digits pick the choices and Escape goes back one page, then drives on.
- `.quest-frame` holds a quest page's picture, cropped around its focus point. In the column it fills the column's width, starts level with the text's first line and is at most 4/3 of its width tall, so on a narrow window plain column surface lies below it (P12 bends there, since a taller frame would give back a thin strip). In the stacked and phone band it is the band's full height, at most 3 times that wide, centered. The picture zooms in by 8% over 40 seconds and holds there. Reduced motion turns the zoom off.
- `.tooltip-row` is one line of a tooltip breakdown: the label on the left in the UI face and the value on the right in mono, like Base and then each cause. `.base` marks the Base row in muted ink, `.up` a step that raises the number in good ink and `.down` a step that lowers it in danger ink.
- `.standing` is the character screen's list of faction standing: one `.standing-row` per faction with its band word, and a `.tooltip.standing-tip` of `.tooltip-row` lines (base, deeds, earlier) on hover and focus. The HUD's driver card shows only the band tag of that driver toward the player.
- `.option-switch` is a row of equal buttons that picks one value of a setting: the language, the UI size, the minimap and the camera. `aria-pressed` with the accent edge marks the chosen one. A value that cannot be used is `aria-disabled` and gives its reason through the shared tooltip. The town Paint tab (`.paint-tab`) uses one per surface, body, cab and gear, where a flat swatch of the color is the label, under a first row of ready-made schemes, where a livery chip (`.paint-scheme`) of a body block, a cab block at its front and a gear stripe under both is the label and a pick plans all three colors. The scheme row has no word, and every row fills the column to Buy's right edge. `aria-pressed` marks the current color or scheme, a pick takes the planned dashed outline, the portrait of the player's chassis beside the rows shows the planned paint, and a priced Buy button appears under the rows, in a slot kept empty while the plan equals the current paint.
- With Bounty hunter, the truck card's state line ends with a dim `.tag` Wanted and the bounty owed on that truck (`.info-wanted`, `wantedBounty()` in `src/ui/format.ts`). Without the perk it is absent, and it uses no danger color, since a bounty is not hostility.
- `.wanted` is the right dock's well of what the Marshalls want: a danger edge, the word Wanted and the total owed, shown only while a case is open. Hover or focus opens one row per case above the total, in the flow of the well, since the dock scrolls and clips a tooltip. The log line of a filing tells news the truck did not see, a bend of P6 the issue asked for, and words it as word reaching the driver. Its layout is in `styles/marshals.css`.
- The Marshalls desk is the site screen of the Roadhouse with one tab and no truck grid: a group of case rows, each with Pay and its price, Pay all under them, then a group of settlement rows with the faction, its hostile tag and a Settle button whose tooltip names the after state. The desk offers Look for locals and Drive on. Look for locals opens a People page with the Roadhouse's local and Back, and a talk opens in the desk's frame as in a town.
- A radio option that costs money the player lacks stays offered, `aria-disabled`, with "Need N M more" as its reason, as the Pay of a Marshall's demand does.
- `.resource.danger` gives an HUD readout the danger edge while its state is true, the attention level of 7. The health readout takes it in a turn the reactor core burns the driver.
- `.num` is a number in the mono face. `.dim`, `.good` and `.bad` color a word.

## 13. How to build a screen

1. Write the decision as one question.
2. List the facts that answer it. Give each a tier.
3. Pick the zone or the surface: in the world, HUD zone, cursor card, notice or modal.
4. Pick the density for each entity and fill its slots in order.
5. Use the shared formatters, states and pieces. Put the screen's rules in one file under `src/ui/styles/` and import it in `style.css` after `components.css`. Write only layout there. A new shared piece goes in `components.css`, section 12 of this guide and `src/ui/guide/pieces.ts`, which draws it in `ui.html`. `src/ui/guide/guide.test.ts` fails when one of the three is missing.
6. Take every value from a token. Run `npx vitest run src/ui/style-guard.test.ts`.
7. Pick a level for every event the screen raises.
8. Take a screenshot next to a neighboring screen and check it against the principle tests.

### Worked example: the truck hover card

1. Decision: fight, talk or leave, and if I fight, where do I aim.
2. Key facts: who it is and its stance, my chance on it, its chance on me, and the drawing for aiming. Supporting facts: truck type, faction, motion, activity and states. Reference: the causes of each chance, in the tooltip on the chance. Distance is left out, because it changes no choice here and range already shows in the chances and their causes.
3. Surface: the cursor card, in the right column. It has the radio's width and right edge, and fills the space between the system row and the radio with one HUD gap to each. When the truck can be aimed at and that space gives the drawing cells under the small button height, the card grows left over the map and down over the right dock and the log, at most to the log's bottom edge. The dock panels and the log hide while the card covers them.
4. Grid: the head row holds the name, the truck type and faction in muted ink, and the stance tag at the right edge. The state line under it starts with Parked or Moving and the speed, then the activity and the states. Below, the drawing takes all the spare height at full width. You and Them sit side by side in a strip of fixed height under it, and scroll when they are long.
5. Lists: the drawing is the main content, so it takes the wide column. The chances are supporting, so they take the narrow one. You sits in a well with a neutral edge, and Them in a well with a danger edge. One line per gun: your key for the gun, the gun's name in caption size, then the chance. A long name ends in "…" and shows in full on hover.
6. Color: hostility only in the tag. Chances by value: 50% and up brighter, 0% faint, the enemy's in danger ink. Parts show the same picture as the player's own truck drawing: their own color when healthy and a tier color only for damage.
7. Type: four roles. Title for the name, body for words, caption for list heads, keys and gun names, mono for chances.
8. Tooltip: hovering a chance opens Base, then one row per cause in percent, so the rows add up to the chance. It opens over the drawing, never over the lists.

### Worked example: the help panel

1. Decision: which key or click does the thing I want.
2. Key facts: the key and the action. Supporting: where the click lands, like ground or your truck. Reference: the version and the world settings.
3. Surface: a dialog in the center, since reading it takes the player's attention and a top-left panel collided with the tips.
4. Grid: four groups side by side, Drive, Places and talk, Fight and View. Each line is the key as a `.key` keycap, then a short action. The panel grows sideways, not down.
5. Words: no sentences. "Space" then "Drive or pause" replaces "Space: drive on or pause." The notes are one quiet line at the bottom.

### Worked example: the town page

1. Decision: where in town do I go next, and once there, what do I buy, sell, take, fix or ask.
2. Key facts: on the front page, which place this is (the band and the heading), the money chip and which ways are open. On a section page, the facts its panel shows: prices, held counts, rewards and repair costs. Supporting: truck type, mass and free cells in the chips, a Bar driver's truck and faction, a local's role. Reference: the reason a choice is off, in its tooltip. Ambient: the picture, its zoom and the prose.
3. Surface: an `.ink-page` modal of the quest page's size, so a quest that starts in town reads as the next page. It is larger than `--modal-width` because the Garage puts the truck grid beside the part rows (P18).
4. Grid: the band, then a centered text column with the heading, one paragraph or line, and the choices pinned to its bottom. Garage and Market set a full-width panel between them, and Board and Bar a text-column panel. This bends P13 and P14: the outline, band, heading and choices stay fixed, and only the panel width follows the section, since only those two need the grid.
5. Choices: quest choice buttons in a fixed order, Garage, Market, Board, People, Bar and Drive on, so a digit always means the same place. An off choice keeps its slot and shows its reason at its right end. Locals are People's choices. Back ends every section page.
6. Words: choices and prose are in story voice, reasons, chips and panel labels in the chrome voice. The prose names no price, no person and nothing the band or the choices show.
