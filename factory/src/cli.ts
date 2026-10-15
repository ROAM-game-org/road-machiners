import { loadConfig, readEnvFiles } from './config';
import { realContext } from './context';
import { runCtl } from './ctl';
import { writeHealth } from './health';
import { readAppKeys, writeGithubToken } from './github-token';
import { decodeToolCall, realToolDeps, runHermesTool } from './hermes-tools';
import { drainInbox } from './inbox';
import { intake } from './intake';
import { runJob } from './job';
import { parseStage } from './jobs';
import { liftEndedPause, readPause } from './pause';
import { reportScheduler } from './observability';
import { realRun } from './exec';
import { checkJobs, tick } from './tick';
import { guardTick } from './tick-guard';

function loadEnv(): void {
  for (const [key, value] of Object.entries(readEnvFiles('settings.env', '.env'))) process.env[key] ??= value;
}

async function main(args: string[]): Promise<void> {
  loadEnv();
  const ctx = realContext(process.env);
  const codeDir = process.cwd();
  const [command, stage, issue] = args;
  if (command === 'tick') {
    writeHealth(ctx.cfg.home, ctx.cfg.minFreeGb, ctx.cfg.minAvailableGb, ctx.now());
    if (paused(ctx)) {
      reportScheduler(ctx.cfg.home, 'paused', ctx.now());
      return guardTick(ctx, () => checkJobs(ctx));
    }
    return guardTick(ctx, async () => {
      await drainInbox(ctx);
      await tick(ctx, codeDir);
    });
  }
  if (command === 'intake') return void (await intake(ctx));
  if (command === 'run') return runJob(ctx, parseStage(stage), issue === '-' ? null : parseIssue(issue));
  return manage(ctx, args);
}

async function manage(ctx: ReturnType<typeof realContext>, args: string[]): Promise<void> {
  try {
    await runCtl(ctx, args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function hermesTool([, tool, payload]: string[]): Promise<void> {
  try {
    loadEnv();
    const cfg = loadConfig(process.env);
    process.exitCode = await runHermesTool(cfg, decodeToolCall(tool, payload), realToolDeps(realRun, cfg));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

function paused(ctx: ReturnType<typeof realContext>): boolean {
  const lifted = liftEndedPause(ctx.cfg.home);
  if (lifted !== null) ctx.log('tick', null, `pause lifted, its process ended: ${lifted.note}`);
  const pause = readPause(ctx.cfg.home);
  if (pause !== null) ctx.log('tick', null, `paused: ${pause.note}`);
  return pause !== null;
}

function parseIssue(value: string | undefined): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`"${value}" is not an issue number or change id.`);
  return number;
}

async function githubToken(): Promise<void> {
  loadEnv();
  const expiresAt = await writeGithubToken(readAppKeys(process.env), fetch, new Date());
  console.log(`GitHub App token written, it expires at ${expiresAt}`);
}

const argv = process.argv.slice(2).filter((arg) => arg !== '--');
if (argv[0] === 'tool') await hermesTool(argv);
else if (argv[0] === 'github-token') await githubToken();
else await main(argv);
