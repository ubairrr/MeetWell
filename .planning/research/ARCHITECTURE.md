# Architecture Research

**Domain:** AI meeting-assistant desktop overlay (Electron, macOS-first), real-time STT + LLM artifact pipeline
**Researched:** 2026-06-25
**Confidence:** HIGH (DNA architecture read directly from source; external patterns cross-checked against AssemblyAI, NVIDIA, AWS, arXiv)

> This document maps the **proven Interview Helper DNA** (read directly from `DNA/src/main.js`, `preload.js`, `audio.js`, `renderer/App.jsx`) onto a clean, modular, production-grade architecture for MeetingAssist, and flags everything that must be **added or restructured** for the new product. The DNA is a single-file main process today; the recommendation generalizes it into a service-layered main process without throwing away any of the hard-won engineering.

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        RENDERER (Chromium, React 19)                       │
│  Zero Node surface — only the contextBridge allowlist is reachable         │
│  ┌────────────┐  ┌──────────────┐  ┌───────────────┐  ┌─────────────────┐ │
│  │ Overlay    │  │ Live Transcript│ │ Live-Assistant│  │ Artifacts /     │ │
│  │ Shell (HUD)│  │ View          │  │ Chat Panel    │  │ Review Panel    │ │
│  └─────┬──────┘  └──────┬───────┘  └──────┬────────┘  └────────┬────────┘ │
│        │                │                 │                    │          │
│  ┌─────┴────────────────┴─────────────────┴────────────────────┴───────┐ │
│  │  Web Audio capture (getUserMedia mic + desktopCapturer system loop)  │ │
│  │  AudioWorklet → Float32→Int16 PCM frames → IPC to main               │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────┬─────────────────────────────────────────────┘
                               │  contextBridge / IPC (typed, allowlisted)
┌──────────────────────────────┴─────────────────────────────────────────────┐
│                          PRELOAD (context-isolated bridge)                  │
│  Exposes window.api: { audio, session, assistant, artifacts,                │
│                        settings, integrations, on(channel), invoke() }      │
└──────────────────────────────┬─────────────────────────────────────────────┘
                               │
┌──────────────────────────────┴─────────────────────────────────────────────┐
│                       MAIN PROCESS (Node.js) — Service Layer                │
│                                                                             │
│  ┌──────────────────┐   ┌────────────────────┐   ┌──────────────────────┐  │
│  │ SessionManager   │◄─►│ TranscriptStore    │◄─►│ ContextEngine        │  │
│  │ (lifecycle FSM)  │   │ (segments, append) │   │ (rolling + RAG)      │  │
│  └───────┬──────────┘   └─────────┬──────────┘   └──────────┬───────────┘  │
│          │                        │                         │              │
│  ┌───────┴──────────┐   ┌─────────┴──────────┐   ┌──────────┴───────────┐  │
│  │ STTService       │   │ DiarizationService │   │ AssistantService     │  │
│  │ (provider adapter│   │ (speaker labeling) │   │ (chat over context)  │  │
│  │  port: Deepgram) │   └────────────────────┘   └──────────┬───────────┘  │
│  └───────┬──────────┘                                       │              │
│          │             ┌────────────────────┐    ┌──────────┴───────────┐  │
│          │             │ ArtifactPipeline   │◄──►│ LLMService           │  │
│          │             │ (MOM/summary/      │    │ (provider adapter    │  │
│          │             │  actions/dates)    │    │  port: OpenAI-compat)│  │
│          │             └─────────┬──────────┘    └──────────────────────┘  │
│  ┌───────┴──────────┐  ┌─────────┴──────────┐    ┌──────────────────────┐  │
│  │ HotkeyRegistry   │  │ IntegrationsSvc    │    │ VisionService        │  │
│  │ (global shortcuts│  │ (calendar/export)  │    │ (screenshot→sharp→VLM│  │
│  └──────────────────┘  └────────────────────┘    └──────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ Persistence: meeting DB (SQLite) + electron-store (settings/secrets)   │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
        │ STT WS        │ LLM HTTPS        │ calendar/OAuth      │ vector index
        ▼               ▼                  ▼                     ▼
   Deepgram        OpenAI-compat       Google/Outlook/ICS    local embeddings
```

### Component Responsibilities

| Component | Responsibility (what it owns) | Maps to DNA / New |
|-----------|-------------------------------|-------------------|
| **Overlay Shell** | Frameless transparent HUD window; stealth/normal toggle; click-through; always-on-top; resize-to-content | DNA `createWindow` + mode toggles — reuse near-verbatim |
| **Audio Capture (renderer)** | `getUserMedia` mic + `desktopCapturer` system loopback; AudioWorklet PCM framing; emit `mic-audio-chunk` / `system-audio-chunk` | DNA `audio.js` + `audio-processor.js` — reuse, move SDK out of renderer (see anti-patterns) |
| **STTService** | Owns provider connections; per-channel WS lifecycle, keep-alive, reconnect; emits raw transcript events with `is_final`/`speech_final` | DNA `createDeepgramConnection` + `setupDeepgramIPC` — generalize behind a `SttProvider` port |
| **TranscriptStore** | Single source of truth for the meeting transcript: ordered, speaker-tagged segments; append-only log; the speech-fragment accumulation state machine | DNA's `currentQuestion` accumulator — **promote** from a hidden variable into a first-class, persisted store |
| **DiarizationService** | Assigns speaker identity/labels to segments (channel-based now; speaker-clustering later) | NEW (DNA cheats: mic="You", system="Interviewer"). Multi-party meetings need real diarization |
| **SessionManager** | Meeting lifecycle finite-state machine: `idle → live → break → live → ending → post-processing → archived`; coordinates start/stop of all services | NEW — DNA has only ad-hoc start/stop-deepgram |
| **ContextEngine** | Maintains the live-assistant's working context: rolling window + RAG retrieval over the transcript; serves both live chat and break-assist | NEW — the heart of the "context-preserving assistant" |
| **AssistantService** | Live-assistant chat: takes a user prompt (hotkey/keyword), pulls context from ContextEngine, calls LLMService, streams the answer | Generalizes DNA `triggerLLM` (which was auto-fired, not chat) |
| **ArtifactPipeline** | End-of-meeting (and incremental) generation: MOM, summary, key points, action items, dates/deadlines — via map-reduce over the transcript | NEW — the core value of MeetingAssist |
| **LLMService** | Provider-agnostic chat/completion + vision; streaming; retries; token budgeting | DNA `getLLMClient` (OpenAI `baseURL` adapter) — generalize behind an `LlmProvider` port |
| **VisionService** | Screenshot → `sharp`/`nativeImage` downscale → multimodal round-trip | DNA hotkey-`M` handler — extract into a service |
| **IntegrationsService** | Calendar push (Google/Outlook/ICS), file export (MD/PDF/JSON) | NEW |
| **HotkeyRegistry** | Global shortcut registration → IPC events; trigger live assistant, break assist, capture, toggles | DNA `globalShortcut` block (8 shortcuts) — extract into a registry module |
| **Persistence** | Meeting DB (transcripts, artifacts, embeddings) in SQLite; settings/secrets in electron-store | electron-store exists in DNA; **add SQLite** for meeting data |

---

## Recommended Project Structure

```
src/
├── main/                       # Main process (Node.js) — the service layer
│   ├── index.ts                # App bootstrap: window, lifecycle, wire services
│   ├── window/
│   │   ├── overlayWindow.ts     # createWindow, stealth/normal modes (from DNA)
│   │   └── hotkeys.ts           # HotkeyRegistry (from DNA globalShortcut block)
│   ├── session/
│   │   └── sessionManager.ts    # Lifecycle FSM, service orchestration
│   ├── audio/
│   │   └── sttService.ts        # STT orchestration + accumulation state machine
│   ├── transcript/
│   │   ├── transcriptStore.ts   # Append-only segment store (source of truth)
│   │   └── diarization.ts       # Speaker attribution
│   ├── context/
│   │   ├── contextEngine.ts     # Rolling window + RAG retrieval
│   │   └── embeddings.ts        # Local embedding + vector index
│   ├── assistant/
│   │   └── assistantService.ts  # Live chat + break assist
│   ├── artifacts/
│   │   ├── artifactPipeline.ts  # Orchestrates map-reduce generation
│   │   ├── mom.ts / summary.ts / actionItems.ts / dates.ts  # Extractors
│   ├── llm/
│   │   ├── llmService.ts         # Facade used by callers
│   │   └── providers/            # openaiCompat.ts, (future) anthropic.ts ...
│   ├── stt/
│   │   └── providers/            # deepgram.ts, (future) assemblyai.ts, whisper.ts
│   ├── vision/
│   │   └── visionService.ts      # screenshot → sharp → VLM
│   ├── integrations/
│   │   ├── calendar/             # google.ts, outlook.ts, ics.ts
│   │   └── export/               # markdown.ts, pdf.ts, json.ts
│   ├── persistence/
│   │   ├── db.ts                 # SQLite (meetings, segments, artifacts)
│   │   └── settings.ts           # electron-store wrapper (secrets/config)
│   └── ipc/
│       └── handlers.ts           # Registers ipcMain handlers → delegate to services
├── preload/
│   └── index.ts                  # contextBridge allowlist → window.api (typed)
├── renderer/                     # React 19 + Vite (Chromium)
│   ├── App.tsx
│   ├── audio/
│   │   ├── captureController.ts  # getUserMedia + desktopCapturer + worklet
│   │   └── audio-processor.js    # AudioWorklet (PCM framing) — from DNA
│   ├── features/
│   │   ├── transcript/           # Live transcript view
│   │   ├── assistant/            # Live-assistant chat panel
│   │   ├── artifacts/            # MOM/summary/actions review
│   │   └── overlay/              # HUD shell, drag header, settings
│   └── lib/api.ts                # Thin typed wrapper over window.api
└── shared/
    ├── types.ts                  # Segment, Session, Artifact, ChatMessage, etc.
    ├── ipc-contract.ts           # Channel names + payload types (single source)
    └── ports.ts                  # SttProvider / LlmProvider interfaces
```

### Structure Rationale

- **`main/<domain>/` over `main/<layer>/`:** Group by capability (session, transcript, context, artifacts), not by technical layer. Each folder is a removable/swappable module with one public service object — this is what "modular" means in practice and is how a new contributor finds the code.
- **`stt/providers/` and `llm/providers/`:** The single most valuable DNA pattern is the OpenAI-`baseURL` adapter. Generalize it: a **port** (`SttProvider`, `LlmProvider` interface in `shared/ports.ts`) plus interchangeable adapter implementations. STT and LLM both become swappable with zero call-site changes.
- **`shared/ipc-contract.ts`:** The DNA hard-codes channel-name strings in three places (`main.js`, `preload.js`, `App.jsx`) and drift is the #1 IPC bug source. One typed contract imported by all three processes eliminates it.
- **`ipc/handlers.ts` is thin:** Handlers only translate IPC ↔ service calls. No business logic in IPC handlers — this is what makes services unit-testable without Electron running.
- **Renderer is a pure view + capture layer:** It must never import `@deepgram/sdk`, `openai`, or `electron` Node APIs. All provider SDKs live in main.

---

## Architectural Patterns

### Pattern 1: Port/Adapter for swappable providers (generalize the DNA)

**What:** Define a narrow interface (port) for each external capability; implement one adapter per vendor. Callers depend only on the port.
**When to use:** Any external service you might swap or A/B test — STT (Deepgram → AssemblyAI/Whisper) and LLM (any OpenAI-compatible) here.
**Trade-offs:** Small upfront indirection cost; huge payoff in testability (inject a fake), provider migration, and BYOK/local-model support. The DNA already proves the LLM half works.

**Example:**
```typescript
// shared/ports.ts
export interface SttProvider {
  open(channel: 'mic' | 'system', onResult: (r: SttResult) => void): SttSession;
}
export interface SttSession {
  send(pcm16: ArrayBuffer): void;
  keepAlive(): void;
  close(): void;
}
// main/stt/providers/deepgram.ts implements SttProvider — wraps DNA's createDeepgramConnection
// llmService stays identical to DNA: new OpenAI({ apiKey, baseURL }) behind LlmProvider
```

### Pattern 2: Session lifecycle as an explicit finite-state machine

**What:** A `SessionManager` owns the canonical meeting state and is the only thing allowed to start/stop services. Every other component reacts to session events.
**When to use:** When multiple async subsystems (audio, transcript, context, artifacts) must start/stop coherently — exactly MeetingAssist.
**Trade-offs:** More structure than the DNA's loose `start-deepgram`/`stop-deepgram`, but it is what makes "break → resume" and "end → post-process" reliable instead of racy.

**Example:**
```typescript
type SessionState = 'idle' | 'live' | 'break' | 'ending' | 'postprocessing' | 'archived';
// 'break' pauses artifact triggers but KEEPS transcript+context running so break-assist works.
// 'ending' → flush STT, run ArtifactPipeline (batch), persist, then 'archived'.
sessionManager.on('break', () => assistant.markBreakStart());
sessionManager.on('resume', () => assistant.summarizeBreakGap()); // <-- break assist
```

### Pattern 3: Hybrid context for the live assistant (rolling window + RAG)

**What:** Keep a **rolling verbatim window** of the last N minutes/turns (always in the prompt) AND a **RAG index** over the entire transcript (retrieved on demand for older context). Plus periodic **epoch summaries** so early-meeting facts survive without re-embedding everything.
**When to use:** The whole-meeting context-preserving chat. A pure rolling window forgets the meeting's opening; pure RAG loses recency/flow. Hybrid is the validated production answer.
**Trade-offs:** Two retrieval paths to maintain and a local embedding model to ship; but it is the difference between an assistant that "was in the meeting" and one that only sees the last 2 minutes.

**Example:**
```typescript
// context assembled per assistant turn:
const ctx = [
  ...contextEngine.epochSummaries(),         // compressed older meeting
  ...contextEngine.ragRetrieve(userQuery, k),// semantically relevant past segments
  ...contextEngine.rollingWindow(minutes=8), // verbatim recent turns (recency/flow)
];
// Break assist is the SAME engine with a fixed query: summarize segments since break start.
const breakSummary = assistant.answer({ query: 'Summarize what I missed.',
  window: transcriptStore.since(session.breakStartedAt) });
```

### Pattern 4: Two-speed processing — real-time stream + end-of-meeting batch

**What:** Split work by latency budget. **Real-time path:** audio → STT → transcript append → live UI + context update (sub-second). **Batch path:** at meeting end, map-reduce the full transcript into artifacts (seconds-to-minutes, accuracy-optimized).
**When to use:** Always, for this domain. Trying to make MOM/summary fully real-time burns tokens and produces worse results; trying to make the live transcript batch defeats the overlay.
**Trade-offs:** Two pipelines to build, but they share the TranscriptStore. Optional middle speed: incremental epoch summaries every ~10 min to make end-of-meeting cheaper and to power break-assist instantly.

**Example:**
```typescript
// Real-time (hot path): never blocks on the LLM
sttService.onSegment(seg => { transcriptStore.append(seg); contextEngine.ingest(seg); });
// Batch (cold path): map-reduce, validated to match full-context at lower cost
async function generateArtifacts(session) {
  const chunks = chunkByTopicOrTime(transcriptStore.all(), '~15min');
  const partial = await Promise.all(chunks.map(c => llm.summarizeChunk(c)));  // map
  return { mom: await llm.reduceMOM(partial), actions: await llm.reduceActions(partial), ... }; // reduce
}
```

---

## Data Flow

### Real-time path (hot — sub-second, never blocks on LLM)

```
Mic + System audio (renderer)
   ↓ AudioWorklet: Float32 → Int16 PCM frames
   ↓ IPC: mic-audio-chunk / system-audio-chunk
STTService (main) → provider WS (Deepgram)
   ↓ transcript + is_final/speech_final
TranscriptStore.append(segment)  ──┬──→ Renderer live transcript view (IPC push)
   ↓ DiarizationService tags speaker│
ContextEngine.ingest(segment) ──────┘ (updates rolling window + vector index)
```

### Live-assistant path (warm — interactive, streaming)

```
Hotkey / trigger keyword
   ↓ AssistantService.ask(userPrompt)
ContextEngine.assemble(query)  →  [epoch summaries + RAG hits + rolling window]
   ↓ LLMService.streamChat(messages)
Renderer chat panel (token stream via IPC)   ← persisted to meeting DB
```

### Break-assist path (warm — same engine, fixed query)

```
SessionManager: live → break   (records breakStartedAt; pauses artifact triggers,
                                 KEEPS STT + ContextEngine running)
... user away; transcript keeps appending ...
SessionManager: break → resume (or break-assist hotkey)
   ↓ AssistantService.answer(query='what did I miss',
                             scope=transcriptStore.since(breakStartedAt))
Renderer: "While you were away…" summary card
```

### Batch path (cold — end-of-meeting, accuracy-optimized)

```
SessionManager: live → ending
   ↓ flush STT, finalize TranscriptStore
ArtifactPipeline.run(transcript):
   chunk → map (per-chunk summaries) → reduce (MOM, summary, key points,
                                               action items, dates/deadlines)
   ↓ Persistence: write artifacts to SQLite
   ↓ IntegrationsService: optional calendar push / export
Renderer: Artifacts/Review panel  →  SessionManager: → archived
```

### State management (renderer)

```
window.api (preload allowlist)
   ↓ subscribe (on 'transcript', 'assistant-token', 'session-state', 'artifacts-ready')
React feature stores (per panel)  ←→  user actions → window.api.invoke(...) → main services
```

---

## Scaling Considerations

This is a **client-side desktop app**, so "scale" is per-meeting load and long-term local data growth, not concurrent users.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Short meetings (<30 min) | Rolling window alone may suffice; SQLite + in-memory transcript fine; map-reduce optional (single LLM pass works) |
| Long meetings (1–3 hr) | RAG + epoch summaries become mandatory (transcript exceeds context window); map-reduce required for artifacts; stream STT results to avoid memory bloat |
| Long-term local history (100s of meetings) | SQLite with indexes; vector index per meeting (not global) to keep retrieval fast; archive/compact old transcripts; lazy-load in UI |
| Multi-party meetings (5+ speakers) | Channel-based labeling (DNA's mic/system) breaks down → real DiarizationService needed; consider provider-side diarization vs. local clustering |

### Scaling Priorities

1. **First bottleneck — LLM context window on long meetings.** A 2-hour meeting transcript will not fit one prompt. Fix: ship the ContextEngine (hybrid window+RAG) and the map-reduce ArtifactPipeline before chasing other features. This is the load-bearing design decision.
2. **Second bottleneck — renderer memory / UI jank from unbounded transcript.** Fix: keep the authoritative transcript in main (TranscriptStore + SQLite), virtualize the renderer list, and stream only deltas over IPC.
3. **Third — STT cost/latency and reconnect storms.** Fix: keep-alive timers (DNA already does this), exponential-backoff reconnect in STTService, and a provider port so a cheaper/local STT can be swapped in.

---

## Anti-Patterns

### Anti-Pattern 1: Vendor SDKs running in the renderer

**What people do:** The DNA's `src/renderer/audio.js` imports `@deepgram/sdk` and reads `process.env.DEEPGRAM_API_KEY` directly in the renderer (a legacy `nodeIntegration` path).
**Why it's wrong:** Leaks API keys into the Chromium context, breaks the hardened contextBridge model, and couples the UI to a specific provider.
**Do this instead:** Renderer only captures audio and ships PCM frames over IPC; **all** SDK and secret access lives in main (the DNA's `src/main.js` path already does this correctly — standardize on it and delete the renderer SDK path).

### Anti-Pattern 2: Hiding the transcript in a mutable accumulator variable

**What people do:** The DNA holds in-flight transcript in a module-global `currentQuestion` string, fires the LLM, and discards it.
**Why it's wrong:** No persistence, no replay, no diarization, no RAG source, no artifact regeneration. For a product whose *core value is a trustworthy record*, the transcript must be the durable source of truth.
**Do this instead:** Promote it to a first-class **TranscriptStore** (append-only, persisted to SQLite, speaker-tagged). Everything else (context, artifacts, break-assist) reads from it.

### Anti-Pattern 3: Auto-firing the LLM on every `speech_final`

**What people do:** The DNA calls `triggerLLM` automatically whenever system audio reaches `speech_final` (correct for an interview Q&A bot).
**Why it's wrong:** For a meeting, that means constant unsolicited LLM calls — noise, cost, and privacy concerns. The assistant should be **user-invoked** (hotkey/keyword), not reflexive.
**Do this instead:** Decouple ingestion (always on, cheap) from invocation (explicit). Keep `speech_final` only as a segment-boundary signal for the TranscriptStore, not as an LLM trigger.

### Anti-Pattern 4: Doing everything in one `main.js`

**What people do:** The DNA puts window, hotkeys, audio, LLM, vision, and IPC in a single 400-line `main.js`.
**Why it's wrong:** Fine for a focused tool, but the user explicitly requires a production-grade modular architecture, and MeetingAssist has 2–3× the components.
**Do this instead:** The `main/<domain>/` service layer above. Each service is independently testable; `ipc/handlers.ts` is the only glue.

### Anti-Pattern 5: Stringly-typed IPC channels duplicated across processes

**What people do:** Channel names like `'system-transcript'` copy-pasted in main, preload, and renderer (the DNA does this).
**Why it's wrong:** Silent breakage when one side renames; no payload type safety.
**Do this instead:** A single `shared/ipc-contract.ts` exporting channel names + payload types, imported by all three processes.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Deepgram (STT) | Per-channel live WebSocket from main; keep-alive ping every 10s; PCM16 linear16 @ 16kHz | DNA-proven. Wrap in `SttProvider` port so AssemblyAI/Whisper can swap in. Reconnect with backoff is the main gap to add |
| OpenAI-compatible LLM | HTTPS via `openai` SDK with custom `baseURL`; streaming for chat; `image_url` for vision | DNA-proven across 7+ providers. Add streaming + retry/timeout + token budgeting in `LlmService` |
| Local embedding model | In-process embedding for RAG index over transcript | NEW. Prefer local (privacy) — SQLite vector extension or a small embedded index per meeting |
| Google / Outlook calendar | OAuth2 from main; push extracted dates/action items as events | NEW. Keep behind IntegrationsService port; ICS export as the zero-auth fallback |
| macOS screen/audio permissions | `desktopCapturer` + system-preferences deep links | DNA-proven (`get-desktop-source-id`, `request-screen-permission`) |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| renderer ↔ preload | contextBridge allowlist only | Zero Node surface; typed `window.api` |
| preload ↔ main | IPC (`invoke` for request/response, `send`/event for streams) | Use `invoke` for settings/artifacts; event push for transcript + assistant tokens |
| ipc/handlers ↔ services | direct function calls | Handlers are thin; no business logic |
| SessionManager ↔ all services | events + explicit start/stop | SessionManager is the only orchestrator; services don't start each other |
| services ↔ providers | port interfaces | STT/LLM swappable without touching callers |
| services ↔ Persistence | repository functions | TranscriptStore/ArtifactPipeline write through `persistence/db.ts` |

---

## Suggested Build Order (dependency-driven)

Each step depends on the ones above it. This is the recommended phase ordering for the build milestone.

1. **Foundation & modular skeleton** — Migrate the DNA into the `main/<domain>/` layout: overlay window + stealth modes, HotkeyRegistry, hardened preload with `shared/ipc-contract.ts`. *(Pure refactor of proven code; unblocks everything.)*
2. **Audio + STTService (provider port)** — Renderer capture (mic + system loopback, AudioWorklet) → `SttProvider`/Deepgram adapter in main. Add reconnect/backoff. *(Depends on 1. Reuses DNA `audio.js`/`createDeepgramConnection`.)*
3. **TranscriptStore + SessionManager + Persistence** — Append-only speaker-tagged store, SQLite, and the lifecycle FSM (idle→live→break→ending→archived). *(Depends on 2 for segment input. This is the core-value backbone — must exist before artifacts or assistant.)*
4. **LLMService (provider port) + Live transcript UI** — Generalize DNA's `getLLMClient`; render the live transcript from TranscriptStore deltas. *(Depends on 3. Delivers the visible MVP: live captured transcript.)*
5. **ArtifactPipeline (batch)** — Map-reduce MOM / summary / key points / action items / dates at meeting end. *(Depends on 3+4. This is the headline core value — a trustworthy record + artifacts.)*
6. **ContextEngine + AssistantService** — Hybrid rolling-window + RAG + epoch summaries; user-invoked live chat. *(Depends on 3 for transcript, 4 for LLM. Differentiator #1.)*
7. **Break assist** — SessionManager break/resume hooks + AssistantService fixed-query summary of the gap. *(Depends on 6 — same ContextEngine; cheap once 6 exists.)*
8. **DiarizationService (multi-party)** — Replace channel-based labeling with real speaker attribution. *(Depends on 2/3; can be deferred until multi-party meetings are in scope.)*
9. **IntegrationsService** — Calendar push + export (ICS first, then OAuth providers). *(Depends on 5 for artifacts to export.)*
10. **VisionService** — Extract DNA's screenshot→sharp→VLM into a service. *(Independent; can land anytime after 4; lowest priority for meeting core value.)*

**Build-order implication for the roadmap:** steps 1→5 deliver the non-negotiable core value (overlay + transcript + artifacts) and should form the first phases; steps 6→7 deliver the context-preserving live assistant and break assist; 8→10 are deferrable differentiators.

---

## Sources

- DNA source (read directly, HIGH confidence): `DNA/src/main.js`, `DNA/src/preload.js`, `DNA/src/audio.js`, `DNA/src/renderer/App.jsx`, `DNA/package.json`
- [Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model) and [Preload Scripts](https://www.electronjs.org/docs/latest/tutorial/tutorial-preload) — main/renderer/preload boundaries (HIGH)
- [Electron app architecture best practices — Oflight](https://www.oflight.co.jp/en/columns/electron-app-architecture-best-practices) — service layer, single-responsibility modules, DI (MEDIUM)
- [AssemblyAI — Streaming Speaker Diarization](https://www.assemblyai.com/blog/streaming-speaker-diarization) and [NVIDIA Streaming Sortformer](https://developer.nvidia.com/blog/identify-speakers-in-meetings-calls-and-voice-apps-in-real-time-with-nvidia-streaming-sortformer/) — real-time vs batch diarization trade-offs (HIGH)
- [Action-Item-Driven Summarization of Long Meeting Transcripts (arXiv 2312.17581)](https://arxiv.org/abs/2312.17581) and [Galileo — LLM Summarization Strategies](https://galileo.ai/blog/llm-summarization-strategies) — map-reduce/chunking, action-item extraction (HIGH)
- [AWS Live Meeting Assistant sample](https://github.com/aws-samples/amazon-transcribe-live-meeting-assistant) and [Meetily](https://github.com/Zackriya-Solutions/meetily) — reference architectures for live transcription + assistant + local RAG (MEDIUM)

---
*Architecture research for: AI meeting-assistant desktop overlay (Electron, macOS-first)*
*Researched: 2026-06-25*
