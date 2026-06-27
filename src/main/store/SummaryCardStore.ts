import Database from 'better-sqlite3-multiple-ciphers'
import * as crypto from 'crypto'
import type { SummaryCard, StoredSummaryCard } from '../../shared/schemas/index'

export class SummaryCardStore {
  private readonly db: Database.Database
  private readonly stmtInsert: Database.Statement
  private readonly stmtSelectByMeeting: Database.Statement
  private readonly stmtSelectSince: Database.Statement

  constructor(db: Database.Database) {
    this.db = db

    this.stmtInsert = this.db.prepare(`
      INSERT INTO summary_cards (
        id,
        meeting_id,
        card_index,
        interval_start_seconds,
        interval_end_seconds,
        wall_time_label,
        topic_headline,
        key_points_json,
        action_items_mentioned_json,
        speaker_contributions_json,
        model_used,
        generated_at,
        created_at
      ) VALUES (
        @id,
        @meeting_id,
        @card_index,
        @interval_start_seconds,
        @interval_end_seconds,
        @wall_time_label,
        @topic_headline,
        @key_points_json,
        @action_items_mentioned_json,
        @speaker_contributions_json,
        @model_used,
        @generated_at,
        @created_at
      )
    `)

    this.stmtSelectByMeeting = this.db.prepare(`
      SELECT * FROM summary_cards
      WHERE meeting_id = ?
      ORDER BY card_index ASC
    `)

    this.stmtSelectSince = this.db.prepare(`
      SELECT * FROM summary_cards
      WHERE meeting_id = ? AND created_at > ?
      ORDER BY created_at DESC
    `)
  }

  saveCard(
    meetingId: string,
    cardIndex: number,
    intervalStartSec: number,
    intervalEndSec: number,
    wallTimeLabel: string,
    card: SummaryCard,
    modelUsed: string,
  ): string {
    const id = crypto.randomUUID()
    const generated_at = new Date().toISOString()

    this.stmtInsert.run({
      id,
      meeting_id: meetingId,
      card_index: cardIndex,
      interval_start_seconds: intervalStartSec,
      interval_end_seconds: intervalEndSec,
      wall_time_label: wallTimeLabel,
      topic_headline: card.topic_headline,
      key_points_json: JSON.stringify(card.key_points),
      action_items_mentioned_json: '[]',
      speaker_contributions_json: JSON.stringify(card.speaker_contributions),
      model_used: modelUsed,
      generated_at,
      created_at: Date.now(),
    })

    return id
  }

  getCardsForMeeting(meetingId: string): StoredSummaryCard[] {
    const rows = this.stmtSelectByMeeting.all(meetingId) as Record<string, unknown>[]
    return rows.map((row) => this.rowToStoredCard(row))
  }

  getCardsSince(meetingId: string, sinceMs: number): StoredSummaryCard[] {
    const rows = this.stmtSelectSince.all(meetingId, sinceMs) as Record<string, unknown>[]
    return rows.map((row) => this.rowToStoredCard(row))
  }

  private rowToStoredCard(row: Record<string, unknown>): StoredSummaryCard {
    return {
      id: row.id as string,
      meeting_id: row.meeting_id as string,
      card_index: row.card_index as number,
      interval_start_seconds: row.interval_start_seconds as number,
      interval_end_seconds: row.interval_end_seconds as number,
      wall_time_label: row.wall_time_label as string,
      topic_headline: row.topic_headline as string,
      key_points: JSON.parse(row.key_points_json as string) as string[],
      action_items_mentioned: JSON.parse(row.action_items_mentioned_json as string) as string[],
      speaker_contributions: JSON.parse(row.speaker_contributions_json as string) as Record<
        string,
        string
      >,
      model_used: row.model_used as string,
      generated_at: row.generated_at as string,
      created_at: row.created_at as number,
    }
  }
}
