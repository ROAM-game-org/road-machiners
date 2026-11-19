export const INK_SURFACES = {
  screen: ['--hud-amber', '--hud-amber-soft', '--hud-amber-faint', '--hud-lamp-green', '--hud-hot'],
  inverse: ['--hud-screen'],
  metal: ['--hud-print-coal'],
  tape: ['--hud-print-ink'],
  cap: ['--hud-print', '--hud-print-dim'],
};

export const SLAB_SHARE = 0.85;

const SELECTORS = {
  window: '.dialog, .ink-page, .confirm-dialog, #ui > .panel, .modal, .notice, .dialogue',
  screen: '.hud-screen, .screen-block, .well, input, textarea, select',
  tape: '.tape, .tape-print, .kit-tape, .slot-tape',
};

function inPage({ surfaces, slabShare, sel }) {
  const probe = document.createElement('span');
  document.body.append(probe);
  const toRgb = (value) => {
    probe.style.color = value;
    return getComputedStyle(probe).color;
  };
  const tokenRgb = (name) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!value) throw new Error(`ink check: token ${name} is not defined`);
    return toRgb(value);
  };
  const allowed = Object.fromEntries(Object.entries(surfaces).map(([k, names]) => [k, names.map(tokenRgb)]));
  probe.remove();
  const parse = (c) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const near = (a, b) => parse(a).every((x, i) => Math.abs(x - parse(b)[i]) <= 6);
  const isAmberFill = (n) => near(getComputedStyle(n).backgroundColor, allowed.screen[0]) && getComputedStyle(n).backgroundColor !== 'rgba(0, 0, 0, 0)';
  const isCap = (el) => {
    const cap = el.closest('button, kbd, .key');
    return Boolean(cap) && getComputedStyle(cap).borderImageSource !== 'none';
  };
  const isScreen = (n) => n.matches(sel.screen) || getComputedStyle(n).borderImageSource.includes('/screen@') || getComputedStyle(n).borderImageSource.includes('/input@');
  const glassOf = (el) => {
    for (let n = el; n && !n.matches(sel.window); n = n.parentElement) {
      if (isAmberFill(n)) return 'inverse';
      if (isScreen(n)) return 'screen';
    }
    return 'metal';
  };
  const surfaceOf = (el) => {
    if (isCap(el)) return 'cap';
    if (el.closest(sel.tape)) return 'tape';
    return glassOf(el);
  };
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && Number(s.opacity) > 0;
  };
  const ownWords = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
  const area = (el) => el.getBoundingClientRect().width * el.getBoundingClientRect().height;
  const slabFaults = (win) => {
    const outer = [...win.querySelectorAll('*')].filter((s) => isScreen(s) && shown(s) && !s.parentElement.closest(sel.screen));
    const share = outer.reduce((sum, s) => sum + area(s), 0) / area(win);
    const faults = [];
    if (getComputedStyle(win).borderImageSource.includes('slate')) faults.push({ kind: 'slab', path: win.className, text: 'window drawn with the slate screen piece' });
    if (share > slabShare) faults.push({ kind: 'slab', path: win.className, text: `screens cover ${Math.round(share * 100)}% of the window` });
    return faults;
  };
  const nestedFaults = (win) => [...win.querySelectorAll('.screen-block, .hud-screen')]
    .filter((s) => shown(s) && s.parentElement.closest('.screen-block, .hud-screen'))
    .map((s) => ({ kind: 'screen-in-screen', path: s.className, text: '' }));
  const inkFault = (el) => {
    const words = ownWords(el);
    if (!words || !shown(el)) return null;
    const surface = surfaceOf(el);
    const color = getComputedStyle(el).color;
    if (allowed[surface].some((a) => near(a, color))) return null;
    return { kind: 'ink-off-surface', path: `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`, text: `${words.slice(0, 40)} is ${color} on ${surface}` };
  };
  const windowFaults = (win) => [...slabFaults(win), ...nestedFaults(win), ...[...win.querySelectorAll('*')].map(inkFault).filter(Boolean)];
  return [...document.querySelectorAll(sel.window)].filter(shown).flatMap(windowFaults);
}

export const inkFaults = (page) => page.evaluate(inPage, { surfaces: INK_SURFACES, slabShare: SLAB_SHARE, sel: SELECTORS });
