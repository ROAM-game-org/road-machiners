const gameTestPattern = /^game\/src\/.*\.test\.ts$/;
const sampleName = /(?:seed|turn|roll|sample|trial|day|run)(?:s|_?count|_?total)$/i;
const timeLimitPatterns = [
  /\bbudget\(/g,
  /\bTEST_TIMEOUTS\b/g,
  /\btimeoutsOff\(/g,
  /\b(?:testTimeout|hookTimeout)\b/g,
  /\bvi\.setConfig\(/g,
  /\btimeout\s*:/g,
  /^\s*\}\s*,\s*(?:\d[\d_]{2,}|[A-Z][A-Z0-9_]*|budget\([^)]*\))\s*\)\s*;?\s*(?:\/\/.*)?$/gm,
];

export function isGameTest(file) {
  return gameTestPattern.test(file);
}

export function countTimeLimits(source) {
  return timeLimitPatterns.reduce((total, pattern) => total + (source.match(pattern) ?? []).length, 0);
}

function numberOf(text) {
  return Number(text.replaceAll('_', ''));
}

function listLength(list) {
  return list.split(',').filter(item => /^\s*-?\d[\d_]*\s*$/.test(item)).length;
}

function lineAt(source, index) {
  const end = source.indexOf('\n', index);
  return source.slice(source.lastIndexOf('\n', index) + 1, end === -1 ? source.length : end);
}

function add(counts, signature, value) {
  if (!Number.isFinite(value) || value <= 0) return;
  const count = counts.get(signature) ?? { total: 0, places: 0 };
  counts.set(signature, { total: count.total + value, places: count.places + 1 });
}

function addNamedCounts(counts, source) {
  for (const [, name, value] of source.matchAll(/\b(?:const|let)\s+([A-Za-z_]\w*)\s*=\s*(\d[\d_]*)\s*;/g)) {
    if (sampleName.test(name)) add(counts, `const ${name}`, numberOf(value));
  }
}

function addNamedLists(counts, source) {
  for (const [, name, list] of source.matchAll(/\b(?:const|let)\s+([A-Za-z_]\w*)\s*=\s*\[([\d_,\s-]+)\]/g)) {
    if (sampleName.test(name)) add(counts, `const ${name} = [...]`, listLength(list));
  }
}

function addArrayLengths(counts, source) {
  for (const match of source.matchAll(/Array\.from\(\s*\{\s*length\s*:\s*(\d[\d_]*)\s*\}/g)) {
    add(counts, lineAt(source, match.index).trim().replace(match[0], 'Array.from({ length: # }'), numberOf(match[1]));
  }
}

function loopSpan(start, operator, end) {
  return numberOf(end) - numberOf(start) + (operator === '<=' ? 1 : 0);
}

function addLoopBounds(counts, source) {
  for (const [header, name, start, same, operator, end] of source.matchAll(/\bfor\s*\(\s*let\s+([A-Za-z_]\w*)\s*=\s*(\d[\d_]*)\s*;\s*([A-Za-z_]\w*)\s*(<=?)\s*(\d[\d_]*)\s*;/g)) {
    if (name === same) add(counts, header.replace(new RegExp(`${end}\\s*;$`), '#;'), loopSpan(start, operator, end));
  }
}

export function sampleCounts(source) {
  const counts = new Map();
  addNamedCounts(counts, source);
  addNamedLists(counts, source);
  addArrayLengths(counts, source);
  addLoopBounds(counts, source);
  return counts;
}

function changedTests(current, previous) {
  return [...current.keys()].filter(file => isGameTest(file) && current.get(file) !== previous.get(file));
}

function deletedTests(current, previous) {
  return [...previous.keys()].filter(file => isGameTest(file) && !current.has(file));
}

function timeLimitsIn(sources, files) {
  return files.filter(file => sources.has(file)).reduce((total, file) => total + countTimeLimits(sources.get(file)), 0);
}

function checkTimeLimits(current, previous, files) {
  const now = timeLimitsIn(current, files);
  const before = timeLimitsIn(previous, files);
  if (now <= before) return [];
  return [`test time limits: the changed test files hold ${now} time limits, up from ${before}. A slow test needs a cheaper setup, not more time. See game/docs/testing.md, rule T4.`];
}

function totals(sources, files) {
  const sum = new Map();
  for (const file of files.filter(file => sources.has(file))) {
    for (const [signature, { total, places }] of sampleCounts(sources.get(file))) {
      const count = sum.get(signature) ?? { total: 0, places: 0 };
      sum.set(signature, { total: count.total + total, places: count.places + places });
    }
  }
  return sum;
}

function checkSampleCuts(current, previous, files) {
  const now = totals(current, files);
  return [...totals(previous, files)].flatMap(([signature, before]) => {
    const kept = now.get(signature);
    if (kept === undefined || kept.places !== before.places || kept.total >= before.total) return [];
    return [`test samples: "${signature}" fell from ${before.total} to ${kept.total} over the changed test files. Keep every case, seed, turn and roll, and make each one cheaper or split them. See game/docs/testing.md, rule T5.`];
  });
}

export function checkTests(current, previous) {
  const files = changedTests(current, previous);
  return [...checkTimeLimits(current, previous, [...files, ...deletedTests(current, previous)]), ...checkSampleCuts(current, previous, files)];
}
