const { app, BrowserWindow, ipcMain, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const nodeID3 = require('node-id3');

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
  if (process.platform === 'darwin') {
    try {
      const image = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
      app.dock.setIcon(image); // Set macOS Dock icon dynamically using NativeImage
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

// IPC Handler to write cover art to an MP3 file
ipcMain.handle('write-cover-art', async (event, { filePath, imageBase64 }) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File does not exist' };
    }

    const buffer = Buffer.from(imageBase64, 'base64');
    const tags = {
      image: {
        mime: 'image/jpeg',
        type: {
          id: 3, // front cover
          name: 'front cover'
        },
        description: 'Cover Art',
        imageBuffer: buffer
      }
    };

    // node-id3 update keeps existing tags and adds/updates the cover image frame
    const result = nodeID3.update(tags, filePath);
    
    if (result === true || result === undefined || typeof result === 'object') {
      return { success: true };
    } else if (result instanceof Error) {
      return { success: false, error: result.message };
    }
    
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

// IPC Handler to open OS file dialog for selecting music files (MP3 only)
ipcMain.handle('select-music-files', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'MP3 Audio Files', extensions: ['mp3'] }
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

    // Check if it's an MP3 and read cover art
    if (filePath.toLowerCase().endsWith('.mp3')) {
      const tags = nodeID3.read(filePath);
      if (tags && tags.image && tags.image.imageBuffer) {
        const mime = tags.image.mime || 'image/jpeg';
        info.existingCoverBase64 = `data:${mime};base64,${tags.image.imageBuffer.toString('base64')}`;
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
    const tags = nodeID3.read(filePath);
    if (tags) {
      delete tags.image;
      const result = nodeID3.write(tags, filePath);
      if (result === true || result === undefined || typeof result === 'object') {
        return { success: true };
      }
    }
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
