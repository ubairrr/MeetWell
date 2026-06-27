import { app, BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'
import crypto from 'crypto'
import { z } from 'zod'
import { openDatabase, closeDatabase } from './store/db'
import { SessionManager } from './session/SessionManager'
import { CaptureService } from './capture/CaptureService'
import { ArtifactPipeline } from './pipeline/ArtifactPipeline'
import { ArtifactStore } from './store/ArtifactStore'
import { CalendarExportService } from './calendar/CalendarExportService'
import { MeetingArtifactsSchema } from '../shared/schemas'
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
  const geminiApiKey = process.env.GEMINI_API_KEY ?? ''
  if (!geminiApiKey) {
    console.warn('[MeetingAssist] GEMINI_API_KEY not set — artifact pipeline will fail')
  }
  const captureService = new CaptureService(db!, win!, apiKey)
  const artifactStore = new ArtifactStore(db!)
  const calendarExportService = new CalendarExportService(artifactStore)
  let lastCompletedMeetingId: string | null = null

  let currentMeetingId: string | null = null

  session.onStateChange((state, previous) => {
    if (win) {
      win.webContents.send('session-state-changed', { state, previous })
    }

    // Mouse event control: interactive during Idle, PreCapture, and Capturing
    if (win) {
      if (state === 'Idle' || state === 'PreCapture' || state === 'Capturing' || state === 'Complete') {
        win.setIgnoreMouseEvents(false)
      } else {
        win.setIgnoreMouseEvents(true, { forward: true })
      }
      // Keyboard focus: allow typing in Complete state (artifact review / edit flow)
      win.setFocusable(state === 'Complete')
    }

    // Capture lifecycle
    if (state === 'Capturing') {
      currentMeetingId = crypto.randomUUID()
      captureService.startCapture(currentMeetingId).catch((err: unknown) => {
        console.error('[MeetingAssist] CaptureService.startCapture failed:', err)
      })
    }

    if (state === 'Processing') {
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
  ipcMain.handle('start-break', () => undefined)
  ipcMain.handle('end-break', () => undefined)
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
  ipcMain.handle('get-settings', () => undefined)
  ipcMain.handle('set-setting', () => undefined)
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
