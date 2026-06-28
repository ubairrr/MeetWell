import type Database from 'better-sqlite3-multiple-ciphers'
import type { StoredEpochSummary } from '../../shared/schemas/index'

/**
 * A single row returned by the transcript_segments SELECT in getContext().
 * Only the columns required for the ContextWindow are selected — id through text.
 */
export interface TranscriptSegmentRow {
  id: string
  meeting_id: string
  speaker_label: string
  channel: string
  timestamp_start: number
  timestamp_end: number
  text: string
}

/**
 * The context window assembled by ContextComposer from two DB sources:
 *  - rollingSegments: uncompressed transcript segments (timestamp_start > coveredUntil)
 *  - epochSummaries: all compressed epoch records for the meeting (JSON-deserialized)
 *
 * This is v1 infrastructure for the v2 Live Assistant (D-07). ContextComposer is
 * not wired into any v1 user flow — it is built and tested here; the v2 Live
 * Assistant chat UI is the first production consumer.
 */
export interface ContextWindow {
  rollingSegments: TranscriptSegmentRow[]
  epochSummaries: StoredEpochSummary[]
}

/**
 * Raw DB row shape for epoch_summaries — structured fields are stored as JSON
 * strings and must be deserialized before being returned as StoredEpochSummary.
 */
interface EpochSummaryRow {
  id: string
  meeting_id: string
  covered_interval_start: number
  covered_interval_end: number
  decisions_json: string
  action_items_json: string
  key_points_json: string
  speaker_attributions_json: string
  raw_segment_count: number
  token_count_compressed: number
  created_at: string
}

/**
 * ContextComposer — the DB-query layer that assembles a ContextWindow.
 *
 * Provides a single synchronous method: getContext(meetingId, coveredUntil).
 *
 * Two DB reads per call:
 *   1. transcript_segments — only segments after the coveredUntil watermark
 *      (those not yet compressed into an epoch summary).
 *   2. epoch_summaries — all epochs for the meeting, ordered by start time;
 *      JSON structured fields are deserialized back to arrays/records.
 *
 * ContextComposer is a pure synchronous read utility. It does not push to the
 * renderer, fire timers, or touch IPC. All external sequencing is the
 * responsibility of ContextEngine.
 */
export class ContextComposer {
  constructor(private readonly db: Database.Database) {}

  /**
   * Assemble a ContextWindow for the given meeting.
   *
   * @param meetingId   - UUID of the active meeting.
   * @param coveredUntil - RollingWindow watermark (default 0). Only segments
   *                       with timestamp_start > coveredUntil are included.
   */
  getContext(meetingId: string, coveredUntil: number = 0): ContextWindow {
    // ------------------------------------------------------------------
    // Query 1 — Rolling segments (uncompressed tail).
    //
    // Segments at or before coveredUntil have already been compressed into
    // an epoch summary; exclude them so the LLM context is not duplicated.
    // ------------------------------------------------------------------
    const rollingSegments = this.db
      .prepare(
        `SELECT id, meeting_id, speaker_label, channel, timestamp_start, timestamp_end, text
         FROM transcript_segments
         WHERE meeting_id = ? AND timestamp_start > ?
         ORDER BY timestamp_start ASC`
      )
      .all(meetingId, coveredUntil) as TranscriptSegmentRow[]

    // ------------------------------------------------------------------
    // Query 2 — Epoch summaries (all epochs for this meeting).
    //
    // Epochs are not filtered by coveredUntil — the full history of
    // compressed epochs is included regardless of the current watermark.
    // JSON-encoded columns are deserialized back to typed arrays/records.
    // ------------------------------------------------------------------
    const epochRows = this.db
      .prepare(
        `SELECT id, meeting_id, covered_interval_start, covered_interval_end,
                decisions_json, action_items_json, key_points_json,
                speaker_attributions_json, raw_segment_count, token_count_compressed,
                created_at
         FROM epoch_summaries
         WHERE meeting_id = ?
         ORDER BY covered_interval_start ASC`
      )
      .all(meetingId) as EpochSummaryRow[]

    const epochSummaries: StoredEpochSummary[] = epochRows.map((row) => ({
      id: row.id,
      meeting_id: row.meeting_id,
      covered_interval_start: row.covered_interval_start,
      covered_interval_end: row.covered_interval_end,
      decisions: JSON.parse(row.decisions_json) as string[],
      action_items: JSON.parse(row.action_items_json) as string[],
      key_points: JSON.parse(row.key_points_json) as string[],
      speaker_attributions: JSON.parse(row.speaker_attributions_json) as Record<string, string>,
      raw_segment_count: row.raw_segment_count,
      token_count_compressed: row.token_count_compressed,
      created_at: row.created_at,
    }))

    return { rollingSegments, epochSummaries }
  }
}
