# Architecture Research: v3.0 Advanced Assistant Features

**Domain:** Electron desktop AI meeting assistant — integrating 4 new features into a shipped v1/v2.0 codebase
**Researched:** 2026-07-01
**Confidence:** HIGH (grounded directly in the current `src/` tree, not the original PRD docs — see note below)

**Grounding note:** This research reads the *actual code* (`src/main/**`, `src/preload/index.ts`, `src/shared/schemas/index.ts`, `src/renderer/src/**`), not just `05-ARCHITECTURE.md`. The shipped implementation has drifted from the PRD doc in small but load-bearing ways (extra IPC channels, a slightly different Zod schema shape, an idempotent `runMigrations` pattern that didn't exist in the original DDL spec, and — critically — `EmbeddingAdapter` is already wired into `EpochCompressor`, contradicting the "infrastructure-only" note in `PROJECT.md`). All recommendations below are anchored to the real files.

---

## Standard Architecture

### System Overview — where the 4 features attach

```
┌───────────────────────────────────────────────────────────────────────────┐
│  RENDERER (display-only, contextBridge allowlist)                         │
│  ┌────────────┐ ┌───────────────┐ ┌──────────────┐ ┌───────────────────┐  │
│  │ ConsentGate│ │LiveSummaryBoard│ │ArtifactReview│ │ NEW: SpeakerLabel │  │
│  │ +NEW:      │ │ +NEW: tab to  │ │ +NEW: alias  │ │ Editor (chips on  │  │
│  │ MeetingType│ │ LiveChatPanel │ │ resolution   │ │ CapturingScreen + │  │
│  │ Selector   │ │               │ │ before render│ │ ArtifactReview)   │  │
│  └─────┬──────┘ └──────┬────────┘ └──────┬───────┘ └─────────┬─────────┘  │
│  ┌─────┴──────────────────────────────────────────────────────┴────────┐  │
│  │ NEW: SemanticSearchPanel.tsx  (standalone panel, reachable anytime)  │  │
│  └───────────────────────────────────────────────────────────────────┬─┘  │
└──────────────────────────────────────────────────────────────────────┼────┘
                    preload/index.ts — typed allowlist (extend both arrays)
┌──────────────────────────────────────────────────────────────────────┼────┐
│  MAIN PROCESS                                                        │    │
│  ┌────────────────┐   ┌──────────────────┐   ┌─────────────────────┐ │    │
│  │ SessionManager │   │ ContextEngine    │   │ ArtifactPipeline    │ │    │
│  │ FSM (UNCHANGED)│   │ (UNCHANGED —     │   │ +MODIFIED: select   │ │    │
│  │                │   │  feeds LiveChat- │   │  Zod schema/prompt  │ │    │
│  │                │   │  Service.getCon- │   │  per meeting_type   │ │    │
│  │                │   │  text() as-is)   │   │                     │ │    │
│  └────────────────┘   └──────────────────┘   └─────────────────────┘ │    │
│  ┌────────────────┐   ┌──────────────────┐   ┌─────────────────────┐ │    │
│  │ NEW:           │   │ NEW:             │   │ NEW:                │ │    │
│  │ SpeakerAlias   │   │ MeetingIndexer   │   │ SemanticSearch      │ │    │
│  │ Store          │   │ (embeds every    │   │ Service (KNN query  │ │    │
│  │ (main/speakers)│   │ meeting at       │   │ over vec_chunks)    │ │    │
│  │                │   │ Processing state)│   │                     │ │    │
│  └────────────────┘   └────────┬─────────┘   └──────────┬──────────┘ │    │
│                                 │  uses EmbeddingAdapter  │            │    │
│                                 ▼           (existing)    ▼            │    │
│  ┌────────────────────────────────────────────────────────────────┐  │    │
│  │ NEW: LiveChatService — orchestrates: ContextEngine.getContext()│  │    │
│  │ + SemanticSearchService.search() → LLMAdapter.stream() (exists,│◄─┼────┘
│  │ currently unused in production) → chat-token IPC push          │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ SQLCipher DB (better-sqlite3-multiple-ciphers + sqlite-vec)   │    │
│  │ EXISTING: meetings, transcript_segments, artifacts,           │    │
│  │   action_items, summary_cards, epoch_summaries, vec_chunks    │    │
│  │ NEW TABLES: speaker_aliases, chat_messages                    │    │
│  │ MODIFIED: meetings (+meeting_type col), vec_chunks (recreate  │    │
│  │   with +chunk_type col — see Anti-Pattern below)              │    │
│  └────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities (new/modified only)

| Component | Responsibility | Where it lives | New or Modified |
|-----------|-----------------|-----------------|------------------|
| `SpeakerAliasStore` | CRUD for per-meeting raw-label → display-name map | `src/main/speakers/SpeakerAliasStore.ts` | **New** |
| `SpeakerLabelEditor.tsx` | Click a speaker chip → type a name → fires `set-speaker-alias` | `src/renderer/src/components/` | **New** |
| Alias-resolution helper | Pure display transform: swaps `speaker_label` → alias before render, in every component that shows a label | `src/renderer/src/lib/resolveSpeaker.ts` | **New** (renderer-only, no DB writes — stays inside the "renderer is display-only" boundary) |
| `MeetingIndexer` | End-of-meeting: chunks full transcript + artifacts, embeds each chunk, writes `vec_chunks` rows for **every** meeting (not just ones that hit the 560K epoch threshold) | `src/main/search/MeetingIndexer.ts` | **New** |
| `SemanticSearchService` | Embeds a query string, runs sqlite-vec KNN over `vec_chunks`, joins back to `meetings`/`epoch_summaries`/`artifacts` for display context | `src/main/search/SemanticSearchService.ts` | **New** |
| `SemanticSearchPanel.tsx` | Search box + ranked results list + "open meeting" action | `src/renderer/src/components/` | **New** |
| `HistoricalMeetingView.tsx` | Read-only variant of `ArtifactReview` for a *past* meeting (search results need somewhere to navigate to — this doesn't exist yet) | `src/renderer/src/components/` | **New** |
| `LiveChatService` | Orchestrates one chat turn: current-meeting grounding (`ContextEngine`) + cross-meeting grounding (`SemanticSearchService`) → streamed LLM answer | `src/main/chat/LiveChatService.ts` | **New** |
| `LiveChatPanel.tsx` | Text input + streaming answer + source chips, tabbed alongside `LiveSummaryBoard` | `src/renderer/src/components/` | **New** |
| `ArtifactPipeline` | Add: look up `meeting_type` for the meeting, select the matching prompt + Zod schema variant for Stage 2 MOM/summary generation | `src/main/pipeline/ArtifactPipeline.ts` | **Modified** |
| `CaptureService.startCapture` | Thread `meetingType` param through to `TranscriptStore.createMeeting` | `src/main/capture/CaptureService.ts` | **Modified** |
| `TranscriptStore.createMeeting` | Accept and persist `meetingType` | `src/main/transcript/TranscriptStore.ts` | **Modified** |
| `src/main/index.ts` | New module-level state (`pendingMeetingType`, `currentMeetingId` already exists) to carry the type from `start-meeting` invoke through to the `Capturing` transition; new IPC handlers for all 4 features | `src/main/index.ts` | **Modified** |
| `src/preload/index.ts` | Extend `LISTEN_CHANNELS` (+4) and `INVOKE_CHANNELS` (+5) allowlist arrays | `src/preload/index.ts` | **Modified** |
| `src/shared/schemas/index.ts` | Add `MeetingType` enum, per-type MOM/summary Zod schema registry, `SpeakerAlias`, `ChatMessage`, `SemanticSearchResult` schemas | `src/shared/schemas/index.ts` | **Modified** |

---

## Recommended Project Structure (additions only)

```
src/
├── main/
│   ├── speakers/                     # NEW domain
│   │   └── SpeakerAliasStore.ts
│   ├── search/                       # NEW domain
│   │   ├── MeetingIndexer.ts         # writes vec_chunks at end-of-meeting
│   │   └── SemanticSearchService.ts  # reads vec_chunks at query time
│   ├── chat/                         # NEW domain
│   │   └── LiveChatService.ts
│   ├── context/                      # UNCHANGED — ContextEngine.getContext()
│   │                                   is consumed as-is by LiveChatService
│   ├── pipeline/
│   │   ├── ArtifactPipeline.ts       # MODIFIED — meeting-type schema select
│   │   └── templates/                # NEW — one file per meeting type
│   │       ├── standupTemplate.ts
│   │       ├── oneOnOneTemplate.ts
│   │       ├── planningTemplate.ts
│   │       └── generalTemplate.ts    # today's default MOM/summary prompts, moved here
│   └── store/
│       └── ChatMessageStore.ts       # NEW — alongside ArtifactStore/SummaryCardStore
├── renderer/src/
│   ├── components/
│   │   ├── MeetingTypeSelector.tsx   # NEW — shown in Idle state before Start Meeting
│   │   ├── SpeakerLabelEditor.tsx    # NEW
│   │   ├── SemanticSearchPanel.tsx   # NEW
│   │   ├── HistoricalMeetingView.tsx # NEW
│   │   └── LiveChatPanel.tsx         # NEW
│   └── lib/
│       └── resolveSpeaker.ts         # NEW — pure display-transform helper
└── shared/schemas/
    └── index.ts                     # MODIFIED — additive only, no breaking changes
```

### Structure Rationale

- **`main/speakers/`, `main/search/`, `main/chat/`:** Each new capability gets its own `src/main/<domain>/` folder, matching the existing convention (`capture/`, `stt/`, `llm/`, `store/`, `context/`, `pipeline/`, `session/`, `calendar/`). This is not a new pattern — it is the same shape the project already uses, so no architectural precedent needs to be introduced.
- **`pipeline/templates/`:** Isolates the meeting-type prompt/schema variants from `ArtifactPipeline.ts` itself, which stays a thin orchestrator (as it is today) that picks a template object rather than branching internally with large inline prompt strings four times over.
- **`renderer/src/lib/resolveSpeaker.ts`:** A pure function, not a store or service — it takes `(label: string, aliasMap: Record<string,string>) => string`. This keeps speaker renaming entirely inside the renderer's existing "display-only" role; it never mutates `transcript_segments.speaker_label`, which must remain untouched for `CitationValidator` and `EpochCompressor` to keep working against the literal transcript text.

---

## Architectural Patterns

### Pattern 1: Display-time alias resolution (Named Speaker Attribution)

**What:** Store aliases in a *separate* table (`speaker_aliases`) keyed by `(meeting_id, raw_label)`. Never rewrite `speaker_label` in `transcript_segments`, `summary_cards`, `epoch_summaries`, `artifacts`, or `vec_chunks`. Resolve aliases at read time — either the renderer applies the map right before rendering (preferred, since it needs zero new IPC round-trips per component), or a thin main-process helper does it once per IPC payload.

**When to use:** Any time a human-facing label needs to change without touching data that downstream logic depends on being byte-identical to what a transcript says. This directly parallels the project's own EpochCompressor invariant ("`summary_cards` are display artifacts — `EpochCompressor` must never read them"). Same idea, inverted: aliases are a *display* artifact layered on top of authoritative raw labels.

**Trade-offs:** Every historical meeting's UI must fetch and apply the alias map — cheap (`Record<string,string>`, one query) but is a "remember to do this everywhere a speaker_label is displayed" discipline: `ArtifactItem`, `CitationPanel`, `SummaryCard`, `BreakAssistDigest`, `LiveSummaryBoard`, `HistoricalMeetingView` all need the resolver applied. Centralize in one hook (`useSpeakerAliases(meetingId)`) so it's opt-in per component, not copy-pasted logic.

**Example:**
```typescript
// src/renderer/src/lib/resolveSpeaker.ts
export function resolveSpeaker(label: string, aliases: Record<string, string>): string {
  return aliases[label] ?? label
}

// src/main/speakers/SpeakerAliasStore.ts
export class SpeakerAliasStore {
  constructor(private db: Database.Database) {}
  getAliases(meetingId: string): Record<string, string> {
    const rows = this.db.prepare(
      'SELECT raw_label, display_name FROM speaker_aliases WHERE meeting_id = ?'
    ).all(meetingId) as Array<{ raw_label: string; display_name: string }>
    return Object.fromEntries(rows.map(r => [r.raw_label, r.display_name]))
  }
  setAlias(meetingId: string, rawLabel: string, displayName: string): void {
    this.db.prepare(
      `INSERT INTO speaker_aliases (id, meeting_id, raw_label, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, unixepoch()*1000, unixepoch()*1000)
       ON CONFLICT(meeting_id, raw_label) DO UPDATE SET display_name = excluded.display_name, updated_at = unixepoch()*1000`
    ).run(crypto.randomUUID(), meetingId, rawLabel, displayName)
  }
}
```

**Important scope correction:** "Globally reusable across meetings if a speaker is recognized as recurring" (per the milestone brief) is **not achievable with the current stack**. Deepgram diarization speaker IDs (`speakerId ?? 0` in `SpeakerNormalizer`) are per-session integers with no voiceprint or cross-session identity — `map.clear()` even resets them on reconnect within the *same* meeting (D-10). There is no acoustic fingerprint to match "Speaker 2 in meeting A" to "Speaker 2 in meeting B." Recommend **v3.0 scope = per-meeting manual rename only**, plus a lightweight UX assist: an autocomplete dropdown backed by a `known_speaker_names` table (distinct display names used before, most-recent-first) so renaming "Speaker 2" → "Bob" in a new meeting is fast — but this is name-string autocomplete, not identity recognition, and must be described to the user as such. True recurring-speaker recognition would require a voice-embedding model (e.g., diarization service upgrade or a separate speaker-ID model) — flag as an explicit non-goal / future research item, not a v3.0 deliverable.

### Pattern 2: End-of-meeting universal indexing (Cross-meeting Semantic Search)

**What:** A new `MeetingIndexer.index(meetingId)` call, fired from `src/main/index.ts`'s existing `state === 'Processing'` branch (same place `ArtifactPipeline` already runs), that chunks and embeds **every** meeting's content — regardless of whether that meeting was long enough to trigger `EpochCompressor`.

**Why this is necessary (not optional polish):** `EpochCompressor.compress()` only runs when `TokenMonitor` fires at the 560K-token threshold (`TARGET_TOKEN_FLOOR = 400_000` in `EpochCompressor.ts`). A typical 30–60 minute meeting's transcript is nowhere near 560K tokens. Today, `vec_chunks` is **only ever populated for unusually long meetings** — the vast majority of meetings produce zero vectors. "EmbeddingAdapter infrastructure-only" (per `PROJECT.md`) undersells this: the code path exists and works, it's just gated behind a threshold that most meetings never reach. Cross-meeting search requires embedding content unconditionally at meeting end, independent of the epoch-compression trigger.

**When to use:** Fire `MeetingIndexer.index(meetingId)` after `ArtifactPipeline.run()` resolves in the `Processing` state handler (can run concurrently with pushing `artifact-proposals-ready`, since indexing doesn't gate the UI — it's a background enrichment step). Chunk strategy: reuse the same token-budgeting approach `EpochCompressor` already uses (`tiktoken cl100k_base`, walk oldest-first accumulating ~2-4K tokens per chunk) over `transcript_segments`, plus one embedding each for the generated `mom`, `summary`, and concatenated `key_points`/`action_items` text (cheap: 3-4 extra embed calls per meeting, reuses `EmbeddingAdapter.embed()` unchanged).

**Trade-offs:** More Gemini embedding API calls per meeting (cost + latency at session end, but async/non-blocking for the user, who is already looking at `ArtifactReview`). No schema risk for `transcript_segments`/`artifacts` (read-only). The only schema risk is `vec_chunks` itself (see Anti-Pattern below).

**Example:**
```typescript
// src/main/search/MeetingIndexer.ts
export class MeetingIndexer {
  constructor(private db: Database.Database, private embedding: EmbeddingAdapter) {}

  async index(meetingId: string): Promise<void> {
    const chunks = this.chunkTranscript(meetingId) // reuses EpochCompressor's token-walk approach
    for (const chunk of chunks) {
      const vector = await this.embedding.embed(chunk.text)
      this.db.prepare(
        `INSERT INTO vec_chunks (embedding, chunk_id, meeting_id, speaker_label, timestamp_start, text_preview, chunk_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(vector, crypto.randomUUID(), meetingId, chunk.speakerLabel, chunk.timestampStart, chunk.text.slice(0, 200), 'transcript')
    }
    // + one embed call each for mom / summary / key_points+action_items, chunk_type = 'artifact:<name>'
  }
}
```

### Pattern 3: Two-source grounding for live chat (reuse, don't rebuild)

**What:** `LiveChatService` does NOT reimplement context assembly. It composes two already-built pieces:
1. `ContextEngine.getContext()` — current meeting's rolling window + epoch summaries (this method already exists and is explicitly marked in `ContextEngine.ts`'s own doc comment as "v1 infrastructure ... not consumed by any v1 user-facing flow ... **the future v2 Live Assistant**" — this is precisely that consumer).
2. `SemanticSearchService.search(question, { excludeMeetingId: currentMeetingId })` — past meetings only.

**When to use:** Every chat turn, while `SessionManager` is in `Capturing` or `OnBreak` (the only states where `ContextEngine` has an active session — it's `stop()`-ed on `Processing`/`Idle`).

**Trade-offs:** Reuses `LLMAdapter.stream()`, which already exists in `LLMAdapter.ts` and is currently **dead code in production** (built but unused — grep confirms no caller today). This means the hardest plumbing (OpenAI-SDK-via-Gemini-baseURL streaming, usage accounting) is already done and tested at the adapter level; the new work is orchestration + IPC wiring, not new LLM integration.

**Grounding discipline — proportionate, not a copy of the two-stage extraction contract:** Do NOT bolt `CitationValidator`'s ≥90%-word-overlap verbatim check onto chat answers. That contract exists because artifacts get exported to calendars and are treated as a trustworthy record (`DEC-02`, proposed-with-confirm). Chat is conversational and ephemeral — the proportionate control is a system-prompt instruction ("answer only from the provided context; if the answer isn't there, say so") plus returning the source snippets used (`groundingSources` in `chat-done`) so the user can visually verify, mirroring the *spirit* of the citation system without its cost.

**Example:**
```typescript
// src/main/chat/LiveChatService.ts
async function answer(meetingId: string, question: string, win: BrowserWindow): Promise<void> {
  const liveContext = contextEngine.getContext()               // current meeting
  const pastResults = await semanticSearch.search(question, {  // past meetings only
    excludeMeetingId: meetingId, topK: 5,
  })
  const systemPrompt = buildGroundedChatPrompt(liveContext, pastResults)
  let full = ''
  for await (const token of llmAdapter.stream([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: question },
  ])) {
    full += token
    win.webContents.send('chat-token', { token })
  }
  win.webContents.send('chat-done', { fullText: full, groundingSources: pastResults })
  chatMessageStore.append(meetingId, 'assistant', full, pastResults)
}
```

### Pattern 4: Meeting-type as a payload field, not an FSM state

**What:** `SessionManager`'s 6 states and 7 transitions are **unchanged**. Meeting type selection is a UI step inside the existing `Idle` render branch, carried as a plain payload field on the already-existing `start-meeting` invoke channel, stashed in a module-level variable in `src/main/index.ts` (same pattern already used for `currentMeetingId` and `breakStartMs`), and threaded through to `CaptureService.startCapture(meetingId, meetingType)` → `TranscriptStore.createMeeting(meetingId, startedAt, meetingType)` when `Capturing` begins.

**When to use:** Any time a new session-start input needs to reach the point where the `meetings` row is written. This is the same shape already used for `currentMeetingId` (generated in the `session.onStateChange` handler, not in the FSM itself) — meeting type follows the identical wiring path.

**Direct answer to the stated question:** No, meeting-type selection does **not** require SessionManager FSM changes. It requires (a) one new UI screen before "Start Meeting" is clicked, (b) extending the `start-meeting` payload shape, (c) one new module-level variable in `index.ts`, and (d) one new nullable-with-default column on `meetings`.

**Trade-offs:** None significant — this is the cheapest of the 4 features to wire structurally. The complexity is entirely in Stage 2's prompt/schema selection (Pattern 5), not in session-start plumbing.

### Pattern 5: Schema registry, not four parallel pipelines

**What:** Add a `MEETING_TYPES = ['general', 'standup', 'one_on_one', 'planning'] as const` type, and a `MeetingArtifactTemplateSchema` registry object in `src/shared/schemas/index.ts` that maps each type to `{ momSchema, summarySchema, momPrompt, summaryPrompt }`. `ArtifactPipeline.run()` looks up `meeting_type` from the `meetings` row (one new `SELECT`, same pattern as the existing `getMeetingDate()` private method) and passes the matched template into `runStage2Mom`/`runStage2Summary` instead of the hardcoded `MoMSchema`/`SummarySchema` + inline prompt strings used today.

**When to use:** This is the only place true Zod-schema branching is warranted. `KeyPointListSchema`, `ActionItemListSchema`, and `CitationRefSchema` should **stay shared across all meeting types** — the milestone brief's request to vary "MOM/summary output" per type is well-scoped; key points and action items generalize fine across Standup/1:1/Planning and don't need type-specific shapes. Minimizing the diff surface here reduces the number of `CitationValidator` code paths that need re-testing.

**Trade-offs:** A registry adds one indirection layer (`template lookup → runStage2Mom(anchors, meetingDate, template)`), but keeps `ArtifactPipeline.ts` from growing 4 near-duplicate branches inline (it is already a 340-line file with dense prompt strings — do not make it longer by inlining 3 more full prompt variants).

**Example:**
```typescript
// src/shared/schemas/index.ts (additive)
export const MeetingTypeSchema = z.enum(['general', 'standup', 'one_on_one', 'planning'])
export type MeetingType = z.infer<typeof MeetingTypeSchema>

export const StandupMoMSchema = z.object({
  markdown_content: z.string(),
  per_speaker_updates: z.record(z.string(), z.object({
    yesterday: z.array(z.string()), today: z.array(z.string()), blockers: z.array(z.string()),
  })),
})
// OneOnOneMoMSchema, PlanningMoMSchema similarly — see pipeline/templates/*.ts for prompts
```

---

## Data Flow

### Live chat request flow

```
User types question in LiveChatPanel
    ↓ invoke('send-chat-message', { meetingId, question })
LiveChatService.answer()
    ↓                                    ↓
ContextEngine.getContext()      SemanticSearchService.search(question, excludeMeetingId)
(current meeting, existing)     (past meetings, NEW — embeds question, KNN over vec_chunks)
    ↓                                    ↓
        buildGroundedChatPrompt(liveContext, pastResults)
    ↓
LLMAdapter.stream() [existing, unused until now] — yields tokens
    ↓ send('chat-token', {token}) per chunk
    ↓ send('chat-done', {fullText, groundingSources}) at end
LiveChatPanel renders streamed text + source chips
    ↓
ChatMessageStore.append(meetingId, 'assistant', fullText, groundingSources) — NEW table
```

### End-of-meeting indexing flow (feeds semantic search)

```
SessionManager: Capturing → Processing (end-meeting)
    ↓
[EXISTING] ArtifactPipeline.run() → artifacts saved, artifact-proposals-ready pushed
    ↓ (can run concurrently — indexing does not gate the UI)
[NEW] MeetingIndexer.index(meetingId)
    ↓ chunk transcript_segments (token-walk, same style as EpochCompressor)
    ↓ EmbeddingAdapter.embed() per chunk [existing method, new caller]
    ↓ INSERT INTO vec_chunks (..., chunk_type)
    ↓ also embed mom/summary/key_points+action_items text → vec_chunks (chunk_type='artifact:*')
```

### Key Data Flows

1. **Alias resolution never touches write paths.** `speaker_aliases` is read-joined at display time only; `transcript_segments.speaker_label` (the citation source of truth) is immutable after insert, exactly as it is today.
2. **Meeting type flows one direction, session-start → DB row, no FSM involvement.** `start-meeting` payload → module-level var in `index.ts` → `CaptureService.startCapture()` → `TranscriptStore.createMeeting()` → `meetings.meeting_type` column, read back once by `ArtifactPipeline` at `Processing` time.
3. **Two independent embedding writers into one table.** `EpochCompressor` (existing, epoch-level, long-meetings-only) and `MeetingIndexer` (new, per-meeting, always) both write to `vec_chunks`. They must be distinguishable at query time — this is the `chunk_type` column need (see Anti-Pattern below), otherwise `SemanticSearchService` cannot tell an epoch-compression byproduct from a deliberate search-index chunk when ranking/deduplicating results.

---

## Scaling Considerations

This is a single-user local desktop app — "scale" means one person's growing meeting history, not concurrent users.

| Meeting history size | Architecture Adjustments |
|-----------------------|---------------------------|
| 0–200 meetings (~months of use) | Brute-force `vec_chunks` KNN scan is fine; no partitioning needed. Current sqlite-vec 0.1.9 `MATCH ... LIMIT k` pattern is sufficient. |
| 200–2,000 meetings | Consider adding a companion `meeting_id`-indexed regular table if `SemanticSearchService` starts doing heavy post-filtering (e.g., "search only 1:1s with Bob") in JS rather than SQL. sqlite-vec 0.1.x has limited native metadata filtering — verify current version's `partition key` support before assuming SQL-side filtering works; if not, filter meeting metadata in a companion query and intersect chunk IDs. |
| 2,000+ meetings | Unlikely for a single user in practice, but if it happens: consider periodic `epoch_summaries`-only search (coarser granularity) as a fallback tier, or pruning `chunk_type='transcript'` rows older than N months while keeping `chunk_type='artifact:*'` rows (artifacts are smaller and higher-signal per meeting). |

### Scaling Priorities

1. **First bottleneck: indexing latency at meeting end.** Embedding every transcript chunk plus 3-4 artifact chunks adds several Gemini API round-trips to the `Processing` state. Since `ArtifactPipeline` and `MeetingIndexer` can run concurrently (indexing doesn't block `artifact-proposals-ready`), user-perceived latency is unaffected — but log/alert if indexing consistently fails so `vec_chunks` doesn't silently go stale for one meeting while others get indexed fine.
2. **Second bottleneck: chat response latency under KNN + full LLM call.** `SemanticSearchService.search()` is one embed call + one fast SQL KNN query — cheap. The dominant chat latency is the LLM stream itself, unaffected by search-index size at any realistic scale.

---

## Anti-Patterns

### Anti-Pattern 1: Adding metadata columns to `vec_chunks` via `ALTER TABLE`

**What people do:** Try to reuse the existing `runMigrations()` idempotent-`ALTER TABLE` pattern (already used for `transcript_segments.confidence` and `action_items.is_calendar_event` in `db.ts`) to add a `chunk_type` column to `vec_chunks`.

**Why it's wrong:** `vec_chunks` is a `sqlite-vec` `vec0` **virtual table**, not a regular SQLite table. Virtual tables backed by extension modules frequently do not support arbitrary `ALTER TABLE ADD COLUMN` the way native tables do — this must be verified against the installed `sqlite-vec` 0.1.9 behavior before assuming the existing migration helper works unmodified. Do not discover this the hard way inside `runMigrations()`'s `try/catch` (which currently only swallows "duplicate column name" errors — a different failure mode here would either throw uncaught or silently no-op).

**Do this instead:** Since this is a pre-distribution codebase (`PROJECT.md`: "Distribution... deferred," no shipped end users with an existing DB to preserve), the clean move is to **drop and recreate `vec_chunks` with the fuller schema up front** as part of this milestone's DB migration, adding `chunk_type TEXT NOT NULL DEFAULT 'epoch'` (or similar) directly in `ALL_DDLS` in `db.ts`, then writing a one-time migration that: (1) drops the old `vec_chunks`, (2) recreates it with the new column, (3) optionally re-embeds existing `epoch_summaries` rows into the new table if any dev/test data needs preserving (low priority — it's regenerable from `epoch_summaries` + `transcript_segments`, both of which are untouched source-of-truth tables). Confirm this against `sqlite-vec` 0.1.9's actual `ALTER TABLE` support before committing to either path — it is the single highest-uncertainty implementation detail in this milestone and should get a phase-specific research flag (see below).

### Anti-Pattern 2: Treating `SemanticSearchService` as a substitute for `ContextEngine` during the live meeting

**What people do:** Have `LiveChatService` call `SemanticSearchService.search()` without excluding the in-progress meeting, assuming it will "also surface the live meeting's own content."

**Why it's wrong:** `MeetingIndexer` only runs at `Processing` (meeting end) — the current meeting has **zero** rows in `vec_chunks` while it's still `Capturing`. Searching without excluding it wastes a query dimension and, if a bug ever runs indexing mid-meeting, could return stale/incomplete data for the meeting the user is literally asking about right now — where `ContextEngine.getContext()` (backed by the live `transcript_segments` insert stream) is authoritative and fresher.

**Do this instead:** Always pass `excludeMeetingId: currentMeetingId` to `SemanticSearchService.search()` from `LiveChatService`. Current-meeting grounding is `ContextEngine`'s job, exclusively. This mirrors the project's own established discipline (`EpochCompressor` reads only from `transcript_segments`, never `summary_cards`) — two grounding sources with cleanly separated authority, not overlapping ones.

### Anti-Pattern 3: Mutating `speaker_label` in place to "rename" a speaker

**What people do:** On alias set, `UPDATE transcript_segments SET speaker_label = ? WHERE meeting_id = ? AND speaker_label = ?` to "fix" the display everywhere at once.

**Why it's wrong:** Breaks `CitationValidator`'s word-overlap validation model implicitly (citations are quote-text based, not label-based, so this specific check survives) but more importantly breaks the *audit trail* the whole two-stage-extraction contract depends on: `transcript_segments.speaker_label` must reflect exactly what Deepgram diarization produced, immutable, for any future re-verification or eval-harness replay against the raw transcript. It also silently corrupts already-generated `artifacts.content_json` and `summary_cards`/`epoch_summaries` JSON blobs that captured the old label as a literal string at generation time — a partial, inconsistent rename.

**Do this instead:** Pattern 1 above — alias table + display-time resolution, always.

### Anti-Pattern 4: Building 4 fully-separate ArtifactPipeline classes for meeting types

**What people do:** `StandupArtifactPipeline`, `OneOnOneArtifactPipeline`, etc., each duplicating Stage 1 (identical across all types — quote extraction from raw transcript doesn't change) and only Stage 2 differs.

**Why it's wrong:** Stage 1 (`runStage1`, verbatim quote extraction) is meeting-type-agnostic — the mandatory two-stage contract (`CLAUDE.md`: "Stage 1: extract verbatim quotes... Stage 2: generate artifact content from Stage 1 quotes only") doesn't care what kind of meeting it is. Duplicating the whole pipeline class means four copies of citation validation, transcript loading, and token-budget logic to keep in sync.

**Do this instead:** Pattern 5 — one `ArtifactPipeline`, one shared Stage 1, a template registry consulted only inside `runStage2Mom`/`runStage2Summary`.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Gemini embeddings (`gemini-embedding-001`, via `EmbeddingAdapter`) | Already-built adapter, new caller (`MeetingIndexer`, `SemanticSearchService`) in addition to existing caller (`EpochCompressor`) | No new provider integration — reuse as-is. Existing 1536-dim assertion in `EmbeddingAdapter.embed()` already guards against silent model changes; both new callers inherit that guard for free. |
| Gemini chat completions streaming (`gemini-2.5-flash`, via `LLMAdapter.stream()`) | Already-built, currently dead code — first real caller is `LiveChatService` | `LLMAdapter.generate()` (structured output, used by `ArtifactPipeline`/`EpochCompressor`) and `LLMAdapter.stream()` (plain text token stream, used by nothing today) are two different methods on the same class — confirm `stream()`'s usage-accounting path (`finalChatCompletion()`) is exercised in a real chat session before shipping, since it has never run against production traffic. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|----------------|-------|
| `LiveChatService` ↔ `ContextEngine` | Direct method call, main-process-to-main-process | `getContext()` already exists and already returns `null` if no session is active — `LiveChatService` must handle that (chat unavailable outside `Capturing`/`OnBreak`). |
| `LiveChatService` ↔ `SemanticSearchService` | Direct method call | Must pass `excludeMeetingId` (Anti-Pattern 2). |
| `MeetingIndexer` ↔ `ArtifactPipeline` | Both invoked from the same `state === 'Processing'` branch in `index.ts`; can run concurrently (`Promise.all` or fire-and-forget with error logging, following the existing `.catch()`-and-log style already used throughout `index.ts`) | Indexing failure must not block `artifact-proposals-ready` — same non-blocking philosophy `EpochCompressor` already uses (`try/catch`, log, return null, session continues). |
| Renderer ↔ `SpeakerAliasStore` | New IPC pair: `get-speaker-aliases` (invoke) / `set-speaker-alias` (invoke) + `speaker-aliases-updated` (push, for live re-render mid-meeting) | Renderer never talks to the DB directly — same boundary as everything else. |
| Renderer ↔ `SemanticSearchService` | New IPC: `semantic-search` (invoke, request/response — no streaming needed, results arrive as one array) | |
| Renderer ↔ historical meeting data | New IPC: `get-meeting-artifacts` (invoke) — needed because `ArtifactReview` today only ever shows the *just-completed* meeting (`Complete` state); there is currently no way to view a past meeting's artifacts at all. `HistoricalMeetingView.tsx` needs this to give search results somewhere to navigate to. | This is a genuine gap, not previously scoped — flag explicitly in the roadmap so it isn't missed as "just reuse ArtifactReview" (it needs a read-only mode and a different data-fetch trigger than an IPC push). |
| `preload/index.ts` allowlist | Extend `LISTEN_CHANNELS` (+4: `speaker-aliases-updated`, `chat-token`, `chat-done`, `chat-error`) and `INVOKE_CHANNELS` (+5: `get-speaker-aliases`, `set-speaker-alias`, `semantic-search`, `send-chat-message`, `get-meeting-artifacts`) | No raw `ipcRenderer` exposure anywhere — all new channels go through the same typed-allowlist pattern already enforced for the current 7+19 channels. |

---

## Suggested Build Order

Ordered by (a) dependency correctness — cross-meeting search must exist before live chat can ground on it — and (b) risk-reduction — cheapest, most isolated features first to validate the new `src/main/<domain>/` folders and IPC-extension pattern before tackling the riskiest piece (`vec_chunks` schema change).

1. **Named speaker attribution** — fully independent of the other 3. One new table (`speaker_aliases`, a plain table — no `vec0` risk), 2 new IPC channels, one renderer-side pure-function utility. Lowest risk, validates the "new domain folder + new IPC pair" pattern the other 3 features will repeat.
2. **Meeting-type-specific artifact templates** — independent of 1 and 3 (only lightly benefits from 1 for nicer prompts, not required). Touches session-start payload + `ArtifactPipeline`, one new column on the plain `meetings` table (no `vec0` risk). Validates the "carry new session-start data through to `Capturing`" pattern with zero FSM risk (confirmed above — no state/transition changes needed).
3. **Cross-meeting semantic search** — do the `vec_chunks` schema decision (Anti-Pattern 1) first, as its own sub-step, before writing `MeetingIndexer` or `SemanticSearchService` against it. This is the riskiest single decision in the whole milestone (virtual-table `ALTER TABLE` support is unverified) and should not be discovered late, mid-feature. Once resolved: `MeetingIndexer` (write path) → `SemanticSearchService` (read path) → `SemanticSearchPanel.tsx` + `HistoricalMeetingView.tsx` (UI). **Must complete before step 4** — `LiveChatService` calls `SemanticSearchService.search()` directly.
4. **Live assistant interactive chat** — depends on step 3 for cross-meeting grounding, and reuses `ContextEngine.getContext()` (already built) for current-meeting grounding and `LLMAdapter.stream()` (already built, unused) for the model call. The new work here is almost entirely orchestration (`LiveChatService`) and UI (`LiveChatPanel.tsx` + tab-switching inside the existing `Capturing` render branch in `App.tsx`) — lowest *new-plumbing* risk of the 4, but only buildable last because of the step-3 dependency.

**Parallelization note:** Steps 1 and 2 touch disjoint files (`speakers/` domain vs. `pipeline/` + session-start payload) and can be built in parallel waves if using wave-based phase execution. Step 3 and 4 must be sequential — step 4's core value proposition (cross-meeting-grounded answers) is meaningless without step 3 shipped first.

**Research flags for phase planning:**
- Phase for step 3 (cross-meeting search): flag for deeper research — specifically, confirm `sqlite-vec` 0.1.9's actual support (or lack thereof) for `ALTER TABLE ADD COLUMN` on `vec0` virtual tables, and confirm the exact KNN query syntax (`MATCH` + `k = N` vs. `ORDER BY distance LIMIT N`) supported at this pinned version before writing `SemanticSearchService`.
- Phase for step 4 (live chat): flag for a short research pass on `LLMAdapter.stream()`'s untested-in-production usage-accounting path (`finalChatCompletion()`) — confirm it doesn't throw or double-count tokens under a real streaming session before wiring it into the token-usage summary already printed at session end (`printTokenSummary()` in `index.ts`).
- Phases for steps 1 and 2: standard patterns, unlikely to need dedicated research — both are straightforward extensions of already-established conventions in this codebase (new domain folder + IPC pair; new column + registry lookup).

---

## Sources

- `/Users/ubair/Gits/MeetingAssist/.planning/PROJECT.md` — current milestone scope and known-issues list (used to detect the "EmbeddingAdapter infrastructure-only" drift)
- `/Users/ubair/Gits/MeetingAssist/.planning/phases/05-prd-finalization/05-ARCHITECTURE.md` — original PRD architecture spec (baseline, cross-checked against actual code)
- `src/main/session/SessionManager.ts` — actual FSM implementation (confirmed no new states needed)
- `src/main/index.ts` — actual IPC wiring, state-change handler, module-level session variables pattern
- `src/preload/index.ts` — actual `LISTEN_CHANNELS`/`INVOKE_CHANNELS` allowlist (confirmed drift from the 18-channel PRD spec — actual is 7+19)
- `src/main/store/db.ts` — actual DDL + `runMigrations()` idempotent-migration pattern (source of Anti-Pattern 1's concern)
- `src/main/context/ContextEngine.ts` — confirmed `getContext()` is explicitly documented as the future Live Assistant's consumption point
- `src/main/context/EpochCompressor.ts` — confirmed `EmbeddingAdapter` is already wired here (writes `vec_chunks`), and confirmed the 560K-token gating that limits its practical coverage
- `src/main/llm/EmbeddingAdapter.ts`, `src/main/llm/LLMAdapter.ts` — confirmed `embed()` and `stream()` method signatures (both reusable as-is)
- `src/main/pipeline/ArtifactPipeline.ts` — confirmed Stage 1/Stage 2 structure and exact prompt-injection points for meeting-type templating
- `src/main/store/ArtifactStore.ts`, `src/main/transcript/TranscriptStore.ts`, `src/main/capture/CaptureService.ts`, `src/main/capture/SpeakerNormalizer.ts` — confirmed exact write-path signatures needing modification for meeting-type persistence and confirmed speaker-ID semantics (no cross-session identity)
- `src/shared/schemas/index.ts` — confirmed actual (not PRD-doc) Zod schema shapes
- `src/renderer/src/App.tsx`, `src/renderer/src/components/ConsentGate.tsx` — confirmed actual session-start flow and where new UI screens attach

---
*Architecture research for: MeetingAssist v3.0 Advanced Assistant Features*
*Researched: 2026-07-01*
