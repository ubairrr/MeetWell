# Phase 10: ContextEngine + Break Assist - Research

**Researched:** 2026-06-28
**Domain:** ContextEngine orchestration, token-budget management, epoch compression, embedding storage, Break Assist completion
**Confidence:** MEDIUM

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Epoch window is token-count-based. TokenMonitor counts tokens in `transcript_segments` via `tiktoken cl100k_base`. When the rolling window reaches 560,000 tokens (70% of 800K ceiling), EpochCompressor fires.
- **D-02:** EpochCompressor compresses the oldest segments first (lowest timestamp). It evicts enough segments to bring the rolling window below 50% capacity. The exact N of segments to evict is determined by TokenMonitor at compression time — planner picks the implementation.
- **D-03:** Each epoch produces one `epoch_summaries` DB record in the structured `EpochSummarySchema` format defined in AI-SPEC §2.5: `epoch_id`, `decisions[]`, `action_items[]`, `key_points[]`, `speaker_contributions`. This is a Zod schema — use `zod-to-json-schema` to derive the LLM response schema (same pattern as Phase 8 ArtifactPipeline).
- **D-04:** EpochCompressor reads from `transcript_segments` ONLY — never from `summary_cards` (AI-SPEC §2.2 Pitfall 4, hardcoded constraint).
- **D-05:** Epoch embeddings use Gemini text-embedding only for v1. The EmbeddingAdapter calls Gemini's text-embedding model via the same `openai` SDK + `baseURL` pattern used for LLM calls. Output dimension: 1536 (matches `vec_chunks float[1536]` schema). If Gemini doesn't natively output 1536 dims, use `output_dimensionality: 1536` parameter (researcher to confirm Gemini model name + parameter support).
- **D-06:** Each epoch summary is embedded as a single concatenated text string (all structured fields joined) → one vector per epoch stored in `vec_chunks`. The `text_preview` field in `vec_chunks` stores the epoch's `key_points` bullets.
- **D-07:** ContextComposer is v1 infrastructure for the v2 Live Assistant — it is NOT wired into any active v1 user flow. It returns a `ContextWindow` (`rollingSegments[]` + `epochSummaries[]`) and is tested via the synthetic 60-minute Vitest test. The `ContextEnginePort` interface (`start(meetingId)`, `stop()`, `getContext(): ContextWindow`, `onEpochCompressed(cb)`) is implemented per ARCHITECTURE.md §6.8.
- **D-08:** SummaryCardTimer (Phase 9) is NOT retrofitted to go through ContextComposer. It continues to query `transcript_segments` directly for its 5-minute window. ArtifactPipeline (Phase 8) is also NOT touched.
- **D-09:** Break Assist stays at the Phase 9 behavior — BreakAssistDigest shows only summary cards from the break window, newest first. No LLM narrative digest call on "I'm Back". ContextComposer is NOT used for the break digest.
- **D-10:** The break digest shows cards-only always — epoch summaries are NOT displayed to the user even if an epoch was compressed during the break.
- **D-11:** `break_start_timestamp` must be recorded in the `meetings` table (or held in-memory in SessionManager) when the user triggers "Going on Break", so SummaryCardStore can filter cards by `created_at >= break_start_timestamp` for the digest.
- **D-12:** The 60-minute test is a Vitest unit test in `src/main/context/__tests__/`. It seeds the DB with enough synthetic `transcript_segments` rows to reach 560K tokens, runs ContextEngine, and asserts: (a) EpochCompressor fires exactly once, (b) one `epoch_summaries` record is created, (c) one `vec_chunks` embedding is stored, (d) rolling window stays below 800K ceiling after compression.
- **D-13:** "60-minute" refers to simulated transcript volume (enough tokens to exceed the threshold), not real wall-clock time. The test uses synthetic segments with the minimum content needed to reach 560K tokens.

### Claude's Discretion

- Gemini embedding model name + `output_dimensionality` parameter: researcher to confirm which Gemini embedding model supports 1536 dims via the openai SDK `baseURL` adapter. The 1536-dim output must match `vec_chunks float[1536]` schema — no schema migration permitted.
- Exact N of segments to evict in each epoch: TokenMonitor calculates this at compression time to bring the rolling window below 50% capacity. Leave exact formula to planner.
- ContextEngine.ts internal architecture: How ContextEngine orchestrates SummaryCardTimer (already exists), TokenMonitor, EpochCompressor, and ContextComposer. Whether it subclasses or composes. Leave to planner per ARCHITECTURE.md §6.8.

### Deferred Ideas (OUT OF SCOPE)

- RAG retrieval (vec_chunks semantic search): vec_chunks is populated with epoch embeddings in Phase 10, but semantic retrieval queries are v2 (Live Assistant chat UI).
- "While you were away" LLM narrative digest: This is v2 when the Live Assistant ContextComposer is wired into user-facing flows. Phase 10 keeps Phase 9 behavior (cards only, no LLM narrative).
- Cross-meeting search UX: sqlite-vec DB schema and epoch embeddings are v1 infrastructure. The search UX querying across past meetings is post-launch v2.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CTX-01 | ContextEngine maintains a rolling meeting context using EpochCompressor reading from `transcript_segments` ONLY — never from `summary_cards` | TokenMonitor + RollingWindow design; tiktoken import pattern confirmed in codebase |
| CTX-02 | EpochCompressor compresses completed epoch windows into `epoch_summaries` table entries | epoch_summaries DDL already in db.ts; EpochSummarySchema to be added to schemas/index.ts; LLMAdapter reused |
| CTX-03 | Summary cards are generated from the rolling context as a side effect of the passive path; stored in `summary_cards` table | SummaryCardTimer already exists (Phase 9); ContextEngine wraps it with lifecycle control |
| CTX-04 | Break assist shows a digest of all content missed during break when "I'm Back" is triggered; digest uses `summary_cards` generated during the break window | ALREADY WIRED in main/index.ts via breakStartMs + getCardsSince — see "Already Implemented" section |
| CTX-05 | SessionManager FSM transitions correctly through Capturing → OnBreak → Capturing cycle | ALREADY IMPLEMENTED (Phase 9) — FSM has OnBreak state; start-break/end-break handlers wired |
| CTX-06 | A 60-minute meeting test completes without memory pressure or token budget overflow | Vitest unit test; must use temp-file DB (not :memory:) per SQLCipher constraint; embed call mocked |
</phase_requirements>

---

## Summary

Phase 10 completes the ContextEngine stack by building the token-monitoring, epoch-compression, and embedding infrastructure that sits alongside the already-working SummaryCardTimer. The majority of Break Assist (CTX-04, CTX-05) was completed in Phase 9 — `breakStartMs` is already tracked in `src/main/index.ts` and `SummaryCardStore.getCardsSince()` is already wired into the `end-break` handler. The net-new work is: creating `EmbeddingAdapter.ts`, `RollingWindow.ts`, `TokenMonitor.ts`, `EpochCompressor.ts`, `ContextComposer.ts`, and `ContextEngine.ts`; adding `EpochSummarySchema` to `src/shared/schemas/index.ts`; wiring `ContextEngine.start/stop` into `src/main/index.ts`; and writing the 60-minute Vitest synthetic test.

The single highest-risk item is the Gemini embedding dimension parameter. The `vec_chunks` table is fixed at `float[1536]`. Gemini's `gemini-embedding-001` model defaults to 3072 dims. If the dimension-control parameter is silently ignored (a known failure mode documented in GitHub issues), every INSERT will fail at runtime. The planner must gate `EmbeddingAdapter` construction behind a `checkpoint:human-verify` test call, and the adapter must assert `embedding.length === 1536` before every INSERT.

**Primary recommendation:** Build ContextEngine with `start(meetingId)`/`stop()` lifecycle methods (matching CONTEXT.md D-07 and the DB-poll pattern of the existing SummaryCardTimer) rather than per-segment `ingest()` (ARCHITECTURE §6.8 wording). Both the 60-minute test design and the existing Phase 9 timer pattern are pull-from-DB, not push-per-segment.

---

## What Is Already Implemented vs Net-New

This distinction is critical. The planner must not re-plan work already done in Phase 9.

### Already Implemented (Phase 9 carry-over — DO NOT re-plan)

| Item | Location | Status |
|------|----------|--------|
| SessionManager FSM with `OnBreak` state | `src/main/session/SessionManager.ts` | Complete |
| `start-break` IPC handler + `breakStartMs` capture | `src/main/index.ts` lines 233–241 | Complete |
| `end-break` IPC handler + `getCardsSince` + `break-assist-digest-ready` push | `src/main/index.ts` lines 243–261 | Complete |
| `SummaryCardStore.getCardsSince(meetingId, sinceMs)` | `src/main/store/SummaryCardStore.ts` | Complete |
| `SummaryCardTimer.start(meetingId)` / `.stop()` | `src/main/context/SummaryCardTimer.ts` | Complete |
| `summary_cards` and `epoch_summaries` DB DDL | `src/main/store/db.ts` | Complete |
| `vec_chunks` virtual table DDL (float[1536]) | `src/main/store/db.ts` | Complete |
| `break-assist-digest-ready` IPC channel in preload | `src/preload/index.ts` | Complete |
| All 18 IPC channels allowlisted | `src/preload/index.ts` | Complete |

CTX-04 (break assist card window filtering) is essentially complete — `getCardsSince(currentMeetingId, breakStartMs)` filters by `created_at > breakStartMs`. CTX-05 (FSM transitions) is complete.

### Net-New in Phase 10

| Item | Location | Status |
|------|----------|--------|
| `EpochSummarySchema` Zod schema | `src/shared/schemas/index.ts` | Missing |
| `EmbeddingAdapter.ts` | `src/main/llm/EmbeddingAdapter.ts` | Missing |
| `RollingWindow.ts` | `src/main/context/RollingWindow.ts` | Missing |
| `TokenMonitor.ts` | `src/main/context/TokenMonitor.ts` | Missing |
| `EpochCompressor.ts` | `src/main/context/EpochCompressor.ts` | Missing |
| `ContextComposer.ts` | `src/main/context/ContextComposer.ts` | Missing |
| `ContextEngine.ts` | `src/main/context/ContextEngine.ts` | Missing |
| Wire `ContextEngine` into `src/main/index.ts` | `src/main/index.ts` | Missing |
| 60-minute Vitest test | `src/main/context/__tests__/contextengine.test.ts` | Missing |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Token counting (rolling window budget) | Electron main process | — | Reads transcript_segments from DB; computationally cheap but must run in Node.js for tiktoken WASM |
| Epoch compression (rare, 40h+ meetings) | Electron main process | SQLCipher DB | LLM call + DB write; must be in main; renderer never sees epoch data |
| Epoch embedding storage | Electron main process | sqlite-vec (vec_chunks) | EmbeddingAdapter in main; vec_chunks write path in main; no renderer involvement |
| ContextComposer (v1 infrastructure) | Electron main process | — | Assembles ContextWindow from DB; tested only; no IPC in v1 |
| Break Assist digest (card window filter) | Electron main process | SummaryCardStore | Already implemented; main pushes filtered cards via break-assist-digest-ready |
| SummaryCardTimer lifecycle | Electron main process | ContextEngine.start/stop | Timer already exists; ContextEngine wraps its start/stop |
| 60-minute Vitest test | Test layer | — | Standalone Vitest; not CI per-commit; mocks EmbeddingAdapter LLM calls |

---

## Standard Stack

### Core (all already installed — no new packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `tiktoken` | ^1.0.22 (already in package.json) | Token counting for rolling window | cl100k_base is consistent with existing ArtifactPipeline usage; CLAUDE.md mandate |
| `openai` | ^5.23.2 (already in package.json) | EmbeddingAdapter: `client.embeddings.create()` via baseURL → Gemini | Same adapter as LLMAdapter; no new SDK needed |
| `better-sqlite3-multiple-ciphers` | 12.11.1 (already installed) | epoch_summaries + vec_chunks writes | Existing DB layer; same pattern as SummaryCardStore |
| `sqlite-vec` | 0.1.9 (already in package.json) | vec0 vector INSERT for float[1536] | Already loaded in db.ts; no new extension loading needed |
| `zod` + `zod-to-json-schema` | ^3.25.76 / ^3.25.2 (already installed) | EpochSummarySchema definition + LLM call | CLAUDE.md: single source of truth pattern |

**No new packages to install.** Phase 10 is entirely new modules using existing dependencies.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `crypto` | built-in | `crypto.randomUUID()` for epoch_id | Already used throughout codebase |
| `EventEmitter` | built-in Node.js | ContextEngine event callbacks (`onEpochCompressed`) | Already used in SessionManager |

---

## Package Legitimacy Audit

All packages for Phase 10 are already installed and in use. No new packages are being added. Legitimacy check confirmed:

| Package | Registry | Verdict | Disposition |
|---------|----------|---------|-------------|
| `tiktoken` | npm | OK | Already installed — approved |
| `sqlite-vec` | npm | OK | Already installed — approved |
| `openai` | npm | SUS (too-new signal) | Already installed and in active use — approved; signal is for latest published version date, not the pinned version in package.json |
| `better-sqlite3-multiple-ciphers` | npm | SUS (too-new signal) | Already installed and in active use — same rationale |
| `zod` | npm | OK | Already installed — approved |

**Packages removed due to SLOP verdict:** none
**Packages flagged as suspicious SUS:** `openai` and `better-sqlite3-multiple-ciphers` are flagged "too-new" by the automated check but are pinned project dependencies already active in production code. Human verification not required — both are confirmed legitimate packages locked to specific versions in package.json.

---

## Architecture Patterns

### System Architecture Diagram

```
[transcript_segments DB]
     |
     | (periodic DB query — every N segments or timer tick)
     |
[TokenMonitor]
     |
     | (if total token count > 560,000)
     ↓
[EpochCompressor]
     | query oldest segments → LLM call (EpochSummarySchema) → write epoch_summaries
     ↓
[EmbeddingAdapter]
     | concatenate epoch fields → gemini-embedding-001 (1536 dims) → Float32Array
     ↓
[vec_chunks INSERT] — new Float32Array(embedding) via better-sqlite3
     
[ContextEngine.start(meetingId)]
     ├── starts SummaryCardTimer (already exists)
     └── starts TokenMonitor (new)

[ContextEngine.stop()]
     ├── stops SummaryCardTimer
     └── stops TokenMonitor

[ContextEngine.getContext()] → returns ContextWindow
     ├── rollingSegments: from in-memory or DB query
     └── epochSummaries: from epoch_summaries DB table

[60-min Vitest test]
     ├── open temp-file SQLCipher DB (not :memory:)
     ├── seed transcript_segments to 560K+ tokens
     ├── run ContextEngine with mocked LLM + mocked EmbeddingAdapter
     └── assert: 1 epoch fired, 1 row in epoch_summaries, 1 row in vec_chunks, window < 800K
```

### Recommended Project Structure

```
src/
├── main/
│   ├── context/
│   │   ├── SummaryCardTimer.ts       # Phase 9 (existing — do not modify)
│   │   ├── ContextEngine.ts          # Phase 10 (new) — orchestrator
│   │   ├── RollingWindow.ts          # Phase 10 (new) — in-memory segment window
│   │   ├── TokenMonitor.ts           # Phase 10 (new) — token-count watcher
│   │   ├── EpochCompressor.ts        # Phase 10 (new) — compression + embedding
│   │   ├── ContextComposer.ts        # Phase 10 (new) — v1 infrastructure, untouched by v1 flows
│   │   └── __tests__/
│   │       └── contextengine.test.ts # Phase 10 (new) — 60-min synthetic test
│   └── llm/
│       ├── LLMAdapter.ts             # Phase 8 (existing — do not modify)
│       └── EmbeddingAdapter.ts       # Phase 10 (new) — Gemini embeddings via openai SDK
└── shared/
    └── schemas/
        └── index.ts                  # Add EpochSummarySchema here (net-new export)
```

### Pattern 1: TokenMonitor Token Counting

**What:** Periodic DB query that counts total tokens in `transcript_segments` for the current meeting, using tiktoken cl100k_base. Does not maintain in-memory list of segments — queries the DB each tick.

**When to use:** This pull-from-DB pattern is consistent with SummaryCardTimer (Phase 9) and is correct for the 60-minute test design (seeds DB, then asserts behavior).

```typescript
// Source: CLAUDE.md (tiktoken mandate) + verified usage in src/main/pipeline/ArtifactPipeline.ts
import { get_encoding } from 'tiktoken'

function countTokens(text: string): number {
  const enc = get_encoding('cl100k_base')
  const count = enc.encode(text).length
  enc.free()  // MUST call free() to release WASM memory
  return count
}

// TokenMonitor pattern — periodic check against DB
class TokenMonitor {
  private checkHandle: ReturnType<typeof setInterval> | null = null
  private readonly THRESHOLD = 560_000
  private readonly CHECK_INTERVAL_MS = 30_000  // every 30 seconds

  start(meetingId: string, onThreshold: () => void): void {
    this.checkHandle = setInterval(async () => {
      const totalTokens = await this.countMeetingTokens(meetingId)
      if (totalTokens > this.THRESHOLD) {
        onThreshold()
      }
    }, this.CHECK_INTERVAL_MS)
  }

  stop(): void {
    if (this.checkHandle !== null) {
      clearInterval(this.checkHandle)
      this.checkHandle = null
    }
  }
}
```

### Pattern 2: EpochCompressor — Oldest-First Eviction

**What:** Queries oldest transcript segments, compresses them via LLM, writes to `epoch_summaries`, then calls EmbeddingAdapter.

**Critical invariant:** Only compresses OLDEST segments (lowest `timestamp_start`). Never compresses most-recent. Assert in test: `epoch.covered_interval_end < oldest_remaining_segment.timestamp_start`.

```typescript
// Source: AI-SPEC §2.5 (eviction formula), 04-AI-SPEC.md
// Compression evicts enough segments to bring window below 400K (50% of 800K)
async compress(meetingId: string, currentTokenCount: number): Promise<void> {
  const TARGET_TOKENS = 400_000  // bring below 50% capacity
  const segments = db.prepare(
    'SELECT * FROM transcript_segments WHERE meeting_id = ? ORDER BY timestamp_start ASC'
  ).all(meetingId)

  // Accumulate oldest segments until we have enough tokens to evict
  let tokensToEvict = currentTokenCount - TARGET_TOKENS
  const toCompress: TranscriptRow[] = []
  let accumulatedTokens = 0
  for (const seg of segments) {
    if (accumulatedTokens >= tokensToEvict) break
    toCompress.push(seg as TranscriptRow)
    accumulatedTokens += countTokens(seg.text)
  }

  // LLM call using EpochSummarySchema (Zod-validated, same pattern as ArtifactPipeline)
  const epochSummary = await llmAdapter.generate(
    EpochSummarySchema, 'EpochSummarySchema', EPOCH_SYSTEM_PROMPT, formatSegments(toCompress)
  )
  // Write to epoch_summaries table
  // Embed epoch → vec_chunks
  // NOTE: Do NOT delete from transcript_segments DB — original stays for audit/security
  // Remove evicted segments from in-memory RollingWindow only
}
```

### Pattern 3: vec_chunks INSERT (Float32Array)

**What:** Inserting a 1536-dim Float32Array into the vec0 virtual table using better-sqlite3.

**Critical:** Pass `new Float32Array(embeddingArray)` — better-sqlite3 auto-converts typed arrays to BLOB. Do NOT pass JSON string for the embedding column.

```typescript
// Source: alexgarcia.xyz/blog/2024/sql-vector-search-languages — verified for better-sqlite3
// [CITED: https://alexgarcia.xyz/blog/2024/sql-vector-search-languages/index.html]
const stmtInsertVec = db.prepare(`
  INSERT INTO vec_chunks (embedding, chunk_id, meeting_id, speaker_label, timestamp_start, text_preview)
  VALUES (?, ?, ?, ?, ?, ?)
`)

function insertEpochEmbedding(
  embedding: Float32Array,  // MUST be Float32Array, length MUST be 1536
  chunkId: string,
  meetingId: string,
  textPreview: string,
  timestampStart: number
): void {
  if (embedding.length !== 1536) {
    throw new Error(`EmbeddingAdapter: embedding length must be 1536, got ${embedding.length}`)
  }
  stmtInsertVec.run(
    embedding,        // better-sqlite3 binds Float32Array as BLOB automatically
    chunkId,
    meetingId,
    '',               // speaker_label — empty for epoch embeddings (no single speaker)
    timestampStart,
    textPreview.slice(0, 200)
  )
}
```

### Pattern 4: EmbeddingAdapter — Gemini via OpenAI SDK

**What:** Call Gemini embedding model via the same `openai` SDK + `baseURL` pattern as LLMAdapter.

**CRITICAL — Dimension parameter:** The `vec_chunks` table is fixed at `float[1536]`. Gemini `gemini-embedding-001` defaults to 3072 dims. The dimension-control parameter behavior is unconfirmed for the OpenAI-compat adapter layer. Two approaches to try in order:
1. Standard OpenAI `dimensions` parameter: `client.embeddings.create({ model, input, dimensions: 1536 })`
2. Fallback `extra_body`: `client.embeddings.create({ model, input, extra_body: { output_dimensionality: 1536 } })`

**Mandatory runtime assertion:** Assert `embedding.length === 1536` before any INSERT. If assertion fails, the planner must investigate which parameter form is needed. [ASSUMED — needs checkpoint:human-verify before EmbeddingAdapter is finalized]

```typescript
// Source: LLMAdapter.ts pattern (existing) + Gemini OpenAI compat docs [CITED: ai.google.dev/gemini-api/docs/openai]
import OpenAI from 'openai'

export class EmbeddingAdapter {
  private client: OpenAI

  constructor(
    apiKey: string,
    baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai'
  ) {
    this.client = new OpenAI({ apiKey, baseURL })
  }

  async embed(text: string): Promise<Float32Array> {
    // Try standard 'dimensions' param first; if returns wrong length, try extra_body
    const response = await this.client.embeddings.create({
      model: 'gemini-embedding-001',
      input: text,
      dimensions: 1536,  // [ASSUMED: may not be forwarded correctly — see Open Questions]
    })
    const embedding = new Float32Array(response.data[0].embedding)
    if (embedding.length !== 1536) {
      throw new Error(
        `EmbeddingAdapter: expected 1536 dims, got ${embedding.length}. ` +
        'Try extra_body: { output_dimensionality: 1536 } instead of dimensions param.'
      )
    }
    return embedding
  }
}
```

### Pattern 5: EpochSummarySchema (to be added to schemas/index.ts)

**NAMING WARNING:** DB column is `speaker_attributions_json` (from `db.ts`). AI-SPEC §2.5 uses `speaker_attributions`. CONTEXT.md D-03 says `speaker_contributions` — this is an inconsistency in CONTEXT.md. **Use `speaker_attributions` to match the existing DB DDL.** If `speaker_contributions` were used, every epoch INSERT would write to a non-existent field silently or fail.

```typescript
// Source: AI-SPEC §2.5 EpochSummarySchema + db.ts DDL alignment check
// Note: field name is speaker_attributions (matches db.ts speaker_attributions_json column)
// NOT speaker_contributions (CONTEXT.md D-03 wording inconsistency)
export const EpochSummarySchema = z.object({
  epoch_id: z.string().uuid(),
  meeting_id: z.string().uuid(),
  covered_interval_start: z.number(),
  covered_interval_end: z.number(),
  decisions: z.array(z.string()),
  action_items: z.array(z.string()),
  key_points: z.array(z.string()),
  speaker_attributions: z.record(z.string(), z.string()),  // speaker_label → contribution summary
  raw_segment_count: z.number().int(),
  token_count_compressed: z.number().int(),
  created_at: z.string(),  // ISO 8601
})
export type EpochSummary = z.infer<typeof EpochSummarySchema>
```

### Pattern 6: ContextEngine Interface Reconciliation

**What:** ARCHITECTURE §6.8 and CONTEXT.md D-07 describe slightly different interfaces. This is the reconciled version that matches both the existing SummaryCardTimer pattern and the 60-minute test design.

**Conflict:** ARCHITECTURE §6.8 defines `ingest(segment): void` (push model). CONTEXT.md D-07 defines `start(meetingId)`, `stop()` (lifecycle model with implicit DB-pull). The 60-minute test design (seeds DB then asserts behavior) and the SummaryCardTimer (queries DB each fire) both imply DB-pull, not in-memory push.

**Resolution:** Use the lifecycle model from CONTEXT.md D-07. No `ingest()` method. TokenMonitor polls the DB periodically.

```typescript
// Reconciled interface — matches CONTEXT.md D-07 + 60-min test design
interface ContextWindow {
  rollingSegments: TranscriptSegment[]    // all segments not yet compressed
  epochSummaries: EpochSummary[]          // all epoch_summaries for this meeting
  tokenCount: number                       // current rolling window token count
}

interface ContextEnginePort {
  start(meetingId: string): void            // starts SummaryCardTimer + TokenMonitor
  stop(): void                              // stops both
  getContext(): ContextWindow               // reads from DB + in-memory
  onEpochCompressed(cb: (epoch: EpochSummary) => void): void  // callback for test assertions
}
```

### Pattern 7: 60-Minute Test Setup

**What:** Vitest unit test that seeds the DB to trigger EpochCompressor, with all LLM calls mocked.

**Critical:** Must use a temp-file SQLCipher DB, NOT `:memory:`. The `db.test.ts` file already demonstrates this pattern (SQLCipher `.pragma key` fails on `:memory:`). Follow the same pattern.

```typescript
// Source: tests/db.test.ts — established pattern for SQLCipher test DB
// src/main/context/__tests__/contextengine.test.ts

import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import Database from 'better-sqlite3-multiple-ciphers'
import * as sqliteVec from 'sqlite-vec'
import { vi, describe, it, expect, afterEach } from 'vitest'

// Mock electron (required — safeStorage/app not in Vitest env)
vi.mock('electron', () => ({ /* ... */ }))

// Seed enough segments to reach 560K+ tokens
// At ~4 chars/token, 560K tokens ≈ 2.24M chars of text
// Use synthetic segments: 1000 segments × 2240 chars each
function seedSegments(db: Database.Database, meetingId: string, count: number): void {
  const insert = db.prepare(`
    INSERT INTO transcript_segments (id, meeting_id, speaker_label, channel, timestamp_start, timestamp_end, text, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  // Generate synthetic text that tokenizes to ~600 tokens per segment
  // Total: count × 600 tokens; for count=1000, total = 600K > 560K threshold
  for (let i = 0; i < count; i++) {
    const text = 'Speaker One discussed the project status update and mentioned several key decisions. '.repeat(10)
    insert.run(crypto.randomUUID(), meetingId, 'Speaker 1', 'system', i * 10, (i + 1) * 10, text, Date.now() + i)
  }
}
```

### Anti-Patterns to Avoid

- **EpochCompressor reading from `summary_cards`:** Hard invariant. summary_cards are display artifacts. Epoch compression MUST read transcript_segments. (AI-SPEC §2.2 Pitfall 4)
- **Compressing most-recent segments:** Must evict OLDEST (lowest timestamp_start). Array ordering confusion is a documented pitfall. (AI-SPEC §2.5 Pitfall 3)
- **Token counter using character approximation:** Never use `Math.ceil(text.length / 4)`. Use `tiktoken cl100k_base`. (AI-SPEC §2.4 Pitfall 2)
- **Not calling `enc.free()` after tiktoken use:** WASM memory leak. Pattern already established in ArtifactPipeline.ts.
- **Inserting 3072-dim vector into float[1536] table:** Will fail at runtime. The dimension assertion in EmbeddingAdapter is the safety net.
- **Using `:memory:` for test DB:** SQLCipher PRAGMA key fails on :memory: databases. Use temp file (established pattern in tests/db.test.ts).
- **Adding `epoch-compressed` IPC channel:** Not needed. Epoch data is never surfaced to the renderer (D-10). Do not add a new listen channel.
- **Wiring ContextComposer into any v1 user flow:** ContextComposer is v1 infrastructure for v2 Live Assistant. It must NOT be called by SummaryCardTimer, ArtifactPipeline, or the break digest handler. Tested only via the 60-min unit test.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token counting | Character approximation (`text.length / 4`) | `tiktoken` cl100k_base `get_encoding` | 15-20% drift over meeting transcripts; CLAUDE.md mandate |
| Vector serialization | Manual Buffer packing | `new Float32Array(arr)` → better-sqlite3 auto-BLOB | better-sqlite3 handles typed array → BLOB conversion |
| Embedding API client | Custom HTTP fetch to Gemini | `openai` SDK + `baseURL` → Gemini | Same pattern as LLMAdapter; consistent error handling |
| Zod schema → LLM format | Manual JSON schema | `zod-to-json-schema` + `zodResponseFormat` | Single source of truth; prevents schema drift |
| Epoch LLM call | New LLM client | Existing `LLMAdapter.generate()` | Already works for Gemini; same pattern as ArtifactPipeline and SummaryCardTimer |

**Key insight:** Every LLM and DB operation in Phase 10 reuses an existing pattern from Phases 7-9. The complexity is in the orchestration and threshold logic, not in net-new infrastructure.

---

## Common Pitfalls

### Pitfall 1: Gemini Embedding Dimension Silently Ignored

**What goes wrong:** EmbeddingAdapter calls `gemini-embedding-001` with `dimensions: 1536`, but the OpenAI-compat layer ignores the parameter and returns the default 3072-dim vector. INSERT into `vec_chunks float[1536]` fails at runtime with a constraint error.

**Why it happens:** The `dimensions` parameter is an OpenAI-native field. Gemini's OpenAI-compat adapter may not forward it to `output_dimensionality` on the Gemini side. This is a documented failure mode (vercel/ai#8033, Discourse Meta thread).

**How to avoid:** Add a mandatory `embedding.length !== 1536` assertion before every INSERT. The planner must add a `checkpoint:human-verify` task that does a live probe call before implementing EmbeddingAdapter fully. If `dimensions: 1536` fails, try `extra_body: { output_dimensionality: 1536 }`.

**Warning signs:** Runtime error "Dimension mismatch" or "expected 1536" thrown from EmbeddingAdapter during the 60-min test or during epoch compression.

### Pitfall 2: speaker_attributions vs speaker_contributions Schema Mismatch

**What goes wrong:** EpochSummarySchema defines `speaker_contributions` (following CONTEXT.md D-03 wording) but the DB DDL has `speaker_attributions_json`. INSERT writes JSON to a column that doesn't exist, or the deserialization fails.

**Why it happens:** CONTEXT.md D-03 uses "speaker_contributions" while AI-SPEC §2.5 and db.ts use "speaker_attributions". This is an inconsistency in CONTEXT.md.

**How to avoid:** Use `speaker_attributions` in EpochSummarySchema. It matches `speaker_attributions_json` in db.ts and `speaker_attributions` in AI-SPEC §2.5. Do not use `speaker_contributions` for this field.

**Warning signs:** TypeScript type errors when mapping EpochSummary to DB columns; INSERT errors on `speaker_attributions_json` column.

### Pitfall 3: ContextEngine Interface Confusion (ingest vs start/stop)

**What goes wrong:** Planner implements `ingest(segment)` push model from ARCHITECTURE §6.8 literal wording, but the 60-minute test design (seeds DB then asserts) and the existing SummaryCardTimer (pulls from DB each 5 min) both assume DB-pull. The `ingest()` model would require threading all `speech_final` events through ContextEngine, adding latency to transcript storage.

**Why it happens:** Two docs (ARCHITECTURE §6.8 and CONTEXT.md D-07) describe different method signatures for the same interface.

**How to avoid:** Use lifecycle model: `start(meetingId)`, `stop()`. TokenMonitor uses `setInterval` to poll `transcript_segments` total token count. No `ingest()` method. SummaryCardTimer is unchanged.

**Warning signs:** If `ingest()` is implemented, CaptureService or index.ts would need to call it on every `speech_final` event — this creates tight coupling not present in Phase 9.

### Pitfall 4: Deleting Compressed Segments from the DB

**What goes wrong:** EpochCompressor deletes rows from `transcript_segments` after compressing them (to "free space"), but the ArtifactPipeline end-of-meeting batch reads from `transcript_segments` to generate citations. Deleting rows destroys the citation evidence.

**Why it happens:** Epoch compression appears to be about "freeing" the rolling window, which suggests deleting the source data.

**How to avoid:** NEVER delete from `transcript_segments`. The "eviction" is from the in-memory `RollingWindow` only. `transcript_segments` is an append-only log. (AI-SPEC §7 security note: original segments remain for audit.)

**Warning signs:** ArtifactPipeline generates citations with empty `quote_full` fields; CitationValidator failures for all early-meeting quotes.

### Pitfall 5: 60-Minute Test Using :memory: DB

**What goes wrong:** `new Database(':memory:')` followed by `db.pragma("key = 'test-key'")` throws an error: SQLCipher cannot apply a PRAGMA key to an in-memory database.

**Why it happens:** The existing test infrastructure pattern in `tests/db.test.ts` already encountered and solved this; new test code recreates the problem.

**How to avoid:** Use a temp file path: `path.join(os.tmpdir(), 'test-' + Date.now() + '.db')`. Delete the file in `afterEach`. Follow the exact pattern in `tests/db.test.ts`.

### Pitfall 6: MRL Vector Not Normalized

**What goes wrong:** Gemini's gemini-embedding-001 at truncated dimensions (via MRL) may produce non-normalized vectors. If cosine similarity is used for retrieval in v2 (Live Assistant), unnormalized vectors will give incorrect similarity scores.

**Why it happens:** Matryoshka Representation Learning truncation preserves direction but may alter magnitude. Google's docs note that re-normalization is recommended for cosine similarity.

**How to avoid:** For v1 (write-only to vec_chunks, no retrieval), this does not block. Flag as a v2 consideration: if cosine-based retrieval is added, normalize embeddings before storage or in the query path.

---

## Critical Research Questions — Resolution Status

| Question | Answer | Confidence | Tag |
|----------|--------|------------|-----|
| Gemini embedding model name | `gemini-embedding-001` (GA; text-embedding-004 and gemini-embedding-exp-03-07 are deprecated) | MEDIUM | [CITED: developers.googleblog.com/gemini-embedding-available-gemini-api] |
| Dimension parameter name via OpenAI SDK | Either `dimensions: 1536` OR `extra_body: { output_dimensionality: 1536 }` — behavior unconfirmed for openai-compat layer | LOW | [ASSUMED — checkpoint:human-verify required] |
| 1536 dims supported by gemini-embedding-001 | Yes — 768, 1536, 3072 are all recommended dimensions | MEDIUM | [CITED: ai.google.dev/gemini-api/docs/embeddings] |
| tiktoken import pattern | `import { get_encoding } from 'tiktoken'`; works in Electron main; already used in ArtifactPipeline.ts | HIGH | [VERIFIED: src/main/pipeline/ArtifactPipeline.ts] |
| tiktoken memory management | `enc.free()` MUST be called after each use to release WASM memory | HIGH | [VERIFIED: src/main/pipeline/ArtifactPipeline.ts] |
| sqlite-vec vec0 INSERT format | Pass `new Float32Array(embeddingArray)` — better-sqlite3 auto-converts to BLOB | MEDIUM | [CITED: alexgarcia.xyz/blog/2024/sql-vector-search-languages] |
| epoch_summaries DDL exists in db.ts | Yes — fully defined; CREATE TABLE IF NOT EXISTS epoch_summaries | HIGH | [VERIFIED: src/main/store/db.ts] |
| vec_chunks DDL exists in db.ts | Yes — `USING vec0(embedding float[1536], ...)` | HIGH | [VERIFIED: src/main/store/db.ts] |
| EpochSummarySchema in schemas/index.ts | NOT yet defined — must be added in Phase 10 | HIGH | [VERIFIED: src/shared/schemas/index.ts] |
| SummaryCardStore.getCardsSince signature | `getCardsSince(meetingId: string, sinceMs: number): StoredSummaryCard[]` — uses `created_at > sinceMs` | HIGH | [VERIFIED: src/main/store/SummaryCardStore.ts] |
| break_start_timestamp storage | Already in-memory in main/index.ts as `breakStartMs` — set in start-break handler | HIGH | [VERIFIED: src/main/index.ts lines 233-241] |
| break-assist-digest-ready IPC channel | Already in preload allowlist | HIGH | [VERIFIED: src/preload/index.ts] |
| `epoch-compressed` IPC channel needed | No — epochs never surfaced to renderer (D-10) | HIGH | [VERIFIED: CONTEXT.md D-10; preload has no such channel and none needed] |

---

## Open Questions

1. **Gemini `dimensions` parameter via OpenAI compat adapter (BLOCKING for EmbeddingAdapter)**
   - What we know: `gemini-embedding-001` supports 1536 dims. Native Gemini API uses `output_dimensionality`. OpenAI-compat adapter may or may not forward `dimensions` correctly.
   - What's unclear: Whether `client.embeddings.create({ dimensions: 1536 })` returns a 1536-dim vector when hitting the Gemini baseURL, or whether `extra_body: { output_dimensionality: 1536 }` is needed.
   - Evidence of risk: GitHub vercel/ai#8033 ("outputDimensionality not working"), Discourse Meta thread (parameter silently ignored in one system's implementation).
   - Recommendation: **Planner must add `checkpoint:human-verify` before EmbeddingAdapter is built.** Probe task: send one embedding request with `dimensions: 1536`, check `response.data[0].embedding.length`. If not 1536, switch to `extra_body: { output_dimensionality: 1536 }`. Whichever returns 1536 is the correct form. The EmbeddingAdapter's `embed()` method MUST assert `embedding.length === 1536` as a safety net in either case.

2. **TokenMonitor polling interval**
   - What we know: EpochCompressor fires at 560K tokens, which happens only in 40h+ meetings (AI-SPEC §2.4 table). A 60-min meeting generates ~30-50K tokens.
   - What's unclear: Optimal polling interval for TokenMonitor. Too frequent wastes CPU; too infrequent means the window could overshoot 800K before compression fires.
   - Recommendation: 30-second interval is conservative and has negligible CPU cost (simple DB COUNT query). At 130 WPM × 2 speakers, ~260 words/min ≈ ~350 tokens/min. To go from 560K to 800K needs ~686 more minutes at max rate — polling every 30s is more than adequate.

3. **EpochCompressor model choice**
   - What we know: AI-SPEC §2.10 OQ-3 recommends Gemini 2.5 Flash Lite for epoch compression (internal, cost-optimized).
   - What's unclear: Whether Gemini 2.5 Flash Lite is available via the openai SDK baseURL adapter.
   - Recommendation: Default to `gemini-2.5-flash` (same model as LLMAdapter) for simplicity. Change to Flash Lite if a cheaper model is confirmed available. Since epoch compression is a rare-path event (40h+ meetings only), cost difference is negligible.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (already configured) |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm test -- --run src/main/context/__tests__/contextengine.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CTX-01 | EpochCompressor reads transcript_segments ONLY | unit | `npm test -- --run contextengine.test.ts` | No — Wave 0 |
| CTX-02 | EpochCompressor writes to epoch_summaries | unit | same | No — Wave 0 |
| CTX-03 | SummaryCardTimer persists to summary_cards | unit (Phase 9 already passing) | `npm test` | Yes — tests/db.test.ts covers table existence |
| CTX-04 | Break digest filters by break_start_timestamp | unit | `npm test -- --run session.test.ts` | Yes — extend session.test.ts |
| CTX-05 | FSM Capturing→OnBreak→Capturing | unit | `npm test -- --run session.test.ts` | Yes — tests/session.test.ts |
| CTX-06 | 60-min synthetic test; EpochCompressor fires once | unit | `npm test -- --run contextengine.test.ts` | No — Wave 0 |

### Wave 0 Gaps

- [ ] `src/main/context/__tests__/contextengine.test.ts` — covers CTX-01, CTX-02, CTX-06
- [ ] No new test framework install needed — Vitest already configured

---

## Environment Availability

Phase 10 is code-only changes using already-installed packages. No new external tools or runtimes needed.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `tiktoken` | TokenMonitor token counting | Yes | ^1.0.22 (in package.json) | — |
| `sqlite-vec` | vec_chunks INSERT | Yes | 0.1.9 (in package.json) | — |
| `openai` SDK | EmbeddingAdapter | Yes | ^5.23.2 (in package.json) | — |
| Gemini paid API key | EmbeddingAdapter calls | Runtime check | — | Test mocks the call; no key needed for unit test |
| Vitest | 60-min test | Yes | Already configured | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** Gemini API key — EmbeddingAdapter must be mockable for the 60-minute test (inject via constructor for testability).

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | Yes | EpochSummarySchema Zod validation on all LLM outputs; schema parse failure → retry |
| V6 Cryptography | No change | epoch_summaries and vec_chunks write to existing SQLCipher DB; no new crypto needed |
| V2 Authentication | No | No new auth paths |
| V3 Session Management | No | FSM unchanged |

### Known Threat Patterns for Phase 10 Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via transcript content into epoch LLM call | Tampering | Same mitigation as ArtifactPipeline: transcript content in `user` role, instructions in `system` role |
| Gemini paid-plan gate for embedding calls | Information Disclosure | Same as LLM calls: `mip_opt_out: true` (Deepgram); Gemini paid key only; free-tier disqualified (DEC-02) |
| Malformed epoch summary JSON inserted to DB | Tampering | Zod schema validation before DB write; invalid responses rejected and logged |
| Vec_chunks insert with wrong dimension | Data integrity | Mandatory `embedding.length === 1536` assertion in EmbeddingAdapter before INSERT |

---

## Project Constraints (from CLAUDE.md)

The following CLAUDE.md directives apply to Phase 10. Planner must verify compliance:

| Directive | Impact on Phase 10 |
|-----------|-------------------|
| All logic in main process; renderer is display-only | ContextEngine, TokenMonitor, EpochCompressor, EmbeddingAdapter, ContextComposer all in `src/main/` |
| EpochCompressor reads from `transcript_segments` ONLY (never `summary_cards`) | Hard invariant; must be verified in code review and 60-min test |
| Zod schemas as single source of truth in `src/shared/schemas/index.ts` | EpochSummarySchema added here; `zod-to-json-schema` used for LLM structured output |
| `openai` SDK via `baseURL` for all Gemini calls (both LLM and embedding) | EmbeddingAdapter uses same constructor pattern as LLMAdapter |
| Never use character approximation for token counting; use `tiktoken cl100k_base` | TokenMonitor uses `get_encoding('cl100k_base')` |
| No raw `ipcRenderer` in renderer | No new IPC exposure; no `epoch-compressed` channel added |
| contextBridge typed allowlist only | Preload unchanged; no new channels needed |
| `electron-store` for non-sensitive settings only; `safeStorage` for secrets | EmbeddingAdapter API key passed via constructor (reads from `process.env.GEMINI_API_KEY` — already loaded from safeStorage in index.ts) |
| No new architectural decisions without updating PRD docs first | ContextEngine interface reconciliation (start/stop vs ingest) is a planner implementation detail, not an architectural change |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `dimensions: 1536` in `client.embeddings.create()` controls the output size when using Gemini via openai SDK baseURL | Code Examples — EmbeddingAdapter | INSERT into float[1536] fails at runtime with dimension mismatch; caught by assertion |
| A2 | `gemini-embedding-001` is the correct current model name for Gemini text embeddings via the OpenAI-compat endpoint | Standard Stack | Model-not-found error from API; would need to check current Gemini model names |
| A3 | TokenMonitor polling every 30 seconds is sufficient to catch the 560K threshold before 800K overflow | Architecture Patterns | Astronomically low risk — 560K to 800K takes 686+ minutes at max verbosity |
| A4 | The 60-minute test can reach 560K tokens using ~1000 synthetic segments of ~560-600 tokens each | Validation Architecture | Test may need more/fewer segments; easy to adjust the count |
| A5 | `extra_body: { output_dimensionality: 1536 }` works in openai SDK v5.x if `dimensions` doesn't | Code Examples — EmbeddingAdapter | May need a different approach; checkpoint:human-verify will catch this |

---

## Sources

### Primary (HIGH confidence — codebase verified)
- `src/main/store/db.ts` — confirmed epoch_summaries and vec_chunks DDL, both complete
- `src/main/store/SummaryCardStore.ts` — confirmed getCardsSince(meetingId, sinceMs) signature
- `src/main/context/SummaryCardTimer.ts` — confirmed start(meetingId)/stop() interface
- `src/main/session/SessionManager.ts` — confirmed OnBreak state, start-break/end-break transitions
- `src/main/index.ts` — confirmed breakStartMs in-memory tracking (lines 20, 233-241, 251)
- `src/preload/index.ts` — confirmed all 18 channels; no epoch-compressed channel exists
- `src/shared/schemas/index.ts` — confirmed EpochSummarySchema is MISSING; SummaryCardSchema present
- `src/main/pipeline/ArtifactPipeline.ts` — confirmed tiktoken import and usage pattern
- `tests/db.test.ts` — confirmed SQLCipher temp-file requirement for tests

### Secondary (MEDIUM confidence — cited from official sources)
- [ai.google.dev/gemini-api/docs/embeddings](https://ai.google.dev/gemini-api/docs/embeddings) — gemini-embedding-001 supported dimensions (768, 1536, 3072)
- [ai.google.dev/gemini-api/docs/openai](https://ai.google.dev/gemini-api/docs/openai) — OpenAI compat API usage pattern for embeddings
- [developers.googleblog.com/gemini-embedding-available-gemini-api](https://developers.googleblog.com/gemini-embedding-available-gemini-api/) — GA announcement for gemini-embedding-001
- [alexgarcia.xyz/blog/2024/sql-vector-search-languages](https://alexgarcia.xyz/blog/2024/sql-vector-search-languages/index.html) — Float32Array + better-sqlite3 insert pattern

### Tertiary (LOW confidence — training knowledge or unconfirmed)
- Dimension parameter behavior via OpenAI-compat adapter (unconfirmed; contradicting evidence from vercel/ai#8033 and Discourse Meta thread) — marked [ASSUMED] throughout

---

## Metadata

**Confidence breakdown:**
- Already-implemented items (CTX-04/CTX-05): HIGH — verified in source code
- Standard stack (tiktoken, sqlite-vec, openai): HIGH — all already installed and in use
- Architecture patterns (EpochCompressor logic, RollingWindow): MEDIUM — based on AI-SPEC + existing patterns
- Gemini embedding dimension parameter: LOW — conflicting evidence; checkpoint required

**Research date:** 2026-06-28
**Valid until:** 2026-07-28 (30 days; Gemini API model names may change)
