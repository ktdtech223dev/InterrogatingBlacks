const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

// ── Resolve writable user-data folder for SQLite + uploads ──
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
logLine('dataDir: ' + dataDir);
logLine('isPackaged: ' + app.isPackaged);

// ── Boot the express + socket.io server in this same process ──
let serverPort = 3847;
function startServer() {
  return new Promise((resolve, reject) => {
    try {
      // Server lives inside the asar so it can resolve its node_modules
      const serverPath = app.isPackaged
        ? path.join(process.resourcesPath, 'app.asar', 'server', 'index.js')
        : path.join(__dirname, '..', 'server', 'index.js');

      logLine('Loading server from: ' + serverPath);
      // Pass a free-ish port via env. PORT=0 lets OS choose; we'll detect 3847 first.
      process.env.PORT = String(serverPort);
      require(serverPath);

      // Wait until the port responds before opening the window.
      const deadline = Date.now() + 30000;
      const probe = () => {
        const req = http.get(`http://127.0.0.1:${serverPort}/api/players`, res => {
          res.resume();
          if (res.statusCode === 200) {
            logLine('Server ready on :' + serverPort);
            resolve();
          } else if (Date.now() > deadline) reject(new Error('Bad status: ' + res.statusCode));
          else setTimeout(probe, 250);
        });
        req.on('error', () => {
          if (Date.now() > deadline) reject(new Error('Server never came up'));
          else setTimeout(probe, 250);
        });
      };
      setTimeout(probe, 300);
    } catch (e) {
      reject(e);
    }
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
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  Menu.setApplicationMenu(null);

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);

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
    await startServer();
    createWindow();
  } catch (e) {
    logLine('FATAL: ' + (e?.stack || e));
    dialog.showErrorBox('Failed to start',
      `Couldn't start the local server:\n\n${e?.stack || e}\n\nLog: ${logPath}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
