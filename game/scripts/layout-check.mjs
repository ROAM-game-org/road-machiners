import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { launchChromium } from './gpu.mjs';
import { playUrl } from './game-url.mjs';

const url = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:5173';
const SEED = 4242;
const LOCALES = process.env.LAYOUT_LOCALES?.split(',').filter(Boolean) ?? ['en', 'ru', 'pseudo'];
const VIEWPORTS = [[1280, 720], [700, 800]];
const TALL = [1440, 900];
const COMPACT = [1024, 600];
const PHONE = [390, 844];
const PHONE_LANDSCAPE = [640, 360];
const KEY_CAPS = ['WASD', 'Shift', 'Esc'];
const GALLERY = process.env.LAYOUT_GALLERY;
const OUT = GALLERY ?? 'tmp/layout';
const FADE_MS = 900;
const GLYPHS = { font: 'Fira Sans Condensed', letter: 'Ж' };

const key = (page, code) => page.evaluate((c) => window.__ROAM__.runKey(c), code);
const escape = (page) => page.keyboard.press('Escape');
const frames = (page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

function fillLog(page) {
  return page.evaluate(async () => {
    const g = window.__ROAM__;
    const { t } = await import('/src/text/msg.ts');
    const n = await import('/src/text/names.ts');
    const { moneyMsg } = await import('/src/ui/units.ts');
    const lines = [
      t('log.jobCancelled', { what: t('job.remove', { part: n.partName('tankHeavy'), truck: t('vehicle.npc', { profession: n.professionName('convoyGuard'), driver: n.fullName('Dmitri Tulloch') }) }) }),
      t('log.jobStarted', { what: t('job.repair', { part: n.partName('enclosedFrame') }), n: 12 }),
      t('log.escortHired', { client: t('vehicle.npc', { profession: n.professionName('convoy'), driver: n.fullName('Lorna Morozov') }), who: t('vehicle.npc', { profession: n.professionName('merc'), driver: n.fullName('Elias Drummond') }), site: n.siteName('canyon-bridge'), fee: moneyMsg(123) }),
      t('log.contract.accepted', { what: t('contract.procure', { n: 12, good: n.goodName('electronics'), site: n.siteName('salvage-yard') }), reward: moneyMsg(42) }),
      t('note.hazard'),
      t('log.towDroppedYou.blocked', { who: t('vehicle.npc', { profession: n.professionName('bowlFarmer'), driver: n.fullName('Hester Kessler') }) }),
      t('log.scrapPatchFuel', { liters: 40 }),
      t('log.rankBoughtPerk', { skill: n.skillName('perception'), rank: 2 }),
    ];
    for (let i = 0; i < 5; i++) for (const line of lines) g.hud.note(g.state, line, 'dim');
  });
}

async function openInventory(page) {
  await key(page, 'KeyI');
  await page.evaluate(() => document.querySelector('.inv-item:not(.fixed)').click());
}

async function openTown(page, tab) {
  await openTownClear(page);
  await page.evaluate((tab) => {
    const go = (id) => document.querySelector(`.town-page [data-town-go="${id}"]`)?.click();
    go('back');
    const section = { buyParts: 'garage', sellParts: 'garage', trucks: 'garage', paint: 'garage', contracts: 'board', charts: 'maps' }[tab] ?? tab;
    if (section !== 'front') go(section);
    if (section === 'garage') document.querySelector(`.town-page [data-garage-tab="${tab}"]`).click();
  }, tab);
}

const closeTown = (page) => page.evaluate(() => {
  const g = window.__ROAM__;
  g.screens.town.close();
  const world = g.state;
  world.player.quests.session = null;
  world.player.quests.live = null;
  g.apply(world);
});

async function openShortMarket(page) {
  await page.evaluate(async () => {
    const g = window.__ROAM__;
    const c = await import('/src/sim/cheats.ts');
    const w = structuredClone(c.teleport(g.state, c.placeSpot(g.state, 'granary')));
    w.shops.granary.goods.grain = 0;
    w.shops.granary.shortSince = { grain: w.turn - 800 };
    w.shops.granary.goods.fuelDrums = 0;
    w.shops.granary.opened = {};
    w.roadNews = [
      { turn: w.turn - 40, kind: 'robbed', good: 'grain', units: 14, from: 'bowl', to: 'granary' },
      { turn: w.turn - 160, kind: 'knockedOut', good: 'fuelDrums', units: 12, from: 'pump-station', to: 'salvage-yard' },
      { turn: w.turn - 20, kind: 'destroyed', good: 'rations', units: 1, from: 'granary', to: 'bowl' },
    ];
    g.apply(w);
    g.screens.town.open();
  });
  await page.evaluate(() => {
    const go = (id) => document.querySelector(`.town-page [data-town-go="${id}"]`)?.click();
    go('back');
    go('market');
  });
}

async function openCall(page, node) {
  await page.evaluate(async (node) => {
    const g = window.__ROAM__;
    const { runCommand } = await import('/src/ui/console.ts');
    let w = g.state;
    let npc = w.vehicles.find((v) => v.brain && v.brain.templateId === 'trader');
    if (!npc) {
      w = runCommand(w, 'spawn trader').world;
      npc = w.vehicles.find((v) => v.brain && v.brain.templateId === 'trader');
    }
    const next = structuredClone(w);
    if (node === 'attacker') {
      const { callVehicle } = await import('/src/sim/dialogue.ts');
      const raiderWorld = runCommand(w, 'spawn gunwagon hostile').world;
      const raider = raiderWorld.vehicles.filter((v) => v.brain).at(-1);
      raider.brain.goals = [{ kind: 'fight', targetId: raiderWorld.player.vehicleId, destination: { ...raiderWorld.vehicles.find((v) => v.id === raiderWorld.player.vehicleId).pos }, phase: 'travel', reason: 'fightHostile', demands: true, worn: { turn: raiderWorld.turn, condition: 1 } }];
      g.apply(callVehicle(raiderWorld, raider.id));
      return;
    }
    const way = node === 'directions' ? await longestDirections(w) : null;
    const deal = { deal: { kind: 'deal', deal: 'ownParts', patcher: 'player', price: 13, parts: 3, turns: 4 } };
    const hub = { with: npc.id, topic: null, node: 'hub', vars: {}, group: null, asked: [], line: { line: 'whatDoYouWant', vars: {} } };
    next.player.call = node === 'hub'
      ? hub
      : node === 'group'
      ? { ...hub, group: 'helpTrade', asked: ['tradeTalk'] }
      : node === 'directions'
      ? { with: npc.id, topic: 'directions', node: 'answer', vars: way.vars, group: null, asked: [], line: { line: way.line, vars: way.vars } }
      : { with: npc.id, topic: 'patchRequest', node: 'terms', vars: deal, group: null, asked: [], line: { line: 'dealTerms', vars: deal } };
    g.apply(next);
    async function longestDirections(world) {
      const { directionsTo } = await import('/src/sim/directions.ts');
      const { REGION } = await import('/src/data/region.ts');
      const sites = [...REGION.towns, ...REGION.locations];
      let best = null;
      for (let x = 30; x < 600; x += 140) {
        for (let y = 40; y < 560; y += 130) {
          for (const site of sites) {
            const steps = directionsTo(world, { x, y }, { kind: 'site', id: site.id });
            const length = steps.reduce((sum, step) => sum + (step.do === 'turn' ? 2 : 1), 0);
            if (!best || length > best.length) best = { length, site, steps };
          }
        }
      }
      const town = REGION.towns.some((t) => t.id === best.site.id) ? 'town' : 'site';
      return { line: town === 'town' ? 'townWay' : 'siteWay', vars: { [town]: { kind: town, id: best.site.id }, way: { kind: 'directions', steps: best.steps } } };
    }
  }, node);
}

const hangUp = (page) => page.evaluate(() => {
  const g = window.__ROAM__;
  const next = structuredClone(g.state);
  next.player.call = null;
  g.apply(next);
});

const chooseMenuItem = (page, entry) => page.evaluate((entry) => {
  document.querySelector('#ui .game-menu .menu-button').click();
  document.querySelector(`#ui .game-menu [data-entry=${entry}]`).click();
}, entry);

const openHelp = (page) => chooseMenuItem(page, 'help');
const closeHelp = (page) => page.evaluate(() => document.querySelector('#ui .help .close').click());

const openSaves = (page) => chooseMenuItem(page, 'save');
const openOptions = (page) => chooseMenuItem(page, 'options');
const setMinimap = async (page, on) => {
  await openOptions(page);
  await page.evaluate((at) => document.querySelectorAll('#ui .minimap-switch > button')[at].click(), on ? 1 : 0);
  await escape(page);
};

function faultsIn(page, locale) {
  return page.evaluate(async ({ locale, names, glyphs }) => {
    const { findLayoutFaults } = await import('/src/ui/dom.ts');
    const allow = [...names, 'WOT RADIO', 'FM', 'DAY', 'English', 'kg'];
    return findLayoutFaults(document.getElementById('ui'), { locale, allow, glyphs });
  }, { locale, names: KEY_CAPS, glyphs: GLYPHS });
}

function frameFaults(page) {
  return page.evaluate(async () => {
    const { questFrameFits } = await import('/src/ui/quest-screen.ts');
    const screen = document.querySelector('#ui .quest-screen.quest-page');
    const frame = screen?.querySelector('.quest-frame');
    if (!frame) return [];
    const { width, height } = frame.getBoundingClientRect();
    const stacked = screen.classList.contains('stacked') || document.getElementById('ui').classList.contains('phone');
    if (questFrameFits(width, height, stacked)) return [];
    return [{ kind: 'quest-frame-shape', path: '.quest-frame', text: `${Math.round(width)}x${Math.round(height)} stacked=${stacked}`, sizes: '' }];
  });
}

async function probe(page, locale) {
  const found = await page.evaluate(async ({ locale, glyphs }) => {
    const { findLayoutFaults } = await import('/src/ui/dom.ts');
    const button = Object.assign(document.createElement('button'), { textContent: 'An overflowing probe label' });
    button.style.cssText = 'position:fixed;left:8px;top:300px;width:40px;white-space:nowrap;overflow:hidden;z-index:99999';
    const holder = document.createElement('div');
    holder.append(button);
    document.getElementById('ui').append(holder);
    const faults = findLayoutFaults(holder, { locale, allow: [], glyphs });
    holder.remove();
    return faults.some((f) => f.kind === 'clipped-text' && f.text === 'An overflowing probe label');
  }, { locale, glyphs: GLYPHS });
  if (!found) throw new Error(`The layout checker did not report the planted overflowing button (${locale})`);
}

async function boot() {
  const { browser, software } = await launchChromium(chromium);
  const bootLimitMs = process.env.TEST_TIMEOUTS === 'off' ? 0 : software ? 240000 : 30000;
  const context = await browser.newContext({ viewport: { width: VIEWPORTS[0][0], height: VIEWPORTS[0][1] } });
  const page = await context.newPage();
  page.setDefaultTimeout(bootLimitMs);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(playUrl(`${url}/?seed=${SEED}`));
  await page.waitForFunction(() => window.__ROAM__?.state, null, { timeout: bootLimitMs });
  if (GALLERY) await page.waitForFunction(() => !document.getElementById('boot'));
  else await page.addStyleTag({ content: '#game { display: none !important }' });
  return { browser, page, errors };
}

async function inspectNpc(page, armed) {
  const npcId = await page.evaluate(async (armed) => {
    const g = window.__ROAM__;
    const { runCommand } = await import('/src/ui/console.ts');
    const { partDef } = await import('/src/data/parts.ts');
    const world = structuredClone(runCommand(g.state, 'spawn gunwagon hostile').world);
    g.hud.tips.setOn(false);
    const npc = world.vehicles.filter((v) => v.brain).at(-1);
    world.player.ranks.perception = Math.max(world.player.ranks.perception, 1);
    if (!world.player.perks.includes('spotter')) world.player.perks.push('spotter');
    if (!armed) npc.items = npc.items.filter((it) => !(it.kind === 'part' && partDef(it.part.defId).kind === 'weapon'));
    g.apply(world);
    g.hovered = npc.id;
    g.refreshInfo();
    g.hitCard.show();
    return npc.id;
  }, armed);
  await page.waitForFunction((id) => window.__ROAM__.hud.portraitSettled(id), npcId, { timeout: 60000 });
}

const clearInspect = (page) => page.evaluate(() => {
  const g = window.__ROAM__;
  g.hovered = null;
  g.refreshInfo();
});

const INSPECT_VIEWPORTS = [...VIEWPORTS, COMPACT, TALL];

const openStartMenu = (page) => page.evaluate(async () => {
  for (const node of document.querySelectorAll('#ui > *')) {
    node.dataset.layoutDisplay = node.style.display;
    node.style.display = 'none';
  }
  const { chooseStart } = await import('/src/ui/save-screen.ts');
  const { SoundSettings } = await import('/src/ui/sound.ts');
  const sound = new SoundSettings({ setBusVolume: () => {}, setMuted: () => {} }, window.localStorage);
  const saves = [{ slot: 'slot2', savedAt: 900, turn: 120, mode: 'roaming' }, { slot: 'auto', savedAt: 500, turn: 40, mode: 'chaosHighway' }];
  void chooseStart(saves, { requestBoot: () => {}, reload: () => {} }, sound);
});

const openStartOptions = async (page) => {
  await openStartMenu(page);
  await page.locator('.start-menu .btn-l').last().click();
};

const openQuestInventory = async (page) => {
  await openQuestPage(page);
  await key(page, 'KeyI');
};

const openStartLoad = async (page) => {
  await openStartMenu(page);
  await page.locator('.start-menu .btn-l').nth(1).click();
  await page.evaluate(() => { document.querySelector('.start-menu .start-buttons').style.visibility = 'hidden'; });
};

const closeStartMenu = (page) => page.evaluate(() => {
  document.querySelector('#ui .save-panel')?.remove();
  document.querySelector('#ui .start-menu')?.remove();
  for (const node of document.querySelectorAll('#ui > [data-layout-display]')) {
    node.style.display = node.dataset.layoutDisplay;
    delete node.dataset.layoutDisplay;
  }
});

const openQuestPage = (page) => page.evaluate(async () => {
  const g = window.__ROAM__;
  const q = await import('/src/sim/quests.ts');
  const world = g.state;
  q.openQuest(world, q.QUESTS, 'intro_arrival', 'start');
  g.apply(world);
});

const closeQuestPage = (page) => page.evaluate(() => {
  const g = window.__ROAM__;
  const world = g.state;
  world.player.quests.session = null;
  world.player.quests.live = null;
  g.apply(world);
});

const SURVEY_CONTRACT_ID = 'layout-survey';

const openSurveyJournal = async (page) => {
  await page.evaluate(async (id) => {
    const g = window.__ROAM__;
    const { surveySites } = await import('/src/sim/survey.ts');
    const world = g.state;
    const sites = surveySites({ hash: world.mapHash, terrain: world.terrain }).filter((s) => s.type !== 'boats').slice(0, 3);
    const points = sites.map((s, i) => ({ site: s.id, found: i > 0, done: i > 1 }));
    world.player.contracts.push({ id, shop: 'bowl', kind: 'survey', points, reward: 30, deadline: 9000, window: 600, tier: 1 });
    g.apply(world);
  }, SURVEY_CONTRACT_ID);
  await key(page, 'KeyJ');
  await page.waitForFunction(() => [...document.querySelectorAll('#ui .survey-picture img')].every((img) => img.complete && img.naturalWidth > 0));
};

const closeSurveyJournal = async (page) => {
  await escape(page);
  await page.evaluate((id) => {
    const g = window.__ROAM__;
    const world = g.state;
    world.player.contracts = world.player.contracts.filter((c) => c.id !== id);
    g.apply(world);
  }, SURVEY_CONTRACT_ID);
};

const JOURNAL_VIEWPORTS = [...VIEWPORTS, COMPACT];

const keepWorld = (page) => page.evaluate(async () => {
  const { shopState } = await import('/src/sim/market.ts');
  const w = window.__ROAM__.state;
  const { contracts, notes, pastContracts, rumored } = w.player;
  window.__layoutKept = structuredClone({ contracts, notes, pastContracts, rumored, board: shopState(w, 'bowl').contracts });
});
const restoreWorld = (page) => page.evaluate(async () => {
  const { shopState } = await import('/src/sim/market.ts');
  const g = window.__ROAM__;
  const w = g.state;
  const { board, ...player } = structuredClone(window.__layoutKept);
  Object.assign(w.player, player);
  shopState(w, 'bowl').contracts = board;
  g.apply(w);
});

const HELD_CONTRACTS = () => {
  const turn = window.__ROAM__.state.turn;
  return [
    { id: 'lj-haul', shop: 'bowl', kind: 'haul', good: 'scrap', units: 3, to: 'nose', reward: 200, deadline: turn + 600, window: 600, rush: false, tier: 2 },
    { id: 'lj-order', shop: 'nose', kind: 'procure', good: 'water', units: 6, cratePay: 9, reward: 111, deadline: turn + 900, window: 900, tier: 1 },
    { id: 'lj-escort', shop: 'bowl', kind: 'escort', client: 'v-gone', to: 'nose', reward: 80, deadline: turn + 2000, window: 2000, tier: 1, threat: 2, span: 100, together: 40, seen: null, apart: 0, stuck: 0, holdUntil: null },
  ];
};

const FILL_LONGEST = async (held) => {
  const g = window.__ROAM__;
  const world = g.state;
  const { surveySites, surveyWay } = await import('/src/sim/survey.ts');
  const { REGION } = await import('/src/data/region.ts');
  const sites = surveySites({ hash: world.mapHash, terrain: world.terrain }).filter((s) => s.type !== 'boats');
  const survey = (town, points) => ({ id: 'lj-survey', shop: town.id, kind: 'survey', points, reward: 30, deadline: world.turn + 9000, window: 600, tier: 1 });
  const wayLength = (contract) => (surveyWay(world, contract, contract.points[0]) ?? []).reduce((sum, step) => sum + (step.do === 'turn' ? 2 : 1), 0);
  const rank = (town) => sites.map((site) => ({ site, length: wayLength(survey(town, [{ site: site.id, found: false, done: false }])) })).sort((a, b) => b.length - a.length).slice(0, 3);
  const best = window.__layoutLongest ?? REGION.towns.map((town) => ({ town, ranked: rank(town) })).sort((a, b) => b.ranked[0].length - a.ranked[0].length)[0];
  window.__layoutLongest = best;
  world.player.contracts.push(survey(best.town, best.ranked.map((r, i) => ({ site: r.site.id, found: i === 1, done: false }))), ...held);
  g.apply(world);
};

const FILL_NOTES = async () => {
  const g = window.__ROAM__;
  const world = g.state;
  const { NOTE_IDS } = await import('/src/data/locals.ts');
  world.player.notes = NOTE_IDS.slice(0, 9).map((id, i) => ({ id, turn: 10 + i * 40 }));
  g.apply(world);
};

const FILL_PAST = (held) => {
  const g = window.__ROAM__;
  const world = g.state;
  const ends = ['done', 'failed', 'lapsed', 'released', 'late', 'done', 'failed', 'done'];
  const amount = (outcome, i) => (outcome === 'done' ? 120 + i : outcome === 'failed' ? -18 : 0);
  world.player.pastContracts = ends.map((outcome, i) => ({ contract: { ...held[i % held.length], id: `lj-past-${i}` }, outcome, turn: 50 + i * 30, amount: amount(outcome, i) }));
  g.apply(world);
};

const FILL_WRECKS = () => {
  const g = window.__ROAM__;
  const world = g.state;
  world.player.rumored = world.salvage.slice(0, 6).map((stock) => stock.id);
  g.apply(world);
};

const JOURNAL_FILLS = { longest: FILL_LONGEST, notes: FILL_NOTES, past: FILL_PAST, wrecks: FILL_WRECKS };

async function fillJournal(page, kind) {
  const fill = JOURNAL_FILLS[kind];
  if (fill) await page.evaluate(fill, await page.evaluate(HELD_CONTRACTS));
}

const openJournalWith = (kind) => async (page) => {
  await keepWorld(page);
  await fillJournal(page, kind);
  await key(page, 'KeyJ');
  await frames(page);
};

const closeJournalState = async (page) => {
  await escape(page);
  await restoreWorld(page);
};

const openJournalOverScene = async (page) => {
  await keepWorld(page);
  await fillJournal(page, 'longest');
  await openQuestPage(page);
  await key(page, 'KeyJ');
  await frames(page);
};

const closeJournalOverScene = async (page) => {
  await escape(page);
  await closeQuestPage(page);
  await restoreWorld(page);
};

const faultsOf = (kind) => (found) => found.map((text) => ({ kind, path: '', text, sizes: '' }));

const keycapFaults = (page, root, name) =>
  page.evaluate(([root, name]) => [...document.querySelectorAll(`${root} .key, ${root} kbd`)].filter((n) => n.getClientRects().length > 0).map((n) => `keycap ${n.textContent} on the ${name}`), [root, name]);

const cutFaults = (page, selectors) =>
  page.evaluate((selectors) => [...document.querySelectorAll(selectors.join(', '))].filter((n) => n.scrollHeight > n.clientHeight + 1).map((n) => `${n.className} is cut: ${n.scrollHeight} of ${n.clientHeight}`), selectors);

const JOURNAL = '#ui .journal-screen:not([style*="display: none"])';

const journalWindowFaults = (page) =>
  page.evaluate((sel) => {
    const box = document.querySelector(sel).getBoundingClientRect();
    const outside = box.bottom > innerHeight + 1 || box.right > innerWidth + 1 || box.left < -1 || box.top < -1;
    return outside ? ['the journal is outside the window'] : [];
  }, JOURNAL);

const journalSideFaults = (page) =>
  page.evaluate((sel) => {
    const root = document.querySelector(sel);
    const cut = root.scrollHeight > root.clientHeight + 1;
    return root.classList.contains('journal-side') && cut ? [`the side journal is cut: ${root.scrollHeight} of ${root.clientHeight}`] : [];
  }, JOURNAL);

const journalTabFaults = (page) =>
  page.evaluate((sel) => {
    const body = document.querySelector(`${sel} .journal-body`);
    const tabs = document.querySelector(`${sel} .tabs`);
    if (!body || !tabs) return [];
    const before = tabs.getBoundingClientRect().top;
    body.scrollTop = body.scrollHeight;
    const moved = Math.abs(tabs.getBoundingClientRect().top - before) > 1;
    body.scrollTop = 0;
    return moved ? ['the tab row moves when the journal scrolls'] : [];
  }, JOURNAL);

const journalEntryFaults = (page) =>
  page.evaluate((sel) => {
    const body = document.querySelector(`${sel} .journal-body`);
    const open = body?.querySelector('.journal-place.open, .journal-note.open');
    if (!open) return [];
    const cut = open.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom;
    const side = body.closest('.journal-side') !== null && window.innerHeight >= 700;
    return side && cut > 1 ? [`the open entry is cut by ${Math.round(cut)}px inside the side journal`] : [];
  }, JOURNAL);

const journalOverlapFaults = (page) =>
  page.evaluate((sel) => {
    const root = document.querySelector(sel);
    const box = root.getBoundingClientRect();
    const shown = (n) => n.style.visibility !== 'hidden' && n.getClientRects().length > 0;
    const across = (a, b) => Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
    const hit = [...document.querySelectorAll('#ui .dock-panel, #ui .log')].some((n) => shown(n) && across(n.getBoundingClientRect(), box));
    return root.classList.contains('journal-side') && hit ? ['the side journal overlaps a visible panel'] : [];
  }, JOURNAL);

async function journalFaults(page) {
  if (!(await page.evaluate((sel) => document.querySelector(sel) !== null, JOURNAL))) return faultsOf('journal')(['the journal is not open']);
  const checks = [journalWindowFaults(page), journalSideFaults(page), journalTabFaults(page), journalEntryFaults(page), keycapFaults(page, JOURNAL, 'journal'), journalOverlapFaults(page)];
  return faultsOf('journal')((await Promise.all(checks)).flat());
}

const BOARD_KINDS = async ({ offerKinds, heldCount }) => {
  const g = window.__ROAM__;
  const world = g.state;
  const { shopState } = await import('/src/sim/market.ts');
  const { surveySites } = await import('/src/sim/survey.ts');
  const { CONTRACTS } = await import('/src/data/market.ts');
  const sites = surveySites({ hash: world.mapHash, terrain: world.terrain }).filter((s) => s.type !== 'boats').slice(0, 3);
  const at = (id) => ({ id, shop: 'bowl', reward: 90, deadline: world.turn + 600, window: 600, tier: 1 });
  const offers = [
    { ...at('lb-haul'), kind: 'haul', good: 'scrap', units: 3, to: 'nose', rush: true },
    { ...at('lb-order'), kind: 'procure', good: 'water', units: 6, cratePay: 9 },
    { ...at('lb-claim'), kind: 'claim', stockId: 'armyTruck-1', at: { x: 100, y: 50 }, partId: 'p1', defId: 'mg', rivalAt: 9000, rival: null, leads: [] },
    { ...at('lb-search'), kind: 'search', target: 'v-x', driver: 'Jed Cobb', template: 'trader', lead: { at: { x: 1, y: 1 }, turn: 0 }, delivered: false },
    { ...at('lb-escort'), kind: 'escort', client: 'v-gone', to: 'nose', threat: 2, span: 100, together: 40, seen: null, apart: 0, stuck: 0, holdUntil: null },
    { ...at('lb-survey'), kind: 'survey', points: sites.map((s) => ({ site: s.id, found: false, done: false })) },
  ];
  shopState(world, 'bowl').contracts = offerKinds.map((kind) => offers.find((o) => o.kind === kind));
  const held = (i, c) => ({ ...c, id: `lb-held-${i}`, deadline: world.turn + 300 });
  const heldKinds = ['haul', 'escort', 'claim'].slice(0, Math.min(heldCount, CONTRACTS.maxActive));
  world.player.contracts = heldKinds.map((kind, i) => held(i, offers.find((o) => o.kind === kind)));
  g.apply(world);
};

const openBoardKinds = (spec) => async (page) => {
  await keepWorld(page);
  await page.evaluate(BOARD_KINDS, spec);
  await openTown(page, 'contracts');
  await frames(page);
};

const closeBoardKinds = async (page) => {
  await closeTown(page);
  await restoreWorld(page);
};

const BOARD = '.town-page .board';

const boardPageFaults = (page) =>
  page.evaluate((sel) => {
    const scroller = document.querySelector(sel).closest('.ink-scroll');
    return scroller && scroller.scrollHeight > scroller.clientHeight + 1 ? [`the board page scrolls: ${scroller.scrollHeight} of ${scroller.clientHeight}`] : [];
  }, BOARD);

const boardAcceptFaults = (page) =>
  page.evaluate((sel) => {
    const board = document.querySelector(sel);
    const offers = board.querySelectorAll('.board-offers .job').length;
    const accepts = board.querySelectorAll('.board-offers .job button').length;
    return offers === accepts ? [] : [`${offers} offers but ${accepts} Accept buttons`];
  }, BOARD);

async function boardFaults(page) {
  if (!(await page.evaluate((sel) => document.querySelector(sel) !== null, BOARD))) return faultsOf('board')(['the board is not open']);
  const checks = [boardPageFaults(page), cutFaults(page, [`${BOARD} .board-offers`, `${BOARD} .board-held`, `${BOARD} .jobs`]), keycapFaults(page, BOARD, 'board'), boardAcceptFaults(page)];
  return faultsOf('board')((await Promise.all(checks)).flat());
}

const inspectNine = async (page) => {
  await page.evaluate(async () => {
    const g = window.__ROAM__;
    const { runCommand } = await import('/src/ui/console.ts');
    const { makePart } = await import('/src/sim/factory.ts');
    const { mountPart } = await import('/src/sim/inventory.ts');
    const world = structuredClone(runCommand(g.state, 'spawn gunwagon hostile').world);
    g.hud.tips.setOn(false);
    const npc = world.vehicles.filter((v) => v.brain).at(-1);
    world.player.ranks.perception = Math.max(world.player.ranks.perception, 1);
    if (!world.player.perks.includes('spotter')) world.player.perks.push('spotter');
    const ids = ['mg', 'shotgun', 'harpoon', 'mg', 'mg', 'shotgun', 'mg', 'mg', 'shotgun'];
    for (const def of ids) mountPart(world, npc, makePart(world, def, 0));
    g.apply(world);
    g.hovered = npc.id;
    g.refreshInfo();
    g.hitCard.show();
    window.__layoutNpc = npc.id;
  });
  await page.waitForFunction(() => window.__ROAM__.hud.portraitSettled(window.__layoutNpc), null, { timeout: 60000 });
};

const CARD = '#ui .info';

const cardPlaceFaults = (page) =>
  page.evaluate((sel) => {
    const card = document.querySelector(sel).getBoundingClientRect();
    const log = document.querySelector('#ui .log');
    const logShown = log !== null && log.style.visibility !== 'hidden' && log.getClientRects().length > 0;
    return [...(card.bottom > innerHeight + 1 ? ['the card runs below the window'] : []), ...(logShown && log.getBoundingClientRect().top < card.bottom ? ['the card overlaps the log'] : [])];
  }, CARD);

const cardCutFaults = (page) => (page.viewportSize().height >= 720 ? cutFaults(page, ['.hitcard', '.info-column', '.info-body', '.info-content'].map((part) => `${CARD} ${part}`)) : []);

async function cardFaults(page) {
  const shown = await page.evaluate((sel) => document.querySelector(sel)?.style.display !== 'none' && document.querySelector(sel) !== null, CARD);
  if (!shown) return faultsOf('enemy-card')(['the enemy card is not shown']);
  const checks = [cardPlaceFaults(page), cardCutFaults(page), keycapFaults(page, CARD, 'card')];
  return faultsOf('enemy-card')((await Promise.all(checks)).flat());
}

const NAV_STEPS = [
  { name: 'front', go: [] },
  { name: 'garage-buy', go: ['garage'], tab: ['data-garage-tab', 'buyParts'] },
  { name: 'garage-sell', go: ['garage'], tab: ['data-garage-tab', 'sellParts'] },
  { name: 'garage-paint', go: ['garage'], tab: ['data-garage-tab', 'paint'] },
  { name: 'market', go: ['market'] },
  { name: 'board', go: ['board'] },
  { name: 'people', go: ['people'] },
  { name: 'maps', go: ['maps'] },
];

async function openTownClear(page) {
  await page.evaluate(async () => {
    const g = window.__ROAM__;
    const c = await import('/src/sim/cheats.ts');
    const { setWorldVar } = await import('/src/sim/quests.ts');
    const { TOWN_SCENES } = await import('/src/data/quests.ts');
    g.screens.town.close();
    const world = g.state;
    world.player.quests.session = null;
    world.player.quests.live = null;
    for (const scene of TOWN_SCENES) setWorldVar(world, scene.gate, true);
    g.apply(c.teleport(world, c.placeSpot(world, 'bowl')));
    g.screens.town.open();
  });
  await frames(page);
}

function townMarks(page, withError) {
  return page.evaluate((withError) => {
    const box = (node) => {
      const r = node.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height, bottom: r.bottom };
    };
    const root = document.querySelector('.town-page');
    const exit = root.querySelector('.ink-foot [data-town-go]');
    const marks = {
      exit: exit ? box(exit) : null,
      band: box(root.querySelector('.ink-band')),
      heading: box(root.querySelector('.ink-head .quest-place')),
      page: box(root),
    };
    const ui = document.querySelector('#ui');
    const grows = !ui.classList.contains('phone') && !ui.classList.contains('narrow');
    const choices = root.querySelector('.ink-choices');
    const above = choices?.previousElementSibling;
    const spare = above ? choices.getBoundingClientRect().top - above.getBoundingClientRect().bottom : 0;
    return { ...marks, grows, spare, withError };
  }, withError);
}

const FRONT_GAP = 24;
const sameWithin = (a, b) => Math.abs(a - b) <= 1;
const rounded = (n) => Math.round(n);

function moved(label, keys, first, now) {
  return keys.filter((k) => !sameWithin(first[k], now[k])).map((k) => `${label}.${k} ${rounded(first[k])} -> ${rounded(now[k])}`);
}

function exitOutside(now) {
  const { exit, page } = now;
  const inside = exit.y >= page.y - 1 && exit.bottom <= page.bottom + 1 && exit.x >= page.x - 1;
  return inside ? [] : [`exit outside the page (${rounded(exit.bottom)} of ${rounded(page.bottom)})`];
}

function navDiffs(front, section, now) {
  if (!now.exit) return ['no way out in the foot'];
  const same = now.front && now.grows ? [] : [
    ...moved('band', ['h'], section.band, now.band),
    ...moved('heading', ['x', 'y'], section.heading, now.heading),
  ];
  return [...exitOutside(now), ...moved('exit', ['x', 'bottom', 'h'], front.exit, now.exit), ...same];
}

function frontBandFaults(front, section) {
  if (!front.grows) return [];
  const faults = [];
  if (front.band.h < section.band.h - 1) faults.push(`band.h ${rounded(front.band.h)} under section ${rounded(section.band.h)}`);
  if (front.spare > FRONT_GAP) faults.push(`spare ${rounded(front.spare)} above the choices`);
  return faults;
}

const clickIn = (page, step) => page.evaluate(({ go, tab }) => {
  const root = document.querySelector('.town-page');
  const goTo = (id) => root.querySelector(`[data-town-go="${id}"]`)?.click();
  goTo('back');
  for (const id of go) goTo(id);
  if (tab) root.querySelector(`[${tab[0]}="${tab[1]}"]`)?.click();
}, step);

async function townNavFaults(page) {
  const faults = [];
  const note = (path, text, kind = 'nav-moved') => faults.push({ kind, path, text, sizes: '' });
  await openTownClear(page);
  let front = null;
  let section = null;
  for (const step of NAV_STEPS) {
    await clickIn(page, step);
    await frames(page);
    const isFront = step.name === 'front';
    const marks = { ...(await townMarks(page, false)), front: isFront };
    await page.screenshot({ path: `tmp/layout/nav-${step.name}-${page.viewportSize().width}x${page.viewportSize().height}.png` });
    if (isFront) front = marks;
    if (!isFront || !marks.grows) section ??= marks;
    for (const d of navDiffs(front, section ?? marks, marks)) note(step.name, d);
  }
  for (const d of frontBandFaults(front, section)) note('front', d, 'front-band');
  await clickIn(page, NAV_STEPS[0]);
  await frames(page);
  await page.evaluate(async () => {
    const town = window.__ROAM__.screens.town;
    const { t } = await import('/src/text/msg.ts');
    town.error = t('town.reason.onCall');
    town.render();
  });
  await frames(page);
  const errored = { ...(await townMarks(page, true)), front: true };
  for (const d of navDiffs(front, section, errored)) note('status-line', d);
  await openTownClear(page);
  return faults;
}

async function nestedScrollFaults(page) {
  const found = await page.evaluate(() => {
    const scrolls = (n) => /auto|scroll/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 1;
    const name = (n) => `${n.tagName.toLowerCase()}.${String(n.className).split(' ')[0]}`;
    const root = document.querySelector('.town-page, .modal:not([style*="display: none"])');
    if (!root || innerWidth < 1000) return [];
    const faults = [...root.querySelectorAll('*')].filter(scrolls).filter((n) => {
      for (let p = n.parentElement; p && p !== document.body; p = p.parentElement) if (scrolls(p)) return true;
      return false;
    }).map((n) => `${name(n)} scrolls inside another scroll area`);
    for (const shop of root.querySelectorAll('.town-shop')) if (!shop.querySelector(':scope > .shop-body')) faults.push('a shop column has no .shop-body');
    for (const n of root.querySelectorAll('*')) if (scrolls(n) && !n.matches('.shop-body, .truck-body') && !n.closest('.shop-body, .truck-body')) faults.push(`${name(n)} scrolls and is not a column body`);
    const page = root.querySelector('.ink-scroll');
    if (page && scrolls(page)) faults.push('the town page scrolls as a whole');
    const body = root.querySelector('.shop-body');
    const tabs = root.querySelector('.town-shop > .tabs');
    if (body && tabs) {
      const before = tabs.getBoundingClientRect().top;
      body.scrollTop = body.scrollHeight;
      if (Math.abs(tabs.getBoundingClientRect().top - before) > 1) faults.push('the tab row moves when the list scrolls');
      body.scrollTop = 0;
    }
    return faults;
  });
  return found.map((text) => ({ kind: 'nested-scroll', path: '', text, sizes: '' }));
}

async function openGarageStorage(page) {
  await page.evaluate(async () => {
    window.__layoutWorld = structuredClone(window.__ROAM__.state);
    const { makePart } = await import('/src/sim/factory.ts');
    const g = window.__ROAM__;
    const world = structuredClone(g.state);
    const { PARTS } = await import('/src/data/parts.ts');
    const ids = (Array.isArray(PARTS) ? PARTS : Object.values(PARTS)).map((part) => part.id).slice(0, 8);
    for (const id of ids) world.player.storage.push(makePart(world, id, 0));
    g.apply(world);
  });
  await openTown(page, 'trucks');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const chip = document.querySelector('.inv-storage .inv-chip');
    chip?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 1, clientY: 1 }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 1, clientY: 1 }));
  });
  await page.waitForTimeout(300);
}

async function closeGarageStorage(page) {
  await closeTown(page);
  await page.evaluate(() => window.__ROAM__.apply(window.__layoutWorld));
}

async function hostedColumnFaults(page) {
  const found = await page.evaluate(() => {
    if (innerWidth < 1000) return [];
    const name = (n) => `${n.tagName.toLowerCase()}.${String(n.className).split(' ')[0]}`;
    const faults = [];
    for (const box of document.querySelectorAll('.truck-body .inv-side > *')) {
      if (box.scrollHeight > box.clientHeight + 1) faults.push(`${name(box)} is shorter than its content`);
      const bottom = box.getBoundingClientRect().bottom;
      for (const row of box.querySelectorAll('.inv-chip, .inv-details, .action-rows')) if (row.getBoundingClientRect().bottom > bottom + 1) faults.push(`${name(row)} draws below ${name(box)}`);
    }
    return faults;
  });
  const nested = await nestedScrollFaults(page);
  return [...found.map((text) => ({ kind: 'hosted-column', path: '', text, sizes: '' })), ...nested];
}

const BENCH_AUDIT = () => {
  const frame = document.querySelector('.inventory-screen');
  const m = frame.getBoundingClientRect();
  const all = (sel) => [...frame.querySelectorAll(sel)];
  const middle = (node) => { const r = node.getBoundingClientRect(); return (r.top + r.bottom) / 2; };
  const scrolls = (n) => ['auto', 'scroll'].includes(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 1;
  const widths = (rows) => new Set([...rows.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().width))).size;
  const tops = all('.well, .inv-truck-name').map((n) => Math.round(n.getBoundingClientRect().top));
  const title = frame.querySelector('.inv-title');
  const close = frame.querySelector('.close');
  return [
    m.bottom > innerHeight + 1 || m.right > innerWidth + 1 || m.left < -1 ? ['frame outside the window'] : [],
    all('.inv-side-column, .inv-middle, .well, .inv-details > .stat-grid').concat(frame).filter(scrolls).map((n) => `scroll in ${n.className}`),
    all('.well > *, .inv-grid').filter((n) => n.getBoundingClientRect().bottom > m.bottom + 1).map((n) => `cut off ${n.className}`),
    Math.abs(middle(title) - middle(close)) > 2 ? ['Close is off the title row'] : [],
    Math.max(...tops) - Math.min(...tops) > 1 ? [`column tops ${tops}`] : [],
    all('.inv-inspection .action-rows').filter((rows) => widths(rows) > 1).map(() => 'action buttons differ in width'),
    all('button, b, .stat-val, .stat-name').filter((n) => n.scrollWidth > n.clientWidth + 1 && n.clientWidth > 0).map((n) => `clipped ${n.textContent.slice(0, 24)}`),
  ].flat();
};

async function benchFaultsOn(page, where) {
  const found = [];
  const ids = await page.evaluate(() => [...new Set([...document.querySelectorAll('.inv-grid [data-item-id]')].map((n) => n.dataset.itemId))]);
  for (const id of [null, ...ids]) {
    if (id) await page.evaluate((i) => document.querySelector(`.inv-grid [data-item-id="${i}"]`)?.click(), id);
    for (const text of await page.evaluate(BENCH_AUDIT)) found.push(`${where} ${id ?? 'nothing picked'}: ${text}`);
  }
  return found;
}

async function inventoryBenchFaults(page) {
  if (await page.evaluate(() => document.querySelector('#ui').classList.contains('phone'))) return [];
  await page.evaluate(() => { window.__layoutWorld = window.__ROAM__.state; });
  const found = await benchFaultsOn(page, 'start truck');
  await page.evaluate(async () => {
    const g = window.__ROAM__;
    const cheats = await import('/src/sim/cheats.ts');
    let w = g.state;
    const chassis = (x) => x.vehicles.find((v) => v.id === x.player.vehicleId).chassisId;
    for (let i = 0; i < 2000 && chassis(w) !== 'sorokonoga'; i++) w = cheats.randomKit(w, 3);
    if (chassis(w) !== 'sorokonoga') throw new Error('No sorokonoga kit in 2000 rolls');
    g.apply(w);
  });
  await frames(page);
  found.push(...(await benchFaultsOn(page, 'sorokonoga')));
  await page.evaluate(() => { window.__ROAM__.apply(window.__layoutWorld); });
  await frames(page);
  return found.map((text) => ({ kind: 'inventory-bench', path: '', text, sizes: '' }));
}

const ONE_WINDOW = [VIEWPORTS[0]];

async function openInventoryGun(page) {
  await key(page, 'KeyI');
  await page.evaluate(() => document.querySelector('.inv-item.mounted.drawn').click());
}

async function openShopRow(page) {
  await openTown(page, 'buyParts');
  await page.evaluate(() => document.querySelector('.town-page .part-sum').click());
}

async function openBoardTaken(page) {
  await page.evaluate(() => { window.__layoutWorld = structuredClone(window.__ROAM__.state); });
  await openTown(page, 'contracts');
  await page.locator('.town-page button', { hasText: 'Accept' }).first().click();
}

const closeThenRestoreWorld = (close) => async (page) => {
  await close(page);
  await page.evaluate(() => { window.__ROAM__.apply(window.__layoutWorld); });
};

async function openLoot(page) {
  await page.evaluate(() => {
    const g = window.__ROAM__;
    g.screens.inventory.openLoot(g.state.salvage[0].id);
  });
}

async function openLookedOver(page) {
  await page.evaluate(async () => {
    const g = window.__ROAM__;
    const { runCommand } = await import('/src/ui/console.ts');
    const world = structuredClone(runCommand(g.state, 'spawn gunwagon hostile').world);
    const npc = world.vehicles.filter((v) => v.brain).at(-1);
    world.states.push({ id: 'layout-sized-up', kind: 'sizedUp', holder: world.player.vehicleId, other: npc.id, turnsLeft: 99, born: world.turn, data: { kind: 'none' } });
    g.apply(world);
    g.screens.inventory.openLookedOver(g.state, npc.id);
  });
}

async function openNewGameScreen(page) {
  await openStartMenu(page);
  await page.locator('.start-menu .btn-l', { hasText: 'New game' }).click();
}

async function closeNewGameScreen(page) {
  await escape(page);
  await closeStartMenu(page);
}

const closeDeath = (page) => page.evaluate(() => {
  const { death } = window.__ROAM__;
  death.root.remove();
  death.root = null;
});

const STATES = {
  menu: { setup: () => undefined, viewports: [...VIEWPORTS, PHONE, PHONE_LANDSCAPE] },
  log: { setup: fillLog },
  inventory: { setup: openInventory, teardown: escape, check: inventoryBenchFaults, viewports: [...VIEWPORTS, PHONE, PHONE_LANDSCAPE] },
  'quest-page': { setup: openQuestPage, teardown: closeQuestPage, viewports: [...VIEWPORTS, PHONE, PHONE_LANDSCAPE] },
  'quest-inventory': { setup: openQuestInventory, teardown: async (page) => { await escape(page); await closeQuestPage(page); } },
  shop: { setup: (page) => openTown(page, 'buyParts'), teardown: closeTown, viewports: [...VIEWPORTS, PHONE, PHONE_LANDSCAPE], check: nestedScrollFaults },
  trade: { setup: (page) => openTown(page, 'market'), teardown: closeTown, viewports: [...VIEWPORTS, PHONE, PHONE_LANDSCAPE], check: nestedScrollFaults },
  'full-shop': { setup: (page) => page.evaluate(() => window.__ROAM__.openFullShop()), teardown: escape, viewports: [...VIEWPORTS, PHONE, PHONE_LANDSCAPE], check: nestedScrollFaults },
  'trade-shortage': { setup: openShortMarket, teardown: closeTown, check: nestedScrollFaults },
  charts: { setup: (page) => openTown(page, 'charts'), teardown: closeTown, check: nestedScrollFaults },
  'journal-survey': { setup: openSurveyJournal, teardown: closeSurveyJournal, viewports: [...JOURNAL_VIEWPORTS, PHONE], check: journalFaults },
  'journal-empty': { setup: openJournalWith('empty'), teardown: closeJournalState, viewports: JOURNAL_VIEWPORTS, check: journalFaults },
  'journal-longest': { setup: openJournalWith('longest'), teardown: closeJournalState, viewports: JOURNAL_VIEWPORTS, check: journalFaults },
  'journal-wrecks': { setup: openJournalWith('wrecks'), teardown: closeJournalState, viewports: JOURNAL_VIEWPORTS, check: journalFaults },
  'journal-notes': { setup: openJournalWith('notes'), teardown: closeJournalState, viewports: JOURNAL_VIEWPORTS, check: journalFaults },
  'journal-past': { setup: openJournalWith('past'), teardown: closeJournalState, viewports: JOURNAL_VIEWPORTS, check: journalFaults },
  'journal-over-scene': { setup: openJournalOverScene, teardown: closeJournalOverScene, viewports: JOURNAL_VIEWPORTS, check: journalFaults },
  'world-map': { setup: (page) => key(page, 'KeyM'), teardown: escape },
  minimap: { setup: (page) => setMinimap(page, true), teardown: (page) => setMinimap(page, false) },
  garage: { setup: (page) => openTown(page, 'trucks'), teardown: closeTown, check: nestedScrollFaults },
  'garage-storage': { setup: openGarageStorage, teardown: closeGarageStorage, check: hostedColumnFaults },
  'town-front': { setup: (page) => openTown(page, 'front'), teardown: closeTown, viewports: [...VIEWPORTS, PHONE, PHONE_LANDSCAPE] },
  'town-board': { setup: (page) => openTown(page, 'contracts'), teardown: closeTown, viewports: JOURNAL_VIEWPORTS, check: boardFaults },
  'board-kinds': { setup: openBoardKinds({ offerKinds: ['haul', 'procure', 'escort'], heldCount: 2 }), teardown: closeBoardKinds, viewports: JOURNAL_VIEWPORTS, check: boardFaults },
  'board-kinds-more': { setup: openBoardKinds({ offerKinds: ['claim', 'search', 'survey'], heldCount: 1 }), teardown: closeBoardKinds, viewports: JOURNAL_VIEWPORTS, check: boardFaults },
  'board-full': { setup: openBoardKinds({ offerKinds: ['haul', 'claim', 'survey'], heldCount: 3 }), teardown: closeBoardKinds, viewports: JOURNAL_VIEWPORTS, check: boardFaults },
  'town-nav': { setup: openTownClear, teardown: closeTown, check: townNavFaults, viewports: [...VIEWPORTS, TALL, PHONE, PHONE_LANDSCAPE] },
  'town-people': { setup: (page) => openTown(page, 'people'), teardown: closeTown },
  paint: { setup: (page) => openTown(page, 'paint'), teardown: closeTown, check: nestedScrollFaults },
  'call-hub': { setup: (page) => openCall(page, 'hub'), teardown: hangUp },
  'call-group': { setup: (page) => openCall(page, 'group'), teardown: hangUp },
  'call-attacker': { setup: (page) => openCall(page, 'attacker'), teardown: hangUp },
  'call-directions': { setup: (page) => openCall(page, 'directions'), teardown: hangUp },
  'call-deal': { setup: (page) => openCall(page, 'deal'), teardown: hangUp },
  help: { setup: openHelp, teardown: closeHelp },
  character: { setup: (page) => key(page, 'KeyC'), teardown: escape, viewports: [...VIEWPORTS, PHONE, PHONE_LANDSCAPE] },
  saves: { setup: openSaves, teardown: escape },
  options: { setup: openOptions, teardown: escape },
  'start-menu': { setup: openStartMenu, teardown: closeStartMenu },
  'start-load': { setup: openStartLoad, teardown: closeStartMenu },
  'start-options': { setup: openStartOptions, teardown: async (page) => { await escape(page); await closeStartMenu(page); } },
  inspect: { setup: (page) => inspectNpc(page, true), teardown: clearInspect, viewports: INSPECT_VIEWPORTS, check: cardFaults },
  'inspect-unarmed': { setup: (page) => inspectNpc(page, false), teardown: clearInspect, viewports: INSPECT_VIEWPORTS, check: cardFaults },
  'inspect-nine': { setup: inspectNine, teardown: clearInspect, viewports: INSPECT_VIEWPORTS, check: cardFaults },
  'inventory-empty': { setup: (page) => key(page, 'KeyI'), teardown: escape, viewports: ONE_WINDOW },
  'inventory-gun': { setup: openInventoryGun, teardown: escape, viewports: ONE_WINDOW },
  'shop-sell': { setup: (page) => openTown(page, 'sellParts'), teardown: closeTown, viewports: ONE_WINDOW },
  'shop-row-open': { setup: openShopRow, teardown: closeTown, viewports: ONE_WINDOW },
  'board-taken': { setup: openBoardTaken, teardown: closeThenRestoreWorld(closeTown), viewports: ONE_WINDOW },
  'look-over': { setup: openLookedOver, teardown: escape, viewports: ONE_WINDOW },
  loot: { setup: openLoot, teardown: escape, viewports: ONE_WINDOW },
};

const GALLERY_ONLY = {
  'new-game': { setup: openNewGameScreen, teardown: closeNewGameScreen, viewports: ONE_WINDOW },
  death: { setup: (page) => page.evaluate(() => { const g = window.__ROAM__; g.death.show(g.state); }), teardown: closeDeath, viewports: ONE_WINDOW },
};

const ONLY = process.env.LAYOUT_STATES?.split(',');
const ALL_STATES = GALLERY ? { ...Object.fromEntries(Object.entries(STATES).filter(([name]) => name !== 'town-nav')), ...GALLERY_ONLY } : STATES;
const PICKED = Object.entries(ALL_STATES).filter(([name]) => !ONLY || name === 'log' || ONLY.includes(name));

const ONLY_SIZES = process.env.LAYOUT_SIZES?.split(',').filter(Boolean);
const WINDOWS = [...new Set(PICKED.flatMap(([, state]) => state.viewports ?? VIEWPORTS))].filter((v) => !ONLY_SIZES || ONLY_SIZES.includes(v.join('x')));

const started = Date.now();
const seconds = () => Math.round((Date.now() - started) / 1000);
const report = [];
let captures = 0;

async function takeShot(page, file) {
  if (!GALLERY) return page.screenshot({ path: `${OUT}/${file}.png` });
  await page.waitForTimeout(FADE_MS);
  return page.screenshot({ path: `${OUT}/${file}.jpg`, type: 'jpeg', quality: 85 });
}

const isGalleryFiller = (name) => GALLERY && ONLY && !ONLY.includes(name);
const windowLabel = (width, height, size) => (size === 1 ? `${width}x${height}` : `${width}x${height}-ui${Math.round(size * 100)}`);
const stateFaults = async (page, state) => (state.check ? state.check(page) : []);

async function recordFaults(page, locale, label, name, state) {
  for (const f of [...await faultsIn(page, locale), ...await frameFaults(page), ...await stateFaults(page, state)]) report.push({ state: name, locale, viewport: label, ...f });
}

async function leaveState(page, state) {
  if (state.teardown) await state.teardown(page);
  await frames(page);
}

async function capture(page, locale, [width, height], [name, state], size = 1) {
  await state.setup(page);
  if (isGalleryFiller(name)) return;
  await page.evaluate(() => document.fonts.ready);
  await frames(page);
  const label = windowLabel(width, height, size);
  await takeShot(page, GALLERY ? name : `${name}-${locale}-${label}`);
  await recordFaults(page, locale, label, name, state);
  captures++;
  console.log(`${name} ${locale} ${label} at ${seconds()} s`);
  await leaveState(page, state);
}

async function checkLocale(page, locale) {
  await page.evaluate((l) => window.__ROAM__.language.set(l), locale);
  await probe(page, locale);
  for (const viewport of WINDOWS) {
    await page.setViewportSize({ width: viewport[0], height: viewport[1] });
    for (const entry of PICKED.filter(([, state]) => (state.viewports ?? VIEWPORTS).includes(viewport))) await capture(page, locale, viewport, entry);
  }
}

const SIZE_STATES = ['menu', 'inventory', 'shop', 'options'];
const SIZE_PASSES = [[[1280, 720], 1.3], [[1280, 720], 0.8], [[640, 360], 1]];

const setUiSize = (page, size) => page.evaluate(async (s) => (await import('/src/ui/ui-size.ts')).uiSize().set(s), size);

async function checkUiSizes(page) {
  await page.evaluate((l) => window.__ROAM__.language.set(l), 'en');
  for (const [viewport, size] of SIZE_PASSES) {
    await page.setViewportSize({ width: viewport[0], height: viewport[1] });
    await setUiSize(page, size);
    const applied = await page.evaluate(async () => (await import('/src/ui/ui-size.ts')).uiSize().applied());
    if (applied !== size) report.push({ state: '-', locale: 'en', viewport: viewport.join('x'), kind: 'size-not-applied', path: '', text: `asked ${size}, applied ${applied}`, sizes: '' });
    for (const entry of Object.entries(STATES).filter(([name]) => SIZE_STATES.includes(name))) await capture(page, 'en', viewport, entry, size);
  }
  await setUiSize(page, 1);
}

await mkdir(OUT, { recursive: true });
const { browser, page, errors } = await boot();
console.log(`booted at ${seconds()} s`);
try {
  for (const locale of LOCALES) await checkLocale(page, locale);
  if (!ONLY && !GALLERY) await checkUiSizes(page);
} finally {
  await browser.close();
}
for (const e of errors) report.push({ state: '-', locale: '-', viewport: '-', kind: 'page-error', path: '', text: e, sizes: '' });
if (!GALLERY) await writeFile(`${OUT}/faults.json`, JSON.stringify(report, null, 1));
for (const f of report) console.log(`${f.state} ${f.locale} ${f.viewport} ${f.kind} ${f.path}: ${JSON.stringify(f.text)} ${f.sizes}`);
console.log(`${captures} captures, ${report.length} faults, ${seconds()} s. Screens in ${OUT}/.`);
process.exit(report.length > 0 ? 1 : 0);
