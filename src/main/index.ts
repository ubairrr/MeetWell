import { app, BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'
import crypto from 'crypto'
import { openDatabase, closeDatabase } from './store/db'
import { SessionManager } from './session/SessionManager'
import { CaptureService } from './capture/CaptureService'
import type Database from 'better-sqlite3-multiple-ciphers'

const OVERLAY_WIDTH = 380

let win: BrowserWindow | null = null
let db: Database.Database | null = null

function createOverlayWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  const window = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height,
    x: width - OVERLAY_WIDTH,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: join(__dirname, '../preload/index.js'),
    },
  })

  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  window.setAlwaysOnTop(true, 'screen-saver')
  window.setIgnoreMouseEvents(true, { forward: true })
  window.setContentProtection(true)

  return window
}

export function getMainWindow(): BrowserWindow | null {
  return win
}

export function getDb(): Database.Database | null {
  return db
}

app.whenReady().then(async () => {
  app.dock.hide()

  try {
    db = openDatabase()
  } catch (err) {
    console.error('[MeetingAssist] DB init failed:', err)
    app.quit()
    return
  }

  win = createOverlayWindow()
  win.setIgnoreMouseEvents(false)  // Idle state is interactive on startup

  const rendererUrl = process.env['ELECTRON_RENDERER_URL'] || process.env['VITE_DEV_SERVER_URL']
  if (rendererUrl) {
    win.loadURL(rendererUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // IPC handlers — wired in 06-05
  const session = new SessionManager()

  // DEEPGRAM_API_KEY is read from .env at project root via loadEnv in electron.vite.config.ts
  const apiKey = process.env.DEEPGRAM_API_KEY ?? ''
  if (!apiKey) {
    console.warn('[MeetingAssist] DEEPGRAM_API_KEY not set — capture will fail until key is configured')
  }
  const captureService = new CaptureService(db!, win!, apiKey)

  let currentMeetingId: string | null = null

  session.onStateChange((state, previous) => {
    if (win) {
      win.webContents.send('session-state-changed', { state, previous })
    }

    // Mouse event control: interactive during Idle, PreCapture, and Capturing
    if (win) {
      if (state === 'Idle' || state === 'PreCapture' || state === 'Capturing') {
        win.setIgnoreMouseEvents(false)
      } else {
        win.setIgnoreMouseEvents(true, { forward: true })
      }
    }

    // Capture lifecycle
    if (state === 'Capturing') {
      currentMeetingId = crypto.randomUUID()
      captureService.startCapture(currentMeetingId).catch((err: unknown) => {
        console.error('[MeetingAssist] CaptureService.startCapture failed:', err)
      })
    }

    if (state === 'Processing') {
      captureService.stopCapture().catch((err: unknown) => {
        console.error('[MeetingAssist] CaptureService.stopCapture failed:', err)
      })
      currentMeetingId = null
    }
  })

  // Active handlers
  ipcMain.handle('start-meeting', () => {
    session.transition('start-meeting')
  })

  ipcMain.handle('consent-confirmed', (_event, _payload) => {
    session.transition('consent-confirmed')
  })

  // Stub handlers — implemented in later phases
  ipcMain.handle('mic-audio-chunk', (_event, buffer: ArrayBuffer) => {
    captureService.handleMicChunk(buffer)
  })
  ipcMain.handle('end-meeting', () => {
    try {
      session.transition('end-meeting')
    } catch (err) {
      console.error('[MeetingAssist] end-meeting transition failed:', err)
    }
  })
  ipcMain.handle('start-break', () => undefined)
  ipcMain.handle('end-break', () => undefined)
  ipcMain.handle('confirm-artifact', () => undefined)
  ipcMain.handle('edit-artifact', () => undefined)
  ipcMain.handle('dismiss-artifact', () => undefined)
  ipcMain.handle('export-ics', () => undefined)
  ipcMain.handle('get-settings', () => undefined)
  ipcMain.handle('set-setting', () => undefined)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (db) {
    closeDatabase(db)
    db = null
  }
})
