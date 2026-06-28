import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import * as sqliteVec from 'sqlite-vec'
import { SummaryCardStore } from '../../src/main/store/SummaryCardStore'
import { ALL_DDLS, runMigrations } from '../../src/main/store/db'

// Mock electron module — safeStorage and app are not available in Node test env
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (buf: Buffer) => buf.toString(),
  },
  app: {
    getPath: () => '/tmp/test-meetingassist',
  },
}))

// ---------------------------------------------------------------------------
// In-memory database helper — no encryption needed for unit tests
// (SummaryCardStore only needs the DB connection, not safeStorage)
// ---------------------------------------------------------------------------
function openTestDb(): Database.Database {
  const db = new Database(':memory:')
  // No PRAGMA key — in-memory, unencrypted for unit tests
  sqliteVec.load(db)
  db.exec(ALL_DDLS)
  runMigrations(db)
  return db
}

// ---------------------------------------------------------------------------
// Seed helper — insert a summary_cards row with explicit created_at
// (We bypass SummaryCardStore.saveCard() so we can control created_at precisely)
// ---------------------------------------------------------------------------
function seedCard(
  db: Database.Database,
  id: string,
  meetingId: string,
  cardIndex: number,
  createdAt: number,
): void {
  db.prepare(`
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
      ?, ?, ?, 0.0, 300.0, '0:00 – 5:00', 'Test topic',
      '["point 1"]', '[]', '{}', 'gemini-2.5-flash',
      '2026-06-28T10:00:00.000Z', ?
    )
  `).run(id, meetingId, cardIndex, createdAt)
}

// ---------------------------------------------------------------------------
// Tests — CTX-04: SummaryCardStore.getCardsSince filters by breakStartMs
// ---------------------------------------------------------------------------
describe('SummaryCardStore.getCardsSince — CTX-04 break digest window filter', () => {
  let db: Database.Database
  const meetingId = 'mtg-break-test'
  const breakStartMs = 1_700_000_000_000 // fixed epoch for determinism

  beforeEach(() => {
    db = openTestDb()
    // Insert meeting row (FK constraint)
    db.prepare(`
      INSERT INTO meetings (id, started_at, created_at)
      VALUES (?, ?, ?)
    `).run(meetingId, breakStartMs - 60_000, breakStartMs - 60_000)

    // Card A: 10 seconds BEFORE break started — must be EXCLUDED
    seedCard(db, 'card-a', meetingId, 0, breakStartMs - 10_000)
    // Card B: 5 seconds INTO break — must be INCLUDED
    seedCard(db, 'card-b', meetingId, 1, breakStartMs + 5_000)
    // Card C: 30 seconds INTO break — must be INCLUDED
    seedCard(db, 'card-c', meetingId, 2, breakStartMs + 30_000)
  })

  afterEach(() => {
    if (db && db.open) db.close()
  })

  it('returns only cards created after breakStartMs', () => {
    const store = new SummaryCardStore(db)
    const cards = store.getCardsSince(meetingId, breakStartMs)
    expect(cards).toHaveLength(2)
    const ids = cards.map((c) => c.id)
    expect(ids).toContain('card-b')
    expect(ids).toContain('card-c')
    expect(ids).not.toContain('card-a')
  })

  it('returns empty array when no cards exist after breakStartMs', () => {
    const store = new SummaryCardStore(db)
    const cards = store.getCardsSince(meetingId, breakStartMs + 60_000)
    expect(cards).toHaveLength(0)
  })

  it('returns all cards when breakStartMs is 0 (no break yet)', () => {
    const store = new SummaryCardStore(db)
    const cards = store.getCardsSince(meetingId, 0)
    expect(cards).toHaveLength(3)
  })
})
