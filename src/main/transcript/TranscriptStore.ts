import type Database from 'better-sqlite3-multiple-ciphers'

export interface TranscriptSegmentRow {
  id: string
  meetingId: string
  speakerLabel: string
  channel: 'mic' | 'system'
  timestampStart: number
  timestampEnd: number
  text: string
  isSpeechFinal: 1
  confidence: number | null
  createdAt: number
}

export class TranscriptStore {
  private insertMeetingStmt: Database.Statement
  private insertSegmentStmt: Database.Statement
  private getSegmentsStmt: Database.Statement

  constructor(private db: Database.Database) {
    this.insertMeetingStmt = db.prepare(
      'INSERT INTO meetings (id, started_at, created_at) VALUES (?, ?, ?)'
    )
    this.insertSegmentStmt = db.prepare(
      'INSERT INTO transcript_segments (id, meeting_id, speaker_label, channel, timestamp_start, timestamp_end, text, is_speech_final, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    this.getSegmentsStmt = db.prepare(
      'SELECT id, meeting_id, speaker_label, channel, timestamp_start, timestamp_end, text, is_speech_final, confidence, created_at FROM transcript_segments WHERE meeting_id = ? ORDER BY timestamp_start ASC'
    )
  }

  createMeeting(meetingId: string, startedAt: number): void {
    this.insertMeetingStmt.run(meetingId, startedAt, Date.now())
  }

  appendSegment(row: TranscriptSegmentRow): void {
    this.insertSegmentStmt.run(
      row.id,
      row.meetingId,
      row.speakerLabel,
      row.channel,
      row.timestampStart,
      row.timestampEnd,
      row.text,
      row.isSpeechFinal,
      row.confidence,
      row.createdAt
    )
  }

  getSegmentsByMeeting(meetingId: string): TranscriptSegmentRow[] {
    const rows = this.getSegmentsStmt.all(meetingId) as Array<{
      id: string
      meeting_id: string
      speaker_label: string
      channel: 'mic' | 'system'
      timestamp_start: number
      timestamp_end: number
      text: string
      is_speech_final: 1
      confidence: number | null
      created_at: number
    }>
    return rows.map((r) => ({
      id: r.id,
      meetingId: r.meeting_id,
      speakerLabel: r.speaker_label,
      channel: r.channel,
      timestampStart: r.timestamp_start,
      timestampEnd: r.timestamp_end,
      text: r.text,
      isSpeechFinal: r.is_speech_final,
      confidence: r.confidence,
      createdAt: r.created_at,
    }))
  }
}
