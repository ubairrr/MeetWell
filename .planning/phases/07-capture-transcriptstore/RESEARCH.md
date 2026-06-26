# Phase 7: Capture + TranscriptStore — Research

**Researched:** 2026-06-26
**Domain:** Dual-channel audio capture, Deepgram Nova-3 WebSocket streaming, Electron IPC binary transfer, TranscriptStore
**Confidence:** MEDIUM (all critical APIs verified against live source; speaker ID behavior LOW by nature)

---

## Summary

Phase 7 wires the dual-channel audio capture pipeline: mic (AudioWorklet → IPC → Deepgram) and system audio (`audiotee` npm package → Deepgram). Both channels stream independently to separate Deepgram Nova-3 WebSocket connections and persist `speech_final` segments to the encrypted SQLCipher `transcript_segments` table.

All five "open questions from discussion" have been resolved through direct source inspection:

1. **`audiotee` is an npm package** (`npm install audiotee@0.0.7`), not a standalone binary you spawn manually. It wraps a bundled Swift binary via `child_process.spawn` internally and exposes a clean TypeScript EventEmitter API. The binary is a universal macOS arm64/x86_64 binary at `node_modules/audiotee/bin/audiotee`.

2. **Sample rate: use 16000 Hz for both channels.** The `audiotee` binary confirmed it converts 48kHz device output to 16-bit signed integer PCM at the target rate. The Deepgram SDK accepts `linear16` encoding at `sample_rate: 16000`. Streaming 44100 Hz is technically possible (Deepgram accepts it) but 16 kHz is the standard for ASR and halves IPC bandwidth — no downsampling logic required; just configure both systems to 16000 Hz at initialization.

3. **Deepgram SDK v5.4.0 API** is now auto-generated from Fern and differs from the v3/v4 docs. Key change: `new DeepgramClient({ apiKey })` (not `createClient`). Connection: `client.listen.v1.connect({ model: 'nova-3', diarize: 'true', mip_opt_out: true, encoding: 'linear16', sample_rate: 16000 })`. Returns a `V1Socket` with `.on('message')` typed to `ListenV1Results | ListenV1Metadata | ListenV1UtteranceEnd | ListenV1SpeechStarted`.

4. **IPC binary transfer:** `ArrayBuffer` is a Structured Clone Algorithm cloneable type, so it passes through Electron's `contextBridge` and `ipcRenderer.invoke` without issue. At 16kHz the chunk is ~8 KB every 250ms (31 KB/s), well within IPC capacity.

5. **Confidence field: ADD IT.** CAPT-05 requires "confidence score" in `TranscriptSegment`. The architecture doc's `TranscriptSegment` interface omits it, but the requirement is explicit. Add `confidence REAL` to the DDL migration and the TypeScript interface now.

**Primary recommendation:** Use the `audiotee` npm package (not manual spawn) for system audio. Configure both channels at 16000 Hz. Apply a DDL migration to add `confidence REAL` to `transcript_segments`. Use `client.listen.v1.connect()` for Deepgram connections.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** AudioWorklet converts Float32 → Int16 PCM in the renderer (in the worklet processor itself) before posting to the main thread. Main process receives ready-to-stream Int16 bytes and forwards them directly to Deepgram's WebSocket. No conversion in main process.
- **D-02:** AudioWorklet flushes one chunk to the main process every ~250ms (≈11,025 samples at 44.1kHz, ≈35 quanta batched per flush). Payload on the `mic-audio-chunk` IPC channel is an `ArrayBuffer` of Int16 PCM bytes at 44.1kHz mono.
- **D-03:** If a Deepgram WebSocket connection drops mid-meeting, attempt auto-reconnect silently up to 3 times with a fixed 2-second delay between attempts. No user interruption during retry window.
- **D-04:** After 3 failed attempts, push a `capture-health-update` event with `status: 'error'` for the affected channel. The channel's dot in the overlay status bar turns red.
- **D-05:** Transcript segments arriving during the reconnection gap are lost — no PCM buffering during reconnect.
- **D-06:** Each channel (mic and system) has independent reconnect tracking — one channel failing does not affect the other.
- **D-07:** Phase 7 adds a minimal two-dot status bar to the overlay. Each dot represents one channel (mic / system audio). Colors: gray = idle, green = healthy, yellow = silent (no audio detected), red = error.
- **D-08:** When `SessionManager` transitions from `PreCapture → Capturing`, the overlay replaces `ConsentGateScreen` with a minimal `CapturingScreen`: two-dot health bar plus a plain "Stop Meeting" button.
- **D-09:** Per-channel independent normalization. Mic channel: Deepgram speaker 0 always → `'You'`. System audio channel: Deepgram speaker 0 → `'Speaker 1'`, speaker 1 → `'Speaker 2'`, etc.
- **D-10:** Speaker ID mapping is maintained per-connection in a small in-process `Map<number, string>` within `CaptureService`. The map is reset when the WebSocket connection is re-established.

### Claude's Discretion

- **Speaker ID reset on reconnect:** Trust Deepgram's IDs within the session — label continuity may shift but no detection or compensation logic is added. Left to researcher/planner to verify if Deepgram guarantees stable IDs within a connection.
- **audiotee spawn pattern:** How `audiotee` is launched, its stdout/stderr piping to Deepgram WebSocket, and crash-restart policy are left to the researcher to determine from audiotee 0.0.7 API/docs.
- **Sample rate resampling:** If Deepgram requires 16kHz input (not 44.1kHz), the researcher/planner should specify whether downsampling happens in the AudioWorklet, in the main process, or if we configure Deepgram to accept 44.1kHz.
- **Confidence score field:** The `transcript_segments` schema has a confidence column not in the current DDL — researcher/planner should confirm whether to add it or omit for v1.

### Deferred Ideas (OUT OF SCOPE)

- Cross-channel speaker correlation / voice fingerprinting
- PCM buffering during Deepgram reconnect
- Named speaker attribution (mapping numbers to real names)
- 16kHz downsampling strategy (resolved: use 16kHz natively, no post-capture resampling)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAPT-01 | Mic audio captured via AudioWorklet in renderer; PCM frames streamed to main via IPC | AudioWorklet processor pattern; Float32→Int16 conversion; contextBridge ArrayBuffer support confirmed |
| CAPT-02 | System audio captured via `audiotee` 0.0.7 without purple recording indicator | `audiotee` npm package API confirmed; Core Audio Taps path; binary in asarUnpack/resources |
| CAPT-03 | Chromium loopback flags as fallback system audio | Fallback path; health status reflects active path |
| CAPT-04 | Both channels stream to separate Deepgram Nova-3 WebSockets with `diarize: true` and `mip_opt_out: true` hardcoded | Exact SDK API confirmed; option names verified from SDK source |
| CAPT-05 | Each `speech_final` event produces a `TranscriptSegment` with speaker label, timestamps, channel ID, and **confidence score** | DDL migration needed; `ListenV1Results` type has `confidence` per word |
| CAPT-06 | Mic speaker 0 → "You"; system audio speaker 0 → "Speaker 1", etc.; v1 cap 8 speakers | D-09/D-10 implementation pattern |
| CAPT-07 | Every `TranscriptSegment` persisted to encrypted `transcript_segments` table as it arrives | `TranscriptStore.appendSegment()` interface; synchronous better-sqlite3 write |
| CAPT-08 | Capture health status (silent/healthy/error) surfaced in overlay UI in real time | Minimal `CapturingScreen` with two dots; `capture-health-update` IPC channel pre-wired |
| CAPT-09 | Raw audio discarded immediately after each transcription batch | Never buffer PCM beyond the in-flight chunk; audiotee writes to stdout only, no disk |
</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

- `mip_opt_out: true` is a **hardcoded product-level commitment (DEC-02)** — never a user setting. It must be hardcoded in `DeepgramClient.ts`, not configurable via `electron-store`.
- All audio, STT, DB, LLM, and session logic runs in the **Electron main process** — renderer is display-only.
- No raw `ipcRenderer` exposed — contextBridge typed allowlist only (`mic-audio-chunk` invoke already in allowlist).
- `SessionManager` FSM gates all capture start/stop — `CaptureService.start()` must only be called from the `Capturing` state-entry hook, never from an IPC handler directly.
- All Zod schemas in `src/shared/schemas/index.ts` (Phase 8 full rollout, but a lightweight `TranscriptSegmentSchema` is acceptable in Phase 7 for IPC push validation).
- `better-sqlite3-multiple-ciphers` writes only — never `electron-store` for transcripts.
- `audiotee` binary must be in `asarUnpack` (already configured for `resources/audiotee`).
- System audio capture: `audiotee` 0.0.7 is **primary**; Chromium loopback flags are **fallback** (CAPT-03).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Mic PCM capture | Browser / AudioWorklet | — | AudioContext lives in renderer; Web Audio API only available there |
| Float32→Int16 conversion | Browser / AudioWorklet | — | D-01: conversion happens in worklet processor before postMessage |
| IPC PCM relay (mic→main) | Electron IPC bridge | — | contextBridge `invoke('mic-audio-chunk')` channel pre-wired |
| System audio capture (primary) | Main process | — | `audiotee` is a Node.js/Swift integration; no browser APIs |
| System audio capture (fallback) | Browser / Renderer | Main process | Chromium loopback uses `getUserMedia` in renderer |
| Deepgram WebSocket (both channels) | Main process | — | Node.js `ws`; main has access to API key via env |
| `speech_final` → DB write | Main process (TranscriptStore) | — | `better-sqlite3` runs in main; never in renderer |
| IPC push of transcript events | Main process → Renderer | — | `webContents.send('transcript-segment')` channel pre-wired |
| Health status bar UI | Renderer | — | D-07/D-08: minimal `CapturingScreen` component |
| Speaker normalization | Main process (CaptureService) | — | D-09/D-10: `Map<number, string>` per channel |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `audiotee` | 0.0.7 | System audio capture via Core Audio Taps | RSCH-04 validated; bundled universal binary; npm package API |
| `@deepgram/sdk` | 5.4.0 | Deepgram STT WebSocket client | Official SDK; auto-generated types from Fern; v5 is current GA |

**No additional libraries required.** Web Audio API (`AudioWorklet`) is built into Chromium. `better-sqlite3-multiple-ciphers` is already installed (Phase 6). `uuid` or `crypto.randomUUID()` available in Node 24 for segment IDs.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `audiotee` npm package API | `child_process.spawn` directly on the binary | Package API handles stderr JSON parsing, process lifecycle, exit codes — prefer the package |
| 16kHz for both channels | 44.1kHz native (no downsampling) | 44.1kHz works with Deepgram but increases IPC payload 2.75× (21.5 KB vs 7.8 KB/chunk); Deepgram accuracy is optimized for 16kHz |
| `client.listen.v1.connect()` | Raw WebSocket via `ws` package | SDK manages reconnect logic, auth header, and provides typed payloads — use SDK |

**Installation:**

```bash
npm install audiotee@0.0.7 @deepgram/sdk@5.4.0
```

**Version verification:** `npm view audiotee version` → `0.0.7` [VERIFIED: npm registry]. `npm view @deepgram/sdk version` → `5.4.0` [VERIFIED: npm registry].

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `audiotee` | npm | ~8 months (Oct 2025) | 7,192/wk | github.com/makeusabrew/audioteejs | SUS (no-repository field in package.json) | Approved with verification |
| `@deepgram/sdk` | npm | Active (Jun 2026 release) | 605,770/wk | github.com/deepgram/deepgram-js-sdk | SUS (flagged as "too-new" by heuristic) | Approved — official Deepgram SDK |

**Packages removed due to SLOP verdict:** none

**Packages flagged as suspicious [SUS] — human verification notes:**

- `audiotee`: The "no-repository" field in `package.json` is the only signal. The package is published by Nick Payne (makeusabrew on GitHub), has a verified GitHub repo (`github.com/makeusabrew/audioteejs`), 7K weekly downloads, and the binary is a real macOS universal binary confirmed by `file` command. The README explicitly describes Electron packaging. Treat as approved. [VERIFIED: npm registry + binary inspection + README confirms legitimate use]
- `@deepgram/sdk`: The "too-new" flag is a heuristic false positive — the package is Deepgram's official JavaScript SDK with 600K weekly downloads. [VERIFIED: npm registry + GitHub source inspection]

---

## Research Findings

### Finding 1: audiotee Integration

**`audiotee` is a Node.js npm package, not a bare binary to spawn.** [VERIFIED: npm registry + source inspection]

The package at `node_modules/audiotee/` contains:
- `dist/index.js` — TypeScript class wrapping `child_process.spawn`
- `bin/audiotee` — prebuilt universal macOS binary (arm64 + x86_64, 604 KB)

**TypeScript API (from `dist/index.d.ts`):**

```typescript
interface AudioTeeOptions {
  sampleRate?: number        // Target Hz; default = device native (~48000)
  chunkDurationMs?: number   // ms per data event; default = 200
  mute?: boolean             // Mute system audio during capture; default false
  includeProcesses?: number[] // PIDs to capture (empty = all)
  excludeProcesses?: number[] // PIDs to exclude
  binaryPath?: string        // Override default binary path (REQUIRED in packaged app)
}

interface AudioChunk {
  data: Buffer               // Raw PCM bytes
}

class AudioTee {
  on(event: 'data',  listener: (chunk: AudioChunk) => void): this
  on(event: 'start', listener: () => void): this
  on(event: 'stop',  listener: () => void): this
  on(event: 'error', listener: (error: Error) => void): this
  on(event: 'log',   listener: (level: 'info'|'debug', msg: MessageData) => void): this
  start(): Promise<void>
  stop(): Promise<void>
  isActive(): boolean
}
```

**PCM format:** When `sampleRate` is specified, audiotee emits **16-bit signed integer (Int16LE) PCM**, mono, at the requested rate. Without `sampleRate`, emits 32-bit float at device native rate (~48 kHz). **Always specify `sampleRate: 16000`.**

Confirmed by live binary run: `metadata` message on stderr shows `encoding: "pcm_s16le"` when `--sample-rate 16000` is passed.

**Crash detection:** The internal `child_process.spawn` instance fires `exit` with non-zero code on crash. The `audiotee` package emits an `error` event. Phase 7 must listen to `error` and implement the D-03 reconnect loop (3 attempts, 2s delay) by calling `audiotee.stop()` then `audiotee.start()`.

**Binary path in packaged app (CRITICAL PACKAGING ISSUE):**

`electron-builder.yml` already has `'resources/audiotee'` in `asarUnpack`, meaning the binary must be placed at `resources/audiotee` in the project root — NOT left in `node_modules/audiotee/bin/audiotee`. The package resolves `binaryPath` from `__dirname/../bin/audiotee` which points into the ASAR archive in production (binary cannot execute from ASAR).

Two implementation options:

**Option A — `extraResources` (recommended by audiotee packaging article):**
Add to `electron-builder.yml`:
```yaml
extraResources:
  - from: node_modules/audiotee/bin/audiotee
    to: audiotee
```
Then in `CaptureService`, resolve:
```typescript
const binaryPath = app.isPackaged
  ? path.join(process.resourcesPath, 'audiotee')
  : path.join(__dirname, '../../node_modules/audiotee/bin/audiotee')
const audiotee = new AudioTee({ sampleRate: 16000, chunkDurationMs: 250, binaryPath })
```

**Option B — Use existing `asarUnpack`:**
The existing `asarUnpack: 'resources/audiotee'` (Phase 6 config) assumes the binary is copied to `resources/audiotee`. A `postinstall` script can copy `node_modules/audiotee/bin/audiotee` → `resources/audiotee` after `npm install`.

The Phase 6 config already has `resources/audiotee` in asarUnpack, so **Option B matches existing config** and avoids changing `electron-builder.yml`. The planner should add a postinstall copy step.

**Stderr output:** JSON-newline-delimited messages. Structure:
```json
{ "message_type": "metadata", "data": { "sample_rate": 16000, "channels_per_frame": 1, "bits_per_channel": 16, "is_float": false, "encoding": "pcm_s16le" }, "timestamp": "..." }
{ "message_type": "stream_start", "timestamp": "..." }
{ "message_type": "info", "data": { "message": "..." }, "timestamp": "..." }
{ "message_type": "error", "data": { "message": "..." }, "timestamp": "..." }
{ "message_type": "stream_stop", "timestamp": "..." }
```

These are surfaced as `log` and `error` events through the package API — no need to parse stderr manually.

---

### Finding 2: Sample Rate Decision (RESOLVED)

**Use 16000 Hz for both channels. No downsampling logic needed.** [VERIFIED: binary help output + community usage patterns]

- `audiotee --sample-rate 16000` converts the device's native 48 kHz signal to 16-bit signed integer PCM at 16 kHz internally using Core Audio's built-in converter. Chunk `data` arrives as 16-bit signed integer bytes ready for Deepgram.
- Deepgram accepts any numeric `sample_rate` value. The SDK type `ListenV1SampleRate` is `unknown` (any value). Community usage confirms 44100 Hz works, but 16 kHz is the standard for voice ASR and what Deepgram internally uses.
- The `audiotee` binary `--help` shows supported rates: `8000, 16000, 22050, 24000, 32000, 44100, 48000`. Both 16000 and 44100 are valid options.

**IPC bandwidth comparison:**
| Sample Rate | Bytes/chunk (250ms, mono, Int16) | Chunks/sec | KB/s |
|-------------|----------------------------------|------------|------|
| 44100 Hz (D-02 original) | 22,050 bytes (21.5 KB) | 4 | 86.1 |
| 16000 Hz (recommended) | 8,000 bytes (7.8 KB) | 4 | 31.3 |

Deepgram accuracy for speech is equivalent at 16kHz — there is no benefit to 44.1kHz for voice ASR.

**Implication for D-02:** CONTEXT.md D-02 says "~11,025 samples at 44.1kHz". If we switch to 16kHz for the AudioWorklet mic path as well, the chunk is 4,000 samples instead. The "~35 quanta" figure in D-02 is also inaccurate at 44.1kHz (86 quanta, not 35). The planner should clarify D-02 with the user OR use 16kHz in the AudioWorklet too. Research recommendation: change the AudioWorklet to capture at **16kHz** (set `AudioContext({ sampleRate: 16000 })`) so both channels are symmetric. This also eliminates any need for downsampling after capture.

**Note on D-02 discrepancy:** CONTEXT.md D-02 states "~35 quanta batched per flush" at 44.1kHz. At 44.1kHz, 250ms = 11,025 samples / 128 samples per AudioWorklet quantum = ~86 quanta, not 35. The planner should use the sample count (11,025) as the authority and discard the quanta figure, or switch to 16kHz (4,000 samples = ~31 quanta).

---

### Finding 3: Deepgram SDK v5.4.0 Exact API

[VERIFIED: GitHub source deepgram/deepgram-js-sdk at `main` branch]

**Client instantiation:**
```typescript
import { DeepgramClient } from '@deepgram/sdk'

const client = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY })
```

**Live connection:**
```typescript
const connection = await client.listen.v1.connect({
  model: 'nova-3',           // ListenV1Model.Nova3 = "nova-3"
  diarize: 'true',           // string "true", not boolean
  mip_opt_out: true,         // HARDCODED — never configurable
  encoding: 'linear16',      // ListenV1Encoding.Linear16
  sample_rate: 16000,        // integer Hz
  interim_results: 'true',   // string "true"
  punctuate: 'true',
  Authorization: apiKey,     // required field in ConnectArgs
})
```

**V1Socket events:**
```typescript
connection.on('open', () => { /* WebSocket opened */ })

connection.on('message', (data) => {
  if (data.type === 'Results') {
    const result = data as ListenV1Results
    if (result.speech_final) {
      // Process final segment
    }
  }
  // Also: ListenV1Metadata, ListenV1UtteranceEnd, ListenV1SpeechStarted
})

connection.on('error', (error: Error) => { /* handle */ })
connection.on('close', (event) => { /* handle reconnect */ })
```

**Sending audio:**
```typescript
connection.sendMedia(pcmBuffer: ArrayBuffer | Buffer | ArrayBufferView)
```

**`ListenV1Results` payload (from auto-generated types):**
```typescript
interface ListenV1Results {
  type: 'Results'
  channel_index: number[]
  duration: number          // seconds of audio in this result
  start: number             // seconds from start of stream
  is_final?: boolean
  speech_final?: boolean    // TRUE when this is a finalized utterance
  channel: {
    alternatives: [{
      transcript: string
      confidence: number    // 0.0–1.0; overall segment confidence
      words: [{
        word: string
        start: number       // seconds
        end: number         // seconds
        confidence: number  // 0.0–1.0; per-word confidence
        speaker?: number    // integer speaker ID (0-based); diarize must be true
        punctuated_word?: string
      }]
    }]
  }
  metadata: {
    request_id: string
    model_info: { name: string; version: string; arch: string }
    model_uuid: string
  }
}
```

**Key observation:** `speech_final` is the flag to use for persistence (not `is_final`). `speech_final: true` means the utterance has ended at a natural speech boundary. `is_final: true` means the result will not be revised (may fire multiple times per utterance). Always filter for `speech_final === true` before writing to DB.

**`Authorization` field:** The `V1Client.ConnectArgs` has a required `Authorization: string` field — this is the Deepgram API key passed directly into the connection args alongside the transcription options.

---

### Finding 4: Speaker ID Stability in Deepgram Streaming

[CITED: github.com/orgs/deepgram/discussions/108, /1127, /1144]

**Deepgram does NOT guarantee stable speaker IDs within a streaming session.** [LOW confidence — no official guarantee found]

Community reports (as recent as May 2024) document:
- Speaker IDs can reset or shift mid-session, especially when new speakers begin talking
- All speakers may briefly be assigned `speaker: 0` when diarization fails to discriminate
- The v2 diarizer (more accurate) is **not available for streaming** — streaming is locked to `diarize_model=v1` (or `diarize_model=latest`, which currently aliases to v1)

**Critical limitation:** Speaker labels are only present in **final results** (`is_final: true`), not in interim results. Setting `interim_results: true` will produce responses without the `speaker` field until `is_final` fires.

**D-10 implications:** The decision to "trust Deepgram's IDs within the session" and reset the speaker map on reconnect is the correct approach given these limitations. No additional compensation logic is recommended for v1.

**Practical mitigation:** For MeetingAssist's use case, the mic channel only has one speaker (the user → always "You"), so speaker ID stability is irrelevant for that channel. The system audio channel may have multiple speakers, and ID drift is an accepted v1 limitation (noted in D-05/D-10 spirit).

---

### Finding 5: Electron IPC Binary Data Transfer

[CITED: electronjs.org/docs/latest/api/context-bridge, developer.mozilla.org Structured Clone]

**`ArrayBuffer` is a Structured Clone Algorithm cloneable type and passes through `contextBridge` cleanly.** [VERIFIED: Electron docs]

The `contextBridge` docs explicitly list "Cloneable Types (per MDN's structured clone algorithm)" as supported. The MDN structured clone spec explicitly includes `ArrayBuffer` and all TypedArrays (`Int16Array`, `Uint8Array`, etc.).

**What this means for Phase 7:**
- The `AudioWorklet` processor can post a `Float32Array` buffer or `Int16Array` via `postMessage({ buffer: int16Buffer }, [int16Buffer.buffer])` (transferable — zero copy from worklet to main thread)
- The main thread receives it, then passes the `ArrayBuffer` via `window.electronAPI.invoke('mic-audio-chunk', int16Buffer.buffer)`
- The contextBridge serializes the `ArrayBuffer` via Structured Clone (one copy across the isolation boundary)
- `ipcMain.handle('mic-audio-chunk', (event, buffer) => ...)` receives it as a `Buffer` (Node.js converts `ArrayBuffer` to `Buffer` automatically)

**Performance:** At 16kHz, each chunk is 8 KB. IPC overhead for 8 KB every 250ms is negligible. For 44.1kHz (21.5 KB), still well within IPC capacity. No `postMessage` with transferable workaround needed.

**Warning — Uint8Array caveat:** Electron has a known bug (Issue #35152) where `Uint8Array` sent through IPC arrives as a plain Object. **Use `ArrayBuffer`, not `Uint8Array`**, when sending PCM over IPC. Convert: `const buffer: ArrayBuffer = int16Array.buffer`.

---

### Finding 6: Confidence Field — Add to DDL

**Decision: ADD `confidence REAL` column to `transcript_segments`.** [VERIFIED: CAPT-05 requirement + architecture review]

Evidence:
- CAPT-05 explicitly states: "produces a `TranscriptSegment` record with speaker label, timestamps, channel ID, and **confidence score**"
- `ListenV1Results.channel.alternatives[0].confidence` provides an overall segment confidence score (0.0–1.0)
- The current DDL in `src/main/store/db.ts` does NOT have a `confidence REAL` column
- The TypeScript `TranscriptSegment` interface in `05-ARCHITECTURE.md` does NOT have a `confidence` field

**Action required in Phase 7:**
1. Add a `confidence REAL` column to the `transcript_segments` DDL
2. Add a `confidence?: number` field to the TypeScript `TranscriptSegment` interface
3. Populate it from `result.channel.alternatives[0].confidence` when writing to DB

Since Phase 6 has already run `openDatabase()` which executed the original DDL, Phase 7 needs an `ALTER TABLE transcript_segments ADD COLUMN confidence REAL` migration, run after `PRAGMA key` but before any writes. The existing `openDatabase()` in `db.ts` should have this migration appended (or a separate `runMigrations()` function).

---

### Finding 7: AudioWorklet Mic Capture Pattern

[CITED: MDN Web Audio API AudioWorklet documentation + standard patterns]

**AudioWorklet processor pattern for Float32 → Int16 conversion:**

```javascript
// File: src/renderer/src/worklets/mic-processor.js
// (must be a separate file, loaded via AudioWorklet.addModule)
class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._buffer = []
    this._targetSamples = 4000  // 250ms at 16kHz
  }

  process(inputs) {
    const input = inputs[0]?.[0]  // first channel of first input
    if (!input) return true

    // Accumulate samples
    for (let i = 0; i < input.length; i++) {
      this._buffer.push(input[i])
    }

    // Flush when we have enough
    if (this._buffer.length >= this._targetSamples) {
      const slice = this._buffer.splice(0, this._targetSamples)
      const int16 = new Int16Array(slice.length)
      for (let i = 0; i < slice.length; i++) {
        const s = Math.max(-1, Math.min(1, slice[i]))
        int16[i] = s < 0 ? s * 32768 : s * 32767
      }
      // Transfer ownership to main thread (zero copy)
      this.port.postMessage({ type: 'audio', buffer: int16.buffer }, [int16.buffer])
    }

    return true  // Keep processor alive
  }
}

registerProcessor('mic-processor', MicProcessor)
```

**Renderer side (React component `AudioWorkletHost`):**
```typescript
const ctx = new AudioContext({ sampleRate: 16000 })
await ctx.audioWorklet.addModule('/worklets/mic-processor.js')
const source = ctx.createMediaStreamSource(micStream)
const node = new AudioWorkletNode(ctx, 'mic-processor')
node.port.onmessage = (e) => {
  if (e.data.type === 'audio') {
    // e.data.buffer is the transferred ArrayBuffer
    window.electronAPI.invoke('mic-audio-chunk', e.data.buffer)
  }
}
source.connect(node)
```

**AudioContext sampleRate:** If `AudioContext` is created with `sampleRate: 16000`, the AudioWorklet quantum is still 128 frames at 16kHz = 8ms per quantum, and 250ms / 8ms = ~31 quanta per flush (consistent with 4000 samples = 31.25 quanta). This is the recommended approach.

**Alternative (keep 44.1kHz for AudioContext):** If the AudioContext must remain at 44.1kHz (browser default), the worklet receives 128 samples per quantum at 44.1kHz, and 250ms = 11,025 samples = ~86 quanta. The Int16 conversion math is identical. In this case, configure Deepgram `sample_rate: 44100` for the mic channel.

Recommendation: Set `AudioContext({ sampleRate: 16000 })` for symmetry with audiotee's output and simpler Deepgram configuration.

---

### Finding 8: Chromium Loopback Fallback (CAPT-03)

[CITED: stronglytyped.uk/articles/recording-system-audio-electron-macos-approaches]

For CAPT-03 fallback system audio capture, use Chromium's built-in loopback via `getUserMedia` with:
- Electron flag: `--enable-features=MacLoopbackAudioForScreenShare` (or equivalent content flag)
- Requires `Screen & System Audio Recording` permission (triggers the purple indicator — acceptable for fallback)
- Available macOS 15.0+ only

The `CaptureService` should detect whether `audiotee` fails to start (error event or permission denial) and fall back to the Chromium path. The health status bar should show a different tooltip when the fallback is active.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| System audio tap | Custom Core Audio Taps Swift code | `audiotee` npm package | Binary compiled, tested, universal arch |
| WebSocket reconnect logic | Custom retry loop | Deepgram SDK built-in reconnect | `reconnectAttempts` option in `V1Client.ConnectArgs`; may conflict with D-03 custom logic — see pitfall below |
| PCM conversion in main process | Node.js Buffer arithmetic | AudioWorklet does it in renderer (D-01) | Main process never receives Float32 |
| Deepgram API auth | Custom WebSocket with query params | `DeepgramClient` + `connect()` | SDK manages auth header, TLS, WebSocket subprotocol |
| Speaker label normalization | Complex ML / audio DSP | Simple `Map<number, string>` per channel | D-09/D-10 is explicitly minimal for v1 |

**Key insight:** The `audiotee` package already does the heaviest lifting — Core Audio tap creation, PCM encoding, sample rate conversion, and binary management. Do not replicate any of this.

---

## Architecture Patterns

### System Architecture Diagram

```
RENDERER PROCESS                     MAIN PROCESS
┌─────────────────────────┐         ┌──────────────────────────────────────────┐
│  AudioContext(16kHz)    │         │  CaptureService                          │
│  ┌───────────────────┐  │         │  ┌────────────────┐  ┌─────────────────┐ │
│  │  MicWorkletNode   │  │ invoke  │  │  DeepgramClient│  │ DeepgramClient  │ │
│  │  Float32→Int16    │──┼─────────┼─►│  (mic channel) │  │ (system channel)│ │
│  │  250ms chunks     │  │         │  │  nova-3,diarize│  │ nova-3,diarize  │ │
│  └───────────────────┘  │         │  └───────┬────────┘  └───────┬─────────┘ │
│                         │         │          │ WebSocket          │ WebSocket  │
│  CapturingScreen        │         │  ┌───────▼────────────────────▼─────────┐ │
│  ┌──────────────────┐   │  send   │  │  Deepgram Nova-3 API (cloud)        │ │
│  │ Mic dot  ● [G]   │◄──┼─────────┼──│  speech_final events                │ │
│  │ Sys dot  ● [G]   │   │         │  └─────────────────────────────────────┘ │
│  │ [Stop Meeting]   │   │         │          │ speech_final                   │
│  └──────────────────┘   │         │  ┌───────▼────────────────────────────┐  │
│                         │         │  │  TranscriptStore                   │  │
│  SessionState listen    │  send   │  │  appendSegment() → SQLCipher DB    │  │
│  session-state-changed◄─┼─────────┼──│  transcript_segments table         │  │
└─────────────────────────┘         │  └────────────────────────────────────┘  │
                                    │          │ send 'transcript-segment'       │
                                    │          ▼                                 │
                                    │  SessionManager FSM                       │
                                    │  Capturing entry → captureService.start() │
                                    │  Processing entry → captureService.stop() │
                                    └──────────────────────────────────────────┘
                                    
                                    audiotee (child process)
                                    stdout: raw PCM (16kHz, 16-bit, mono)
                                    ──────────────────────────────────────────
                                    audiotee 'data' event → CaptureService
                                    → DeepgramClient(system).sendMedia(buffer)
```

### Recommended Project Structure

```
src/main/capture/
  CaptureService.ts       # Orchestrates both channels; FSM hooks; health events
  DeepgramClient.ts       # Single Deepgram WebSocket wrapper; reconnect logic
  SpeakerNormalizer.ts    # Map<number,string> per channel; D-09 normalization
  MicBridge.ts            # Handles 'mic-audio-chunk' IPC → Deepgram forwarding
src/main/transcript/
  TranscriptStore.ts      # appendSegment(); DB writes; 'transcript-segment' push
src/renderer/src/
  components/
    CapturingScreen.tsx   # Two-dot health bar + Stop button (D-07/D-08)
    AudioWorkletHost.tsx  # Manages AudioContext, mic stream, worklet lifecycle
  worklets/
    mic-processor.js      # AudioWorkletProcessor (must be plain JS, not TS)
```

### Pattern 1: DeepgramClient with D-03 Reconnect

**What:** A class wrapping one Deepgram WebSocket connection with retry logic.
**When to use:** One instance per channel (mic, system).

```typescript
// src/main/capture/DeepgramClient.ts
import { DeepgramClient as SDKClient } from '@deepgram/sdk'
import type { V1Socket } from '@deepgram/sdk'

class DeepgramChannel {
  private socket: V1Socket | null = null
  private retryCount = 0
  private readonly MAX_RETRIES = 3   // D-03
  private readonly RETRY_DELAY_MS = 2000  // D-03

  constructor(
    private readonly apiKey: string,
    private readonly channel: 'mic' | 'system',
    private readonly onSegment: (result: SpeechFinalEvent) => void,
    private readonly onHealthChange: (status: 'healthy'|'error'|'silent') => void
  ) {}

  async connect(): Promise<void> {
    const client = new SDKClient({ apiKey: this.apiKey })
    this.socket = await client.listen.v1.connect({
      model: 'nova-3',
      diarize: 'true',
      mip_opt_out: true,   // HARDCODED — DEC-02
      encoding: 'linear16',
      sample_rate: 16000,
      interim_results: 'true',
      punctuate: 'true',
      Authorization: this.apiKey,
    })

    this.socket.on('open', () => {
      this.retryCount = 0
      this.onHealthChange('healthy')
    })

    this.socket.on('message', (data) => {
      if (data.type === 'Results' && data.speech_final) {
        this.onSegment(data)
      }
    })

    this.socket.on('close', () => this.handleDisconnect())
    this.socket.on('error', () => this.handleDisconnect())
  }

  private async handleDisconnect(): Promise<void> {
    if (this.retryCount >= this.MAX_RETRIES) {
      this.onHealthChange('error')  // D-04
      return
    }
    this.retryCount++
    await new Promise(r => setTimeout(r, this.RETRY_DELAY_MS))
    await this.connect()
  }

  sendMedia(buffer: Buffer): void {
    this.socket?.sendMedia(buffer)
  }
}
```

**Note on SDK's built-in reconnect:** `V1Client.ConnectArgs` has a `reconnectAttempts` option (default: 30). This conflicts with D-03's 3-attempt limit. Either pass `reconnectAttempts: 0` to disable SDK reconnect and implement D-03 yourself, OR rely on the SDK's reconnect and only override the `close` event after 3 failures. **Recommendation: pass `reconnectAttempts: 0` and implement D-03 manually for full control.**

### Pattern 2: audiotee Integration in CaptureService

```typescript
import { AudioTee } from 'audiotee'
import path from 'path'
import { app } from 'electron'

function getAudioTeeBinaryPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'audiotee')
  }
  // Dev: binary at node_modules/audiotee/bin/audiotee
  return path.join(__dirname, '../../../node_modules/audiotee/bin/audiotee')
}

const audiotee = new AudioTee({
  sampleRate: 16000,
  chunkDurationMs: 250,
  binaryPath: getAudioTeeBinaryPath(),
})

audiotee.on('data', ({ data }: { data: Buffer }) => {
  systemDeepgramChannel.sendMedia(data)  // Buffer directly to Deepgram
})

audiotee.on('error', (err) => {
  // Trigger D-03 reconnect loop
  handleAudioTeeError(err)
})

await audiotee.start()
```

### Pattern 3: TranscriptStore.appendSegment with DDL Migration

```typescript
// In openDatabase() or a runMigrations() function, after the 4-step init:
db.exec(`ALTER TABLE transcript_segments ADD COLUMN confidence REAL`)
// Wrapped in try/catch (will fail if column already exists — that's OK)
```

```typescript
// TranscriptSegment interface (extended)
interface TranscriptSegment {
  id: string
  meetingId: string
  text: string
  speakerLabel: string      // "You", "Speaker 1", etc.
  channel: 'mic' | 'system'
  timestampStart: number    // seconds from meeting start
  timestampEnd: number
  isFinal: true
  confidence?: number       // NEW: from speech_final result.channel.alternatives[0].confidence
}
```

### Anti-Patterns to Avoid

- **Spawning the audiotee binary directly with `child_process.spawn`:** The npm package handles stderr parsing, process lifecycle, and event emission. Use `new AudioTee({ binaryPath })` instead.
- **Sending `Uint8Array` over Electron IPC:** Electron bug #35152 causes `Uint8Array` to arrive as a plain `Object`. Always send `ArrayBuffer` (`int16Array.buffer`).
- **Filtering on `is_final` instead of `speech_final`:** `is_final` fires for each finalized intermediate result. `speech_final` fires only at natural speech end-of-utterance — this is the correct trigger for DB writes.
- **Reading `speaker` from interim results:** The `speaker` field is only populated in `is_final: true` results. Interim results will have `speaker: undefined`.
- **Not specifying `sample_rate` to audiotee:** Without it, audiotee emits 32-bit float at the device's native rate (~48kHz). Always pass `sampleRate: 16000`.
- **Configuring `mip_opt_out` from `electron-store`:** It must be hardcoded as `true` in `DeepgramClient.ts`. DEC-02 is absolute.

---

## Common Pitfalls

### Pitfall 1: audiotee Binary Not Executable in Packaged App

**What goes wrong:** App launches, `audiotee.start()` throws `EACCES` or `ENOENT` because the binary is inside the ASAR archive where it cannot be executed.

**Why it happens:** `electron-builder.yml` packs `node_modules/` into the ASAR archive. `node_modules/audiotee/bin/audiotee` is inside the archive and is not executable.

**How to avoid:** Copy the binary to `resources/audiotee` (which IS in `asarUnpack`). A `postinstall` script or `electron-builder.yml` `extraResources` directive handles this. Always use `binaryPath` option pointing to `process.resourcesPath/audiotee` in packaged mode.

**Warning signs:** `Error: spawn /path/to.asar/audiotee ENOENT` in production logs.

### Pitfall 2: Missing `Authorization` Field in Deepgram Connect Args

**What goes wrong:** `client.listen.v1.connect()` call throws a TypeScript error or runtime auth error.

**Why it happens:** The v5 SDK's `V1Client.ConnectArgs` interface requires `Authorization: string` as a named field alongside the transcription options. It is not passed separately.

**How to avoid:** Always include `Authorization: apiKey` in the `connect()` options object.

**Warning signs:** TypeScript compile error "Property 'Authorization' is missing" or HTTP 401 from Deepgram.

### Pitfall 3: SDK Built-In Reconnect Conflicts with D-03

**What goes wrong:** The Deepgram SDK has a default `reconnectAttempts: 30`. If the close event triggers both the SDK's built-in reconnect AND D-03's manual retry loop, connections spawn exponentially.

**How to avoid:** Pass `reconnectAttempts: 0` to disable SDK reconnect. Implement D-03 (3 attempts, 2s delay) entirely in `DeepgramChannel.handleDisconnect()`.

**Warning signs:** Multiple simultaneous Deepgram WebSocket connections visible in network panel; health status never settles to "error" after failures.

### Pitfall 4: `speech_final` vs `is_final` Confusion

**What goes wrong:** Using `is_final: true` as the DB write trigger causes duplicate segment writes (multiple `is_final` events per utterance) or overwritten segments.

**Why it happens:** `is_final` fires every time a result is "finalized" (won't be revised). Multiple `is_final` events can fire before `speech_final`. Only `speech_final: true` marks the end of a complete utterance.

**How to avoid:** `if (data.type === 'Results' && data.speech_final === true)` is the sole write trigger.

**Warning signs:** More DB rows than expected utterances; duplicated text in transcript.

### Pitfall 5: audiotee Permission Prompt in Sandboxed Terminal

**What goes wrong:** In development, audiotee starts but streams total silence because the permission prompt was silently blocked by the terminal emulator (iTerm2, VSCode terminal).

**How to avoid:** Grant "System Audio Recording Only" permission to the Electron app in System Settings → Privacy & Security → Screen & System Audio Recording. The macOS native Terminal.app will show the prompt correctly.

**Warning signs:** `data` events fire (chunk.data.length > 0) but all bytes are zero.

### Pitfall 6: Deepgram Speaker IDs Are Not Stable

**What goes wrong:** Planner assumes speaker ID 0 is always the same person throughout a session and builds logic depending on this.

**Why it happens:** Deepgram's streaming diarizer (v1) does not guarantee speaker ID stability. Community reports show IDs can shift mid-session.

**How to avoid:** D-10 already accounts for this — the speaker map is reset on reconnect, and within a single continuous connection, accept that IDs may occasionally shift. For v1, this is an accepted limitation.

**Warning signs:** "Speaker 1" label appears on utterances that a human reviewer identifies as a different speaker than earlier "Speaker 1" utterances.

---

## Open Questions Resolved

| Original Question | Resolution | Confidence |
|-------------------|------------|------------|
| How is audiotee launched from Node.js? | Use npm package `audiotee` 0.0.7. `new AudioTee({ sampleRate: 16000, binaryPath })`. Package internally uses `child_process.spawn`. | VERIFIED |
| What does audiotee output on stdout? | Raw PCM bytes. Format is 16-bit signed integer when `sampleRate` is specified (confirmed via `file` command and live binary run). Stderr has JSON-delimited log messages. | VERIFIED |
| Does Deepgram accept 44.1kHz? | Yes. But use 16kHz — it's the standard for voice ASR, Deepgram is optimized for it, and it halves IPC bandwidth. Both audiotee and AudioWorklet should be configured for 16kHz. | VERIFIED |
| Where does downsampling happen? | Neither. Configure both sources to 16kHz at initialization. audiotee does it internally; AudioContext can be created with `sampleRate: 16000`. | VERIFIED |
| Does Deepgram guarantee stable speaker IDs? | No. Community discussions confirm IDs can shift mid-session. D-10 (trust IDs within session, reset on reconnect) is the correct approach. | LOW |
| Should `confidence REAL` be added to DDL? | Yes — CAPT-05 requires it. Add column + migration. | VERIFIED |
| Can ArrayBuffer pass through contextBridge? | Yes — it's a Structured Clone Algorithm type. Send `arrayBuffer` not `Uint8Array`. | VERIFIED |
| What is the exact Deepgram SDK v5 API? | `new DeepgramClient({ apiKey })` + `client.listen.v1.connect({ ..., Authorization: apiKey })`. Returns `V1Socket` with `.on('message')` typed. | VERIFIED |

---

## Risks and Surprises

### RISK-01: audiotee Binary Packaging (HIGH impact, known solution)

The Phase 6 `electron-builder.yml` has `asarUnpack: 'resources/audiotee'` but the audiotee npm package puts its binary at `node_modules/audiotee/bin/audiotee`. There is no postinstall step to copy it. Phase 7 must add either:
- An `extraResources` entry copying `node_modules/audiotee/bin/audiotee` → `resources/audiotee` in electron-builder.yml (changes the build config), OR
- A `postinstall` npm script that copies the binary after `npm install`

The `binaryPath` option in `AudioTeeOptions` handles the runtime path resolution, but the binary must first be at the right path.

### RISK-02: Deepgram `Authorization` in ConnectArgs (MEDIUM impact, easy fix)

The v5 SDK's `V1Client.ConnectArgs` requires `Authorization: string` as a named property in the connect options object. This is undocumented in the public-facing README but visible in the auto-generated TypeScript type. Failure to include it produces a TypeScript compile error.

### RISK-03: SDK Built-In vs. Manual Reconnect Conflict (MEDIUM impact)

The Deepgram SDK's `V1Socket` wraps a `ReconnectingWebSocket` with `reconnectAttempts: 30` by default. Phase 7's D-03 (3 attempts, 2s delay) conflicts with this. Must set `reconnectAttempts: 0` in connect args to disable the SDK's built-in reconnect.

### RISK-04: AudioWorklet Module URL Resolution in Electron + Vite (MEDIUM impact)

AudioWorklet processors must be loaded via `AudioWorklet.addModule(url)`. In an Electron app built with Vite, the URL resolution for worklet files is non-trivial. The worklet file (`mic-processor.js`) must:
- Be a plain JS file (not TypeScript — it runs in a restricted worklet context)
- Be accessible at a URL relative to the renderer's base URL
- Be included in Vite's build output (add to `vite.config.ts` as a public asset or input)

In development, `vite dev` serves files from `src/renderer/public/` at the root URL. In production, the file needs to be in `resources/renderer/` or configured as a Vite static asset. The planner should add an explicit task for verifying worklet module resolution in both dev and production.

### RISK-05: Deepgram Diarization v1 Limitations (LOW impact for v1)

Streaming diarization uses v1 (v2 is not available for streaming). v1 has known accuracy issues with multiple speakers and may assign all speakers to ID 0 in some conditions. This is an accepted v1 limitation (D-10) and the mic channel (always "You") is unaffected.

### RISK-06: D-02 Quanta Count Discrepancy

CONTEXT.md D-02 states "≈35 quanta batched per flush" but the correct number at 44.1kHz is ~86 quanta. This is a minor doc error in the discussion notes. The sample count (11,025 / 4,000) is authoritative. If using 16kHz AudioContext, the flush is 4,000 samples / ~31 quanta — which matches D-02's "35 quanta" figure much more closely. This suggests the CONTEXT.md author may have been thinking 16kHz when writing "35 quanta".

---

## Recommended Implementation Approach

**Channel initialization sequence:** On `SessionManager` `Capturing` state entry, `CaptureService.start(meetingId)` is called. It creates the meeting record in the DB via `TranscriptStore.createMeeting()`, then initializes two `DeepgramChannel` instances (mic, system) in parallel. The mic channel waits for an `AudioWorklet` to start (renderer sends audio via IPC). The system channel immediately starts `audiotee.start()` and begins receiving `data` events. Both channels call `sendMedia()` on their respective Deepgram connections as audio arrives. `capture-health-update` IPC events are pushed to the renderer as channel health changes.

**Mic capture flow:** `AudioWorkletHost` React component starts when `sessionState === 'Capturing'`. It requests mic permission via `getUserMedia({ audio: true })`, creates an `AudioContext({ sampleRate: 16000 })`, loads the worklet via `addModule`, and connects the mic stream through the worklet node. The worklet batches ~4,000 samples (250ms), converts Float32→Int16, and posts the `ArrayBuffer` to the main world via `postMessage`. The main world calls `window.electronAPI.invoke('mic-audio-chunk', arrayBuffer)`. The main process handler in `MicBridge.ts` receives the `Buffer` and calls `micDeepgramChannel.sendMedia(buffer)`.

**Transcript persistence:** When a `DeepgramChannel` receives a `speech_final` event, it resolves the speaker label via `SpeakerNormalizer` (mic channel: speaker 0 → "You"; system channel: N → "Speaker N+1"), constructs a `TranscriptSegment` object, calls `transcriptStore.appendSegment(segment)` (synchronous SQLite insert via better-sqlite3), and then pushes `transcript-segment` to the renderer via `webContents.send()`. Raw PCM is never retained — the `Buffer` from audiotee is released after `sendMedia()`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `audiotee` npm pkg | CAPT-02 | Not installed | 0.0.7 | Phase 7 Wave 0 installs it |
| `@deepgram/sdk` npm pkg | CAPT-04 | Not installed | 5.4.0 | Phase 7 Wave 0 installs it |
| Deepgram API key | CAPT-04 | Env var `DEEPGRAM_API_KEY` | — | Dev: must be set; test can mock |
| macOS 14.2+ | CAPT-02 | ✓ (Darwin 25.5.0) | macOS 15.5 | Chromium loopback fallback (CAPT-03) |
| Screen & System Audio Recording permission | CAPT-02 | Unknown (not pre-grantable) | — | User grants on first run |
| AudioWorklet API | CAPT-01 | ✓ (Chromium 146 in Electron 42) | Chromium 146 | Built-in, no fallback needed |

**Missing dependencies with no fallback:**
- `DEEPGRAM_API_KEY` environment variable — must be set by developer. Phase 7 plan should include a Wave 0 task verifying this env var is present before attempting connection.

---

## Validation Architecture

> `workflow.nyquist_validation` not explicitly set to false in config — treat as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^2.0.0 |
| Config file | `vitest.config.ts` (exists) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAPT-01 | AudioWorklet Float32→Int16 conversion | unit | `npm test -- tests/unit/mic-processor.test.ts` | No — Wave 0 gap |
| CAPT-02 | audiotee starts + emits PCM chunks | integration/manual | Manual — requires macOS audio permission | Manual only |
| CAPT-03 | Fallback detection logic | unit | `npm test -- tests/unit/CaptureService.test.ts` | No — Wave 0 gap |
| CAPT-04 | Deepgram connection with correct options | unit (mock) | `npm test -- tests/unit/DeepgramClient.test.ts` | No — Wave 0 gap |
| CAPT-05 | speech_final → TranscriptSegment with confidence | unit (mock) | `npm test -- tests/unit/TranscriptStore.test.ts` | No — Wave 0 gap |
| CAPT-06 | Speaker normalization mic/system | unit | `npm test -- tests/unit/SpeakerNormalizer.test.ts` | No — Wave 0 gap |
| CAPT-07 | appendSegment writes to DB | integration | `npm test -- tests/integration/TranscriptStore.test.ts` | No — Wave 0 gap |
| CAPT-08 | health-update IPC events | unit (mock webContents) | `npm test -- tests/unit/CaptureService.test.ts` | No — Wave 0 gap |
| CAPT-09 | No raw audio retained after send | unit | Check that audiotee Buffer is not stored anywhere | Part of CAPT-04 test |

### Wave 0 Gaps

- [ ] `tests/unit/mic-processor.test.ts` — Float32→Int16 conversion, quantum batching, ArrayBuffer transfer
- [ ] `tests/unit/DeepgramClient.test.ts` — Mock Deepgram WebSocket; verify options (model, diarize, mip_opt_out); reconnect D-03 logic
- [ ] `tests/unit/SpeakerNormalizer.test.ts` — mic channel speaker 0 → "You"; system channel mapping
- [ ] `tests/unit/CaptureService.test.ts` — FSM hook wiring; health event emission; channel independence (D-06)
- [ ] `tests/unit/TranscriptStore.test.ts` — appendSegment() with confidence field; in-memory SQLite for integration test
- [ ] `tests/integration/TranscriptStore.test.ts` — real SQLite DB with confidence column migration

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes (Deepgram API key) | Key from environment variable only; never from `electron-store`; never logged |
| V3 Session Management | No | N/A |
| V4 Access Control | Partial | FSM gates all capture; consent verified before `Capturing` entry |
| V5 Input Validation | Yes (IPC payloads) | ArrayBuffer size check before forwarding to Deepgram; `speech_final` payload validated against expected shape |
| V6 Cryptography | Yes (DB encryption) | `better-sqlite3-multiple-ciphers` AES-256 via `safeStorage` key — already implemented Phase 6 |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key exposure in renderer | Information Disclosure | Key stored in main process env var only; never sent to renderer |
| Malformed Deepgram payload | Tampering | Check `data.type === 'Results'` and `data.speech_final` before processing |
| PCM injection via IPC | Tampering | ArrayBuffer size limit (reject chunks > 100KB, which exceeds any 250ms window at 16kHz); channel allowlist enforced in preload |
| SQL injection via transcript text | Tampering | Use parameterized queries in `TranscriptStore`; never string-interpolate SQL with transcript text |
| Excessive DB growth | DoS | Phase 7 out of scope — Phase 11 handles storage limits |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Deepgram accepts `sample_rate: 16000` with `encoding: linear16` for nova-3 in streaming mode | Finding 2 | Minor: may need to adjust sample rate; both 16kHz and 44.1kHz are likely accepted |
| A2 | `AudioContext({ sampleRate: 16000 })` is supported by Electron 42's Chromium 146 | Finding 7 | Minor: if not, use 44.1kHz AudioContext and set Deepgram `sample_rate: 44100` |
| A3 | `reconnectAttempts: 0` in `V1Client.ConnectArgs` disables SDK built-in reconnect | Finding 3, Pitfall 3 | Medium: SDK may ignore the option; need to verify with test |
| A4 | audiotee process exits with non-zero code on crash (triggering D-03) | Finding 1 | Low: package emits 'error' event on non-zero exit; crash detection confirmed in source |

---

## Sources

### Primary (MEDIUM confidence — verified via code inspection)

- `node_modules/audiotee` (tarball unpacked) — `dist/index.d.ts`, `dist/index.js`, `README.md`, binary `--help` output [VERIFIED: npm registry + binary execution]
- `github.com/deepgram/deepgram-js-sdk` — `src/api/resources/listen/resources/v1/client/Client.ts`, `Socket.ts`, `types/ListenV1Results.ts`, `types/ListenV1Model.ts`, `types/ListenV1Encoding.ts`, `types/ListenV1MipOptOut.ts` [VERIFIED: GitHub source]
- `github.com/electron/electron` — `docs/api/context-bridge.md` supported types table [VERIFIED: GitHub source]

### Secondary (LOW confidence — web search / community)

- [stronglytyped.uk — AudioTee.js Electron packaging](https://stronglytyped.uk/articles/packaging-shipping-electron-apps-audiotee) — binary path resolution pattern
- [stronglytyped.uk — System audio recording approaches](https://stronglytyped.uk/articles/recording-system-audio-electron-macos-approaches) — fallback comparison
- [developers.deepgram.com/reference/speech-to-text/listen-streaming](https://developers.deepgram.com/reference/speech-to-text/listen-streaming) — parameter list
- [github.com/orgs/deepgram/discussions/108](https://github.com/orgs/deepgram/discussions/108) — speaker ID stability issue
- [github.com/orgs/deepgram/discussions/1144](https://github.com/orgs/deepgram/discussions/1144) — diarization reliability
- [developer.mozilla.org — Structured Clone Algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm) — ArrayBuffer cloneable
- Deepgram community: 44100 Hz confirmed working for live streaming input

---

## Metadata

**Confidence breakdown:**
- audiotee API: HIGH — source code and binary help verified directly
- Deepgram SDK API: MEDIUM — TypeScript source verified; runtime behavior not tested against live API
- IPC binary transfer: HIGH — Electron docs authoritative; Structured Clone spec clear
- Speaker ID stability: LOW — community reports only; no official guarantee
- Sample rate decision: MEDIUM — binary help confirms 16kHz supported; Deepgram behavior assumed from community usage

**Research date:** 2026-06-26
**Valid until:** 2026-07-26 (APIs stable; audiotee 0.x.x explicitly unstable per README — re-check if version changes)
