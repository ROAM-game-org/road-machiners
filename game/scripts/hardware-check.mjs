import { inkFaults } from './ink-check.mjs';

export const NEAR_MISS = 24;
export const BAR = { maxHeight: 10, minWidth: 24 };
export const SCREEN_PAD = 12;
export const MIN_LINES = 1.8;
const ROW_GAP = 4;

const SELECTORS = {
  window: '.dialog, .ink-page, .confirm-dialog, #ui > .panel, .modal, .hud-panel, .journal-side',
  screen: '.hud-screen, .screen-block, .well, input, textarea, select',
  readout: '.chip, .chip-screen, .cost, .ink-chips *, .scroll-wheel',
  cap: 'button, kbd, .key',
  fixedLabel: 'kbd, .option-switch > button',
  edgeToEdge: 'input, textarea, select, .minimap-body, .map-tab',
};

export const FIXED_GROUPS = {
  call: { window: '.dialogue', states: ['call-hub', 'call-deal', 'call-directions', 'call-group', 'call-attacker', 'call-story'] },
  board: { window: '.town-page', states: ['town-board', 'board-full', 'board-kinds', 'board-kinds-more', 'board-taken'] },
  inventory: { window: '.inventory-screen', states: ['inventory', 'inventory-gun', 'inventory-empty'] },
  journal: { window: '.journal-side', states: ['journal-longest', 'journal-empty', 'journal-notes', 'journal-past', 'journal-survey', 'journal-wrecks'] },
  outpost: { window: '.outpost-screen', states: ['outpost-buyParts-hauler', 'outpost-buyParts-truck', 'outpost-market-hauler', 'outpost-market-truck', 'outpost-paint-hauler', 'outpost-paint-truck', 'outpost-sellParts-hauler', 'outpost-sellParts-truck', 'outpost-trucks-hauler', 'outpost-trucks-truck'] },
  yard: { window: '.town-page', states: ['garage', 'garage-full', 'garage-storage', 'garage-full-sorokonoga', 'paint'] },
  trade: { window: '.town-page', states: ['trade', 'trade-shortage', 'trade-untraded'] },
  shop: { window: '.town-page', states: ['shop', 'shop-sell', 'shop-row-open'] },
  inspect: { window: '.info', states: ['inspect', 'inspect-unarmed', 'inspect-hauler', 'inspect-nine'] },
};

function inPage({ sel, near, bar, pad, minLines, rowGap, groupWindow }) {
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && Number(s.opacity) > 0;
  };
  const art = (n) => getComputedStyle(n).borderImageSource;
  const isScreen = (n) => n.matches(sel.screen) || art(n).includes('/screen@') || art(n).includes('/input@');
  const insideScreen = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) if (isScreen(n)) return true;
    return false;
  };
  const scrolls = (n) => ['auto', 'scroll'].includes(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 1;
  const scrollsWithin = (el, win) => {
    for (let n = el.parentElement; n && n !== win; n = n.parentElement) if (scrolls(n)) return true;
    return false;
  };
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
  const name = (el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`;
  const outerScreens = (win) => [...win.querySelectorAll('*')].filter((s) => isScreen(s) && shown(s) && !insideScreen(s));
  const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 1;
  const sideBySide = (a, b) => !overlap(a.l, a.r, b.l, b.r) && overlap(a.t, a.b, b.t, b.b);
  const contains = (a, b) => a.t <= b.t + 1 && a.b >= b.b - 1;
  const spans = (a, b) => (Math.abs(a.t - b.t) <= 1 || Math.abs(a.b - b.b) <= 1) && (contains(a, b) || contains(b, a));
  const unlevel = (a, b) => (Math.abs(a.t - b.t) > 1 || Math.abs(a.b - b.b) > 1) && !spans(a, b);
  const nearMiss = (x, y) => Math.abs(x - y) > 1 && Math.abs(x - y) < near;
  const missedEdge = (a, b) => ['l', 't', 'r', 'b'].find((k) => nearMiss(a[k], b[k]));
  const pairFault = (a, b) => {
    if (sideBySide(a.rect, b.rect) && unlevel(a.rect, b.rect)) return { kind: 'screen-grid', path: `${a.name} | ${b.name}`, text: `side by side with tops ${Math.round(a.rect.t)},${Math.round(b.rect.t)} and bottoms ${Math.round(a.rect.b)},${Math.round(b.rect.b)}` };
    const edge = missedEdge(a.rect, b.rect);
    return edge ? { kind: 'screen-grid', path: `${a.name} | ${b.name}`, text: `${edge} edges ${Math.round(a.rect[edge])},${Math.round(b.rect[edge])} miss the grid` } : null;
  };
  const pairs = (list) => list.flatMap((a, i) => list.slice(i + 1).map((b) => [a, b]));
  const gridFaults = (win) => {
    const screens = outerScreens(win).filter((s) => !s.matches(sel.readout));
    const fixed = screens.filter((s) => !scrollsWithin(s, win)).map((s) => ({ name: name(s), rect: rectOf(s) }));
    const moving = screens.filter((s) => scrollsWithin(s, win)).map((s) => ({ kind: 'screen-scrolls', path: name(s), text: 'a screen moves inside a scrolling list' }));
    return [...moving, ...pairs(fixed).map(([a, b]) => pairFault(a, b)).filter(Boolean)];
  };
  const isCap = (el) => el.matches(sel.cap) && art(el) !== 'none' && shown(el);
  const capFault = (cap) => {
    const bare = cap.cloneNode(true);
    bare.querySelectorAll('.priced .price').forEach((price) => price.remove());
    const words = bare.innerText.replace(/\[[^\]]*\]/g, '');
    if (/\d/.test(words)) return { kind: 'key-state', path: name(cap), text: `the key prints ${words.trim().replace(/\s+/g, ' ').slice(0, 30)}` };
    return cap.querySelector('img, canvas, .chassis-portrait') ? { kind: 'key-state', path: name(cap), text: 'the key shows a picture of the game' } : null;
  };
  const keyFaults = (win) => [...win.querySelectorAll('*')].filter((el) => isCap(el) && !el.matches(sel.fixedLabel)).map(capFault).filter(Boolean);
  const alpha = (c) => { const n = c.match(/[\d.]+/g) ?? []; return n.length === 3 ? 1 : Number(n[3] ?? 0); };
  const filled = (s) => alpha(s.backgroundColor) > 0.05 || s.backgroundImage.includes('gradient');
  const barLike = (el) => {
    const r = el.getBoundingClientRect();
    return r.height >= 1 && r.height <= bar.maxHeight && r.width >= bar.minWidth && !el.textContent.trim() && !el.closest('.inv-grid') && filled(getComputedStyle(el));
  };
  const barFaults = (win) => [...win.querySelectorAll('*')].filter((el) => shown(el) && barLike(el) && !barLike(el.parentElement)).map((el) => ({ kind: 'flat-bar', path: name(el), text: `a flat bar ${Math.round(el.getBoundingClientRect().width)} px wide` }));
  const columnMiss = (a, b) => (nearMiss(a.l, b.l) || (Math.abs(a.l - b.l) <= 1 && Math.abs(a.r - b.r) > 1) ? a : null);
  const rowFaults = (screen) => {
    const buttons = [...screen.querySelectorAll('.screen-btn')].filter(shown).map((b) => ({ name: name(b), rect: rectOf(b) }));
    return pairs(buttons).filter(([a, b]) => columnMiss(a.rect, b.rect)).map(([a, b]) => ({ kind: 'row-grid', path: `${a.name} | ${b.name}`, text: `buttons at ${Math.round(a.rect.l)} to ${Math.round(a.rect.r)} and ${Math.round(b.rect.l)} to ${Math.round(b.rect.r)} miss one column` }));
  };
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const isContent = (el) => shown(el) && (ownText(el) || el.matches('img, canvas, button, .icon'));
  const insets = (r, box) => [r.l - box.l, box.r - r.r, r.t - box.t, box.b - r.b];
  const insetOf = (el, screen, box) => Math.min(...insets(rectOf(el), box).slice(0, scrollsWithin(el, screen.parentElement) ? 2 : 4));
  const padFault = (screen) => {
    const box = rectOf(screen);
    const close = [...screen.querySelectorAll('*')].filter(isContent).map((el) => ({ el, inset: insetOf(el, screen, box) })).find((c) => c.inset < pad - 1);
    return close ? [{ kind: 'screen-pad', path: `${name(screen)} > ${name(close.el)}`, text: `content sits ${Math.round(close.inset)} px from the rim, the screen pad is ${pad}` }] : [];
  };
  const textScreens = (win) => outerScreens(win).filter((s) => !s.matches(sel.readout) && !s.matches(sel.edgeToEdge));
  const padFaults = (win) => textScreens(win).flatMap(padFault);
  const innerHeight = (s, st) => s.getBoundingClientRect().height - parseFloat(st.paddingTop) - parseFloat(st.paddingBottom);
  const lineHeight = (st) => (st.lineHeight === 'normal' ? parseFloat(st.fontSize) * 1.2 : parseFloat(st.lineHeight));
  const textTops = (s) => {
    const walker = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    const tops = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      range.selectNodeContents(n);
      tops.push(...[...range.getClientRects()].filter((r) => r.height > 0).map((r) => r.top));
    }
    return tops;
  };
  const textRows = (s) => textTops(s).sort((a, b) => a - b).filter((top, i, all) => i === 0 || top - all[i - 1] > rowGap).length;
  const oneLine = (s) => { const st = getComputedStyle(s); return Boolean(s.innerText.trim()) && innerHeight(s, st) < minLines * lineHeight(st) && textRows(s) < 2; };
  const lineFaults = (win) => textScreens(win).filter(oneLine).map((s) => ({ kind: 'screen-one-line', path: name(s), text: `a screen ${Math.round(s.getBoundingClientRect().height)} px high holds one line` }));
  const desktop = !document.querySelector('#ui.narrow, #ui.tight');
  const layoutFaults = (win) => (desktop ? [...gridFaults(win), ...outerScreens(win).flatMap(rowFaults)] : []);
  const screenFaults = (win) => (desktop ? [...padFaults(win), ...lineFaults(win)] : []);
  const windowFaults = (win) => [...layoutFaults(win), ...screenFaults(win), ...keyFaults(win), ...barFaults(win)];
  const tops = [...document.querySelectorAll(sel.window)].filter((w) => shown(w) && !w.parentElement.closest(sel.window));
  const fixedOf = (win) => [{ name: name(win), rect: rectOf(win) }, ...outerScreens(win).map((s) => ({ name: name(s), rect: rectOf(s) }))];
  const group = groupWindow ? [...document.querySelectorAll(groupWindow)].find(shown) : null;
  return { faults: tops.flatMap(windowFaults), fixed: group ? fixedOf(group) : null, compares: desktop, label: `${document.documentElement.lang} ${innerWidth}x${innerHeight}` };
}

const firstSeen = new Map();
const groupOf = (state) => Object.entries(FIXED_GROUPS).find(([, g]) => g.states.includes(state));
const moved = (a, b) => ['l', 't', 'r', 'b'].some((k) => Math.abs(a.rect[k] - b.rect[k]) > 1);
const size = (s) => `${Math.round(s.rect.r - s.rect.l)}x${Math.round(s.rect.b - s.rect.t)} at ${Math.round(s.rect.l)},${Math.round(s.rect.t)}`;

function fixedFaults(group, state, { fixed, label }) {
  if (!fixed) return [{ kind: 'screen-changes', path: FIXED_GROUPS[group].window, text: 'the window of the group is not shown' }];
  const key = `${group} ${label}`;
  const base = firstSeen.get(key);
  if (!base) {
    firstSeen.set(key, { state, fixed });
    return [];
  }
  if (base.fixed.length !== fixed.length) return [{ kind: 'screen-changes', path: FIXED_GROUPS[group].window, text: `${fixed.length - 1} screens, ${base.state} has ${base.fixed.length - 1}` }];
  return fixed.map((s, i) => [s, base.fixed[i]]).filter(([s, b]) => moved(s, b)).map(([s, b]) => ({ kind: 'screen-changes', path: s.name, text: `${size(s)}, in ${base.state} ${size(b)}` }));
}

export async function hardwareFaults(page, state, locale, viewport) {
  const group = groupOf(state);
  const seen = await page.evaluate(inPage, { sel: SELECTORS, near: NEAR_MISS, bar: BAR, pad: SCREEN_PAD, minLines: MIN_LINES, rowGap: ROW_GAP, groupWindow: group ? group[1].window : null });
  return [...await inkFaults(page), ...[...seen.faults, ...(group && seen.compares && locale !== 'pseudo' ? fixedFaults(group[0], state, { ...seen, label: `${locale} ${viewport}` }) : [])].map((f) => ({ sizes: '', ...f }))];
}
