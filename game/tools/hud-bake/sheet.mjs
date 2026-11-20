import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gameUrlArg, sheetUrl } from './args.mjs';
import { startServer } from './server.mjs';

const gameUrl = gameUrlArg();
for (const script of ['capture.mjs', 'capture-ui.mjs']) execFileSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), gameUrl], { stdio: 'inherit' });
const server = await startServer();
console.log(`Sheet: ${sheetUrl(server)}. Stop with Ctrl-C.`);
