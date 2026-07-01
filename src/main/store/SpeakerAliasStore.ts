import Database from 'better-sqlite3-multiple-ciphers'
import {
  buildWordBoundaryRegex,
  escapeReplacement,
  renameInContentJson,
  renameKeyedContributions,
} from './speakerRename'

// ---------------------------------------------------------------------------
// SpeakerAliasStore — transactional rename propagation
// ---------------------------------------------------------------------------
// Applies a batch of speaker-label renames for one meeting, atomically,
// across every derived-artifact subsystem: artifacts.content_json,
// action_items.assignee_label/citations_json, summary_cards, and
// epoch_summaries — all inside one db.transaction() per applyRenames() call.
//
// SPKR-05 enforcement: every SELECT/UPDATE below is parameterized with
// `meeting_id = ?` (or scoped by an id fetched from a meeting_id-scoped
// SELECT in the same step) — never string-concatenate label/name/meetingId
// into SQL text.
// ---------------------------------------------------------------------------

export class SpeakerAliasStore {
  constructor(private db: Database.Database) {}

  getAlias(meetingId: string, originalLabel: string): string | null {
    const row = this.db
      .prepare('SELECT display_name FROM speaker_aliases WHERE meeting_id = ? AND original_label = ?')
      .get(meetingId, originalLabel) as { display_name: string } | undefined
    return row?.display_name ?? null
  }

  applyRenames(meetingId: string, mapping: Record<string, string>): void {
    // Prepare all statements once — never inside the per-mapping-entry loop.
    const getAliasStmt = this.db.prepare(
      'SELECT display_name FROM speaker_aliases WHERE meeting_id = ? AND original_label = ?'
    )
    const upsertAliasStmt = this.db.prepare(`
      INSERT INTO speaker_aliases (meeting_id, original_label, display_name, updated_at)
      VALUES (@meeting_id, @original_label, @display_name, @updated_at)
      ON CONFLICT(meeting_id, original_label) DO UPDATE
        SET display_name = excluded.display_name, updated_at = excluded.updated_at
    `)

    const selectArtifactsStmt = this.db.prepare(
      'SELECT id, content_json FROM artifacts WHERE meeting_id = ?'
    )
    const updateArtifactStmt = this.db.prepare(
      'UPDATE artifacts SET content_json = ? WHERE id = ? AND meeting_id = ?'
    )

    const selectActionItemsStmt = this.db.prepare(
      'SELECT id, assignee_label, citations_json FROM action_items WHERE meeting_id = ?'
    )
    const updateActionItemStmt = this.db.prepare(
      'UPDATE action_items SET assignee_label = ?, citations_json = ? WHERE id = ? AND meeting_id = ?'
    )

    const selectSummaryCardsStmt = this.db.prepare(
      'SELECT id, speaker_contributions_json FROM summary_cards WHERE meeting_id = ?'
    )
    const updateSummaryCardStmt = this.db.prepare(
      'UPDATE summary_cards SET speaker_contributions_json = ? WHERE id = ? AND meeting_id = ?'
    )

    const selectEpochSummariesStmt = this.db.prepare(
      'SELECT id, speaker_attributions_json FROM epoch_summaries WHERE meeting_id = ?'
    )
    const updateEpochSummaryStmt = this.db.prepare(
      'UPDATE epoch_summaries SET speaker_attributions_json = ? WHERE id = ? AND meeting_id = ?'
    )

    const tx = this.db.transaction((meetingId: string, mapping: Record<string, string>) => {
      for (const [originalLabel, newName] of Object.entries(mapping)) {
        // Pattern 3: idempotent re-rename — look up the currently effective
        // name, falling back to originalLabel only if no alias row exists.
        const existing = getAliasStmt.get(meetingId, originalLabel) as
          | { display_name: string }
          | undefined
        const fromName = existing?.display_name ?? originalLabel

        if (fromName === newName) continue // no-op, skip write

        const regex = buildWordBoundaryRegex(fromName)
        const safeReplacement = escapeReplacement(newName)

        // 1. artifacts.content_json
        const artifactRows = selectArtifactsStmt.all(meetingId) as Array<{
          id: string
          content_json: string
        }>
        for (const row of artifactRows) {
          const updated = renameInContentJson(row.content_json, fromName, newName)
          if (updated !== row.content_json) {
            updateArtifactStmt.run(updated, row.id, meetingId)
          }
        }

        // 2. action_items.assignee_label + citations_json
        const actionItemRows = selectActionItemsStmt.all(meetingId) as Array<{
          id: string
          assignee_label: string | null
          citations_json: string
        }>
        for (const row of actionItemRows) {
          const updatedAssignee =
            row.assignee_label != null ? row.assignee_label.replace(regex, safeReplacement) : row.assignee_label
          const updatedCitations = renameInContentJson(row.citations_json, fromName, newName)
          if (updatedAssignee !== row.assignee_label || updatedCitations !== row.citations_json) {
            updateActionItemStmt.run(updatedAssignee, updatedCitations, row.id, meetingId)
          }
        }

        // 3. summary_cards.speaker_contributions_json
        const summaryCardRows = selectSummaryCardsStmt.all(meetingId) as Array<{
          id: string
          speaker_contributions_json: string
        }>
        for (const row of summaryCardRows) {
          const updated = renameKeyedContributions(row.speaker_contributions_json, fromName, newName)
          if (updated !== row.speaker_contributions_json) {
            updateSummaryCardStmt.run(updated, row.id, meetingId)
          }
        }

        // 4. epoch_summaries.speaker_attributions_json
        const epochSummaryRows = selectEpochSummariesStmt.all(meetingId) as Array<{
          id: string
          speaker_attributions_json: string
        }>
        for (const row of epochSummaryRows) {
          const updated = renameKeyedContributions(row.speaker_attributions_json, fromName, newName)
          if (updated !== row.speaker_attributions_json) {
            updateEpochSummaryStmt.run(updated, row.id, meetingId)
          }
        }

        // 5. upsert speaker_aliases
        upsertAliasStmt.run({
          meeting_id: meetingId,
          original_label: originalLabel,
          display_name: newName,
          updated_at: Date.now(),
        })
      }
    })

    tx(meetingId, mapping)
  }
}
