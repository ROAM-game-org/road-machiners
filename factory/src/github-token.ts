import { createSign } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';

export type AppKeys = { appId: string; installationId: string; keyPath: string; tokenPath: string };

const ENV_KEYS = {
  appId: 'FACTORY_GITHUB_APP_ID',
  installationId: 'FACTORY_GITHUB_INSTALLATION_ID',
  keyPath: 'FACTORY_GITHUB_APP_KEY',
  tokenPath: 'FACTORY_GITHUB_TOKEN_FILE',
} as const;

const CLOCK_SKEW_SECONDS = 60;
const JWT_LIFETIME_SECONDS = 540;

export function readAppKeys(env: NodeJS.ProcessEnv): AppKeys {
  const keys = {} as AppKeys;
  for (const [field, name] of Object.entries(ENV_KEYS) as [keyof AppKeys, string][]) {
    const value = env[name];
    if (!value) throw new Error(`Missing env var: ${name}`);
    keys[field] = value;
  }
  return keys;
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

export function appJwt(appId: string, privateKey: string, now: Date): string {
  const issuedAt = Math.floor(now.getTime() / 1000) - CLOCK_SKEW_SECONDS;
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iat: issuedAt, exp: issuedAt + JWT_LIFETIME_SECONDS, iss: appId }));
  const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(privateKey);
  return `${header}.${payload}.${base64url(signature)}`;
}

export async function writeGithubToken(keys: AppKeys, fetchFn: typeof fetch, now: Date): Promise<string> {
  const jwt = appJwt(keys.appId, readFileSync(keys.keyPath, 'utf8'), now);
  const response = await fetchFn(`https://api.github.com/app/installations/${keys.installationId}/access_tokens`, {
    method: 'POST',
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${jwt}`, 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (response.status !== 201) throw new Error(`GitHub refused the installation token with HTTP ${response.status}: ${await response.text()}`);
  const { token, expires_at: expiresAt } = (await response.json()) as { token: string; expires_at: string };
  const next = `${keys.tokenPath}.next`;
  writeFileSync(next, token, { mode: 0o600 });
  renameSync(next, keys.tokenPath);
  return expiresAt;
}
