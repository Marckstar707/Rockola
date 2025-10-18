const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let win;

function createWindow () {
  win = new BrowserWindow({
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
    dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    }).then(result => {
      if (!result.canceled) {
        win.webContents.send('selected-folder', result.filePaths[0]);
      }
    }).catch(err => {
      console.log(err);
    });
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

ipcMain.handle('get-songs', async (event, folderPath) => {
  console.log('Ruta de carpeta recibida en main:', folderPath);
  try {
    const files = await fs.promises.readdir(folderPath);
    console.log('Archivos encontrados:', files.length);
    // Filtrar solo archivos de audio y video comunes
    const supported = ['.mp3', '.wav', '.ogg', '.mp4', '.webm', '.avi', '.mov'];
    const songFiles = files.filter(file => supported.includes(path.extname(file).toLowerCase())).map(file => {
      const absPath = path.join(folderPath, file);
      return {
        title: file,
        src: absPath,
        type: ['.mp4', '.webm', '.avi', '.mov'].includes(path.extname(file).toLowerCase()) ? 'video' : 'audio'
      }
    });
    console.log('Canciones procesadas:', songFiles.length);
    const summary = {
      folderPath: folderPath,
      filesFound: files.length,
      songsProcessed: songFiles.length
    };
    return { songs: songFiles, summary: summary };
  } catch (error) {
    console.error('Error leyendo la carpeta de canciones:', error);
    return { songs: [], summary: null };
  }
});