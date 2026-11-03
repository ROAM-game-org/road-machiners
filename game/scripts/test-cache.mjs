import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createVitest } from 'vitest/node';
import { globalKey } from '../src/test/cache/fingerprint';
import { clearFailureRecord, failureRecord, partialFailureRecord, writeFailureRecord } from '../src/test/cache/failures';
import { recordRun, selectTests } from '../src/test/cache/select';
import { createStallWatch, stallMinutes, suiteMinutes, suiteOverMessage } from '../src/test/cache/stall';
import { testId } from '../src/test/cache/store';
import { rpcTimeoutNote, runVerdict } from '../src/test/cache/verdict';

const root = process.cwd();

function cacheAndFilters(args) {
  const at = args.indexOf('--cache');
  if (at === -1) return { cache: undefined, filters: args };
  const dir = args[at + 1];
  if (!dir || dir.startsWith('--')) throw new Error('--cache needs a folder.');
  return { cache: resolve(dir), filters: args.filter((_, i) => i !== at && i !== at + 1) };
}

function relatedFiles(files) {
  if (files.length === 0 || files.some((file) => file.startsWith('--'))) throw new Error('--related needs files and comes last.');
  return files;
}

function parseArgs(argv) {
  const args = argv.filter((arg) => arg !== '--');
  const at = args.indexOf('--related');
  if (at === -1) return { ...cacheAndFilters(args), related: undefined };
  return { ...cacheAndFilters(args.slice(0, at)), related: relatedFiles(args.slice(at + 1)) };
}

function importsOf(project, file) {
  const seen = new Set();
  const stack = [...(project.vite.moduleGraph.getModulesByFile(file) ?? [])];
  while (stack.length) {
    const mod = stack.pop();
    if (!mod.file || seen.has(mod.file)) continue;
    seen.add(mod.file);
    stack.push(...(mod.ssrImportedModules ?? mod.importedModules));
  }
  return [...seen];
}

function readsOf(readsDir, test) {
  const file = join(readsDir, `${testId(test)}.json`);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`No recorded disk reads for ${test} at ${file}: ${error.message}`);
  }
}

function passRecorder(cache, readsDir) {
  let key = null;
  let uncacheable = 0;
  const record = (mod) => {
    const test = relative(root, mod.moduleId);
    uncacheable += recordRun(root, cache, key, [{ test, passed: true, graphFiles: importsOf(mod.project, mod.moduleId), reads: readsOf(readsDir, test) }]);
  };
  return {
    start: (globalKey) => { key = globalKey; },
    uncacheable: () => uncacheable,
    reporter: {
      onTestModuleEnd(mod) {
        if (cache && key !== null && mod.state() === 'passed') record(mod);
      },
    },
  };
}

function stallReporter(watch) {
  const fileOf = (mod) => relative(root, mod.moduleId);
  return {
    onTestModuleStart: (mod) => watch.fileStarted(fileOf(mod), Date.now()),
    onTestModuleEnd: (mod) => watch.fileEnded(fileOf(mod), Date.now()),
    onTestCaseReady: (test) => watch.caseStarted(test.id, fileOf(test.module), test.fullName),
    onTestCaseResult: (test) => watch.caseEnded(test.id, Date.now()),
  };
}

function fileTimes() {
  const finished = [];
  return {
    finished,
    reporter: {
      onTestModuleEnd(mod) {
        const { collectDuration, duration } = mod.diagnostic();
        finished.push({ file: relative(root, mod.moduleId), ms: collectDuration + duration });
      },
    },
  };
}

function failedFiles() {
  let count = 0;
  return {
    any: () => count > 0,
    reporter: {
      onTestModuleEnd(mod) {
        if (mod.state() === 'failed') count += 1;
      },
    },
  };
}

function moduleProgress() {
  const running = new Map();
  const ended = [];
  const selectedFiles = [];
  return {
    selectedFiles,
    partialRecord(unhandledErrors) {
      const endedFiles = new Set(ended.map((mod) => relative(root, mod.moduleId)));
      const unfinished = selectedFiles.filter((file) => !endedFiles.has(file));
      return partialFailureRecord(root, ended, [...running.values()], unhandledErrors, unfinished);
    },
    reporter: {
      onTestModuleStart(mod) {
        running.set(mod.moduleId, mod);
      },
      onTestModuleEnd(mod) {
        running.delete(mod.moduleId);
        ended.push(mod);
      },
    },
  };
}

const CLOSE_LIMIT_MS = 10_000;
const OVER_TIME_EXIT = 3;

function stopAtSuiteLimit(limitMinutes, times, failures, vitest, readsDir, saveRecord) {
  let over = false;
  const timer = setTimeout(async () => {
    over = true;
    console.log(suiteOverMessage(limitMinutes, times.finished));
    const code = failures.any() ? 1 : OVER_TIME_EXIT;
    saveRecord();
    await Promise.race([vitest.close(), new Promise((done) => setTimeout(done, CLOSE_LIMIT_MS))]);
    rmSync(readsDir, { recursive: true, force: true });
    process.exit(code);
  }, limitMinutes * 60_000);
  timer.unref();
  return () => over;
}

function stopOnStall(watch, vitest, readsDir, saveRecord) {
  let stalled = false;
  const timer = setInterval(async () => {
    const stall = watch.stalled(Date.now());
    if (stall === null) return;
    stalled = true;
    clearInterval(timer);
    console.log(stall);
    saveRecord();
    await Promise.race([vitest.close(), new Promise((done) => setTimeout(done, CLOSE_LIMIT_MS))]);
    rmSync(readsDir, { recursive: true, force: true });
    process.exit(1);
  }, 1000);
  timer.unref();
  return () => stalled;
}

const { cache, related, filters } = parseArgs(process.argv.slice(2));
const failuresFile = process.env.TEST_FAILURES_FILE ? resolve(root, process.env.TEST_FAILURES_FILE) : null;
if (failuresFile) clearFailureRecord(failuresFile);
mkdirSync(join(root, 'tmp'), { recursive: true });
const readsDir = mkdtempSync(join(root, 'tmp', 'test-cache-reads-'));
process.env.TEST_CACHE_READS = readsDir;
let failed = false;
const stallLimit = stallMinutes(process.env);
const watch = stallLimit === null ? null : createStallWatch(stallLimit * 60_000, Date.now());
const suiteLimit = suiteMinutes(process.env);
const recorder = passRecorder(cache, readsDir);
const times = fileTimes();
const failures = failedFiles();
const progress = moduleProgress();
const saveRecord = () => {
  if (failuresFile) writeFailureRecord(failuresFile, progress.partialRecord(vitest.state.getUnhandledErrors()));
};
const reporters = ['default', recorder.reporter, progress.reporter, times.reporter, failures.reporter, ...(watch ? [stallReporter(watch)] : [])];
const vitest = await createVitest('test', { watch: false, reporters, ...(related ? { related } : {}) });
const stalled = watch ? stopOnStall(watch, vitest, readsDir, saveRecord) : () => false;
const overTime = suiteLimit === null ? () => false : stopAtSuiteLimit(suiteLimit, times, failures, vitest, readsDir, saveRecord);
try {
  vitest.projects[0].config.setupFiles.push(resolve(root, 'src/test/cache/reads-setup.ts'));
  await vitest.init();
  const specs = await vitest.getRelevantTestSpecifications(filters);
  const key = globalKey(root, vitest.vite.config.define ?? {}, process.env);
  const relOf = (spec) => relative(root, spec.moduleId);
  const tests = specs.map(relOf);
  const { run, skipped } = cache ? selectTests(root, cache, key, tests) : { run: tests, skipped: [] };
  const selected = specs.filter((spec) => run.includes(relOf(spec)));
  progress.selectedFiles.push(...selected.map(relOf));
  recorder.start(key);
  let record = { failed: [], unhandledErrors: 0, unfinished: [] };
  if (selected.length) {
    const { testModules, unhandledErrors } = await vitest.runTestSpecifications(selected);
    const verdict = runVerdict(testModules, unhandledErrors);
    if (verdict === 'passedPastRpcTimeouts') console.log(rpcTimeoutNote(unhandledErrors.length));
    failed = verdict === 'failed';
    record = failureRecord(root, testModules, unhandledErrors);
  }
  if (failuresFile && !stalled() && !overTime()) writeFailureRecord(failuresFile, record);
  console.log(`[test-cache] ran ${run.length}, skipped ${skipped.length}, uncacheable ${recorder.uncacheable()}`);
} finally {
  await vitest.close();
  rmSync(readsDir, { recursive: true, force: true });
}
process.exit(failed || stalled() ? 1 : 0);
