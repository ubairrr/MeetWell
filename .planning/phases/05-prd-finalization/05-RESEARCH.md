# Phase 5: PRD Finalization — Research

**Researched:** 2026-06-26
**Domain:** PRD synthesis, architecture specification, build milestone planning
**Confidence:** HIGH — all findings are drawn directly from prior phase artifacts (Phases 1–4) that are committed to this repo. No external web research required; all information is VERIFIED from first-party planning documents.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**MVP Feature Boundary (PRD-01):**

Table-stakes v1 (must ship):
- D-01: Persistent side-overlay UI — stays on during the meeting
- D-02: Full meeting transcription — saved as a complete transcript at meeting end
- D-03: Minutes of Meeting (MOM) generation
- D-04: Key points extraction
- D-05: Meeting summary generation
- D-06: Action items / dates / deadlines extraction with .ics export
- D-07: Break assist — manual "I'm back" trigger; shows interval summary cards missed + a dedicated "While you were away" digest
- D-08: Live summary board — 5-minute interval cards stack during the meeting
- D-09: Consent gate — hard precondition to capture (DEC-01, Phase 2)
- D-10: Dual-channel audio capture (mic + system audio) — AudioTee.js as primary recommendation from RSCH-04 spike; native Chromium loopback as fallback

Deferred to v2+ (explicitly not in v1):
- D-11: Live assistant — hotkey/keyword-triggered in-meeting Q&A chat is v2. ContextEngine architecture is built in v1, but the interactive chat UI is post-MVP.
- D-12: Meeting-type-specific artifact templates — v2
- D-13: Cross-meeting search (sqlite-vec semantic search UX) — v2. DB schema is v1 infrastructure; search UX is post-launch.
- D-14: Named speaker attribution ("Alice" / "Bob") — v2. v1 ships Speaker 1/2/3 labels.

**PRD Document Structure (PRD-04):**
- D-15: Modular linked docs — PRD.md is the hub; separate files for FEATURE-SPEC.md, ARCHITECTURE.md, and BUILD-ORDER.md. PRD.md is the entry point.
- D-16: Dual audience — PRD.md includes an executive summary (non-technical, investor-readable) followed by technical sections for builders.

**Architecture Spec Depth (PRD-02):**
- D-17: Module map + interface contracts — name every service/module in `main/<domain>/`, define the TypeScript interface or IPC contract for each port/adapter boundary.
- D-18: Full-stack scope — covers both backend service layer AND the UI/IPC layer: overlay window setup, contextBridge IPC surface (channels + payload shapes), top-level React component tree.

**Build Order Strategy (PRD-03):**
- D-19: First shippable unit: Audio capture + TranscriptStore — start with the highest technical risk. Everything else depends on capture working.
- D-20: 4–6 phases for the build milestone. Suggested sequence: Foundation/scaffold → Capture + TranscriptStore → ArtifactPipeline (batch) → Overlay UI + IPC → ContextEngine + summary board → Break Assist + packaging.

### Claude's Discretion

- ArtifactPipeline Zod schemas — exact structure of Zod schemas for MOM, action items, key points, summary, and dates/events (must be compatible with Gemini `responseSchema` / OpenAI `response_format`)
- SessionManager FSM states — exact state names and transitions (must accommodate consent gate DEC-01 as a hard transition precondition)
- PRD executive summary length and tone — what level of detail suits the investor/stakeholder section
- Build phase naming — the 4–6 phase names for the build milestone are left to the build milestone planner

### Deferred Ideas (OUT OF SCOPE)

- Live assistant interactive chat UI — v2
- Meeting-type-specific templates — v2
- Cross-meeting search UX — v2 (DB schema is v1 infrastructure only)
- Named speaker attribution — v2
- Integrations beyond .ics (Slack, Notion, CRM) — post-launch
- On-device / privacy mode full spec — deferred to build milestone
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PRD-01 | Feature spec with explicit MVP boundary — table stakes vs differentiators vs deferred (v2+) | CONTEXT.md D-01 through D-14 lock the MVP boundary; RSCH-06 competitive gap analysis supports feature classification; RSCH-01 positioning informs differentiator framing |
| PRD-02 | Production-grade modular architecture — `main/<domain>/` service layer, port/adapter contracts, core components (TranscriptStore, SessionManager FSM, ContextEngine, ArtifactPipeline) | 04-AI-SPEC.md §Section 2 defines ContextEngine architecture; RSCH-05 defines DB schema; RSCH-04 spike confirms capture paths; DNA-CATALOGUE defines IPC/preload patterns; CLAUDE.md defines full stack |
| PRD-03 | Recommended dependency-driven build order / phasing for the next (build) milestone | CONTEXT.md D-19/D-20 define the strategy; RSCH-04 spike confirms audio capture is the highest technical risk; AI-SPEC §2.8 defines ArtifactPipeline; risk dependency chain is well-understood |
| PRD-04 | Consolidated, production-grade PRD assembling all decisions, research, scope, and architecture into one authoritative document | All prior phases provide the content; document structure is locked as modular hub + linked files (D-15/D-16); file naming convention established in CONTEXT.md |
</phase_requirements>

---

## Summary

This phase is a synthesis milestone — not a research milestone. Phases 1–4 have produced a complete, internally consistent set of decisions, research findings, and design contracts. Phase 5's job is to assemble them into four authoritative documents (FEATURE-SPEC.md, ARCHITECTURE.md, BUILD-ORDER.md, PRD.md) without adding new decisions.

All prior phase artifacts are in excellent shape for synthesis. There are no blocking gaps or contradictions between phases. The key outputs from each prior phase and how they feed into each PRD document are mapped in detail below.

**Primary recommendation:** Write the four PRD documents in dependency order — FEATURE-SPEC.md first (it establishes the scope), then ARCHITECTURE.md (it consumes the feature scope), then BUILD-ORDER.md (it consumes the architecture), and finally PRD.md hub (it links all three plus adds the executive summary). Each document should be self-contained and cross-linked.

The one area requiring authorial judgment is the architecture spec (PRD-02): the AI-SPEC defines the ContextEngine and ArtifactPipeline in detail, but the ARCHITECTURE.md must additionally specify the SessionManager FSM states, the Electron overlay setup, the full IPC channel surface, and the top-level React component tree. These are in the "Claude's Discretion" zone — the spec writer fills them in from first principles, consistent with the DNA patterns and CLAUDE.md stack.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Audio capture (mic + system) | Electron main process | Renderer (AudioWorklet) | Audio pipeline runs in main to avoid renderer memory pressure; Web Audio APIs live in renderer for mic worklet, then IPC to main |
| Deepgram STT (dual WebSocket) | Electron main process | — | Network I/O and WebSocket lifecycle belong in main; transcripts never touch renderer raw |
| TranscriptStore (SQLCipher DB) | Electron main process | — | DB operations must not run on renderer thread; main process owns all I/O |
| ContextEngine (rolling window, epoch, timer) | Electron main process | — | Token counting, timer management, DB reads/writes must be in main; renderer would create memory and latency issues |
| ArtifactPipeline (end-of-meeting batch) | Electron main process | — | LLM calls, DB writes, and map-reduce coordination belong in main |
| SessionManager FSM | Electron main process | — | Session state (Idle/PreCapture/Capturing/Processing/Complete) must be authoritative in main |
| Consent gate UX | UI/Renderer | IPC | UI renders consent dialog; main process enforces the gate — capture cannot start until consent IPC event arrives |
| Live summary board (card display) | UI/Renderer | IPC | Display-only; main pushes cards via IPC; renderer renders them in the overlay |
| Break assist trigger and digest display | UI/Renderer | IPC | User presses "I'm back" in renderer; main generates digest; main pushes result via IPC |
| Artifact proposal UX (confirm/edit/dismiss) | UI/Renderer | IPC | Proposals rendered in renderer; user actions sent via IPC to main which updates DB status |
| .ics export | Electron main process | — | File I/O and ics library run in main; renderer triggers via IPC |
| safeStorage / Keychain key management | Electron main process | — | safeStorage API is main-process-only |
| sqlite-vec extension loading | Electron main process | — | Extension loaded at DB open time; lives in main alongside better-sqlite3 |
| IPC bridge / contextBridge | Preload script | — | Strict allowlist pattern from DNA; no raw ipcRenderer exposed to renderer |
| Overlay window setup (always-on-top, no-dock) | Electron main process | — | BrowserWindow APIs are main-process-only |
| Settings / preferences (small prefs) | Electron main process | — | electron-store runs in main; renderer reads via IPC |

---

## Standard Stack

### Core (all VERIFIED from CLAUDE.md and RSCH-04 spike)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Electron | 41.x LTS (Chromium 146, Node 24 LTS) | Desktop shell, overlay window, macOS APIs | DNA baseline; 41 is current LTS; Node 24 LTS gives ABI stability for native modules |
| React | 19.x (hooks-only) | Overlay + chat UI | DNA standard; current and stable |
| Vite | 7.x | Renderer build/dev server | DNA standard; current |
| `@deepgram/sdk` | latest (model: `nova-3`) | Real-time dual-channel STT over WebSocket | Spike-validated; nova-3 gives 61.5% meeting-domain improvement; free diarization up to 12 speakers |
| `openai` (SDK) | latest | Provider-agnostic LLM via `baseURL` adapter | DNA pattern; works against Gemini, OpenAI, Groq, Ollama with no code change |
| `zod` | latest | Schema definition + LLM output validation | Locked pattern for all Structured Outputs; single source of truth for both OpenAI and Gemini |
| `better-sqlite3-multiple-ciphers` | latest | Encrypted transcript/artifact/summary-card DB (SQLCipher AES-256) | DEC-02 requirement; replaces electron-store for all sensitive data |
| `audiotee` | 0.0.7 (spike-verified npm name) | macOS Core Audio Taps system-audio capture (primary path) | RSCH-04 spike preferred Path 2 — pre-mixer audio, no purple screen-recording indicator, "System Audio Recording Only" permission |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sqlite-vec` | 0.1.9 | Local vector search for epoch RAG and cross-meeting memory | Always (v1 infrastructure for epoch compression; cross-meeting search UX is v2) |
| `electron-store` | latest | Small prefs only (non-sensitive settings) | Settings panel only; never for transcripts, artifacts, or API keys |
| `ics` | latest | .ics calendar export from confirmed action items | Always (v1 baseline calendar integration; zero OAuth) |
| `sharp` | latest | Screenshot downscale for vision assist | Vision feature (inherited from DNA design-reference verdict) |
| `@electron/notarize` | latest | Notarization via `notarytool` | Build time; `altool` deprecated since late 2023 |
| `electron-builder` | latest | Package, sign, notarize | Build time; `hardenedRuntime: true` required |
| `zod-to-json-schema` | latest | Convert Zod schemas to provider-specific structured output formats | ArtifactPipeline — converts once per provider at call time |
| `tiktoken` | latest | Token counting for rolling window monitor | ContextEngine rolling window; `cl100k_base` encoding; never use character-based approximation |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `audiotee` (Core Audio Taps) | Native Chromium loopback (`MacLoopbackAudioForScreenShare` flag) | Chromium path requires no extra dependency but triggers persistent purple screen-recording indicator — a major UX issue for a background meeting assistant; audiotee also captures pre-mixer (volume-independent) audio |
| Gemini 2.5 Flash (default artifact model) | GPT-4o or Gemini 2.5 Pro | Higher cost; use Pro for higher-stakes summaries only; Flash is appropriate for cards and batch extraction |
| `.ics` export (v1) | Direct Google Calendar / Outlook API | OAuth flow adds significant complexity; .ics works everywhere; direct calendar API is a v2 differentiator |
| Rolling long-context (in-meeting) | sqlite-vec RAG in-meeting | RAG adds latency during live sessions; rolling context is simpler and Gemini's 1M window covers all realistic meetings |

**Installation (build milestone reference):**
```bash
npm install @deepgram/sdk openai zod zod-to-json-schema better-sqlite3-multiple-ciphers sqlite-vec audiotee electron-store ics sharp tiktoken
npm install --save-dev electron-builder @electron/notarize
```

**Important:** `better-sqlite3-multiple-ciphers` must be rebuilt against Electron's Node ABI via `electron-rebuild`. Both it and `audiotee`'s Swift binary must be in `asarUnpack`. The `audiotee` binary requires `com.apple.security.cs.disable-library-validation` entitlement.

---

## Package Legitimacy Audit

> This phase produces PRD documents only — no package installs occur. Packages listed here are the build milestone's recommended stack, documented for the planner's reference. Legitimacy was verified via the RSCH-04 spike and CLAUDE.md research.

| Package | Registry | Spike/Source Verified | Verdict | Disposition |
|---------|----------|-----------------------|---------|-------------|
| `audiotee` | npm | RSCH-04 spike confirmed v0.0.7 | OK | Approved — spike-validated |
| `better-sqlite3-multiple-ciphers` | npm | CLAUDE.md + DEC-02 ADR | OK | Approved — cited in official Electron persistence guidance |
| `sqlite-vec` | npm | RSCH-05 confirms v0.1.9 | OK | Approved — github.com/asg017/sqlite-vec |
| `zod` | npm | CLAUDE.md | OK | Approved — industry standard |
| `@deepgram/sdk` | npm | RSCH-04 spike v3.13.0 | OK | Approved — official Deepgram SDK |
| `openai` | npm | DNA + CLAUDE.md | OK | Approved — official OpenAI SDK |
| `tiktoken` | npm | AI-SPEC §2.4 — specified for cl100k_base encoding | OK [ASSUMED] | Approved — official OpenAI tokenizer npm package |
| `zod-to-json-schema` | npm | AI-SPEC §1.8 — specified in provider-agnostic schema delivery | OK [ASSUMED] | Approved — well-established Zod ecosystem package |

**Packages removed due to SLOP verdict:** None

**Packages flagged as suspicious:** None

---

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  macOS Hardware + OS                                                  │
│  ┌──────────────┐  ┌──────────────────────────────┐                 │
│  │  Microphone  │  │  System Audio (Core Audio Tap)│                 │
│  └──────┬───────┘  └────────────────┬─────────────┘                 │
└─────────┼──────────────────────────┼─────────────────────────────────┘
          │                          │ (audiotee npm / Core Audio Tap)
          ▼                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Electron Main Process                                                │
│                                                                       │
│  SessionManager FSM (Idle→PreCapture→Capturing→Processing→Complete)  │
│       │ consent gate (DEC-01) blocks transition to Capturing          │
│       │                                                               │
│  CaptureService                                                       │
│    AudioWorklet (renderer) → IPC → PCM chunks → Deepgram SDK main    │
│    Nova-3 WebSocket ×2 (mic channel + system channel, diarization on)│
│       │ speech_final segments                                         │
│       ▼                                                               │
│  TranscriptStore ──── SQLCipher DB (better-sqlite3-multiple-ciphers) │
│       │ writes diarized segments (meetings, transcript_segments)      │
│       │                                                               │
│  ContextEngine (in-memory)                                            │
│    RollingWindow (token-counted, 800K ceiling, tiktoken cl100k_base) │
│    TokenMonitor ──→ EpochCompressor (fires at 560K tokens, rare)     │
│    SummaryCardTimer (every 5 min) ──→ CardLLMCaller (Gemini Flash)   │
│       │ persists SummaryCard to DB + pushes via IPC                  │
│       │                                                               │
│  ArtifactPipeline (fires at meeting end)                              │
│    MAP: parallel LLM calls per 5-min chunk                            │
│    REDUCE: MeetingArtifactsSchema (Zod validated)                    │
│    CitationValidator (≥90% token overlap check)                      │
│       │ writes artifacts as status:'proposed' to DB                  │
│       │                                                               │
│  LLMAdapter (OpenAI SDK baseURL) ──────→ Gemini 2.5 Flash (default) │
│  EmbeddingAdapter ─────────────────────→ text-embedding-3-small      │
│  sqlite-vec (vec0 extension, epoch RAG)                               │
│  safeStorage ──────────────────────────→ macOS Keychain (DB key)     │
│                                                                       │
└────────────────────────────┬────────────────────────────────────────┘
                             │ contextBridge IPC (hardened allowlist)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Preload Script (src/preload/)                                        │
│    Typed channel allowlist — no raw ipcRenderer exposed              │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Renderer (React 19, Vite 7) — Side Overlay                          │
│    ConsentGateScreen → (user checks box + clicks Start)              │
│    LiveSummaryBoard (stacked SummaryCards, 5-min intervals)          │
│    BreakAssistPanel ("Going on Break" / "I'm Back" + digest display) │
│    ArtifactReviewPanel (proposals: confirm / edit / dismiss)         │
│    SettingsPanel (provider config, non-sensitive prefs)              │
│    AudioWorklets (mic capture in renderer, sends chunks via IPC)     │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
MeetingAssist/
├── src/
│   ├── main/                       # Electron main process (Node.js, no browser APIs)
│   │   ├── capture/                # CaptureService — AudioWorklet bridge + Deepgram WebSocket ×2
│   │   ├── stt/                    # STT adapter seam (Deepgram Nova-3; provider swappable)
│   │   ├── llm/                    # LLMAdapter (openai SDK + baseURL) + structured output helpers
│   │   ├── store/                  # TranscriptStore, ArtifactStore, SummaryCardStore (SQLCipher)
│   │   ├── context/                # ContextEngine (RollingWindow, TokenMonitor, EpochCompressor, CardTimer)
│   │   ├── pipeline/               # ArtifactPipeline (map-reduce batch, CitationValidator)
│   │   ├── session/                # SessionManager FSM + consent gate enforcement
│   │   ├── calendar/               # .ics export service (ics library)
│   │   └── index.ts                # Main process entry point (app, createWindow, IPC setup)
│   ├── preload/
│   │   └── index.ts                # Hardened contextBridge allowlist
│   ├── renderer/                   # React 19 + Vite (browser context)
│   │   ├── components/
│   │   │   ├── ConsentGate.tsx     # Per-meeting consent dialog
│   │   │   ├── LiveSummaryBoard.tsx # Stacked interval cards
│   │   │   ├── SummaryCard.tsx     # Individual 5-min interval card
│   │   │   ├── BreakAssistPanel.tsx # Break assist trigger + digest display
│   │   │   ├── ArtifactReview.tsx  # Proposal confirm/edit/dismiss UI
│   │   │   └── SettingsPanel.tsx   # Provider settings, prefs
│   │   ├── App.tsx                 # Root component, IPC event wiring
│   │   └── main.tsx                # Renderer entry point
│   └── shared/
│       └── schemas/
│           └── index.ts            # All Zod schemas (single source of truth)
├── build/
│   ├── entitlements.mac.plist      # allow-jit, allow-unsigned-exec-memory, disable-library-validation
│   └── icon.icns
├── eval/
│   ├── corpus/                     # AdversarialTestCase JSON files (60 transcripts, 8 categories)
│   └── harness.ts                  # Standalone eval runner (not part of Vitest)
├── .planning/                      # Planning artifacts (tracked in git)
└── package.json
```

### Pattern 1: SessionManager FSM

**What:** A finite state machine that governs the entire meeting session lifecycle. The consent gate (DEC-01) is a hard precondition for the Capturing state — the FSM cannot transition from PreCapture to Capturing unless the renderer emits the `consent-confirmed` IPC event.

**When to use:** Every capture start/stop must go through this FSM. Direct calls to CaptureService bypassing the FSM are forbidden.

```typescript
// Source: Derived from DEC-01 and 04-AI-SPEC.md requirements
// States (Claude's Discretion area — these are the researcher's recommendation)
type SessionState =
  | 'Idle'          // no meeting in progress
  | 'PreCapture'    // meeting setup shown; consent gate displayed
  | 'Capturing'     // LOCKED behind consent-confirmed event; audio capture active
  | 'OnBreak'       // break_start_timestamp recorded; capture still running
  | 'Processing'    // meeting ended; ArtifactPipeline running
  | 'Complete';     // artifacts ready; proposals shown to user

// Transitions:
// Idle → PreCapture: user clicks "Start Meeting"
// PreCapture → Capturing: ONLY on consent-confirmed IPC event
// Capturing → OnBreak: user clicks "Going on Break"
// OnBreak → Capturing: user clicks "I'm Back"
// Capturing → Processing: user clicks "End Meeting"
// Processing → Complete: ArtifactPipeline finishes
// Complete → Idle: user dismisses artifact review or starts new meeting

interface SessionManagerPort {
  getState(): SessionState;
  transition(event: SessionEvent): void;
  onStateChange(cb: (state: SessionState) => void): void;
}
```

### Pattern 2: IPC Channel Contract (contextBridge allowlist)

**What:** The complete set of typed IPC channels. This is the preload script's allowlist. No channel outside this list may be subscribed to or invoked.

**When to use:** Every main↔renderer communication goes through these channels. Never expose raw `ipcRenderer`.

```typescript
// Source: Derived from DNA preload.js pattern (01-DNA-CATALOGUE.md §Technique 3)
// Inbound (main → renderer) — renderer subscribes via window.electronAPI.on(channel, cb)
const INBOUND_CHANNELS = [
  'session-state-changed',       // SessionState update
  'transcript-segment',          // TranscriptSegment (speech_final)
  'summary-card-ready',          // SummaryCard (5-min interval complete)
  'break-assist-digest-ready',   // BreakAssistDigest (on "I'm back")
  'artifact-proposals-ready',    // MeetingArtifacts proposals (end-of-meeting batch)
  'capture-health-update',       // CaptureHealth (audio stream status)
] as const;

// Outbound (renderer → main) — renderer calls window.electronAPI.invoke(channel, payload)
const OUTBOUND_CHANNELS = [
  'consent-confirmed',           // User checked consent box + clicked Start
  'mic-audio-chunk',             // Float32 PCM frames from mic AudioWorklet
  'start-meeting',               // User clicked Start Meeting
  'end-meeting',                 // User clicked End Meeting
  'start-break',                 // User clicked Going on Break
  'end-break',                   // User clicked I'm Back
  'confirm-artifact',            // User confirmed a proposal
  'edit-artifact',               // User edited + confirmed a proposal
  'dismiss-artifact',            // User dismissed a proposal
  'export-ics',                  // User clicked export for confirmed action items
  'get-settings',                // Request current settings
  'set-setting',                 // Update a setting
] as const;
```

### Pattern 3: Quote-Backed Extraction (Two-Stage)

**What:** The faithfulness contract from 04-AI-SPEC.md §1.2. All artifact extraction must use this two-stage protocol. Stage 1 extracts verbatim quotes; Stage 2 generates artifact content ONLY from those quotes.

**When to use:** Every ArtifactPipeline extraction call — both map phase (per-chunk) and reduce phase (deduplication/MOM).

```typescript
// Source: 04-AI-SPEC.md §1.2, §1.6 — locked design contract
// Stage 1: evidence extraction
const stage1Prompt = `
You are extracting evidence from a meeting transcript. 
For each potential action item, decision, or date, extract the VERBATIM quote 
that directly supports it. Do not paraphrase.
meeting_date: ${meetingStartedAt}  // inject ISO 8601 — prevents relative date confusion
transcript: ${transcriptChunk}
`;
// Stage 1 output: CitationAnchor[] — quotes only, no artifact content yet

// Stage 2: constrained generation (receives ONLY the quotes, not the full transcript)
const stage2Prompt = `
Generate action items ONLY from the following extracted quotes.
Do not use any information not present in these quotes.
Quotes: ${JSON.stringify(stage1Anchors)}
`;
// Stage 2 output: MeetingArtifactsSchema (Zod-validated, all items status:'proposed')
```

### Anti-Patterns to Avoid

- **Generating artifact content before extracting quotes:** The model will fabricate quotes to justify pre-generated content. Stage 1 (evidence) MUST run before Stage 2 (content). See AI-SPEC §1.7 Pitfall 1.
- **Merging speaker IDs across Deepgram channels:** Each WebSocket connection has an independent speaker ID space. Speaker 0 on mic ≠ Speaker 0 on system audio. Mic channel always maps to "You"; system audio uses a separate speaker registry. See RSCH-02.
- **Using summary cards as epoch compression input:** Epoch compression reads from `transcript_segments`, NOT `summary_cards`. Summary cards are display artifacts. See AI-SPEC §2.2 Pitfall 4.
- **Using a character-based token counter:** Use `tiktoken` with `cl100k_base`. Character approximations drift ~15–20% over long meetings and cause silent context overflow. See AI-SPEC §2.4 Pitfall 2.
- **Compressing the most-recent segments first:** Epoch compressor MUST evict OLDEST segments (lowest timestamp). See AI-SPEC §2.5 Pitfall 3.
- **Using Gemini free-tier API for meeting data:** Free tier explicitly allows training on submitted data — violates DEC-02. Only paid Gemini API is allowed. Validate at settings time. See RSCH-03.
- **Auto-writing to calendar without user confirmation:** The proposed-with-confirm contract (D-04) is absolute — `status: z.literal('proposed')` enforced by schema; calendar export only for `'confirmed'` items. See AI-SPEC §1.5.
- **Storing API keys in electron-store:** Keys must go through `safeStorage` → macOS Keychain. electron-store is for non-sensitive prefs only. See DNA-CATALOGUE leave-behind.
- **Using electron-store for transcripts or artifacts:** Must use `better-sqlite3-multiple-ciphers`. See DEC-02.
- **electron-audio-loopback as the primary capture path:** RSCH-04 spike recommends `audiotee` (Core Audio Taps) as the primary path — pre-mixer audio, no purple screen-recording indicator. Native Chromium loopback is the fallback for macOS < 14.2.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Meeting transcript DB encryption | Custom encryption layer | `better-sqlite3-multiple-ciphers` (SQLCipher AES-256) | Full-DB encryption with macOS Keychain-backed key via safeStorage; field-level encryption is more complex with no benefit |
| LLM structured output parsing | Custom JSON parser | Zod schema + `response_format`/`responseSchema` | Loose JSON-mode prompting misses keys, violates enums; strict structured outputs guarantee schema adherence |
| Token counting for rolling window | `Math.ceil(text.length / 4)` character approximation | `tiktoken` with `cl100k_base` | Character approximations drift ~15-20% over long meetings; causes silent context overflow |
| System audio capture | Custom ScreenCaptureKit bindings | `audiotee` npm package (Core Audio Taps) | ~600KB managed Swift binary; pre-mixer audio; cleaner permissions UX; no purple indicator |
| Calendar export | Custom .ics file serializer | `ics` npm library | iCalendar spec has edge cases (RRULE, timezone handling, encoding); hand-rolling it will miss cases |
| Provider-agnostic LLM calls | Custom adapter per-provider | OpenAI SDK `baseURL` (inherited pattern from DNA) | Proven, battle-tested; swaps providers with zero code change |
| Zod-to-provider schema conversion | Hand-author per-provider JSON schemas | `zod-to-json-schema` | Single source of truth; manually maintained dual schemas will drift between OpenAI and Gemini paths |
| macOS Keychain integration | Custom security framework calls | Electron `safeStorage` API | safeStorage is the Electron-blessed Keychain abstraction; handles key generation, storage, and retrieval correctly |
| Local vector search | Custom embedding index | `sqlite-vec` (`vec0` extension) | No separate service; inherits SQLCipher encryption; standard KNN SQL syntax |
| Notarization | Custom notarytool scripts | `@electron/notarize` with `notarytool` | `altool` is deprecated since late 2023; `@electron/notarize` manages the async notarytool workflow correctly |

**Key insight:** This is a meeting recording and AI extraction product. Every non-product-specific problem (DB encryption, token counting, calendar export, system audio capture, LLM schema enforcement) has a well-maintained solution. Hand-rolling any of these is time that should be spent on the actual product — the consent/capture pipeline, the faithfulness-grounded artifact extraction, and the overlay UX.

---

## Prior Phase Artifact Map (What Each Phase Feeds Into Each PRD Document)

### Feeds Into PRD-01 (FEATURE-SPEC.md)

| Source | Contribution |
|--------|-------------|
| CONTEXT.md D-01 to D-10 | Complete v1 feature list (table-stakes) — locked |
| CONTEXT.md D-11 to D-14 | Complete v2 deferrals — locked |
| RSCH-01 | Persona definition, revenue model, success metric, differentiator story (5 pillars) |
| RSCH-02 | Diarization spec: Speaker 1/2/3 labels, v1 cap at 8 speakers, v2 named attribution |
| RSCH-04 | AudioTee.js (Core Audio Taps) as primary capture path; macOS floor (macOS 14.2+ for primary path, macOS 15.0+ tested in spike) |
| RSCH-06 | Meeting-type taxonomy, competitive feature gap analysis, v1 confidence levels |
| DEC-01 | Consent gate as a hard precondition to capture (per-meeting, all-party, checkbox + disabled Start button) |
| DEC-02 | Local-first encrypted storage, transcribe-then-delete-raw-audio, indefinite retention until user deletes |
| 04-AI-SPEC §1.5 | Proposed-with-confirm UX contract — no auto-write to calendar |

**V1 Feature Classification (synthesized):**

Table Stakes (must ship):
1. Consent gate (per-meeting, disclosed all-party)
2. Dual-channel audio capture (mic + system audio, AudioTee.js primary)
3. Real-time transcription with Speaker 1/2/3 diarization (Deepgram Nova-3, v1 cap 8 speakers)
4. Live summary board (5-min interval cards, stacked overlay)
5. TranscriptStore (SQLCipher DB, full meeting record)
6. End-of-meeting artifact batch: MOM, key points, summary, action items, dates/events
7. Citation-backed artifact extraction (proposed-with-confirm, "Verify" toggle)
8. .ics export for confirmed action items
9. Break assist (manual "Going on Break" / "I'm Back"; interval cards + "While you were away" digest)
10. Persistent side overlay (always-on-top, no-dock, screen-share-invisible panel)

Differentiators (competitive advantages):
- No visible bot — local-first, macOS-native capture
- Pre-mixer audio via Core Audio Taps (volume-independent, clean PCM)
- Faithfulness-grounded extraction with citation anchors
- Live summary board with break assist — no competitor offers this bot-free
- Encrypted local-first storage (DEC-02) — addresses the #1 adoption barrier (46-50% of workers cite privacy as top concern)

Deferred V2+:
- Live assistant interactive chat UI
- Meeting-type-specific templates
- Cross-meeting search UX (sqlite-vec DB schema is v1 infrastructure)
- Named speaker attribution (Alice/Bob)
- Google Calendar / Outlook direct API (beyond .ics)
- Slack, Notion, CRM integrations
- On-device / offline mode (whisper.cpp + local LLM)
- Team collaboration features

### Feeds Into PRD-02 (ARCHITECTURE.md)

| Source | Contribution |
|--------|-------------|
| 04-AI-SPEC §Section 1 | ArtifactPipeline interface: CitationAnchorSchema, ActionItemSchema, DecisionSchema, ExtractedDateSchema, KeyPointSchema, MeetingArtifactsSchema, SummaryCardSchema — all Zod schemas are FINAL |
| 04-AI-SPEC §Section 2 | ContextEngine architecture: RollingWindow, TokenMonitor, SummaryCardTimer, EpochCompressor, ContextComposer; two-speed architecture; data flow; component map |
| 04-AI-SPEC §2.8 | ArtifactPipeline map-reduce contract; CitationValidator; map chunk = 5-min card intervals |
| 04-AI-SPEC §2.9 | Break Assist Digest data flow |
| RSCH-05 | Database schema (5 tables: meetings, transcript_segments, vec_chunks, artifacts, action_items); `summary_cards` table must be added for AI-SPEC compatibility |
| RSCH-04 | Capture architecture: `audiotee` main process + AudioWorklet renderer + IPC; macOS 14.2+ for primary path |
| RSCH-02 | Diarization pipeline: mic channel always "You"; system audio uses separate speaker registry per channel |
| DNA-CATALOGUE §Technique 1 | Dual-channel STT pattern with `speech_final` accumulation state machine |
| DNA-CATALOGUE §Technique 2 | LLM adapter: `getLLMClient()` → `src/main/llm/` module; add Structured Outputs + Zod |
| DNA-CATALOGUE §Technique 3 | Hardened contextBridge IPC allowlist pattern |
| DNA-CATALOGUE §Technique 5 | Overlay window setup: transparent, frame:false, setAlwaysOnTop('screen-saver'), setVisibleOnAllWorkspaces, setIgnoreMouseEvents, app.dock.hide() |
| DEC-01 | SessionManager FSM must enforce consent gate as precondition to Capturing state |
| DEC-02 | DB encryption: SQLCipher + safeStorage key; Deepgram `mip_opt_out=true`; Gemini paid quota only |
| RSCH-03 | Vendor implementation requirements: Deepgram `mip_opt_out=true` in SDK init; AssemblyAI opt-out flag; Gemini paid plan validation |
| CLAUDE.md | Full stack: Electron 41, React 19, Vite 7, all package choices |

**Architecture Gaps to Fill (Claude's Discretion — spec writer fills these in):**

The AI-SPEC and prior phases leave these architecture areas underdefined that ARCHITECTURE.md must resolve:

1. **SessionManager FSM state names and transitions** — the researcher has drafted a recommendation (Idle / PreCapture / Capturing / OnBreak / Processing / Complete) in the Architecture Patterns section above. This is the authoritative recommendation.

2. **`summary_cards` table DDL** — RSCH-05 defines 5 tables but was scoped before the AI-SPEC defined SummaryCardSchema in detail. ARCHITECTURE.md must add the `summary_cards` table DDL compatible with SummaryCardSchema fields.

3. **`epoch_summaries` table DDL** — AI-SPEC §2.5 defines EpochSummarySchema but the DB table DDL was not in RSCH-05. ARCHITECTURE.md must define the `epoch_summaries` table.

4. **Full IPC channel surface** — the contextBridge contract above documents all channels; ARCHITECTURE.md must formalize this as typed payload shapes (TypeScript interfaces for each channel's data).

5. **React component tree** — CONTEXT.md D-18 requires this. The component tree above is the researcher's recommendation; the spec writer uses it.

6. **Electron BrowserWindow configuration** — specific `webPreferences`, window dimensions, and side-panel positioning for the overlay (DNA Technique 5 is the pattern; MeetingAssist adapts to a full-height right-side strip).

### Feeds Into PRD-03 (BUILD-ORDER.md)

| Source | Contribution |
|--------|-------------|
| CONTEXT.md D-19 / D-20 | Strategy locked: start with audio capture; 4–6 phases |
| RSCH-04 | Audio capture is highest technical risk — gates everything else |
| AI-SPEC §2 | ContextEngine depends on TranscriptStore; ArtifactPipeline depends on both |
| RSCH-05 | DB schema design — must come before TranscriptStore implementation |
| DEC-01 | Consent gate must be in place before any capture test |
| DNA-CATALOGUE | Foundation (Electron scaffold, IPC baseline, overlay window) must come before all other work |

**Recommended Build Phase Sequence (CONTEXT.md D-20 suggestion, refined):**

| Build Phase | Primary Deliverable | Key Dependencies | Risk Level |
|-------------|--------------------|--------------------|------------|
| Phase 1: Foundation & Scaffold | Electron shell, overlay window, hardened IPC, SQLCipher DB open/close, safeStorage key generation, consent gate UI skeleton | None — greenfield | LOW |
| Phase 2: Capture + TranscriptStore | Dual-channel audio capture (audiotee + AudioWorklet), Deepgram Nova-3 dual WebSocket, speech_final accumulation, TranscriptStore (DB writes), capture health check | Phase 1 (Electron + DB) | HIGH (highest technical risk — validate first) |
| Phase 3: ArtifactPipeline | End-of-meeting batch: map-reduce chunks → Zod-validated MeetingArtifacts; CitationValidator; artifact-proposals-ready IPC; ArtifactReview UI (confirm/edit/dismiss); .ics export | Phase 2 (transcripts must exist to extract from) | MEDIUM |
| Phase 4: Overlay UI + Live Summary Board | React side overlay full layout, SummaryCardTimer + CardLLMCaller, SummaryCard push via IPC, LiveSummaryBoard component, SessionManager FSM wired end-to-end | Phase 3 (artifact review UI needed for complete session flow) | MEDIUM |
| Phase 5: ContextEngine + Break Assist | ContextEngine rolling window, TokenMonitor, EpochCompressor, BreakAssist trigger/digest, ContextComposer, end-to-end session test with full 60-min+ meeting | Phase 4 (summary cards must exist for break assist) | MEDIUM |
| Phase 6: Packaging + Eval Harness | electron-builder config, hardened runtime entitlements, notarization, adversarial eval corpus (60 transcripts) + harness.ts, CGFS ≥ 0.85 + EHR ≤ 0.05 gate | Phase 5 (complete pipeline needed for eval) | LOW–MEDIUM |

**Dependency chain summary:**
```
Foundation → Capture + TranscriptStore → ArtifactPipeline → Overlay UI → ContextEngine + Break Assist → Packaging + Eval
```

The one non-obvious constraint: **ArtifactPipeline (Phase 3) before Live Summary Board (Phase 4)**. The summary board uses the same LLM adapter and Zod output pattern as the ArtifactPipeline — building the batch pipeline first establishes the Zod + LLM adapter pattern that the card generation reuses. Building the card UI before the pipeline would require retrofitting.

### Feeds Into PRD-04 (PRD.md hub document)

All prior phases feed the PRD.md hub. The hub document assembles:
- Executive summary (from RSCH-01: persona, positioning, differentiators, monetization)
- Product vision and core value (from PROJECT.md)
- Decisions index (all locked decisions from Phases 1–4)
- Feature scope summary (from FEATURE-SPEC.md)
- Architecture summary (from ARCHITECTURE.md)
- Build order summary (from BUILD-ORDER.md)
- Links to all linked documents

---

## Common Pitfalls

### Pitfall 1: Writing Architecture Decisions Not Already in Prior Phases

**What goes wrong:** The ARCHITECTURE.md spec writer introduces new design decisions (different DB schema, different FSM states, different LLM model choices) that contradict locked decisions from Phases 1–4.
**Why it happens:** The prior phase corpus is large; it's easy to miss a locked decision and inadvertently re-open it.
**How to avoid:** All architecture decisions must be traced to a source in Phases 1–4. The Architectural Responsibility Map and Architecture Gaps sections above identify the only areas that are Claude's Discretion. Everything else is locked.
**Warning signs:** A new library recommended that isn't in CLAUDE.md; a DB schema that contradicts RSCH-05; a capture path that contradicts RSCH-04's recommendation.

### Pitfall 2: Missing the `summary_cards` and `epoch_summaries` Tables in the DB Schema

**What goes wrong:** RSCH-05 defines 5 tables, but two more are required by the AI-SPEC (summary_cards for SummaryCardSchema, epoch_summaries for EpochSummarySchema). ARCHITECTURE.md omits them, leaving a gap in the persistence spec.
**Why it happens:** RSCH-05 was written before the AI-SPEC fully specified these concepts. The gap is a sequencing artifact, not a design contradiction.
**How to avoid:** ARCHITECTURE.md DB schema section must define 7 tables: the 5 from RSCH-05 plus `summary_cards` and `epoch_summaries`.

### Pitfall 3: PRD-02 Architecture Spec Too Abstract

**What goes wrong:** ARCHITECTURE.md lists module names but doesn't define TypeScript interfaces for each service or IPC payload shapes. A contractor can't scaffold the codebase from it.
**Why it happens:** The temptation is to describe architecture at a conceptual level rather than at the interface contract level.
**How to avoid:** Per CONTEXT.md D-17, every service/module must have a TypeScript interface or IPC contract. The IPC channel surface must include typed payload shapes. The DB schema must be DDL-level SQL. The FSM must specify every state and every transition event.

### Pitfall 4: PRD-03 Build Order Without Explicit Dependency Rationale

**What goes wrong:** BUILD-ORDER.md lists phase names without explaining why they're in that order. The build milestone planner doesn't understand why Phase 2 (Capture) must come before Phase 3 (ArtifactPipeline) and swaps them.
**Why it happens:** Dependency rationale isn't written down.
**How to avoid:** Every build phase must list what it depends on AND why — specifically which prior phase component it requires at runtime. The dependency chain table above provides this.

### Pitfall 5: Executive Summary in PRD.md Is Too Technical

**What goes wrong:** The PRD.md executive summary section reads like a technical specification. An investor can't use it to understand the product.
**Why it happens:** PRD authors naturally default to technical detail.
**How to avoid:** The executive summary section must specifically cover: the core value proposition (one sentence), the customer problem, the market size/signal (Granola $43M raise, 3.67B market), the 5 differentiator pillars (from RSCH-01), the monetization hypothesis ($12–15/mo, free trial first), and the success metric hypothesis. Technical terms (Electron, SQLCipher, Deepgram) should not appear in the executive summary.

### Pitfall 6: Forgetting the Gemini Paid Plan Gate

**What goes wrong:** ARCHITECTURE.md describes the Gemini integration without specifying the paid-plan validation requirement. Build milestone implements Gemini support and accidentally allows free-tier keys to process meeting data.
**Why it happens:** It's a non-obvious constraint — free-tier and paid-tier keys look identical in code.
**How to avoid:** ARCHITECTURE.md LLM adapter section must explicitly document: "Gemini free tier is disqualified for meeting data (DEC-02 / RSCH-03). The settings panel must warn the user or refuse to use Gemini without billing confirmation." Reference RSCH-03.

### Pitfall 7: Capture Path Inconsistency Between CLAUDE.md and RSCH-04 Spike

**What goes wrong:** CLAUDE.md recommends `electron-audio-loopback` as the default capture library. The RSCH-04 spike found that `audiotee` (Core Audio Taps) is strongly preferred and that `electron-audio-loopback` is unnecessary on Electron 42.x. The PRD could pick either without explaining the discrepancy.
**Why it happens:** CLAUDE.md was written before the spike; the spike supersedes the default recommendation.
**How to avoid:** FEATURE-SPEC.md and ARCHITECTURE.md must note that RSCH-04 updated the capture recommendation. Primary path: `audiotee` (Core Audio Taps, macOS 14.2+, no purple indicator, pre-mixer audio). Fallback path: native Chromium loopback flags (macOS 15.0+ as tested in spike, purple indicator, post-mixer). The CLAUDE.md `electron-audio-loopback` reference is superseded by the spike finding.

---

## Code Examples

### Canonical Extraction Schemas (from 04-AI-SPEC.md §1.6)

```typescript
// Source: 04-AI-SPEC.md §1.6 — LOCKED, do not modify without phase-level decision
import { z } from 'zod';

const CitationAnchorSchema = z.object({
  quote_preview: z.string().describe("First 10 words of the verbatim transcript passage"),
  quote_full: z.string().describe("Complete verbatim quote from transcript"),
  speaker_label: z.string().describe("Speaker label: 'You', 'Speaker 1', etc."),
  timestamp_start: z.number().describe("Seconds from meeting start"),
  timestamp_end: z.number().describe("Seconds from meeting start"),
  confidence: z.enum(['direct', 'inferred']),
});

const ActionItemSchema = z.object({
  id: z.string().uuid(),
  description: z.string(),
  assignee_label: z.string().nullable(),
  due_date: z.string().nullable(),            // ISO 8601 or null
  raw_deadline_text: z.string().nullable(),
  status: z.literal('proposed'),
  citations: z.array(CitationAnchorSchema).min(1),
});

const MeetingArtifactsSchema = z.object({
  meeting_id: z.string().uuid(),
  summary: z.string(),
  key_points: z.array(z.object({
    text: z.string(),
    speaker_label: z.string().nullable(),
    citations: z.array(CitationAnchorSchema).min(1),
  })),
  action_items: z.array(ActionItemSchema),
  decisions: z.array(z.object({
    id: z.string().uuid(),
    description: z.string(),
    decision_maker_label: z.string().nullable(),
    status: z.literal('proposed'),
    citations: z.array(CitationAnchorSchema).min(1),
  })),
  dates: z.array(z.object({
    id: z.string().uuid(),
    description: z.string(),
    date: z.string().nullable(),
    raw_date_text: z.string(),
    status: z.literal('proposed'),
    citations: z.array(CitationAnchorSchema).min(1),
  })),
  minutes_of_meeting: z.string(),
  model_used: z.string(),
  extraction_timestamp: z.string(),
});
```

### Database Schema (from RSCH-05 + AI-SPEC additions)

```sql
-- Source: RSCH-05 (5 tables) + AI-SPEC §2.2/§2.5 additions (summary_cards, epoch_summaries)

-- 5-minute interval summary cards (SummaryCardSchema)
CREATE TABLE IF NOT EXISTS summary_cards (
  id                     TEXT PRIMARY KEY,          -- UUID v4
  meeting_id             TEXT NOT NULL
    REFERENCES meetings(id) ON DELETE CASCADE,
  card_index             INTEGER NOT NULL,
  interval_start_seconds REAL NOT NULL,
  interval_end_seconds   REAL NOT NULL,
  wall_time_label        TEXT NOT NULL,             -- "10:00–10:05"
  topic_headline         TEXT NOT NULL,
  key_points_json        TEXT NOT NULL,             -- JSON array of bullet strings
  action_items_mentioned_json TEXT NOT NULL,        -- JSON array (tentative, not citations-validated)
  speaker_contributions_json  TEXT NOT NULL,        -- JSON object: speaker_label → summary string
  model_used             TEXT NOT NULL,
  generated_at           TEXT NOT NULL,             -- ISO 8601
  created_at             INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- Epoch summaries (EpochSummarySchema — overflow safeguard for 40h+ meetings)
CREATE TABLE IF NOT EXISTS epoch_summaries (
  id                       TEXT PRIMARY KEY,        -- UUID v4
  meeting_id               TEXT NOT NULL
    REFERENCES meetings(id) ON DELETE CASCADE,
  covered_interval_start   REAL NOT NULL,
  covered_interval_end     REAL NOT NULL,
  decisions_json           TEXT NOT NULL,           -- JSON array of strings
  action_items_json        TEXT NOT NULL,           -- JSON array of strings
  key_points_json          TEXT NOT NULL,           -- JSON array of strings
  speaker_attributions_json TEXT NOT NULL,          -- JSON object: speaker_label → summary
  raw_segment_count        INTEGER NOT NULL,
  token_count_compressed   INTEGER NOT NULL,
  created_at               TEXT NOT NULL            -- ISO 8601
);
```

### Provider-Agnostic Structured Output Delivery (from 04-AI-SPEC.md §1.8)

```typescript
// Source: 04-AI-SPEC.md §1.8 — single Zod schema, two provider formats
import zodToJsonSchema from 'zod-to-json-schema';
import { MeetingArtifactsSchema } from '../shared/schemas';

// OpenAI Structured Outputs
const openaiConfig = {
  response_format: {
    type: 'json_schema' as const,
    json_schema: {
      strict: true,
      name: 'MeetingArtifacts',
      schema: zodToJsonSchema(MeetingArtifactsSchema),
    },
  },
};

// Gemini responseJsonSchema
const geminiConfig = {
  generationConfig: {
    responseJsonSchema: zodToJsonSchema(MeetingArtifactsSchema),
    responseMimeType: 'application/json',
  },
};
// Contract: both paths use zodToJsonSchema(MeetingArtifactsSchema). Never hand-author the JSON schema.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `electron-audio-loopback` npm (CLAUDE.md default) | `audiotee` Core Audio Taps (RSCH-04 spike recommendation) | 2026-06-25 spike | Primary capture path is now Core Audio Taps (pre-mixer, no purple indicator); Chromium loopback is fallback |
| `electron-audio-loopback` flags needed | Native Chromium flags built in (Electron 39+) | Electron 39 | `electron-audio-loopback` is unnecessary for the fallback path; native flags work without a package |
| Deepgram Nova-2 (DNA baseline) | Deepgram Nova-3 (CLAUDE.md, RSCH-02) | 2026-06-25 | 61.5% meeting-domain accuracy improvement; free diarization up to 12 speakers |
| `electron-store` for all persistence (DNA) | `better-sqlite3-multiple-ciphers` for data; `safeStorage` for secrets | DEC-02 | SQLCipher AES-256 full-DB encryption; Keychain-backed key |
| `@journeyapps/sqlcipher` | `better-sqlite3-multiple-ciphers` | Ecosystem change | `@journeyapps/sqlcipher` is unmaintained and breaks on Apple Silicon |
| `altool` for notarization | `@electron/notarize` → `notarytool` | Late 2023 (Apple deprecation) | `altool` is deprecated; `notarytool` is required |
| Loose JSON-mode prompting | Strict Structured Outputs (`response_format.strict: true` + Zod) | CLAUDE.md decision | Guaranteed schema adherence vs. probabilistic; eliminates parsing failures on action-item/date extraction |

**Deprecated/outdated:**
- `electron-audio-loopback` as default: superseded by RSCH-04's AudioTee.js recommendation for macOS 14.2+. Still viable as a no-extra-dependency fallback path on macOS 15.0+.
- `altool` notarization: Apple deprecated it in late 2023. All builds must use `notarytool` via `@electron/notarize`.
- `@journeyapps/sqlcipher`: unmaintained, breaks on Apple Silicon; use `better-sqlite3-multiple-ciphers` (SQLCipher-backed, maintained).
- Nova-2 model literal: always use `nova-3` with `diarize: true`.

---

## Runtime State Inventory

> This phase produces document files only — not a rename/refactor/migration. No runtime state audit is required.

Not applicable — Phase 5 writes `.md` files to `.planning/phases/05-prd-finalization/`. No runtime systems, databases, registered services, or build artifacts are modified. The only artifact is four PRD documents.

---

## Environment Availability

> Phase 5 writes documentation files only. No external services, CLIs, or runtimes are required to execute this phase.

No external dependencies required for Phase 5 execution. The phase reads existing `.planning/` files and writes new `.md` documents using file I/O only.

---

## Validation Architecture

> `workflow.nyquist_validation` is enabled (no explicit `false` in config.json).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | This phase produces documentation — no code tests apply |
| Quick run command | N/A (document phase) |
| Full suite command | N/A (document phase) |
| Verification | Human review — do the 4 output files exist and meet acceptance criteria? |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Verification Approach | Status |
|--------|----------|-----------|----------------------|--------|
| PRD-01 | FEATURE-SPEC.md exists with explicit MVP boundary table | Manual / document check | Verify file exists; verify table has table-stakes, differentiators, and v2+ deferred columns | New file |
| PRD-02 | ARCHITECTURE.md exists with module map + IPC contracts + FSM | Manual / document check | Verify file exists; verify TypeScript interfaces for each service; verify IPC channel table; verify DB DDL; verify FSM states | New file |
| PRD-03 | BUILD-ORDER.md exists with 4-6 dependency-ordered phases | Manual / document check | Verify file exists; verify phases are 4-6; verify each phase has explicit dependency rationale | New file |
| PRD-04 | PRD.md hub exists with executive summary + links to all 3 files | Manual / document check | Verify file exists; verify executive summary section; verify links to FEATURE-SPEC.md, ARCHITECTURE.md, BUILD-ORDER.md | New file |

### Wave 0 Gaps

None — this phase requires no new test infrastructure. Verification is document inspection.

---

## Security Domain

> `security_enforcement` is enabled (true in config.json). Applies to the architecture spec content — the PRD must specify security controls correctly.

### Applicable ASVS Categories (for the architecture spec in PRD-02)

| ASVS Category | Applies | Standard Control in Architecture |
|---------------|---------|----------------------------------|
| V2 Authentication | No (no user auth in v1 — single-user local app) | N/A |
| V3 Session Management | Partial | SessionManager FSM; meeting sessions are local-only, no server state |
| V4 Access Control | No | Local single-user app; no multi-user access control |
| V5 Input Validation | Yes | Zod strict schema validation on ALL LLM outputs; reject on schema failure |
| V6 Cryptography | Yes | SQLCipher AES-256 (better-sqlite3-multiple-ciphers); safeStorage → macOS Keychain; never hand-roll crypto |
| V7 Error Handling | Partial | Capture health check; LLM failure graceful fallback; DB connection failure handling |
| V9 Communication | Yes | Deepgram WebSocket with `mip_opt_out=true`; Gemini paid-plan validation; HTTPS for all external calls |

### Known Threat Patterns (from 04-AI-SPEC.md §7)

| Pattern | STRIDE | Standard Mitigation | Spec Location |
|---------|--------|---------------------|--------------|
| Prompt injection via transcript content | Tampering | Separate transcript content from instructions in structured prompts (system role for instructions, not injected into content) | ArtifactPipeline extraction prompt design |
| LLM output injection (malicious JSON in response) | Tampering | Zod strict schema validation on all LLM outputs; reject responses that fail validation | ArtifactPipeline + ContextEngine LLM calls |
| Citation forgery (plausible-but-false quote) | Repudiation | CitationValidator 90% token overlap check before showing proposals | ArtifactPipeline §2.8 |
| Sensitive meeting content in LLM API | Information Disclosure | Deepgram `mip_opt_out=true` (RSCH-03); Gemini paid quota only (RSCH-03 critical warning) | LLMAdapter + STT adapter initialization |
| Plaintext secrets in electron-store | Information Disclosure | All secrets via safeStorage → macOS Keychain; electron-store for non-sensitive prefs only | SettingsPanel + safeStorage service |
| Epoch summary corruption | Tampering | Original transcript_segments preserved in DB; epochs are compressed copies, not replacements | ContextEngine EpochCompressor |
| Missing consent gate | N/A (product/legal) | SessionManager FSM blocks Capturing state until consent-confirmed IPC received | SessionManager FSM |

---

## Open Questions

1. **macOS floor for the fallback (Chromium loopback) path**
   - What we know: RSCH-04 spike ran on macOS 26.x (Tahoe) with Electron 42.x. The primary recommendation is `audiotee` (macOS 14.2+).
   - What's unclear: What is the tested minimum macOS version for the Chromium loopback fallback path? The spike report says "macOS 15.0+" for Path 1 findings. CLAUDE.md originally said 13.2+.
   - Recommendation: ARCHITECTURE.md should document macOS 14.2+ as the minimum for the primary path (audiotee) and macOS 15.0+ as tested for the fallback path, with a note that lower macOS versions are unsupported in v1. The build milestone should include a minimum-OS check at startup.

2. **Embedding provider fallback when no OpenAI key is configured**
   - What we know: AI-SPEC §2.5 specifies `text-embedding-3-small` (OpenAI) as the default embedding model for epoch RAG. RSCH-05 uses 1536-dimension float vectors.
   - What's unclear: What if the user configures only a Gemini key (no OpenAI key)? The epoch embedding step needs a fallback.
   - Recommendation: The embedding adapter should follow the same `baseURL` pattern as the LLM adapter. If no OpenAI key is configured, fall back to a Gemini embedding model (also 1536 dimensions per RSCH-05). Document in ARCHITECTURE.md as a configurable embedding provider.

3. **`mip_opt_out=true` enforcement mechanism**
   - What we know: RSCH-03 requires `mip_opt_out=true` on ALL Deepgram API requests. This must be a default in SDK initialization, not a per-call option.
   - What's unclear: Should the settings panel expose this as a user toggle (opt-in to sharing for training) or should it be hardcoded?
   - Recommendation: Hardcode `mip_opt_out=true` in the Deepgram SDK client initialization. This is a product-level commitment to the user (DEC-02), not a setting. The user cannot accidentally opt in by changing a setting.

4. **Electron 41 vs 42 at build time**
   - What we know: CLAUDE.md recommends Electron 41.x LTS. The RSCH-04 spike ran on Electron 42.5.0 successfully.
   - What's unclear: At build time, which version should be pinned? 41 is LTS; 42 is latest stable and was validated in the spike.
   - Recommendation: PRD-03 BUILD-ORDER.md should state "re-verify Electron version at build milestone start — either 41 LTS or 42 stable; both have been validated (spike ran on 42). Pin to the current LTS at build time." This is explicitly deferred to the build milestone per SETUP-03 posture.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `audiotee` npm package v0.0.7 is the correct npm package name for Core Audio Taps (spike used this exact name) | Standard Stack | If the package name changes or is superceded, the architecture spec references the wrong package — re-verify at build time |
| A2 | `tiktoken` npm package is the correct package name for OpenAI's open-source tokenizer | Standard Stack | If slopsquatted, different package; always verify via official OpenAI GitHub before install |
| A3 | `zod-to-json-schema` npm package correctly converts Zod schemas for both OpenAI strict mode and Gemini `responseJsonSchema` | Code Examples | If provider format updates break compatibility, the provider-agnostic schema delivery pattern requires a workaround |
| A4 | Gemini 2.5 Flash pricing at time of build milestone is approximately $0.30/$2.50 per M input/output tokens | Open Questions | Pricing changes frequently; PRD should cite "at time of research 2026-06-25" and recommend re-verifying at build time |
| A5 | The 5-table schema from RSCH-05 plus 2 AI-SPEC additions covers all v1 persistence needs | Architecture | If a new table is needed (e.g., for settings persistence beyond electron-store), the schema must be updated |

---

## Sources

### Primary (HIGH confidence — direct reads of committed planning artifacts)

- `/Users/ubair/Gits/MeetingAssist/.planning/phases/04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md` — Full AI grounding and context spec; ArtifactPipeline; ContextEngine; eval harness
- `/Users/ubair/Gits/MeetingAssist/.planning/phases/03-deep-research/03-RSCH-04-SPIKE-REPORT.md` — Empirical capture spike results; AudioTee.js preferred; macOS floor findings
- `/Users/ubair/Gits/MeetingAssist/.planning/phases/03-deep-research/03-RSCH-05-DATA-MODEL.md` — DB schema DDL; sqlite-vec; KNN query pattern
- `/Users/ubair/Gits/MeetingAssist/.planning/phases/03-deep-research/03-RSCH-01-REPORT.md` — Persona, positioning, monetization; competitive landscape; differentiator pillars
- `/Users/ubair/Gits/MeetingAssist/.planning/phases/02-foundational-decisions-adrs/02-DEC-01-consent-recording-posture.md` — Consent gate design; all-party-consent; per-meeting confirmation
- `/Users/ubair/Gits/MeetingAssist/.planning/phases/02-foundational-decisions-adrs/02-DEC-02-data-handling-privacy.md` — Local-first storage; SQLCipher; safeStorage; raw audio retention; RSCH-03 confirmation
- `/Users/ubair/Gits/MeetingAssist/.planning/phases/03-deep-research/03-RSCH-03-VENDOR-TERMS.md` — Vendor DPA confirmation; Deepgram mip_opt_out=true; Gemini paid quota critical warning
- `/Users/ubair/Gits/MeetingAssist/.planning/phases/01-dna-deep-dive-project-setup/01-DNA-CATALOGUE.md` — 5 techniques with borrow/leave-behind verdicts; IPC allowlist pattern; overlay setup
- `/Users/ubair/Gits/MeetingAssist/.planning/phases/05-prd-finalization/05-CONTEXT.md` — Locked decisions D-01 through D-20; Claude's Discretion areas; deferred items
- `/Users/ubair/Gits/MeetingAssist/.claude/CLAUDE.md` — Full technology stack; recommended libraries; alternatives considered

### Secondary (MEDIUM confidence — cited in prior phase research)

- RSCH-02 findings (Deepgram Nova-3 capabilities): deepgram.com/learn/nextgen-speaker-diarization-and-language-detection-models
- RSCH-01 market data: useluminix.com/reports (AI meeting assistant market $3.67B, 34.7% CAGR)
- RSCH-06 competitive analysis: get-alfred.ai/blog/best-ai-meeting-notetakers

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages and versions come directly from spike results, CLAUDE.md, and committed planning documents
- Architecture: HIGH — structure derived directly from 04-AI-SPEC.md, RSCH-05, DNA-CATALOGUE, and CLAUDE.md with no external sources needed
- Prior phase synthesis: HIGH — all source documents are committed to this repo and read directly
- Build order: HIGH — dependency chain derives from locked decisions and AI-SPEC architecture; no assumptions about implementation complexity required
- Open questions: MEDIUM — the 4 open questions are genuine gaps not fully resolved by any prior artifact

**Research date:** 2026-06-26
**Valid until:** Start of build milestone (re-verify Electron version, package versions, and Gemini pricing at that time)
