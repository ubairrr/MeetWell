/**
 * RSCH-04 Spike — preload.js
 *
 * Electron preload: exposes only the minimum IPC surface to the renderer.
 * Follows contextBridge allowlist pattern from DNA CLAUDE.md.
 *
 * NOT product code. Throwaway spike per RSCH-04.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('spikeAPI', {
  // Get environment info (DEEPGRAM_API_KEY set?, versions)
  getEnv: () => ipcRenderer.invoke('get-env'),

  // TODO (T3): Expose startCapturePath1 (native Chromium flags)
  // startCapturePath1: () => ipcRenderer.invoke('start-capture-path1'),

  // TODO (T4): Expose startCapturePath2 (AudioTee.js)
  // startCapturePath2: () => ipcRenderer.invoke('start-capture-path2'),

  // TODO (T3/T4): Expose transcript event listener
  // onTranscript: (cb) => ipcRenderer.on('transcript', (_, data) => cb(data)),
});
