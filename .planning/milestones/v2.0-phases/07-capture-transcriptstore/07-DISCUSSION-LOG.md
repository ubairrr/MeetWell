# Phase 7: Capture + TranscriptStore - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-26
**Phase:** 7-Capture + TranscriptStore
**Areas discussed:** Mic PCM format & chunk size, Deepgram disconnect recovery, Capturing state UI scope, Speaker label normalization

---

## Mic PCM Format & Chunk Size

### Format

| Option | Description | Selected |
|--------|-------------|----------|
| Int16 PCM, converted in renderer | AudioWorklet converts Float32 → Int16 before posting to main thread. Main process receives ready-to-stream bytes. | ✓ |
| Float32Array, converted in main process | Renderer sends raw Float32 buffers; main process converts. Simpler renderer code. | |
| You decide | Leave to researcher/planner. | |

**User's choice:** Int16 PCM converted in the AudioWorklet processor in the renderer.

### Chunk Size

| Option | Description | Selected |
|--------|-------------|----------|
| ~100ms | ~4,400 samples. Lowest latency; more IPC calls. | |
| ~250ms | ~11,025 samples. Good balance — DNA's proven pattern. | ✓ |
| ~500ms | ~22,050 samples. Lower IPC pressure; half-second buffer lag. | |

**User's choice:** ~250ms chunks.

---

## Deepgram Disconnect Recovery

### Recovery Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-reconnect silently up to 3 attempts, then mark error | Covers transient drops. Segments during gap are lost (no buffering). | ✓ |
| Mark health as error immediately | Surfaces the problem immediately; user can manually retry. | |
| Pause capture + buffer PCM during reconnect | Buffer audio during drop and replay after reconnection. Complex; risks memory pressure. | |

**User's choice:** Auto-reconnect 3 attempts, then mark health as error.

### Backoff Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed 2s delay between attempts | Simple, predictable. 3 attempts over 6 seconds. | ✓ |
| Exponential backoff (1s, 2s, 4s) | Standard network resilience. Slightly more complex. | |

**User's choice:** Fixed 2-second delay.

---

## Capturing State UI Scope

### UI Depth in Phase 7

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal status bar — two dots (mic / system) with color | Slim strip with colored dots for health. Phase 9 replaces with full design. | ✓ |
| Basic Capturing screen with live segment count + health | Full component with timer, segment count, health indicators. | |
| No UI — console-log only for Phase 7 | CAPT-08 deferred to Phase 9. | |

**User's choice:** Minimal two-dot status bar.

### Post-Consent Overlay State

| Option | Description | Selected |
|--------|-------------|----------|
| Replace ConsentGate with status bar + Stop Meeting button | Minimal but functional — user sees health and can stop. | ✓ |
| Keep ConsentGate visible during capture | Simpler scope; health dots as overlay on ConsentGate. | |
| Show a full-screen 'Recording...' banner | Clear feedback but more work than Phase 7 needs. | |

**User's choice:** Replace ConsentGate with `CapturingScreen` (two health dots + Stop Meeting button).

---

## Speaker Label Normalization

### Channel Mapping Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Per-channel independent normalization | Mic: speaker 0 = 'You'. System: speaker 0 = 'Speaker 1', etc. No cross-channel correlation. | ✓ |
| Global speaker registry across both channels | Attempt voice fingerprinting across channels. Very complex. | |
| Store Deepgram's raw IDs, map at display time | DB stores numeric IDs; renderer applies display mapping. | |

**User's choice:** Per-channel independent normalization.

### Speaker ID Reset Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Trust Deepgram's IDs within each connection | Label may shift if IDs reset — acceptable in v1. | |
| Detect reset and increment speaker counter | Requires audio fingerprinting — too complex for v1. | |
| You decide | Left to researcher/planner. | ✓ |

**User's choice:** Deferred to researcher/planner.

---

## Claude's Discretion

- **Speaker ID reset behavior:** Researcher/planner to verify if Deepgram guarantees stable speaker IDs within a WebSocket session and document the behavior.
- **audiotee spawn pattern:** Researcher to determine spawn strategy (child_process.spawn, stdout/stderr piping to Deepgram WebSocket), crash-restart policy, and binary launch lifecycle.
- **Sample rate (44.1kHz vs 16kHz):** Researcher to confirm whether Deepgram accepts 44.1kHz or requires 16kHz, and if downsampling is needed, where it happens (AudioWorklet vs main process).
- **Confidence score field:** Researcher/planner to confirm whether `confidence` should be added to `transcript_segments` DDL or omitted for v1.

## Deferred Ideas

- Cross-channel speaker correlation / voice fingerprinting → v2
- PCM buffering during Deepgram reconnect to avoid transcript gaps → v2
- Named speaker attribution ("Alice"/"Bob") → v2 (already locked)
- 16kHz downsampling strategy details → researcher to resolve
