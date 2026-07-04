const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  writeCoverArt: (filePath, imageBase64) => ipcRenderer.invoke('write-cover-art', { filePath, imageBase64 }),
  validateFile: (filePath) => ipcRenderer.invoke('validate-file', filePath),
  selectMusicFiles: () => ipcRenderer.invoke('select-music-files'),
  selectImageFile: () => ipcRenderer.invoke('select-image-file'),
  getFileInfo: (filePath) => ipcRenderer.invoke('get-file-info', filePath),
  readFileBase64: (filePath) => ipcRenderer.invoke('read-file-base64', filePath),
  removeCoverArt: (filePath) => ipcRenderer.invoke('remove-cover-art', filePath),
  platform: process.platform,
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch (e) {
      console.error('Error in getPathForFile:', e);
      return file.path;
    }
  }
});
