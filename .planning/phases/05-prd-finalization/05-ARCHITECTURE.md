---
phase: 05
document: ARCHITECTURE
version: 1.0
status: final
requirements_covered: PRD-02
ai_spec_version: 1.0
created: 2026-06-26
---

# MeetingAssist v1 — Production-Grade Architecture Specification

## 1. Purpose and Scope

This document specifies the production-grade modular architecture for MeetingAssist v1. It is prescriptive enough that a contractor can scaffold the codebase without needing to make design decisions.

**What is locked elsewhere — this document references, not redefines:**
- All technology choices are locked in `CLAUDE.md` §"Recommended Stack"
- All AI extraction and grounding contracts are locked in `04-AI-SPEC.md`
- The feature scope this architecture implements is locked in `05-FEATURE-SPEC.md`

**What this document specifies:**
- The module map: every service in `src/main/<domain>/` with its TypeScript interface
- The SessionManager FSM: all 6 states, all transitions, the consent gate guard
- The full IPC channel surface: all 18 channels (6 inbound + 12 outbound) with typed payload shapes
- The complete DB DDL: 7 tables (5 from RSCH-05 + 2 AI-SPEC additions)
- Electron overlay BrowserWindow configuration
- The top-level React component tree
- Zod schema index and provider-agnostic schema delivery
- Security controls with implementation locations

---

## 2. Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Desktop shell | Electron | **41.x LTS** (Chromium 146, Node 24 LTS) | Overlay window, native macOS APIs, contextBridge |
| UI framework | React + Vite | **19.x** (hooks-only) + **7.x** | Overlay and review UI |
| STT provider | `@deepgram/sdk` | latest — model: `nova-3` | Real-time dual-channel STT, diarization; `mip_opt_out: true` hardcoded |
| LLM adapter | `openai` SDK via `baseURL` | latest | Provider-agnostic LLM calls; Gemini 2.5 Flash default — **paid plan only** (free tier disqualified by DEC-02/RSCH-03) |
| Schema validation | `zod` + `zod-to-json-schema` | latest | Single source of truth for TypeScript types and LLM structured outputs |
| Persistence | `better-sqlite3-multiple-ciphers` (SQLCipher AES-256) + `sqlite-vec` 0.1.9 | latest / 0.1.9 | Encrypted transcript/artifact DB; local vector search |
| System audio (primary) | `audiotee` 0.0.7 | 0.0.7 | Core Audio Taps — macOS 14.2+; pre-mixer audio; no purple indicator |
| System audio (fallback) | Native Chromium flags | built-in Electron 42+ | `MacLoopbackAudioForScreenShare` / `MacSckSystemAudioLoopbackOverride` — macOS 15.0+ tested |
| Token counting | `tiktoken` | latest | `cl100k_base` encoding; ContextEngine rolling window monitor |
| Calendar export | `ics` | latest | Generates `.ics` from confirmed action items; zero OAuth |
| Key storage | Electron `safeStorage` | built-in | macOS Keychain-backed DB encryption key |
| Small prefs | `electron-store` | latest | Non-sensitive settings only; never for transcripts or secrets |

---

## 3. Directory Structure

```
MeetingAssist/
├── src/
│   ├── main/                           # Electron main process (Node.js; no browser APIs)
│   │   ├── capture/                    # CaptureService — AudioWorklet bridge + Deepgram ×2
│   │   │   └── CaptureService.ts
│   │   ├── stt/                        # STT provider seam (Deepgram default; AssemblyAI fallback)
│   │   │   └── STTAdapter.ts
│   │   ├── llm/                        # LLMAdapter + EmbeddingAdapter (openai SDK + baseURL)
│   │   │   ├── LLMAdapter.ts
│   │   │   └── EmbeddingAdapter.ts
│   │   ├── store/                      # SQLCipher DB stores
│   │   │   ├── db.ts                   # DB open/close; SQLCipher key init; sqlite-vec load
│   │   │   ├── TranscriptStore.ts
│   │   │   ├── ArtifactStore.ts
│   │   │   └── SummaryCardStore.ts
│   │   ├── context/                    # ContextEngine (rolling window, timer, epoch, composer)
│   │   │   ├── ContextEngine.ts
│   │   │   ├── RollingWindow.ts
│   │   │   ├── TokenMonitor.ts
│   │   │   ├── SummaryCardTimer.ts
│   │   │   ├── EpochCompressor.ts
│   │   │   └── ContextComposer.ts
│   │   ├── pipeline/                   # ArtifactPipeline (map-reduce batch, CitationValidator)
│   │   │   ├── ArtifactPipeline.ts
│   │   │   └── CitationValidator.ts
│   │   ├── session/                    # SessionManager FSM + consent gate enforcement
│   │   │   └── SessionManager.ts
│   │   ├── calendar/                   # .ics export service
│   │   │   └── CalendarExportService.ts
│   │   └── index.ts                    # Main process entry: app lifecycle, createWindow, IPC setup
│   ├── preload/
│   │   └── index.ts                    # Hardened contextBridge allowlist — typed channels only
│   ├── renderer/                       # React 19 + Vite (browser context)
│   │   ├── components/
│   │   │   ├── ConsentGate.tsx         # Per-meeting consent dialog; checkbox + Start button
│   │   │   ├── LiveSummaryBoard.tsx    # Stacked 5-min interval summary cards
│   │   │   ├── SummaryCard.tsx         # Individual interval card component
│   │   │   ├── BreakAssistPanel.tsx    # "Going on Break" / "I'm Back" buttons + digest modal
│   │   │   ├── BreakAssistDigest.tsx   # Digest modal rendered on "I'm Back"
│   │   │   ├── ArtifactReview.tsx      # Artifact proposal confirm/edit/dismiss UI
│   │   │   ├── ArtifactItem.tsx        # Individual proposal with citation toggle
│   │   │   ├── CitationPanel.tsx       # Verbatim quote viewer for a given artifact
│   │   │   ├── SettingsPanel.tsx       # Provider config, prefs; Gemini paid-plan warning
│   │   │   └── AudioWorkletHost.tsx    # Hidden; mic AudioWorklet lifecycle + IPC mic chunks
│   │   ├── App.tsx                     # Root; IPC event wiring; useSessionState hook
│   │   └── main.tsx                    # Renderer entry point
│   └── shared/
│       └── schemas/
│           └── index.ts                # All Zod schemas — single source of truth
├── build/
│   ├── entitlements.mac.plist          # allow-jit, allow-unsigned-exec-memory, disable-library-validation
│   └── icon.icns
├── eval/
│   ├── corpus/                         # 60 AdversarialTestCase JSON files, 8 categories
│   └── harness.ts                      # Standalone eval runner (CGFS/EHR gates)
├── .planning/                          # Planning artifacts (tracked in git)
└── package.json
```

---

## 4. Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Audio capture — mic | Renderer (AudioWorklet) | Main process (IPC receiver) | Web Audio APIs live in renderer; PCM frames sent via IPC to CaptureService in main |
| Audio capture — system | Electron main process | — | `audiotee` Swift binary spawned from main; PCM streamed directly to Deepgram |
| Deepgram STT (dual WebSocket) | Electron main process | — | Network I/O and WebSocket lifecycle in main; transcripts never touch renderer raw |
| TranscriptStore (SQLCipher DB) | Electron main process | — | DB operations must not run on renderer thread; main owns all I/O |
| ContextEngine (rolling window, epoch, timer) | Electron main process | — | Token counting, timer management, DB reads/writes require main; renderer would create memory/latency issues |
| ArtifactPipeline (end-of-meeting batch) | Electron main process | — | LLM calls, map-reduce coordination, DB writes belong in main |
| SessionManager FSM | Electron main process | — | Session state is authoritative in main; renderer reflects state via IPC pushes |
| Consent gate UX | Renderer | IPC | UI renders consent dialog; main process enforces the FSM guard |
| Live summary board (card display) | Renderer | IPC | Display-only; main pushes cards via IPC; renderer stacks them in overlay |
| Break assist trigger and digest display | Renderer | IPC | User presses buttons in renderer; main generates digest; main pushes result via IPC |
| Artifact proposal UX (confirm/edit/dismiss) | Renderer | IPC | Proposals rendered in renderer; user actions sent via IPC; main updates DB status |
| .ics export | Electron main process | — | File I/O and `ics` library in main; renderer triggers via IPC |
| safeStorage / Keychain key management | Electron main process | — | `safeStorage` API is main-process-only |
| sqlite-vec extension loading | Electron main process | — | Extension loaded at DB open; lives in main alongside `better-sqlite3` |
| IPC bridge / contextBridge | Preload script | — | Strict typed allowlist pattern (DNA Technique 3); no raw `ipcRenderer` exposed |
| Overlay window setup (always-on-top, no-dock) | Electron main process | — | `BrowserWindow` APIs are main-process-only |
| Settings / preferences | Electron main process | — | `electron-store` in main; renderer reads via IPC |

---

## 5. SessionManager FSM

All capture start/stop must go through this FSM. **Direct calls to `CaptureService` bypassing the FSM are forbidden.**

The consent gate (DEC-01) is a hard FSM guard enforced in the Electron main process — it is not a renderer-only UI check. A renderer-only check can be bypassed by a malicious extension or injected script. The `PreCapture → Capturing` transition is blocked at the main-process FSM level until the `consent-confirmed` IPC event has been received.

### States

| State | Description |
|-------|-------------|
| `Idle` | No meeting in progress; app is at rest |
| `PreCapture` | Meeting setup shown; consent gate displayed to user; audio capture NOT yet active |
| `Capturing` | Active meeting; audio capture running; requires prior `consent-confirmed` event (hard guard) |
| `OnBreak` | User pressed "Going on Break"; break_start_timestamp recorded; capture continues running |
| `Processing` | Meeting ended; ArtifactPipeline is running; capture stopped |
| `Complete` | Artifact proposals ready; user reviewing proposals |

### Transition Table

| From State | Event | To State | Guard / Precondition |
|------------|-------|----------|----------------------|
| `Idle` | `start-meeting` IPC | `PreCapture` | None |
| `PreCapture` | `consent-confirmed` IPC | `Capturing` | **HARD: `consent-confirmed` event must have been received; blocked otherwise (DEC-01)** |
| `Capturing` | `start-break` IPC | `OnBreak` | Records `break_start_timestamp` |
| `OnBreak` | `end-break` IPC | `Capturing` | Records `break_end_timestamp` for digest window |
| `Capturing` | `end-meeting` IPC | `Processing` | Stops audio capture; starts ArtifactPipeline |
| `Processing` | `pipeline-complete` internal event | `Complete` | ArtifactPipeline emits this on success |
| `Complete` | `start-meeting` IPC or user dismisses review | `Idle` | New meeting or session dismissed |

### TypeScript Interface

```typescript
// Source: Pattern 1 from 05-RESEARCH.md (researcher recommendation)
type SessionState =
  | 'Idle'
  | 'PreCapture'
  | 'Capturing'
  | 'OnBreak'
  | 'Processing'
  | 'Complete';

type SessionEvent =
  | 'start-meeting'
  | 'consent-confirmed'
  | 'start-break'
  | 'end-break'
  | 'end-meeting'
  | 'pipeline-complete'
  | 'session-dismissed';

interface SessionManagerPort {
  getState(): SessionState;
  transition(event: SessionEvent): void;
  onStateChange(cb: (state: SessionState, previous: SessionState) => void): void;
}
```

**Note:** The consent gate is a hard FSM guard, not a UI-only check. The main process enforces it. The renderer's `ConsentGateScreen` component provides the UX; the FSM in the main process provides the enforcement. Both must be present.

---

## 6. Module Map and TypeScript Interfaces

### 6.1 CaptureService (`src/main/capture/`)

**Responsibility:** Manages AudioWorklet mic bridge (receives PCM chunks via IPC from renderer) + `audiotee` system audio tap (spawned Swift binary) + Deepgram WebSocket lifecycle for both channels.

**Notes:**
- `mip_opt_out: true` must be hardcoded in the Deepgram SDK client initialization. It is a product-level commitment (DEC-02), not a user setting.
- Mic channel always maps speaker 0 to "You"; system audio has an independent speaker ID space (RSCH-02 anti-pattern: never merge speaker IDs across channels).

```typescript
interface CaptureHealth {
  mic: 'healthy' | 'silent' | 'error';
  system: 'healthy' | 'silent' | 'error';
  micMessage?: string;
  systemMessage?: string;
}

interface CaptureServicePort {
  start(): Promise<void>;
  stop(): Promise<void>;
  onAudioChunk(cb: (chunk: { channel: 'mic' | 'system'; frames: Float32Array }) => void): void;
  onCaptureHealthUpdate(cb: (health: CaptureHealth) => void): void;
  getHealth(): CaptureHealth;
}
```

---

### 6.2 STTAdapter (`src/main/stt/`)

**Responsibility:** Provider seam for streaming STT. Default: Deepgram Nova-3 dual-WebSocket (one connection per channel). Swappable to AssemblyAI behind the seam without changing CaptureService.

```typescript
interface TranscriptSegment {
  id: string;
  meetingId: string;
  text: string;
  speakerLabel: string;           // "You", "Speaker 1", "Speaker 2", etc.
  channel: 'mic' | 'system';
  timestampStart: number;         // seconds from meeting start
  timestampEnd: number;
  isFinal: true;                  // only speech_final=true segments
}

interface STTAdapterPort {
  connect(channel: 'mic' | 'system'): Promise<void>;
  disconnect(channel: 'mic' | 'system'): Promise<void>;
  onSpeechFinal(cb: (segment: TranscriptSegment) => void): void;
  onError(cb: (channel: 'mic' | 'system', error: Error) => void): void;
}
```

---

### 6.3 LLMAdapter (`src/main/llm/`)

**Responsibility:** Provider-agnostic LLM calls via `openai` SDK `baseURL`. Handles both OpenAI Structured Outputs (`response_format: json_schema, strict: true`) and Gemini `responseJsonSchema` via `zod-to-json-schema`.

**Critical:** Gemini free tier is disqualified for meeting data (DEC-02 / RSCH-03 — free tier allows training on submitted data). The settings validator must refuse to accept a Gemini API key without a billing confirmation flag set by the user.

```typescript
interface LLMAdapterPort {
  complete<T>(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    schema: z.ZodSchema<T>
  ): Promise<T>;
  stream(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
  ): AsyncIterable<string>;
}
```

---

### 6.4 EmbeddingAdapter (`src/main/llm/`)

**Responsibility:** Provider-agnostic embedding generation for epoch RAG and future cross-meeting search. Default: `text-embedding-3-small` (OpenAI, 1536 dims). Fallback: Gemini embedding model (also 1536 dims) if only a Gemini key is configured.

```typescript
interface EmbeddingAdapterPort {
  embed(text: string): Promise<Float32Array>;
}
```

---

### 6.5 TranscriptStore (`src/main/store/`)

**Responsibility:** SQLCipher DB writes for `meetings` and `transcript_segments` tables; reads for meeting history and context window assembly.

```typescript
interface MeetingMeta {
  id: string;
  title?: string;
  startedAt: number;            // ms timestamp
}

interface TranscriptStorePort {
  createMeeting(meta: MeetingMeta): string;
  appendSegment(segment: TranscriptSegment): void;
  getMeeting(id: string): MeetingMeta & { endedAt?: number };
  getSegments(meetingId: string, window?: { start: number; end: number }): TranscriptSegment[];
  closeMeeting(id: string, endedAt: number): void;
}
```

---

### 6.6 ArtifactStore (`src/main/store/`)

**Responsibility:** SQLCipher DB writes for `artifacts` and `action_items` tables; status lifecycle management (`proposed → confirmed / dismissed`).

```typescript
type ArtifactStatus = 'proposed' | 'confirmed' | 'dismissed';

interface ArtifactStorePort {
  saveArtifacts(artifacts: z.infer<typeof MeetingArtifactsSchema>): void;
  confirmArtifact(id: string, type: 'action_item' | 'decision' | 'date'): void;
  editArtifact(id: string, type: 'action_item' | 'decision' | 'date', data: Record<string, unknown>): void;
  dismissArtifact(id: string, type: 'action_item' | 'decision' | 'date'): void;
  getConfirmedActionItems(meetingId: string): z.infer<typeof ActionItemSchema>[];
  getArtifacts(meetingId: string): z.infer<typeof MeetingArtifactsSchema>;
}
```

---

### 6.7 SummaryCardStore (`src/main/store/`)

**Responsibility:** Persists `SummaryCard` and `EpochSummary` records; provides reads for BreakAssist digest generation.

```typescript
interface SummaryCardStorePort {
  saveCard(card: z.infer<typeof SummaryCardSchema>): void;
  saveEpoch(epoch: z.infer<typeof EpochSummarySchema>): void;
  getCardsSince(meetingId: string, sinceSeconds: number): z.infer<typeof SummaryCardSchema>[];
  getCardsForMeeting(meetingId: string): z.infer<typeof SummaryCardSchema>[];
}
```

---

### 6.8 ContextEngine (`src/main/context/`)

**Responsibility:** Manages the rolling transcript window (token-counted via `tiktoken cl100k_base`), the 5-minute `SummaryCardTimer`, the `EpochCompressor` (fires at 560K tokens), and the `ContextComposer` (assembles context window for LLM calls).

**Key invariants:**
- 800K token ceiling; evict oldest segments on overflow
- `EpochCompressor` reads from `transcript_segments` ONLY — never from `summary_cards` (AI-SPEC §2.2 Pitfall 4)
- `EpochCompressor` evicts OLDEST segments first (lowest timestamp), never most-recent

```typescript
interface ContextWindow {
  rollingSegments: TranscriptSegment[];
  epochSummaries: z.infer<typeof EpochSummarySchema>[];
  tokenCount: number;
}

interface ContextEnginePort {
  ingest(segment: TranscriptSegment): void;
  getContext(): ContextWindow;
  onCardReady(cb: (card: z.infer<typeof SummaryCardSchema>) => void): void;
  onEpochCompressed(cb: (epoch: z.infer<typeof EpochSummarySchema>) => void): void;
}
```

---

### 6.9 ArtifactPipeline (`src/main/pipeline/`)

**Responsibility:** End-of-meeting batch extraction using map-reduce over 5-minute chunk intervals. Runs `CitationValidator` before accepting any artifact. Writes all passing artifacts as `proposed` to the DB.

Two-stage extraction (AI-SPEC §1.2):
1. Stage 1 — evidence anchors: LLM extracts verbatim quotes from the chunk
2. Stage 2 — constrained generation: LLM generates artifact content using ONLY the Stage 1 quotes

```typescript
interface ArtifactPipelinePort {
  run(meetingId: string): Promise<z.infer<typeof MeetingArtifactsSchema>>;
  onProgress(cb: (pct: number) => void): void;
}
```

---

### 6.10 CalendarExportService (`src/main/calendar/`)

**Responsibility:** Generates an `.ics` file from confirmed action items; opens native file-save dialog.

```typescript
interface CalendarExportServicePort {
  exportConfirmedItems(meetingId: string): Promise<{ filePath: string }>;
  previewIcs(items: z.infer<typeof ActionItemSchema>[]): string;
}
```

---

## 7. IPC Channel Contract (contextBridge Allowlist)

This is the **complete** typed IPC channel surface. No channel outside this list may be exposed via `contextBridge`. No raw `ipcRenderer` may be exposed to the renderer. Source: DNA Technique 3 (hardened contextBridge allowlist pattern).

### Inbound Channels (main → renderer)

Renderer subscribes via `window.electronAPI.on(channel, cb)`.

| Channel | Payload TypeScript Interface | Trigger |
|---------|------------------------------|---------|
| `session-state-changed` | `{ state: SessionState; previous: SessionState }` | SessionManager FSM transitions |
| `transcript-segment` | `{ id: string; meetingId: string; text: string; speakerLabel: string; channel: 'mic' \| 'system'; timestampStart: number; timestampEnd: number; isFinal: true }` | Deepgram `speech_final` event |
| `summary-card-ready` | `{ card: SummaryCardSchema }` | SummaryCardTimer 5-min interval fires |
| `break-assist-digest-ready` | `{ digest: BreakAssistDigestSchema; cardsMissed: SummaryCardSchema[] }` | User fires `end-break` |
| `artifact-proposals-ready` | `{ artifacts: MeetingArtifactsSchema; meetingId: string }` | ArtifactPipeline completes |
| `capture-health-update` | `{ status: 'healthy' \| 'silent' \| 'error'; channel: 'mic' \| 'system'; message?: string }` | CaptureService silence detection |

### Outbound Channels (renderer → main)

Renderer invokes via `window.electronAPI.invoke(channel, payload)`.

| Channel | Payload TypeScript Interface | Purpose |
|---------|------------------------------|---------|
| `consent-confirmed` | `{ meetingId: string; timestamp: number }` | User checked consent box + clicked Start; triggers FSM `PreCapture → Capturing` |
| `mic-audio-chunk` | `{ frames: Float32Array; sampleRate: number }` | AudioWorklet mic PCM frames streamed to main |
| `start-meeting` | `{ meetingTitle?: string }` | User clicked Start Meeting; triggers FSM `Idle → PreCapture` |
| `end-meeting` | `{}` | User clicked End Meeting; triggers FSM `Capturing → Processing` |
| `start-break` | `{}` | User clicked Going on Break; triggers FSM `Capturing → OnBreak` |
| `end-break` | `{}` | User clicked I'm Back; triggers FSM `OnBreak → Capturing` |
| `confirm-artifact` | `{ id: string; type: 'action_item' \| 'decision' \| 'date' }` | User confirmed a proposal |
| `edit-artifact` | `{ id: string; type: 'action_item' \| 'decision' \| 'date'; updates: Record<string, unknown> }` | User edited + confirmed a proposal |
| `dismiss-artifact` | `{ id: string; type: 'action_item' \| 'decision' \| 'date' }` | User dismissed a proposal |
| `export-ics` | `{ meetingId: string }` | User clicked export; triggers CalendarExportService |
| `get-settings` | `{}` | Request current settings object |
| `set-setting` | `{ key: string; value: unknown }` | Update a single setting |

---

## 8. Database Schema (7 Tables)

> **Source note:** RSCH-05 defines 5 tables (`meetings`, `transcript_segments`, `artifacts`, `action_items`, `vec_chunks`). Two additional tables (`summary_cards`, `epoch_summaries`) are required by `04-AI-SPEC.md` §2.2 and §2.5. Total: **7 tables.**

```sql
-- =============================================================
-- Source: RSCH-05
-- Meeting metadata
-- =============================================================
CREATE TABLE IF NOT EXISTS meetings (
  id               TEXT PRIMARY KEY,           -- UUID v4
  title            TEXT,                        -- May be null for untitled meetings
  started_at       INTEGER NOT NULL,            -- Unix timestamp (ms)
  ended_at         INTEGER,                     -- NULL until meeting ends
  participant_count INTEGER,
  raw_audio_path   TEXT,                        -- NULL = deleted after transcription (DEC-02)
  created_at       INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- =============================================================
-- Source: RSCH-05
-- Transcript segments (speech_final only — intermediates not persisted)
-- =============================================================
CREATE TABLE IF NOT EXISTS transcript_segments (
  id               TEXT PRIMARY KEY,            -- UUID v4
  meeting_id       TEXT NOT NULL
    REFERENCES meetings(id) ON DELETE CASCADE,
  speaker_label    TEXT NOT NULL,               -- "You", "Speaker 1", "Speaker 2", etc.
  channel          TEXT NOT NULL CHECK (channel IN ('mic', 'system')),
  timestamp_start  REAL NOT NULL,               -- Seconds from meeting start
  timestamp_end    REAL NOT NULL,
  text             TEXT NOT NULL,
  is_speech_final  INTEGER NOT NULL DEFAULT 1,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_transcript_segments_meeting_id
  ON transcript_segments(meeting_id);

-- =============================================================
-- Source: RSCH-05
-- Vector chunks for epoch RAG and future cross-meeting search
-- vec0 virtual table — requires db.loadExtension(sqliteVecPath) first
-- =============================================================
CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
  embedding        float[1536],     -- text-embedding-3-small / Gemini compatible (1536 dims)
  +chunk_id        TEXT,            -- UUID v4
  +meeting_id      TEXT,            -- FK → meetings.id (cascade handled at app layer)
  +speaker_label   TEXT,
  +timestamp_start REAL,
  +text_preview    TEXT             -- First 200 chars for display
);

-- =============================================================
-- Source: RSCH-05
-- Artifact batch output (MOM, summary, key_points, action_items, dates)
-- =============================================================
CREATE TABLE IF NOT EXISTS artifacts (
  id             TEXT PRIMARY KEY,              -- UUID v4
  meeting_id     TEXT NOT NULL
    REFERENCES meetings(id) ON DELETE CASCADE,
  artifact_type  TEXT NOT NULL CHECK (
    artifact_type IN ('mom', 'summary', 'key_points', 'action_items', 'dates')
  ),
  content_json   TEXT NOT NULL,                 -- Zod-validated JSON (MeetingArtifactsSchema)
  model_used     TEXT,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_artifacts_meeting_id
  ON artifacts(meeting_id);

-- =============================================================
-- Source: RSCH-05 + ArtifactStore status lifecycle added
-- Action items (first-class for .ics export and follow-up)
-- =============================================================
CREATE TABLE IF NOT EXISTS action_items (
  id              TEXT PRIMARY KEY,             -- UUID v4
  meeting_id      TEXT NOT NULL
    REFERENCES meetings(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  assignee_label  TEXT,                         -- "Speaker 2", "You", etc.
  due_date        TEXT,                         -- ISO 8601 date or NULL
  status          TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'confirmed', 'dismissed')),
  citations_json  TEXT NOT NULL DEFAULT '[]',   -- JSON array of CitationAnchor
  ics_exported_at INTEGER,                      -- NULL until exported
  created_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_action_items_meeting_id
  ON action_items(meeting_id);

-- =============================================================
-- Source: AI-SPEC §2.2/§2.5 additions
-- 5-minute interval summary cards (SummaryCardSchema)
-- =============================================================
CREATE TABLE IF NOT EXISTS summary_cards (
  id                          TEXT PRIMARY KEY,  -- UUID v4
  meeting_id                  TEXT NOT NULL
    REFERENCES meetings(id) ON DELETE CASCADE,
  card_index                  INTEGER NOT NULL,
  interval_start_seconds      REAL NOT NULL,
  interval_end_seconds        REAL NOT NULL,
  wall_time_label             TEXT NOT NULL,     -- "10:00–10:05"
  topic_headline              TEXT NOT NULL,
  key_points_json             TEXT NOT NULL,     -- JSON array of bullet strings
  action_items_mentioned_json TEXT NOT NULL,     -- JSON array (tentative)
  speaker_contributions_json  TEXT NOT NULL,     -- JSON: speaker_label → summary string
  model_used                  TEXT NOT NULL,
  generated_at                TEXT NOT NULL,     -- ISO 8601
  created_at                  INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- =============================================================
-- Source: AI-SPEC §2.2/§2.5 additions
-- Epoch summaries (EpochSummarySchema — safeguard for 40h+ meetings)
-- =============================================================
CREATE TABLE IF NOT EXISTS epoch_summaries (
  id                        TEXT PRIMARY KEY,    -- UUID v4
  meeting_id                TEXT NOT NULL
    REFERENCES meetings(id) ON DELETE CASCADE,
  covered_interval_start    REAL NOT NULL,
  covered_interval_end      REAL NOT NULL,
  decisions_json            TEXT NOT NULL,       -- JSON array of strings
  action_items_json         TEXT NOT NULL,
  key_points_json           TEXT NOT NULL,
  speaker_attributions_json TEXT NOT NULL,       -- JSON: speaker_label → summary
  raw_segment_count         INTEGER NOT NULL,
  token_count_compressed    INTEGER NOT NULL,
  created_at                TEXT NOT NULL        -- ISO 8601
);
```

### DB Initialization Sequence

1. DB key generated via `Electron.safeStorage.encryptString()` on first run; stored in macOS Keychain
2. DB opened with `PRAGMA key = '...'` using the `safeStorage`-decrypted key
3. `sqlite-vec` loaded immediately after open: prefer `sqliteVec.load(db)` from the npm package (handles path internally); fallback to `db.loadExtension(resolvedSqliteVecPath)` with manual `asar-unpacked` path resolution if `load()` fails in a packaged build
4. All 7 table DDLs executed via `db.exec()` in a single transaction
5. `better-sqlite3-multiple-ciphers` must be rebuilt against Electron's Node ABI via `electron-rebuild`
6. Both the `.node` file and the `audiotee` Swift binary must be in `asarUnpack` in `package.json`

---

## 9. Electron Overlay Window Configuration

Source: DNA Technique 5 (overlay window setup) + CLAUDE.md overlay section.

```typescript
// src/main/index.ts — createOverlayWindow()
import { BrowserWindow, screen } from 'electron';
import path from 'path';

function createOverlayWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const OVERLAY_WIDTH = 380;

  const win = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height,
    x: width - OVERLAY_WIDTH,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,       // default off; toggled when user interacts with panel
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,        // required for preload script access to ipcRenderer
      preload: path.join(__dirname, '../preload/index.js'),
    },
  });

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true }); // toggle off on user interaction
  win.setContentProtection(true); // hides overlay from user's own screen-share (DEC-01 §2 — conceals panel UI, not the fact of recording)

  return win;
}

// Called once at app startup — no dock icon
app.dock.hide();   // LSUIElement behavior; app is a background overlay assistant
```

**`setContentProtection(true)` note:** This prevents the overlay panel from appearing when the user shares their screen in a meeting. This is ethically acceptable per DEC-01 §2: it conceals the assistant UI (the panel), not the fact that recording is happening. The user has already confirmed recording via the consent gate. It does not enable covert recording.

**Mouse events toggle pattern:** `setIgnoreMouseEvents(true, { forward: true })` is the default. When the user moves their cursor into the overlay area, the renderer detects this via a pointer hover event and the app calls `win.setIgnoreMouseEvents(false)` to accept clicks. When the cursor leaves, `setIgnoreMouseEvents(true, { forward: true })` is restored.

---

## 10. React Component Tree

```
App.tsx
│  IPC event wiring (session-state-changed, summary-card-ready, etc.)
│  useSessionState() hook — drives conditional rendering by SessionState
│
├── ConsentGate.tsx           [shown in PreCapture state]
│     Consent disclosure text + checkbox
│     "Start Meeting" button (disabled until checkbox checked)
│     On confirm: fires consent-confirmed IPC
│
├── LiveSummaryBoard.tsx      [shown in Capturing / OnBreak / Processing]
│     Stacked SummaryCard list (most recent at top)
│     Receives summary-card-ready IPC; appends to card list
│     │
│     └── SummaryCard.tsx     [one per 5-min interval]
│           wall_time_label + topic_headline
│           key_points bullet list
│           speaker_contributions attribution
│
├── BreakAssistPanel.tsx      [always rendered in Capturing state]
│     "Going on Break" button → fires start-break IPC
│     "I'm Back" button → fires end-break IPC
│     On end-break: receives break-assist-digest-ready IPC → shows BreakAssistDigest
│     │
│     └── BreakAssistDigest.tsx   [modal on "I'm Back"]
│           Cards missed during break (from cardsMissed array)
│           "While You Were Away" narrative digest text
│           Dismiss button
│
├── ArtifactReview.tsx        [shown in Complete state]
│     Receives artifact-proposals-ready IPC
│     Renders list of ArtifactItem components
│     "Export .ics" button for confirmed action items
│     │
│     ├── ArtifactItem.tsx    [one per proposed artifact]
│     │     Description + assignee + due date
│     │     Confirm / Edit / Dismiss action buttons
│     │     "Verify" toggle → shows CitationPanel
│     │     │
│     │     └── CitationPanel.tsx   [hidden by default — AI-SPEC §1.4 D-02]
│     │           Verbatim quote(s) supporting this artifact
│     │           Speaker label + timestamp range
│
├── SettingsPanel.tsx         [accessible from any state]
│     LLM provider selection + API key input
│     Gemini paid-plan confirmation banner (warning if free-tier key detected)
│     Non-sensitive prefs via electron-store
│     Deepgram key input
│
└── AudioWorkletHost.tsx      [hidden component, always rendered]
      Manages mic AudioWorklet lifecycle (source: DNA Technique 1 adapted)
      Sends mic-audio-chunk IPC on each PCM frame batch
```

---

## 11. Zod Schemas (Shared — `src/shared/schemas/index.ts`)

All Zod schemas are the **single source of truth** for both TypeScript types and LLM structured output formats. Schemas are locked in `04-AI-SPEC.md` §1.6 and must not be modified without a phase-level decision.

**Provider-agnostic delivery:** `zod-to-json-schema` converts each schema to both OpenAI `json_schema` (strict) and Gemini `responseJsonSchema` format with a single call — no manually maintained dual schemas.

```typescript
// Source: 04-AI-SPEC.md §1.6 — locked; do not modify without a phase-level decision
// src/shared/schemas/index.ts

export { CitationAnchorSchema }     // Verbatim quote with speaker label and timestamps
export { ActionItemSchema }         // Action item: description, assignee, due_date, status:'proposed', citations
export { DecisionSchema }           // Decision: description, decision_maker_label, status:'proposed', citations
export { ExtractedDateSchema }      // Extracted date/deadline: description, date, raw_date_text, citations
export { KeyPointSchema }           // Key point: text, speaker_label, citations
export { MeetingArtifactsSchema }   // Root artifact object: summary, key_points, action_items, decisions, dates, mom
export { SummaryCardSchema }        // 5-min interval card: topic_headline, key_points, speaker_contributions
export { EpochSummarySchema }       // Epoch compression output: decisions, action_items, key_points (from transcript_segments)
export { BreakAssistDigestSchema }  // Break assist: narrative digest + cardsMissed array

// Usage pattern for provider-agnostic delivery (AI-SPEC §1.8):
// import zodToJsonSchema from 'zod-to-json-schema';
// const openaiConfig = { response_format: { type: 'json_schema', json_schema: { strict: true, schema: zodToJsonSchema(MeetingArtifactsSchema) } } }
// const geminiConfig = { generationConfig: { responseJsonSchema: zodToJsonSchema(MeetingArtifactsSchema), responseMimeType: 'application/json' } }
```

---

## 12. Security Controls

| Control | Implementation | Source |
|---------|---------------|--------|
| DB encryption at rest | SQLCipher AES-256 via `better-sqlite3-multiple-ciphers`; key from `safeStorage` → macOS Keychain on first run | DEC-02 §V6 |
| Deepgram data privacy | `mip_opt_out: true` hardcoded in Deepgram SDK client init; never user-configurable — product-level commitment | RSCH-03, DEC-02 |
| Gemini paid-plan gate | `SettingsPanel` validates Gemini key type; displays warning banner requiring user to confirm paid plan before enabling; app refuses free-tier Gemini for meeting data | RSCH-03 critical warning — free tier allows training on submitted data |
| contextBridge hardening | No raw `ipcRenderer` exposed to renderer; typed channel allowlist only (Section 7 above) | DNA Technique 3 §V5 |
| LLM output validation | All LLM responses validated against Zod schema at parse time; responses failing validation are rejected and surface an `extraction-failed` event | AI-SPEC §1.6 §V5 |
| Prompt injection mitigation | Transcript content passed as `user`/data role; extraction instructions in `system` role; Stage 2 receives only extracted quotes, not full transcript — injection payload cannot span the stage boundary | AI-SPEC §1.7 |
| Citation forgery detection | `CitationValidator` verifies ≥ 90% token overlap between each citation and actual transcript text; items failing the check are rejected before being shown as proposals | AI-SPEC §2.8 |
| Secrets in Keychain | API keys stored via `safeStorage`; `electron-store` for non-sensitive prefs only | DNA leave-behind applied |
| Transcript retention | Local-only; indefinite until user deletes; raw audio deleted after transcription | DEC-02 |
| Content protection | `setContentProtection(true)` prevents overlay from appearing in user's own screen-share; does not conceal the fact of recording — the consent gate handles disclosure | DEC-01 §2 |

---

## 13. Cross-References

| Document | Relationship | Link |
|----------|-------------|------|
| 05-FEATURE-SPEC.md | Feature scope this architecture implements | [./05-FEATURE-SPEC.md](./05-FEATURE-SPEC.md) |
| 05-BUILD-ORDER.md | Build phase sequence for implementing this architecture | [./05-BUILD-ORDER.md](./05-BUILD-ORDER.md) |
| 05-PRD.md | Executive hub document | [./05-PRD.md](./05-PRD.md) |
| 04-AI-SPEC.md | Faithfulness contract; ContextEngine + ArtifactPipeline source of truth; Zod schema definitions | [../04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md](../04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md) |
| 03-RSCH-05-DATA-MODEL.md | Original 5-table DB schema (source of truth for meetings, transcript_segments, artifacts, action_items, vec_chunks DDL) | [../03-deep-research/03-RSCH-05-DATA-MODEL.md](../03-deep-research/03-RSCH-05-DATA-MODEL.md) |
| 03-RSCH-04-SPIKE-REPORT.md | Capture path spike results; audiotee preference over electron-audio-loopback | [../03-deep-research/03-RSCH-04-SPIKE-REPORT.md](../03-deep-research/03-RSCH-04-SPIKE-REPORT.md) |
| 02-DEC-01 | Consent gate ADR | [../02-foundational-decisions-adrs/02-DEC-01-consent-recording-posture.md](../02-foundational-decisions-adrs/02-DEC-01-consent-recording-posture.md) |
| 02-DEC-02 | Data-handling/privacy ADR | [../02-foundational-decisions-adrs/02-DEC-02-data-handling-privacy.md](../02-foundational-decisions-adrs/02-DEC-02-data-handling-privacy.md) |
