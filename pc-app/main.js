const { app, BrowserWindow, session, ipcMain, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

// Register custom protocol for local files
protocol.registerSchemesAsPrivileged([
  { scheme: 'app-data', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } }
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0f172a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false // Set to false to allow some node features if needed, but we'll use IPC
    }
  });

  // Register protocol handler (resolve to same base used for storage)
  session.defaultSession.protocol.registerFileProtocol('app-data', (request, callback) => {
    try {
      // Normalize URL: remove scheme and any leading slashes to avoid
      // accidental absolute-path joins (which would drop baseDir).
      let url = request.url.replace('app-data://', '');
      url = url.replace(/^\/+/, '');
      const decodedUrl = decodeURIComponent(url);
      const baseDir = getBaseDir();
      const filePath = path.join(baseDir, 'music', decodedUrl);
      callback({ path: filePath });
    } catch (error) {
      console.error('Failed to register protocol', error);
      callback({ error: -6 });
    }
  });

  // Grant getUserMedia for microphone/video in renderer
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  win.loadFile(path.join(__dirname, 'public', 'index.html'));
}

function getBaseDir() {
  try {
    return app.isPackaged ? path.dirname(process.execPath) : app.getPath('userData');
  } catch (e) {
    return app.getPath('userData');
  }
}

app.whenReady().then(() => {
  createWindow();

  // Ensure music directory exists (portable: next to executable; dev: userData)
  const baseDir = getBaseDir();
  const musicDir = path.join(baseDir, 'music');
  try {
    if (!fs.existsSync(musicDir)) {
      fs.mkdirSync(musicDir, { recursive: true });
    }
  } catch (e) {
    console.error('Failed to ensure music directory:', e);
  }
});

// IPC Handlers
ipcMain.handle('save-file', async (event, { name, arrayBuffer }) => {
  const baseDir = getBaseDir();
  const musicDir = path.join(baseDir, 'music');
  const id = Date.now() + '-' + Math.random().toString(36).substring(2, 9);
  // sanitize incoming name to avoid accidental path segments
  const safeName = (name || 'file').replace(/[\\/]+/g, '_');
  const fileName = `${id}_${safeName}`;
  const filePath = path.join(musicDir, fileName);
  const buffer = Buffer.from(arrayBuffer);
  await fs.promises.writeFile(filePath, buffer);
  return `app-data://${encodeURIComponent(fileName)}`;
});

ipcMain.handle('delete-file', async (event, name) => {
  const baseDir = getBaseDir();
  const filePath = path.join(baseDir, 'music', name);
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath);
    return true;
  }
  return false;
});

ipcMain.handle('list-files', async () => {
  const baseDir = getBaseDir();
  const musicDir = path.join(baseDir, 'music');
  if (!fs.existsSync(musicDir)) return [];
  return await fs.promises.readdir(musicDir);
});

ipcMain.handle('get-app-path', () => {
  return getBaseDir();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
