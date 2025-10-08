const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow () {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    fullscreen: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });
  
  // Cargar el archivo HTML
  win.loadFile('index.html');
  
  // Abrir DevTools automáticamente en desarrollo
  // win.webContents.openDevTools(); // Quitar para que no se abra la consola
  
  // Log cuando la ventana esté lista
  win.webContents.on('did-finish-load', () => {
    console.log('🚀 Ventana cargada correctamente');
  });
  
  // Log de errores
  win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.log('❌ Error cargando ventana:', errorDescription);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('get-songs', async () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));
  const folderPath = path.resolve(__dirname, config.songs_path);
  const files = await fs.promises.readdir(folderPath);
  // Filtrar solo archivos de audio y video comunes
  const supported = ['.mp3', '.wav', '.ogg', '.mp4', '.webm', '.avi', '.mov'];
  return files.filter(file => supported.includes(path.extname(file).toLowerCase())).map(file => {
    const absPath = path.join(folderPath, file);
    return {
      title: file,
      src: absPath,
      type: ['.mp4', '.webm', '.avi', '.mov'].includes(path.extname(file).toLowerCase()) ? 'video' : 'audio'
    }
  });
});