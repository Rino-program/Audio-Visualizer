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

  // Register protocol handler
  session.defaultSession.protocol.registerFileProtocol('app-data', (request, callback) => {
    const url = request.url.replace('app-data://', '');
    const decodedUrl = decodeURIComponent(url);
    try {
      const filePath = path.join(app.getPath('userData'), 'music', decodedUrl);
      callback({ path: filePath });
    } catch (error) {
      console.error('Failed to register protocol', error);
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

app.whenReady().then(() => {
  createWindow();

  // Ensure music directory exists
  const musicDir = path.join(app.getPath('userData'), 'music');
  if (!fs.existsSync(musicDir)) {
    fs.mkdirSync(musicDir, { recursive: true });
  }
});

// IPC Handlers
ipcMain.handle('save-file', async (event, { name, arrayBuffer }) => {
  const musicDir = path.join(app.getPath('userData'), 'music');
  const id = Date.now() + '-' + Math.random().toString(36).substring(2, 9);
  const fileName = `${id}_${name}`;
  const filePath = path.join(musicDir, fileName);
  const buffer = Buffer.from(arrayBuffer);
  await fs.promises.writeFile(filePath, buffer);
  return `app-data://${encodeURIComponent(fileName)}`;
});

ipcMain.handle('delete-file', async (event, name) => {
  const filePath = path.join(app.getPath('userData'), 'music', name);
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath);
    return true;
  }
  return false;
});

ipcMain.handle('list-files', async () => {
  const musicDir = path.join(app.getPath('userData'), 'music');
  if (!fs.existsSync(musicDir)) return [];
  return await fs.promises.readdir(musicDir);
});

ipcMain.handle('get-app-path', () => {
  return app.getPath('userData');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
