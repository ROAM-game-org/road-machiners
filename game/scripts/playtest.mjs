import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { gpuArgs, isSoftware, rendererOf } from './gpu.mjs';
import { playUrl } from './game-url.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const url = arg('url', 'http://localhost:5173');
const cpu = process.argv.includes('--cpu');
const fpsGate = !cpu && !process.argv.includes('--no-fps-gate');
const turns = Number(arg('turns', cpu ? '4' : '12'));
const MIN_FPS = 50;
const timeoutsOff = process.env.TEST_TIMEOUTS === 'off';
const TURN_LIMIT_MS = timeoutsOff ? 0 : cpu ? 60000 : 10000;
const BOOT_LIMIT_MS = timeoutsOff ? 0 : 30000;

mkdirSync('.playtest', { recursive: true });
const browser = await chromium.launch({ args: cpu ? [] : gpuArgs() });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
if (timeoutsOff) page.setDefaultTimeout(0);
const renderer = await rendererOf(page);
console.log(`renderer ${renderer}`);
if (!cpu && isSoftware(renderer)) {
  await browser.close();
  console.error(`FAIL\nThe GPU playtest got the software renderer ${renderer}. Run with --cpu on a machine without a GPU.`);
  process.exit(1);
}
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(playUrl(url));
await page.waitForFunction(() => window.__ROAM__, null, { timeout: BOOT_LIMIT_MS });
await page.waitForTimeout(1000);
const bootGone = await page.waitForSelector('#boot', { state: 'detached', timeout: timeoutsOff ? 0 : 10000 }).then(() => true, () => false);
if (!bootGone) {
  await browser.close();
  console.error('FAIL\nThe boot screen is still on the page after the game started.');
  process.exit(1);
}
await page.screenshot({ path: '.playtest/start.png' });

const hitProblems = [];
const findDeadCorners = () => {
  const isOneControl = (panel, controls) => controls.length === 1 && controls[0].innerText.trim() === panel.innerText.trim();
  const isShown = (panel, r) => r.width > 0 && r.height > 0 && panel.checkVisibility();
  const cornerFailures = (panel, control) => {
    const r = panel.getBoundingClientRect();
    const corners = [[r.left + 1, r.top + 1], [r.right - 2, r.top + 1], [r.left + 1, r.bottom - 2], [r.right - 2, r.bottom - 2]];
    return corners.flatMap(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      if (el && control.contains(el)) return [];
      return [`${panel.className} corner (${x},${y}) hits ${el ? `${el.tagName.toLowerCase()}.${el.className}` : 'nothing'}`];
    });
  };
  const panels = [...document.querySelectorAll('#ui .panel')].filter((p) => isShown(p, p.getBoundingClientRect()));
  const single = panels.map((p) => [p, [...p.querySelectorAll('button, summary, a[href], input, select')].filter((c) => c.checkVisibility())]).filter(([p, c]) => isOneControl(p, c));
  return { failures: single.flatMap(([p, c]) => cornerFailures(p, c[0])), found: single.length };
};
const hit = await page.evaluate(findDeadCorners);
hitProblems.push(...hit.failures);
if (hit.found < 3) hitProblems.push(`found ${hit.found} one-control panels, expected at least 3`);
const menuBox = await page.locator('#ui .game-menu').boundingBox();
await page.mouse.click(menuBox.x + 2, menuBox.y + 2);
if (!(await page.locator('.game-menu [role=menu]').isVisible())) hitProblems.push('menu did not open from a click in its corner');
await page.keyboard.press('Escape');
if (await page.locator('.game-menu [role=menu]').isVisible()) hitProblems.push('menu did not close on Escape');
await page.locator('.game-menu .menu-button').click();
await page.locator('.game-menu [data-entry=help]').click();
if (!(await page.locator('#ui .help').isVisible())) hitProblems.push('help did not open from the menu');
await page.keyboard.press('Escape');
if (await page.locator('#ui .help').count()) hitProblems.push('help did not close on Escape');

const CYRILLIC = /[А-яЁё]/;
const languageProblems = [];
const LANGUAGE_CONTROLS = '.language-switch, .language-option, [data-lang]';
const strayLanguageControls = () => page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((n) => !n.closest('.options')).length, LANGUAGE_CONTROLS);
const checkNoStrayControl = async (when) => {
  if (await page.locator('#ui .options').count()) languageProblems.push(`Options still open ${when}`);
  const stray = await strayLanguageControls();
  if (stray > 0) languageProblems.push(`language control outside Options ${when}: ${stray}`);
};
const languageReadout = () => page.evaluate(() => ({
  lang: document.documentElement.lang,
  menu: document.querySelector('#ui .game-menu .menu-button')?.textContent ?? '',
  hud: [...document.querySelectorAll('#ui [data-resource]')].map((item) =>
    item.querySelector('small')?.textContent || item.getAttribute('aria-label') || item.getAttribute('title') || ''),
}));
const openOptionsByMouse = async () => {
  if (!(await page.locator('.game-menu [role=menu]').isVisible())) await page.locator('.game-menu .menu-button').click();
  const item = page.locator('.game-menu [data-entry=options]');
  if (!(await item.count())) {
    languageProblems.push('Options not reachable: the menu has no Options item');
    return false;
  }
  await item.click();
  if (!(await page.locator('#ui .options .language-switch').isVisible())) {
    languageProblems.push('Options not reachable: the panel did not open with the language row');
    return false;
  }
  return true;
};
const pickLanguageByKeyboard = async (lang) => {
  await page.locator('.game-menu .menu-button').focus();
  await page.keyboard.press('Enter');
  for (let i = 0; i < 6; i++) {
    if (await page.evaluate(() => document.activeElement?.dataset.entry === 'options')) break;
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('Enter');
  if (!(await page.locator('#ui .options .language-switch').isVisible())) {
    languageProblems.push('Options not reachable by keyboard');
    return;
  }
  for (let i = 0; i < 4; i++) {
    if (await page.evaluate((lang) => document.activeElement?.dataset.lang === lang, lang)) break;
    await page.keyboard.press('Tab');
  }
  const turnBefore = await page.evaluate(() => window.__ROAM__.state.turn);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  if ((await page.evaluate(() => window.__ROAM__.state.turn)) !== turnBefore) languageProblems.push('a game key ended the turn behind Options');
  await page.keyboard.press('Escape');
  if (await page.locator('#ui .options').count()) languageProblems.push('Options did not close on Escape');
  if (!(await page.evaluate(() => document.activeElement?.classList.contains('menu-button')))) languageProblems.push('focus did not return to the Menu button after Options');
};
const pickLanguageByMouse = async (lang) => {
  if (!(await openOptionsByMouse())) return;
  await page.locator(`#ui .options [data-lang="${lang}"]`).click();
  await page.locator('#ui .options .close').click();
};
const pressedLanguage = async () => {
  if (!(await openOptionsByMouse())) return '';
  const pressed = await page.locator('#ui .options .language-option[aria-pressed="true"]').getAttribute('data-lang');
  await page.keyboard.press('Escape');
  return pressed;
};
await checkNoStrayControl('in English');
await pickLanguageByKeyboard('ru');
const russian = await languageReadout();
if (russian.lang !== 'ru' || !CYRILLIC.test(russian.menu) || !russian.hud.some((label) => CYRILLIC.test(label))) languageProblems.push(`Русский did not switch the menu and HUD: ${JSON.stringify(russian)}`);
await checkNoStrayControl('in Russian');

for (let i = 0; i < turns; i++) {
  await page.evaluate((i) => {
    const g = window.__ROAM__;
    const w = g.state;
    const v = w.vehicles.find((x) => x.id === w.player.vehicleId);
    const a = v.heading + Math.sin(i * 0.9) * 0.9;
    const clamp = (x) => Math.max(1, Math.min(w.size - 1, x));
    g.apply({ ...w, vehicles: w.vehicles.map((x) => (x.id === v.id ? { ...x, order: { kind: 'through', dest: { x: clamp(v.pos.x + Math.cos(a) * 9.5), y: clamp(v.pos.y + Math.sin(a) * 9.5) } } } : x)) });
    g.endTurn();
  }, i);
  await page.waitForFunction((turn) => {
    const g = window.__ROAM__;
    return g.state.turn === turn && !g.travel.isPlaying(g.anim);
  }, i + 2, { timeout: TURN_LIMIT_MS, polling: 50 }).catch(() => { throw new Error(`Turn ${i + 1} did not finish playing within ${TURN_LIMIT_MS} ms`); });
}
await page.screenshot({ path: '.playtest/end.png' });

const logLeaks = await page.evaluate(() => {
  const g = window.__ROAM__;
  const names = [...g.state.vehicles, ...g.state.removed].flatMap((v) => (v.brain ? v.brain.driver.split(' ') : []));
  return [...document.querySelectorAll('#ui .log-lines > div')].map((row) => row.textContent ?? '')
    .filter((text) => names.reduce((left, name) => left.split(name).join(' '), text).match(/[A-Za-z]{2,}/));
});
languageProblems.push(...logLeaks.map((line) => `English in the Russian log: ${line}`));

const fps = await page.evaluate(() => new Promise((done) => {
  let n = 0;
  const t0 = performance.now();
  const f = () => (++n, performance.now() - t0 < 2000 ? requestAnimationFrame(f) : done(n / 2));
  requestAnimationFrame(f);
}));
const state = await page.evaluate(() => ({ turn: window.__ROAM__.state.turn, crashed: document.querySelector('.crash-screen') !== null }));
const blank = await page.evaluate(() => {
  const c = document.querySelector('#game canvas');
  return !c || c.width === 0;
});

const SAMPLER_FLOOR = 16;
const nightProblems = [];
const skipTo = (hour) => page.evaluate(async (h) => {
  const cheats = await import('/src/sim/cheats.ts');
  const g = window.__ROAM__;
  g.apply(cheats.skipToHour(g.state, h));
}, hour);
const setLamps = (on) => page.evaluate((flag) => {
  const g = window.__ROAM__;
  g.apply({ ...g.state, player: { ...g.state.player, headlights: flag } });
}, on);
const groundLuma = async (path) => {
  const shot = await page.screenshot({ path });
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const lin = (v) => (v / 255) ** 2.2;
    const { width, height } = bitmap;
    const lumas = [];
    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 6; j++) {
        const [r, g, b] = ctx.getImageData(Math.floor((0.2 + i * 0.05) * width), Math.floor((0.3 + j * 0.04) * height), 1, 1).data;
        lumas.push(0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b));
      }
    }
    return lumas.sort((x, y) => x - y)[Math.floor(lumas.length * 0.75)];
  }, shot.toString('base64'));
};
const groundPrograms = () => page.evaluate((floor) => {
  const g = window.__ROAM__;
  const gl = g.renderer.getContext();
  const samplerTypes = new Set([gl.SAMPLER_2D, gl.SAMPLER_2D_SHADOW, gl.SAMPLER_CUBE, gl.SAMPLER_CUBE_SHADOW, gl.SAMPLER_3D, gl.SAMPLER_2D_ARRAY]);
  const samplersOf = (program) => {
    let n = 0;
    for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
      const u = gl.getActiveUniform(program, i);
      if (samplerTypes.has(u.type)) n += u.size;
    }
    return n;
  };
  const programs = g.renderer.info.programs;
  const problems = programs.filter((p) => !gl.getProgramParameter(p.program, gl.LINK_STATUS)).map((p) => `program ${p.name} did not link`);
  const ground = programs.filter((p) => p.cacheKey.includes('facets'));
  if (ground.length === 0) problems.push('no ground program found');
  for (const p of ground) if (samplersOf(p.program) > floor) problems.push(`ground program uses ${samplersOf(p.program)} samplers, over ${floor}`);
  return problems;
}, SAMPLER_FLOOR);
const NOON_SHARE = 0.45;
const BG_LUMA = (() => {
  const lin = (v) => (v / 255) ** 2.2;
  return 0.2126 * lin(0x1a) + 0.7152 * lin(0x14) + 0.0722 * lin(0x10);
})();
const MIN_BG_RATIO = 2.5;
await skipTo(3);
await page.waitForTimeout(1500);
const nightLuma = await groundLuma('.playtest/night-off.png');
await skipTo(12);
await page.waitForTimeout(1500);
const noonLuma = await groundLuma('.playtest/noon.png');
console.log(`ground luma night ${nightLuma.toFixed(4)}, noon ${noonLuma.toFixed(4)}, background ${BG_LUMA.toFixed(4)}`);
if (fpsGate) {
  if (nightLuma < BG_LUMA * MIN_BG_RATIO) nightProblems.push(`night ground luminance ${nightLuma.toFixed(4)} is under ${MIN_BG_RATIO} times the background ${BG_LUMA.toFixed(4)}`);
  if (nightLuma > noonLuma * NOON_SHARE) nightProblems.push(`night ground luminance ${nightLuma.toFixed(4)} is over ${NOON_SHARE} of the noon's ${noonLuma.toFixed(4)}`);
}
await skipTo(3);
await page.evaluate(async () => {
  const cheats = await import('/src/sim/cheats.ts');
  const { NPCS } = await import('/src/data/npcs.ts');
  const g = window.__ROAM__;
  const kinds = Object.keys(NPCS);
  let w = g.state;
  for (let i = 0; i < 6; i++) w = cheats.spawnNear(w, kinds[i % kinds.length], false);
  g.apply({ ...w, player: { ...w.player, headlights: true } });
});
await page.waitForTimeout(1500);
nightProblems.push(...(await groundPrograms()));
await groundLuma('.playtest/night-on.png');

const reload = async () => {
  await page.reload();
  await page.waitForFunction(() => window.__ROAM__, null, { timeout: BOOT_LIMIT_MS });
  return languageReadout();
};
if ((await reload()).lang !== 'ru' || (await pressedLanguage()) !== 'ru') languageProblems.push('Russian did not survive a reload');
await pickLanguageByMouse('en');
const english = await reload();
if (english.lang !== 'en' || CYRILLIC.test(english.menu) || english.hud.some((label) => CYRILLIC.test(label)) || (await pressedLanguage()) !== 'en') languageProblems.push(`English did not stay after a reload: ${JSON.stringify(english)}`);
await checkNoStrayControl('after the reload');
nightProblems.push(...(await groundPrograms()).map((p) => `after the reload: ${p}`));
await browser.close();

const problems = [...errors, ...hitProblems, ...languageProblems, ...nightProblems];
if (state.crashed) problems.push('crash screen shown');
if (state.turn !== turns + 1) problems.push(`expected turn ${turns + 1}, got ${state.turn}`);
if (blank) problems.push('no WebGL canvas');
if (fpsGate && fps < MIN_FPS) problems.push(`fps ${fps} under ${MIN_FPS}`);
console.log(`turns ${state.turn - 1}, fps ${fps}`);
if (problems.length > 0) {
  console.error(`FAIL\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('PASS');
