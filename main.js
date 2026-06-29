const { app, BrowserWindow, ipcMain, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { MusicFile, MetaPicture } = require('music-tag-native');

function createWindow() {
  const win = new BrowserWindow({
    width: 358, // Scaled up by 30% total (275 * 1.30 = 358)
    height: 254, // Scaled up by 30% total (195 * 1.30 = 254)
    icon: path.join(__dirname, 'icon.png'), // Set window icon
    frame: false, // Frameless window
    transparent: true, // Transparent window for custom rounded corners
    hasShadow: true, // Retain OS shadows
    titleBarStyle: 'hidden', // Keeps native traffic lights
    trafficLightPosition: { x: 16, y: 16 }, // Scaled position for traffic lights
    resizable: false,
    maximizable: false,
    vibrancy: null, // Disable vibrancy
    backgroundColor: '#00000000', // Transparent so CSS handles border radius
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false // Exposes file.path on drag-and-drop
    }
  });

  win.loadFile('index.html');

  // Pipe console messages from renderer to main process stdout
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[RENDERER CONSOLE] ${message} (at ${path.basename(sourceId)}:${line})`);
  });
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && !app.isPackaged) {
    try {
      const image = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
      app.dock.setIcon(image); // Set macOS Dock icon dynamically only in development
    } catch (e) {
      console.error('Error setting dock icon:', e);
    }
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

// IPC Handler to write cover art to an audio file (MP3, FLAC, M4A, WAV, OGG)
ipcMain.handle('write-cover-art', async (event, { filePath, imageBase64 }) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File does not exist' };
    }

    // Strip data:image/... prefix if present and convert to buffer
    const cleanBase64 = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64;
    const buffer = Buffer.from(cleanBase64, 'base64');
    const musicFile = MusicFile.loadSync(filePath);
    
    // Deduce mime type
    let mimeType = 'image/jpeg';
    if (imageBase64.startsWith('data:image/png') || imageBase64.includes('image/png')) {
      mimeType = 'image/png';
    }

    const newPic = new MetaPicture(mimeType, new Uint8Array(buffer), 'Front Cover');
    musicFile.pictures = [newPic];
    
    musicFile.saveSync();
    return { success: true };
  } catch (error) {
    console.error('Error writing cover art:', error);
    return { success: false, error: error.message || 'Unknown error occurred writing tags.' };
  }
});

// IPC Handler to verify if file is writable and exists
ipcMain.handle('validate-file', async (event, filePath) => {
  try {
    await fs.promises.access(filePath, fs.constants.W_OK);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'File is not writable or access is denied.' };
  }
});

// IPC Handler to open OS file dialog for selecting music files
ipcMain.handle('select-music-files', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'flac', 'm4a', 'mp4', 'wav', 'ogg'] }
    ]
  });
  return result.filePaths;
});

// IPC Handler to open OS file dialog for selecting a cover image (JPG/PNG/WebP)
ipcMain.handle('select-image-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Image Files', extensions: ['jpg', 'jpeg', 'png', 'webp'] }
    ]
  });
  return result.filePaths[0] || null;
});

// IPC Handler to read file metadata (size, name) from a file path
ipcMain.handle('get-file-info', async (event, filePath) => {
  try {
    const stats = await fs.promises.stat(filePath);
    const info = {
      path: filePath,
      name: path.basename(filePath),
      size: stats.size,
      valid: true
    };

    // Read cover art using music-tag-native if supported audio format
    const ext = path.extname(filePath).toLowerCase();
    const supportedAudio = ['.mp3', '.flac', '.m4a', '.mp4', '.wav', '.ogg'];
    if (supportedAudio.includes(ext)) {
      try {
        const musicFile = MusicFile.loadSync(filePath);
        if (musicFile.pictures && musicFile.pictures.length > 0) {
          const pic = musicFile.pictures[0];
          const mime = pic.mimeType || 'image/jpeg';
          info.existingCoverBase64 = `data:${mime};base64,${Buffer.from(pic.data).toString('base64')}`;
        }
      } catch (e) {
        console.error(`Error reading tags using music-tag-native for ${filePath}:`, e);
      }
    }
    return info;
  } catch (error) {
    return { valid: false, error: error.message };
  }
});

// IPC Handler to remove cover art from a file path
ipcMain.handle('remove-cover-art', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File does not exist' };
    }
    const musicFile = MusicFile.loadSync(filePath);
    musicFile.pictures = [];
    musicFile.saveSync();
    return { success: true };
  } catch (error) {
    console.error('Error removing cover art:', error);
    return { success: false, error: error.message || 'Unknown error occurred removing cover art.' };
  }
});

// IPC Handler to read local file content as a Base64 string (for renderer previews)
ipcMain.handle('read-file-base64', async (event, filePath) => {
  try {
    const data = await fs.promises.readFile(filePath);
    const mime = filePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    return { success: true, base64: data.toString('base64'), mime };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
