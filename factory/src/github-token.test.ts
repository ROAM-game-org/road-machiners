import { createVerify, generateKeyPairSync } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { appJwt, readAppKeys, writeGithubToken } from './github-token';

const ROOT = resolve('tmp/github-token-test');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const NOW = new Date('2026-10-13T12:00:00Z');
const keys = { appId: '42', installationId: '7', keyPath: join(ROOT, 'app.pem'), tokenPath: join(ROOT, 'github-token') };

function decode(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, 'base64url').toString()) as Record<string, unknown>;
}

describe('the GitHub App token', () => {
  beforeEach(() => {
    rmSync(ROOT, { recursive: true, force: true });
    mkdirSync(ROOT, { recursive: true });
    writeFileSync(keys.keyPath, PEM);
  });

  it('signs a JWT for the App that GitHub accepts for under ten minutes', () => {
    const [header, payload, signature] = appJwt('42', PEM, NOW).split('.');
    expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
    const claims = decode(payload) as { iat: number; exp: number; iss: string };
    expect(claims.iss).toBe('42');
    expect(claims.iat).toBeLessThan(NOW.getTime() / 1000);
    expect(claims.exp - NOW.getTime() / 1000).toBeLessThanOrEqual(600);
    expect(createVerify('RSA-SHA256').update(`${header}.${payload}`).verify(publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
  });

  it('writes the installation token to a file only its owner reads', async () => {
    const seen: { url: string; auth: string }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen.push({ url, auth: (init.headers as Record<string, string>).Authorization });
      return new Response(JSON.stringify({ token: 'ghs_new', expires_at: '2026-10-13T13:00:00Z' }), { status: 201 });
    }) as unknown as typeof fetch;
    expect(await writeGithubToken(keys, fetchFn, NOW)).toBe('2026-10-13T13:00:00Z');
    expect(seen[0].url).toBe('https://api.github.com/app/installations/7/access_tokens');
    expect(seen[0].auth).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    expect(readFileSync(keys.tokenPath, 'utf8')).toBe('ghs_new');
    expect(statSync(keys.tokenPath).mode & 0o777).toBe(0o600);
  });

  it('keeps the old token and fails when GitHub refuses', async () => {
    writeFileSync(keys.tokenPath, 'ghs_old', { mode: 0o600 });
    const fetchFn = (async () => new Response('{"message":"Bad credentials"}', { status: 401 })) as unknown as typeof fetch;
    await expect(writeGithubToken(keys, fetchFn, NOW)).rejects.toThrow('HTTP 401');
    expect(readFileSync(keys.tokenPath, 'utf8')).toBe('ghs_old');
  });

  it('names a missing env var', () => {
    expect(() => readAppKeys({ FACTORY_GITHUB_APP_ID: '42' })).toThrow('FACTORY_GITHUB_INSTALLATION_ID');
  });
});
