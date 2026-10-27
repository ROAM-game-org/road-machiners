import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dockerContainer } from './container';
import { realRun } from './exec';
import { fetchMedia, mediaSection } from './media';
import { solidPng } from './media-fixtures';
import type { FactoryConfig } from './types';

const DOCKER = resolve(__dirname, '../docker');
const SKILL = join(DOCKER, 'skills/blender-image-to-3d');
const SHA = 'f0ef29385a03de139957e6f700b801cdc00b7e29';

describe('the vendored Blender image skill', () => {
  it('is the whole upstream folder with its license and the pinned source commit', () => {
    for (const path of ['SKILL.md', 'LICENSE', 'SOURCE.md', 'assets/build_template.py', 'scripts/review_render.py', 'scripts/compose_review.py', 'references/categories.md', 'evals/evals.json']) {
      expect(existsSync(join(SKILL, path)), path).toBe(true);
    }
    expect(readFileSync(join(SKILL, 'LICENSE'), 'utf8')).toContain('MIT License');
    expect(readFileSync(join(SKILL, 'SOURCE.md'), 'utf8')).toContain(SHA);
    expect(readFileSync(join(SKILL, 'SKILL.md'), 'utf8')).toMatch(/^---\nname: blender-image-to-3d\n/);
  });

  it('is copied to the user skills of the image, with the Pillow its compare sheets need', () => {
    const dockerfile = readFileSync(join(DOCKER, 'Dockerfile'), 'utf8');
    expect(dockerfile).toContain('COPY --chown=pwuser:pwuser skills/ /home/pwuser/.claude/skills/');
    expect(dockerfile).toMatch(/apt-get install[^\n]*python3-pil/);
  });
});

describe('the ultrapack plugin of the image', () => {
  it('fails the build without the up:expand and up:udocument skills the stage prompts invoke', () => {
    const dockerfile = readFileSync(join(DOCKER, 'Dockerfile'), 'utf8');
    const install = dockerfile.slice(dockerfile.indexOf('RUN claude plugin marketplace add'));
    expect(install.slice(0, install.indexOf('\n\n'))).toMatch(/claude plugin install up@ultrapack \\\n && ls \S+\/skills\/expand\/SKILL\.md \S+\/skills\/udocument\/SKILL\.md/);
  });
});

function runEntry(home: string, gameSkills: string): { code: number | null; out: string; err: string } {
  const bin = join(home, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'claude'), '#!/bin/bash\nprintf "%s\\n" "$@" > "$HOME/arguments"\nls "$HOME/.claude/skills"\n');
  chmodSync(join(bin, 'claude'), 0o755);
  const result = spawnSync('bash', [join(DOCKER, 'factory-agent')], { env: { PATH: `${bin}:${process.env.PATH}`, HOME: home, FACTORY_GAME_SKILLS: gameSkills }, encoding: 'utf8' });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

describe('factory-agent', () => {
  it('lets Claude discover the Blender skill beside the game skills', () => {
    const home = mkdtempSync(join(tmpdir(), 'factory-home-'));
    const game = mkdtempSync(join(tmpdir(), 'factory-game-skills-'));
    mkdirSync(join(game, 'typescript-practices'));
    writeFileSync(join(game, 'typescript-practices/SKILL.md'), '---\nname: typescript-practices\n---\n');
    mkdirSync(join(home, '.claude'), { recursive: true });
    spawnSync('cp', ['-r', join(DOCKER, 'skills'), join(home, '.claude/skills')]);
    const run = runEntry(home, game);
    expect(run.code).toBe(0);
    expect(readFileSync(join(home, 'arguments'), 'utf8')).toContain('factory-status milestone');
    expect(run.out.split('\n').filter(Boolean).sort()).toEqual(['blender-image-to-3d', 'typescript-practices']);
    expect(readdirSync(join(home, '.claude/skills/blender-image-to-3d/scripts'))).toContain('review_render.py');
    rmSync(home, { recursive: true, force: true });
    rmSync(game, { recursive: true, force: true });
  });

  it('stops when the image lacks the Blender skill', () => {
    const home = mkdtempSync(join(tmpdir(), 'factory-home-'));
    const run = runEntry(home, tmpdir());
    expect(run.code).toBe(1);
    expect(run.err).toContain('blender-image-to-3d skill is missing');
    rmSync(home, { recursive: true, force: true });
  });
});

const smoke = process.env.FACTORY_SMOKE_IMAGE !== undefined && process.env.CLAUDE_CODE_OAUTH_TOKEN !== undefined;

describe.skipIf(!smoke)('reference image in the real agent container', () => {
  it('lets Claude read the pixels of a mounted image, and the Blender skill is listed', async () => {
    const root = mkdtempSync(join(tmpdir(), 'factory-smoke-'));
    const clone = join(root, 'clone');
    mkdirSync(join(clone, 'game/.agents/skills/none'), { recursive: true });
    writeFileSync(join(clone, 'game/.agents/skills/none/SKILL.md'), '---\nname: none\ndescription: none\n---\n');
    const png = join(root, 'src.png');
    writeFileSync(png, solidPng(64, 64, [0, 200, 0]));
    const asset = 'https://github.com/user-attachments/assets/24c78bbf-b445-42bb-a191-2eba2e36379e';
    const host = async (input: URL | string): Promise<Response> => (String(input) === asset
      ? new Response(null, { status: 302, headers: { location: 'https://github-production-user-asset-6210df.s3.amazonaws.com/1/2' } })
      : new Response(new Uint8Array(readFileSync(png)), { status: 200 }));
    const media = join(root, 'media');
    const entries = await fetchMedia({ fetch: host as typeof fetch, dir: media, texts: [{ source: 'issue body', text: asset }] });
    const log = join(root, 'agent.log');
    mkdirSync(join(root, 'codex'));
    writeFileSync(join(root, 'codex/auth.json'), '{}');
    mkdirSync(join(root, 'agy'));
    writeFileSync(join(root, 'agy/antigravity-oauth-token'), '{}');
    const cfg = { image: process.env.FACTORY_SMOKE_IMAGE, oauthToken: process.env.CLAUDE_CODE_OAUTH_TOKEN, elevenlabsKey: '', sfxMaxGenerations: 0, agyMaxRuns: 1, home: root } as FactoryConfig;
    const prompt = `${mediaSection(entries)}\n\nLook at the reference image. Answer with exactly two lines. Line 1: the one word name of its main color (red, green, blue, ...). Line 2: the name of every skill you can use that mentions Blender.`;
    await dockerContainer(realRun, cfg, null).agent({ clone, dir: 'game', model: 'haiku', prompt, log, openNetwork: true, mediaDir: media });
    const text = readFileSync(log, 'utf8').toLowerCase();
    expect(text).toContain('green');
    expect(text).toContain('blender-image-to-3d');
    rmSync(root, { recursive: true, force: true });
  }, 300_000);
});

const smokeImage = process.env.FACTORY_SMOKE_IMAGE;
const smokeCodexHome = process.env.FACTORY_SMOKE_CODEX_HOME;
const smokeAgyLogin = process.env.FACTORY_SMOKE_AGY_LOGIN;

function proxiedShell(script: string, env: Record<string, string>, mounts: Record<string, string> = {}): { clone: string; log: string; done: Promise<void> } {
  const root = mkdtempSync(join(tmpdir(), 'factory-smoke-'));
  const clone = join(root, 'clone');
  mkdirSync(join(clone, 'game'), { recursive: true });
  chmodSync(join(clone, 'game'), 0o777);
  const log = join(root, 'shell.log');
  const cfg = { image: smokeImage, home: root, gpu: false, jobsSlice: null } as FactoryConfig;
  return { clone, log, done: dockerContainer(realRun, cfg, null).shell('checks', clone, script, log, env, mounts) };
}

describe.skipIf(smokeImage === undefined || smokeCodexHome === undefined)('Codex in the real agent container', () => {
  it('draws a picture through the proxy with the mounted ChatGPT login, and saves it though the call asks for its sandbox', async () => {
    const run = proxiedShell('echo "Generate one small image of a red square and save it as square.png in this folder." | codex exec -s workspace-write --skip-git-repo-check -', { CODEX_MODEL: 'gpt-6-sol', CODEX_EFFORT: 'medium' }, { [smokeCodexHome as string]: '/home/pwuser/.codex' });
    await run.done;
    expect(readFileSync(join(run.clone, 'game/square.png')).subarray(1, 4).toString()).toBe('PNG');
  }, 600_000);
});

describe.skipIf(smokeImage === undefined)('agy in the real agent container', () => {
  it('stops at the run after AGY_MAX_RUNS', async () => {
    const run = proxiedShell('agy --version && ! agy --version', { AGY_MAX_RUNS: '1', AGY_MODEL: 'gemini-3.8-flash-medium' });
    await run.done;
    expect(readFileSync(run.log, 'utf8')).toContain('run 2 exceeds AGY_MAX_RUNS=1');
  }, 120_000);

  it.skipIf(smokeAgyLogin === undefined)('answers through the proxy with the mounted Google login', async () => {
    const run = proxiedShell('agy --dangerously-skip-permissions -p "Reply with the single word ok."', { AGY_MAX_RUNS: '1', AGY_MODEL: 'gemini-3.8-flash-medium' }, { [smokeAgyLogin as string]: '/home/pwuser/.gemini/antigravity-cli/antigravity-oauth-token' });
    await run.done;
    expect(readFileSync(run.log, 'utf8').toLowerCase()).toContain('ok');
  }, 300_000);
});
