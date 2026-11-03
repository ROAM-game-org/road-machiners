export function installCensus() {
  const game = window.__ROAM__;
  if (!game) throw new Error('The census needs the dev build, which puts the game on window.__ROAM__');
  if (!performance.memory) throw new Error('The census needs performance.memory, so launch Chromium with --enable-precise-memory-info');
  const SKIP = new Set(['constructor', 'tick']);
  const THREE_FLAGS = ['isObject3D', 'isMaterial', 'isTexture', 'isBufferGeometry', 'isWebGLRenderer', 'isCamera'];
  const REJECTS = [
    (v) => typeof v !== 'object' || v === null,
    (v) => Array.isArray(v) || v instanceof Map || v instanceof Set || v instanceof Node,
    (v) => Object.getPrototypeOf(v) === Object.prototype,
    (v) => THREE_FLAGS.some((flag) => v[flag]),
  ];
  const stats = {};
  const last = new Map();
  const stack = [];
  const heap = () => performance.memory.usedJSHeapSize;
  const isSystem = (value) => !REJECTS.some((reject) => reject(value));
  const isMethod = (proto, name) => !SKIP.has(name) && typeof Object.getOwnPropertyDescriptor(proto, name)?.value === 'function';

  const methodsOf = (owner) => {
    const names = new Set();
    for (let proto = Object.getPrototypeOf(owner); proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
      for (const name of Object.getOwnPropertyNames(proto)) if (isMethod(proto, name)) names.add(name);
    }
    return [...names];
  };

  const sameAsLast = (key, objects) => {
    const before = last.get(key);
    last.set(key, { world: game.world, objects });
    if (!before || before.world !== game.world) return false;
    return before.objects.length === objects.length && before.objects.every((o, i) => o === objects[i]);
  };

  const entryOf = (key) => (stats[key] ??= { calls: 0, selfMs: 0, selfBytes: 0, sameCalls: 0, sameMs: 0, sameBytes: 0, gcCalls: 0 });

  const record = (key, same, call) => {
    const entry = entryOf(key);
    const ownMs = call.ms - call.childMs;
    const ownBytes = Math.max(0, call.bytes - call.childBytes);
    entry.calls++;
    entry.selfMs += ownMs;
    entry.selfBytes += ownBytes;
    entry.gcCalls += call.collected ? 1 : 0;
    if (!same) return;
    entry.sameCalls++;
    entry.sameMs += ownMs;
    entry.sameBytes += ownBytes;
  };

  const finish = (key, same, call, ms, rawBytes) => {
    stack.pop();
    const bytes = Math.max(0, rawBytes);
    record(key, same, { ...call, ms, bytes, collected: rawBytes < 0 });
    const parent = stack.at(-1);
    if (!parent) return;
    parent.childMs += ms;
    parent.childBytes += bytes;
  };

  const wrap = (owner, label, name) => {
    const original = owner[name];
    const key = `${label}.${name}`;
    owner[name] = function (...args) {
      const same = sameAsLast(key, args.filter((a) => typeof a === 'object' && a !== null));
      const call = { childMs: 0, childBytes: 0 };
      stack.push(call);
      const startMs = performance.now();
      const startBytes = heap();
      try {
        return original.apply(this, args);
      } finally {
        finish(key, same, call, performance.now() - startMs, heap() - startBytes);
      }
    };
  };

  const systems = [['game', game], ...Object.entries(game).filter(([, value]) => isSystem(value))];
  for (const [label, owner] of systems) for (const name of methodsOf(owner)) wrap(owner, label, name);
  window.__ROAM_CENSUS__ = { stats, systems: systems.length };
  return systems.length;
}

export function readCensus() {
  const census = window.__ROAM_CENSUS__;
  if (!census) throw new Error('The census was never installed');
  return { stats: census.stats, systems: census.systems, frames: census.stats['game.frame']?.calls ?? 0 };
}
