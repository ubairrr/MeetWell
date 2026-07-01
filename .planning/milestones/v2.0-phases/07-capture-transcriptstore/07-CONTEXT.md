# Phase 7: Capture + TranscriptStore - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Dual-channel audio capture pipeline: mic AudioWorklet → PCM → IPC → main process, plus `audiotee` system audio → main process. Both channels stream independently to separate Deepgram Nova-3 WebSocket connections. `speech_final` events produce `TranscriptSegment` records that are immediately persisted to the encrypted `transcript_segments` table. Phase ends when a real meeting can be started after consent and both channels produce a filled `transcript_segments` table. Full overlay UI is Phase 9 — this phase adds only the minimal status bar needed to verify the capture pipeline (CAPT-08).

Requirements: CAPT-01 through CAPT-09 (9 requirements).

</domain>

<decisions>
## Implementation Decisions

### Mic PCM Format & Chunk Size

- **D-01:** AudioWorklet converts Float32 → Int16 PCM in the renderer (in the worklet processor itself) before posting to the main thread. Main process receives ready-to-stream Int16 bytes and forwards them directly to Deepgram's WebSocket. No conversion in main process.
- **D-02:** AudioWorklet flushes one chunk to the main process every ~250ms (≈11,025 samples at 44.1kHz, ≈35 quanta batched per flush). Payload on the `mic-audio-chunk` IPC channel is an `ArrayBuffer` of Int16 PCM bytes at 44.1kHz mono.

### Deepgram Disconnect Recovery

- **D-03:** If a Deepgram WebSocket connection drops mid-meeting, attempt auto-reconnect silently up to 3 times with a fixed 2-second delay between attempts. No user interruption during retry window.
- **D-04:** After 3 failed attempts, push a `capture-health-update` event with `status: 'error'` for the affected channel. The channel's dot in the overlay status bar turns red.
- **D-05:** Transcript segments arriving during the reconnection gap are lost — no PCM buffering during reconnect. Buffering audio during multi-second drops risks memory pressure and is deferred to v2. The gap is a known limitation, noted in Phase 7 docs.
- **D-06:** Each channel (mic and system) has independent reconnect tracking — one channel failing does not affect the other.

### Capturing State UI Scope (Phase 7 minimal)

- **D-07:** Phase 7 adds a minimal two-dot status bar to the overlay. Each dot represents one channel (mic / system audio). Colors: gray = idle, green = healthy, yellow = silent (no audio detected), red = error. This is the only capture health UI added in Phase 7; Phase 9 replaces it with the full design.
- **D-08:** When `SessionManager` transitions from `PreCapture → Capturing` (after consent), the overlay replaces the `ConsentGateScreen` with a minimal `CapturingScreen`: the two-dot health bar plus a plain "Stop Meeting" button that fires `end-meeting` via IPC. No other UI elements in Phase 7.

### Speaker Label Normalization

- **D-09:** Per-channel independent normalization. Mic channel: Deepgram speaker 0 always → `'You'` (mic is single-user). System audio channel: Deepgram speaker 0 → `'Speaker 1'`, speaker 1 → `'Speaker 2'`, etc. No cross-channel speaker correlation in v1.
- **D-10:** Speaker ID mapping is maintained per-connection in a small in-process `Map<number, string>` within `CaptureService` (or a dedicated `SpeakerNormalizer` utility). The map is reset when the WebSocket connection is re-established (reconnect or meeting restart). Speaker ID stability within a single WebSocket session is trusted as-is from Deepgram.

### Claude's Discretion

- **Speaker ID reset on reconnect:** If Deepgram resets speaker numbering mid-connection (speaker 0 reappears as a different person), trust Deepgram's IDs within the session — label continuity may shift but no detection or compensation logic is added. Left to researcher/planner to verify if Deepgram guarantees stable IDs within a connection.
- **audiotee spawn pattern:** How `audiotee` is launched (child_process.spawn vs shell), its stdout/stderr piping to Deepgram WebSocket, and crash-restart policy are left to the researcher to determine from audiotee 0.0.7 API/docs. The binary must be in `asarUnpack` (already configured in Phase 6 electron-builder config).
- **Sample rate resampling:** If Deepgram requires 16kHz input (not 44.1kHz), the researcher/planner should specify whether downsampling happens in the AudioWorklet, in the main process, or if we configure Deepgram to accept 44.1kHz.
- **Confidence score field:** The `transcript_segments` schema has a confidence column not in the current DDL — researcher/planner should confirm whether to add it or omit for v1.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 7: Capture + TranscriptStore" — goal, success criteria (5 items), CAPT-01–CAPT-09
- `.planning/REQUIREMENTS.md` §"Capture + Transcript" — CAPT-01 through CAPT-09 with full acceptance criteria text

### Architecture & IPC contracts
- `.planning/phases/05-prd-finalization/05-ARCHITECTURE.md` — full module map, TypeScript interfaces, IPC channel surface (18 channels with payload types — §7), `TranscriptSegment` interface, `CaptureService` and `TranscriptStore` module specs
- `src/preload/index.ts` — live contextBridge allowlist; `mic-audio-chunk` (invoke), `capture-health-update` (listen), `transcript-segment` (listen) channels are pre-wired
- `src/main/session/SessionManager.ts` — FSM states and transitions; Phase 7 hooks into `Capturing` state entry to start capture, `Processing` state entry (after end-meeting) to stop it
- `src/main/store/db.ts` — `transcript_segments` DDL (schema is locked; Phase 7 writes to this table)

### Audio capture specs
- `.planning/phases/05-prd-finalization/05-FEATURE-SPEC.md` — D-10 (dual-channel audio: audiotee primary / Chromium loopback fallback) and CAPT-02/CAPT-03 behavioral spec
- `RSCH-04` decision (in `.planning/phases/05-prd-finalization/05-PRD.md`) — audiotee validated over electron-audio-loopback; Core Audio Taps path; binary in asarUnpack

### Privacy contract
- `.planning/phases/04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md` §1 — `mip_opt_out: true` hardcoded contract; raw audio discard policy (CAPT-09)
- `.planning/phases/05-prd-finalization/05-PRD.md` §DEC-02 — local-first, AES-256; Deepgram paid plan only; no cloud audio upload

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/main/session/SessionManager.ts` — FSM already built with `Capturing` and `OnBreak` states. Phase 7 wires `CaptureService.start()` to the `Capturing` state entry event and `CaptureService.stop()` to the `Processing` entry event via `onStateChange`.
- `src/main/store/db.ts` — `openDatabase()` already handles the 4-step init sequence; `transcript_segments` table DDL is in place. Phase 7 imports `openDatabase()` result and writes to it.
- `src/preload/index.ts` — `mic-audio-chunk` (invoke), `capture-health-update` (listen), `transcript-segment` (listen), `session-state-changed` (listen) are all pre-wired in the allowlist.
- `src/renderer/src/App.tsx` — current root component; Phase 7 adds a `CapturingScreen` branch for `SessionState === 'Capturing'`.
- `src/shared/schemas/index.ts` — stub for Phase 6; Phase 7 can add a `TranscriptSegmentSchema` zod schema if needed for IPC validation (full Zod rollout is Phase 8, but a lightweight schema for `transcript-segment` push events is acceptable here).

### Established Patterns
- **Renderer is display-only:** All capture logic (AudioWorklet management, audiotee spawn, Deepgram WebSocket, DB writes) goes in `src/main/capture/` or `src/main/transcript/`. Renderer sends PCM chunks via `mic-audio-chunk` invoke and receives push events via `transcript-segment` and `capture-health-update` listen channels.
- **Module boundaries:** New services for Phase 7 should follow `src/main/<domain>/` pattern. Likely: `src/main/capture/CaptureService.ts`, `src/main/capture/DeepgramClient.ts`, `src/main/transcript/TranscriptStore.ts`.
- **FSM-gated side effects:** All capture start/stop is triggered by `SessionManager` state transitions, never called directly from IPC handlers. The `consent-confirmed` IPC handler already fires `sessionManager.transition('consent-confirmed')` — the `Capturing` entry hook is where `CaptureService.start()` attaches.

### Integration Points
- `src/main/index.ts` — main-process entry point where `sessionManager`, `db`, and new `captureService` are instantiated and wired together.
- `SessionManager` `onStateChange` → `'Capturing'` → `captureService.startCapture(meetingId)`
- `SessionManager` `onStateChange` → `'Processing'` → `captureService.stopCapture()`
- Deepgram `speech_final` event → `TranscriptStore.insert(segment)` → encrypted DB write → push `transcript-segment` IPC event to renderer

</code_context>

<specifics>
## Specific Ideas

- **Two-dot status bar:** Minimal dot indicators (gray/green/yellow/red) for each channel. Dots live in the new `CapturingScreen` component next to channel labels ("Mic" and "System"). No elaborate animations — simple background-color change based on health status.
- **Stop Meeting button:** Plain button in `CapturingScreen` that calls `window.electronAPI.invoke('end-meeting')`. Triggers FSM `end-meeting` event → `Capturing → Processing`.
- **`mip_opt_out: true` verifiability:** The Deepgram SDK client must be initialized with `mip_opt_out: true` as a hardcoded option in `DeepgramClient.ts`, not configurable via any settings path. The researcher should confirm the exact SDK option name for version `@deepgram/sdk` used.

</specifics>

<deferred>
## Deferred Ideas

- **Cross-channel speaker correlation / voice fingerprinting** — identifying the same person across mic and system audio channels. Complex audio DSP, deferred to v2.
- **PCM buffering during Deepgram reconnect** — buffering audio to replay after reconnection avoids transcript gaps but risks memory pressure. Deferred to v2.
- **Named speaker attribution** — mapping "Speaker 1/2/3" to real names. Deferred to v2 (needs real usage data + UX design for name confirmation flow).
- **16kHz downsampling strategy** — if Deepgram's optimal input is 16kHz (not 44.1kHz), where downsampling happens (AudioWorklet vs main process) is left to researcher to specify. Not decided in this discussion.

</deferred>

---

*Phase: 7-Capture + TranscriptStore*
*Context gathered: 2026-06-26*
