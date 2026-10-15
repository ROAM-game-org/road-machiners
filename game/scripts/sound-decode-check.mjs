import { createServer, request } from 'node:http';
import { chromium, firefox, webkit } from 'playwright';

const url = process.argv[2];
if (!url) throw new Error('Usage: node scripts/sound-decode-check.mjs <dev-server-url>');
const target = new URL(url);
const upstreamHost = target.hostname === 'localhost' ? '::1' : target.hostname.replace(/^\[|\]$/g, '');
const TRUNCATED_FILE = 'hit-metal-2.ogg';
const TRUNCATED_BYTES = 4000;
const FAULT_BYTES = 8033;
const FAULT_COUNT = 2;
const engines = { chromium, firefox, webkit };

function startProxy(truncateFirst) {
  let served = 0;
  const server = createServer((req, res) => {
    const upstream = request({ host: upstreamHost, port: target.port, path: req.url, method: req.method, headers: { ...req.headers, host: target.host } }, (up) => {
      const isSound = req.url.includes('/sfx/') && req.url.split('?')[0].endsWith('.ogg');
      if (!isSound) {
        res.writeHead(up.statusCode, up.headers);
        up.pipe(res);
        return;
      }
      const chunks = [];
      up.on('data', (c) => chunks.push(c));
      up.on('end', () => {
        let body = Buffer.concat(chunks);
        if (truncateFirst && req.url.includes(TRUNCATED_FILE) && served++ === 0) body = body.subarray(0, TRUNCATED_BYTES);
        const headers = { 'content-type': 'audio/ogg', 'content-length': body.length, 'cache-control': 'max-age=3600' };
        res.writeHead(200, headers);
        res.end(body);
      });
    });
    req.pipe(upstream);
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

async function run(engine, scenario) {
  const server = await startProxy(scenario === 'cached-bad-copy');
  const browser = await engines[engine].launch();
  try {
    const page = await (await browser.newContext()).newPage();
    if (scenario === 'decoder-fault') {
      await page.addInitScript(([bytes, count]) => {
        const original = BaseAudioContext.prototype.decodeAudioData;
        let faults = 0;
        BaseAudioContext.prototype.decodeAudioData = function (data, ...rest) {
          if (data.byteLength === bytes && faults < count) {
            faults++;
            return Promise.reject(new DOMException('injected decoder fault', 'EncodingError'));
          }
          return original.call(this, data, ...rest);
        };
      }, [FAULT_BYTES, FAULT_COUNT]);
    }
    await page.goto(`http://localhost:${server.address().port}/sound-check.html`);
    await page.waitForFunction(() => window.__SOUND_CHECK__, null, { timeout: 240000 });
    return await page.evaluate(() => window.__SOUND_CHECK__);
  } finally {
    await browser.close();
    server.close();
  }
}

const judge = (scenario, report) => report.checks.every((c) => c.real) && (scenario !== 'all-files' || report.failures.length === 0);

let failed = false;
for (const engine of Object.keys(engines)) {
  for (const scenario of ['all-files', 'cached-bad-copy', 'decoder-fault']) {
    const report = await run(engine, scenario);
    const ok = judge(scenario, report);
    failed ||= !ok;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${engine} ${scenario} failed files ${report.failures.length}, ${report.checks.map((c) => `${c.file} ${c.real ? 'real' : 'stand-in'} ${c.duration.toFixed(3)}s peak ${c.peak.toFixed(3)}`).join(', ')}`);
  }
}
process.exit(failed ? 1 : 0);
