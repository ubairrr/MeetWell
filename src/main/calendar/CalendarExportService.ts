import { createEvents, type EventAttributes } from 'ics'
import { dialog, app } from 'electron'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { ArtifactStore } from '../store/ArtifactStore'

export class CalendarExportService {
  constructor(private artifactStore: ArtifactStore) {}

  async export(meetingId: string): Promise<{ filePath: string | null; skippedCount: number }> {
    const confirmed = this.artifactStore.getConfirmedActionItems(meetingId)

    const withDueDate = confirmed.filter((item) => item.due_date !== null)
    const skippedCount = confirmed.length - withDueDate.length

    if (withDueDate.length === 0) {
      return { filePath: null, skippedCount: confirmed.length }
    }

    const events: EventAttributes[] = withDueDate.map((item) => {
      const [year, month, day] = item.due_date!.split('-').map(Number)
      return {
        title: item.description,
        description: item.assignee_label ? `Owner: ${item.assignee_label}` : 'No assigned owner',
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
    this.artifactStore.stampIcsExported(withDueDate.map((i) => i.id), Date.now())
    return { filePath: saveResult.filePath, skippedCount }
  }
}
