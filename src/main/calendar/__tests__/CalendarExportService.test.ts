import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import * as sqliteVec from 'sqlite-vec'
import { ALL_DDLS } from '../../store/db'
import { ArtifactStore } from '../../store/ArtifactStore'
import { CalendarExportService } from '../CalendarExportService'

// ---------------------------------------------------------------------------
// Mocks — electron (dialog/app) and fs (writeFileSync)
//
// CalendarExportService.ts imports `dialog`/`app` from 'electron' and
// `writeFileSync` from 'fs' at module load time, so both must be mocked
// before the service module is imported (vi.mock calls are hoisted).
// ---------------------------------------------------------------------------
const mockShowSaveDialog = vi.fn()

vi.mock('electron', () => ({
  dialog: {
    showSaveDialog: (...args: unknown[]) => mockShowSaveDialog(...args),
  },
  app: {
    getPath: () => '/tmp',
  },
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    writeFileSync: vi.fn(),
  }
})

// Import after mocking so we get the mocked implementation.
import { writeFileSync } from 'fs'
const mockWriteFileSync = writeFileSync as unknown as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// DB helper — in-memory, unencrypted (mirrors tests/unit/TranscriptStore.test.ts)
// ---------------------------------------------------------------------------
function openTestDb(): Database.Database {
  const db = new Database(':memory:')
  sqliteVec.load(db)
  db.exec(ALL_DDLS)
  return db
}

let seq = 0
function seedMeetingWithActionItem(
  db: Database.Database,
  overrides: {
    assigneeLabel?: string | null
    dueDate?: string | null
    isCalendarEvent?: number
  } = {}
): { meetingId: string; actionItemId: string } {
  seq += 1
  const meetingId = `mtg-${seq}`
  const actionItemId = `item-${seq}`

  db.prepare(
    'INSERT INTO meetings (id, title, started_at) VALUES (?, ?, ?)'
  ).run(meetingId, `Meeting ${seq}`, Date.now())

  db.prepare(
    `INSERT INTO action_items
      (id, meeting_id, description, assignee_label, due_date, status, is_calendar_event, citations_json)
     VALUES (?, ?, ?, ?, ?, 'confirmed', ?, '[]')`
  ).run(
    actionItemId,
    meetingId,
    `Action for ${meetingId}`,
    overrides.assigneeLabel === undefined ? null : overrides.assigneeLabel,
    overrides.dueDate === undefined ? '2026-08-15' : overrides.dueDate,
    overrides.isCalendarEvent === undefined ? 1 : overrides.isCalendarEvent
  )

  return { meetingId, actionItemId }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('CalendarExportService', () => {
  let db: Database.Database
  let store: ArtifactStore
  let service: CalendarExportService

  beforeEach(() => {
    db = openTestDb()
    store = new ArtifactStore(db)
    service = new CalendarExportService(store)
    mockShowSaveDialog.mockReset()
    mockWriteFileSync.mockReset()
    mockShowSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/tmp/mock-meeting-actions.ics',
    })
  })

  afterEach(() => {
    if (db && db.open) db.close()
  })

  it('renders a renamed assignee_label as "Owner: <name>" in the exported ICS content', async () => {
    const { meetingId, actionItemId } = seedMeetingWithActionItem(db, {
      assigneeLabel: 'Jane Doe',
    })

    const result = await service.export(meetingId)

    expect(result.filePath).toBe('/tmp/mock-meeting-actions.ics')
    expect(result.skippedCount).toBe(0)
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1)
    const icsContent = mockWriteFileSync.mock.calls[0][1] as string
    expect(icsContent).toContain('Owner: Jane Doe')

    const row = db
      .prepare('SELECT ics_exported_at FROM action_items WHERE id = ?')
      .get(actionItemId) as { ics_exported_at: number | null }
    expect(row.ics_exported_at).not.toBeNull()
  })

  it('falls back to "Owner: You" when assignee_label is null', async () => {
    const { meetingId, actionItemId } = seedMeetingWithActionItem(db, {
      assigneeLabel: null,
    })

    const result = await service.export(meetingId)

    expect(result.filePath).toBe('/tmp/mock-meeting-actions.ics')
    expect(result.skippedCount).toBe(0)
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1)
    const icsContent = mockWriteFileSync.mock.calls[0][1] as string
    expect(icsContent).toContain('Owner: You')

    const row = db
      .prepare('SELECT ics_exported_at FROM action_items WHERE id = ?')
      .get(actionItemId) as { ics_exported_at: number | null }
    expect(row.ics_exported_at).not.toBeNull()
  })

  it('excludes non-calendar-event confirmed items and counts them as skipped', async () => {
    const { meetingId, actionItemId } = seedMeetingWithActionItem(db, {
      assigneeLabel: 'Jane Doe',
      isCalendarEvent: 0,
    })

    const result = await service.export(meetingId)

    expect(result.filePath).toBeNull()
    expect(result.skippedCount).toBe(1)
    expect(mockWriteFileSync).not.toHaveBeenCalled()

    const row = db
      .prepare('SELECT ics_exported_at FROM action_items WHERE id = ?')
      .get(actionItemId) as { ics_exported_at: number | null }
    expect(row.ics_exported_at).toBeNull()
  })

  it('excludes confirmed calendar items with an unparseable/missing due_date and counts them as skipped', async () => {
    const { meetingId, actionItemId } = seedMeetingWithActionItem(db, {
      assigneeLabel: 'Jane Doe',
      dueDate: null,
    })

    const result = await service.export(meetingId)

    expect(result.filePath).toBeNull()
    expect(result.skippedCount).toBe(1)
    expect(mockWriteFileSync).not.toHaveBeenCalled()

    const row = db
      .prepare('SELECT ics_exported_at FROM action_items WHERE id = ?')
      .get(actionItemId) as { ics_exported_at: number | null }
    expect(row.ics_exported_at).toBeNull()
  })
})
