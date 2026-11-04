import { isAbsolute, join, relative, resolve, extname } from 'node:path';

export const APP_SCHEME = 'app';
export const APP_HOST = 'game';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.bin': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export function mimeOf(file: string): string | null {
  return MIME_TYPES[extname(file).toLowerCase()] ?? null;
}

function isInside(root: string, file: string): boolean {
  const inside = relative(root, file);
  return inside !== '' && !inside.startsWith('..') && !isAbsolute(inside);
}

function isGameUrl(parsed: URL): boolean {
  return parsed.protocol === `${APP_SCHEME}:` && parsed.host === APP_HOST;
}

export function fileForUrl(root: string, url: string): string | null {
  const parsed = new URL(url);
  if (!isGameUrl(parsed)) return null;
  const path = decodeURIComponent(parsed.pathname);
  const wanted = path.endsWith('/') ? `${path}index.html` : path;
  const file = resolve(join(root, wanted));
  return isInside(root, file) ? file : null;
}
