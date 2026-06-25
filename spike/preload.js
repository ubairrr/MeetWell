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
  getEnv: () => ipcRenderer.invoke('get-env'),
  startDGConnection: (pathName) => ipcRenderer.invoke('start-dg-connection', pathName),
  stopDGConnection: () => ipcRenderer.invoke('stop-dg-connection'),
  sendAudioChunk: (buffer) => ipcRenderer.invoke('send-audio-chunk', buffer),
  startPath2AudioTee: () => ipcRenderer.invoke('start-path2-audiotee'),
  stopPath2AudioTee: () => ipcRenderer.invoke('stop-path2-audiotee'),
  onTranscript: (cb) => ipcRenderer.on('transcript', (_, data) => cb(data)),
  onStatusChange: (cb) => ipcRenderer.on('status-change', (_, data) => cb(data)),
});
