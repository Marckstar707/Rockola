const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { remote } = require('electron');

// Helper: busca una ruta de archivo en varias ubicaciones y devuelve URL file:// si existe
function fileUrlFor(relativeSubPath) {
  const candidates = [];
  try { if (process && process.resourcesPath) candidates.push(path.join(process.resourcesPath, relativeSubPath)); } catch (e) {}
  try { if (process && process.execPath) candidates.push(path.join(path.dirname(process.execPath), relativeSubPath)); } catch (e) {}
  candidates.push(path.join(process.cwd(), relativeSubPath));
  candidates.push(path.join(__dirname, '..', relativeSubPath));
  // ruta legacy
  candidates.push(path.join('C:', 'Rockola_2025', relativeSubPath));

  for (const c of candidates) {
    try {
      if (c && fs.existsSync(c) && fs.statSync(c).isFile()) return pathToFileURL(c).href;
    } catch (e) {
      // ignore
    }
  }
  return null;
}

// Cargar canciones dinámicamente usando la API de preload.js

document.addEventListener('DOMContentLoaded', async () => {
  const loadingScreen = document.getElementById('loading-screen');
  const progressBar = document.getElementById('progress-bar');
  const loadingMessage = document.getElementById('loading-message');
  const container = document.getElementById('container');

  ipcRenderer.on('selected-folder', async (event, folderPath) => {
    console.log('Ruta de carpeta recibida en renderer:', folderPath);
    loadingMessage.textContent = `Escaneando ${folderPath}...`;

    // Escuchar progreso en tiempo real desde el proceso principal
    const percentEl = document.getElementById('progress-percent');
    const onScanStart = (e, { total, folderPath }) => {
      progressBar.style.width = '0%';
      if (percentEl) percentEl.textContent = '0%';
      loadingMessage.textContent = `Escaneando ${total} archivos en ${folderPath}...`;
    };
    const onScanProgress = (e, { processed, total, progress }) => {
      const pct = Math.max(0, Math.min(100, Math.floor((progress || (total ? processed / total : 1)) * 100)));
      progressBar.style.width = `${pct}%`;
      if (percentEl) percentEl.textContent = `${pct}%`;
      loadingMessage.textContent = `Escaneando... ${processed}/${total}`;
    };
    const onScanComplete = () => {
      // Mantener manejador por si queremos hacer algo extra
    };

    ipcRenderer.on('scan-start', onScanStart);
    ipcRenderer.on('scan-progress', onScanProgress);
    ipcRenderer.on('scan-complete', onScanComplete);

  const { songs, summary } = await window.rockola.getSongs(folderPath);
  console.log('Canciones recibidas en renderer:', songs);

  // Forzar visualmente el 100% y dar tiempo a la transición antes de ocultar
  progressBar.style.width = '100%';
  if (percentEl) percentEl.textContent = '100%';
  await new Promise(r => setTimeout(r, 300));
  loadingScreen.style.display = 'none';
  container.style.display = 'flex';
    if (summary) {
      showSummaryModal(summary);
    }
    initializeRockola(songs);

    // Limpiar listeners para evitar duplicados si se selecciona otra carpeta
    ipcRenderer.removeListener('scan-start', onScanStart);
    ipcRenderer.removeListener('scan-progress', onScanProgress);
    ipcRenderer.removeListener('scan-complete', onScanComplete);
  });

  function showSummaryModal(summary) {
    const modal = document.getElementById('summary-modal');
    const summaryText = document.getElementById('summary-text');
    summaryText.innerHTML = `Ruta: ${summary.folderPath}<br>Archivos encontrados: ${summary.filesFound}<br>Canciones procesadas: ${summary.songsProcessed}`;
    modal.style.display = 'flex';
    setTimeout(() => {
      modal.style.display = 'none';
    }, 5000);
  }

  async function initializeRockola(songs) {
  const previewTitle = document.getElementById('preview-title');
  const videoPreview = document.getElementById('video-preview');
  const videoFrame = document.getElementById('video-frame');
  const audioPreview = document.getElementById('audio-preview');
  const queueList = document.getElementById('queue-list');
  const queueCount = document.getElementById('queue-count');

  // Crear video para pantalla completa sin controles
  const fullscreenVideo = document.createElement('video');
  fullscreenVideo.style.position = 'fixed';
  fullscreenVideo.style.top = '0';
  fullscreenVideo.style.left = '0';
  fullscreenVideo.style.width = '100vw';
  fullscreenVideo.style.height = '100vh';
  fullscreenVideo.style.margin = '0';
  fullscreenVideo.style.padding = '0';
  fullscreenVideo.style.objectFit = 'contain';
  fullscreenVideo.style.zIndex = '9999';
  fullscreenVideo.style.display = 'none';
  fullscreenVideo.style.backgroundColor = '#000';
  fullscreenVideo.controls = false; // Deshabilitar controles nativos
  fullscreenVideo.disablePictureInPicture = true; // Deshabilitar PiP
  fullscreenVideo.disableRemotePlayback = true; // Deshabilitar reproducción remota
  fullscreenVideo.setAttribute('controlsList', 'nodownload nofullscreen noremoteplayback'); // Ocultar botón fullscreen nativo
  document.body.appendChild(fullscreenVideo);

  // Controles custom de fullscreen (barra de progreso que aparece con el mouse)
  let fsControls, fsSeek, fsTime, fsHideTimer, isScrubbing = false;
  function formatTime(sec) {
    if (!isFinite(sec)) return '00:00';
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    const m = Math.floor((sec / 60) % 60).toString().padStart(2, '0');
    const h = Math.floor(sec / 3600);
    return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
  }
  function createFsControls() {
    fsControls = document.createElement('div');
    fsControls.style.position = 'fixed';
    fsControls.style.left = '50%';
    fsControls.style.transform = 'translateX(-50%)';
    fsControls.style.bottom = '5vh';
    fsControls.style.width = '70vw';
    fsControls.style.maxWidth = '1100px';
    fsControls.style.display = 'none';
    fsControls.style.alignItems = 'center';
    fsControls.style.gap = '14px';
    fsControls.style.padding = '12px 16px';
    fsControls.style.borderRadius = '14px';
    fsControls.style.background = 'rgba(15,15,15,0.65)';
    fsControls.style.backdropFilter = 'blur(10px)';
    fsControls.style.border = '1px solid rgba(255,255,255,0.15)';
    fsControls.style.boxShadow = '0 6px 20px rgba(0,0,0,0.35)';
    fsControls.style.zIndex = '11500';
    fsControls.style.transition = 'opacity 0.25s ease';
    fsControls.style.opacity = '0';

    fsTime = document.createElement('div');
    fsTime.style.minWidth = '120px';
    fsTime.style.fontFamily = 'Segoe UI, Arial, sans-serif';
    fsTime.style.fontWeight = '600';
    fsTime.style.fontSize = '14px';
    fsTime.style.color = '#fff';
    fsTime.style.textShadow = '0 1px 2px rgba(0,0,0,0.6)';
    fsTime.textContent = '00:00 / 00:00';

    fsSeek = document.createElement('input');
    fsSeek.type = 'range';
    fsSeek.min = '0';
    fsSeek.max = '1000';
    fsSeek.value = '0';
    fsSeek.style.flex = '1';
    fsSeek.style.cursor = 'pointer';
    fsSeek.style.webkitAppearance = 'none';
    fsSeek.style.height = '6px';
    fsSeek.style.borderRadius = '6px';
    fsSeek.style.background = 'linear-gradient(90deg, #4ecdc4, #45b7d1)';
    fsSeek.style.outline = 'none';
    fsSeek.addEventListener('pointerdown', () => { isScrubbing = true; });
    fsSeek.addEventListener('pointerup', () => { isScrubbing = false; });
    fsSeek.addEventListener('change', () => {
      if (!fullscreenVideo.duration) return;
      const ratio = Number(fsSeek.value) / 1000;
      fullscreenVideo.currentTime = ratio * fullscreenVideo.duration;
    });
    fsSeek.addEventListener('input', () => {
      // Seek en vivo mientras arrastra
      if (!fullscreenVideo.duration) return;
      const ratio = Number(fsSeek.value) / 1000;
      fullscreenVideo.currentTime = ratio * fullscreenVideo.duration;
      fsTime.textContent = `${formatTime(fullscreenVideo.currentTime)} / ${formatTime(fullscreenVideo.duration)}`;
    });

    fsControls.appendChild(fsTime);
    fsControls.appendChild(fsSeek);
    document.body.appendChild(fsControls);
  }
  createFsControls();

  function showFsControls() {
    if (fullscreenVideo.style.display === 'none') return;
    // No mostrar si el selector de fullscreen está abierto (si existe)
    const selectorVisible = (typeof fullscreenSelector !== 'undefined') && fullscreenSelector && fullscreenSelector.style && fullscreenSelector.style.display !== 'none';
    if (selectorVisible) return;
    fsControls.style.display = 'flex';
    requestAnimationFrame(() => { fsControls.style.opacity = '1'; });
    if (fsHideTimer) clearTimeout(fsHideTimer);
    fsHideTimer = setTimeout(hideFsControls, 5000);
  }
  function hideFsControls() {
    fsControls.style.opacity = '0';
    setTimeout(() => {
      fsControls.style.display = 'none';
    }, 250);
  }

  // Mostrar barra al mover el mouse durante fullscreen
  document.addEventListener('mousemove', () => {
    if (fullscreenVideo.style.display !== 'none') {
      showFsControls();
    }
  });

  // Sincronizar slider y tiempos con el video
  function syncFsControls() {
    if (!fullscreenVideo.duration) return;
    if (!isScrubbing && fsSeek) {
      fsSeek.value = String(Math.floor((fullscreenVideo.currentTime / fullscreenVideo.duration) * 1000));
    }
    if (fsTime) {
      fsTime.textContent = `${formatTime(fullscreenVideo.currentTime)} / ${formatTime(fullscreenVideo.duration)}`;
    }
  }
  fullscreenVideo.addEventListener('loadedmetadata', syncFsControls);
  fullscreenVideo.addEventListener('timeupdate', syncFsControls);

  // Crear ventana transparente para selección en fullscreen
  const fullscreenSelector = document.createElement('div');
  fullscreenSelector.style.position = 'fixed';
  fullscreenSelector.style.left = '0';
  fullscreenSelector.style.right = '0';
  fullscreenSelector.style.bottom = '0';
  fullscreenSelector.style.width = '100vw';
  fullscreenSelector.style.height = '40vh';
  fullscreenSelector.style.background = 'rgba(20, 20, 20, 0.55)';
  fullscreenSelector.style.borderTop = '2px solid rgba(255, 255, 255, 0.18)';
  fullscreenSelector.style.borderRadius = '32px 32px 0 0';
  fullscreenSelector.style.zIndex = '10000';
  fullscreenSelector.style.display = 'none';
  fullscreenSelector.style.overflowY = 'auto';
  fullscreenSelector.style.backdropFilter = 'blur(24px)';
  fullscreenSelector.style.boxShadow = '0 -8px 32px rgba(0,0,0,0.35)';
  fullscreenSelector.style.padding = '0';
  fullscreenSelector.style.transition = 'opacity 0.3s';
  fullscreenSelector.style.opacity = '0';
  document.body.appendChild(fullscreenSelector);

  // Crear contador visual de cola
  const queueCounter = document.createElement('div');
  queueCounter.style.position = 'fixed';
  queueCounter.style.top = '30px';
  queueCounter.style.right = '40px';
  queueCounter.style.zIndex = '11000';
  queueCounter.style.background = 'rgba(30,30,30,0.85)';
  queueCounter.style.color = '#fff';
  queueCounter.style.padding = '12px 22px';
  queueCounter.style.borderRadius = '30px';
  queueCounter.style.boxShadow = '0 4px 16px rgba(0,0,0,0.25)';
  queueCounter.style.fontSize = '1.3em';
  queueCounter.style.display = 'none';
  queueCounter.style.alignItems = 'center';
  queueCounter.style.gap = '10px';
  queueCounter.style.fontWeight = 'bold';
  queueCounter.innerHTML = '';
  document.body.appendChild(queueCounter);

  function updateQueueCounter() {
    // Calcular el número real de videos en espera
    let videosEnEspera = queue.length;
    
    // Si hay un nextVideo activo (después de una transición DJ), no contarlo como en espera
    if (nextVideo && nextVideo.style.display !== 'none' && nextVideo.style.opacity === '1') {
      videosEnEspera = Math.max(0, videosEnEspera - 1);
    }
    
    // Mostrar el contador siempre que haya canciones en espera, sin depender de isFullscreen
    if (videosEnEspera > 0) {
      queueCounter.innerHTML = `<span style="font-size:1.4em;vertical-align:middle;">🎵</span> <span style="margin-left:8px;">En espera: <b>${videosEnEspera}</b></span>`;
      queueCounter.style.display = 'flex';
    } else {
      queueCounter.style.display = 'none';
    }
    
    console.log('🔢 Contador actualizado - Videos en espera:', videosEnEspera, 'Cola total:', queue.length); // Debug
  }



  // Sanitize song titles
  songs.forEach(song => {
    song.title = song.title
      .toUpperCase()
      .replace(/[^A-Z0-9\s-]/g, '') // Keep uppercase letters, numbers, spaces, and hyphens
      .replace(/\s+/g, ' ') // Collapse multiple spaces into one
      .trim(); // Remove leading/trailing spaces
  });

  let selectedIdx = 0;
  let songDivs = [];
  let audioPreviewTimeout = null;
  let videoPreviewTimeout = null; // Nuevo timeout para el video
  let fadeOutInterval = null;
  let queue = [];
  let isPlaying = false;
  let isFullscreen = false;
  let fullscreenSelectedIdx = 0;
  let fullscreenSongDivs = []; // Array para los divs de canciones en pantalla completa
  let autoHideTimeout = null;
  let hasPlayedEndDrop = false;

  function renderFullscreenSongList() {
    const list = document.createElement('div');
    list.style.maxHeight = '30vh';
    list.style.overflow = 'hidden';
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.alignItems = 'flex-start';
    list.style.paddingBottom = '0';

    songs.forEach((song, idx) => {
      const div = document.createElement('div');
      div.style.padding = '10px 24px';
      div.style.cursor = 'pointer';
      div.style.fontSize = '1.1em';
      div.style.display = 'flex';
      div.style.alignItems = 'center';
      div.style.transition = 'background-color 0.2s, color 0.2s, box-shadow 0.2s';
      div.style.color = '#fff';
      div.style.margin = '4px 0';
      div.style.width = '100%';
      div.style.textAlign = 'left';
      div.style.paddingLeft = '32px';
      div.style.borderRadius = '12px';
      div.style.background = 'rgba(255,255,255,0.07)';
      div.style.justifyContent = 'flex-start';

      const icon = document.createElement('span');
      icon.style.fontSize = '1.3em';
      icon.style.marginRight = '12px';
      icon.style.display = 'none';
      icon.textContent = '🎵';

      const title = document.createElement('span');
      title.textContent = song.title;

      div.appendChild(icon);
      div.appendChild(title);

      list.appendChild(div);
      fullscreenSongDivs.push(div);
    });

    const title = document.createElement('div');
    title.style.padding = '18px 0 10px 32px';
    title.style.borderBottom = '1px solid rgba(255, 255, 255, 0.13)';
    title.style.fontWeight = 'bold';
    title.style.textAlign = 'left';
    title.style.paddingLeft = '32px';
    title.style.color = '#fff';
    title.style.fontSize = '1.4em';
    title.innerHTML = 'Selecciona la siguiente canción';
    fullscreenSelector.appendChild(title);
    fullscreenSelector.appendChild(list);
  }

  function updateFullscreenSelection(newIdx, behavior = 'auto') {
    const oldIdx = fullscreenSelectedIdx;
    fullscreenSelectedIdx = newIdx;

    // Mantener sincronizada la selección principal
    selectedIdx = newIdx;

    if (oldIdx > -1 && fullscreenSongDivs[oldIdx]) {
      const oldDiv = fullscreenSongDivs[oldIdx];
      oldDiv.style.background = 'rgba(255,255,255,0.07)';
      oldDiv.style.color = '#fff';
      oldDiv.style.boxShadow = 'none';
      oldDiv.children[0].style.display = 'none';
    }

    if (fullscreenSongDivs[fullscreenSelectedIdx]) {
      const newDiv = fullscreenSongDivs[fullscreenSelectedIdx];
      newDiv.style.background = 'rgba(0, 120, 215, 0.85)';
      newDiv.style.color = '#fff';
      newDiv.style.boxShadow = '0 2px 8px rgba(0,120,215,0.10)';
      newDiv.children[0].style.display = 'inline-block';
      newDiv.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }
  }

  function showFullscreenSelector() {
    if (!isFullscreen) return;

    if (autoHideTimeout) {
      clearTimeout(autoHideTimeout);
    }

    fullscreenSelector.style.display = 'block';
    setTimeout(() => { fullscreenSelector.style.opacity = '1'; }, 10);

    // Abrir el selector en la misma posición que el menú principal
    if (songs.length > 0) {
      fullscreenSelectedIdx = selectedIdx;
      updateFullscreenSelection(selectedIdx, 'auto');
    }

    autoHideTimeout = setTimeout(() => {
      hideFullscreenSelector();
    }, 5000);
  }

  renderFullscreenSongList();
  let currentAlphabeticalGroup = 0;
  let alphabeticalGroups = [];
  let djMode = false; // Modo DJ activo
  let nextAudio = null; // Audio de la siguiente canción para transición
  let nextVideo = null; // Video de la siguiente canción para transición
  let transitionDuration = 4000; // 4 segundos de transición
  let transitionStartTime = 0; // Tiempo de inicio de transición

  function groupSongsAlphabetically() {
    const groups = {};
    songs.forEach(song => {
      const firstLetter = song.title.charAt(0).toUpperCase();
      if (!groups[firstLetter]) {
        groups[firstLetter] = [];
      }
      groups[firstLetter].push(song);
    });
    return Object.keys(groups).sort().map(letter => ({
      letter,
      songs: groups[letter]
    }));
  }

  function showAlphabeticalIndicator(letter) {
    const indicator = document.createElement('div');
    indicator.style.position = 'fixed';
    indicator.style.bottom = '120px';
    indicator.style.right = '40px';
    indicator.style.zIndex = '12000';
    indicator.style.background = 'rgba(0, 120, 215, 0.9)';
    indicator.style.color = '#fff';
    indicator.style.padding = '16px 24px';
    indicator.style.borderRadius = '16px';
    indicator.style.fontSize = '2.2em';
    indicator.style.fontWeight = 'bold';
    indicator.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)';
    indicator.style.backdropFilter = 'blur(10px)';
    indicator.style.border = '2px solid rgba(255,255,255,0.2)';
    indicator.style.transform = 'translateX(100px)';
    indicator.style.transition = 'transform 0.3s ease-out';
    indicator.textContent = letter;
    document.body.appendChild(indicator);

    // Animación de entrada
    setTimeout(() => {
      indicator.style.transform = 'translateX(0)';
    }, 10);

    // Animación de salida
    setTimeout(() => {
      indicator.style.transform = 'translateX(100px)';
      setTimeout(() => {
        if (document.body.contains(indicator)) {
          document.body.removeChild(indicator);
        }
      }, 300);
    }, 1000);
  }

  function navigateAlphabetically(direction) {
    if (alphabeticalGroups.length === 0) {
      alphabeticalGroups = groupSongsAlphabetically();
    }

    if (direction === 'next') {
      currentAlphabeticalGroup = (currentAlphabeticalGroup + 1) % alphabeticalGroups.length;
    } else {
      currentAlphabeticalGroup = (currentAlphabeticalGroup - 1 + alphabeticalGroups.length) % alphabeticalGroups.length;
    }

    const currentGroup = alphabeticalGroups[currentAlphabeticalGroup];
    const firstSongInGroup = songs.findIndex(song => song.title.charAt(0).toUpperCase() === currentGroup.letter);
    
    if (firstSongInGroup !== -1) {
      if (isFullscreen) {
        showFullscreenSelector();
        updateFullscreenSelection(firstSongInGroup, 'auto');
      } else {
        updateSelection(firstSongInGroup);
      }
    }

    showAlphabeticalIndicator(currentGroup.letter);
  }

  function updateQueueDisplay() {
    queueCount.textContent = queue.length;
    queueList.innerHTML = '';
    queue.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = 'queue-item';
      div.textContent = `${index + 1}. ${item.title}`;
      queueList.appendChild(div);
    });
    updateQueueCounter();
  }

  function updateSelection(newIdx) {
    selectedIdx = newIdx;
    previewSong(selectedIdx);
  }

  function hideFullscreenSelector() {
    fullscreenSelector.style.opacity = '0';
    setTimeout(() => { 
      fullscreenSelector.style.display = 'none'; 
      // Limpiar estilos de selección en la lista fullscreen para evitar residuos
      if (fullscreenSongDivs && fullscreenSongDivs.length) {
        fullscreenSongDivs.forEach(div => {
          if (!div) return;
          div.style.background = 'rgba(255,255,255,0.07)';
          div.style.color = '#fff';
          div.style.boxShadow = 'none';
          if (div.children && div.children[0]) {
            div.children[0].style.display = 'none';
          }
        });
      }
    }, 300);
    if (autoHideTimeout) {
      clearTimeout(autoHideTimeout);
      autoHideTimeout = null;
    }
  }

  function createDJTransition(currentSong, nextSong) {
    console.log('🎬 Iniciando transición DJ para:', currentSong.type, '->', nextSong.type); // Debug
    
    // Crear elemento de audio para la siguiente canción
    nextAudio = document.createElement('audio');
    nextAudio.src = nextSong.src;
    nextAudio.volume = 0;
    nextAudio.currentTime = 0;
    nextAudio.preload = 'auto';
    nextAudio.muted = false;
    document.body.appendChild(nextAudio);

    // Crear elemento de video para la siguiente canción (si es video)
    if (nextSong.type === 'video') {
      nextVideo = document.createElement('video');
      nextVideo.src = nextSong.src;
      nextVideo.currentTime = 0;
      nextVideo.volume = 0;
      nextVideo.style.position = 'fixed';
      nextVideo.style.top = '0';
      nextVideo.style.left = '0';
      nextVideo.style.width = '100vw';
      nextVideo.style.height = '100vh';
      nextVideo.style.zIndex = '9998'; // Debajo del video actual
      nextVideo.style.backgroundColor = '#000';
      nextVideo.style.opacity = '0';
      nextVideo.style.transition = 'none'; // Sin transición CSS para evitar cortes
      nextVideo.style.pointerEvents = 'none';
      nextVideo.style.objectFit = 'contain';
      nextVideo.muted = false;
      nextVideo.autoplay = true;
      nextVideo.loop = false;
      nextVideo.preload = 'auto';
      nextVideo.playsInline = true;
      nextVideo.crossOrigin = 'anonymous'; // Evitar problemas de CORS
      document.body.appendChild(nextVideo);
      
      console.log('🎥 Video de transición creado:', nextVideo); // Debug
      
      // Precargar y reproducir inmediatamente
      nextVideo.onloadedmetadata = () => {
        console.log('🎥 Video siguiente metadata cargada, iniciando reproducción'); // Debug
        nextVideo.play().catch(e => console.log('Error reproduciendo video:', e));
      };
      
      nextVideo.oncanplay = () => {
        console.log('🎥 Video siguiente listo para reproducir'); // Debug
        if (nextVideo.paused) {
          nextVideo.play().catch(e => console.log('Error reproduciendo video:', e));
        }
      };
      
      nextVideo.onplay = () => {
        console.log('🎥 Video siguiente reproduciéndose'); // Debug
      };
      
      nextVideo.onerror = (e) => {
        console.log('❌ Error en video siguiente:', e); // Debug
      };
      
      // Intentar reproducir inmediatamente sin delay
      nextVideo.play().catch(e => console.log('Error reproduciendo video:', e));
    }

    // Iniciar la siguiente canción inmediatamente (como DJ real)
    nextAudio.play().catch(e => console.log('Error reproduciendo audio:', e));

    // Transición DJ profesional con requestAnimationFrame para máxima fluidez
    const startTime = performance.now();
    transitionStartTime = startTime;

    function djCrossfade() {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / transitionDuration, 1);
      
      // Curva de transición suave (ease-in-out)
      const easeProgress = progress < 0.5 
        ? 2 * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      if (currentSong.type === 'video') {
        // Transición para video (visual + audio) - sin logs para mejor rendimiento
        if (isFullscreen && fullscreenVideo.style.display !== 'none') {
          fullscreenVideo.volume = Math.max(0, 1 - easeProgress);
          fullscreenVideo.style.opacity = Math.max(0, 1 - easeProgress);
        } else if (videoPreview.style.display !== 'none') {
          videoPreview.volume = Math.max(0, 1 - easeProgress);
          videoPreview.style.opacity = Math.max(0, 1 - easeProgress);
        }
        
        if (nextVideo) {
          nextVideo.volume = Math.min(1, easeProgress);
          nextVideo.style.opacity = Math.min(1, easeProgress);
        }
        nextAudio.volume = Math.min(1, easeProgress);
      } else {
        // Transición para audio
        audioPreview.volume = Math.max(0, 1 - easeProgress);
        nextAudio.volume = Math.min(1, easeProgress);
      }

      if (progress < 1) {
        requestAnimationFrame(djCrossfade);
      } else {
        // Transición completada
        console.log('✅ Transición DJ completada'); // Debug
        completeDJTransition(nextSong);
      }
    }

    // Iniciar transición inmediatamente
    requestAnimationFrame(djCrossfade);
  }

  function completeDJTransition(nextSong) {
    console.log('🎯 Completando transición DJ para:', nextSong.title); // Debug
    
    // Limpiar solo el audio de transición
    if (nextAudio) {
      nextAudio.pause();
      if (document.body.contains(nextAudio)) {
        document.body.removeChild(nextAudio);
      }
      nextAudio = null;
    }

    // Cambiar a la siguiente canción
    if (nextSong.type === 'video') {
      console.log('🎥 Cambiando a video siguiente:', nextSong.title); // Debug
      
      if (isFullscreen) {
        if (nextVideo) {
          nextVideo.style.zIndex = '9999';
          nextVideo.style.opacity = '1';
          nextVideo.style.transition = 'none';
          nextVideo.style.volume = '1';
          fullscreenVideo.style.display = 'none';
          fullscreenVideo.pause();
        }
      } else {
        if (nextVideo) {
          nextVideo.style.zIndex = '9999';
          nextVideo.style.opacity = '1';
          nextVideo.style.transition = 'none';
          nextVideo.style.volume = '1';
          videoPreview.style.display = 'none';
          if (videoFrame) { videoFrame.style.display = 'none'; videoFrame.classList.remove('is-playing'); }
          videoPreview.pause();
        }
      }
      
      // IMPORTANTE: Remover el video actual de la cola después de la transición
      if (queue.length > 0) {
        queue.shift(); // Remover el video que ya terminó
        console.log('🔄 Video anterior removido de la cola después de transición DJ'); // Debug
      }
      
      // IMPORTANTE: Actualizar la cola después de la transición
      updateQueueDisplay();
      updateQueueCounter();
    } else {
      console.log('🎵 Cambiando a audio siguiente:', nextSong.title); // Debug
      audioPreview.src = nextSong.src;
      audioPreview.currentTime = 0; // Empezar desde el inicio
      audioPreview.volume = 1;
      audioPreview.play().catch(e => console.log('Error reproduciendo audio final:', e));
    }
    
    // Reiniciar flags y estado temporal de DJ para que el flujo quede listo para nuevas transiciones
    djMode = false;
    hasJumpedToDJ = false;
    transitionStartTime = 0;
    // El sistema queda listo para nuevas canciones y transiciones DJ
    updateQueueDisplay();
    updateQueueCounter();
  }

  function startDJTransition() {
    console.log('🎯 startDJTransition llamada - Cola completa:', queue); // Debug completo
    console.log('🎯 Longitud de cola:', queue.length); // Debug
    
    if (queue.length === 0 || nextAudio) {
      console.log('No se puede iniciar transición - cola vacía o ya en transición'); // Debug
      return; // Evitar múltiples transiciones
    }

    const currentSong = queue[0];
    const nextSong = queue[1];
    
    console.log('🎯 Canción actual:', currentSong); // Debug
    console.log('🎯 Siguiente canción:', nextSong); // Debug

    if (nextSong) {
      console.log('🎤 Creando transición DJ entre:', currentSong.title, 'y', nextSong.title); // Debug
      createDJTransition(currentSong, nextSong);
    } else if (queue.length >= 1) {
      // Si solo hay 1 video en la cola, crear una transición con el mismo video
      console.log('🎤 Creando transición DJ para video único:', currentSong.title); // Debug
      createDJTransition(currentSong, currentSong);
    } else {
      console.log('No hay siguiente canción en la cola'); // Debug
    }
  }

  function checkForDJTransition() {
    // DJ transition feature disabled by user request.
  }

  // Función de prueba para verificar transición visual
  function testVideoTransition() {
    console.log('🧪 Probando transición visual...'); // Debug
    
    if (queue.length < 1) {
      console.log('❌ Necesitas al menos 1 video en la cola para probar'); // Debug
      return;
    }
    
    const currentSong = queue[0];
    const nextSong = queue[1];
    
    if (currentSong.type === 'video' && nextSong && nextSong.type === 'video') {
      console.log('🎬 Iniciando prueba de transición entre videos'); // Debug
      createDJTransition(currentSong, nextSong);
    } else if (currentSong.type === 'video') {
      console.log('🎬 Iniciando prueba de transición para video único'); // Debug
      // Crear una transición con el video actual (para prueba)
      createDJTransition(currentSong, currentSong);
    } else {
      console.log('❌ Necesitas videos en la cola para probar'); // Debug
    }
  }
  
  // Función para verificar el estado de la cola
  function checkQueueStatus() {
    console.log('🔍 VERIFICANDO ESTADO DE LA COLA:');
    console.log('🔍 Cola completa:', queue);
    console.log('🔍 Longitud de cola:', queue.length);
    console.log('🔍 Canción actual:', queue[0]);
    console.log('🔍 Siguiente canción:', queue[1]);
    console.log('🔍 Modo DJ:', djMode);
    console.log('🔍 nextAudio:', nextAudio);
    console.log('🔍 isPlaying:', isPlaying);
    console.log('🔍 isFullscreen:', isFullscreen);
    console.log('🔍 nextVideo existe:', !!nextVideo);
    if (nextVideo) {
      console.log('🔍 nextVideo display:', nextVideo.style.display);
      console.log('🔍 nextVideo opacity:', nextVideo.style.opacity);
      console.log('🔍 nextVideo currentTime:', nextVideo.currentTime);
      console.log('🔍 nextVideo duration:', nextVideo.duration);
    }
  }
  
  // Eliminar función createTestButtons y sus llamadas
  // Ya no se crean botones de prueba ni se abre la consola

  // Crear botones cuando el DOM esté listo
  // Ya no se crean botones de prueba ni se abre la consola
  
  console.log('🚀 Script renderer.js cargado correctamente'); // Debug

  // Initialize song navigation without visible list
  songs.forEach((song, idx) => {
    songDivs.push(null); // Keep array structure for navigation
  });

  // Visualizador de audio tipo onda RGB de extremo a extremo
  let audioCtx, analyser, animationId;
  const sourceNodeMap = new WeakMap();
  function startVisualizer(mediaElement) {
    const canvas = document.getElementById('audio-visualizer');
    canvas.width = window.innerWidth;
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (analyser) analyser.disconnect();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    let sourceNode = sourceNodeMap.get(mediaElement);
    if (!sourceNode) {
      sourceNode = audioCtx.createMediaElementSource(mediaElement);
      sourceNodeMap.set(mediaElement, sourceNode);
    }
    sourceNode.disconnect();
    sourceNode.connect(analyser);
    analyser.connect(audioCtx.destination);
    function draw() {
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const center = Math.floor(canvas.width / 2);
      const barCount = bufferLength;
      const barWidth = (canvas.width / barCount);
      for (let i = 0; i < barCount / 2; i++) {
        const value = dataArray[i];
        const percent = value / 255;
        const barHeight = percent * canvas.height * 0.95;
        // Efecto arcoíris RGB centrado
        const hue = Math.round((i / (barCount / 2)) * 360 + (Date.now()/20) % 360);
        ctx.fillStyle = `hsl(${hue}, 90%, 55%)`;
        // Izquierda del centro
        ctx.fillRect(center - (i + 1) * barWidth, canvas.height - barHeight, barWidth * 0.8, barHeight);
        // Derecha del centro
        ctx.fillRect(center + i * barWidth, canvas.height - barHeight, barWidth * 0.8, barHeight);
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 12;
      }
      animationId = requestAnimationFrame(draw);
    }
    draw();
    window.addEventListener('resize', resizeVisualizer, false);
    function resizeVisualizer() {
      canvas.width = window.innerWidth;
      canvas.height = 140;
    }
  }
  function stopVisualizer() {
    const canvas = document.getElementById('audio-visualizer');
    if (canvas) canvas.style.display = 'none';
    if (animationId) cancelAnimationFrame(animationId);
    if (analyser) analyser.disconnect();
  }
  // Modifico previewSong para activar el visualizador solo cuando hay preview
  function previewSong(idx) {
    const song = songs[idx];
    const previewTitle = document.getElementById('preview-title');
    const videoPreview = document.getElementById('video-preview');
    const audioPreview = document.getElementById('audio-preview');
    stopVisualizer();
    
    if (song.type === 'video' || song.type === 'audio') {
      previewTitle.style.display = 'none';
    } else {
      previewTitle.style.display = 'block';
      previewTitle.textContent = song.title;
    }

    // Limpiar timeouts y detener medios anteriores
    clearTimeout(audioPreviewTimeout);
    clearTimeout(videoPreviewTimeout);
    if (fadeOutInterval) clearInterval(fadeOutInterval);
  videoPreview.pause();
    audioPreview.pause();
  videoPreview.currentTime = 0;
    audioPreview.currentTime = 0;
  if (videoFrame) { videoFrame.style.display = 'none'; videoFrame.classList.remove('is-playing'); }
  videoPreview.style.display = 'none';
    audioPreview.style.display = 'none';
    videoPreview.volume = 1;
    videoPreview.muted = false;
    audioPreview.volume = 1;

    function audioFadeOut(mediaElement) {
      let currentVolume = mediaElement.volume;
      fadeOutInterval = setInterval(() => {
        if (currentVolume > 0.05) {
          currentVolume -= 0.05;
          mediaElement.volume = Math.max(0, currentVolume);
        } else {
          mediaElement.volume = 0;
          clearInterval(fadeOutInterval);
        }
      }, 250);
    }

    if (song.type === 'video') {
      videoPreview.src = song.src;
      if (videoFrame) { videoFrame.style.display = 'flex'; videoFrame.classList.add('is-playing'); }
      videoPreview.style.display = 'block';
      audioPreview.style.display = 'none';
      videoPreview.play();
      startVisualizer(videoPreview);

      // Iniciar desvanecimiento de audio a los 15 segundos
      audioPreviewTimeout = setTimeout(() => {
        audioFadeOut(videoPreview);
      }, 15000);

      // Avanzar a la siguiente canción después de 35 segundos
      videoPreviewTimeout = setTimeout(() => {
        updateSelection((idx + 1) % songs.length);
      }, 35000);

    } else if (song.type === 'audio') {
      audioPreview.src = song.src;
      audioPreview.style.display = 'block';
      if (videoFrame) { videoFrame.style.display = 'none'; videoFrame.classList.remove('is-playing'); }
      videoPreview.style.display = 'none';
      audioPreview.play();
      startVisualizer(audioPreview);

      // Iniciar desvanecimiento a los 15 segundos
      audioPreviewTimeout = setTimeout(() => {
        audioFadeOut(audioPreview);
      }, 15000);

      // Avanzar a la siguiente canción después de 20 segundos
      videoPreviewTimeout = setTimeout(() => {
        updateSelection((idx + 1) % songs.length);
      }, 20000);
    }
  }

  function addToQueue(idx) {
    const song = songs[idx];
    queue.push({ ...song, originalIndex: idx });
    updateQueueDisplay();

    if (!isPlaying) {
      playNextInQueue();
    }
  }

  // Flag para saber si ya se saltó a los últimos 15 segundos
  let hasJumpedToDJ = false;

  function resetDJJumpFlag() {
    hasJumpedToDJ = false;
  }

  function resetToInitialState() {
    queue = [];
    isPlaying = false;
    isFullscreen = false;
    djMode = false;
    hasJumpedToDJ = false;
    if (fullscreenVideo) {
      fullscreenVideo.pause();
      fullscreenVideo.currentTime = 0;
      fullscreenVideo.style.display = 'none';
      fullscreenVideo.muted = false;
      fullscreenVideo.volume = 1;
    }
    if (videoPreview) {
      videoPreview.pause();
      videoPreview.currentTime = 0;
      videoPreview.style.display = 'none';
      videoPreview.muted = false;
      videoPreview.volume = 1;
    }
    if (audioPreview) {
      audioPreview.pause();
      audioPreview.currentTime = 0;
      audioPreview.style.display = 'none';
      audioPreview.muted = false;
      audioPreview.volume = 1;
    }
    if (nextVideo) {
      nextVideo.pause();
      if (document.body.contains(nextVideo)) {
        document.body.removeChild(nextVideo);
      }
      nextVideo = null;
    }
    if (nextAudio) {
      nextAudio.pause();
      if (document.body.contains(nextAudio)) {
        document.body.removeChild(nextAudio);
      }
      nextAudio = null;
    }
    hideFullscreenSelector();
    updateQueueDisplay();
    updateQueueCounter();
  }

  // --- CORRECCIÓN: Manejo centralizado de Escape y listeners de nextVideo ---
  // Definir handler único para nextVideo
  // Eliminar cualquier nextVideo.addEventListener('keydown', ...) y la función handleNextVideoKeydown

  function playNextInQueue() {
    if (queue.length === 0) {
      isPlaying = false;
      isFullscreen = false;
      fullscreenVideo.pause();
      fullscreenVideo.style.display = 'none';
      fullscreenVideo.src = '';
      updateSelection(selectedIdx);
      return;
    }

    isPlaying = true;
    isFullscreen = true;
    hasPlayedEndDrop = false;
    const song = queue.shift();
    updateQueueDisplay();

    // Stop preview
    clearTimeout(videoPreviewTimeout);
    clearTimeout(audioPreviewTimeout);
  videoPreview.pause();
    audioPreview.pause();
  videoPreview.style.display = 'none';
  if (videoFrame) { videoFrame.style.display = 'none'; videoFrame.classList.remove('is-playing'); }
    audioPreview.style.display = 'none';

    if (song.type === 'video') {
        fullscreenVideo.src = song.src;
        fullscreenVideo.currentTime = 0;
        fullscreenVideo.style.display = 'block';
        fullscreenVideo.play().catch(e => console.error("Error playing video:", e));

        fullscreenVideo.onended = () => {
            playNextInQueue();
        };
    } else { // audio
        audioPreview.src = song.src;
        audioPreview.style.display = 'block';
        audioPreview.currentTime = 0;
        audioPreview.play().catch(e => console.log('Error playing audio:', e));
      
        audioPreview.onended = () => {
            playNextInQueue();
        };
    }
  }

  // Llamar a resetDJJumpFlag en todos los onended de video/audio
  // (Agregar esto en playNextInQueue y en nextVideo.onended)

  // Capturar eventos de teclado específicamente en el video
  fullscreenVideo.addEventListener('keydown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (songs.length === 0) return;
    
    if (isFullscreen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        showFullscreenSelector();
        let newIdx;
        if (e.key === 'ArrowDown') {
          newIdx = (fullscreenSelectedIdx + 1) % songs.length;
        } else {
          newIdx = (fullscreenSelectedIdx - 1 + songs.length) % songs.length;
        }
  updateFullscreenSelection(newIdx, 'auto');
      } else if (e.key === 'Enter') {
        if (fullscreenSelector.style.display !== 'none') {
          playCoinSound();
          addToQueue(fullscreenSelectedIdx);
          hideFullscreenSelector();
        }
      }
    }
  });

  // Prevenir que el video capture el foco
  fullscreenVideo.addEventListener('focus', (e) => {
    e.preventDefault();
    document.body.focus();
  });

  fullscreenVideo.addEventListener('timeupdate', () => {
    if (!isPlaying || hasPlayedEndDrop || fullscreenVideo.duration < 4) {
      return;
    }

    const remaining = fullscreenVideo.duration - fullscreenVideo.currentTime;

    if (remaining > 0 && remaining <= 4) {
      hasPlayedEndDrop = true;
      const chosen = pickRandomDrop();
      if (!chosen) return;
        const url = fileUrlFor(path.join('drops', chosen));
        if (url) {
          const dropSound = new Audio(url);
          dropSound.volume = 0.7;
          dropSound.play().catch(e => console.warn('Error reproducir drop end:', e));
        } else {
          console.warn('No se encontró URL para drop final:', chosen);
        }
    }
  });

  // Inicializar selección y preview
  if (songs.length > 0) updateSelection(0);

  // Cargar drops dinámicamente - buscar en varias ubicaciones para soportar la app empaquetada
  const { pathToFileURL } = require('url');
  const { remote } = require('electron');

  function findDropsDir() {
    const candidates = [];

    // ruta legacy si el usuario la creó manualmente
    candidates.push(path.join('C:', 'Rockola_2025', 'drops'));

    // carpeta drops junto al CWD (útil en desarrollo)
    candidates.push(path.join(process.cwd(), 'drops'));

    // ruta dentro de recursos de la app empaquetada
    if (process && process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'drops'));

    // carpeta drops en userData (por si la app guarda datos ahí)
    try {
      const appPath = (remote && remote.app) ? remote.app.getPath('userData') : null;
      if (appPath) candidates.push(path.join(appPath, 'drops'));
    } catch (e) {
      // ignore
    }

    // ruta relativa al directorio del script
    candidates.push(path.join(__dirname, '..', 'drops'));

    for (const c of candidates) {
      try {
        if (c && fs.existsSync(c) && fs.statSync(c).isDirectory()) return c;
      } catch (e) {
        // ignore
      }
    }
    return null;
  }

  const dropsDir = findDropsDir();
  let dropSounds = [];
  if (dropsDir) {
    try {
      const entries = fs.readdirSync(dropsDir);
      const allowed = ['.mp3', '.wav', '.ogg'];
      dropSounds = entries.filter(f => allowed.includes(path.extname(f).toLowerCase()));
      if (!dropSounds.length) console.warn('No se encontraron drops en', dropsDir);
      else console.log('Drops cargados desde', dropsDir, '-', dropSounds.length);
    } catch (e) {
      console.error('Error cargando drops desde', dropsDir, e);
    }
  } else {
    console.warn('No se encontró ninguna carpeta drops válida. Busqué en varias ubicaciones.');
  }

  // Evitar repetir el mismo drop seguido; permitir repetir solo después de 3 distintos
  const lastDrops = [];
  function pickRandomDrop() {
    if (!dropSounds || dropSounds.length === 0) return null;
    const avoid = new Set(lastDrops);
    const candidates = dropSounds.filter(f => !avoid.has(f));
    const pool = candidates.length > 0 ? candidates : dropSounds; // fallback si hay pocos
    const choice = pool[Math.floor(Math.random() * pool.length)];
    lastDrops.push(choice);
    if (lastDrops.length > 3) lastDrops.shift();
    return choice;
  }

  function playCoinSound() {
    const url = fileUrlFor(path.join('coin', 'dropping-single-coin-on-floor-3-96048.mp3'));
    if (url) {
      const coinSound = new Audio(url);
      coinSound.volume = 1.0;
      coinSound.play().catch(e => console.warn('Error reproducir coin:', e));
    } else {
      console.warn('No se encontró archivo coin local para reproducir');
    }
  }

  function playCoinDropSequence(idx) {
    playCoinSound();

    setTimeout(() => {
      const chosen = pickRandomDrop();
      if (!chosen) return;
  let abs = dropsDir ? path.join(dropsDir, chosen) : path.join('drops', chosen);
  // Crear URL segura con file:// para evitar problemas en empaquetado
  const url = pathToFileURL(abs).href;
  const dropSound = new Audio(url);
      dropSound.volume = 0.7; // Reduce volume by 30%
      dropSound.play();
    }, 1000);

    addToQueue(idx);
  }

  document.addEventListener('keydown', (e) => {
    if (songs.length === 0) return;
    
    if (isFullscreen) {
      // En modo fullscreen - flechas para mostrar selector
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        showFullscreenSelector();
        let newIdx;
        if (e.key === 'ArrowDown') {
          newIdx = (fullscreenSelectedIdx + 1) % songs.length;
        } else {
          newIdx = (fullscreenSelectedIdx - 1 + songs.length) % songs.length;
        }
  updateFullscreenSelection(newIdx, 'auto');
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        navigateAlphabetically(e.key === 'ArrowRight' ? 'next' : 'prev');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (fullscreenSelector.style.display !== 'none') {
          playCoinSound();
          addToQueue(fullscreenSelectedIdx);
          hideFullscreenSelector();
        }
      }
    } else {
      // En modo normal
      if (e.key === 'ArrowDown') {
        e.preventDefault();
  updateSelection((selectedIdx + 1) % songs.length, 'auto');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
  updateSelection((selectedIdx - 1 + songs.length) % songs.length, 'auto');
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        navigateAlphabetically(e.key === 'ArrowRight' ? 'next' : 'prev');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        playCoinDropSequence(selectedIdx);
      }
    }

    if (e.key === 'Escape') {
      // --- PRIORIDAD: Si hay nextVideo activo, manejar aquí ---
      if (nextVideo && nextVideo.style.display !== 'none' && nextVideo.style.opacity === '1') {
        if (queue.length > 0) {
          const remaining = nextVideo.duration - nextVideo.currentTime;
          if (remaining > 15) {
            nextVideo.currentTime = Math.max(0, nextVideo.duration - 15);
            console.log('Saltando 15 segundos antes del final del nextVideo');
          } else {
            // Pasar a la siguiente canción
            nextVideo.style.display = 'none';
            nextVideo.pause();
            if (document.body.contains(nextVideo)) {
              document.body.removeChild(nextVideo);
            }
            nextVideo = null;
            isFullscreen = false;
            hideFullscreenSelector();
            djMode = false;
            resetDJJumpFlag();
            playNextInQueue();
            console.log('⏭️ Escape presionado en los últimos 15s, pasando al siguiente video de la cola');
          }
        } else {
          // No hay cola, regresar al menú principal
          resetToInitialState();
          updateSelection(selectedIdx);
          console.log('Volviendo al menú principal - no hay cola');
        }
        return;
      }
      // ... el resto de tu lógica de Escape ...
      let activeVideo = null;
      if (fullscreenVideo.style.display !== 'none') {
        activeVideo = fullscreenVideo;
      }
      if (activeVideo && queue.length > 0) {
        const remaining = activeVideo.duration - activeVideo.currentTime;
        if (remaining > 15) {
          activeVideo.currentTime = Math.max(0, activeVideo.duration - 15);
          console.log('Saltando 15 segundos antes del final del video activo');
        } else {
          // Pasar a la siguiente canción
          activeVideo.style.display = 'none';
          isFullscreen = false;
          hideFullscreenSelector();
          resetDJJumpFlag();
          playNextInQueue();
          console.log('⏭️ Escape presionado en los últimos 15s, pasando al siguiente video de la cola');
        }
      } else if (activeVideo && queue.length === 0) {
        // No hay cola, regresar al menú principal
        if (fullscreenVideo) {
          fullscreenVideo.pause();
          fullscreenVideo.currentTime = 0;
          fullscreenVideo.style.display = 'none';
        }
        if (nextVideo) {
          nextVideo.pause();
          if (document.body.contains(nextVideo)) {
            document.body.removeChild(nextVideo);
          }
          nextVideo = null;
        }
        if (videoPreview) {
          videoPreview.pause();
          videoPreview.currentTime = 0;
          videoPreview.style.display = 'none';
          if (videoFrame) { videoFrame.style.display = 'none'; videoFrame.classList.remove('is-playing'); }
        }
        resetToInitialState();
        updateSelection(selectedIdx);
        console.log('Volviendo al menú principal - no hay cola');
      }
    } else if (e.key === 'F11' || (e.ctrlKey && e.key === 'Escape')) {
      fullscreenVideo.style.display = 'none';
      fullscreenVideo.pause();
      if (nextVideo) {
        nextVideo.style.display = 'none';
        nextVideo.pause();
        if (document.body.contains(nextVideo)) {
          document.body.removeChild(nextVideo);
        }
        nextVideo = null;
      }
      isFullscreen = false;
      hideFullscreenSelector();
      djMode = false;
      hasJumpedToDJ = false;
    }
  });

  function renderSongList() {
    const songListDiv = document.getElementById('song-list');
    if (!songListDiv) return;
    songListDiv.innerHTML = '';
    songDivs = []; // Reset songDivs array
    songs.forEach((song, idx) => {
      const div = document.createElement('div');
      div.className = 'song-list-item';
      div.textContent = song.title;
      div.style.padding = '10px 18px';
      div.style.cursor = 'pointer';
      div.style.fontSize = '1.1em';
      div.style.borderRadius = '8px';
      div.style.margin = '2px 0';
      div.style.transition = 'background 0.2s, color 0.2s, font-weight 0.2s';
      div.style.background = 'rgba(255,255,255,0.07)';
      div.style.color = '#fff';
      div.style.fontWeight = 'normal';
      div.onclick = () => {
        updateSelection(idx);
      };
      songListDiv.appendChild(div);
      songDivs.push(div);
    });
  }

  // Llamar a renderSongList() al iniciar para poblar songDivs
  renderSongList();

  // Redefinir updateSelection para que sea más eficiente
  const originalUpdateSelection = updateSelection;
  function clearSongListHighlight() {
    if (!songDivs || songDivs.length === 0) return;
    for (let i = 0; i < songDivs.length; i++) {
      const el = songDivs[i];
      if (!el) continue;
      el.style.background = 'rgba(255,255,255,0.07)';
      el.style.color = '#fff';
      el.style.fontWeight = 'normal';
    }
  }
  updateSelection = function(newIdx, behavior = 'auto') {
    // Llamar a la función original para actualizar el índice y la vista previa
    originalUpdateSelection.call(this, newIdx);

    // Limpiar cualquier rastro de selección previa para evitar 'fantasmas'
    clearSongListHighlight();

    // Seleccionar el nuevo elemento (solo uno)
    if (songDivs[selectedIdx]) {
      const div = songDivs[selectedIdx];
      div.style.background = 'rgba(0,120,215,0.18)';
      div.style.color = '#1976d2';
      div.style.fontWeight = 'bold';
      // Desplazamiento inmediato sin animación
      div.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }

    // Mantener sincronizado el índice del selector fullscreen
    fullscreenSelectedIdx = selectedIdx;
  };

  // Hacer la llamada inicial aquí con la versión correcta de updateSelection.
  if (songs.length > 0) {
    updateSelection(0);
  }

  function drawAnimatedTitle() {
    const canvas = document.getElementById('animated-title');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const text1 = "Video Rockola";
    const text3 = "2025"; // Removed text2

    let frame = 0;
    const particles = [];

    canvas.width = 800;
    canvas.height = 300;

    class Particle {
      constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = Math.random() * 2 + 1;
        this.velocityX = (Math.random() - 0.5) * 1.5;
        this.velocityY = (Math.random() - 0.5) * 1.5;
        this.lifespan = 40;
      }
      update() {
        this.x += this.velocityX;
        this.y += this.velocityY;
        this.lifespan--;
      }
      draw() {
        ctx.globalAlpha = this.lifespan / 40;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }
    }

    function createParticles(x, y, color) {
      for (let i = 0; i < 2; i++) {
        particles.push(new Particle(x, y, color));
      }
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frame++;

      // 1. Handle and Draw all Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw();
        if (particles[i].lifespan <= 0) {
          particles.splice(i, 1);
        }
      }

      // 2. Draw "Video Rockola" with particles
      ctx.font = "bold 70px 'Segoe UI', Arial, sans-serif";
      const text1Width = ctx.measureText(text1).width;
      let x1 = (canvas.width - text1Width) / 2;
      for (let i = 0; i < text1.length; i++) {
        const char = text1[i];
        const charWidth = ctx.measureText(char).width;
        const hue = (frame + i * 10) % 360;
        const color = `hsl(${hue}, 90%, 65%)`;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.fillText(char, x1, 100); // Adjusted Y position
        if (frame % 10 === 0) {
          createParticles(x1 + charWidth / 2, 100, color);
        }
        x1 += charWidth;
      }

      // 3. Draw "2025" with Pulsating Glow
      ctx.font = "bold 140px 'Segoe UI', Arial, sans-serif";
      const text3Width = ctx.measureText(text3).width;
      const x3 = (canvas.width - text3Width) / 2;
      const y3 = 240; // Adjusted Y position
      const pulse = Math.sin(frame * 0.05) * 10 + 15;
      const hue2 = frame % 360;

      ctx.fillStyle = 'white';
      ctx.shadowColor = `hsl(${hue2}, 100%, 50%)`;
      ctx.shadowBlur = pulse;
      ctx.fillText(text3, x3, y3);
      // Draw again for a stronger core glow
      ctx.shadowBlur = pulse / 2;
      ctx.fillText(text3, x3, y3);


      requestAnimationFrame(animate);
    }

    animate();
  }

  drawAnimatedTitle();
  }
});
