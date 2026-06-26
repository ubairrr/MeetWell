---
phase: 05
document: BUILD-ORDER
version: 1.0
status: final
requirements_covered: PRD-03
created: 2026-06-26
---

# MeetingAssist v1 — Dependency-Driven Build Order

## 1. Purpose

This document defines the recommended dependency-driven build phase sequence for the MeetingAssist build milestone. The build milestone planner reads this document and creates GSD phases from it.

The sequencing is not arbitrary — each phase depends on prior phase deliverables being in place. The rationale for each dependency is explicit so the planner understands which constraints are **hard** (cannot reorder without breaking dependencies) and which are **soft** (preferred order based on established patterns).

---

## 2. Guiding Strategy

**First shippable unit (D-19):** The highest technical risk in MeetingAssist is the dual-channel audio capture pipeline. The RSCH-04 spike validated both paths on an isolated test, but integrating `audiotee` + Deepgram Nova-3 dual-WebSocket into an Electron main process, with an AudioWorklet mic bridge from the renderer, is the most complex plumbing in the system. Everything else — artifact extraction, overlay UI, context engine, break assist — depends on a working transcript stream. Validating capture and persistence first eliminates the largest uncertainty in the build milestone before investing effort in downstream features. A build milestone that starts elsewhere and discovers a capture problem on Phase 4 has wasted three phases of work.

**Dependency-first sequencing (D-20):** The phase sequence follows dependency arrows — no phase begins until its dependencies are shippable (can be run end-to-end on a real meeting). Each phase produces one "shippable unit" that can be tested before proceeding. The non-obvious constraint is that **ArtifactPipeline (batch extraction) is sequenced before the Live Summary Board (Phase 4 overlay)**. The summary board reuses the same LLM adapter + Zod structured output + IPC push pattern as the ArtifactPipeline. Building the batch pipeline first establishes this pattern so that card generation follows cleanly in Phase 4. Reversing this order would require retrofitting the entire LLM → Zod → IPC chain after the UI is built.

---

## 3. Build Phase Summary Table

| Phase | Primary Deliverable | Key Dependencies | Risk Level |
|-------|--------------------|--------------------|------------|
| 1: Foundation & Scaffold | Electron app with overlay window, hardened IPC surface, SQLCipher DB, consent gate UI | None — greenfield | LOW |
| 2: Capture + TranscriptStore | Dual-channel audio capture, Deepgram Nova-3 dual-WebSocket, encrypted transcript persistence | Phase 1 (Electron app + DB + IPC) | **HIGH** |
| 3: ArtifactPipeline | End-of-meeting batch extraction, CitationValidator, ArtifactReview UI, .ics export | Phase 2 (transcript stream + LLM adapter pattern needed) | MEDIUM |
| 4: Overlay UI + Live Summary Board | Full session flow, SummaryCardTimer, LiveSummaryBoard, SessionManager FSM end-to-end | Phase 3 (LLM adapter + Zod + IPC pattern established) | MEDIUM |
| 5: ContextEngine + Break Assist | Full ContextEngine, EpochCompressor, BreakAssist end-to-end, 60-min meeting test | Phase 4 (SummaryCardStore + SummaryCardTimer in place) | MEDIUM |
| 6: Packaging + Eval Harness | Signed/notarized DMG, adversarial eval corpus, CGFS ≥ 0.85 / EHR ≤ 0.05 shipping gate | Phase 5 (complete pipeline needed for eval) | LOW–MEDIUM |

---

## 4. Build Phase Details

### Phase 1: Foundation & Scaffold

**Goal:** An Electron app launches, shows the consent gate overlay, opens a SQLCipher DB, and exposes the hardened contextBridge IPC surface — no audio capture yet.

**Primary deliverables:**
- Electron 41 (or 42 — re-verify at build time; both validated per RSCH-04 spike on 42) shell configured with correct `package.json` structure
- Overlay `BrowserWindow` configured per Architecture §9 (right-side panel, `NSWindowSharingNone` via `setContentProtection`, `always-on-top`, no dock icon)
- SQLCipher DB initialized with all 7 table DDLs (Architecture §8); `safeStorage` key generation on first run; DB open/close lifecycle in `src/main/store/db.ts`
- `sqlite-vec` extension loaded from `asar-unpacked` path immediately after DB open
- Hardened `contextBridge` allowlist wired (all 18 channels from Architecture §7; not yet connected to features — stubs return `undefined`)
- `ConsentGateScreen` component renders correctly in `PreCapture` state
- `App.tsx` skeleton with `useSessionState` hook; `SessionManager` FSM stub (Idle → PreCapture transition only)
- React 19 + Vite 7 dev build working; HMR operational
- `electron-builder` config: `hardenedRuntime: true`, `mac.entitlements` plist present (allow-jit, allow-unsigned-executable-memory), `asarUnpack` entries for `better-sqlite3-multiple-ciphers` `.node` and `audiotee` Swift binary

**Dependencies:** None — greenfield.

**Why this phase comes first:** This establishes the hosting container every other feature lives inside. No other phase can begin without an Electron app that can open a DB and communicate over a typed IPC surface. The consent gate skeleton must be in place before capture is wired (Phase 2), because the FSM guard is enforced from the moment capture logic exists.

**Risk level:** LOW — well-understood Electron setup; all key techniques are documented in DNA-CATALOGUE (Technique 3 for contextBridge, Technique 5 for overlay window).

**Key architecture modules implemented:**
- `src/main/index.ts` (app lifecycle, `createOverlayWindow`)
- `src/main/session/SessionManager.ts` (FSM skeleton)
- `src/main/store/db.ts` (DB open/close + SQLCipher key init)
- `src/preload/index.ts` (typed channel allowlist)
- `src/renderer/App.tsx` (root + `useSessionState`)
- `src/renderer/components/ConsentGate.tsx`
- `build/entitlements.mac.plist`

**Acceptance criteria:**
1. App launches from `npm run dev`; overlay appears on the right edge of the screen
2. `ConsentGateScreen` renders in `PreCapture` state; Start button is disabled until checkbox checked
3. SQLCipher DB opens without error; all 7 tables exist (verify via `db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()`)
4. `contextBridge` allowlist rejects invocations of channels not in the allowlist (test by calling an unlisted channel from DevTools console — should throw or return undefined)
5. `electron-builder --mac --dir` produces a `.app` bundle; app launches from the bundle without a DB error

---

### Phase 2: Capture + TranscriptStore

**Goal:** A real meeting can be started (after consent), both audio channels stream to Deepgram Nova-3, `speech_final` segments arrive with speaker labels, and the full transcript is persisted to the encrypted DB.

**Primary deliverables:**
- `audiotee` Core Audio Taps integration (macOS 14.2+); Swift binary in `asarUnpack`; `com.apple.security.cs.disable-library-validation` entitlement in plist
- Chromium loopback fallback path (macOS 15.0+ tested; triggered if macOS < 14.2 at startup)
- `AudioWorkletHost.tsx` — mic capture via AudioWorklet in renderer; PCM frames sent via `mic-audio-chunk` IPC to `CaptureService` in main (source: DNA Technique 1 adapted)
- `CaptureService` in main: receives mic PCM via IPC; streams `audiotee` PCM directly; routes both to `STTAdapter`
- `STTAdapter` — Deepgram Nova-3 dual-WebSocket connections (one per channel); `diarize: true`; `mip_opt_out: true` **hardcoded** at SDK client initialization
- `speech_final` accumulation state machine (DNA Technique 1): assembles final segments from streaming events
- `TranscriptStore` DB writes: `meetings` + `transcript_segments` tables populated as meeting progresses
- `capture-health-update` IPC: silence detection fires when either channel goes silent > 5 seconds
- `SessionManager` FSM wired: Idle → PreCapture → Capturing → Processing; `consent-confirmed` guard active
- Full 60-minute capture integration test: end-to-end capture of a real meeting; verify `transcript_segments` count is nonzero with correct speaker labels

**Dependencies:** Phase 1 — requires Electron app with DB open, IPC surface, consent gate, and SessionManager FSM skeleton.

**Why this phase comes second:** Audio capture is the highest technical risk in the system (RSCH-04 explicit finding). It depends only on Phase 1 (needs the DB to persist segments and the IPC surface for the mic AudioWorklet). All subsequent phases depend on a working transcript stream. Validate the hard part before investing in features.

**Risk level:** HIGH
- `audiotee` Swift binary requires `asarUnpack` + `disable-library-validation` entitlement; binary signing must be configured correctly
- Deepgram dual-WebSocket speaker ID spaces are completely independent (RSCH-02 anti-pattern to watch: mic Speaker 0 ≠ system audio Speaker 0)
- Mic channel `AudioWorklet` → IPC latency must be measured; frame accumulation logic must not lose audio
- Hardcoded `mip_opt_out: true` must be verified in the Deepgram SDK client before any other testing
- Silence detection must fire correctly on both macOS versions tested (14.2 and 15.0+)

**Key architecture modules implemented:**
- `src/main/capture/CaptureService.ts`
- `src/main/stt/STTAdapter.ts`
- `src/main/store/TranscriptStore.ts`
- `src/renderer/components/AudioWorkletHost.tsx`

**Acceptance criteria:**
1. `audiotee` captures system audio on macOS 14.2+ without triggering the purple screen-recording indicator
2. Mic `AudioWorklet` streams PCM frames to main process; `mic-audio-chunk` IPC events arrive at the expected sample rate
3. Both Deepgram WebSocket connections produce `speech_final` events with distinct speaker labels
4. `transcript_segments` table fills with rows during a real 10-minute meeting; `speaker_label` values include "You" for mic channel
5. `capture-health-update` IPC fires when audio goes silent on either channel

---

### Phase 3: ArtifactPipeline

**Goal:** At meeting end, the system runs batch map-reduce extraction over the full transcript, produces Zod-validated `MeetingArtifacts` proposals, and renders them in the ArtifactReview UI for user confirmation/dismissal.

**Primary deliverables:**
- `ArtifactPipeline` map-reduce: chunks transcript into 5-minute intervals; runs parallel LLM calls per chunk (AI-SPEC §2.8); merges results into `MeetingArtifactsSchema`
- Two-stage extraction per AI-SPEC §1.2: Stage 1 (evidence anchors — verbatim quotes); Stage 2 (constrained generation from Stage 1 quotes only)
- `CitationValidator`: ≥ 90% token overlap check between each citation quote and the actual transcript text; items failing are rejected before DB write
- `MeetingArtifactsSchema` Zod validation on Stage 2 output; LLM responses failing validation are retried once then surfaced as `extraction-failed`
- `ArtifactStore` DB writes: `artifacts` + `action_items` tables; all items `status: 'proposed'`
- `artifact-proposals-ready` IPC push to renderer on pipeline completion
- `ArtifactReview.tsx` + `ArtifactItem.tsx` + `CitationPanel.tsx` renderer components (confirm / edit / dismiss UX; "Verify" toggle for citations)
- `LLMAdapter` full implementation: `openai` SDK with `baseURL`; `zod-to-json-schema` for provider-agnostic schema delivery (both OpenAI `json_schema` strict and Gemini `responseJsonSchema` formats)
- Gemini paid-plan settings validation: `SettingsPanel` refuses to use Gemini without billing confirmation flag; warning banner rendered
- `CalendarExportService`: `.ics` file generation from confirmed action items; native file-save dialog
- `export-ics` IPC handler wired end-to-end
- `confirm-artifact`, `edit-artifact`, `dismiss-artifact` IPC handlers wired to `ArtifactStore` status updates

**Dependencies:** Phase 2 — transcript stream must exist and be persisted to the DB. The LLM adapter + Zod structured output + IPC push pattern established here is directly reused by Phase 4 (SummaryCard generation).

**Why this phase comes third (before the Live Summary Board):** Artifact extraction depends on the transcript (Phase 2). Building the batch pipeline before the live summary board establishes the Zod + LLM adapter pattern and the IPC event chain (main produces structured output → renderer receives and renders proposals). The summary board in Phase 4 reuses this exact pattern for `SummaryCards`. Building the summary board first would require retrofitting the entire LLM → Zod → IPC chain after the UI is built — the non-obvious constraint that must not be reversed.

**Risk level:** MEDIUM
- Two-stage extraction adds one extra LLM call per 5-minute chunk; parallel map calls must be rate-limit aware
- `CitationValidator` 90% token threshold may need calibration in practice; record rejection rates in test runs
- Gemini paid-plan validation: free-tier and paid-tier keys look identical at the API level; validation must be based on user confirmation flag in settings
- `.ics` RRULE edge cases (recurring events, timezone handling); use `ics` library, do not hand-roll

**Key architecture modules implemented:**
- `src/main/pipeline/ArtifactPipeline.ts`
- `src/main/pipeline/CitationValidator.ts`
- `src/main/llm/LLMAdapter.ts`
- `src/main/llm/EmbeddingAdapter.ts`
- `src/main/store/ArtifactStore.ts`
- `src/main/calendar/CalendarExportService.ts`
- `src/renderer/components/ArtifactReview.tsx`, `ArtifactItem.tsx`, `CitationPanel.tsx`
- `src/renderer/components/SettingsPanel.tsx` (Gemini paid-plan warning)

**Acceptance criteria:**
1. End-of-meeting run on a 30-minute test transcript produces `MeetingArtifactsSchema`-validated output in < 120 seconds
2. All extracted items have `status: 'proposed'`; zero items have any other status in the DB after pipeline run
3. `CitationValidator` rejects at least one item in a synthetic test with a fabricated citation (verify rejection event fires)
4. User confirms an action item → DB row `status` updates to `'confirmed'`; item appears in `.ics` export
5. `.ics` file is generated, downloadable via file-save dialog, and importable into Apple Calendar

---

### Phase 4: Overlay UI + Live Summary Board

**Goal:** The overlay UI is fully functional during a live meeting: consent gate collects consent, the `SessionManager` FSM drives all state transitions end-to-end, and 5-minute `SummaryCards` stack on the overlay in real time.

**Primary deliverables:**
- `SummaryCardTimer` (5-minute interval, fires `CardLLMCaller` in `ContextEngine`)
- `CardLLMCaller` (generates `SummaryCardSchema` Zod-validated card using LLM adapter; reuses same provider-agnostic pattern from Phase 3)
- `SummaryCardStore` DB writes (`summary_cards` table)
- `summary-card-ready` IPC push to renderer
- `LiveSummaryBoard.tsx` + `SummaryCard.tsx` renderer components: receive IPC pushes; stack cards with most-recent at top
- `SessionManager` FSM fully wired end-to-end: all 6 states + all 7 transitions active (consent gate → Capturing → OnBreak → Processing → Complete → Idle)
- Full overlay layout polish: mouse event toggle (click-through by default; interactive on hover); side panel sizing and positioning
- `capture-health-update` visual status indicator in overlay
- `SettingsPanel` complete: provider config, non-sensitive prefs via `electron-store`; Gemini paid-plan warning banner

**Dependencies:** Phase 3 — the LLM adapter and Zod structured output + IPC push pattern must be established and tested before Phase 4 reuses it for card generation. Additionally, the full `ArtifactReview` state flow (Phase 3) completes the `Processing → Complete → Idle` FSM path needed for the full session flow test.

**Why this phase comes fourth:** The summary board card generation uses the identical LLM adapter + Zod structured output + IPC push pattern established in Phase 3 for `ArtifactPipeline`. After Phase 3, the pattern is verified end-to-end with real LLM calls. Phase 4 reuses it without risk of design misfit. The `ContextEngine`'s `SummaryCardTimer` built in Phase 4 is also the prerequisite infrastructure that Phase 5 extends with rolling window and epoch compression.

**Risk level:** MEDIUM
- `SummaryCardTimer` accuracy across long meetings (timer drift; ensure it fires at wall-clock intervals, not CPU-relative)
- Overlay mouse event toggle UX: the click-through / interactive toggle must not cause accidental interactions or missed clicks
- `setContentProtection` compatibility: verify it correctly prevents the overlay from appearing in Zoom, Google Meet, and Teams screen-shares on the target macOS versions
- Gemini paid-plan warning banner UX: must be clear and non-dismissable without explicit confirmation

**Key architecture modules implemented:**
- `src/main/context/SummaryCardTimer.ts` + `CardLLMCaller` (partial ContextEngine)
- `src/main/store/SummaryCardStore.ts`
- `src/renderer/components/LiveSummaryBoard.tsx`
- `src/renderer/components/SummaryCard.tsx`
- `src/renderer/components/SettingsPanel.tsx` (complete)

**Acceptance criteria:**
1. A `SummaryCard` appears in the overlay every 5 minutes during a live meeting; card shows topic headline + at least 3 key points
2. `summary-card-ready` IPC event arrives in the renderer within 30 seconds of the 5-minute interval boundary
3. `SessionManager` FSM transitions end-to-end from `ConsentGate` → `Capturing` → `End Meeting` → `ArtifactReview` → `Idle` in a single test session without errors
4. Overlay overlay click-through: clicking the desktop behind the overlay works normally when in passive mode; overlay becomes interactive when cursor enters the panel
5. `setContentProtection(true)` prevents overlay from appearing in a Zoom screen-share test on macOS 14.2+

---

### Phase 5: ContextEngine + Break Assist

**Goal:** The full `ContextEngine` is operational (rolling window, `TokenMonitor`, `EpochCompressor`, `ContextComposer`); Break Assist works end-to-end; the app handles a 60-minute+ meeting without context overflow.

**Primary deliverables:**
- `RollingWindow` with `tiktoken cl100k_base` token counting; 800K token ceiling; evicts oldest segments on overflow
- `TokenMonitor`: fires `EpochCompressor` at 560K token threshold
- `EpochCompressor`: reads from `transcript_segments` ONLY — **never from `summary_cards`** (AI-SPEC §2.2 Pitfall 4); evicts oldest segments (lowest timestamp); persists epoch to `epoch_summaries` table; embeds epoch via `EmbeddingAdapter` and stores in `vec_chunks`
- `ContextComposer`: assembles context window (rolling segments + epoch summaries) for LLM calls
- `EmbeddingAdapter` implementation: `text-embedding-3-small` (OpenAI) primary; Gemini embedding model fallback when no OpenAI key configured
- `BreakAssistPanel.tsx` + `BreakAssistDigest.tsx` renderer components
- `start-break` / `end-break` IPC handlers wired to `SessionManager` FSM
- `break-assist-digest-ready` IPC: digest generated from `SummaryCardStore.getCardsSince(meetingId, breakStartSeconds)` + LLM summary call
- Full 60-minute+ meeting end-to-end test: verify `EpochCompressor` fires at the correct token threshold; verify context window remains under 800K ceiling at meeting end

**Dependencies:** Phase 4 — `SummaryCardTimer` and `SummaryCardStore` must be in place (break assist digest queries `SummaryCardStore` for cards missed during the break). `EpochCompressor` depends on `transcript_segments` (Phase 2 writes these) and `SummaryCardStore` exists from Phase 4 for the `getCardsSince` query.

**Why this phase comes fifth:** `ContextEngine` depends on both `transcript_segments` (Phase 2) and `SummaryCards` (Phase 4). Break Assist needs `SummaryCardStore` to query cards missed during the break. The `EpochCompressor` is the most complex piece of the `ContextEngine` — sequenced after the simpler `SummaryCardTimer` (Phase 4) validates the basic card-generation flow, reducing integration risk.

**Risk level:** MEDIUM
- `EpochCompressor` must never read from `summary_cards` — use code review to verify the data source explicitly (AI-SPEC §2.2 Pitfall 4)
- `tiktoken` initialization and `cl100k_base` encoding correctness: test against known token counts from the OpenAI tokenizer playground
- 60-minute meeting performance: measure memory usage and token counting overhead at the 60-minute mark
- Embedding provider fallback when no OpenAI key is configured: verify `EmbeddingAdapter` falls back to Gemini embedding model without error (Open Question 2 from RESEARCH.md)

**Key architecture modules implemented:**
- `src/main/context/ContextEngine.ts`
- `src/main/context/RollingWindow.ts`
- `src/main/context/TokenMonitor.ts`
- `src/main/context/EpochCompressor.ts`
- `src/main/context/ContextComposer.ts`
- `src/main/store/SummaryCardStore.ts` (additive: `saveEpoch` method)
- `src/renderer/components/BreakAssistPanel.tsx`
- `src/renderer/components/BreakAssistDigest.tsx`

**Acceptance criteria:**
1. `ContextEngine` processes a 60-minute test transcript (simulated via replayed `transcript_segments`) without exceeding the 800K token ceiling
2. `EpochCompressor` fires exactly once at the 560K token threshold in the 60-minute test; produces one `epoch_summaries` DB record
3. Break Assist digest renders the correct cards missed (cards generated between `break_start_timestamp` and `end-break` IPC) in a test with a simulated 15-minute break
4. `ContextComposer.getContext()` returns a valid `ContextWindow` (rolling segments + epoch summaries) for a post-break LLM test call
5. `EmbeddingAdapter` stores at least one epoch embedding in `vec_chunks` during the 60-minute test

---

### Phase 6: Packaging + Eval Harness

**Goal:** The app is packaged, signed, notarized, and passes the adversarial eval harness faithfulness gates (CGFS ≥ 0.85, EHR ≤ 0.05) before declaring v1 shippable.

**Primary deliverables:**
- `electron-builder` configuration complete: `hardenedRuntime: true`; `mac.entitlements` + `entitlementsInherit` plist with `allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation` (required for `audiotee` Swift binary)
- `@electron/notarize` via `notarytool` (`altool` is deprecated since late 2023); `afterSign` hook with `APPLE_ID` / `APPLE_ID_PASSWORD` (app-specific) / `APPLE_TEAM_ID` env vars
- `asarUnpack` configured for both `better-sqlite3-multiple-ciphers` `.node` and `audiotee` Swift binary; both individually code-signed
- Adversarial eval corpus: 60 `AdversarialTestCase` JSON files, 8 categories per AI-SPEC §3.3; seeded incrementally from Phase 3 onward (do not wait until Phase 6 to start seeding)
- `eval/harness.ts` standalone runner (not part of Vitest; runs independently of the Electron app)
- **Shipping gate:** `node eval/harness.ts` must report CGFS ≥ 0.85 and EHR ≤ 0.05 before v1 is declared shippable (AI-SPEC §3)
- macOS startup minimum-version check: app shows a clear error and exits if macOS < 14.2 on launch
- Capture permission onboarding UX: if "System Audio Recording" or "Microphone" TCC permission is denied, overlay shows instructions with a deep-link button to System Preferences

**Dependencies:** Phase 5 — complete pipeline needed for the eval harness to run meaningfully; packaging requires all native binaries in their final form (`audiotee`, `better-sqlite3-multiple-ciphers`).

**Why this phase comes last:** Packaging must come last because the hardened runtime and `asarUnpack` configuration can interfere with native module loading during development (e.g., `disable-library-validation` entitlement changes how the OS loads the `audiotee` binary). The eval harness requires the full end-to-end pipeline (Phases 2–5) to exercise meaningfully. Running it earlier would test an incomplete pipeline against a corpus designed for a complete one.

**Risk level:** LOW–MEDIUM
- Apple notarization turnaround time: typically < 10 minutes but Apple service delays are possible; build in retry budget
- `disable-library-validation` entitlement requires explicit justification in App Store review if ever submitted; document the reason (required for `audiotee` Swift binary)
- CGFS/EHR gate may require prompt tuning passes before passing; budget time for 2–3 iteration cycles

**Key architecture modules implemented:**
- `build/entitlements.mac.plist` (complete + signed)
- `eval/corpus/` (60 test cases)
- `eval/harness.ts` (CGFS + EHR measurement)
- `package.json` (electron-builder config, notarize hook, asarUnpack)

**Acceptance criteria:**
1. `electron-builder --mac` succeeds with no errors; DMG produced
2. Notarization completes without error; app passes `spctl --assess --verbose` on the DMG
3. App launches from DMG on a fresh macOS 14.2+ machine without a DB error or entitlement error
4. `audiotee` system audio capture works in the packaged app without a `disable-library-validation` entitlement error
5. `node eval/harness.ts` reports CGFS ≥ 0.85 and EHR ≤ 0.05 on the 60-transcript corpus

---

## 5. Dependency Chain Summary

The dependency arrow indicates what the phase produces that the next phase requires at runtime:

```
Phase 1: Foundation & Scaffold
    │ (Electron app + overlay window + IPC surface + SQLCipher DB + consent gate skeleton)
    ↓
Phase 2: Capture + TranscriptStore          ← HIGHEST RISK — validate first
    │ (working dual-channel transcript stream + persistence)
    ↓
Phase 3: ArtifactPipeline
    │ (LLM adapter + Zod structured output + IPC push pattern established and tested)
    ↓
Phase 4: Overlay UI + Live Summary Board
    │ (SummaryCardTimer + SummaryCardStore in place; full FSM session flow)
    ↓
Phase 5: ContextEngine + Break Assist
    │ (complete end-to-end pipeline; 60-min meeting validated)
    ↓
Phase 6: Packaging + Eval Harness           ← QUALITY GATE before ship
```

**The non-obvious constraint that must not be reversed:**

> Phase 3 (ArtifactPipeline) is sequenced **before** Phase 4 (Live Summary Board), not after. The summary board card generation uses the same LLM adapter + Zod schema → IPC push pattern as the `ArtifactPipeline`. Building the batch pipeline in Phase 3 establishes and validates this pattern before Phase 4 reuses it for `SummaryCards`. Reversing this order would require retrofitting the entire LLM → Zod → IPC chain after the UI is built — a non-trivial re-plumbing that costs more than the initial correct ordering.

---

## 6. Constraints and Notes for the Build Planner

- **Electron version:** Re-verify and pin at build milestone start. `CLAUDE.md` recommends Electron 41 LTS; the RSCH-04 spike ran on Electron 42.5.0 successfully. Both are acceptable; pin to the current LTS at build time per SETUP-03 posture. Do not pin to a version without re-verifying.

- **`mip_opt_out: true` must be hardcoded** at Deepgram SDK client initialization in Phase 2. It must not be a user-configurable setting. This is a product-level commitment (DEC-02). Verify this before any Deepgram integration testing begins.

- **Gemini free tier is disqualified** for meeting data. The settings validator (Phase 3) must refuse to enable Gemini without a billing confirmation flag. See RSCH-03. Free-tier and paid-tier keys look identical at the API level — validation depends on the user's explicit confirmation.

- **Consent gate FSM guard** must be enforced in the Electron main process in Phase 1 (as a stub) before capture is wired. Phase 2 connects the full capture; the FSM guard must already be in place so no capture can be started by bypassing the UI.

- **`asarUnpack` must be configured from Phase 2 onward** for both `better-sqlite3-multiple-ciphers` `.node` and the `audiotee` Swift binary. Failing to configure `asarUnpack` causes module load errors in packaged builds — a failure that only surfaces at Phase 6 packaging if not configured earlier.

- **EpochCompressor source:** Must read from `transcript_segments`, NOT `summary_cards`. This is an explicit anti-pattern documented in AI-SPEC §2.2 Pitfall 4. Phase 5 implementation must be verified against this constraint with a targeted code review.

- **Eval harness corpus seeding** should begin in Phase 3 as real meeting transcripts become available from integration testing. Waiting until Phase 6 to seed the 60-transcript corpus creates last-minute risk. Seed incrementally from Phase 3 onward — even 5 test cases per phase keeps the corpus growing.

---

## 7. Cross-References

| Document | Relationship | Link |
|----------|-------------|------|
| 05-FEATURE-SPEC.md | Feature scope being implemented by this build order | [./05-FEATURE-SPEC.md](./05-FEATURE-SPEC.md) |
| 05-ARCHITECTURE.md | Architecture specification this build order implements | [./05-ARCHITECTURE.md](./05-ARCHITECTURE.md) |
| 05-PRD.md | Executive hub document | [./05-PRD.md](./05-PRD.md) |
| 04-AI-SPEC.md | Faithfulness contract; eval harness specification (§3); ContextEngine architecture (§2) | [../04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md](../04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md) |
| 03-RSCH-04-SPIKE-REPORT.md | Audio capture spike results; risk rationale for Phase 2 ordering | [../03-deep-research/03-RSCH-04-SPIKE-REPORT.md](../03-deep-research/03-RSCH-04-SPIKE-REPORT.md) |
