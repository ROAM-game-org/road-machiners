export const CENSUS_TOP = 25;

export function censusRows(stats, frames) {
  if (!(frames > 0)) throw new Error('The census saw no game frames');
  return Object.entries(stats).map(([key, s]) => ({
    key,
    callsPerFrame: s.calls / frames,
    msPerFrame: s.selfMs / frames,
    kbPerFrame: s.selfBytes / 1024 / frames,
    sameShare: s.calls ? s.sameCalls / s.calls : 0,
    sameMsPerFrame: s.sameMs / frames,
    sameKbPerFrame: s.sameBytes / 1024 / frames,
    gcCalls: s.gcCalls,
  }));
}

export const bySameStateWork = (rows) => rows.filter((row) => row.sameMsPerFrame > 0).sort((a, b) => b.sameMsPerFrame - a.sameMsPerFrame).slice(0, CENSUS_TOP);
export const bySameStateGarbage = (rows) => rows.filter((row) => row.sameKbPerFrame > 0).sort((a, b) => b.sameKbPerFrame - a.sameKbPerFrame).slice(0, CENSUS_TOP);

const fixed = (n, digits) => n.toFixed(digits).padStart(8);

function rowLine(row, i) {
  return `  ${String(i + 1).padStart(2)}. ${row.key.padEnd(44)} ${fixed(row.callsPerFrame, 1)} calls ${fixed(row.sameShare * 100, 0)}% on the same state, redone work ${fixed(row.sameMsPerFrame, 3)} ms ${fixed(row.sameKbPerFrame, 1)} KB, all work ${row.msPerFrame.toFixed(3)} ms ${row.kbPerFrame.toFixed(1)} KB`;
}

export function censusLines(scene, census) {
  const rows = censusRows(census.stats, census.frames);
  return [
    `Census of ${scene}: ${census.frames} frames, ${census.systems} systems wrapped. Numbers are per frame and count each method's own work, not its callees. Redone work is work in calls where the world and every object input were the same as on the call before.`,
    'Redone work by time:',
    ...bySameStateWork(rows).map(rowLine),
    'Redone work by garbage made:',
    ...bySameStateGarbage(rows).map(rowLine),
  ];
}
