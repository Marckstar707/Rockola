// Archivo preload.js básico
const { ipcRenderer } = require('electron');

// Exponer la API directamente en window cuando contextIsolation está deshabilitado
window.rockola = {
  getSongs: () => ipcRenderer.invoke('get-songs')
};

window.addEventListener('DOMContentLoaded', () => {
  console.log('🔧 Preload script cargado correctamente');
}); 