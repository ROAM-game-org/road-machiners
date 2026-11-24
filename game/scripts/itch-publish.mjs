import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, symlinkSync } from 'node:fs';
import { relative, resolve } from 'node:path';

process.loadEnvFile('.env');
const target = process.env.ITCH_TARGET;
if (!target) throw new Error('ITCH_TARGET is missing from .env, like "user/roam"');

const missingPublicFiles = (source, built) =>
  readdirSync(resolve(source, 'public'), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(resolve(source, 'public'), resolve(entry.parentPath, entry.name)))
    .filter((file) => !existsSync(resolve(built, 'dist', file)));

const run = (cmd, args, cwd) => execFileSync(cmd, args, { stdio: 'inherit', cwd });
const read = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();

const version = read('git', ['rev-parse', '--short', 'HEAD']);
const top = read('git', ['rev-parse', '--show-toplevel']);
const dir = resolve(top, '.worktrees/itch-publish');
const build = resolve(dir, 'game');
if (existsSync(dir)) run('git', ['worktree', 'remove', '--force', dir]);
run('git', ['worktree', 'add', '--detach', dir, 'HEAD']);
try {
  symlinkSync(resolve('node_modules'), resolve(build, 'node_modules'));
  run('npm', ['run', 'build'], build);
  const gaps = missingPublicFiles(build, build);
  if (gaps.length > 0) throw new Error(`The build lacks public files: ${gaps.join(', ')}`);
  run('butler', ['push', resolve(build, 'dist'), `${target}:html5`, '--userversion', version]);
} finally {
  run('git', ['worktree', 'remove', '--force', dir]);
}

const ITCH_LIVE_MINUTES = 10;
const ITCH_POLL_SECONDS = 15;

function html5Head() {
  const lines = read('butler', ['status', '--json', `${target}:html5`]).split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));
  const channel = lines.find((line) => line.type === 'result')?.value.channels.find((entry) => entry.name === 'html5');
  if (!channel) throw new Error('butler status --json gave no html5 channel, so it is unknown whether itch.io took the build');
  return channel;
}

function headWait(head) {
  if (!head) return 'the html5 channel head is empty';
  if (head.userVersion !== version) return `the html5 channel head is version ${head.userVersion}`;
  if (head.state === 'failed') throw new Error(`itch.io failed processing build #${head.id} of ${version}`);
  return head.state === 'completed' ? null : `build #${head.id} is ${head.state}`;
}

async function liveState() {
  const channel = html5Head();
  const waiting = headWait(channel.head);
  if (waiting !== null) return waiting;
  const page = `https://html-classic.itch.zone/html/${channel.uploadId}-${channel.head.id}/index.html`;
  const response = await fetch(page, { method: 'HEAD' });
  return response.status === 200 ? null : `its page ${page} answers HTTP ${response.status}`;
}

async function waitForLive() {
  const deadline = Date.now() + ITCH_LIVE_MINUTES * 60_000;
  for (;;) {
    const waiting = await liveState();
    if (waiting === null) return;
    if (Date.now() >= deadline) throw new Error(`itch.io did not take build ${version} after ${ITCH_LIVE_MINUTES} minutes: ${waiting}. itch checks an HTML5 upload after butler exits, like its 1000 file limit.`);
    console.log(`Waiting for itch.io: ${waiting}`);
    await new Promise((done) => setTimeout(done, ITCH_POLL_SECONDS * 1000));
  }
}

await waitForLive();
const [user, game] = target.split('/');
console.log(`Uploaded ${version}, and itch.io serves it at https://${user}.itch.io/${game}`);
