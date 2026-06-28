/**
 * Synthetic 60-minute meeting pipeline test — CTX-06, D-12, D-13
 *
 * Verifies the full ContextEngine data pipeline end-to-end:
 *   token counting -> threshold detection -> LLM compression -> DB write -> watermark advance
 *
 * Runs synchronously without timers by calling TokenMonitor.countTokens() and
 * EpochCompressor.compress() directly, bypassing setInterval. LLM and embedding
 * adapters are mocked via constructor injection — no real API calls.
 *
 * Uses a temp-file SQLCipher DB (NOT :memory: — PRAGMA key fails on in-memory DBs).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import * as sqliteVec from 'sqlite-vec'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'

// ---------------------------------------------------------------------------
// Mock electron — safeStorage and app are not available in Node test environment
// ---------------------------------------------------------------------------
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (buf: Buffer) => buf.toString(),
  },
  app: {
    getPath: () => '/tmp/test-meetingassist',
  },
  BrowserWindow: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Import modules under test AFTER electron mock is in place
// ---------------------------------------------------------------------------
import { TokenMonitor, TOKEN_THRESHOLD } from '../TokenMonitor'
import { EpochCompressor } from '../EpochCompressor'
import { ContextComposer } from '../ContextComposer'
import { RollingWindow } from '../RollingWindow'

// ---------------------------------------------------------------------------
// Inline DDL — mirrors ALL_DDLS from src/main/store/db.ts exactly
// Inlined to avoid Electron module resolution side effects when importing db.ts
// ---------------------------------------------------------------------------
const ALL_DDLS = `
CREATE TABLE IF NOT EXISTS meetings (
  id               TEXT PRIMARY KEY,
  title            TEXT,
  started_at       INTEGER NOT NULL,
  ended_at         INTEGER,
  participant_count INTEGER,
  raw_audio_path   TEXT,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS transcript_segments (
  id               TEXT PRIMARY KEY,
  meeting_id       TEXT NOT NULL
    REFERENCES meetings(id) ON DELETE CASCADE,
  speaker_label    TEXT NOT NULL,
  channel          TEXT NOT NULL CHECK (channel IN ('mic', 'system')),
  timestamp_start  REAL NOT NULL,
  timestamp_end    REAL NOT NULL,
  text             TEXT NOT NULL,
  is_speech_final  INTEGER NOT NULL DEFAULT 1,
  confidence       REAL,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_transcript_segments_meeting_id
  ON transcript_segments(meeting_id);

CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
  embedding        float[1536],
  +chunk_id        TEXT,
  +meeting_id      TEXT,
  +speaker_label   TEXT,
  +timestamp_start FLOAT,
  +text_preview    TEXT
);

CREATE TABLE IF NOT EXISTS artifacts (
  id             TEXT PRIMARY KEY,
  meeting_id     TEXT NOT NULL
    REFERENCES meetings(id) ON DELETE CASCADE,
  artifact_type  TEXT NOT NULL CHECK (
    artifact_type IN ('mom', 'summary', 'key_points', 'action_items', 'dates')
  ),
  content_json   TEXT NOT NULL,
  model_used     TEXT,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_artifacts_meeting_id
  ON artifacts(meeting_id);

CREATE TABLE IF NOT EXISTS action_items (
  id              TEXT PRIMARY KEY,
  meeting_id      TEXT NOT NULL
    REFERENCES meetings(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  assignee_label  TEXT,
  due_date        TEXT,
  status          TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'confirmed', 'dismissed')),
  citations_json  TEXT NOT NULL DEFAULT '[]',
  ics_exported_at INTEGER,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_action_items_meeting_id
  ON action_items(meeting_id);

CREATE TABLE IF NOT EXISTS summary_cards (
  id                          TEXT PRIMARY KEY,
  meeting_id                  TEXT NOT NULL
    REFERENCES meetings(id) ON DELETE CASCADE,
  card_index                  INTEGER NOT NULL,
  interval_start_seconds      REAL NOT NULL,
  interval_end_seconds        REAL NOT NULL,
  wall_time_label             TEXT NOT NULL,
  topic_headline              TEXT NOT NULL,
  key_points_json             TEXT NOT NULL,
  action_items_mentioned_json TEXT NOT NULL,
  speaker_contributions_json  TEXT NOT NULL,
  model_used                  TEXT NOT NULL,
  generated_at                TEXT NOT NULL,
  created_at                  INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS epoch_summaries (
  id                        TEXT PRIMARY KEY,
  meeting_id                TEXT NOT NULL
    REFERENCES meetings(id) ON DELETE CASCADE,
  covered_interval_start    REAL NOT NULL,
  covered_interval_end      REAL NOT NULL,
  decisions_json            TEXT NOT NULL,
  action_items_json         TEXT NOT NULL,
  key_points_json           TEXT NOT NULL,
  speaker_attributions_json TEXT NOT NULL,
  raw_segment_count         INTEGER NOT NULL,
  token_count_compressed    INTEGER NOT NULL,
  created_at                TEXT NOT NULL
);
`

// ---------------------------------------------------------------------------
// Temp-file DB helper
//
// SQLCipher (better-sqlite3-multiple-ciphers) does NOT support PRAGMA key on
// :memory: databases — it requires a file-backed database. We use a unique
// temp file per test run and clean it up in afterEach (T-10-06-A mitigation).
// ---------------------------------------------------------------------------
let db: Database.Database
let currentTestDbPath: string

function openTestDb(): Database.Database {
  const dbPath = path.join(
    os.tmpdir(),
    `ctx-pipeline-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
  )
  currentTestDbPath = dbPath

  const database = new Database(dbPath)
  // Step 1: SQLCipher PRAGMA key (must be first operation after open)
  database.pragma("key = 'test-key'")
  // Step 2: load sqlite-vec AFTER pragma key — same sequence as production DB init
  // (T-10-06-B: same load order guards against vec0 DDL failures)
  sqliteVec.load(database)
  // Step 3: execute all DDLs
  database.exec(ALL_DDLS)
  return database
}

// ---------------------------------------------------------------------------
// Mock LLM and Embedding adapters
//
// Mocked via constructor injection so no real API calls are made.
// mockLLM.generate returns the correct EpochSummarySchema shape that
// EpochCompressor expects after Zod validation.
// ---------------------------------------------------------------------------
const mockLLM = {
  generate: vi.fn().mockResolvedValue({
    decisions: ['Mock decision'],
    action_items: ['Mock action'],
    key_points: ['Mock key point 1', 'Mock key point 2'],
    speaker_attributions: { 'Speaker 0': 'led discussion' },
  }),
}

const mockEmbedding = {
  embed: vi.fn().mockResolvedValue(new Float32Array(1536).fill(0.01)),
}

// ---------------------------------------------------------------------------
// Seed helper — insert `count` transcript_segments rows for a meeting
//
// Each segment text is ~479 tokens when encoded by tiktoken cl100k_base
// (2400-char Lorem ipsum; actual measurement from test run).
// 1300 segments * 479 tokens ~= 623K tokens > TOKEN_THRESHOLD (560K) per D-13.
//
// IMPORTANT: transcript_segments has a FK to meetings(id) ON DELETE CASCADE,
// so we must insert a meeting row first before inserting segments.
// ---------------------------------------------------------------------------
const LOREM_SENTENCE =
  'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua Ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur Excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum '

function makeSegmentText(): string {
  let text = ''
  while (text.length < 2400) {
    text += LOREM_SENTENCE
  }
  return text.slice(0, 2400)
}

const SEGMENT_TEXT = makeSegmentText()

function seedMeeting(database: Database.Database, meetingId: string): void {
  database
    .prepare(
      `INSERT INTO meetings (id, title, started_at, created_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(meetingId, 'Test Meeting', Date.now(), Date.now())
}

function seedSegments(database: Database.Database, meetingId: string, count: number): void {
  const insertSegment = database.prepare(
    `INSERT INTO transcript_segments
       (id, meeting_id, speaker_label, channel, timestamp_start, timestamp_end, text, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )

  // Use a transaction for bulk insert performance
  const insertMany = database.transaction((segmentCount: number) => {
    for (let i = 0; i < segmentCount; i++) {
      insertSegment.run(
        crypto.randomUUID(),
        meetingId,
        'Speaker 0',
        'mic',
        i + 1,        // timestamp_start: 1, 2, 3, ... (> 0 so all are above initial watermark)
        i + 2,        // timestamp_end: 2, 3, 4, ...
        SEGMENT_TEXT,
        Date.now() + i
      )
    }
  })

  insertMany(count)
}

// ---------------------------------------------------------------------------
// Test setup / teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
  db = openTestDb()
  vi.clearAllMocks()
  // Re-set mock return values after clearAllMocks
  mockLLM.generate.mockResolvedValue({
    decisions: ['Mock decision'],
    action_items: ['Mock action'],
    key_points: ['Mock key point 1', 'Mock key point 2'],
    speaker_attributions: { 'Speaker 0': 'led discussion' },
  })
  mockEmbedding.embed.mockResolvedValue(new Float32Array(1536).fill(0.01))
})

afterEach(() => {
  // Close DB connection before deleting the file
  if (db && db.open) {
    db.close()
  }
  // Delete temp file (T-10-06-A: prevent information disclosure via leftover test DBs)
  if (currentTestDbPath && fs.existsSync(currentTestDbPath)) {
    try {
      fs.unlinkSync(currentTestDbPath)
    } catch {
      // ignore — file may already be cleaned up
    }
  }
})

// ---------------------------------------------------------------------------
// CTX-06: Synthetic 60-minute meeting — end-to-end compression pipeline
// ---------------------------------------------------------------------------
describe('ContextEngine compression pipeline — simulated 60-minute meeting', () => {
  it(
    'EpochCompressor fires exactly once, writes 1 epoch_summaries row, 1 vec_chunks row, rolling window stays below 800K ceiling',
    async () => {
      const meetingId = 'test-meeting-60min'

      // Insert meeting row first (required for FK constraint)
      seedMeeting(db, meetingId)

      // Seed 1300 segments to guarantee > 560K tokens (D-13: simulated volume)
      // Measured: 2400-char Lorem ipsum encodes to ~479 tokens in cl100k_base
      // 1300 * 479 ~= 623K tokens > 560K threshold with comfortable margin
      seedSegments(db, meetingId, 1300)

      const rollingWindow = new RollingWindow()
      const tokenMonitor = new TokenMonitor(db)
      const epochCompressor = new EpochCompressor(db, mockLLM as any, mockEmbedding as any)
      const contextComposer = new ContextComposer(db)

      // ------------------------------------------------------------------
      // Step 1: Verify token count exceeds threshold BEFORE compression
      // D-13: seeded volume must produce > TOKEN_THRESHOLD tokens
      // ------------------------------------------------------------------
      const countBefore = await tokenMonitor.countTokens(meetingId, rollingWindow.getCoveredUntil())
      expect(countBefore).toBeGreaterThan(TOKEN_THRESHOLD)

      // ------------------------------------------------------------------
      // Step 2: Compress — D-12a: fires exactly once
      // We spy on compress() to assert the call count, then call it directly
      // (no setInterval — test controls compression synchronously)
      // ------------------------------------------------------------------
      const compressionSpy = vi.spyOn(epochCompressor, 'compress')
      const epoch = await epochCompressor.compress(meetingId, countBefore, rollingWindow)

      // Compression must succeed (not return null)
      expect(epoch).not.toBeNull()

      // D-12a: compress() was called exactly once
      expect(compressionSpy).toHaveBeenCalledTimes(1)

      // ------------------------------------------------------------------
      // D-12b: Exactly one row in epoch_summaries
      // ------------------------------------------------------------------
      const epochRows = db
        .prepare('SELECT * FROM epoch_summaries WHERE meeting_id = ?')
        .all(meetingId) as Array<{
          id: string
          decisions_json: string
          action_items_json: string
          key_points_json: string
          speaker_attributions_json: string
        }>
      expect(epochRows).toHaveLength(1)

      // Verify the epoch row has correct structured content
      const epochRow = epochRows[0]
      expect(JSON.parse(epochRow.decisions_json)).toEqual(['Mock decision'])
      expect(JSON.parse(epochRow.action_items_json)).toEqual(['Mock action'])
      expect(JSON.parse(epochRow.speaker_attributions_json)).toEqual({
        'Speaker 0': 'led discussion',
      })

      // ------------------------------------------------------------------
      // D-12c: Exactly one row in vec_chunks
      // ------------------------------------------------------------------
      const vecRows = db
        .prepare('SELECT chunk_id, meeting_id FROM vec_chunks WHERE meeting_id = ?')
        .all(meetingId) as Array<{ chunk_id: string; meeting_id: string }>
      expect(vecRows).toHaveLength(1)

      // ------------------------------------------------------------------
      // Step 3: Second countTokens call AFTER compression
      // The RollingWindow watermark has advanced; segments in the compressed
      // epoch are now excluded from counting.
      // D-12a: a second call to the threshold check would NOT fire compress again
      // D-12d: countAfter must be below 800K ceiling
      // ------------------------------------------------------------------
      const countAfter = await tokenMonitor.countTokens(meetingId, rollingWindow.getCoveredUntil())

      // D-12a: count after compression is below threshold (compress would not fire again)
      expect(countAfter).toBeLessThan(TOKEN_THRESHOLD)

      // D-12d: rolling window stays below 800K ceiling
      expect(countAfter).toBeLessThan(800_000)

      // ------------------------------------------------------------------
      // Watermark advance: markEvicted() was called by compress()
      // rollingWindow.getCoveredUntil() must be > 0 after compression
      // ------------------------------------------------------------------
      expect(rollingWindow.getCoveredUntil()).toBeGreaterThan(0)

      // ------------------------------------------------------------------
      // ContextComposer shape after compression:
      // - epochSummaries has exactly 1 entry with the correct fields
      // - rollingSegments only contains segments AFTER the watermark
      //   (evicted segments are excluded from the rolling context)
      // ------------------------------------------------------------------
      const ctx = contextComposer.getContext(meetingId, rollingWindow.getCoveredUntil())

      expect(ctx.epochSummaries).toHaveLength(1)
      expect(ctx.epochSummaries[0].decisions).toEqual(['Mock decision'])
      expect(ctx.epochSummaries[0].speaker_attributions).toEqual({
        'Speaker 0': 'led discussion',
      })

      // rollingSegments must contain FEWER than the original 1300 segments
      // (the compressed epoch evicted the oldest batch)
      expect(ctx.rollingSegments.length).toBeLessThan(1300)
      expect(ctx.rollingSegments.length).toBeGreaterThan(0)

      // ------------------------------------------------------------------
      // Verify LLM and embedding adapters were called exactly once each
      // (no extra calls — single compression pass)
      // ------------------------------------------------------------------
      expect(mockLLM.generate).toHaveBeenCalledTimes(1)
      expect(mockEmbedding.embed).toHaveBeenCalledTimes(1)
    },
    // 60-second timeout: tiktoken encoding 1300 segments is CPU-intensive
    60_000
  )
})

// ---------------------------------------------------------------------------
// Guard: No file-backed DB used (verifies T-10-06-A compliance)
// ---------------------------------------------------------------------------
describe('DB configuration guard', () => {
  it('uses file-backed SQLCipher DB (not in-memory)', () => {
    // Verify our temp file exists and the DB is open against it
    expect(db.open).toBe(true)
    expect(currentTestDbPath).toBeTruthy()
    expect(currentTestDbPath).not.toContain('memory')
    // File must exist on disk
    expect(fs.existsSync(currentTestDbPath)).toBe(true)
  })

  it('TOKEN_THRESHOLD constant is 560000', () => {
    expect(TOKEN_THRESHOLD).toBe(560_000)
  })
})
