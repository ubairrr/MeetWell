import crypto from 'crypto'
import Database from 'better-sqlite3-multiple-ciphers'
import type { MeetingArtifacts } from '../../shared/schemas'

export class ArtifactStore {
  constructor(private db: Database.Database) {}

  saveArtifacts(meetingId: string, artifacts: MeetingArtifacts): void {
    const insertArtifact = this.db.prepare(
      'INSERT INTO artifacts (id, meeting_id, artifact_type, content_json, model_used) VALUES (?, ?, ?, ?, ?)'
    )
    const insertActionItem = this.db.prepare(
      'INSERT INTO action_items (id, meeting_id, description, assignee_label, due_date, status, is_calendar_event, citations_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )

    const tx = this.db.transaction(() => {
      const model = 'gemini-2.5-flash'

      insertArtifact.run(crypto.randomUUID(), meetingId, 'mom', JSON.stringify(artifacts.mom), model)
      insertArtifact.run(crypto.randomUUID(), meetingId, 'summary', JSON.stringify(artifacts.summary), model)
      insertArtifact.run(crypto.randomUUID(), meetingId, 'key_points', JSON.stringify(artifacts.keyPoints), model)
      insertArtifact.run(crypto.randomUUID(), meetingId, 'action_items', JSON.stringify(artifacts.actionItems), model)

      for (const item of artifacts.actionItems.action_items) {
        insertActionItem.run(
          item.id,
          meetingId,
          item.description,
          item.assignee_label ?? null,
          item.due_date ?? null,
          'proposed', // hardcoded — never trust LLM status field
          item.is_calendar_event ? 1 : 0,
          JSON.stringify(item.citations)
        )
      }
    })

    tx()
  }

  confirmArtifact(id: string, type: 'action_item' | 'decision' | 'date'): void {
    if (type !== 'action_item') {
      console.warn(`[ArtifactStore] confirmArtifact: type '${type}' not handled in Phase 8`)
      return
    }
    this.db.prepare(
      "UPDATE action_items SET status = 'confirmed' WHERE id = ? AND status = 'proposed'"
    ).run(id)
  }

  editArtifact(
    id: string,
    updates: { description?: string; due_date?: string | null; assignee_label?: string | null }
  ): void {
    const fields: string[] = []
    const values: unknown[] = []

    if (updates.description !== undefined) {
      fields.push('description = ?')
      values.push(updates.description)
    }
    if (updates.due_date !== undefined) {
      fields.push('due_date = ?')
      values.push(updates.due_date)
    }
    if (updates.assignee_label !== undefined) {
      fields.push('assignee_label = ?')
      values.push(updates.assignee_label)
    }

    if (fields.length === 0) return
    values.push(id)
    this.db.prepare(`UPDATE action_items SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }

  stampIcsExported(ids: string[], exportedAt: number): void {
    const stmt = this.db.prepare('UPDATE action_items SET ics_exported_at = ? WHERE id = ?')
    const tx = this.db.transaction(() => {
      for (const id of ids) stmt.run(exportedAt, id)
    })
    tx()
  }

  dismissArtifact(id: string): void {
    this.db.prepare(
      "UPDATE action_items SET status = 'dismissed' WHERE id = ? AND status = 'proposed'"
    ).run(id)
  }

  getConfirmedActionItems(meetingId: string): Array<{
    id: string
    description: string
    assignee_label: string | null
    due_date: string | null
    is_calendar_event: number
    citations_json: string
  }> {
    return this.db.prepare(
      "SELECT id, description, assignee_label, due_date, is_calendar_event, citations_json FROM action_items WHERE meeting_id = ? AND status = 'confirmed'"
    ).all(meetingId) as Array<{
      id: string
      description: string
      assignee_label: string | null
      due_date: string | null
      is_calendar_event: number
      citations_json: string
    }>
  }

  getArtifacts(meetingId: string): Array<{ artifact_type: string; content_json: string }> {
    return this.db.prepare(
      'SELECT artifact_type, content_json FROM artifacts WHERE meeting_id = ? ORDER BY created_at ASC'
    ).all(meetingId) as Array<{ artifact_type: string; content_json: string }>
  }
}
