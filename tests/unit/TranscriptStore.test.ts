import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import * as sqliteVec from 'sqlite-vec'
import { TranscriptStore, type TranscriptSegmentRow } from '../../src/main/transcript/TranscriptStore'
import { ALL_DDLS, runMigrations } from '../../src/main/store/db'

// ---------------------------------------------------------------------------
// In-memory database helper — no encryption needed for unit tests
// ---------------------------------------------------------------------------
function openTestDb(): Database.Database {
  const db = new Database(':memory:')
  // No PRAGMA key — in-memory, unencrypted for unit tests
  sqliteVec.load(db)
  db.exec(ALL_DDLS)
  runMigrations(db)
  return db
}

function makeSegment(overrides: Partial<TranscriptSegmentRow> = {}): TranscriptSegmentRow {
  return {
    id: 'seg-1',
    meetingId: 'mtg-1',
    speakerLabel: 'Speaker 0',
    channel: 'mic',
    timestampStart: 1.0,
    timestampEnd: 2.5,
    text: 'Hello world',
    isSpeechFinal: 1,
    confidence: 0.95,
    createdAt: Date.now(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('TranscriptStore', () => {
  let db: Database.Database
  let store: TranscriptStore

  beforeEach(() => {
    db = openTestDb()
    store = new TranscriptStore(db)
  })

  afterEach(() => {
    if (db && db.open) db.close()
  })

  it('createMeeting inserts a meetings row', () => {
    store.createMeeting('mtg-1', Date.now())
    const row = db.prepare('SELECT id FROM meetings WHERE id = ?').get('mtg-1') as { id: string } | undefined
    expect(row).toBeDefined()
    expect(row!.id).toBe('mtg-1')
  })

  it('appendSegment writes a transcript_segments row with confidence', () => {
    store.createMeeting('mtg-1', Date.now())
    const seg = makeSegment({ id: 'seg-conf', confidence: 0.92 })
    store.appendSegment(seg)
    const row = db
      .prepare('SELECT confidence FROM transcript_segments WHERE id = ?')
      .get('seg-conf') as { confidence: number | null } | undefined
    expect(row).toBeDefined()
    expect(row!.confidence).toBeCloseTo(0.92)
  })

  it('appendSegment with null confidence stores NULL', () => {
    store.createMeeting('mtg-1', Date.now())
    const seg = makeSegment({ id: 'seg-null', confidence: null })
    store.appendSegment(seg)
    const row = db
      .prepare('SELECT confidence FROM transcript_segments WHERE id = ?')
      .get('seg-null') as { confidence: number | null } | undefined
    expect(row).toBeDefined()
    expect(row!.confidence).toBeNull()
  })

  it('getSegmentsByMeeting returns rows ordered by timestampStart', () => {
    store.createMeeting('mtg-1', Date.now())
    const now = Date.now()
    store.appendSegment(makeSegment({ id: 'seg-10', timestampStart: 10.0, timestampEnd: 11.0, createdAt: now }))
    store.appendSegment(makeSegment({ id: 'seg-5', timestampStart: 5.0, timestampEnd: 6.0, createdAt: now }))
    store.appendSegment(makeSegment({ id: 'seg-15', timestampStart: 15.0, timestampEnd: 16.0, createdAt: now }))

    const rows = store.getSegmentsByMeeting('mtg-1')
    expect(rows).toHaveLength(3)
    expect(rows[0].timestampStart).toBe(5.0)
    expect(rows[1].timestampStart).toBe(10.0)
    expect(rows[2].timestampStart).toBe(15.0)
  })

  it('runMigrations is idempotent — calling twice does not error, confidence column appears exactly once', () => {
    // runMigrations was already called in openTestDb(); call it a second time
    expect(() => runMigrations(db)).not.toThrow()

    // Confirm exactly one confidence column in PRAGMA output
    const columns = db.pragma('table_info(transcript_segments)') as Array<{ name: string }>
    const confidenceCols = columns.filter((c) => c.name === 'confidence')
    expect(confidenceCols).toHaveLength(1)
  })
})
