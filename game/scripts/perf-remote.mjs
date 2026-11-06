import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';

const USAGE = 'Usage: npm run perf:remote -- <runs> [--scenes <id,id>]. Set PERF_HOST in .env to the ssh target of a Windows bench machine with node and git.';
const REMOTE_PATH = 'set "PATH=C:\\Program Files\\nodejs;C:\\Program Files\\Git\\cmd;%PATH%"';
const REMOTE_GAME = 'roam\\game';
const BUNDLE = 'tmp/perf-remote.bundle';
const SSH = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=30'];

function envHost() {
  const line = readFileSync('.env', 'utf8').split('\n').find((text) => text.startsWith('PERF_HOST='));
  const host = line?.slice('PERF_HOST='.length).trim();
  if (!host) throw new Error(USAGE);
  return host;
}

function parseArgs(argv) {
  const runs = Number(argv[0]);
  if (!Number.isInteger(runs) || runs < 1) throw new Error(USAGE);
  if (argv.length === 1) return { runs, scenes: [] };
  if (argv.length !== 3 || argv[1] !== '--scenes') throw new Error(USAGE);
  return { runs, scenes: ['--scenes', argv[2]] };
}

const local = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function remote(host, command) {
  return execFileSync('ssh', [...SSH, host, `${REMOTE_PATH} & ${command}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28 }).replaceAll('\r', '').trim();
}

function remoteGit(host, args) {
  return remote(host, `git -C roam ${args}`);
}

function sendCommit(host, commit) {
  const had = remoteGit(host, 'rev-parse HEAD');
  if (had === commit) return false;
  local('merge-base', '--is-ancestor', had, commit);
  local('bundle', 'create', BUNDLE, 'HEAD', `^${had}`);
  execFileSync('scp', ['-q', ...SSH, BUNDLE, `${host}:perf-remote.bundle`], { stdio: 'inherit' });
  rmSync(BUNDLE);
  remoteGit(host, 'fetch -q ../perf-remote.bundle HEAD');
  remoteGit(host, `checkout -q --detach -f ${commit}`);
  remote(host, 'del perf-remote.bundle');
  return local('diff', '--name-only', had, commit, '--', 'package-lock.json') !== '';
}

function playOnce(host, scenes) {
  let out = '';
  try {
    out = remote(host, `cd ${REMOTE_GAME} & npm run perf -- ${scenes.join(' ')}`.trimEnd());
  } catch (error) {
    if (!String(error.stdout).includes('\nreport perf-reports')) throw new Error(`The bench failed on ${host}, see the lines above`, { cause: error });
    out = String(error.stdout).replaceAll('\r', '');
  }
  console.log(out);
  const report = out.split('\n').find((line) => line.startsWith('report '))?.slice('report '.length).trim();
  if (!report) throw new Error('The bench printed no report path');
  const target = join('perf-reports', basename(report));
  execFileSync('scp', ['-q', ...SSH, `${host}:${REMOTE_GAME.replace('\\', '/')}/${report}`, target], { stdio: 'inherit' });
  return target;
}

function main() {
  const { runs, scenes } = parseArgs(process.argv.slice(2));
  if (local('status', '--porcelain', '--', 'src', 'scripts', 'index.html', 'public', 'package-lock.json') !== '') throw new Error('Commit the game first, since the bench plays HEAD');
  const host = envHost();
  mkdirSync('tmp', { recursive: true });
  mkdirSync('perf-reports', { recursive: true });
  const commit = local('rev-parse', 'HEAD');
  if (sendCommit(host, commit)) remote(host, `cd ${REMOTE_GAME} & npm ci --no-audit --no-fund`);
  const reports = Array.from({ length: runs }, () => playOnce(host, scenes));
  console.log(`\nreports ${reports.join(' ')}`);
}

main();
