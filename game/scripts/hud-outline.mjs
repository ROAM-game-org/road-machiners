import assert from 'node:assert/strict';

const SETTLE = () => new Promise(done => { setTimeout(done, 1500); requestAnimationFrame(() => requestAnimationFrame(done)); });

export function readOutline(page) {
  return page.evaluate(() => {
    const box = selector => {
      const node = document.querySelector(selector);
      if (!node || node.offsetParent === null) return null;
      const r = node.getBoundingClientRect();
      return [Math.round(r.x * 10) / 10, Math.round(r.y * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10];
    };
    return {
      bottomLeft: box('.bottom-left'),
      instruments: box('.instruments'),
      weapons: box('.weapons'),
      truckBottom: box('.truck-stack')?.map((v, i, r) => (i === 1 ? v + r[3] : 0)) ?? null,
    };
  });
}

function outlineDiff(base, now) {
  const moved = [];
  for (const name of Object.keys(base)) {
    const a = base[name], b = now[name];
    if (!a || !b) { if (a !== b) moved.push(`${name} ${JSON.stringify(a)} -> ${JSON.stringify(b)}`); continue; }
    if (a.some((value, i) => Math.abs(value - b[i]) > 1)) moved.push(`${name} ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
  }
  return moved;
}

async function mutate(page, edit) {
  await page.evaluate(([source]) => {
    const game = window.__ROAM__;
    const world = structuredClone(game.state);
    new Function('world', `(${source})(world)`)(world);
    game.apply(world);
  }, [edit.toString()]);
  await page.evaluate(SETTLE);
}

async function runLines(page, lines) {
  await page.evaluate(async lines => {
    const game = window.__ROAM__;
    const { runCommand } = await import('/src/ui/console.ts');
    for (const line of lines) {
      const r = runCommand(game.state, line);
      if (r.world) game.apply(r.world);
    }
  }, lines);
  await page.evaluate(SETTLE);
}

const WEATHER = [['heat wave', ['weather heatwave 9']], ['storm', ['weather storm 9']]];

const VALUES = [
  ['money -99999', world => { world.player.money = -99999 * 100; }],
  ['money 0', world => { world.player.money = 0; }],
  ['money 99999', world => { world.player.money = 99999 * 100; }],
  ['fuel 0', world => { world.player.fuel = 0; }],
  ['supplies 999', world => { world.player.supplies = 999; }],
  ['engine hot', world => { world.player.engineHeat = 1; }],
  ['driver hurt', world => { world.player.health = 1; }],
  ['driving 0', world => { world.player.ranks.driving = 0; }],
  ['driving 1', world => { world.player.ranks.driving = 1; }],
  ['driver marked', world => { world.player.ranks.driving = 6; world.player.xp = 1e6; }],
  ['utility recharging', world => { for (const v of world.vehicles) for (const it of v.items) if (it.part?.charge) it.part.charge.reload = 3; }],
  ['utility ready', world => { for (const v of world.vehicles) for (const it of v.items) if (it.part?.charge) it.part.charge.reload = 0; }],
];

const SWITCHES = '.instrument-actions button.switch, .weapon-head button.switch';

const toggleSwitch = (page, index) => page.evaluate(([selector, index]) => {
  const node = [...document.querySelectorAll(selector)][index];
  if (!node) return null;
  const label = node.getAttribute('title') ?? `switch ${index}`;
  const deliberate = node.matches('.weapon-head .switch:last-child') || node.getAttribute('aria-disabled') === 'true';
  if (!deliberate) node.click();
  return { label, skipped: deliberate };
}, [SWITCHES, index]);

async function walkSwitches(page, check) {
  const count = await page.evaluate(selector => document.querySelectorAll(selector).length, SWITCHES);
  for (let i = 0; i < count; i++) {
    for (const pass of ['first', 'back']) {
      const done = await toggleSwitch(page, i);
      if (!done || done.skipped) break;
      await page.evaluate(SETTLE);
      await check(`switch ${done.label} ${pass}`);
    }
  }
  return count;
}

async function walkStates(page, check, restore) {
  for (const [name, lines] of WEATHER) {
    await restore();
    await runLines(page, lines);
    await check(`weather ${name}`);
  }
  await restore();
  await runLines(page, ['weather heatwave 9', 'weather storm 9', 'weather overcast 9', 'weather storm 9 12']);
  await check('weather all words');
  await restore();
  for (const [name, edit] of VALUES) {
    await mutate(page, edit);
    await check(name);
  }
}

export async function checkHudOutlineFixed(page, where) {
  const original = await page.evaluate(() => structuredClone(window.__ROAM__.state));
  await page.evaluate(SETTLE);
  const base = await readOutline(page);
  assert(base.instruments, `HUD outline must be readable ${where}`);
  const problems = [];
  const check = async state => {
    const moved = outlineDiff(base, await readOutline(page));
    if (moved.length) problems.push(`${state}: ${moved.join('; ')}`);
  };
  const restore = async () => { await page.evaluate(w => window.__ROAM__.apply(w), original); await page.evaluate(SETTLE); };
  const switches = await walkSwitches(page, check);
  await restore();
  await walkStates(page, check, restore);
  await restore();
  assert.equal(problems.length, 0, `The bottom-left HUD must keep its outline ${where}:\n${problems.join('\n')}`);
  console.log(`hud outline fixed ${where}: ${switches} switches, ${WEATHER.length + VALUES.length + 1} states`);
}
