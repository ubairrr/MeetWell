# RSCH-05: Cross-Meeting Memory Data Model Design

**Phase:** 3 — Deep Research
**Requirement:** RSCH-05
**Status:** Complete
**Date:** 2026-06-25

---

## Overview

This document specifies the cross-meeting memory data model for MeetingAssist. It uses **sqlite-vec** (`vec0` virtual tables) living inside the same **SQLCipher-encrypted database** as transcript data. Embeddings are encrypted at rest automatically — the `vec0` virtual table inherits SQLCipher's full-database AES-256 encryption with no additional configuration.

This design feeds:
- **Phase 4 AI-SPEC:** ContextEngine architecture — how the embedding pipeline and semantic retrieval service are built
- **Phase 5 PRD:** Persistence layer specification — the schema, chunking strategy, and KNN query interface

### Design Compatibility

All design decisions in this document are compatible with **DEC-02**:
- All data lives in the SQLCipher DB (encryption at rest via `safeStorage`-backed key)
- `raw_audio_path` is nullable (transcribe-then-delete-raw-audio posture per D-06)
- `ON DELETE CASCADE` on all `meeting_id` foreign keys ensures per-meeting delete works correctly (per D-07)
- Vector embeddings are derived from transcript text (not audio) — they inherit the same encryption

---

## sqlite-vec Technical Foundation

[CITED: github.com/asg017/sqlite-vec] [CITED: medium.com/@stephenc211/how-sqlite-vec-works]

| Property | Value | Notes |
|----------|-------|-------|
| npm version | `0.1.9` | Verified on npm registry |
| Language | Pure C | No external dependencies; runs anywhere SQLite runs |
| Vector storage | `vec0` virtual tables | Supports float, int8, and binary vectors |
| Query interface | `MATCH` operator + `ORDER BY distance LIMIT k` | Standard SQL KNN syntax |
| Metadata columns | Supported (`+column_name TEXT`) | Pre-filter before distance calculation |
| Transactions | Atomic | Vector inserts/updates/deletes within SQLite transactions |
| Encryption | Inherits SQLCipher | Lives in same encrypted DB; no separate key management |

### Critical Implementation Note (Pitfall 4 from RESEARCH.md)

**sqlite-vec requires explicit extension loading before any `vec0` operations.** The extension is not bundled into `better-sqlite3-multiple-ciphers`. Every time a database connection is opened, you must call:

```javascript
db.loadExtension(sqliteVecPath);
```

**The path must be resolved from the `asar-unpacked` location.** In an Electron app, the sqlite-vec native binary is in `app.asar.unpacked` — not `app.asar`. Failing to resolve from the unpacked location causes "no such table: vec_chunks" errors at runtime even though `CREATE VIRTUAL TABLE` appears to have succeeded during DB initialization.

---

## Recommended Schema

Full SQL DDL for all five tables. This schema is the authoritative design basis for the Phase 4 AI-SPEC and Phase 5 PRD persistence layer.

```sql
-- ============================================================
-- Meeting metadata (regular SQLite table, SQLCipher encrypted)
-- ============================================================
CREATE TABLE IF NOT EXISTS meetings (
  id               TEXT PRIMARY KEY,           -- UUID v4
  title            TEXT,                        -- Meeting title (may be null for untitled)
  started_at       INTEGER NOT NULL,            -- Unix timestamp (ms)
  ended_at         INTEGER,                     -- NULL until meeting ends
  participant_count INTEGER,                    -- Best estimate; may be updated post-meeting
  raw_audio_path   TEXT,                        -- NULL = deleted after transcription (D-06 default)
  created_at       INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- ============================================================
-- Transcript segments (regular table, searchable by meeting)
-- ============================================================
CREATE TABLE IF NOT EXISTS transcript_segments (
  id               TEXT PRIMARY KEY,            -- UUID v4
  meeting_id       TEXT NOT NULL
    REFERENCES meetings(id) ON DELETE CASCADE,
  speaker_label    TEXT NOT NULL,               -- "You", "Speaker 1", "Speaker 2", etc.
  channel          TEXT NOT NULL CHECK (channel IN ('mic', 'system')),
  timestamp_start  REAL NOT NULL,               -- Seconds from meeting start
  timestamp_end    REAL NOT NULL,
  text             TEXT NOT NULL,
  is_speech_final  INTEGER NOT NULL DEFAULT 1,  -- Deepgram speech_final flag (1 = final)
  created_at       INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_transcript_segments_meeting_id
  ON transcript_segments(meeting_id);

-- ============================================================
-- Vector chunks for cross-meeting semantic search
-- vec0 virtual table — REQUIRES db.loadExtension(sqliteVecPath) first
-- ============================================================
CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
  embedding     float[1536],       -- OpenAI text-embedding-3-small dimension; Gemini-compatible
  +chunk_id     TEXT,              -- UUID v4; rowid alternative for stable references
  +meeting_id   TEXT,              -- FK → meetings.id (cascade delete handled in application layer)
  +speaker_label TEXT,             -- Denormalized for display without join
  +timestamp_start REAL,           -- Meeting-relative seconds for playback seek
  +text_preview TEXT               -- First 200 chars for display without additional fetch
);

-- ============================================================
-- Artifacts: MOM, summaries, key points, action items, dates
-- ============================================================
CREATE TABLE IF NOT EXISTS artifacts (
  id             TEXT PRIMARY KEY,              -- UUID v4
  meeting_id     TEXT NOT NULL
    REFERENCES meetings(id) ON DELETE CASCADE,
  artifact_type  TEXT NOT NULL CHECK (
    artifact_type IN ('mom', 'summary', 'key_points', 'action_items', 'dates')
  ),
  content_json   TEXT NOT NULL,                 -- Structured JSON (Zod-validated LLM output)
  model_used     TEXT,                          -- "gpt-4o", "gemini-1.5-pro", etc.
  created_at     INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_artifacts_meeting_id
  ON artifacts(meeting_id);

-- ============================================================
-- Action items (first-class for calendar export and follow-up)
-- ============================================================
CREATE TABLE IF NOT EXISTS action_items (
  id              TEXT PRIMARY KEY,             -- UUID v4
  meeting_id      TEXT NOT NULL
    REFERENCES meetings(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  assignee_label  TEXT,                         -- "Speaker 2", "You", etc. (v1)
  due_date        TEXT,                         -- ISO 8601 date or NULL
  ics_exported_at INTEGER,                      -- NULL until exported; Unix timestamp (ms)
  created_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_action_items_meeting_id
  ON action_items(meeting_id);
```

### Schema Design Notes

- **`vec_chunks` uses `float[1536]`** — this dimension matches `text-embedding-3-small` (OpenAI) and is compatible with Gemini embedding models (also 1536 dimensions). Switching embedding providers requires no schema change.
- **`vec0` does not support SQLite foreign keys** — cascade delete for `vec_chunks` must be handled at the application layer when a meeting is deleted (delete all `vec_chunks` rows where `meeting_id = ?` before removing the `meetings` row, OR use a SQLite trigger).
- **Timestamps in milliseconds** — consistent with JavaScript `Date.now()` throughout the application layer; no conversion needed.
- **`is_speech_final`** — Deepgram returns intermediate (is_final=false) segments during streaming; only segments with `speech_final=true` should be persisted in `transcript_segments`. Intermediate segments drive the live UI only.

---

## Chunking Strategy

The embedding pipeline converts transcript segments into fixed-size chunks before generating embeddings for `vec_chunks`.

[CITED: qdrant.tech/course/essentials/day-1/chunking-strategies/] [ASSUMED — recommended parameters]

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Chunk unit | Contiguous transcript segments by speaker turn or topic shift | Natural semantic boundary in meeting conversation |
| Chunk size | 300–500 tokens per chunk | ~3–5 `transcript_segments` at typical speaking pace; balances specificity vs. context |
| Overlap | 50-token overlap between adjacent chunks | Prevents context split at chunk boundaries; avoids losing a sentence's meaning |
| Embedding dimension | 1536 floats | Matches `text-embedding-3-small` (OpenAI) and Gemini embedding models |
| When to embed | After `speech_final` accumulates a chunk threshold, OR at end-of-meeting batch pass | In-meeting: batch by chunk size; end-of-meeting: single pass over remaining segments |
| Privacy (DEC-02) | Embeddings derived from transcript text (not audio) | Lives in same SQLCipher DB → encrypted at rest automatically |

### Chunking Anti-Pattern (Critical)

**Do not hand-roll a tokenizer.** Off-by-one errors in chunking cause silent retrieval failures — chunks that are too large for the embedding model context window will either be truncated silently or throw an error, but the failure won't be visible in the transcript itself. Use OpenAI tiktoken or an equivalent to count tokens. [ASSUMED — from general embedding pipeline best practices]

---

## KNN Query Pattern

The standard query for finding the most relevant transcript chunks across all past meetings given a user's question:

```sql
-- Find top-5 transcript chunks most semantically similar to a query embedding.
-- The query embedding is computed from the user's question text using the same
-- embedding model used during chunk creation.
SELECT
  vc.chunk_id,
  vc.meeting_id,
  vc.speaker_label,
  vc.timestamp_start,
  vc.text_preview,
  vc.distance,       -- Lower = more similar; no unit (cosine-like metric)
  m.title,
  m.started_at
FROM vec_chunks AS vc
JOIN meetings AS m ON m.id = vc.meeting_id
WHERE vc.embedding MATCH ?      -- ? = query embedding as JSON array or binary blob
ORDER BY vc.distance
LIMIT 5;
```

**Usage pattern:** The ContextEngine embeds the user's question, runs this query, fetches the full `transcript_segments` for the returned `chunk_id`s, and includes the retrieved segments as context in the LLM prompt for the cross-meeting Q&A response.

**Pre-filter opportunity:** Add `AND vc.meeting_id IN (...)` before the `MATCH` clause to restrict search to a subset of meetings (e.g., last 30 days, a specific project). Metadata columns in `vec0` support pre-filtering before distance calculation.

---

## In-Meeting vs Cross-Meeting Architecture

| Use Case | Approach | Rationale |
|----------|----------|-----------|
| In-meeting chat ("What did she just say?") | Rolling transcript in LLM context (1M token window) | No embeddings needed; current meeting fits in context window; real-time latency matters |
| End-of-meeting summary / MOM | Full transcript → LLM batch | Single pass over complete meeting; no retrieval needed; all context available |
| Cross-meeting recall ("What did we decide about auth last month?") | `sqlite-vec` KNN + `transcript_segments` fetch | Past meetings don't fit in context; semantic search surfaces the relevant 300–500 token chunks efficiently |

**Architecture implication:** The embedding pipeline only needs to run for cross-meeting use cases. In-meeting intelligence uses the raw rolling transcript — no embedding computation needed during the live session. This keeps latency low during the meeting and defers the embedding work to either (a) the end-of-meeting batch or (b) a background process after the user closes the meeting.

---

## Open Questions for PRD and AI-SPEC

1. **Which embedding model should be the default?**
   - **Recommendation:** Apply the same `baseURL` adapter pattern to embeddings as to the LLM layer. The embedding provider is configurable, not hardcoded. The 1536-dimension schema works for both OpenAI `text-embedding-3-small` and Gemini embedding models without schema changes.

2. **Token counting for chunking:**
   - Use OpenAI tiktoken or a compatible library — do not hand-roll a tokenizer. Silent truncation from off-by-one errors in chunking causes retrieval failures that are hard to diagnose. [ASSUMED — from embedding pipeline best practices]

3. **When does the embedding pipeline run?**
   - Option A: During the meeting, after each chunk threshold is met (real-time embedding)
   - Option B: After the meeting ends, in a single batch pass (deferred embedding)
   - **Recommendation for PRD:** Option B (deferred batch) for v1. Eliminates the API call during the live meeting and keeps in-meeting latency low. The cross-meeting search feature is not time-critical — it's a post-meeting lookup, not a live feature.

4. **`vec_chunks` cascade delete:**
   - Since `vec0` virtual tables don't support SQLite foreign key cascade constraints, deleting a meeting requires an explicit delete of `vec_chunks` rows at the application layer (or a SQLite trigger). The AI-SPEC must specify the meeting deletion transaction sequence.

---

## DEC-02 Compatibility

This schema is fully compatible with the DEC-02 data-handling ADR:

| DEC-02 Requirement | Schema Compliance |
|--------------------|-------------------|
| All data stored locally, encrypted at rest | ✓ — All five tables live in the SQLCipher DB (AES-256, key via `safeStorage`) |
| Raw audio deleted by default after transcription (D-06) | ✓ — `raw_audio_path TEXT` is nullable; NULL is the default state after transcription completes |
| Per-meeting delete supported (D-07) | ✓ — `ON DELETE CASCADE` on `meeting_id` FKs; `vec_chunks` handled at app layer |
| Vector embeddings encrypted at rest | ✓ — `vec0` inherits SQLCipher encryption automatically |
| safeStorage for key management | ✓ — Schema has no key management; uses the existing DEC-02 `safeStorage` → Keychain stack |
