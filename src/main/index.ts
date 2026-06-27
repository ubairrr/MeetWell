import { app, BrowserWindow, screen, ipcMain, safeStorage } from 'electron'
import { join } from 'path'
import crypto from 'crypto'
import { z } from 'zod'
import Store from 'electron-store'
import { openDatabase, closeDatabase } from './store/db'
import { SessionManager } from './session/SessionManager'
import { CaptureService } from './capture/CaptureService'
import { ArtifactPipeline } from './pipeline/ArtifactPipeline'
import { ArtifactStore } from './store/ArtifactStore'
import { CalendarExportService } from './calendar/CalendarExportService'
import { MeetingArtifactsSchema } from '../shared/schemas'
import { LLMAdapter } from './llm/LLMAdapter'
import { SummaryCardStore } from './store/SummaryCardStore'
import { SummaryCardTimer } from './context/SummaryCardTimer'
import type Database from 'better-sqlite3-multiple-ciphers'

let win: BrowserWindow | null = null
let db: Database.Database | null = null
let breakStartMs = 0

function createOverlayWindow(overlayWidth: number = 380): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  const window = new BrowserWindow({
    width: overlayWidth,
    height,
    x: width - overlayWidth,
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

  const electronStore = new Store()

  function loadApiKeys(): void {
    if (electronStore.has('gemini-api-key-encrypted')) {
      try {
        const value = electronStore.get('gemini-api-key-encrypted') as Buffer
        process.env.GEMINI_API_KEY = safeStorage.decryptString(value)
      } catch (err) {
        console.error('[loadApiKeys] failed to decrypt gemini key:', err)
      }
    }
    if (electronStore.has('deepgram-api-key-encrypted')) {
      try {
        const value = electronStore.get('deepgram-api-key-encrypted') as Buffer
        process.env.DEEPGRAM_API_KEY = safeStorage.decryptString(value)
      } catch (err) {
        console.error('[loadApiKeys] failed to decrypt deepgram key:', err)
      }
    }
  }

  loadApiKeys()

  const overlayWidth = electronStore.get('overlay-width', 380) as number

  try {
    db = openDatabase()
  } catch (err) {
    console.error('[MeetingAssist] DB init failed:', err)
    app.quit()
    return
  }

  win = createOverlayWindow(overlayWidth)
  win.setIgnoreMouseEvents(false)  // Idle state is interactive on startup

  const rendererUrl = process.env['ELECTRON_RENDERER_URL'] || process.env['VITE_DEV_SERVER_URL']
  if (rendererUrl) {
    win.loadURL(rendererUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // IPC handlers — wired in 06-05
  const session = new SessionManager()

  // API keys already loaded from safeStorage above; warn if still missing
  const apiKey = process.env.DEEPGRAM_API_KEY ?? ''
  if (!apiKey) {
    console.warn('[MeetingAssist] DEEPGRAM_API_KEY not set — capture will fail until key is configured')
  }
  const geminiApiKey = process.env.GEMINI_API_KEY ?? ''
  if (!geminiApiKey) {
    console.warn('[MeetingAssist] GEMINI_API_KEY not set — artifact pipeline will fail')
  }

  const captureService = new CaptureService(db!, win!, apiKey)
  const artifactStore = new ArtifactStore(db!)
  const calendarExportService = new CalendarExportService(artifactStore)
  const summaryCardStore = new SummaryCardStore(db!)
  const llmAdapter = new LLMAdapter(geminiApiKey)
  const summaryCardTimer = new SummaryCardTimer(db!, win!, summaryCardStore, llmAdapter)
  let lastCompletedMeetingId: string | null = null

  let currentMeetingId: string | null = null

  session.onStateChange((state, previous) => {
    if (win) {
      win.webContents.send('session-state-changed', { state, previous })
    }

    // Mouse event control: interactive during Idle, PreCapture, Capturing, OnBreak, and Complete
    // OnBreak must allow mouse events so the "I'm Back" button is reachable
    if (win) {
      if (
        state === 'Idle' ||
        state === 'PreCapture' ||
        state === 'Capturing' ||
        state === 'OnBreak' ||
        state === 'Complete'
      ) {
        win.setIgnoreMouseEvents(false)
      } else {
        win.setIgnoreMouseEvents(true, { forward: true })
      }
      // Keyboard focus: allow typing in Complete state (artifact review / edit flow)
      win.setFocusable(state === 'Complete')
    }

    // Capture lifecycle
    if (state === 'Capturing' && previous !== 'OnBreak') {
      // Only generate a new meeting ID when entering Capturing from PreCapture (not from OnBreak)
      currentMeetingId = crypto.randomUUID()
      captureService.startCapture(currentMeetingId).catch((err: unknown) => {
        console.error('[MeetingAssist] CaptureService.startCapture failed:', err)
      })
      summaryCardTimer.start(currentMeetingId)
    }

    if (state === 'Processing') {
      summaryCardTimer.stop()
      const meetingId = currentMeetingId
      currentMeetingId = null
      captureService.stopCapture()
        .catch((err: unknown) => {
          console.error('[MeetingAssist] CaptureService.stopCapture failed:', err)
        })
        .finally(async () => {
          let proposals: z.infer<typeof MeetingArtifactsSchema>
          try {
            const pipeline = new ArtifactPipeline(db!, win!, meetingId ?? '')
            proposals = await pipeline.run()
          } catch (err: unknown) {
            console.error('[MeetingAssist] ArtifactPipeline failed:', err)
            proposals = {
              meetingId: meetingId ?? '',
              mom: { markdown_content: '' },
              summary: { summary_text: '' },
              keyPoints: { key_points: [] },
              actionItems: { action_items: [] },
              error: true,
              errorMessage: 'Artifact generation failed — your transcript is saved',
            }
          }
          lastCompletedMeetingId = proposals.meetingId || meetingId
          if (win) {
            win.webContents.send('artifact-proposals-ready', proposals)
          }
          try {
            session.transition('pipeline-complete')
          } catch (err) {
            console.error('[MeetingAssist] pipeline-complete transition failed (duplicate?):', err)
          }
        })
    }

    if (state === 'Idle') {
      summaryCardTimer.stop()
    }
  })

  // Active handlers
  ipcMain.handle('start-meeting', () => {
    session.transition('start-meeting')
  })

  ipcMain.handle('consent-confirmed', (_event, _payload) => {
    session.transition('consent-confirmed')
  })

  ipcMain.handle('mic-audio-chunk', (_event, buffer: ArrayBuffer) => {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength > 1_048_576) return
    captureService.handleMicChunk(buffer)
  })
  ipcMain.handle('end-meeting', () => {
    try {
      session.transition('end-meeting')
    } catch (err) {
      console.error('[MeetingAssist] end-meeting transition failed:', err)
    }
  })
  ipcMain.handle('dismiss-session', () => {
    try {
      session.transition('session-dismissed')
    } catch (err) {
      console.error('[MeetingAssist] dismiss-session transition failed:', err)
    }
  })

  ipcMain.handle('start-break', () => {
    try {
      session.transition('start-break')
      breakStartMs = Date.now()
    } catch (err) {
      console.error('[MeetingAssist] start-break transition failed:', err)
    }
    return { ok: true }
  })

  ipcMain.handle('end-break', () => {
    try {
      session.transition('end-break')
    } catch (err) {
      console.error('[MeetingAssist] end-break transition failed:', err)
      return { ok: false }
    }
    const cards = currentMeetingId
      ? summaryCardStore.getCardsSince(currentMeetingId, breakStartMs)
      : []
    if (win) {
      win.webContents.send('break-assist-digest-ready', {
        cardsMissed: cards,
        isEmpty: cards.length === 0,
      })
    }
    breakStartMs = 0
    return { ok: true }
  })

  ipcMain.handle('confirm-artifact', (_event, payload: unknown) => {
    const result = z.object({ id: z.string(), type: z.enum(['action_item', 'decision', 'date']) }).safeParse(payload)
    if (!result.success) return
    artifactStore.confirmArtifact(result.data.id, result.data.type)
  })
  ipcMain.handle('edit-artifact', (_event, payload: unknown) => {
    const result = z.object({
      id: z.string(),
      updates: z.object({
        description: z.string().optional(),
        due_date: z.string().nullable().optional(),
        assignee_label: z.string().nullable().optional(),
      }),
    }).safeParse(payload)
    if (!result.success) return
    artifactStore.editArtifact(result.data.id, result.data.updates)
  })
  ipcMain.handle('dismiss-artifact', (_event, payload: unknown) => {
    const result = z.object({ id: z.string() }).safeParse(payload)
    if (!result.success) return
    artifactStore.dismissArtifact(result.data.id)
  })
  ipcMain.handle('export-ics', async (_event, payload: unknown) => {
    const result = z.object({ meetingId: z.string() }).safeParse(payload)
    if (!result.success) return { filePath: null, skippedCount: 0 }
    return calendarExportService.export(result.data.meetingId)
  })

  ipcMain.handle('get-settings', () => {
    return {
      overlayWidth: electronStore.get('overlay-width', 380),
      overlayOpacity: electronStore.get('overlay-opacity', 0.85),
      hasGeminiKey: electronStore.has('gemini-api-key-encrypted'),
      hasDeepgramKey: electronStore.has('deepgram-api-key-encrypted'),
    }
  })

  ipcMain.handle('set-setting', (_event, payload: unknown) => {
    const result = z.object({ key: z.string(), value: z.unknown() }).safeParse(payload)
    if (!result.success) return { error: 'invalid payload' }
    const { key, value } = result.data

    switch (key) {
      case 'gemini-api-key': {
        if (typeof value !== 'string' || value.length === 0) return { error: 'value must be non-empty string' }
        const encrypted = safeStorage.encryptString(value)
        electronStore.set('gemini-api-key-encrypted', encrypted)
        process.env.GEMINI_API_KEY = value
        return { ok: true }
      }
      case 'deepgram-api-key': {
        if (typeof value !== 'string' || value.length === 0) return { error: 'value must be non-empty string' }
        const encrypted = safeStorage.encryptString(value)
        electronStore.set('deepgram-api-key-encrypted', encrypted)
        process.env.DEEPGRAM_API_KEY = value
        return { ok: true }
      }
      case 'overlay-width': {
        if (typeof value !== 'number') return { error: 'value must be number' }
        const clamped = Math.max(280, Math.min(600, value))
        electronStore.set('overlay-width', clamped)
        return { ok: true }
      }
      case 'overlay-opacity': {
        if (typeof value !== 'number') return { error: 'value must be number' }
        const clamped = Math.max(0.3, Math.min(1.0, value))
        electronStore.set('overlay-opacity', clamped)
        return { ok: true }
      }
      default:
        return { error: 'unknown key' }
    }
  })

  ipcMain.handle('set-meeting-title', (_event, payload: unknown) => {
    const result = z.object({ meetingId: z.string(), title: z.string().min(1).max(200) }).safeParse(payload)
    if (!result.success) return
    db!.prepare('UPDATE meetings SET title = ? WHERE id = ?').run(result.data.title.trim(), result.data.meetingId)
  })

  ipcMain.handle('set-focusable', (_event, payload: unknown) => {
    if (win) win.setFocusable(!!payload)
  })

  ipcMain.handle('quit-app', () => app.quit())
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
