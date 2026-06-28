# Roadmap: MeetingAssist — Build Milestone (v2.0)

## Overview

This is the **build milestone**: it ships MeetingAssist v1 — a working, packaged, notarized macOS app that captures dual-channel meeting audio, persists an encrypted transcript, produces trustworthy citation-backed artifacts, shows a live summary board, handles breaks, and passes the adversarial faithfulness eval gate before declaring v1 shippable. All architectural decisions are locked in the PRD documents from the previous milestone. The journey follows a strict dependency chain: stand up the hosting container and consent gate (Phase 6); validate the highest-risk plumbing — dual-channel audio capture and transcript persistence (Phase 7); build the batch artifact pipeline that establishes the LLM → Zod → IPC pattern (Phase 8); layer in the full overlay UI and live summary board reusing that pattern (Phase 9); complete the context engine and break assist (Phase 10); package, notarize, and gate on eval harness results (Phase 11).

Phase numbering continues from the Discovery & PRD milestone (Phases 1–5).

## Phases

**Phase Numbering:**

- Integer phases (6, 7, 8…): Planned milestone work
- Decimal phases (7.1, 7.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 6: Foundation & Scaffold** - Electron app shell, overlay window, SQLCipher DB, hardened IPC, consent gate, SessionManager FSM skeleton
- [x] **Phase 7: Capture + TranscriptStore** - Dual-channel audio capture (audiotee primary / Chromium fallback), Deepgram Nova-3 dual-WebSocket, encrypted transcript persistence
- [ ] **Phase 8: ArtifactPipeline** - End-of-meeting batch extraction, CitationValidator, ArtifactReview UI, .ics export, LLM adapter
- [ ] **Phase 9: Overlay UI + Live Summary Board** - Full session flow, SummaryCardTimer, LiveSummaryBoard, SessionManager FSM end-to-end, settings panel
- [ ] **Phase 10: ContextEngine + Break Assist** - Full ContextEngine, EpochCompressor, BreakAssist, 60-minute meeting test
- [ ] **Phase 11: Packaging + Eval Harness** - Signed/notarized DMG, adversarial eval corpus, CGFS ≥ 0.85 / EHR ≤ 0.05 shipping gate

## Phase Details

### Phase 6: Foundation & Scaffold

**Goal**: An Electron app launches, shows the consent gate overlay, opens a SQLCipher DB, and exposes the hardened contextBridge IPC surface — no audio capture yet.
**Depends on**: Nothing (first phase of this milestone)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06, FOUND-07, FOUND-08, FOUND-09
**Success Criteria** (what must be TRUE):

  1. App launches from `npm run dev` and the overlay panel appears on the right edge of the screen as always-on-top, dock-icon-free, and hidden from screen-share
  2. `ConsentGateScreen` renders in `PreCapture` state; the Start button is visibly disabled until the disclosure checkbox is checked
  3. SQLCipher DB opens without error on first launch; all 7 tables exist and the `sqlite-vec` extension loads from its `asarUnpack` path
  4. Any unlisted channel invoked from the renderer against the contextBridge allowlist is rejected — the 18 typed channels are stubbed and present
  5. electron-builder config, entitlements plist, and asarUnpack entries are in place (packaging smoke test deferred to Phase 11 — no point verifying a bundle until the full app is built)

**Plans**: 7 plans
Plans:

- [ ] 06-01-PLAN.md — Project scaffold: electron-vite + React 19 + Vite 7 + pinned deps + Vitest harness
- [ ] 06-02-PLAN.md — DB initialization: safeStorage key, SQLCipher, sqlite-vec, all 7 DDLs + DB tests
- [ ] 06-03-PLAN.md — Overlay window + app lifecycle: createOverlayWindow(), dock.hide(), content protection
- [ ] 06-04-PLAN.md — contextBridge allowlist: 18 typed channels (6 listen + 12 invoke) with rejection guard
- [ ] 06-05-PLAN.md — SessionManager FSM + IPC wiring: Idle→PreCapture, consent guard, 12 stub handlers
- [ ] 06-06-PLAN.md — ConsentGate component + App.tsx skeleton with useSessionState hook
- [x] 06-07-PLAN.md — electron-builder config + asarUnpack + entitlements plist (smoke test deferred to Phase 11)

**UI hint**: yes

### Phase 7: Capture + TranscriptStore

**Goal**: A real meeting can be started after consent, both audio channels stream to Deepgram Nova-3, `speech_final` segments arrive with speaker labels, and the full transcript is persisted to the encrypted DB.
**Depends on**: Phase 6
**Requirements**: CAPT-01, CAPT-02, CAPT-03, CAPT-04, CAPT-05, CAPT-06, CAPT-07, CAPT-08, CAPT-09
**Success Criteria** (what must be TRUE):

  1. `audiotee` 0.0.7 captures system audio on macOS 14.2+ without triggering the persistent purple screen-recording indicator; Chromium loopback activates as fallback when audiotee is unavailable
  2. Mic AudioWorklet PCM frames arrive at the main process via the `mic-audio-chunk` IPC channel at the expected sample rate
  3. Both Deepgram WebSocket connections produce `speech_final` events with distinct speaker labels; mic channel always shows "You", system audio shows Speaker 1, Speaker 2, …
  4. `transcript_segments` table fills with rows during a real 10-minute meeting; `mip_opt_out: true` is hardcoded at SDK client initialization and verifiable
  5. Capture health status (silent / healthy / error) for both channels is visible in the overlay UI in real time; raw audio is discarded after each transcription batch

**Plans**: 7 plans
Plans:

- [ ] 07-01-PLAN.md — DB migration (confidence REAL column) + TranscriptStore
- [ ] 07-02-PLAN.md — DeepgramClient single-channel WebSocket wrapper + SpeakerNormalizer
- [ ] 07-03-PLAN.md — audiotee system audio source + packaging (extraResources)
- [ ] 07-04-PLAN.md — AudioWorklet mic bridge: Float32→Int16, MicCapture module
- [ ] 07-05-PLAN.md — CaptureService: orchestrate both channels, health, FSM hooks
- [ ] 07-06-PLAN.md — CapturingScreen UI: two-dot health bar + Stop Meeting button
- [ ] 07-07-PLAN.md — Main process wiring: replace stubs, instantiate CaptureService

**UI hint**: yes

### Phase 8: ArtifactPipeline

**Goal**: At meeting end, the system runs two-stage batch extraction over the full transcript, produces Zod-validated artifact proposals, and renders them in the ArtifactReview UI for user confirmation or dismissal.
**Depends on**: Phase 7
**Requirements**: ART-01, ART-02, ART-03, ART-04, ART-05, ART-06, ART-07, ART-08, ART-09, ART-10, ART-11
**Success Criteria** (what must be TRUE):

  1. End-of-meeting run on a 30-minute test transcript produces `MeetingArtifactsSchema`-validated MOM, key points, summary, and action items in under 120 seconds; Stage 1 reads from `transcript_segments` only, Stage 2 is constrained to Stage 1 quotes
  2. All extracted items have `status: 'proposed'` in the DB immediately after the pipeline run; zero items have any other status
  3. CitationValidator rejects a synthetic item with a fabricated citation (90% token overlap threshold enforced); invalid LLM responses are retried, not silently accepted
  4. User confirms an action item → DB row status updates to `'confirmed'`; item appears in a `.ics` file that is importable into Apple Calendar
  5. ArtifactReview UI shows each proposed item with a "Verify" toggle that reveals the verbatim quote anchor; user can confirm, edit, or dismiss each item

**Plans**: TBD
**UI hint**: yes

### Phase 9: Overlay UI + Live Summary Board

**Goal**: The overlay UI is fully functional during a live meeting: the SessionManager FSM drives all state transitions end-to-end, and 5-minute SummaryCards stack on the overlay in real time.
**Depends on**: Phase 8
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06
**Success Criteria** (what must be TRUE):

  1. A `SummaryCard` appears in the overlay every 5 minutes during a live meeting; each card shows a topic headline and at least 3 key points; the `summary-card-ready` IPC event arrives in the renderer within 30 seconds of the 5-minute interval boundary
  2. SessionManager FSM transitions end-to-end from ConsentGate → Capturing → End Meeting → ArtifactReview → Idle in a single test session without errors
  3. `LiveSummaryBoard` stacks all generated cards with the newest at top; all IPC calls from the renderer use the typed contextBridge allowlist with no raw `ipcRenderer` exposed
  4. Overlay click-through works: clicking the desktop behind the overlay operates normally in passive mode; the overlay becomes interactive when the cursor enters the panel
  5. `setContentProtection(true)` prevents the overlay from appearing in a Zoom screen-share test on macOS 14.2+

**Plans**: 6/7 plans executed
Plans:

- [x] 09-01-PLAN.md — SummaryCardSchema + SummaryCardStore
- [x] 09-02-PLAN.md — SummaryCardTimer + Main Process Wiring + Bug Fixes
- [x] 09-03-PLAN.md — LiveSummaryBoard + SummaryCard Components
- [x] 09-04-PLAN.md — AudioWorkletHost Extraction + App.tsx Board View Wiring
- [x] 09-05-PLAN.md — BreakAssistPanel + BreakAssistDigest + App.tsx Break Flow
- [x] 09-06-PLAN.md — SettingsPanel + safeStorage + electron-store
- [ ] 09-07-PLAN.md — Integration Verification + Polish

**UI hint**: yes

### Phase 10: ContextEngine + Break Assist

**Goal**: The full ContextEngine is operational (rolling window, TokenMonitor, EpochCompressor, ContextComposer); Break Assist works end-to-end; the app handles a 60-minute+ meeting without context overflow or memory pressure.
**Depends on**: Phase 9
**Requirements**: CTX-01, CTX-02, CTX-03, CTX-04, CTX-05, CTX-06
**Success Criteria** (what must be TRUE):

  1. ContextEngine processes a 60-minute test transcript without exceeding the 800K token ceiling; EpochCompressor fires exactly once at the 560K token threshold and produces one `epoch_summaries` DB record
  2. EpochCompressor reads exclusively from `transcript_segments` — not `summary_cards` — as verified by code review
  3. Break Assist digest renders the correct cards missed (cards generated between break_start and end-break IPC) in a test with a simulated 15-minute break
  4. `ContextComposer.getContext()` returns a valid `ContextWindow` (rolling segments + epoch summaries) for a post-break LLM test call; at least one epoch embedding is stored in `vec_chunks`
  5. SessionManager FSM transitions correctly through the `Capturing → OnBreak → Capturing` cycle; summary cards continue to be generated from `transcript_segments` context during the break window

**Plans**: 2/7 plans executed

Plans:

- [x] 10-01-PLAN.md — EpochSummarySchema + RollingWindow + TokenMonitor (schema, watermark, tiktoken polling)
- [x] 10-02-PLAN.md — EmbeddingAdapter with Gemini dimension probe checkpoint
- [ ] 10-03-PLAN.md — EpochCompressor (LLM compression, epoch_summaries write, vec_chunks embed)
- [ ] 10-04-PLAN.md — ContextComposer + ContextEngine (orchestrator wrapping SummaryCardTimer)
- [ ] 10-05-PLAN.md — Main process wiring (ContextEngine replaces SummaryCardTimer in index.ts)
- [ ] 10-06-PLAN.md — 60-minute Vitest test (CTX-06 compression pipeline assertions)
- [ ] 10-07-PLAN.md — CTX-04/CTX-05 verification tests (OnBreak FSM + break digest filter)

### Phase 11: Packaging + Eval Harness

**Goal**: The app is packaged, signed, notarized, and passes the adversarial eval harness faithfulness gates (CGFS ≥ 0.85, EHR ≤ 0.05) before declaring v1 shippable.
**Depends on**: Phase 10
**Requirements**: PACK-01, PACK-02, PACK-03, PACK-04, PACK-05
**Success Criteria** (what must be TRUE):

  1. `electron-builder --mac` succeeds with no errors; a signed and notarized DMG is produced; app passes `spctl --assess --verbose` on the DMG
  2. App launches from the DMG on a fresh macOS 14.2+ machine without a DB error or entitlement error; macOS version check shows a clear error and exits on macOS < 14.2
  3. `audiotee` system audio capture works in the packaged app; `asarUnpack` includes both `better-sqlite3-multiple-ciphers` `.node` and `audiotee` Swift binary; native module ABI matches Electron's Node version (rebuild against Electron ABI before packaging, not system Node)
  3a. Packaging smoke test (deferred from Phase 6): `electron-builder --mac --dir` produces a `.app` bundle that launches without a DB error or entitlement error

  4. `node eval/harness.ts` reports CGFS ≥ 0.85 on the 60-transcript adversarial corpus
  5. `node eval/harness.ts` reports EHR ≤ 0.05 on the 60-transcript adversarial corpus — both PACK-04 and PACK-05 must pass before v1 is declared shippable

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in dependency order: 6 → 7 → 8 → 9 → 10 → 11

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 6. Foundation & Scaffold | 7/7 | Complete | 2026-06-26 |
| 7. Capture + TranscriptStore | 7/7 | Complete | 2026-06-27 |
| 8. ArtifactPipeline | 0/TBD | Not started | - |
| 9. Overlay UI + Live Summary Board | 6/7 | In Progress|  |
| 10. ContextEngine + Break Assist | 2/7 | In Progress|  |
| 11. Packaging + Eval Harness | 0/TBD | Not started | - |
