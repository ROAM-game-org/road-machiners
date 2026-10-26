# Russian copy

How to write the Russian text in `src/text/ru/`. Read it before you add or change a Russian entry. [Text and languages](../architecture/text.md) covers the catalog itself.

## The bar

The Russian must read as if a Russian game writer wrote it first. Think of Ex Machina, Space Rangers 2 and Дальнобойщики: terse, dry, a bit rough, never bureaucratic. A player must never be able to guess the English behind a line.

Read an entry where it shows before you change it. `npm run text:review` writes `tmp/text-review/<area>.md`, every entry in English and in Russian with sample params: a name of each gender, counts 1, 3, 5 and 1.5, and a place. Agreement and plural errors show there as wrong words in a sentence.

agy writes all Russian text, since it writes better Russian than Claude. That covers new lines, changed lines, quest twins and fixes. Never write or edit a Russian word yourself, and never copy the English in as a placeholder. Give agy many lines in one run: `agy --dangerously-skip-permissions -p "<request>"`. The request names this file, the [Humanizer](humanizer.md#how-roam-uses-it) read the way its How ROAM uses it section says, for the faults that exist in Russian too, the English of each line, its key and where it shows, and agy reads the files it names. Then check its lines against the rules and the glossary below. When a line breaks them, run agy again with the line and the rule it breaks. agy runs on Gemini 3.8 Flash at medium effort. The factory sets it with `AGY_MODEL`. On a laptop, add `--model gemini-3.8-flash-medium`. A factory job may run agy at most `AGY_MAX_RUNS` times.

## When agy is unavailable

Try agy first, every time. Write the request into `tmp/ru-request.md`, the same text you would give agy: this file, the English of each line, its key and where it shows. A fallback writer reads this file and the glossary the same way, so it needs nothing more.

agy is unavailable when its run exits with one of these:

- `command not found`, since it is not installed.
- Error 402 or `payment required`, since its account has no plan for the model.
- Error 429 or `RESOURCE_EXHAUSTED`, since its quota is spent.
- `authentication failed or timed out`, `AGY_MODEL is not set` or a rejected login.
- A 502, 503 or 504, or a network error, since the service is down.
- `run N exceeds AGY_MAX_RUNS`, since the job used its runs. Do not raise the limit, and do not work around the run counter.

Then Codex writes the Russian: `timeout 900 codex exec -o tmp/ru-reply.md - < tmp/ru-request.md`. The reply is the file after `-o`. Codex is unavailable when `codex` is missing, `CODEX_MODEL and CODEX_EFFORT must be set`, its ChatGPT login is missing or refused, its usage limit is spent, or it cannot reach its service. With no network, Codex retries until `timeout` stops it with exit 124. Count that as unavailable only when its output shows the connection failing.

When Codex is unavailable too, Claude Sonnet writes it: `timeout 900 claude -p --model sonnet --tools Read,Grep,Glob --no-session-persistence < tmp/ru-request.md`. The reply is on stdout. It can read the files the request names and nothing else.

Only an unavailable writer passes the request on. A writer that fails for any other reason, or answers with no Russian, failed on the request: read its error, fix the request and ask the same writer again. Do not move on to the next writer to get past it.

You put the fallback writer's lines in the catalog yourself, as you would agy's. They face every check agy's do: the rules and glossary below, the catalog test, the scan for untranslated text and `npm run text:review`. Run them all, and send a line that breaks a rule back to the same writer with the rule. Never write a Russian word yourself, never copy the English in as a placeholder, and never relax a check. Say in the pull request which writer wrote the Russian and why the earlier ones were out. If all three are unavailable, stop and report that. Do not ship English in the Russian catalog.

Translate what the line means where the player sees it, not its words. The key tells you where it shows:

- `line.*` is a driver speaking on the radio. It is speech: short, spoken, rude when the English is rude.
- `radio.*` is J.J.'s radio show. It is a DJ talking to drivers, with jokes.
- `goal.*` is a short status under an NPC's name. It says what the driver is doing or why it stopped.
- `log.*` and `note.*` are log lines. They read like a terse logbook.
- `refusal.*` tells the player why an action did not work.
- `inv.*`, `trade.*`, `weapon.*`, `hud.*`, `menu.*` and the like are buttons, labels and tooltips. They follow Russian UI habits.

## Rules

1. No "label: value" lines unless the English is a label. A colon instead of a sentence is the main tell of machine text.
2. Numbers sit inside the sentence, with the word in the right case. Write «Нужно 40 опыта, у вас 12», not «Нужно опыта: 40, у вас: 12».
3. Never chop a word to fit. Use a standard abbreviation with a period, like «прочн.», «доп.», «шт.», «КПП», or pick a shorter word. A reader must recognize every short label without seeing the full word.
4. Use active verbs and drop possessives Russian does not need. Write «Сначала остановите грузовик», not «Сначала остановите ваш грузовик». Avoid «является», «осуществить» and «был произведен».
5. Keep the register. UI and the log address the player as «вы». Drivers on the radio say «ты» to the player, even a gang speaking as «мы».
6. Keep the subject's number and gender. An NPC status is about one driver: «Покинул пост», not «Покинули пост».
7. Idioms carry meaning, not words. "You look dry" is about fuel, so «бак, смотрю, пустой», not «ты на мели», which means broke.
8. Plurals give all four forms, `one`, `few`, `many` and `other`. `other` is the form for fractions, like «1,5 хода».
9. Stay close to the English length. A button or label may grow by a third at most. The layout check fails on clipped text.
10. Use one word per concept, from the glossary below.

## Names in sentences

A name inside a sentence takes the case the grammar needs, and the verb agrees with its gender. [Text and languages](../architecture/text.md) has the syntax.

- `log.patchDoneYou`: «Вы починили: {who}.» → «Вы починили {who, case, acc}.»
- `log.patchDoneThem`: «{who} починил ваш грузовик.» → «{who} {who, gender, m {починил} f {починила} n {починило} pl {починили}} ваш грузовик.»
- `job.repair`: «Ремонт: {part}» → «Ремонт {part, case, gen}».
- `log.towOffer`: «…дотащить вас, пункт — {site}…» → «…дотащить вас до {site, case, gen}…».
- `log.breakdown`: «Сломалось: {part}» → «{part} {part, gender, m {сломался} f {сломалась} n {сломалось} pl {сломались}}».

A place takes its own preposition. Write «Сдать {site, case, at}», never «в {site, case, prep}» or «в пункте {site}». A new place gets `place()` with its three phrases.

A new name entry is a `noun()` with all six forms and its gender. Write the forms in lower case unless the name is a proper name, like a place. Check each form in a sentence: «нет …», «дать …», «вижу …», «с …», «о …».

## Examples

Bad, then good, with the reason.

- `refusal.needsXp`: «Нужно опыта: {cost}, у вас: {have}» → «Нужно {cost} опыта, у вас {have}». A form, not a sentence.
- `short.gun`, `short.arm`: «Орд», «Брн» → «Оруж.», «Броня». A chopped word nobody can read, and an abbreviation keeps its period.
- `cond.rebuilt`: «чинено ×2» → «2 капремонта». Committee: ungrammatical and unclear as a status. It counts rebuilds after a breakdown, so it says that in a mechanic's word, with a plural.
- `cond.pristine`: «новая» → «без износа». The word sits beside any part, and «новая» does not agree with «пулемет» or «колесо». A condition word must be gender-free or take the part as a param.
- `cond.broken`, `cond.junk`: «сломана», «негодная» → «не работает», «лом». Same reason.
- `item.mounted`: «Установлено» → «На креплении». It sat under «Боковые корзины» and agreed with nothing.
- `part.flatbed`: «удлиненная платформа» → «удлинитель кузова». Committee: unnatural and wrong for the equipment. The part lengthens the cargo bed.
- `part.cage`: «арматурная клетка» → «арматурный каркас». A welded frame around a truck is a «каркас».
- `inv.patch`: «Ремонт {turns}х/{parts}зч» → «Ремонт: {turns} х., {parts} дет.». Made-up abbreviations.
- `job.search`: «Обыск» → «Поиски». «Обыск» is a police search of a person or a house.
- `goal.leftPost`: «Покинули пост» → «Покинул пост». The status is about one driver.
- `goal.ranFromIt`: «Убежали от нее» → «Сбежал от него». Wrong number, and грузовик is masculine.
- `goal.watchedRoad`: «Дорога осмотрена» → «Осмотрел дорогу». The other statuses are active, so this one is too.
- `goal.finishedService`: «Обслужился» → «Прошел обслуживание». Not a Russian word in this sense.
- `goal.prowledRoad`: «Обрыскал дорогу» → «Прочесал дорогу». A made-up verb.
- `log.scrapPatch`: «Вы латаете машину ломом, пока она снова не трогается с места» → «Вы латаете машину ломом, и она снова трогается с места». A calque of "until".
- `inv.loadTitle`: «Масса против номинального груза» → «Масса и допустимая нагрузка». "Against" is not «против» here.
- `trade.hint.flooded`: «завал» → «затоварено». The market term.
- `radio.dawn.1`: «Утро, мальчики» → «Доброе утро, мужики». A DJ talking to drivers, not to children.
- `line.itIsYours`: «Он ваш» → «Твое». Radio speech says «ты».
- `line.overMyWreck`: «Только через мой обломок» → «Сначала придется меня разбить». The meaning, not a word-for-word pun.
- `opening.stranded`: «Вы очутились на мели» → «Вы застряли в незнакомых краях». «На мели» reads as broke.

Good lines to match:

- `log.weather.overcast.started`: «Небо затянуло», not «Началась облачность».
- `state.revenge`: «Жаждет мести».
- `line.findersKeepers`: «Кто нашел, того и добыча».
- `line.noTimeOut`: «Некогда. Отбой.»

## Glossary

- Spiral: Спираль.
- Cry: Крик.
- Race: Гонка.
- Exodus: Исход.
- Chaos: Хаос.
- Forsaken: Покинутые.
- truck: грузовик. Car, when the English says car: машина.
- raider: рейдер. Scavenger: мусорщик. Vulture: стервятник. Roamer: бродяга. Trader: торговец.
- scrap: лом. Scrap metal: металлолом. Wreck: обломки. Loot: добыча.
- tow: буксир. To tow: тащить на буксире.
- patch: ремонт. To patch: подлатать.
- search of a site: поиски. To search: обшарить.
- parked: на стоянке. Pad: площадка. Garage storage: гараж.
- drive on, the button that opens the next Chaos Highway stretch: ехать дальше. The fort yard: двор.
- skill: умение. Perk: навык. XP: опыт.
- HP of a part: прочность. Short form: прочн.
- turn: ход. Never on the radio.
- refit: переоснащение. Mount: крепление.
- pristine (no wear): без износа. Rebuilt after a breakdown: капремонт, «2 капремонта». Broken: не работает. Junk: лом.
- flatbed extension: удлинитель кузова. Cage: каркас. Armor plate: стальной лист.
- petrol, the good the Pump Station makes: бензин. Never солярка or топливо for it.
- money: М, as «60 М». A sum inside a quest line reads «{price} М».
- watch, a shift of time in a quest: вахта, «две вахты».
- compass letters on the map and the dashboard compass: N, E, S, W, Latin as in English, by convention. Never С, В, Ю, З.

## Quests

Each quest in `src/data/quests/<quest>.ink` has a Russian twin in `src/data/quests/ru/<quest>.ink`. [Quests](../architecture/quests.md) explains how the game picks the twin and how the checker compares them. A twin is the same script with Russian words.

What stays exactly as in the English file:

- Knots, stitches, diverts, gathers, `VAR` lines and their values, `INCLUDE`, conditions, `~` lines and every call such as `note("wagonPin")`.
- The order and number of choices, and whether each is `+` or `*`.
- Tags with ids or numbers: `checkpoint`, `img`, `cost`, `check`, `reveal`, `speed`, `view`, `row`, `head`, `page` and `work_offer`.
- Markup names: `<b>`, `<i>`, `<shake>`, `<pop>`, `<color=rust>` and `<term=id>`. Translate the words between the tags.
- The number of `;` cells in a `# row` or `# head` line.

What is translated:

- Every line of text, the words inside choice brackets and the words after a choice's closing bracket.
- The values of `# place:` and `# speaker:`.
- The labels and words of `# stat:` and the text of `# fact:`. The variable name after `stat:` or `fact:` stays.

How it reads:

- Narration speaks to the player as «вы», in the present tense: «Вы кладете обломок на верстак».
- Write «е», not «ё». Keep «ё» only in «её», «всё» and «ещё».
- Split an English sentence glued with "and" when it joins images that do not belong together: «С самого восхода солнце жжет сквозь ткань на голове. Было глупо идти на восток.» Keep long sentences that flow as one thought, and vary sentence length. A row of short sentences reads like a telegram.
- Put the new or stressed word at the end: «Было глупо идти на восток», not «Идти на восток было глупо».
- Never copy an English echo reply. "It isn't." is «Но тщетно.», not «Не спряталась.» "Or it used to." is «Или когда-то был.»
- Spell out what English leaves to the reader. "Not that the west had anything better" is «Хотя идти на запад было бы так же глупо».
- Use native idioms and insults: «ржавое корыто», not «ржавая свинья». "Had better be real" is «Остается надеяться, что он настоящий».
- Keep the plain register: «ткань», not «тряпка», for cloth worn on the head.
- A choice the player says aloud stays direct speech, as in the English: «Что это за место?», «Пока.». A choice that is an action is an infinitive phrase, as in Russian text quests: «Положить обломок на верстак и сказать, откуда он».
- People in town say «ты» to the player, like drivers on the radio.
- The player has no gender in the game. Never write a past-tense verb or a short adjective that agrees with the player. Write «Ты это видел?» as «Видно было?» or «Ты это видишь?», and «ты прав» as «тут не поспоришь».
- Ink has no plurals. A number from a variable sits before a word whose form does not change, like «М», or the sentence is rewritten around it.
- Table rows use the Russian number format: a decimal comma and a no-break space between thousands.
- Quest text holds no semicolon. Split it into two sentences. The voice test fails on one. The dialogue dash «—» stays.
- A dialogue dash is «—». A hyphen at the start of a line is an ink gather, so never start a line of text with «-».
- Each speaker keeps their voice from [the voice sheets](../lore/voices.md): their words, rhythm and habits.

Names:

- People: Agnes Ondra is Агнес Ондра. Mirela is Мирела. Sergeant Kovac is сержант Ковач. Lena is Лена. Old Ibo is Старый Ибо. Ruben is Рубен. Hattie is Хэтти. Dag is Даг. Jory Baptiste is Джори Батист. Sefa Krol is Сефа Кроль. Corporal Bram Teller is капрал Брэм Теллер. Private Ilan Duvall is рядовой Илан Дюваль. Vance is Вэнс. Pell is Пелл. Sabine is Сабина. Bo Lindqvist is Бо Линдквист. Ines Abend is Инес Абенд. Mirela Duarte is Мирела Дуарте. Aurel Brede is Аурел Бреде. Pim Arslan is Пим Арслан. Commander Lind is командир Линд. Otto Brann is Отто Бранн. Tamsin Roe is Тэмсин Роу. The Steward is управляющий. Odile Marsh is Одиль Марш. Hadiza Okon is Хадиза Окон. Hollis Brennan is Холлис Бреннан.
- Places take their names from `site.*` in `src/text/ru/names.ts`: Bowl is Чаша, Nose is Нос, Pump Station is Насосная станция, Salvage Yard is Свалка, Granary is Элеватор, Burnt Convoy is Сгоревший конвой, Kiln is Обжиг, Scrapjaw is Ржавая Челюсть, Glass Flats is Стеклянная равнина and Fallen Sun is Павшее солнце.
- Groups and things: the Senate is Сенат. The Central Committee is Центральный комитет. The Farmers patrol is патруль Чаши, and a Farmer is фермер. Pierce is «Пирс». The Guidestar Guild is Гильдия Путеводной звезды. The Old Army is Старая армия. The Sunward are Обращенные к Солнцу. The old world is старый мир. Wagon Seven is фургон «Седьмой». Old Orchard is Старый сад. The pump book is насосная книга.
- Water: the dial is счетчик, a hose meter is водомер, the tanker is цистерна, a trough is желоб, the lock house is шлюзовой дом and the well house is колодезная. The household is двор, and its steward is управляющий.
- The link is сцепка, and to drive linked is водить в сцепке. A Machiner is механтист, and road slang shortens it to мех, as English shortens it to Mach. Never машинист, which is a train driver. The Chaos is Хаос.
