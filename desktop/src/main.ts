import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, ipcMain, net, protocol, session, type IpcMainInvokeEvent } from 'electron';
import { APP_ORIGIN, APP_SCHEME, closedRange, fileForUrl, fitsFile, mimeOf, readRange, type ByteRange } from './app-files';
import { startsFullscreen } from './handheld';
import { FileSaves } from './saves';

const SAVE_CALLS = ['readAll', 'put', 'remove', 'appendLog', 'readLog'] as const;

if (process.env.ROAM_SMOKE === '1') app.commandLine.appendSwitch('mute-audio');

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
]);

function distRoot(): string {
  const root = app.isPackaged ? join(process.resourcesPath, 'game') : join(__dirname, '..', '..', 'game', 'dist');
  if (!existsSync(join(root, 'index.html'))) throw new Error(`The game build is missing: no index.html in ${root}. Run npm run build in game/.`);
  return root;
}

function serveGame(root: string): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const file = fileForUrl(root, request.url);
    if (file === null || !existsSync(file)) return new Response('Not found', { status: 404 });
    const range = closedRange(request.headers.get('range') ?? '');
    if (range !== null) return serveSlice(file, range);
    const response = await net.fetch(pathToFileURL(file).toString(), { headers: request.headers });
    const type = mimeOf(file);
    if (type === null) return response;
    const headers = new Headers(response.headers);
    headers.set('content-type', type);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  });
}

async function serveSlice(file: string, range: ByteRange): Promise<Response> {
  const size = statSync(file).size;
  if (!fitsFile(range, size)) return new Response(`Range ${range.start}-${range.end} does not fit ${size} bytes`, { status: 416, headers: { 'content-range': `bytes */${size}` } });
  const bytes = await readRange(file, range);
  const headers = { 'content-type': mimeOf(file) ?? 'application/octet-stream', 'content-length': String(bytes.length), 'content-range': `bytes ${range.start}-${range.end}/${size}` };
  return new Response(new Uint8Array(bytes), { status: 206, headers });
}

function fromGamePage(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? '';
  if (!url.startsWith(`${APP_ORIGIN}/`)) throw new Error(`Save call from outside the game page: ${url}`);
}

function serveSaves(saves: FileSaves): void {
  for (const name of SAVE_CALLS) {
    const run = saves[name] as (...args: unknown[]) => Promise<unknown>;
    ipcMain.handle(`roam:saves:${name}`, (event, ...args) => {
      fromGamePage(event);
      return run.apply(saves, args);
    });
  }
}

function denyEverythingElse(): void {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, done) => done(false));
}

function openWindow(): BrowserWindow {
  const quiet = process.env.ROAM_SMOKE === '1';
  const window = new BrowserWindow({
    show: !quiet,
    width: 1440,
    height: 900,
    fullscreen: !quiet && startsFullscreen(process.env, process.argv),
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
      preload: join(__dirname, 'preload.js'),
    },
  });
  if (quiet) window.webContents.setAudioMuted(true);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${APP_ORIGIN}/`)) event.preventDefault();
  });
  void window.loadURL(`${APP_ORIGIN}/index.html`);
  return window;
}

function focusRunningWindow(): void {
  const [window] = BrowserWindow.getAllWindows();
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.focus();
}

const onlyInstance = app.requestSingleInstanceLock();
if (!onlyInstance) app.quit();
app.on('second-instance', focusRunningWindow);

app.whenReady().then(() => {
  if (!onlyInstance) return;
  const userData = app.getPath('userData');
  serveGame(distRoot());
  serveSaves(new FileSaves(join(userData, 'saves'), join(userData, 'logs')));
  denyEverythingElse();
  openWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow();
  });
}).catch((error: unknown) => {
  console.error(error);
  app.exit(1);
});

app.on('window-all-closed', () => app.quit());
