import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, ipcMain, net, protocol, session, type IpcMainInvokeEvent } from 'electron';
import { APP_ORIGIN, APP_SCHEME, fileForUrl, mimeOf } from './app-files';
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
    const response = await net.fetch(pathToFileURL(file).toString(), { headers: request.headers });
    const type = mimeOf(file);
    if (type === null) return response;
    const headers = new Headers(response.headers);
    headers.set('content-type', type);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  });
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

app.whenReady().then(() => {
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
