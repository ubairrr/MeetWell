import { app, safeStorage } from 'electron'
import Database from 'better-sqlite3-multiple-ciphers'
import * as sqliteVec from 'sqlite-vec'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

// ---------------------------------------------------------------------------
// SQL — all 7 table DDLs (executed in a single db.exec call)
// ---------------------------------------------------------------------------
export const ALL_DDLS = `
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
  citations_json     TEXT NOT NULL DEFAULT '[]',
  is_calendar_event  INTEGER NOT NULL DEFAULT 0,
  ics_exported_at    INTEGER,
  created_at         INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
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

CREATE TABLE IF NOT EXISTS speaker_aliases (
  meeting_id      TEXT NOT NULL
    REFERENCES meetings(id) ON DELETE CASCADE,
  original_label  TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (meeting_id, original_label)
);
`

// ---------------------------------------------------------------------------
// runMigrations — idempotent schema migrations, called after ALL_DDLS
// ---------------------------------------------------------------------------
export function runMigrations(db: Database.Database): void {
  const runSafe = (sql: string) => {
    try {
      db.exec(sql)
    } catch (err: unknown) {
      if (err instanceof Error && err.message.toLowerCase().includes('duplicate column name')) return
      throw err
    }
  }

  const transcriptCols = db.pragma('table_info(transcript_segments)') as Array<{ name: string }>
  if (!transcriptCols.some((c) => c.name === 'confidence')) {
    runSafe('ALTER TABLE transcript_segments ADD COLUMN confidence REAL')
  }

  const actionCols = db.pragma('table_info(action_items)') as Array<{ name: string }>
  if (!actionCols.some((c) => c.name === 'is_calendar_event')) {
    runSafe('ALTER TABLE action_items ADD COLUMN is_calendar_event INTEGER NOT NULL DEFAULT 0')
  }
}

// ---------------------------------------------------------------------------
// openDatabase — MUST be called only inside app.whenReady()
// ---------------------------------------------------------------------------
// 4-step sequence (order is mandatory):
//   Step 1 — resolve/generate the safeStorage encryption key
//   Step 2 — open the SQLCipher database and set the PRAGMA key
//   Step 3 — load the sqlite-vec extension
//   Step 4 — execute all 7 DDLs
// ---------------------------------------------------------------------------
export function openDatabase(): Database.Database {
  // ---- Step 1: safeStorage key ----------------------------------------
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage unavailable — macOS Keychain required')
  }

  const keyFile = path.join(app.getPath('userData'), '.meetingassist.key')

  let plainKey: string
  if (fs.existsSync(keyFile)) {
    // Subsequent runs: decrypt persisted key
    const encrypted = fs.readFileSync(keyFile)
    plainKey = safeStorage.decryptString(encrypted)
  } else {
    // First run: generate, encrypt, and persist the key
    plainKey = crypto.randomBytes(32).toString('hex')
    const encrypted = safeStorage.encryptString(plainKey)
    fs.writeFileSync(keyFile, encrypted, { mode: 0o600 })
  }

  // ---- Step 2: open DB and set SQLCipher PRAGMA key --------------------
  const dbPath = path.join(app.getPath('userData'), 'meetingassist.db')
  const db = new Database(dbPath)
  db.pragma(`key = '${plainKey}'`)

  // ---- Step 3: load sqlite-vec (must precede any vec0 DDL) -------------
  sqliteVec.load(db)

  // ---- Step 4: execute all 7 DDLs -------------------------------------
  // Note: sqlite-vec virtual tables (vec_chunks) can cause issues inside an
  // explicit transaction. Executing with db.exec() directly is safe and
  // SQLite's implicit transaction handling ensures atomicity for DDL.
  db.exec(ALL_DDLS)

  // ---- Step 5: run idempotent migrations ------------------------------
  runMigrations(db)

  return db
}

export function closeDatabase(db: Database.Database): void {
  db.close()
}
