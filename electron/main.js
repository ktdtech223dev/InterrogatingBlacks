const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

// ── Online server (Railway) is the source of truth ──
// Setting USE_LOCAL=1 in the env switches to a self-hosted local server (LAN play / offline).
const ONLINE_URL = 'https://interrogatingblacks-production.up.railway.app';
const USE_LOCAL = process.env.IB_USE_LOCAL === '1' || process.argv.includes('--local');

const userData = app.getPath('userData');
const dataDir = path.join(userData, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
process.env.DATA_DIR = dataDir;

const logPath = path.join(userData, 'launcher.log');
function logLine(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(logPath, line); } catch {}
  console.log(msg);
}

logLine('=== Interrogating Blacks Launcher starting ===');
logLine('userData: ' + userData);
logLine('mode: ' + (USE_LOCAL ? 'LOCAL' : 'ONLINE'));
logLine('isPackaged: ' + app.isPackaged);

let serverPort = 3847;
let targetUrl = ONLINE_URL;

function probeUrl(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url + (url.endsWith('/') ? '' : '/') + 'api/players', res => {
      res.resume();
      if (res.statusCode === 200) resolve();
      else reject(new Error('HTTP ' + res.statusCode));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout')); });
  });
}

function startLocalServer() {
  return new Promise((resolve, reject) => {
    try {
      const serverPath = app.isPackaged
        ? path.join(process.resourcesPath, 'app.asar', 'server', 'index.js')
        : path.join(__dirname, '..', 'server', 'index.js');
      logLine('Loading local server from: ' + serverPath);
      process.env.PORT = String(serverPort);
      require(serverPath);
      const deadline = Date.now() + 30000;
      const probe = () => {
        probeUrl(`http://127.0.0.1:${serverPort}`).then(resolve).catch(() => {
          if (Date.now() > deadline) reject(new Error('Local server never came up'));
          else setTimeout(probe, 250);
        });
      };
      setTimeout(probe, 300);
    } catch (e) { reject(e); }
  });
}

let mainWindow = null;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#08080f',
    title: 'Interrogating Blacks',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  // Build a minimal menu so users can toggle online/local mode
  const menu = Menu.buildFromTemplate([
    {
      label: 'Game',
      submenu: [
        { label: `Mode: ${USE_LOCAL ? 'Local (LAN)' : 'Online (Railway)'}`, enabled: false },
        {
          label: USE_LOCAL ? 'Switch to Online' : 'Switch to Local (LAN/offline)',
          click: () => {
            const newArgs = USE_LOCAL
              ? process.argv.filter(a => a !== '--local')
              : [...process.argv, '--local'];
            app.relaunch({ args: newArgs.slice(1) });
            app.exit(0);
          }
        },
        { type: 'separator' },
        { label: 'Reload', accelerator: 'F5', click: () => mainWindow.reload() },
        { label: 'Toggle DevTools', accelerator: 'F12', click: () => mainWindow.webContents.toggleDevTools() },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);

  logLine('Loading: ' + targetUrl);
  mainWindow.loadURL(targetUrl);

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    logLine(`did-fail-load: ${code} ${desc} (${url})`);
    if (!USE_LOCAL) {
      // Online failed — offer fallback to local
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'error',
        title: 'Connection failed',
        message: `Couldn't reach ${ONLINE_URL}.\n\n${desc}`,
        detail: 'Switch to local mode (LAN/offline)?',
        buttons: ['Retry', 'Switch to Local', 'Quit'],
        defaultId: 0,
        cancelId: 2
      });
      if (choice === 0) mainWindow.reload();
      else if (choice === 1) {
        app.relaunch({ args: [...process.argv.slice(1), '--local'] });
        app.exit(0);
      } else app.quit();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

process.on('uncaughtException', (err) => {
  logLine('UNCAUGHT: ' + (err?.stack || err));
  try { dialog.showErrorBox('Interrogating Blacks crashed', String(err?.stack || err)); } catch {}
});

app.whenReady().then(async () => {
  try {
    if (USE_LOCAL) {
      await startLocalServer();
      targetUrl = `http://127.0.0.1:${serverPort}`;
    } else {
      // Probe online; if it fails, prompt fallback to local
      try {
        await probeUrl(ONLINE_URL, 8000);
        targetUrl = ONLINE_URL;
      } catch (e) {
        logLine('Online probe failed: ' + e.message);
        const choice = dialog.showMessageBoxSync({
          type: 'warning',
          title: 'Online server unreachable',
          message: `Can't reach the online multiplayer server.`,
          detail: 'Start in local (LAN/offline) mode instead?',
          buttons: ['Retry online', 'Local mode', 'Quit'],
          defaultId: 0,
          cancelId: 2
        });
        if (choice === 0) { app.relaunch(); app.exit(0); return; }
        if (choice === 2) { app.quit(); return; }
        await startLocalServer();
        targetUrl = `http://127.0.0.1:${serverPort}`;
      }
    }
    createWindow();
  } catch (e) {
    logLine('FATAL: ' + (e?.stack || e));
    dialog.showErrorBox('Failed to start',
      `${e?.stack || e}\n\nLog: ${logPath}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
