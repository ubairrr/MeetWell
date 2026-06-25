/**
 * RSCH-04 Spike — main.js
 *
 * Throwaway Electron main process for system-audio capture spike.
 * Tests two capture paths:
 *   Path 1: Native Chromium flags (MacCatapSystemAudioLoopbackCapture)
 *   Path 2: AudioTee.js (Core Audio Taps via 'audiotee' npm package)
 *
 * NOT product code. Committed as research record per RSCH-04.
 */

const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const { AudioTee } = require('audiotee');
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');

// ============================================================
// PATH 1: Native Chromium Core Audio Tap flags
// On macOS 15+ (including 26.x), use MacCatapSystemAudioLoopbackCapture
// For Electron 41+, native flags support is built-in
// ============================================================
app.commandLine.appendSwitch('enable-features', 'MacLoopbackAudioForScreenShare');
app.commandLine.appendSwitch('enable-features', 'MacCatapSystemAudioLoopbackCapture');

let mainWindow;
let dgClient;
let dgConnection;
let activePath = null; // 'path1' or 'path2'
let audioteeInstance = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  // Set up loopback handler to bypass user screen share picker UI in Path 1
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    callback({ audio: 'loopback' });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Helper to connect to Deepgram
async function connectDeepgram(pathName) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPGRAM_API_KEY not set');
  }

  if (dgConnection) {
    try { dgConnection.requestClose(); } catch (e) {}
  }

  dgClient = createClient(apiKey);
  dgConnection = dgClient.listen.live({
    model: 'nova-3',
    diarize: true,
    smart_format: true,
    encoding: 'linear16',
    sample_rate: 16000,
    channels: 1,
    mip_opt_out: true, // DEC-02 compliance
  });

  activePath = pathName;

  dgConnection.on(LiveTranscriptionEvents.Open, () => {
    if (mainWindow) {
      mainWindow.webContents.send('status-change', { status: 'connected', path: pathName });
    }
  });

  dgConnection.on(LiveTranscriptionEvents.Transcript, (data) => {
    const alt = data?.channel?.alternatives?.[0];
    if (!alt?.transcript?.trim()) return;

    if (mainWindow) {
      mainWindow.webContents.send('transcript', {
        path: activePath,
        speaker: alt.words?.[0]?.speaker ?? '?',
        text: alt.transcript,
        isFinal: data.is_final,
      });
    }
  });

  dgConnection.on(LiveTranscriptionEvents.Error, (err) => {
    console.error('Deepgram Error:', err);
    if (mainWindow) {
      mainWindow.webContents.send('status-change', { status: 'error', error: err.message || err });
    }
  });

  dgConnection.on(LiveTranscriptionEvents.Close, () => {
    if (mainWindow) {
      mainWindow.webContents.send('status-change', { status: 'closed', path: activePath });
    }
    dgConnection = null;
    activePath = null;
  });
}

// IPC Handlers
ipcMain.handle('get-env', () => ({
  deepgramKeySet: !!process.env.DEEPGRAM_API_KEY,
  nodeVersion: process.version,
  electronVersion: process.versions.electron,
  platform: process.platform,
}));

ipcMain.handle('start-dg-connection', async (event, pathName) => {
  await connectDeepgram(pathName);
  return { success: true };
});

ipcMain.handle('stop-dg-connection', async () => {
  if (dgConnection) {
    dgConnection.requestClose();
  }
  return { success: true };
});

ipcMain.handle('send-audio-chunk', (event, buffer) => {
  if (dgConnection && activePath === 'path1') {
    // Send raw linear16 PCM buffer from Path 1 (renderer)
    dgConnection.send(Buffer.from(buffer));
  }
  return { success: true };
});

ipcMain.handle('start-path2-audiotee', async () => {
  if (audioteeInstance) {
    try { await audioteeInstance.stop(); } catch (e) {}
  }

  await connectDeepgram('path2');

  audioteeInstance = new AudioTee({
    sampleRate: 16000,
    chunkDurationMs: 100,
  });

  audioteeInstance.on('data', (chunk) => {
    if (chunk?.data && dgConnection && activePath === 'path2') {
      dgConnection.send(chunk.data);
    }
  });

  audioteeInstance.on('error', (err) => {
    console.error('AudioTee process error:', err);
    if (mainWindow) {
      mainWindow.webContents.send('status-change', { status: 'error', error: `AudioTee: ${err.message}` });
    }
  });

  await audioteeInstance.start();
  return { success: true };
});

ipcMain.handle('stop-path2-audiotee', async () => {
  if (audioteeInstance) {
    await audioteeInstance.stop();
    audioteeInstance = null;
  }
  if (dgConnection) {
    dgConnection.requestClose();
  }
  return { success: true };
});
