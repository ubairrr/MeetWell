import { describe, it, expect, vi, afterEach } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import * as sqliteVec from 'sqlite-vec'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'

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
// Inline DDL — mirrors ALL_DDLS from src/main/store/db.ts exactly
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
// openTestDb — temp-file helper for tests (bypasses Electron safeStorage/app)
//
// Note: better-sqlite3-multiple-ciphers (SQLCipher) does NOT support
// PRAGMA key on `:memory:` databases — it requires a file-backed database.
// We use a unique temp file per test run and clean it up in afterEach.
// ---------------------------------------------------------------------------
let currentTestDbPath: string | null = null

function openTestDb(): Database.Database {
  const tmpDir = os.tmpdir()
  const dbFile = path.join(tmpDir, `meetingassist-test-${process.pid}-${Date.now()}.db`)
  currentTestDbPath = dbFile

  const db = new Database(dbFile)
  db.pragma("key = 'test-key'")
  sqliteVec.load(db)
  db.exec(ALL_DDLS)
  return db
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('DB initialization', () => {
  let db: Database.Database

  afterEach(() => {
    if (db && db.open) db.close()
    // Clean up temp DB file
    if (currentTestDbPath && fs.existsSync(currentTestDbPath)) {
      try { fs.unlinkSync(currentTestDbPath) } catch { /* ignore */ }
    }
    currentTestDbPath = null
  })

  it('opens a new database without error', () => {
    db = openTestDb()
    expect(db).toBeTruthy()
    expect(typeof db.prepare).toBe('function')
  })

  it('creates all 7 tables', () => {
    db = openTestDb()

    // Regular (non-virtual) tables
    const regularTables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name)
      .filter((name: string) => !name.startsWith('sqlite_'))

    const expectedRegular = [
      'action_items',
      'artifacts',
      'epoch_summaries',
      'meetings',
      'summary_cards',
      'transcript_segments',
    ]
    for (const t of expectedRegular) {
      expect(regularTables).toContain(t)
    }

    // vec_chunks is a virtual table — verify via sqlite_master type='table'
    // sqlite-vec registers it as a table entry in sqlite_master
    const allTableNames = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name)
    // vec_chunks shadow tables are named vec_chunks_* — the virtual table itself
    // may appear as a shadow table entry. Check by direct query in next test.
    // Here we assert the count of named tables includes our 6 regular ones.
    expect(allTableNames.length).toBeGreaterThanOrEqual(6)
  })

  it('vec_chunks virtual table is queryable', () => {
    db = openTestDb()
    expect(() => {
      db.prepare('SELECT * FROM vec_chunks LIMIT 0').all()
    }).not.toThrow()
  })

  it('is idempotent — running DDLs twice does not error', () => {
    db = openTestDb()
    expect(() => {
      db.exec(ALL_DDLS)
    }).not.toThrow()
  })
})
