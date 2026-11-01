/** @param {Record<string, string>} labels @returns {Record<string, string>} */
function showRawKeys(labels) { return new Proxy(labels, { get: (target, key) => (typeof key === 'string' && Object.hasOwn(target, key) ? target[key] : String(key)) }); }
/** @typedef {import('../src/dashboard/analytics').PanelRows} PanelRows */
/** @typedef {NonNullable<ReturnType<typeof readOperations>>} Operations */
/** @typedef {ReturnType<typeof getRelease>} Release */
/** @typedef {import('../src/dashboard/snapshot').GithubSnapshot} GithubSnapshot */
let stages = showRawKeys({});
let actions = showRawKeys({});
let reasons = showRawKeys({});
let queueNames = showRawKeys({});
let dwellNames = showRawKeys({});
let loopNames = showRawKeys({});
let mergeStateNames = showRawKeys({});
let outcomeNames = showRawKeys({});
/** @type {Record<string, string>} */
let columnNames = {};
/** @type {(keyof Operations['queues'])[]} */
let queueOrder = [];
/** @param {import('../src/dashboard/labels').Labels} labels */
function readLabels(labels) {
  stages = showRawKeys(labels.stages);
  actions = showRawKeys(labels.activities);
  reasons = showRawKeys(labels.reasons);
  queueNames = showRawKeys(labels.queues);
  dwellNames = showRawKeys(labels.dwell);
  loopNames = showRawKeys(labels.loops);
  mergeStateNames = showRawKeys(labels.mergeStates);
  outcomeNames = showRawKeys(labels.outcomes);
  columnNames = labels.columns;
  queueOrder = /** @type {(keyof Operations['queues'])[]} */ (Object.keys(labels.queues));
}
const pages = new Map();
const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
/** @type {import('../src/dashboard/snapshot').Snapshot} */
let snapshot = /** @type {any} */ (null);
let selectedDays = 7;
let metric = 'cost';
let grouping = 'stage';
let connected = false;
let renderPending = false;
let renderFailed = false;
/** @type {HTMLElement | null} */
let detailOwner = null;
/** @param {string} selector @returns {HTMLElement[]} */
function queryAll(selector) { return /** @type {HTMLElement[]} */ ([...document.querySelectorAll(selector)]); }
/** @param {string} id @returns {any} The page's own ids exist, so a missing one throws at its first use. */
function getElement(id) { return document.getElementById(id); }
function createNode(tag, text = '', className = '') { const node = document.createElement(tag); node.textContent = text; node.className = className; return node; }
function setText(id, value) { getElement(id).textContent = value; }
function formatNumber(value) { return value == null ? '—' : compact.format(value); }
function formatCost(value) { return value == null ? '—' : money.format(value); }
function formatBytes(value) { return value == null ? '—' : `${(value / 1073741824).toFixed(1)} GiB`; }
function formatDuration(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const minutes = Math.floor(Math.max(0, ms) / 60000);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
function formatAge(at) {
  if (!at) return 'unknown';
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(at)) / 1000));
  return seconds < 60 ? '<1m' : formatDuration(seconds * 1000);
}
function countInputTokens(tokens) { return tokens == null ? null : tokens.input + tokens.cacheRead + tokens.cacheWrite; }
function countTokens(tokens) { return tokens == null ? null : countInputTokens(tokens) + tokens.output; }
function createLink(text, href) {
  const url = new URL(href);
  if (url.protocol !== 'https:') throw new Error('Invalid public link');
  const node = createNode('a', text);
  node.href = url.href;
  node.rel = 'noopener noreferrer';
  node.dataset.key = url.href;
  return node;
}
function getIssueUrl(issue) { return `${snapshot.repoUrl}/issues/${issue}`; }
function replaceContents(id, nodes) {
  const target = getElement(id);
  const key = target.contains(document.activeElement) ? /** @type {HTMLElement} */ (document.activeElement).dataset.key : null;
  target.replaceChildren(...nodes);
  if (key) target.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
}
function requestRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false;
    if (!snapshot) return;
    try { renderSnapshot(); renderFailed = false; }
    catch (error) { renderFailed = true; console.error('Dashboard render failed', error); setText('connection', 'Invalid data'); }
  });
}
function createPageButton(label, key, disabled, change) {
  const button = createNode('button', label);
  button.setAttribute('aria-label', `${label} ${key.replaceAll('-', ' ')}`);
  button.dataset.key = `${key}-${label}`;
  button.setAttribute('aria-disabled', String(disabled));
  if (disabled) setExplain(button, [], label === 'Previous' ? 'First page' : 'Last page');
  button.addEventListener('click', () => { if (disabled) return; pages.set(key, (pages.get(key) ?? 0) + change); requestRender(); });
  return button;
}
function selectPage(key, rows, capacity) {
  const size = Math.max(1, capacity);
  const last = Math.max(0, Math.ceil(rows.length / size) - 1);
  const page = Math.min(pages.get(key) ?? 0, last);
  pages.set(key, page);
  const controls = rows.length > size ? [createPageButton('Previous', key, page === 0, -1), createNode('span', `${page * size + 1}–${Math.min((page + 1) * size, rows.length)} / ${rows.length}`), createPageButton('Next', key, page === last, 1)] : [];
  replaceContents(`${key}-pages`, controls);
  return rows.slice(page * size, (page + 1) * size);
}
function readTableCapacity(key) {
  const zone = getElement(`${key}-zone`);
  const header = zone.querySelector('thead').getBoundingClientRect().height;
  const row = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-height'));
  return Math.max(1, Math.floor((zone.clientHeight - header) / row));
}
function createEmptyRow(text, columnsCount) { const row = createNode('tr'); const cell = createNode('td', text, 'muted'); cell.colSpan = columnsCount; row.append(cell); return row; }
function renderTable(key, rows, renderRow, empty, columnCount) {
  const visible = selectPage(key, rows, readTableCapacity(key));
  replaceContents(`${key}-rows`, visible.length ? visible.map(renderRow) : [createEmptyRow(empty, columnCount)]);
}
function readOperations() { return snapshot.operations.value; }
function readLive() { return snapshot.live?.value ?? null; }
function readCards() { return snapshot.github.value?.cards.value ?? []; }
function readWorkerTitle(job) {
  if (job.issue === null) return stages[job.stage];
  const card = readCards().find((item) => item.issue === job.issue);
  return card ? `#${job.issue} ${card.title}` : `#${job.issue}`;
}
function readDoing(activity) {
  if (!activity?.activity) return 'Activity unavailable';
  if (activity.status === 'stale') return 'Activity stale';
  if (activity.phase === 'failed') return 'Command failed';
  if (activity.phase === 'completed') return 'Next operation pending';
  return formatActivity(activity);
}
function formatActivity(activity) {
  if (activity.milestone) return `${activity.milestone}: ${actions[activity.activity].toLowerCase()}`;
  return actions[activity.activity];
}
function createWorkerRow(job) {
  const row = createNode('tr');
  const title = createNode('td');
  const text = readWorkerTitle(job);
  if (job.issue === null) title.textContent = text;
  else title.append(createLink(text, getIssueUrl(job.issue)));
  const activity = readLive()?.workers.find((item) => item.key === job.key);
  const progress = activity?.progressAt ? formatAge(activity.progressAt) : '—';
  row.append(title, createNode('td', stages[job.stage]), createNode('td', readDoing(activity)), createNode('td', `${progress} / ${formatDuration(Date.now() - Date.parse(job.startedAt))}`, 'numeric'));
  return row;
}
function renderWorkers() {
  const operations = readOperations();
  renderTable('worker', operations?.jobs ?? [], createWorkerRow, operations ? 'No running jobs' : 'State unavailable', 4);
  renderCapacity(operations);
}
function readQueueWaits() {
  const decisions = readLive()?.scheduler?.decisions ?? [];
  return decisions.filter((item) => item.reasons.length > 0 && !item.reasons.includes('issue-running'));
}
/** @param {Operations | null} operations */
function readWaitingStatus(operations) {
  if (!operations) return 'State unavailable';
  if (operations.status === 'paused') return 'Starts paused';
  return readSchedulerAvailability(readLive()?.scheduler);
}
function readSchedulerAvailability(scheduler) {
  if (!scheduler) return 'Scheduler unavailable';
  if (scheduler.freshness !== 'ok') return 'Scheduler stale';
  if (scheduler.status !== 'ready') return readSchedulerStatus(scheduler.status);
  return null;
}
/** @param {Operations | null} operations */
function renderBusyCount(operations) {
  if (!operations) return setText('free-count', '');
  const queues = Object.values(operations.queues);
  const total = queues.reduce((sum, queue) => sum + queue.total, 0);
  const busy = queues.reduce((sum, queue) => sum + queue.busy, 0);
  setText('free-count', `${snapshot.operations.status === 'ok' ? '' : 'Last known: '}${busy} / ${total} busy`);
}
function mergeWaits(items) {
  const merged = new Map();
  items.forEach((item, index) => {
    const key = item.issue === null ? `row:${index}` : `${item.issue}:${item.stage}`;
    const known = merged.get(key);
    merged.set(key, known ? { ...known, reasons: [...new Set([...known.reasons, ...item.reasons])] } : item);
  });
  return [...merged.values()];
}
function groupWaitsByReason(waits) {
  const groups = new Map();
  for (const item of waits) for (const reason of item.reasons) groups.set(reason, [...(groups.get(reason) ?? []), item]);
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
}
function formatWaitingCard(item) { return item.issue === null ? stages[item.stage] : `#${item.issue} ${stages[item.stage]}`; }
function createWhyCell(waits) {
  const groups = groupWaitsByReason(waits);
  const cell = createNode('td', groups.map(([reason, items]) => groups.length === 1 ? reasons[reason] : `${reasons[reason]} ${items.length}`).join(', '));
  setExplain(cell, groups.map(([reason, items]) => [reasons[reason], items.map(formatWaitingCard).join(', ')]));
  return cell;
}
function createBusyCell(queue, waiting) {
  if (queue === undefined) return createNode('td', '—', 'numeric');
  const crowded = queue.busy >= queue.total && waiting > 0;
  return createNode('td', `${queue.busy} / ${queue.total}`, crowded ? 'numeric high' : readCountClass(queue.busy));
}
function readCountClass(count) { return count === 0 ? 'numeric zero' : 'numeric'; }
function createQueueRow(name, queue, waits) {
  const row = createNode('tr');
  if (waits === null) row.append(createNode('td', queueNames[name]), createBusyCell(queue, 0), createNode('td', '—', 'numeric'), createNode('td'));
  else row.append(createNode('td', queueNames[name]), createBusyCell(queue, waits.length), createNode('td', String(waits.length), readCountClass(waits.length)), createWhyCell(waits));
  return row;
}
/** @param {Operations | null} operations */
function renderCapacity(operations) {
  renderBusyCount(operations);
  const status = readWaitingStatus(operations);
  setText('capacity-status', status ?? '');
  const waits = status === null ? mergeWaits(readQueueWaits()) : null;
  replaceContents('queue-rows', queueOrder.map((name) => createQueueRow(name, operations?.queues[name], waits === null ? null : waits.filter((item) => item.queue === name))));
}
function renderFunnel() {
  const part = snapshot.github.status === 'ok' ? snapshot.github.value?.cards : null;
  const cards = part?.value ?? null;
  replaceContents('funnel', Object.keys(columnNames).map((column) => {
    const item = createNode('div');
    const value = cards ? cards.filter((card) => card.column === column).length : null;
    item.append(createNode('span', columnNames[column]), createNode('strong', formatNumber(value), value === 0 ? 'zero' : ''));
    if (value === null) setExplain(item.lastChild, [], part?.error ?? 'Unavailable');
    return item;
  }));
}
function createMergeItem(item) {
  const node = createNode('li');
  node.append(createLink(`#${item.issue} ${item.title}`, getIssueUrl(item.issue)), createNode('span', mergeStateNames[item.state], item.state === 'stuck' ? 'bad' : 'muted'));
  return node;
}
/** @template {'cards' | 'mergeQueue'} K @param {K} name @returns {{ value: GithubSnapshot[K]['value'], problem: string }} */
function readGithubPart(name) {
  const part = snapshot.github.value?.[name];
  if (!part) return { value: null, problem: 'Unavailable' };
  return { value: part.value, problem: part.error ?? '' };
}
function renderMergeQueue() {
  const { value: items, problem } = readGithubPart('mergeQueue');
  setText('merge-count', items ? String(items.length) : '');
  const rows = items ?? [];
  replaceContents('merge-items', rows.length ? rows.map(createMergeItem) : [createNode('li', problem || 'Empty', 'muted')]);
}
function getRelease() {
  const features = readOperations()?.features;
  return features ? { features } : null;
}
function formatReleaseGate(gate) {
  if (readOperations()?.release === null) return 'Release not opened';
  if (!gate) return 'Readiness not checked';
  const labels = { unopened: 'Release not opened', 'tracking-missing': 'Tracking issue unavailable', failed: 'Release job failed', playtest: 'Release playtest pending', 'playtest-blocked': 'Release playtest blocked', candidate: 'Candidate build pending', 'ship-approval': 'Needs committee ship approval' };
  return labels[gate.reason];
}
function renderRelease() {
  const release = getRelease();
  renderReleaseItems(release);
  setText('release-gate', formatReleaseGate(readLive()?.scheduler?.release));
  renderReleaseLinks(release);
  if (getElement('release-dialog').open) renderReleaseDialog(release);
}
function createReleaseItem(feature) {
  const item = createNode('li');
  item.append(createLink(`#${feature.issue} ${feature.title}`, getIssueUrl(feature.issue)));
  return item;
}
/** @param {Release | null} release */
function renderReleaseItems(release) {
  const features = release?.features ?? [];
  setText('release-count', release ? `${features.length} changes` : '');
  const visible = selectPage('release', features, 3);
  const empty = release ? 'No changes on dev' : 'Contents unavailable';
  replaceContents('release-items', visible.length ? visible.map(createReleaseItem) : [createNode('li', empty, 'muted')]);
}
function readDialogCapacity(id) {
  const list = getElement(id);
  const row = parseFloat(getComputedStyle(list).getPropertyValue('--dialog-row-height'));
  if (!Number.isFinite(row) || row <= 0) throw new Error('Invalid dialog row height');
  return Math.max(1, Math.floor(list.clientHeight / row));
}
/** @param {Release | null} release */
function renderReleaseDialog(release) {
  const features = release?.features ?? [];
  setText('release-dialog-count', release ? `${features.length} changes` : '');
  setText('release-dialog-gate', formatReleaseGate(readLive()?.scheduler?.release));
  renderReleaseDialogItems(features, release !== null);
}
function renderReleaseDialogItems(features, available) {
  const visible = selectPage('release-dialog', features, readDialogCapacity('release-dialog-rows'));
  const empty = available ? 'No changes on dev' : 'Contents unavailable';
  replaceContents('release-dialog-rows', visible.length ? visible.map(createReleaseItem) : [createNode('li', empty, 'muted')]);
}
/** @param {Release | null} release */
function renderReleaseLinks(release) {
  const operations = readOperations();
  const tracking = operations?.release;
  getElement('release-link').hidden = release === null;
  setText('release-link', tracking ? 'Tracking issue' : 'Compare');
  getElement('release-link').href = tracking ? getIssueUrl(tracking.issue) : `${snapshot.repoUrl}/compare/main...dev`;
  const candidateUrl = operations?.candidateUrl;
  getElement('candidate-link').hidden = !candidateUrl;
  if (candidateUrl) getElement('candidate-link').href = candidateUrl;
}
function readSchedulerStatus(status) {
  const labels = { checking: 'Checking queues', ready: 'Queues checked', paused: 'Factory paused', 'disk-low': 'Starts blocked by low disk space', failed: 'Scheduler failed' };
  return labels[status];
}
function readManagerAction(manager) {
  if (!manager) return 'Activity unavailable';
  if (manager.status !== 'ok') return 'Activity stale';
  if (manager.phase === 'completed') return `Idle for ${formatAge(manager.since)}`;
  const phase = manager.intent ? `${actions[manager.intent]}: ${actions[manager.activity].toLowerCase()}` : actions[manager.activity];
  return `${phase}, ${formatAge(manager.since)} in phase`;
}
function renderManager() {
  const live = readLive();
  const manager = live?.manager;
  setText('manager-action', readManagerAction(manager));
}
function createReading(label, value) { const node = createNode('div'); node.append(createNode('span', label), createNode('strong', value)); return node; }
function readRam(host) { const ram = host.ram.value; return ram ? `${(ram.used / 1073741824).toFixed(1)} / ${formatBytes(ram.total)}` : '—'; }
function readGpu(host) { const gpu = host.gpu.value; return gpu ? gpu.map((row) => `${row.utilization}%`).join(' / ') : '—'; }
function createResourceRow(resource) {
  const job = readOperations()?.jobs.find((item) => item.key === resource.jobId);
  const title = job ? readResourceTitle(job) : resource.service;
  const row = createNode('tr');
  row.append(createNode('td', title), createNode('td', `${resource.cpu.toFixed(1)}%`, 'numeric'), createNode('td', formatMemory(resource.memory), 'numeric'));
  return row;
}
function formatMemory(value) {
  if (value == null) return '—';
  if (value > 0 && value < 1048576) return '<1 MiB';
  return value < 1073741824 ? `${Math.round(value / 1048576)} MiB` : formatBytes(value);
}
function readResourceTitle(job) { return job.issue === null ? stages[job.stage] : `#${job.issue}`; }
function renderServer() {
  const host = snapshot.host.value;
  replaceContents('server-totals', createServerTotals(host));
  const containers = host?.containers?.value;
  const rows = containers ? [...containers].sort((a, b) => b.cpu - a.cpu) : [];
  renderTable('server', rows, createResourceRow, containers ? 'No measured containers' : 'Container readings unavailable', 3);
  setText('server-note', readStorageNote(host));
}
function createServerTotals(host) {
  if (!host) return [createReading('Readings', 'Unavailable')];
  const cpu = host.cpu.value === null ? '—' : `${host.cpu.value.toFixed(1)}%`;
  return [createReading('CPU', cpu), createReading('RAM', readRam(host)), createReading('GPU', readGpu(host))];
}
function readStorageNote(host) { return host?.ssd.value ? `Disk free ${formatBytes(host.ssd.value.free)}. Container usage only.` : 'Disk reading unavailable'; }
/** @type {Record<keyof PanelRows, string>} */
const panelTitles = {
  problems: 'Ledger check', coverage: 'Coverage', counters: 'Totals', usage_buckets: 'Usage chart', stage_time: 'Running time', waiting: 'Waiting time',
  waiting_stages: 'Waiting by stage', retries: 'Repeat attempts', stage_models: 'Tokens by stage and model', activity: 'Event log',
  delivery_coverage: 'Card coverage', lead: 'In flight', issue_to_dev: 'Issue to dev', dwell: 'Stage time', loops: 'Loops', rejections: 'Rejections', delivery_retries: 'Card retries',
  flow_stages: 'Stage flow', flow_moves: 'Card moves',
};
/** @template {keyof PanelRows} K @param {K} name @param {1 | 7 | 30} days @returns {{ rows: PanelRows[K][] | null, problem: string }} */
function readPanel(name, days) {
  const result = snapshot.analytics.value?.[name];
  if (!result) return { rows: null, problem: 'Unavailable' };
  if (result.error !== null) return { rows: null, problem: `${panelTitles[name]} failed: ${result.error}` };
  return { rows: result.ranges[days], problem: '' };
}
/** @template {keyof PanelRows} K @param {K} name */
function readSelected(name) { return readPanel(name, /** @type {1 | 7 | 30} */ (selectedDays)); }
/** @template {keyof PanelRows} K @param {K} name @returns {{ row: PanelRows[K] | null, problem: string }} */
function readRow(name) { const { rows, problem } = readSelected(name); return { row: rows?.[0] ?? null, problem }; }
function formatEventText(event) { return `${stages[event.stage]} ${outcomeNames[event.outcome].toLowerCase()}`; }
function createEvent(event) {
  const node = createNode('div', '', 'event');
  const time = createNode('time', event.at.slice(11, 16));
  setExplain(time, [['At', formatStamp(event.at)]]);
  node.append(time, createNode('span', formatEventText(event)));
  if (event.issue !== null) node.append(' ', createLink(`#${event.issue}`, getIssueUrl(event.issue)));
  return node;
}
function readEvents() { const events = readPanel('activity', 30); return snapshot.analytics.value ? events : { rows: null, problem: 'Events unavailable' }; }
function createDialogEvent(event) {
  const row = createNode('div', '', 'event-row');
  const time = createNode('time', formatStamp(event.at));
  time.dateTime = event.at;
  row.append(time, createNode('span', formatEventText(event)));
  if (event.issue !== null) {
    const link = createLink(`#${event.issue}`, getIssueUrl(event.issue));
    link.dataset.key = `${event.at}-${event.stage}-${event.issue}`;
    row.append(link);
  }
  return row;
}
function renderEventDialog(events) {
  setText('event-dialog-count', events.rows ? `${events.rows.length} events` : '');
  const visible = selectPage('event-dialog', events.rows ?? [], readDialogCapacity('event-dialog-rows'));
  replaceContents('event-dialog-rows', visible.length ? visible.map(createDialogEvent) : [createNode('p', events.rows ? 'No recorded events' : events.problem, 'empty')]);
}
function renderEvents() {
  const events = readEvents();
  const width = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--event-width'));
  const capacity = Math.max(1, Math.floor(getElement('event-log').clientWidth / width));
  const visible = selectPage('event', events.rows ?? [], capacity);
  replaceContents('event-log', visible.length ? visible.map(createEvent) : [createNode('span', events.rows ? 'No recorded events' : events.problem, 'muted')]);
  if (getElement('event-dialog').open) renderEventDialog(events);
}
/** @param {PanelRows['counters']} row */
function readTokens(row) { return row.input === null ? null : { input: row.input, output: Number(row.output), cacheRead: Number(row.cache_read), cacheWrite: Number(row.cache_write) }; }
/** @param {PanelRows['counters']} row */
function readWastedTokens(row) { return row.wasted_input === null ? null : { input: row.wasted_input, output: Number(row.wasted_output), cacheRead: Number(row.wasted_cache_read), cacheWrite: Number(row.wasted_cache_write) }; }
function renderCounters() {
  const { row, problem } = readRow('counters');
  if (row) {
    renderTokenCounters(readTokens(row));
    setCounter('usage-time', formatDuration(row.worker_ms), []);
    setCounter('usage-cost', formatCost(row.cost), []);
    const wasted = countTokens(readWastedTokens(row));
    setCounter('usage-wasted-cost', formatCost(row.wasted_cost), wasted == null ? [] : [['Tokens', formatNumber(wasted)]]);
  } else for (const id of ['usage-tokens', 'usage-input', 'usage-output', 'usage-time', 'usage-cost', 'usage-wasted-cost']) setCounter(id, '—', [], problem || 'Unavailable');
  renderWaitCounter();
  setText('coverage', readCoverage(problem));
}
function renderWaitCounter() {
  const { row } = readRow('waiting');
  if (!row || row.waiting_ms === null || !row.span_ms) return setCounter('usage-wait', '—', [], 'Unavailable');
  setCounter('usage-wait', (row.waiting_ms / row.span_ms).toFixed(1), [['Card time', formatDuration(row.waiting_ms)], ['Clock time', formatDuration(row.span_ms)]]);
}
function readHistoryParts() {
  const { row, problem } = readRow('coverage');
  if (!row) return [problem];
  return [row.since ? `History from ${row.since.slice(0, 10)} UTC` : 'No recorded history', `${row.missing_usage} runs lack token counts`];
}
function readLeftOut() {
  const { row, problem } = readRow('problems');
  if (!row) return problem;
  const left = row.unreadable + row.untimed + row.uncosted;
  return left ? `${left} ledger records left out` : '';
}
function readCoverage(countersProblem) {
  const waiting = readRow('waiting');
  const parts = [countersProblem, ...readHistoryParts(), waiting.row ? `${waiting.row.gaps} wait gaps` : waiting.problem, readLeftOut()];
  return [...new Set(parts.filter(Boolean))].join(', ');
}
function renderTokenCounters(tokens) {
  setCounter('usage-tokens', formatNumber(countTokens(tokens)), []);
  setCounter('usage-input', formatNumber(countInputTokens(tokens)), tokens ? [['New input', formatNumber(tokens.input)], ['Cache read', formatNumber(tokens.cacheRead)], ['Cache write', formatNumber(tokens.cacheWrite)]] : []);
  setCounter('usage-output', formatNumber(tokens?.output), []);
}
/** @typedef {[string, string][]} DetailRows */
/** @param {HTMLElement} node @param {DetailRows} rows @param {string} [note] */
function setExplain(node, rows, note = '') {
  if (!rows.length && !note) return void delete node.dataset.explain;
  node.dataset.explain = JSON.stringify({ rows, note });
}
/** @param {string} id @param {string} display @param {DetailRows} rows @param {string} [note] */
function setCounter(id, display, rows, note = '') { setText(id, display); setExplain(getElement(id), rows, note); }
function formatCount(value) { return value == null ? '—' : value.toLocaleString(); }
function formatStamp(at) { return `${at.slice(0, 16).replace('T', ' ')} UTC`; }
/** @param {PanelRows['usage_buckets'][]} rows */
function readUsageSlots(rows) {
  const hourly = selectedDays === 1;
  const end = new Date(snapshot.generatedAt);
  if (hourly) end.setUTCMinutes(0, 0, 0); else end.setUTCHours(0, 0, 0, 0);
  const count = hourly ? 25 : selectedDays + 1;
  return Array.from({ length: count }, (_, index) => {
    const start = new Date(end.getTime() - (count - 1 - index) * (hourly ? 3600000 : 86400000)).toISOString().slice(0, hourly ? 13 : 10);
    return { label: hourly ? `${start.slice(11)}:00` : start.slice(5), bucket: rows.filter((row) => row.start === start) };
  });
}
/** @param {PanelRows['usage_buckets'][]} bucket @returns {Record<string, PanelRows['usage_buckets']>} */
function readSegments(bucket) { return Object.fromEntries(bucket.filter((row) => row.grouping === grouping).map((row) => [row.key, row])); }
/** @param {PanelRows['usage_buckets'][]} bucket @param {string} key */
function readSegmentValue(bucket, key) {
  if (!bucket.length || (metric === 'tokens' && bucket.every((row) => row.tokens === null))) return null;
  return readSegments(bucket)[key]?.[metric] ?? 0;
}
function readSegmentKeys(slots) {
  const totals = new Map();
  for (const slot of slots) for (const [key, segment] of Object.entries(readSegments(slot.bucket))) totals.set(key, (totals.get(key) ?? 0) + (segment[metric] ?? 0));
  return [...totals.keys()].filter((key) => totals.get(key) > 0).sort((a, b) => totals.get(b) - totals.get(a));
}
function readSegmentLabel(key) {
  if (grouping === 'stage') return stages[key];
  return key === 'unattributed' ? 'No model data' : key.replace(/^claude-/, '');
}
function formatUsageValue(value) { return metric === 'tokens' ? formatNumber(value) : formatCost(value); }
function readToken(name) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!value) throw new Error(`Missing style token ${name}`);
  return value;
}
function readSize(name) { return parseFloat(readToken(name)); }
const segmentTokens = Array.from({ length: 10 }, (_, index) => `--series-${index + 1}`);
/** @type {string[]} */
let segmentColors = [];
function createUsageTooltip() {
  return {
    enabled: false,
    filter: (item) => item.raw !== null && item.raw > 0,
    itemSort: (a, b) => b.raw - a.raw,
    external: ({ chart, tooltip }) => renderChartDetail(chart, tooltip),
  };
}
function renderChartDetail(chart, tooltip) {
  const points = tooltip.dataPoints ?? [];
  if (tooltip.opacity === 0 || !points.length) return hideDetail();
  /** @type {DetailRows} */
  const rows = points.map((item) => [item.dataset.label, formatUsageValue(item.raw)]);
  rows.push(['Total', formatUsageValue(points.reduce((sum, item) => sum + item.raw, 0))]);
  const canvas = chart.canvas.getBoundingClientRect();
  placeDetail([createNode('p', tooltip.title.join(' '), 'muted'), ...createDetailNodes({ rows, note: '' })], { left: canvas.left + tooltip.caretX, bottom: canvas.top + tooltip.caretY });
}
/** @type {any} */
let usageChart = null;
function createUsageChart() {
  segmentColors = segmentTokens.map(readToken);
  Chart.defaults.color = readToken('--ink-muted');
  Chart.defaults.font.family = readToken('--font-mono');
  Chart.defaults.font.size = readSize('--text-caption');
  return new Chart(getElement('usage-chart'), { type: 'bar', data: { labels: [], datasets: [] }, options: {
    animation: false, maintainAspectRatio: false,
    scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0 } }, y: { stacked: true, grid: { color: readToken('--line-faint') }, ticks: { callback: (value) => formatUsageValue(value) } } },
    plugins: { legend: { position: 'right', labels: { boxWidth: readSize('--space-5'), font: { family: readToken('--font-ui'), size: readSize('--text-dense') } } }, tooltip: createUsageTooltip() },
    interaction: { mode: 'index', intersect: false },
  } });
}
function renderUsageChart() {
  setText('usage-title', metric === 'cost' ? 'Spend' : 'Tokens');
  usageChart ??= createUsageChart();
  const hidden = new Set(usageChart.data.datasets.filter((_, index) => !usageChart.isDatasetVisible(index)).map((dataset) => dataset.label));
  const { rows, problem } = readSelected('usage_buckets');
  const slots = rows ? readUsageSlots(rows) : [];
  const keys = readSegmentKeys(slots);
  usageChart.data.labels = slots.map((slot) => slot.label);
  usageChart.data.datasets = keys.map((key, index) => {
    const label = readSegmentLabel(key);
    return { label, hidden: hidden.has(label), data: slots.map((slot) => readSegmentValue(slot.bucket, key)), backgroundColor: segmentColors[index % segmentColors.length] };
  });
  usageChart.update();
  setText('usage-empty', rows ? 'No recorded usage' : problem);
  getElement('usage-empty').hidden = keys.length > 0;
}
/** @param {PanelRows['stage_time'][]} running @param {PanelRows['waiting_stages'][]} waiting */
const stageParts = /** @type {const} */ ([['agent_ms', 'Agent', 'agent'], ['checks_ms', 'Checks', 'checks'], ['build_ms', 'Build', 'build'], ['factory_ms', 'Git and GitHub', 'factory'], ['unsplit_ms', 'Not split', 'unsplit']]);
/** @typedef {{ stage: string, run: number, wait: number, parts: [string, number, string][] }} StageRow */
/** @param {PanelRows['stage_time'][]} running @param {PanelRows['waiting_stages'][]} waiting @returns {StageRow[]} */
function readStageRows(running, waiting) {
  const names = new Set([...running.map((row) => row.stage), ...waiting.map((row) => row.stage)]);
  return [...names].map((stage) => {
    const row = running.find((item) => item.stage === stage);
    const parts = row ? stageParts.filter(([key]) => row[key] > 0).map(([key, label, className]) => /** @type {[string, number, string]} */ ([label, row[key], className])) : [];
    return { stage, run: row?.worker_ms ?? 0, wait: waiting.find((item) => item.stage === stage)?.waiting_ms ?? 0, parts };
  });
}
/** @param {StageRow} row @param {number} maximum @param {boolean} waitingKnown */
function createStageBar(row, maximum, waitingKnown) {
  const node = createNode('div', '', 'stage-row');
  const bar = createNode('div', '', 'stage-bar');
  /** @type {[string, number, string][]} */
  const segments = [...row.parts, ['Waiting', row.wait, 'waiting']];
  for (const [, value, name] of segments) {
    const segment = createNode('span', '', name);
    segment.style.width = `${100 * value / maximum}%`;
    bar.append(segment);
  }
  const wait = waitingKnown ? formatDuration(row.wait) : '—';
  const label = createNode('span', stages[row.stage]);
  setExplain(label, [...row.parts.map(([name, value]) => /** @type {[string, string]} */ ([name, formatDuration(value)])), ['Waiting', wait]]);
  node.append(label, bar, createNode('span', `${formatDuration(row.run)} / ${wait}`, 'stage-amount'));
  return node;
}
function isWaitingKnown() { return readSelected('waiting_stages').rows !== null && readRow('waiting').row?.waiting_ms != null; }
function renderStageChart() {
  const running = readSelected('stage_time');
  const rows = running.rows ? readStageRows(running.rows, readSelected('waiting_stages').rows ?? []) : [];
  const waitingKnown = isWaitingKnown();
  const maximum = Math.max(1, ...rows.map((row) => row.run + row.wait));
  const capacity = Math.max(1, Math.floor(getElement('stage-chart').clientHeight / 34));
  const visible = selectPage('stage', rows, capacity);
  const empty = running.rows ? 'No measured time' : running.problem;
  replaceContents('stage-chart', visible.length ? visible.map((row) => createStageBar(row, maximum, waitingKnown)) : [createNode('p', empty, 'empty')]);
}
function createCountCell(count) { return createNode('td', String(count), readCountClass(count)); }
/** @param {PanelRows['retries']} item */
function createRetryRow(item) { const row = createNode('tr'); row.append(createNode('td', outcomeNames[item.outcome]), createCountCell(item.runs), createNode('td', formatDuration(item.worker_ms), 'numeric'), createNode('td', formatCost(item.cost), 'numeric')); return row; }
function readStageModelLabel(stage) { return stage === null ? 'Total' : stages[stage]; }
function createStageModelCell(usage, measure) {
  const value = usage ? measure === 'input' ? countInputTokens(usage) : usage.output : null;
  const cell = createNode('td', formatNumber(value), readCountClass(value));
  if (usage) setExplain(cell, readStageModelRows(usage, measure));
  return cell;
}
/** @returns {DetailRows} */
function readStageModelRows(usage, measure) {
  if (measure !== 'input') return [];
  return [['New input', formatNumber(usage.input)], ['Cache read', formatNumber(usage.cacheRead)], ['Cache write', formatNumber(usage.cacheWrite)], ['Estimated cost', formatCost(usage.cost)]];
}
/** @param {PanelRows['stage_models']} row */
function readModelUsage(row) { return { stage: row.stage, model: row.model, input: row.input, output: row.output, cacheRead: row.cache_read, cacheWrite: row.cache_write, cost: row.cost }; }
/** @param {ReturnType<typeof readModelUsage>[]} rows */
function sumModels(rows) {
  const totals = new Map();
  for (const row of rows) {
    const total = totals.get(row.model) ?? { model: row.model, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
    for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'cost']) total[key] += row[key];
    totals.set(row.model, total);
  }
  return [...totals.values()];
}
function createStageModelRow(stage, models, totals, stageModels) {
  const row = createNode('tr');
  row.append(createNode('td', readStageModelLabel(stage)));
  for (const model of models) {
    const usage = stage === null ? totals.find((item) => item.model === model) : stageModels.find((item) => item.stage === stage && item.model === model);
    row.append(createStageModelCell(usage, 'input'), createStageModelCell(usage, 'output'));
  }
  return row;
}
function readStageModelNames(rows) {
  const totals = new Map();
  for (const row of rows) totals.set(row.stage, (totals.get(row.stage) ?? 0) + countTokens(row));
  return [...totals.keys()].sort((a, b) => totals.get(b) - totals.get(a));
}
function renderStageModels() {
  const { rows, problem } = readSelected('stage_models');
  const stageModels = (rows ?? []).map(readModelUsage);
  const totals = sumModels(stageModels);
  const models = [...totals].sort((a, b) => countTokens(b) - countTokens(a)).map((item) => item.model);
  const visible = selectPage('model-column', models, 2);
  const stageHeader = createNode('th', 'Stage');
  stageHeader.rowSpan = 2;
  stageHeader.scope = 'col';
  const modelHeaders = visible.map((model) => { const header = createNode('th', model); header.colSpan = 2; header.scope = 'colgroup'; return header; });
  replaceContents('stage-model-header', [stageHeader, ...modelHeaders]);
  const measureHeaders = visible.flatMap(() => ['Input with cache', 'Output'].map((name) => { const header = createNode('th', name); header.scope = 'col'; return header; }));
  replaceContents('stage-model-measures', measureHeaders);
  const stageRows = models.length ? [null, ...readStageModelNames(stageModels)] : [];
  renderTable('stage-model', stageRows, (stage) => createStageModelRow(stage, visible, totals, stageModels), rows ? 'No measured model tokens' : problem, visible.length * 2 + 1);
}
function renderAnalytics() {
  renderCounters();
  renderUsageChart();
  renderStageChart();
  const retries = readSelected('retries');
  renderTable('retry', retries.rows ?? [], createRetryRow, retries.rows ? 'No linked repeat attempts' : retries.problem, 4);
  renderStageModels();
}
function formatRate(part, whole) { return whole ? `${Math.round(100 * part / whole)}%` : '—'; }
/** @param {PanelRows['dwell']} row @param {number} maximum */
function createDwellRow(row, maximum) {
  const node = createNode('tr');
  const bar = createNode('td', '', 'dwell-bar');
  const fill = createNode('span');
  fill.style.width = `${row.mean_ms === null ? 0 : 100 * row.mean_ms / maximum}%`;
  bar.append(fill);
  bar.setAttribute('aria-hidden', 'true');
  const open = createNode('td', row.open ? `${row.open}, ${formatDuration(row.open_mean_ms)}` : '0', readCountClass(row.open));
  node.append(createNode('td', dwellNames[row.stage]), bar, createNode('td', formatDuration(row.mean_ms), 'numeric'), createNode('td', formatDuration(row.median_ms), 'numeric'), createCountCell(row.count), open);
  return node;
}
function createLoopRow(row) { const node = createNode('tr'); node.append(createNode('td', loopNames[row.step]), createCountCell(row.events), createCountCell(row.issues)); return node; }
function createStageRetryRow(row) { const node = createNode('tr'); node.append(createNode('td', stages[row.stage]), createCountCell(row.runs), createCountCell(row.issues)); return node; }
/** @param {{ row: PanelRows['delivery_coverage'] | null, problem: string }} coverage */
function readDeliveryCoverage(coverage) {
  if (snapshot.analytics.status === 'unavailable') return 'Card records unavailable';
  if (!coverage.row) return coverage.problem;
  if (coverage.row.since === null) return 'No card moves recorded yet';
  const prefix = snapshot.analytics.status === 'ok' ? '' : 'Last known: ';
  return `${prefix}${coverage.row.issues} cards, records since ${coverage.row.since.slice(0, 10)} UTC`;
}
/** @param {PanelRows['delivery_coverage'] | null} coverage @param {{ row: PanelRows['lead'] | null, problem: string }} lead */
function readDeliveryNotes(coverage, lead) {
  if (!coverage || coverage.since === null) return { rows: [], note: '' };
  /** @type {DetailRows} */
  const rows = [['Joined before records', formatCount(coverage.legacy)], ['Hotfix, release or private', formatCount(coverage.excluded)]];
  if (lead.row) rows.push(['Merges without a start', formatCount(lead.row.missing_start)]);
  return { rows, note: lead.row ? '' : lead.problem };
}
/** @param {PanelRows['issue_to_dev']} row @returns {DetailRows} */
function readIssueRows(row) {
  /** @type {DetailRows} */
  const rows = row.issues ? [['Issues', formatCount(row.issues)], ['Fastest', formatDuration(row.fastest_ms)], ['Slowest', formatDuration(row.slowest_ms)]] : [];
  return row.missing_open ? [...rows, ['No open date', formatCount(row.missing_open)]] : rows;
}
function renderIssueToDev() {
  const { row, problem } = readRow('issue_to_dev');
  if (!row) {
    setCounter('issue-mean', '—', [], problem);
    return setCounter('issue-median', '—', [], problem);
  }
  const note = row.issues ? '' : 'No issue merged into dev in the period';
  setCounter('issue-mean', formatDuration(row.mean_ms), readIssueRows(row), note);
  setCounter('issue-median', formatDuration(row.median_ms), readIssueRows(row), note);
}
function renderLeadCounter() {
  const lead = readRow('lead').row;
  if (lead) setCounter('lead-open', String(lead.open), lead.open ? [['Mean age', formatDuration(lead.open_mean_ms)]] : []);
}
function renderRejectionCounters() {
  for (const row of readSelected('rejections').rows ?? []) {
    setCounter(`${row.gate}-rate`, formatRate(row.rejected, row.decided), [[row.gate === 'committee' ? 'Denied' : 'Refused', formatCount(row.rejected)], ['Decided', formatCount(row.decided)]]);
  }
}
/** @param {PanelRows['delivery_coverage'] | null} coverage */
function renderDeliveryCounters(coverage) {
  for (const id of ['lead-open', 'loop-rate', 'triage-rate', 'design-rate', 'committee-rate']) setCounter(id, '—', [], 'Unavailable');
  if (coverage?.since === null) return;
  renderLeadCounter();
  if (coverage) setCounter('loop-rate', formatRate(coverage.looped, coverage.issues), [['Sent back', formatCount(coverage.looped)], ['Cards', formatCount(coverage.issues)]]);
  renderRejectionCounters();
}
/** @param {boolean} noCards @param {{ rows: unknown[] | null, problem: string }} panel @param {string} empty */
function readDeliveryEmpty(noCards, panel, empty) { return noCards ? 'No card moves recorded yet' : panel.rows ? empty : panel.problem; }
/** @template T @param {boolean} noCards @param {{ rows: T[] | null }} panel @returns {T[]} */
function readDeliveryRows(noCards, panel) { return noCards ? [] : panel.rows ?? []; }
/** @param {boolean} noCards */
function renderDeliveryTables(noCards) {
  const dwell = readSelected('dwell');
  const stages = readDeliveryRows(noCards, dwell);
  const maximum = Math.max(1, ...stages.map((row) => row.mean_ms ?? 0));
  renderTable('dwell', stages, (row) => createDwellRow(row, maximum), readDeliveryEmpty(noCards, dwell, ''), 6);
  const loops = readSelected('loops');
  renderTable('loop', readDeliveryRows(noCards, loops).filter((row) => row.events > 0), createLoopRow, readDeliveryEmpty(noCards, loops, 'No card sent back in the period'), 3);
  const retries = readSelected('delivery_retries');
  renderTable('stage-retry', readDeliveryRows(noCards, retries).filter((row) => row.runs > 0), createStageRetryRow, readDeliveryEmpty(noCards, retries, 'No failed card job in the period'), 3);
}
function renderDelivery() {
  const coverage = readRow('delivery_coverage');
  setText('delivery-coverage', readDeliveryCoverage(coverage));
  const notes = readDeliveryNotes(coverage.row, readRow('lead'));
  setExplain(getElement('delivery-coverage'), notes.rows, notes.note);
  renderIssueToDev();
  renderDeliveryCounters(coverage.row);
  renderDeliveryTables(coverage.row?.since === null);
}
/** @param {string} tag @param {Record<string, string | number>} attributes @param {string} [className] */
function createSvg(tag, attributes, className = '') {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  if (className) node.setAttribute('class', className);
  return node;
}
/** @param {string} label @param {number} ms @param {number} maximum @param {string} className */
function createFlowBar(label, ms, maximum, className) {
  const node = createNode('div', '', `flow-bar ${className}`);
  const head = createNode('div', '', 'flow-bar-head');
  head.append(createNode('span', label), createNode('span', formatFlowTime(ms), ms ? 'flow-amount' : 'flow-amount zero'));
  const track = createNode('span', '', 'flow-track');
  const fill = createNode('span', '', className);
  fill.style.width = `${100 * ms / maximum}%`;
  track.append(fill);
  node.append(head, track);
  return node;
}
/** @param {number} ms */
function formatFlowTime(ms) { return ms >= 36000000 ? `${Math.round(ms / 3600000)}h` : formatDuration(ms); }
const flowParts = /** @type {const} */ ([['agent_ms', 'Agent', 'agent'], ['checks_ms', 'Checks', 'checks'], ['build_ms', 'Build', 'build'], ['factory_ms', 'Git and GitHub', 'factory']]);
/** @param {PanelRows['flow_stages']} row @returns {[string, number, string][]} */
function readFlowBlocks(row) {
  const wait = row.waits_on === 'committee' ? ['Committee', row.wait_ms, 'committee'] : ['Waiting', row.wait_ms, 'wait'];
  return [/** @type {[string, number, string]} */ (wait), ...flowParts.filter(([key]) => row[key] > 0).map(([key, label, className]) => /** @type {[string, number, string]} */ ([label, row[key], className]))];
}
/** @param {PanelRows['flow_stages']} row */
function createFlowVisits(row) {
  const unknown = row.unknown_visits ? `, ${formatCount(row.unknown_visits)} unmeasured` : '';
  const node = createNode('span', `${formatCount(row.visits)} visits${unknown}`, row.visits ? 'flow-visits clipped' : 'flow-visits clipped zero');
  const rows = row.visits ? readFlowBlocks(row).map(([label, ms]) => [`${label}, per visit`, formatDuration(ms / row.visits)]) : [];
  setExplain(node, /** @type {DetailRows} */ (rows), unknown ? 'Unmeasured visits overlap a job recorded before jobs listed their parts, so their time is left out' : '');
  return node;
}
/** @param {PanelRows['flow_stages']} row @param {number} maximum @param {string | null} worst */
function createFlowStage(row, maximum, worst) {
  const node = createNode('div', '', row.stage === worst ? 'flow-stage worst' : 'flow-stage');
  node.append(createNode('h3', dwellNames[row.stage]), ...readFlowBlocks(row).map(([label, ms, className]) => createFlowBar(label, ms, maximum, className)), createFlowVisits(row));
  return node;
}
/** @param {PanelRows['flow_stages'][]} rows */
function readWorstStage(rows) {
  const waiting = rows.filter((row) => row.waits_on === 'workers' && row.wait_ms > 0).sort((a, b) => b.wait_ms - a.wait_ms);
  return waiting[0]?.stage ?? null;
}
/** @param {HTMLElement} map @param {Element} node */
function readFlowBox(map, node) {
  const outer = map.getBoundingClientRect();
  const rect = node.getBoundingClientRect();
  return { left: rect.left - outer.left, right: rect.right - outer.left, top: rect.top - outer.top, bottom: rect.bottom - outer.top, width: rect.width };
}
function createFlowHeads() {
  const defs = createSvg('defs', {});
  for (const kind of ['next', 'back', 'skip']) {
    const marker = createSvg('marker', { id: `flow-head-${kind}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, markerUnits: 'userSpaceOnUse', orient: 'auto' });
    marker.append(createSvg('path', { d: 'M0 0L10 5L0 10z' }, `flow-head ${kind}`));
    defs.append(marker);
  }
  return defs;
}
/** @param {SVGElement} group @param {number} x @param {number} y @param {PanelRows['flow_moves']} move */
function addFlowCount(group, x, y, move) {
  const label = createSvg('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'middle' });
  label.textContent = String(move.moves);
  const to = move.to_stage === 'done' ? columnNames.Done : dwellNames[move.to_stage];
  label.dataset.explain = JSON.stringify({ rows: [['Moves', formatCount(move.moves)]], note: `${dwellNames[move.from_stage]} to ${to}` });
  group.append(label);
}
/** @typedef {{ left: number, right: number, top: number, bottom: number, width: number }} FlowBox */
/** @param {FlowBox} from @param {FlowBox} to @param {boolean} back @param {number} reach */
function readArc(from, to, back, reach) {
  const x1 = from.left + 0.65 * from.width;
  const x2 = to.left + 0.35 * to.width;
  const y1 = back ? from.bottom : from.top;
  const y2 = back ? to.bottom : to.top;
  const bend = back ? reach : -reach;
  return { d: `M${x1} ${y1}C${x1} ${y1 + bend} ${x2} ${y1 + bend} ${x2} ${y2}`, x: (x1 + x2) / 2, y: y1 + 0.75 * bend };
}
/** @param {PanelRows['flow_moves']} move @param {FlowBox[]} boxes @param {string[]} keys @param {{ heaviest: number, above: number, below: number }} room */
function drawFlowMove(move, boxes, keys, room) {
  const start = keys.indexOf(move.from_stage);
  const end = keys.indexOf(move.to_stage);
  const kind = end === start + 1 ? 'next' : end < start ? 'back' : 'skip';
  const group = createSvg('g', {}, `flow-move ${kind}`);
  const width = 1 + 3 * move.moves / room.heaviest;
  const [from, to] = [boxes[start], boxes[end]];
  if (kind === 'next') {
    const y = (from.top + from.bottom) / 2;
    group.append(createSvg('path', { d: `M${from.right} ${y}L${to.left} ${y}`, 'stroke-width': width, 'marker-end': 'url(#flow-head-next)' }));
    addFlowCount(group, (from.right + to.left) / 2, y - readSize('--space-6'), move);
    return group;
  }
  const reach = (kind === 'back' ? room.below : room.above) * (0.2 + 0.7 * (Math.abs(end - start) - 1) / (keys.length - 2));
  const arc = readArc(from, to, kind === 'back', reach);
  group.append(createSvg('path', { d: arc.d, 'stroke-width': width, 'marker-end': `url(#flow-head-${kind})` }));
  addFlowCount(group, arc.x, arc.y, move);
  return group;
}
/** @param {HTMLElement} map @param {string[]} keys @param {PanelRows['flow_moves'][]} moves */
function drawFlowMoves(map, keys, moves) {
  const boxes = [...map.children].map((node) => readFlowBox(map, node));
  const room = { heaviest: Math.max(1, ...moves.map((move) => move.moves)), above: boxes[0].top, below: map.clientHeight - boxes[0].bottom };
  const svg = createSvg('svg', { width: map.clientWidth, height: map.clientHeight, role: 'group', 'aria-label': 'Card moves' }, 'flow-lines');
  svg.append(createFlowHeads(), ...moves.map((move) => drawFlowMove(move, boxes, keys, room)));
  map.append(svg);
}
/** @param {{ rows: PanelRows['flow_stages'][] | null, problem: string }} stagePanel @param {{ rows: PanelRows['flow_moves'][] | null, problem: string }} movePanel @param {boolean} noCards */
function readFlowProblem(stagePanel, movePanel, noCards) {
  if (noCards) return 'No card moves recorded yet';
  return stagePanel.rows && movePanel.rows ? '' : stagePanel.problem || movePanel.problem;
}
function renderFlow() {
  const coverage = readRow('delivery_coverage');
  setText('flow-coverage', readDeliveryCoverage(coverage));
  const stagePanel = readSelected('flow_stages');
  const movePanel = readSelected('flow_moves');
  const map = getElement('flow-map');
  const problem = readFlowProblem(stagePanel, movePanel, coverage.row?.since === null);
  if (problem) return map.replaceChildren(createNode('p', problem, 'empty'));
  const rows = stagePanel.rows ?? [];
  const maximum = Math.max(1, ...rows.flatMap((row) => readFlowBlocks(row).map(([, ms]) => ms)));
  const worst = readWorstStage(rows);
  map.style.setProperty('--flow-stages', String(rows.length));
  map.replaceChildren(...rows.map((row) => createFlowStage(row, maximum, worst)), createNode('div', columnNames.Done ?? 'Done', 'flow-stage flow-done'));
  drawFlowMoves(map, [...rows.map((row) => row.stage), 'done'], movePanel.rows ?? []);
}
function readPauseNotice() {
  const operations = readOperations();
  if (operations?.status !== 'paused') return '';
  const prefix = snapshot.operations.status === 'ok' ? 'Paused' : 'Last known state: paused';
  const reason = operations.pauseReason === 'agent-usage-limit' ? 'Claude weekly usage limit reported. Awaiting quota reset or committee decision.' : 'Operator pause. No public reason recorded.';
  return `${prefix}: ${reason}`;
}
function renderFreshness() {
  if (!snapshot) return;
  if (renderFailed) return setText('connection', 'Invalid data');
  setText('connection', connected ? 'Live' : 'Reconnecting');
  /** @type {[string, import('../src/dashboard/snapshot').Source<unknown>][]} */
  const sources = [['State', snapshot.operations], ['GitHub', snapshot.github], ['Usage', snapshot.analytics], ['Host', snapshot.host], ['Activity', snapshot.live]];
  const failures = sources.filter(([, source]) => source?.status !== 'ok').map(([name, source]) => `${name} ${source?.status ?? 'unavailable'}`);
  const pause = readPauseNotice();
  setText('source-status', [pause, ...failures].filter(Boolean).join(' / '));
  getElement('source-status').classList.toggle('paused', Boolean(pause));
  getElement('connection').classList.toggle('bad', !connected);
}
function renderOverview() { renderWorkers(); renderFunnel(); renderMergeQueue(); renderRelease(); renderManager(); renderServer(); renderEvents(); }
function renderSnapshot() {
  getElement('github-link').href = snapshot.repoUrl;
  getElement('play-link').href = snapshot.playUrl;
  renderFreshness();
  if (!getElement('overview').hidden) renderOverview();
  if (!getElement('analytics').hidden) renderAnalytics();
  if (!getElement('delivery').hidden) renderDelivery();
  if (!getElement('flow').hidden) renderFlow();
  updateOverflow();
}
function updateOverflow() {
  for (const node of queryAll('[data-explain],td,th,.event,.merge-items a,.clamp,.clipped,.counter strong,.funnel strong,.server-totals strong,.source-status,.release-items li')) {
    if (!node.getClientRects().length) continue;
    if (node.dataset.explain) { node.dataset.detail = node.dataset.explain; node.tabIndex = 0; continue; }
    const truncated = node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight;
    node.classList.toggle('inspect', truncated);
    if (truncated) { node.dataset.detail = JSON.stringify({ rows: [], note: node.textContent.trim() }); node.tabIndex = 0; }
    else { delete node.dataset.detail; node.removeAttribute('tabindex'); }
  }
}
/** @param {{ rows: DetailRows, note: string }} detail */
function createDetailNodes(detail) {
  const rows = detail.rows.map(([label, value]) => {
    const row = createNode('div', '', 'tooltip-row');
    row.append(createNode('span', label), createNode('span', value, 'num'));
    return row;
  });
  return detail.note ? [...rows, createNode('p', detail.note, rows.length ? 'muted' : '')] : rows;
}
/** @param {Node[]} nodes @param {{ left: number, bottom: number }} anchor */
function placeDetail(nodes, anchor) {
  const tooltip = getElement('full-text');
  tooltip.replaceChildren(...nodes);
  tooltip.hidden = false;
  const edge = readSize('--space-4');
  tooltip.style.left = `${Math.max(edge, Math.min(anchor.left, innerWidth - tooltip.offsetWidth - edge))}px`;
  tooltip.style.top = `${Math.max(edge, Math.min(anchor.bottom + readSize('--space-3'), innerHeight - tooltip.offsetHeight - edge))}px`;
  return tooltip;
}
function showDetail(node) {
  if (!node?.dataset.detail) return;
  const tooltip = placeDetail(createDetailNodes(JSON.parse(node.dataset.detail)), node.getBoundingClientRect());
  detailOwner = node;
  tooltip.tabIndex = 0;
  node.setAttribute('aria-describedby', tooltip.id);
}
function hideDetail() { getElement('full-text').hidden = true; }
const tabs = [...queryAll('[role="tab"]')];
function selectTab(tab) {
  for (const choice of tabs) { const selected = choice === tab; choice.setAttribute('aria-selected', String(selected)); choice.tabIndex = selected ? 0 : -1; getElement(String(choice.getAttribute('aria-controls'))).hidden = !selected; }
  hideDetail();
  requestRender();
}
function navigateTabs(event, tab) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  let index = tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : -1);
  if (event.key === 'Home') index = 0;
  if (event.key === 'End') index = tabs.length - 1;
  const next = tabs[(index + tabs.length) % tabs.length];
  selectTab(next);
  next.focus();
}
for (const tab of tabs) { tab.addEventListener('click', () => selectTab(tab)); tab.addEventListener('keydown', (event) => navigateTabs(event, tab)); }
for (const button of queryAll('[data-dialog]')) button.addEventListener('click', () => {
  const dialog = getElement(String(button.dataset.dialog));
  dialog.showModal();
  if (dialog.id === 'release-dialog') renderReleaseDialog(getRelease());
  else renderEventDialog(readEvents());
});
for (const button of queryAll('[data-close]')) button.addEventListener('click', () => /** @type {HTMLDialogElement} */ (button.closest('dialog')).close());
function selectButtons(selector, chosen, attribute) { for (const button of queryAll(selector)) button.setAttribute('aria-pressed', String(button.dataset[attribute] === chosen)); }
for (const button of queryAll('[data-days]')) button.addEventListener('click', () => { selectedDays = Number(button.dataset.days); selectButtons('[data-days]', String(button.dataset.days), 'days'); pages.clear(); requestRender(); });
for (const button of queryAll('[data-metric]')) button.addEventListener('click', () => { metric = String(button.dataset.metric); selectButtons('[data-metric]', metric, 'metric'); requestRender(); });
for (const button of queryAll('[data-grouping]')) button.addEventListener('click', () => { grouping = String(button.dataset.grouping); selectButtons('[data-grouping]', grouping, 'grouping'); requestRender(); });
document.addEventListener('mouseover', (event) => showDetail(/** @type {HTMLElement} */ (event.target).closest('[data-detail]')));
document.addEventListener('focusin', (event) => showDetail(event.target));
document.addEventListener('mouseout', (event) => { if (event.relatedTarget !== getElement('full-text')) hideDetail(); });
document.addEventListener('focusout', (event) => { if (event.relatedTarget !== getElement('full-text')) hideDetail(); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (document.querySelector('dialog[open]')) { hideDetail(); return; }
    detailOwner?.focus({ preventScroll: true }); hideDetail();
  }
  const target = /** @type {HTMLElement} */ (event.target);
  if (event.key === 'Enter' && target.dataset.detail) { event.preventDefault(); showDetail(target); getElement('full-text').focus(); }
});
window.addEventListener('resize', () => { hideDetail(); requestRender(); });
document.fonts.ready.then(requestRender);
const stream = new EventSource('/factory/api/events');
stream.addEventListener('snapshot', (event) => {
  try { snapshot = JSON.parse(event.data); readLabels(snapshot.labels); connected = true; requestRender(); }
  catch (error) { renderFailed = true; console.error('Invalid dashboard snapshot', error); setText('connection', 'Invalid data'); }
});
stream.addEventListener('error', () => { connected = false; setText('connection', 'Reconnecting'); });
setInterval(renderFreshness, 1000);
window.addEventListener('pagehide', () => stream.close());
