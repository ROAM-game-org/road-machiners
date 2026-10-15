import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createVitest } from 'vitest/node';
import { globalKey } from '../src/test/cache/fingerprint';
import { recordRun, selectTests } from '../src/test/cache/select';
import { createStallWatch, stallMinutes } from '../src/test/cache/stall';
import { testId } from '../src/test/cache/store';

const root = process.cwd();

function parseArgs(argv) {
  const args = argv.filter((arg) => arg !== '--');
  const at = args.indexOf('--cache');
  if (at === -1) return { cache: undefined, filters: args };
  const dir = args[at + 1];
  if (!dir || dir.startsWith('--')) throw new Error('--cache needs a folder.');
  return { cache: resolve(dir), filters: args.filter((_, i) => i !== at && i !== at + 1) };
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

const CLOSE_LIMIT_MS = 10_000;

function stopOnStall(watch, vitest, readsDir) {
  let stalled = false;
  const timer = setInterval(async () => {
    const stall = watch.stalled(Date.now());
    if (stall === null) return;
    stalled = true;
    clearInterval(timer);
    console.log(stall);
    await Promise.race([vitest.close(), new Promise((done) => setTimeout(done, CLOSE_LIMIT_MS))]);
    rmSync(readsDir, { recursive: true, force: true });
    process.exit(1);
  }, 1000);
  timer.unref();
  return () => stalled;
}

const { cache, filters } = parseArgs(process.argv.slice(2));
mkdirSync(join(root, 'tmp'), { recursive: true });
const readsDir = mkdtempSync(join(root, 'tmp', 'test-cache-reads-'));
process.env.TEST_CACHE_READS = readsDir;
let failed = false;
const stallLimit = stallMinutes(process.env);
const watch = stallLimit === null ? null : createStallWatch(stallLimit * 60_000, Date.now());
const recorder = passRecorder(cache, readsDir);
const reporters = ['default', recorder.reporter, ...(watch ? [stallReporter(watch)] : [])];
const vitest = await createVitest('test', { watch: false, reporters });
const stalled = watch ? stopOnStall(watch, vitest, readsDir) : () => false;
try {
  vitest.projects[0].config.setupFiles.push(resolve(root, 'src/test/cache/reads-setup.ts'));
  await vitest.init();
  const specs = await vitest.globTestSpecifications(filters);
  const key = globalKey(root, vitest.vite.config.define ?? {}, process.env);
  const relOf = (spec) => relative(root, spec.moduleId);
  const tests = specs.map(relOf);
  const { run, skipped } = cache ? selectTests(root, cache, key, tests) : { run: tests, skipped: [] };
  const selected = specs.filter((spec) => run.includes(relOf(spec)));
  recorder.start(key);
  if (selected.length) {
    const { testModules, unhandledErrors } = await vitest.runTestSpecifications(selected);
    failed = unhandledErrors.length > 0 || testModules.some((mod) => mod.state() !== 'passed' && mod.state() !== 'skipped');
  }
  console.log(`[test-cache] ran ${run.length}, skipped ${skipped.length}, uncacheable ${recorder.uncacheable()}`);
} finally {
  await vitest.close();
  rmSync(readsDir, { recursive: true, force: true });
}
process.exit(failed || stalled() ? 1 : 0);
