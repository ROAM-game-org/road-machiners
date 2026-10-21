// Asks for Russian text from agy, falling back to Codex and then Claude Sonnet when the one before is unavailable.
// Usage: npm run text:write -- <request-file>. The request file holds what docs/russian-style.md says to give a writer.
// Prints the writer's reply on stdout and the writers it tried on stderr. It writes no file.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { writeRussian, WriterFailed } from '../src/tools/ru-writer.ts';

const COMMANDS = {
  agy: (prompt) => ['agy', ['--dangerously-skip-permissions', '-p', prompt], undefined],
  codex: (prompt) => ['codex', ['exec', '-'], prompt],
  sonnet: (prompt) => ['claude', ['-p', '--model', 'sonnet'], prompt],
};

function run(writer, prompt) {
  const [command, args, input] = COMMANDS[writer](prompt);
  const result = spawnSync(command, args, { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error?.code === 'ENOENT') return { status: null, stdout: '', stderr: '', missing: true };
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr || String(result.error ?? '') };
}

const file = process.argv.slice(2).find((arg) => arg !== '--');
if (!file) {
  console.error('Usage: npm run text:write -- <request-file>');
  process.exit(2);
}
try {
  const written = writeRussian(readFileSync(file, 'utf8'), run);
  for (const a of written.attempts) console.error(`${a.writer}: ${a.outcome}${a.detail ? ` (${a.detail})` : ''}`);
  process.stdout.write(written.text);
} catch (error) {
  if (!(error instanceof WriterFailed)) throw error;
  for (const a of error.attempts) console.error(`${a.writer}: ${a.outcome}${a.detail ? ` (${a.detail})` : ''}`);
  console.error(error.message);
  process.exit(1);
}
