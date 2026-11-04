import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const userData = join(desktop, '..', 'tmp', `smoke-user-data-${Date.now()}`);
const packaged = process.env.SMOKE_APP ?? null;
const SOFTWARE_DRAWING = /swiftshader|llvmpipe|softpipe|software|basic render/i;
const TURNS = 3;
const STEP_LIMIT_MS = 60000;

const problems = [];
const fail = (message) => problems.push(message);

rmSync(userData, { recursive: true, force: true });
mkdirSync(userData, { recursive: true });

const quietArgs = [`--user-data-dir=${userData}`, '--mute-audio'];
const launchOptions = packaged ? { executablePath: packaged, args: quietArgs, env: { ...process.env, ROAM_SMOKE: '1' } } : { executablePath: electronPath, args: [desktop, ...quietArgs], env: { ...process.env, ROAM_SMOKE: '1' } };
const app = await electron.launch(launchOptions);
app.process().stderr.on('data', (chunk) => console.error(`[app] ${chunk}`));
app.on('close', () => console.error('[app] closed'));
const page = await app.firstWindow();
page.on('crash', () => fail('The renderer crashed'));
page.setDefaultTimeout(STEP_LIMIT_MS);
page.on('dialog', (dialog) => dialog.accept());
page.on('pageerror', (error) => fail(`Page error: ${error.stack ?? error.message}`));
page.on('console', (message) => message.type() === 'error' && fail(`Console error: ${message.text()}`));

const clockText = () => page.locator('.instrument-clock').getAttribute('aria-label');
const savesDir = join(userData, 'saves');
const savedFile = (name) => JSON.parse(readFileSync(join(savesDir, name), 'utf8'));

async function startNewGame() {
  await page.locator('.start-menu').waitFor();
  await page.locator('.start-menu button', { hasText: 'New game' }).click();
  await page.locator('.new-game .intro-toggle').click();
  await page.locator('.new-game .start').click();
  await page.locator('.instrument-clock').waitFor();
}

async function routeAhead(turn) {
  const { width, height } = page.viewportSize() ?? (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })));
  const sign = turn % 2 === 0 ? 1 : -1;
  await page.keyboard.down('Shift');
  await page.mouse.click(width / 2 + sign * width * 0.12, height / 2 - height * 0.1);
  await page.keyboard.up('Shift');
}

async function playTurns(count) {
  const started = await clockText();
  for (let turn = 0; turn < count; turn++) {
    await routeAhead(turn);
    await page.keyboard.press('Space');
    await page.waitForSelector('.end-turn[disabled]');
    await page.waitForSelector('.end-turn:not([disabled])');
  }
  if ((await clockText()) === started) fail('The clock did not move after 3 turns');
}

async function openMenuEntry(entry) {
  if (!(await page.locator('.game-menu [role=menu]').isVisible())) await page.locator('.game-menu .menu-button').click();
  await page.locator(`.game-menu [data-entry=${entry}]`).click();
}

async function checkRenderer() {
  await openMenuEntry('help');
  const line = await page.locator('.help-notes > div').first().innerText();
  await page.keyboard.press('Escape');
  console.log(`Help line: ${line}`);
  if (!line.includes('desktop app')) fail(`The Help line does not name the desktop host: ${line}`);
  if (SOFTWARE_DRAWING.test(line)) fail(`The game draws in software: ${line}`);
  if (!/drawing on .+/.test(line)) fail(`The Help line names no renderer: ${line}`);
}

async function checkFileSaves() {
  await openMenuEntry('save');
  await page.locator('.save-row[data-slot=slot1]').click();
  await page.waitForFunction(() => document.querySelector('.save-row[data-slot=slot1] .save-when')?.textContent !== 'Empty');
  const files = readdirSync(savesDir).sort();
  console.log(`Save files: ${files.join(', ')}`);
  if (!files.includes('slot1.json')) return fail('Saving into slot 1 wrote no slot1.json');
  if (!files.includes('auto.json')) fail('The new game wrote no auto.json');
  const slot = savedFile('slot1.json');
  if (slot.world.turn < TURNS + 1) fail(`slot1.json holds turn ${slot.world.turn}, expected at least ${TURNS + 1}`);
}

async function checkNothingInBrowserStorage() {
  const stored = await page.evaluate(async () => ({
    local: Object.keys(window.localStorage),
    databases: (await indexedDB.databases()).map((db) => db.name),
  }));
  console.log(`Browser storage: ${JSON.stringify(stored)}`);
  if (stored.databases.length > 0) fail(`The app opened browser databases: ${stored.databases.join(', ')}`);
  const savesInLocal = stored.local.filter((key) => /roam|save|road/i.test(key));
  if (savesInLocal.length > 0) fail(`Saves leaked into local storage: ${savesInLocal.join(', ')}`);
}

async function checkImport() {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('.save-exports button', { hasText: 'Import save' }).click(),
  ]);
  await chooser.setFiles(join(savesDir, 'slot1.json'));
  await page.waitForFunction(() => document.querySelector('.save-row[data-slot=slot2] .save-when')?.textContent !== 'Empty');
  if (!existsSync(join(savesDir, 'slot2.json'))) return fail('Import save wrote no slot2.json');
  const original = readFileSync(join(savesDir, 'slot1.json'), 'utf8');
  const imported = readFileSync(join(savesDir, 'slot2.json'), 'utf8');
  if (original !== imported) fail('The imported file differs from the file it came from');
  console.log('Import save: slot2.json equals slot1.json');
}

try {
  await startNewGame();
  await playTurns(TURNS);
  await checkRenderer();
  await checkFileSaves();
  await checkImport();
  await checkNothingInBrowserStorage();
  if (await page.locator('.crash-screen').count()) fail('The crash screen is showing');
} catch (error) {
  const shot = join(desktop, '..', 'tmp', 'smoke-failure.png');
  await page.screenshot({ path: shot }).catch(() => {});
  console.error(`Problems so far:\n${problems.join('\n')}\nScreenshot: ${shot}\nPage text: ${await page.locator('body').innerText().catch(() => '')}`);
  throw error;
} finally {
  await app.close();
}

if (problems.length > 0) {
  console.error(`FAIL\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('PASS: the desktop app played 3 turns with file saves, a hardware renderer and a working Import save.');
