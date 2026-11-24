import type { Ctx } from '../types';

export const ITCH_HTML_HOST = 'https://html-classic.itch.zone/html';

type ItchBuild = { id: number; state: string; userVersion: string };
type ItchChannel = { name: string; uploadId: number; head: ItchBuild | null };
type Seen = { live: true } | { live: false; reason: string };

export class ItchRefusedError extends Error {
  constructor(readonly version: string, reason: string) {
    super(`itch.io did not take build ${version}: ${reason}. itch checks an HTML5 upload after butler exits, like its 1000 file limit, so butler's success does not mean players can play it.`);
  }
}

export async function requireLiveOnItch(ctx: Ctx, target: string, butlerKey: string, version: string): Promise<void> {
  const deadline = ctx.now().getTime() + ctx.cfg.itchLiveMinutes * 60_000;
  for (;;) {
    const seen = await readBuild(ctx, target, butlerKey, version);
    if (seen.live) return;
    if (ctx.now().getTime() >= deadline) throw new ItchRefusedError(version, `after ${ctx.cfg.itchLiveMinutes} minutes, ${seen.reason}`);
    await new Promise((done) => setTimeout(done, ctx.cfg.itchPollSeconds * 1000));
  }
}

async function readBuild(ctx: Ctx, target: string, butlerKey: string, version: string): Promise<Seen> {
  const status = await ctx.run('butler', ['status', '--json', `${target}:html5`], { activity: 'publish', env: { BUTLER_API_KEY: butlerKey } });
  if (status.code !== 0) return { live: false, reason: `butler status failed with exit code ${status.code}` };
  const channel = html5Channel(status.stdout);
  const waiting = headWait(channel.head, version);
  return waiting === null ? pageServed(ctx, channel.uploadId, channel.head as ItchBuild) : { live: false, reason: waiting };
}

function headWait(head: ItchBuild | null, version: string): string | null {
  if (head === null) return 'the html5 channel head is empty';
  if (head.userVersion !== version) return `the html5 channel head is version ${head.userVersion}`;
  if (head.state === 'failed') throw new ItchRefusedError(version, `build #${head.id} failed processing`);
  return head.state === 'completed' ? null : `build #${head.id} is ${head.state}`;
}

async function pageServed(ctx: Ctx, uploadId: number, head: ItchBuild): Promise<Seen> {
  const page = `${ITCH_HTML_HOST}/${uploadId}-${head.id}/index.html`;
  const response = await (ctx.fetch ?? fetch)(page, { method: 'HEAD' });
  return response.status === 200 ? { live: true } : { live: false, reason: `its page ${page} answers HTTP ${response.status}` };
}

function html5Channel(stdout: string): ItchChannel {
  const result = stdout.split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line) as { type: string; value?: { channels: ItchChannel[] } }).find((line) => line.type === 'result');
  const channel = result?.value?.channels.find((entry) => entry.name === 'html5');
  if (channel === undefined) throw new Error('butler status --json gave no html5 channel, so the factory cannot tell whether itch.io took the build.');
  return channel;
}
