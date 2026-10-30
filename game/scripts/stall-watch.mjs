const CLOSE_LIMIT_MS = 10_000;

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

async function closeAll(closers) {
  const results = await Promise.allSettled(closers.map((close) => close()));
  for (const result of results) if (result.status === 'rejected') console.error(`Closing after the stall failed: ${result.reason}`);
}

function noteAftermath(error) {
  console.error(`After the stall, closing the run raised: ${String(error?.message ?? error).split('\n')[0]}`);
}

export function exitAfterClosing(closers) {
  return (message) => {
    process.on('uncaughtException', noteAftermath);
    process.on('unhandledRejection', noteAftermath);
    setTimeout(() => {
      console.error(message);
      process.exit(1);
    }, CLOSE_LIMIT_MS).unref();
    void closeAll(closers).then(() => {
      console.error(message);
      process.exit(1);
    });
  };
}

export function watchStalls(what, env, stream = process.stdout, exit = undefined) {
  const minutes = stallMinutes(env);
  const closers = [];
  const watch = { closeOnStall: (close) => closers.push(close) };
  if (minutes === null) return { ...watch, timer: null };
  const stop = exit ?? exitAfterClosing(closers);
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
    if (Date.now() - lastAt > limitMs) stop(stallMessage(what, minutes, lastLine));
  }, Math.min(limitMs, 10_000));
  timer.unref();
  return { ...watch, timer };
}
