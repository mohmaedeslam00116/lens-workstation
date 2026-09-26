import { app, BrowserWindow, ipcMain, dialog, shell, Notification } from 'electron';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { EngineServer } from '../../engine/server/index.mjs';

let mainWindow: BrowserWindow | null = null;
let engineServer: EngineServer | null = null;

const ENGINE_PORT = 8000;
const IS_DEV = process.env.NODE_ENV === 'development' || !app.isPackaged;

function getStorePath(): string {
  const dir = app.getPath('userData');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, 'lens-settings.json');
}

function readStore(): Record<string, unknown> {
  try {
    const file = getStorePath();
    if (existsSync(file)) {
      return JSON.parse(readFileSync(file, 'utf8'));
    }
  } catch { /* ignore */ }
  return {};
}

function writeStore(data: Record<string, unknown>): void {
  try {
    writeFileSync(getStorePath(), JSON.stringify(data, null, 2), 'utf8');
  } catch { /* ignore */ }
}

async function startEngine(): Promise<void> {
  engineServer = new EngineServer({
    port: ENGINE_PORT,
    staticDir: 'dist/workstation',
    initialWorkspace: process.cwd(),
  });
  await engineServer.start();
}

function createWindow(): void {
  const loadUrl = IS_DEV && process.env.VITE_DEV_SERVER_URL
    ? process.env.VITE_DEV_SERVER_URL
    : `http://127.0.0.1:${ENGINE_PORT}`;
  const allowedOrigin = new URL(loadUrl).origin;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#111111',
    title: 'LENS Workstation',
    webPreferences: {
      preload: resolve(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== allowedOrigin) {
      event.preventDefault();
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.loadURL(loadUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const FORBIDDEN_KEYS = new Set(['__proto__']);
function assertStorageKey(key: unknown): asserts key is string {
  if (typeof key !== 'string' || FORBIDDEN_KEYS.has(key)) {
    throw new Error('Invalid storage key');
  }
}

function setupIpcHandlers(): void {
  // Storage handlers
  ipcMain.handle('storage:get', (_event, key: unknown) => {
    assertStorageKey(key);
    const store = readStore();
    return Object.hasOwn(store, key) ? store[key] : undefined;
  });

  ipcMain.handle('storage:set', (_event, key: unknown, value: unknown) => {
    assertStorageKey(key);
    const store = readStore();
    store[key] = value;
    writeStore(store);
    return true;
  });

  ipcMain.handle('storage:delete', (_event, key: unknown) => {
    assertStorageKey(key);
    const store = readStore();
    delete store[key];
    writeStore(store);
    return true;
  });

  // Dialog handlers
  ipcMain.handle('dialog:openDirectory', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:openFile', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // Shell handlers
  ipcMain.handle('shell:openExternal', async (_event, url: unknown) => {
    if (typeof url !== 'string') return false;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    await shell.openExternal(parsed.toString());
    return true;
  });

  // Notification handlers
  ipcMain.handle('notification:show', (_event, { title, body }: { title: string; body: string }) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
      return true;
    }
    return false;
  });
}

app.whenReady().then(async () => {
  setupIpcHandlers();
  try {
    await startEngine();
  } catch (err) {
    dialog.showErrorBox('LENS Workstation', `Engine failed to start: ${String(err)}`);
    app.quit();
    return;
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (!engineServer) return;

  event.preventDefault();
  const server = engineServer;
  engineServer = null;

  server.stop()
    .catch((error) => {
      console.error('Failed to stop engine:', error);
    })
    .finally(() => app.quit());
});
