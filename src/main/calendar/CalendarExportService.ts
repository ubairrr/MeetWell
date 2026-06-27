import { createEvents, type EventAttributes } from 'ics'
import { dialog, app } from 'electron'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { ArtifactStore } from '../store/ArtifactStore'

export class CalendarExportService {
  constructor(private artifactStore: ArtifactStore) {}

  async export(meetingId: string): Promise<{ filePath: string | null; skippedCount: number }> {
    const confirmed = this.artifactStore.getConfirmedActionItems(meetingId)

    // Only export calendar events (meetings, appointments, calls) — not tasks with deadlines
    const calendarItems = confirmed.filter((item) => item.is_calendar_event === 1)
    const nonCalendarCount = confirmed.length - calendarItems.length

    // Require a parseable YYYY-MM-DD due_date
    const validItems = calendarItems.filter((item) => {
      if (!item.due_date) return false
      const parts = item.due_date.split('-').map(Number)
      return parts.length === 3 && parts.every((p) => Number.isFinite(p) && p > 0)
    })
    const skippedCount = nonCalendarCount + (calendarItems.length - validItems.length)

    if (validItems.length === 0) {
      return { filePath: null, skippedCount: confirmed.length }
    }

    const events: EventAttributes[] = validItems.map((item) => {
      const [year, month, day] = item.due_date!.split('-').map(Number)
      return {
        title: item.description,
        description: item.assignee_label ? `Owner: ${item.assignee_label}` : 'Owner: You',
        start: [year, month, day] as [number, number, number],
        end: [year, month, day] as [number, number, number],
        status: 'CONFIRMED' as const,
        uid: `${item.id}@meetingassist`,
      }
    })

    const { error: icsError, value: icsContent } = createEvents(events)
    if (icsError) {
      throw icsError
    }

    const saveResult = await dialog.showSaveDialog({
      defaultPath: join(app.getPath('downloads'), 'meeting-actions.ics'),
      filters: [{ name: 'iCalendar', extensions: ['ics'] }],
    })

    if (saveResult.canceled || !saveResult.filePath) {
      return { filePath: null, skippedCount }
    }

    writeFileSync(saveResult.filePath, icsContent!)
    this.artifactStore.stampIcsExported(validItems.map((i) => i.id), Date.now())
    return { filePath: saveResult.filePath, skippedCount }
  }
}
