import { contextBridge, ipcRenderer } from 'electron'

const LISTEN_CHANNELS = [
  'session-state-changed',
  'transcript-segment',
  'summary-card-ready',
  'break-assist-digest-ready',
  'artifact-proposals-ready',
  'capture-health-update',
] as const

const INVOKE_CHANNELS = [
  'consent-confirmed',
  'mic-audio-chunk',
  'start-meeting',
  'end-meeting',
  'start-break',
  'end-break',
  'confirm-artifact',
  'edit-artifact',
  'dismiss-artifact',
  'export-ics',
  'get-settings',
  'set-setting',
] as const

type ListenChannel = typeof LISTEN_CHANNELS[number]
type InvokeChannel = typeof INVOKE_CHANNELS[number]

contextBridge.exposeInMainWorld('electronAPI', {
  invoke(channel: string, payload?: unknown): Promise<unknown> {
    if (!(INVOKE_CHANNELS as readonly string[]).includes(channel)) {
      return Promise.reject(new Error(`Blocked: channel "${channel}" not in allowlist`))
    }
    return ipcRenderer.invoke(channel as InvokeChannel, payload)
  },

  on(channel: string, callback: (...args: unknown[]) => void): void {
    if (!(LISTEN_CHANNELS as readonly string[]).includes(channel)) {
      throw new Error(`Blocked: channel "${channel}" not in allowlist`)
    }
    ipcRenderer.on(channel as ListenChannel, (_event, ...args) => callback(...args))
  },

  off(channel: string, callback: (...args: unknown[]) => void): void {
    ipcRenderer.off(channel, callback as any)
  },
})
