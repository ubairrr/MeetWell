/**
 * RSCH-04 Spike — main.js
 *
 * Throwaway Electron main process for system-audio capture spike.
 * Tests two capture paths:
 *   Path 1: Native Chromium flags (MacCatapSystemAudioLoopbackCapture)
 *   Path 2: AudioTee.js (Core Audio Taps via 'audiotee' npm package)
 *
 * NOT product code. Committed as research record per RSCH-04.
 * See .planning/phases/03-deep-research/03-RSCH-04-SPIKE-REPORT.md for results.
 */

const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');

// ============================================================
// PATH 1: Native Chromium Core Audio Tap flags
// On macOS 15+ (including 26.x), use MacCatapSystemAudioLoopbackCapture
// NOT MacSckSystemAudioLoopbackOverride (ScreenCaptureKit — deprecated on 15+)
// For Electron 41+, no electron-audio-loopback package needed — native flags only
// ============================================================
app.commandLine.appendSwitch('enable-features', 'MacLoopbackAudioForScreenShare');
app.commandLine.appendSwitch('enable-features', 'MacCatapSystemAudioLoopbackCapture');

// TODO (T3): Implement setDisplayMediaRequestHandler for loopback audio
// TODO (T3): Wire both audio streams to Deepgram Nova-3 with diarization=true
// TODO (T3): Verify coherent transcript returns for both mic and system audio channels

// ============================================================
// PATH 2: AudioTee.js (Core Audio Taps via Swift binary)
// npm package: 'audiotee' v0.0.7
// Requires entitlement: com.apple.security.cs.disable-library-validation
// (acceptable for throwaway spike only — NOT for product)
// ============================================================
// TODO (T4): Integrate audiotee package for system audio capture
// TODO (T4): Wire AudioTee.js output alongside mic stream to Deepgram
// TODO (T4): Compare permissions UX (no purple indicator expected for Path 2)

let mainWindow;

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
  // TODO (T3): Implement setDisplayMediaRequestHandler here for Path 1
  // session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
  //   callback({ audio: 'loopback' });
  // });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers
// TODO (T3/T4): Add IPC handlers for audio stream status and transcript output
ipcMain.handle('get-env', () => ({
  deepgramKeySet: !!process.env.DEEPGRAM_API_KEY,
  nodeVersion: process.version,
  electronVersion: process.versions.electron,
  platform: process.platform,
}));
