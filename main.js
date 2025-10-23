const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let win;

function createWindow () {
  win = new BrowserWindow({
    width: 1000,
    height: 700,
    fullscreen: true,
    autoHideMenuBar: true,
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
  // Eliminar completamente el menú de la aplicación
  Menu.setApplicationMenu(null);

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
    const total = files.length;
    console.log('Archivos encontrados:', total);

    // Notificar inicio de escaneo y preparar barra de progreso de la ventana (taskbar)
    if (win && win.webContents) {
      try { win.setProgressBar(0); } catch {}
      win.webContents.send('scan-start', { total, folderPath });
    }

    const supported = ['.mp3', '.wav', '.ogg', '.mp4', '.webm', '.avi', '.mov'];
    const videoExts = ['.mp4', '.webm', '.avi', '.mov'];
    const songFiles = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = path.extname(file).toLowerCase();
      if (supported.includes(ext)) {
        const absPath = path.join(folderPath, file);
        songFiles.push({
          title: file,
          src: absPath,
          type: videoExts.includes(ext) ? 'video' : 'audio'
        });
      }

      // Enviar progreso de escaneo de forma periódica
      const processed = i + 1;
      if (win && win.webContents && (processed === total || processed % 10 === 0)) {
        const progress = total > 0 ? processed / total : 1;
        win.webContents.send('scan-progress', { processed, total, progress });
        try { win.setProgressBar(progress); } catch {}
      }

      // Ceder el event loop para que la UI procese eventos
      await new Promise(resolve => setImmediate(resolve));
    }

    console.log('Canciones procesadas:', songFiles.length);

    const summary = {
      folderPath: folderPath,
      filesFound: total,
      songsProcessed: songFiles.length
    };

    // Notificar fin del escaneo
    if (win && win.webContents) {
      // Asegurar evento final al 100%
      try {
        win.webContents.send('scan-progress', { processed: total, total, progress: 1 });
      } catch {}
      try { win.setProgressBar(-1); } catch {}
      win.webContents.send('scan-complete', { total, songsProcessed: songFiles.length });
    }

    return { songs: songFiles, summary };
  } catch (error) {
    console.error('Error leyendo la carpeta de canciones:', error);
    return { songs: [], summary: null };
  }
});