export function stallMinutes(env) {
  const raw = env.TEST_STALL_MINUTES;
  if (raw === undefined) return null;
  const minutes = Number(raw);
  if (!(minutes > 0)) throw new Error(`TEST_STALL_MINUTES must be a number of minutes above 0, got "${raw}".`);
  return minutes;
}

export function stallMessage(what, minutes, lastLine) {
  return `FAIL\n${what} printed nothing for ${minutes} minutes after "${lastLine}". It hangs there, so find out why. A rerun of the same commit hangs the same way.`;
}

export function watchStalls(what, env, stream = process.stdout, exit = (message) => { console.error(message); process.exit(1); }) {
  const minutes = stallMinutes(env);
  if (minutes === null) return null;
  const limitMs = minutes * 60_000;
  let lastAt = Date.now();
  let lastLine = 'the start';
  const write = stream.write.bind(stream);
  stream.write = (chunk, ...rest) => {
    const line = String(chunk).trim().split('\n').at(-1);
    if (line) lastLine = line;
    lastAt = Date.now();
    return write(chunk, ...rest);
  };
  const timer = setInterval(() => {
    if (Date.now() - lastAt > limitMs) exit(stallMessage(what, minutes, lastLine));
  }, Math.min(limitMs, 10_000));
  timer.unref();
  return timer;
}
