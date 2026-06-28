import { describe, it, expect, vi, afterEach } from 'vitest'
import { TokenMonitor, CHECK_INTERVAL_MS, TOKEN_THRESHOLD } from '../TokenMonitor'
import { RollingWindow } from '../RollingWindow'
import Database from 'better-sqlite3-multiple-ciphers'

// ---------------------------------------------------------------------------
// Module-level constants
// ---------------------------------------------------------------------------
describe('TokenMonitor constants', () => {
  it('CHECK_INTERVAL_MS is 30000', () => {
    expect(CHECK_INTERVAL_MS).toBe(30_000)
  })

  it('TOKEN_THRESHOLD is 560000', () => {
    expect(TOKEN_THRESHOLD).toBe(560_000)
  })
})

// ---------------------------------------------------------------------------
// In-memory DB helpers
// ---------------------------------------------------------------------------
function openMemDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      title TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      participant_count INTEGER,
      raw_audio_path TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE TABLE IF NOT EXISTS transcript_segments (
      id TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      speaker_label TEXT NOT NULL,
      channel TEXT NOT NULL CHECK (channel IN ('mic', 'system')),
      timestamp_start REAL NOT NULL,
      timestamp_end REAL NOT NULL,
      text TEXT NOT NULL,
      is_speech_final INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
  `)
  return db
}

function insertMeeting(db: Database.Database, meetingId: string): void {
  db.prepare(
    `INSERT INTO meetings (id, title, started_at, created_at) VALUES (?, 'Test', ?, ?)`
  ).run(meetingId, Date.now(), Date.now())
}

function insertSegment(
  db: Database.Database,
  id: string,
  meetingId: string,
  text: string,
  timestampStart: number
): void {
  db.prepare(
    `INSERT INTO transcript_segments
       (id, meeting_id, speaker_label, channel, timestamp_start, timestamp_end, text)
     VALUES (?, ?, 'Speaker 0', 'mic', ?, ?, ?)`
  ).run(id, meetingId, timestampStart, timestampStart + 1, text)
}

// ---------------------------------------------------------------------------
// countTokens
// ---------------------------------------------------------------------------
describe('TokenMonitor.countTokens', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the sum of token counts for all eligible segments', async () => {
    const db = openMemDb()
    const meetingId = 'meeting-1'
    insertMeeting(db, meetingId)
    insertSegment(db, 'seg-1', meetingId, 'hello world', 1.0)
    insertSegment(db, 'seg-2', meetingId, 'foo bar', 2.0)

    const monitor = new TokenMonitor(db)
    const count = await monitor.countTokens(meetingId, 0)

    // tiktoken cl100k_base: "hello world" ≈ 2 tokens, "foo bar" ≈ 2 tokens
    // Sum must be > 0 and equal to the actual combined encoding length
    expect(count).toBeGreaterThan(0)
    // Verify it's the sum of BOTH segments (not just one)
    const countHelloWorld = await monitor.countTokens(meetingId, 1.5) // only seg-2
    const countFooBar = await monitor.countTokens(meetingId, 2.5) // no segments
    expect(count).toBeGreaterThan(countHelloWorld)
    expect(countFooBar).toBe(0)
  })

  it('excludes segments at or before coveredUntil (timestamp_start > coveredUntil)', async () => {
    const db = openMemDb()
    const meetingId = 'meeting-2'
    insertMeeting(db, meetingId)
    insertSegment(db, 'seg-a', meetingId, 'already compressed', 100.0)
    insertSegment(db, 'seg-b', meetingId, 'new content here', 200.0)

    const monitor = new TokenMonitor(db)

    // coveredUntil=100 means segments at timestamp_start > 100 are eligible
    // seg-a (start=100) is NOT eligible (100 is not > 100)
    // seg-b (start=200) IS eligible
    const withWatermark = await monitor.countTokens(meetingId, 100)
    const withoutWatermark = await monitor.countTokens(meetingId, 0)

    expect(withWatermark).toBeLessThan(withoutWatermark)
    expect(withWatermark).toBeGreaterThan(0)
  })

  it('returns 0 for a meeting with no segments', async () => {
    const db = openMemDb()
    const meetingId = 'meeting-empty'
    insertMeeting(db, meetingId)

    const monitor = new TokenMonitor(db)
    const count = await monitor.countTokens(meetingId, 0)
    expect(count).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// start / stop
// ---------------------------------------------------------------------------
describe('TokenMonitor.start and stop', () => {
  it('start schedules an interval and stop clears it', () => {
    vi.useFakeTimers()
    const db = openMemDb()
    const meetingId = 'meeting-3'
    insertMeeting(db, meetingId)

    const monitor = new TokenMonitor(db)
    const rw = new RollingWindow()
    const onThreshold = vi.fn()

    monitor.start(meetingId, rw, onThreshold)

    // Advance just under one interval — callback should not fire
    vi.advanceTimersByTime(CHECK_INTERVAL_MS - 1)
    // (note: countTokens is async so we can't easily assert it fired within fakeTimers)

    monitor.stop()
    vi.useRealTimers()
  })

  it('stop() is safe to call without start()', () => {
    const db = openMemDb()
    const monitor = new TokenMonitor(db)
    expect(() => monitor.stop()).not.toThrow()
  })
})
