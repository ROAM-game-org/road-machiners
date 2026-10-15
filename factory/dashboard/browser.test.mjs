import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { LABELS } from '../src/dashboard/labels.ts';

if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: node browser.test.mjs <playwright-module> <evidence-directory>');
const { chromium } = await import(pathToFileURL(resolve(process.argv[2])).href);
const evidence = resolve(process.argv[3]);
const root = new URL('./', import.meta.url);
const now = new Date().toISOString();
function createSource(value) { return { status: 'ok', at: now, value }; }
const jobs = Array.from({ length: 45 }, (_, i) => ({ key: `job-${i}`, issue: i + 1, stage: ['design', 'implement', 'verify'][i % 3], startedAt: new Date(Date.now() - 900000).toISOString() }));
const cardColumns = ['Triage', 'Design', 'Implementation', 'Testing', 'Approval', 'Done'];
const boardColumns = Object.keys(LABELS.columns);
const fill = (value) => boardColumns.map(() => value);
function createSummary(days) {
  const tokens = { input: 1000000, output: 300000, cacheRead: 200000, cacheWrite: 100000 };
  const yesterday = new Date(Date.parse(now) - 86400000).toISOString().slice(0, 10);
  return { days, since: `${yesterday}T00:00:00Z`, workerMs: 7200000, cost: days > 1 ? 16.5 : 14.5, tokens, waitingMs: 3600000, waitingSpanMs: 1800000, waitingGaps: 1, missingUsage: 2,
    wasted: { cost: 4.25, tokens: { input: 400000, output: 50000, cacheRead: 0, cacheWrite: 0 } },
    stages: [{ stage: 'design', workerMs: 7200000 }], waitingStages: [{ stage: 'design', workerMs: 3600000 }],
    buckets: [...(days > 1 ? [{ start: yesterday, cost: 2, tokens: null, stages: { design: { cost: 2, tokens: 0 } }, models: { unattributed: { cost: 2, tokens: 0 } } }] : []),
      { start: now.slice(0, days > 1 ? 10 : 13), cost: 14.5, tokens, stages: { design: { cost: 9.5, tokens: 1000000 }, verify: { cost: 5, tokens: 600000 } }, models: { 'claude-opus-5-5': { cost: 7.25, tokens: 850000 }, 'claude-sonnet-5-5': { cost: 7.25, tokens: 750000 } } }], retries: [{ outcome: 'timeout', runs: 3, cost: 2, workerMs: 600000 }],
    models: [{ model: 'claude-opus-5-5', input: 500000, output: 200000, cacheRead: 100000, cacheWrite: 50000, cost: 7.25 },
      { model: 'claude-sonnet-5-5', input: 500000, output: 100000, cacheRead: 100000, cacheWrite: 50000, cost: 7.25 }],
    stageModels: [
      { stage: 'design', model: 'claude-opus-5-5', input: 400000, output: 100000, cacheRead: 80000, cacheWrite: 40000, cost: 5 },
      { stage: 'verify', model: 'claude-opus-5-5', input: 100000, output: 100000, cacheRead: 20000, cacheWrite: 10000, cost: 2.25 },
      { stage: 'verify', model: 'claude-sonnet-5-5', input: 300000, output: 80000, cacheRead: 50000, cacheWrite: 30000, cost: 5 },
      { stage: 'implement', model: 'claude-sonnet-5-5', input: 200000, output: 20000, cacheRead: 50000, cacheWrite: 20000, cost: 2.25 },
    ],
    activity: jobs.map((job) => ({ stage: job.stage, issue: job.issue, outcome: 'done', at: now })), delivery: createDelivery(days) };
}
function createPart(value) { return { value, error: null }; }
function createMergeQueue() {
  return [{ issue: 60, title: `In the batch ${'long'.repeat(40)}`, state: 'merging' }, { issue: 61, title: 'Waits next', state: 'next' }, { issue: 62, title: 'Stuck merge', state: 'stuck' }];
}
function createIssueToDev(days) {
  const hour = 3600000;
  const ages = { 1: [50], 7: [10, 50], 30: [10, 50, 120] }[days];
  const mean = ages.reduce((sum, age) => sum + age, 0) / ages.length;
  const median = ages.length % 2 ? ages[(ages.length - 1) / 2] : (ages[ages.length / 2 - 1] + ages[ages.length / 2]) / 2;
  return { issues: ages.length, mean_ms: mean * hour, median_ms: median * hour, fastest_ms: ages[0] * hour, slowest_ms: ages.at(-1) * hour, missing_open: 1 };
}
function createDelivery(days) {
  const hour = 3600000;
  const stage = (name, count, mean) => ({ stage: name, count, meanMs: count ? mean * hour : null, medianMs: count ? mean * hour : null, open: 2, openMeanMs: 5 * hour });
  return { since: '2026-08-01T00:00:00.000Z', issues: 12 * days, excluded: 3, legacy: 4, lead: { open: 7, openMeanMs: 20 * hour, missingStart: 1 },
    stages: [stage('triage', 6, 2), stage('design', 6, 10), stage('implementation', 5, 5), stage('preview', 5, 3), stage('approval', 4, 24), stage('harden', 3, 4), stage('merge', 0, 0)],
    loops: [{ step: 'questions', events: 2, issues: 2 }, { step: 'rebuild', events: 0, issues: 0 }, { step: 'patch', events: 3, issues: 1 }], looped: 3,
    retries: [{ stage: 'design', runs: 2, issues: 1 }, { stage: 'verify', runs: 0, issues: 0 }],
    rejections: [{ gate: 'triage', decided: 8, rejected: 2 }, { gate: 'design', decided: 6, rejected: 0 }, { gate: 'committee', decided: 0, rejected: 0 }] };
}
function createFlowPanels(days) {
  const hour = 3600000;
  const scale = days / 7;
  const stage = (name, visits, wait, [agent, checks = 0, build = 0, factory = 0], waitsOn = 'workers', unknown = 0) => ({ stage: name, waits_on: waitsOn, visits: Math.round(visits * scale), unknown_visits: unknown,
    wait_ms: wait * hour * scale, agent_ms: agent * hour * scale, checks_ms: checks * hour * scale, build_ms: build * hour * scale, factory_ms: factory * hour * scale });
  const move = (from, to, moves) => ({ from_stage: from, to_stage: to, moves: Math.max(1, Math.round(moves * scale)) });
  return {
    flow_stages: [stage('triage', 38, 4.7, [0.9, 0, 0, 0.1]), stage('design', 84, 45, [19, 0, 0, 2]), stage('implementation', 83, 118, [100, 0, 0, 6]), stage('preview', 103, 760, [30, 18, 0, 3]),
      stage('approval', 103, 314, [0, 0, 0, 0.2], 'committee'), stage('harden', 57, 180, [4, 0, 0, 1]), stage('merge', 2, 2.8, [0.3, 1.5, 0.2, 0.4], 'workers', 52)],
    flow_moves: [move('triage', 'design', 32), move('triage', 'done', 6), move('design', 'implementation', 82), move('design', 'triage', 1), move('design', 'done', 1), move('implementation', 'preview', 82), move('implementation', 'design', 1),
      move('preview', 'approval', 102), move('preview', 'design', 1), move('approval', 'harden', 77), move('approval', 'preview', 15), move('approval', 'design', 9), move('approval', 'done', 2), move('harden', 'merge', 57), move('merge', 'done', 52), move('merge', 'harden', 2)],
  };
}
function createBucketRows(bucket) {
  const rows = (grouping, segments) => Object.entries(segments).map(([key, segment]) => ({ start: bucket.start, grouping, key, cost: segment.cost, tokens: bucket.tokens ? segment.tokens : null }));
  return [...rows('stage', bucket.stages), ...rows('model', bucket.models)];
}
function createDeliveryPanels(delivery) {
  if (!delivery) return { delivery_coverage: [{ since: null, issues: 0, excluded: 0, legacy: 0, looped: 0 }], lead: [{ open: 0, open_mean_ms: null, missing_start: 0 }], dwell: [], loops: [], rejections: [], delivery_retries: [] };
  return {
    delivery_coverage: [{ since: delivery.since, issues: delivery.issues, excluded: delivery.excluded, legacy: delivery.legacy, looped: delivery.looped }],
    lead: [{ open: delivery.lead.open, open_mean_ms: delivery.lead.openMeanMs, missing_start: delivery.lead.missingStart }],
    dwell: delivery.stages.map((row) => ({ stage: row.stage, count: row.count, mean_ms: row.meanMs, median_ms: row.medianMs, open: row.open, open_mean_ms: row.openMeanMs })),
    loops: delivery.loops, rejections: delivery.rejections, delivery_retries: delivery.retries,
  };
}
function createRangePanels(summary) {
  const { tokens, wasted } = summary;
  return {
    problems: [{ unreadable: 0, untimed: 0, uncosted: 0 }],
    coverage: [{ since: summary.since, missing_usage: summary.missingUsage }],
    counters: [{ worker_ms: summary.workerMs, cost: summary.cost, input: tokens.input, output: tokens.output, cache_read: tokens.cacheRead, cache_write: tokens.cacheWrite,
      wasted_cost: wasted.cost, wasted_input: wasted.tokens.input, wasted_output: wasted.tokens.output, wasted_cache_read: wasted.tokens.cacheRead, wasted_cache_write: wasted.tokens.cacheWrite }],
    usage_buckets: summary.buckets.flatMap(createBucketRows),
    stage_time: summary.stages.map((row) => ({ stage: row.stage, worker_ms: row.workerMs, agent_ms: row.workerMs / 2, checks_ms: row.workerMs / 4, build_ms: 0, factory_ms: row.workerMs / 8, unsplit_ms: row.workerMs / 8 })),
    waiting: [{ waiting_ms: summary.waitingMs, span_ms: summary.waitingSpanMs, gaps: summary.waitingGaps }],
    waiting_stages: summary.waitingStages.map((row) => ({ stage: row.stage, waiting_ms: row.workerMs })),
    retries: summary.retries.map((row) => ({ outcome: row.outcome, runs: row.runs, worker_ms: row.workerMs, cost: row.cost })),
    stage_models: summary.stageModels.map((row) => ({ stage: row.stage, model: row.model, input: row.input, output: row.output, cache_read: row.cacheRead, cache_write: row.cacheWrite, cost: row.cost })),
    activity: summary.activity,
    issue_to_dev: [createIssueToDev(summary.days)],
    ...createDeliveryPanels(summary.delivery),
    ...createFlowPanels(summary.days),
  };
}
function createAnalytics(mutate = () => {}) {
  const ranges = [1, 7, 30].map((days) => { const summary = createSummary(days); mutate(summary); return [days, createRangePanels(summary)]; });
  const names = Object.keys(ranges[0][1]);
  return Object.fromEntries(names.map((name) => [name, { error: null, ranges: Object.fromEntries(ranges.map(([days, panels]) => [days, panels[name]])) }]));
}
function withAnalytics(mutate) { const value = structuredClone(fixture); value.analytics = createSource(createAnalytics(mutate)); return value; }
const fixture = {
  generatedAt: now, repoUrl: 'https://github.com/example/factory', playUrl: 'https://example.com/',
  operations: createSource({ jobs, queues: Object.fromEntries(['branch', 'triage', 'design', 'implement', 'verify', 'test'].map((queue) => [queue, { total: 20, busy: 15 }])), release: { issue: 99 }, features: Array.from({ length: 34 }, (_, index) => ({ issue: index + 1, title: `Feature ${index + 1} ${'long'.repeat(60)}` })), candidateUrl: null }),
  github: createSource({ cards: createPart(jobs.map((job, index) => ({ issue: job.issue, column: cardColumns[index % cardColumns.length], title: `Task ${job.issue} ${'unbroken'.repeat(60)}` }))), mergeQueue: createPart(createMergeQueue()) }),
  live: createSource({ workers: jobs.map((job) => ({ key: job.key, activity: 'tests', phase: 'running', status: 'ok', source: 'runner', progressAt: now })), manager: { activity: 'command', intent: 'investigate', phase: 'running', status: 'ok', at: now, since: now }, scheduler: { status: 'ready', freshness: 'ok', at: now, counts: { Triage: 12345678, Design: 200, Implementation: 31, Testing: 20, Approval: 10, Done: 99 }, decisions: [{ stage: 'design', queue: 'design', issue: 42, reasons: ['needs-info'] }, { stage: 'verify', queue: 'verify', issue: 50, reasons: ['queue-full'] }, { stage: 'harden', queue: 'verify', issue: 51, reasons: ['queue-full'] }, { stage: 'harden', queue: 'verify', issue: 51, reasons: ['queue-full', 'held'] }, { stage: 'implement', queue: 'implement', issue: 52, reasons: ['issue-running'] }], release: { reason: 'release-tasks', issues: [42] } } }),
  host: createSource({ cpu: createSource(85), ram: createSource({ used: 10000000000, total: 16000000000 }), gpu: createSource([{ utilization: 90 }]), ssd: createSource({ free: 20000000000 }), containers: createSource(jobs.map((job) => ({ jobId: job.key, service: 'worker', cpu: 2, memory: 1000000000 }))) }),
  analytics: createSource(createAnalytics()),
  labels: LABELS,
};
function readContentType(path) {
  const extension = path.split('.').at(-1);
  return { js: 'text/javascript', css: 'text/css', woff2: 'font/woff2', html: 'text/html' }[extension] ?? 'application/octet-stream';
}
const server = createServer(async (request, response) => {
  try {
    const path = request.url === '/factory/' ? 'index.html' : request.url.replace('/factory/', '');
    if (path.includes('..')) throw new Error('Invalid path');
    const bytes = await readFile(path === 'chart.js' ? new URL('../node_modules/chart.js/dist/chart.umd.min.js', root) : new URL(path, root));
    response.setHeader('Content-Type', readContentType(path));
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    response.end(bytes);
  } catch { response.writeHead(404).end(); }
});
async function readExplain(locator) { return JSON.parse(await locator.getAttribute('data-explain')); }
async function waitForRender(page) { await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))); }
async function sendSnapshot(page, value) {
  await page.evaluate((data) => window.fixtureStream.listeners.snapshot({ data: JSON.stringify(data) }), value);
  await waitForRender(page);
}
async function checkLayout(page, size) {
  for (const tab of ['overview', 'analytics', 'delivery', 'flow']) {
    await page.locator(`#${tab}-tab`).click();
    await waitForRender(page);
    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth,
      panels: [...document.querySelectorAll('.panel')].filter((node) => node.getClientRects().length && (node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1)).map((node) => node.className),
    }));
    await page.screenshot({ path: `${evidence}/${tab}-${size.width}.png` });
    assert.equal(overflow.document, false);
    assert.deepEqual(overflow.panels, []);
    if (tab === 'overview') {
      const tops = await page.locator('#funnel div').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top));
      assert.equal(tops.length, boardColumns.length);
      assert.equal(new Set(tops).size, 1);
    }
    console.log(size, tab, 'fits without scrolling');
  }
}
async function checkReleaseAndManager(page) {
  await page.locator('#overview-tab').click();
  assert.equal(await page.locator('#release-count').textContent(), '34 changes');
  assert.equal(await page.locator('#release-items li').count(), 3);
  assert.equal(await page.locator('#release-items a').first().getAttribute('href'), 'https://github.com/example/factory/issues/1');
  await page.getByRole('button', { name: 'Next release', exact: true }).click();
  await waitForRender(page);
  assert.equal(await page.locator('#release-items a').first().getAttribute('href'), 'https://github.com/example/factory/issues/4');
  await sendSnapshot(page, fixture);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.key), 'release-Next');
  const idle = structuredClone(fixture);
  idle.live.value.manager = { activity: 'finished', phase: 'completed', status: 'ok', at: now, since: new Date(Date.now() - 12 * 3600000).toISOString() };
  await sendSnapshot(page, idle);
  assert.match(await page.locator('#manager-action').textContent(), /Idle for 12h/);
  assert.equal(await page.locator('#connection').textContent(), 'Live');
  const waiting = structuredClone(fixture);
  waiting.live.value.manager = { activity: 'model', phase: 'running', status: 'ok', at: now, since: new Date(Date.now() - 16 * 60000).toISOString() };
  waiting.live.value.workers[0].milestone = 'Building orchard buildings';
  await sendSnapshot(page, waiting);
  assert.match(await page.locator('#manager-action').textContent(), /Waiting for model, 16m in phase/);
  assert.match(await page.locator('#worker-rows tr').first().locator('td').nth(2).textContent(), /^Building orchard buildings: /);
  waiting.live.value.workers[0].status = 'stale';
  await sendSnapshot(page, waiting);
  assert.equal(await page.locator('#worker-rows tr').first().locator('td').nth(2).textContent(), 'Activity stale');
  await sendSnapshot(page, fixture);
}
async function checkExpandedViews(page) {
  await page.locator('#overview-tab').click();
  const releaseButton = page.getByRole('button', { name: 'Expand next release' });
  await releaseButton.click();
  const release = page.getByRole('dialog', { name: 'Next release' });
  assert.equal(await release.isVisible(), true);
  assert.match(await release.textContent(), /34 changes/);
  assert.ok((await release.locator('a').count()) < 34);
  assert.equal(await release.locator('#release-dialog-rows').evaluate((node) => node.scrollWidth > node.clientWidth), false);
  await page.screenshot({ path: `${evidence}/release-dialog-${page.viewportSize().width}.png` });
  await release.getByRole('button', { name: 'Next release dialog' }).click();
  await sendSnapshot(page, fixture);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.key), 'release-dialog-Next');
  await page.keyboard.press('Escape');
  assert.equal(await release.isVisible(), false);
  assert.equal(await releaseButton.evaluate((node) => node === document.activeElement), true);
  const eventsButton = page.getByRole('button', { name: 'Expand event log' });
  await eventsButton.click();
  const events = page.getByRole('dialog', { name: 'Event log' });
  assert.equal(await events.isVisible(), true);
  assert.match(await events.locator('time').first().textContent(), /^\d{4}-\d\d-\d\d \d\d:\d\d UTC$/);
  assert.ok((await events.locator('.event-row').count()) < 45);
  await page.screenshot({ path: `${evidence}/event-dialog-${page.viewportSize().width}.png` });
  await events.getByRole('button', { name: 'Next event dialog' }).click();
  await page.keyboard.press('Escape');
  assert.equal(await events.isVisible(), false);
  assert.equal(await eventsButton.evaluate((node) => node === document.activeElement), true);
}
async function checkCapacityAndCpu(page) {
  await page.locator('#overview-tab').click();
  assert.equal(await page.locator('#free-count').textContent(), '90 / 120 busy');
  const queueRows = await page.locator('#queue-rows tr').evaluateAll((rows) => rows.map((row) => [...row.children].map((cell) => cell.textContent)));
  assert.deepEqual(queueRows.map((row) => row[0]), ['Triage', 'Design', 'Implement', 'Verify', 'Test', 'Branch']);
  assert.deepEqual(queueRows[1], ['Design', '15 / 20', '1', 'Needs author reply']);
  assert.deepEqual(queueRows[2], ['Implement', '15 / 20', '0', '']);
  assert.deepEqual(queueRows[3], ['Verify', '15 / 20', '2', 'Queue occupied 2, Held until resumed 1']);
  assert.deepEqual((await readExplain(page.locator('#queue-rows tr').nth(3).locator('td').last())).rows, [['Queue occupied', '#50 Verify, #51 Harden'], ['Held until resumed', '#51 Harden']]);
  assert.equal(await page.locator('#capacity-pages').count(), 0);
  assert.deepEqual(await page.locator('#merge-items li span').allTextContents(), ['Merging', 'Next', 'Stuck']);
  assert.equal(await page.locator('#merge-count').textContent(), '3');
  const mergesFailed = structuredClone(fixture);
  mergesFailed.github.value.mergeQueue = { value: null, error: 'GitHub board unavailable' };
  await sendSnapshot(page, mergesFailed);
  assert.equal(await page.locator('#merge-items').textContent(), 'GitHub board unavailable');
  assert.deepEqual(await page.locator('#funnel strong').allTextContents(), boardColumns.map((column) => String(fixture.github.value.cards.value.filter((card) => card.column === column).length)));
  assert.equal(await page.locator('#release-count').textContent(), '34 changes');
  await sendSnapshot(page, fixture);
  const usage = structuredClone(fixture);
  usage.host.value.containers.value[0].cpu = 1;
  usage.host.value.containers.value[1].cpu = 8;
  usage.host.value.containers.value[2].cpu = 3;
  await sendSnapshot(page, usage);
  assert.equal(await page.locator('#server-rows tr').first().locator('td').first().textContent(), '#2');
  const stale = structuredClone(usage);
  stale.live.value.scheduler.freshness = 'stale';
  await sendSnapshot(page, stale);
  assert.match(await page.locator('#capacity-status').textContent(), /Scheduler stale/);
  assert.deepEqual(await page.locator('#queue-rows tr td:nth-child(3)').allTextContents(), Array(6).fill('—'));
  await sendSnapshot(page, fixture);
}
async function checkCounters(page) {
  await page.locator('#analytics-tab').click();
  await waitForRender(page);
  await page.locator('#usage-input').focus();
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.locator('#full-text .tooltip-row').evaluateAll((rows) => rows.map((row) => [...row.children].map((cell) => cell.textContent))), [['New input', '1M'], ['Cache read', '200K'], ['Cache write', '100K']]);
  assert.equal(await page.locator('#full-text .tooltip-row .num').first().evaluate((node) => getComputedStyle(node).fontFamily.includes('Plex')), true);
  assert.equal(await page.locator('#full-text').evaluate((node) => node === document.activeElement), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#full-text').isVisible(), false);
  assert.equal(await page.locator('#usage-input').evaluate((node) => node === document.activeElement), true);
  assert.equal(await page.locator('.token-counter.panel').count(), 1);
  assert.equal(await page.locator('.token-counter .panel').count(), 0);
  assert.deepEqual(await page.locator('.token-counter .counter span').allTextContents(), ['Total tokens', 'Input with cache', 'Output']);
  assert.equal(await page.locator('#usage-wasted-cost').textContent(), '$4.25');
  assert.equal(await page.locator('#usage-wait').textContent(), '2.0');
  assert.deepEqual((await readExplain(page.locator('#usage-wait'))).rows[0], ['Card time', '1h 0m']);
  assert.deepEqual((await readExplain(page.locator('#usage-wasted-cost'))).rows, [['Tokens', '450K']]);
  assert.equal(await page.locator('#usage-input').textContent(), '1.3M');
  assert.equal(await page.locator('#usage-output').textContent(), '300K');
  assert.equal(await page.locator('#usage-output').getAttribute('data-explain'), null);
  assert.equal(await page.locator('#retry-rows td').first().textContent(), 'Timed out');
  assert.deepEqual(await page.locator('.table-panel th').evaluateAll((heads) => heads.slice(1, 4).map((head) => getComputedStyle(head).textAlign)), ['right', 'right', 'right']);
  assert.deepEqual(await page.locator('#stage-model-header th').allTextContents(), ['Stage', 'claude-opus-5-5', 'claude-sonnet-5-5']);
  assert.deepEqual(await page.locator('#stage-model-measures th').allTextContents(), ['Input with cache', 'Output', 'Input with cache', 'Output']);
  assert.ok(!(await page.locator('#analytics').textContent()).includes('Input incl. cache / output, measured runs'));
  const verify = page.locator('#stage-model-rows tr').filter({ has: page.locator('td:first-child', { hasText: 'Verify' }) });
  assert.deepEqual(await verify.locator('td').allTextContents(), ['Verify', '130K', '100K', '380K', '80K']);
  const extra = withAnalytics((range) => range.stageModels.push({ stage: 'verify', model: 'extra-model', input: 3, output: 4, cacheRead: 0, cacheWrite: 0, cost: 0.01 }));
  await sendSnapshot(page, extra);
  await page.getByRole('button', { name: 'Next model column', exact: true }).click();
  await waitForRender(page);
  assert.ok((await page.locator('#stage-model-header').textContent()).includes('extra-model'));
  const broken = structuredClone(fixture);
  broken.analytics.value.stage_models = { error: 'Binder Error', ranges: null };
  broken.analytics.value.waiting = { error: 'Conversion Error', ranges: null };
  await sendSnapshot(page, broken);
  assert.equal(await page.locator('#stage-model-rows').textContent(), 'Tokens by stage and model failed: Binder Error');
  assert.match(await page.locator('#coverage').textContent(), /2 runs lack token counts, Waiting time failed: Conversion Error/);
  assert.equal(await page.locator('#usage-wait').textContent(), '—');
  assert.equal(await page.locator('#usage-wasted-cost').textContent(), '$4.25');
  assert.equal(await page.locator('#retry-rows td').first().textContent(), 'Timed out');
  await sendSnapshot(page, fixture);
  assert.match(await page.locator('#coverage').textContent(), /History from .*UTC.*2 runs lack token counts/);
  assert.equal(await page.getByRole('button', { name: 'Cost', exact: true }).getAttribute('aria-pressed'), 'true');
  const readChart = () => page.evaluate(() => { const chart = window.Chart.getChart('usage-chart'); return { labels: chart.data.labels, datasets: chart.data.datasets.map((set) => ({ label: set.label, data: set.data })) }; });
  let chart = await readChart();
  assert.equal(chart.labels.length, 8);
  assert.deepEqual(chart.datasets.map((set) => set.label), ['Design', 'Verify']);
  assert.deepEqual(chart.datasets[0].data.slice(-2), [2, 9.5]);
  await page.getByRole('button', { name: 'Model', exact: true }).click();
  await waitForRender(page);
  assert.deepEqual((await readChart()).datasets.map((set) => set.label), ['opus-5-5', 'sonnet-5-5', 'No model data']);
  await page.getByRole('button', { name: 'Tokens', exact: true }).click();
  await waitForRender(page);
  chart = await readChart();
  assert.equal(chart.datasets[0].data.at(-2), null);
  assert.deepEqual(chart.datasets.map((set) => set.label), ['opus-5-5', 'sonnet-5-5']);
  await page.getByRole('button', { name: '24 hours', exact: true }).click();
  await waitForRender(page);
  chart = await readChart();
  assert.equal(chart.labels.length, 25);
  assert.equal(chart.labels.at(-1), `${now.slice(11, 13)}:00`);
  await page.screenshot({ path: `${evidence}/analytics-hourly-${page.viewportSize().width}.png` });
  for (const name of ['Stage', 'Cost', '7 days']) await page.getByRole('button', { name, exact: true }).click();
}
async function checkDelivery(page) {
  await page.locator('#delivery-tab').click();
  await waitForRender(page);
  assert.equal(await page.locator('#issue-mean').textContent(), '30h 0m');
  assert.equal(await page.locator('#issue-median').textContent(), '30h 0m');
  assert.deepEqual((await readExplain(page.locator('#issue-mean'))).rows, [['Issues', '2'], ['Fastest', '10h 0m'], ['Slowest', '50h 0m'], ['No open date', '1']]);
  const panelFailed = structuredClone(fixture);
  panelFailed.analytics.value.issue_to_dev = { error: 'Binder Error', ranges: null };
  await sendSnapshot(page, panelFailed);
  assert.equal(await page.locator('#issue-mean').textContent(), '—');
  assert.deepEqual(await readExplain(page.locator('#issue-mean')), { rows: [], note: 'Issue to dev failed: Binder Error' });
  await sendSnapshot(page, fixture);
  assert.equal(await page.locator('#lead-open').textContent(), '7');
  assert.equal(await page.locator('#loop-rate').textContent(), '4%');
  assert.match(await page.locator('#delivery-coverage').textContent(), /^84 cards, records since 2026-08-01 UTC$/);
  assert.deepEqual((await readExplain(page.locator('#delivery-coverage'))).rows, [['Joined before records', '4'], ['Hotfix, release or private', '3'], ['Merges without a start', '1']]);
  const dwell = await page.locator('#dwell-rows tr').evaluateAll((rows) => rows.map((row) => [...row.cells].map((cell) => cell.textContent)));
  assert.deepEqual(dwell[0], ['Triage', '', '2h 0m', '2h 0m', '6', '2, 5h 0m']);
  assert.ok(dwell.some((row) => row[0] === 'Merge' && row[2] === '—' && row[4] === '0'));
  assert.deepEqual(await page.locator('#loop-rows td:first-child').allTextContents(), ['Design asks the author', 'Committee patch']);
  assert.deepEqual(await page.locator('#triage-rate, #design-rate, #committee-rate').allTextContents(), ['25%', '0%', '—']);
  assert.deepEqual((await readExplain(page.locator('#triage-rate'))).rows, [['Refused', '2'], ['Decided', '8']]);
  assert.deepEqual((await readExplain(page.locator('#committee-rate'))).rows, [['Denied', '0'], ['Decided', '0']]);
  assert.equal(await page.locator('#triage-rate').evaluate((node) => getComputedStyle(node).textDecorationStyle), 'dotted');
  assert.deepEqual(await page.locator('#stage-retry-rows td').allTextContents(), ['Design', '2', '1']);
  assert.equal(await page.getByRole('button', { name: '30 days', exact: true }).count(), 1);
  await page.getByRole('button', { name: '24 hours', exact: true }).click();
  await waitForRender(page);
  assert.equal(await page.locator('#issue-mean').textContent(), '50h 0m');
  assert.equal(await page.locator('#issue-median').textContent(), '50h 0m');
  await page.getByRole('button', { name: '30 days', exact: true }).click();
  await waitForRender(page);
  assert.equal(await page.locator('#issue-mean').textContent(), '60h 0m');
  assert.equal(await page.locator('#issue-median').textContent(), '50h 0m');
  assert.match(await page.locator('#delivery-coverage').textContent(), /^360 cards, /);
  await page.getByRole('button', { name: '7 days', exact: true }).click();
  const unlabeled = withAnalytics((range) => range.delivery.loops.push({ step: 'brand-new-step', events: 1, issues: 1 }));
  await sendSnapshot(page, unlabeled);
  assert.ok((await page.locator('#loop-rows td:first-child').allTextContents()).includes('brand-new-step'));
  const unrecorded = withAnalytics((range) => { range.delivery = null; });
  await sendSnapshot(page, unrecorded);
  assert.equal(await page.locator('#issue-mean').textContent(), '30h 0m');
  assert.equal(await page.locator('#lead-open').textContent(), '—');
  assert.equal(await page.locator('#loop-rate').textContent(), '—');
  assert.match(await page.locator('#delivery-coverage').textContent(), /No card moves recorded yet/);
  assert.equal(await page.locator('#dwell-rows').textContent(), 'No card moves recorded yet');
  const stale = structuredClone(fixture);
  stale.analytics.status = 'stale';
  await sendSnapshot(page, stale);
  assert.match(await page.locator('#delivery-coverage').textContent(), /^Last known: /);
  await page.screenshot({ path: `${evidence}/delivery-${page.viewportSize().width}.png` });
  await sendSnapshot(page, fixture);
  await page.locator('#overview-tab').click();
}
async function checkPagination(page) {
  await page.locator('#overview-tab').click();
  const previous = page.getByRole('button', { name: 'Previous worker', exact: true });
  assert.equal(await previous.getAttribute('aria-disabled'), 'true');
  assert.deepEqual(await readExplain(previous), { rows: [], note: 'First page' });
  await previous.dispatchEvent('click');
  await waitForRender(page);
  assert.ok((await page.locator('#worker-rows').textContent()).includes('Task 1 '));
  await page.getByRole('button', { name: 'Next worker', exact: true }).click();
  await waitForRender(page);
  assert.ok(!(await page.locator('#worker-rows').textContent()).includes('Task 1 '));
  await sendSnapshot(page, fixture);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.key), 'worker-Next');
  const full = structuredClone(fixture);
  for (const queue of Object.values(full.operations.value.queues)) queue.busy = queue.total;
  await sendSnapshot(page, full);
  assert.ok((await page.locator('#queue-rows').textContent()).includes('Needs author reply'));
  assert.equal(await page.locator('#queue-rows tr').nth(3).locator('td').nth(1).getAttribute('class'), 'numeric high');
  const fewer = structuredClone(fixture);
  fewer.operations.value.jobs = jobs.slice(0, 1);
  await sendSnapshot(page, fewer);
  assert.equal(await page.locator('#worker-rows tr').count(), 1);
  assert.ok((await page.locator('#worker-rows').textContent()).includes('Task 1 '));
}
async function checkPause(page) {
  const paused = structuredClone(fixture);
  paused.operations.value.status = 'paused';
  paused.operations.value.pauseReason = 'agent-usage-limit';
  paused.live.value.scheduler.status = 'paused';
  paused.live.value.scheduler.counts = {};
  await sendSnapshot(page, paused);
  assert.deepEqual(await page.locator('#funnel strong').allTextContents(), boardColumns.map((column) => String(fixture.github.value.cards.value.filter((card) => card.column === column).length)));
  assert.match(await page.locator('#source-status').textContent(), /Paused.*Claude weekly usage limit/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight), false);
  await page.screenshot({ path: `${evidence}/paused-${page.viewportSize().width}.png` });
  assert.match(await page.locator('#capacity-status').textContent(), /Starts paused/);
  await page.locator('#analytics-tab').click();
  await waitForRender(page);
  assert.match(await page.locator('#source-status').textContent(), /Paused/);
  await sendSnapshot(page, fixture);
  assert.ok(!(await page.locator('#source-status').textContent()).includes('Paused'));
  await page.locator('#overview-tab').click();
}
async function checkNarrow(page) {
  await sendSnapshot(page, fixture);
  await page.setViewportSize({ width: 683, height: 768 });
  await page.locator('#overview-tab').click();
  await waitForRender(page);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await page.locator('#release-items a').count(), 3);
  assert.equal(await page.getByRole('button', { name: 'Next release', exact: true }).isVisible(), true);
  assert.equal(await page.locator('#server-rows tr').count() > 0, true);
  await page.screenshot({ path: `${evidence}/overview-narrow.png`, fullPage: true });
  await page.getByRole('button', { name: 'Expand event log' }).click();
  assert.equal(await page.getByRole('dialog', { name: 'Event log' }).evaluate((node) => node.getBoundingClientRect().right > innerWidth), false);
  await page.keyboard.press('Escape');
  await page.locator('#analytics-tab').click();
  await waitForRender(page);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await page.locator('#stage-model-header th').count(), 3);
  assert.equal(await page.locator('#stage-model-measures th').count(), 4);
  await page.screenshot({ path: `${evidence}/analytics-narrow.png`, fullPage: true });
  await page.locator('#delivery-tab').click();
  await waitForRender(page);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await page.locator('#dwell-rows tr').count(), 7);
  await page.screenshot({ path: `${evidence}/delivery-narrow.png`, fullPage: true });
  await page.locator('#flow-tab').click();
  await waitForRender(page);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await page.locator('.flow-stage').count(), 8);
  await page.screenshot({ path: `${evidence}/flow-narrow.png`, fullPage: true });
}
async function checkFlow(page) {
  await page.locator('#flow-tab').click();
  await waitForRender(page);
  assert.equal(await page.locator('.flow-stage').count(), 8);
  assert.deepEqual(await page.locator('.flow-stage.worst h3').allTextContents(), ['Test']);
  assert.equal(await page.locator('.flow-move').count(), 16);
  assert.equal(await page.locator('.flow-move.back').count(), 6);
  assert.equal(await page.locator('.flow-move.next').count(), 7);
  assert.equal(await page.locator('.flow-visits').last().textContent(), '2 visits, 52 unmeasured');
  assert.match((await readExplain(page.locator('.flow-visits').last())).note, /^Unmeasured visits overlap/);
  assert.deepEqual(await page.locator('.flow-stage').nth(3).locator('.flow-bar-head span:first-child').allTextContents(), ['Waiting', 'Agent', 'Checks', 'Git and GitHub']);
  assert.deepEqual(await page.locator('.flow-stage').nth(4).locator('.flow-bar-head span:first-child').allTextContents(), ['Committee', 'Git and GitHub']);
  const spill = await page.locator('.flow-bar').evaluateAll((blocks) => blocks.filter((block) => block.scrollWidth > block.clientWidth + 1).length);
  assert.equal(spill, 0);
  const outside = await page.evaluate(() => {
    const panel = document.querySelector('.flow-panel').getBoundingClientRect();
    return [...document.querySelectorAll('.flow-lines text')].filter((node) => { const box = node.getBoundingClientRect(); return box.top < panel.top || box.bottom > panel.bottom || box.left < panel.left || box.right > panel.right; }).length;
  });
  assert.equal(outside, 0);
  const back = page.locator('.flow-move.back text').first();
  await back.hover();
  assert.equal(await page.locator('#full-text').isVisible(), true);
  assert.match(await page.locator('#full-text').textContent(), /Moves.* to /);
  await page.locator('#overview-tab').focus();
  await page.keyboard.press('End');
  assert.equal(await page.locator('#flow-tab').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('Home');
  assert.equal(await page.locator('#overview-tab').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#flow-tab').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#flow').isVisible(), true);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#overview').isVisible(), true);
}
async function checkUntrustedAndMissingData(page) {
  const malicious = structuredClone(fixture);
  malicious.github.value.cards.value[0].title = '<img src=x onerror="window.injected=true">';
  malicious.operations.value.privateChat = 'PRIVATE CHAT MUST NOT RENDER';
  await sendSnapshot(page, malicious);
  assert.equal(await page.locator('#worker-rows img').count(), 0);
  assert.ok((await page.locator('#worker-rows').textContent()).includes('<img'));
  assert.ok(!(await page.locator('body').textContent()).includes('PRIVATE CHAT MUST NOT RENDER'));
  malicious.operations.value.features[0].title = '<img src=x onerror="window.injected=true">';
  await sendSnapshot(page, malicious);
  await page.getByRole('button', { name: 'Expand next release' }).click();
  assert.equal(await page.getByRole('dialog', { name: 'Next release' }).locator('img').count(), 0);
  await page.keyboard.press('Escape');
  const missing = structuredClone(fixture);
  for (const name of ['operations', 'github', 'live', 'host', 'analytics']) missing[name] = { status: 'unavailable', value: null, at: null };
  await sendSnapshot(page, missing);
  assert.ok((await page.locator('#worker-rows').textContent()).includes('unavailable'));
  assert.match(await page.locator('#event-log').textContent(), /Events unavailable/);
  await page.locator('#analytics-tab').click();
  await waitForRender(page);
  assert.equal(await page.locator('#usage-cost').textContent(), '—');
  assert.equal(await page.locator('#usage-wasted-cost').textContent(), '—');
  assert.equal(await page.locator('#usage-wait').textContent(), '—');
  assert.equal(await page.locator('#usage-input').textContent(), '—');
  assert.equal(await page.locator('#usage-output').textContent(), '—');
  assert.equal(await page.locator('#stage-model-rows').textContent(), 'Unavailable');
  await page.locator('#delivery-tab').click();
  await waitForRender(page);
  assert.equal(await page.locator('#issue-mean').textContent(), '—');
  assert.equal(await page.locator('#issue-median').textContent(), '—');
  assert.equal(await page.locator('#delivery-coverage').textContent(), 'Card records unavailable');
  assert.equal(await page.locator('#dwell-rows').textContent(), 'Unavailable');
  assert.equal(await page.locator('#committee-rate').textContent(), '—');
  await page.locator('#flow-tab').click();
  await waitForRender(page);
  assert.equal(await page.locator('#flow-coverage').textContent(), 'Card records unavailable');
  assert.equal(await page.locator('#flow-map').textContent(), 'Unavailable');
  await page.locator('#overview-tab').click();
  await waitForRender(page);
  assert.deepEqual(await page.locator('#funnel strong').allTextContents(), fill('—'));
  const empty = structuredClone(fixture);
  empty.github.value.cards.value = [];
  await sendSnapshot(page, empty);
  assert.deepEqual(await page.locator('#funnel strong').allTextContents(), fill('0'));
  const stale = structuredClone(fixture);
  stale.github.status = 'stale';
  await sendSnapshot(page, stale);
  assert.deepEqual(await page.locator('#funnel strong').allTextContents(), fill('—'));
}
await new Promise((done) => server.listen(0, '127.0.0.1', done));
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const size of [{ width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 1024, height: 768 }]) {
    const page = await browser.newPage({ viewport: size });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error' && message.text().includes('Content Security Policy')) errors.push(message.text()); });
    await page.addInitScript(() => {
      window.EventSource = class {
        constructor() { this.listeners = {}; window.fixtureStream = this; }
        addEventListener(name, callback) { this.listeners[name] = callback; }
        close() {}
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/factory/`);
    await page.evaluate(() => document.fonts.ready);
    await sendSnapshot(page, fixture);
    await checkLayout(page, size);
    await checkReleaseAndManager(page);
    await checkExpandedViews(page);
    await checkCapacityAndCpu(page);
    await checkCounters(page);
    await checkDelivery(page);
    await checkFlow(page);
    await checkPagination(page);
    await checkPause(page);
    await checkUntrustedAndMissingData(page);
    await checkNarrow(page);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Browser layout, keyboard, pagination, missing-data and escaping checks passed');
} finally { await browser.close(); await new Promise((done) => server.close(done)); }
