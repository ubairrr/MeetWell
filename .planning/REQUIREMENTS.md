# Requirements: MeetingAssist v2.0 Build

**Defined:** 2026-06-26
**Core Value:** A user walks out of any meeting with an accurate, trustworthy record and a ready-to-act set of artifacts — minutes, decisions, action items, dates — without having taken a single note.

**PRD source documents:**

- Feature scope: `.planning/phases/05-prd-finalization/05-FEATURE-SPEC.md` (D-01–D-10)
- Module interfaces: `.planning/phases/05-prd-finalization/05-ARCHITECTURE.md`
- Build order: `.planning/phases/05-prd-finalization/05-BUILD-ORDER.md`
- AI faithfulness contract: `.planning/phases/04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md`

---

## v1 Requirements

### Foundation (App Shell)

- [ ] **FOUND-01**: App launches from `npm run dev` and displays an overlay panel on the right edge of the screen
- [ ] **FOUND-02**: Overlay window is always-on-top (`screen-saver` level), has no dock icon, and is hidden from the user's own screen-share via `setContentProtection(true)`
- [ ] **FOUND-03**: SQLCipher AES-256 DB opens successfully on first launch; `safeStorage` generates and stores the encryption key in macOS Keychain
- [ ] **FOUND-04**: All 7 DB tables are created on first launch (`meetings`, `transcript_segments`, `artifacts`, `action_items`, `vec_chunks`, `summary_cards`, `epoch_summaries`)
- [ ] **FOUND-05**: `sqlite-vec` extension loads from `asarUnpack` path immediately after DB open
- [ ] **FOUND-06**: Hardened `contextBridge` allowlist is wired with all 18 typed channels; any unlisted channel invocation from the renderer is rejected
- [ ] **FOUND-07**: `SessionManager` FSM enforces the `Idle → PreCapture` transition and blocks `PreCapture → Capturing` until the consent event is received from the main process
- [ ] **FOUND-08**: Consent gate UI (`ConsentGateScreen`) renders in `PreCapture` state; Start button is disabled until the disclosure checkbox is checked
- [ ] **FOUND-09**: `electron-builder --mac --dir` produces a `.app` bundle that launches without a DB error

### Capture + Transcript

- [x] **CAPT-01**: Microphone audio is captured via Web Audio API AudioWorklet in the renderer and PCM frames are streamed to the main process via IPC
- [x] **CAPT-02**: System audio is captured via `audiotee` 0.0.7 (Core Audio Taps, macOS 14.2+ primary path) without triggering the persistent purple screen-recording indicator
- [x] **CAPT-03**: Chromium loopback flags serve as fallback system audio capture when `audiotee` is unavailable (macOS 15.0+ tested); capture health status reflects the active path. **Note:** Chromium loopback fallback — health status reflects error state; actual loopback capture is a documented v1 limitation requiring renderer action.
- [x] **CAPT-04**: Both audio channels stream independently to separate Deepgram Nova-3 WebSocket connections with `diarize: true` and `mip_opt_out: true` hardcoded
- [x] **CAPT-05**: Each Deepgram `speech_final` event produces a `TranscriptSegment` record with speaker label, timestamps, channel ID, and confidence score
- [x] **CAPT-06**: Mic channel always labels speaker 0 as "You"; system audio channel assigns Speaker 1, Speaker 2, … sequentially (v1 cap: 8 speakers)
- [x] **CAPT-07**: Every `TranscriptSegment` is persisted to the encrypted `transcript_segments` table as it arrives
- [x] **CAPT-08**: Capture health status (silent / healthy / error) for both channels is surfaced in the overlay UI in real time
- [x] **CAPT-09**: Raw audio is discarded immediately after each transcription batch — only the text transcript is retained

### Artifact Pipeline

- [x] **ART-01**: At meeting end, Stage 1 extraction produces verbatim quote anchors from the `transcript_segments` table (never from `summary_cards`)
- [x] **ART-02**: Stage 2 generation produces structured artifact content constrained to Stage 1 quotes only — never from the raw transcript directly
- [x] **ART-03**: MOM (minutes of meeting) document is generated at meeting end and includes agenda items, attendees, and discussion summary backed by verbatim citations
- [x] **ART-04**: Key points list is generated at meeting end; each item is traceable to a verbatim quote via CitationValidator (≥ 90% token overlap)
- [x] **ART-05**: Meeting summary paragraph is generated at meeting end
- [x] **ART-06**: Action items are extracted with owner, due date (where stated), and verbatim quote anchor; each item is created with `status: 'proposed'`
- [x] **ART-07**: All artifact items are created with `status: 'proposed'`; no artifact is auto-written to any external system without explicit user confirmation
- [x] **ART-08**: ArtifactReview UI shows each proposed item with a "Verify" toggle that reveals the verbatim quote anchor
- [x] **ART-09**: User can confirm, edit, or dismiss each proposed artifact item before export
- [x] **ART-10**: Confirmed action items are exported as a `.ics` iCalendar file via the `ics` package (zero OAuth required)
- [x] **ART-11**: All LLM structured outputs are validated against Zod schemas defined in `src/shared/schemas/index.ts`; invalid responses are retried, not silently accepted

### Overlay UI + Live Summary Board

- [ ] **UI-01**: Full session flow renders in the overlay: consent gate → capturing state → on-break state → processing → artifact review
- [x] **UI-02**: `SummaryCardTimer` fires every 5 minutes during capture and triggers a summary card generation cycle
- [x] **UI-03**: `LiveSummaryBoard` renders the stack of generated summary cards in the overlay, newest at top
- [ ] **UI-04**: `ArtifactReview` panel renders all proposed artifacts grouped by type (MOM, key points, action items) after meeting end
- [x] **UI-05**: `AudioWorkletHost` component manages mic capture lifecycle from the renderer side; captures and forwards PCM frames via IPC
- [x] **UI-06**: All IPC calls from the renderer use the typed contextBridge allowlist; no raw `ipcRenderer` is exposed

### Context Engine + Break Assist

- [ ] **CTX-01**: `ContextEngine` maintains a rolling meeting context using `EpochCompressor` reading from `transcript_segments` ONLY — never from `summary_cards`
- [ ] **CTX-02**: `EpochCompressor` compresses completed epoch windows into `epoch_summaries` table entries
- [ ] **CTX-03**: Summary cards are generated from the rolling context as a side effect of the passive path; stored in `summary_cards` table
- [ ] **CTX-04**: Break assist shows a digest of all content missed during break when "I'm Back" is triggered; digest uses `summary_cards` and `epoch_summaries` generated during the break window
- [ ] **CTX-05**: SessionManager FSM transitions correctly through `Capturing → OnBreak → Capturing` cycle
- [ ] **CTX-06**: A 60-minute meeting test completes without memory pressure or token budget overflow

### Packaging + Eval Harness

- [ ] **PACK-01**: Notarized, signed DMG is produced via `electron-builder` + `@electron/notarize` (notarytool); `hardenedRuntime: true`; `altool` is not used
- [ ] **PACK-02**: `mac.entitlements` plist includes `allow-jit` and `allow-unsigned-executable-memory` for Chromium
- [ ] **PACK-03**: `asarUnpack` includes `better-sqlite3-multiple-ciphers` `.node` binary and `audiotee` Swift binary
- [ ] **PACK-04**: Adversarial eval harness runs against a ≥ 5-meeting corpus; Citation Grounding Fidelity Score (CGFS) ≥ 0.85
- [ ] **PACK-05**: Hallucination Error Rate (EHR) ≤ 0.05 in the eval corpus — shipping gate; v1 is not declared shippable until both PACK-04 and PACK-05 pass

---

## v2 Requirements (Deferred)

### Advanced Features

- **ADV-01**: Live assistant interactive chat UI — hotkey/keyword-triggered in-meeting Q&A (ContextEngine architecture is built in v1; this is the UI layer)
- **ADV-02**: Meeting-type-specific artifact templates (standup, sales call, 1:1, design review)
- **ADV-03**: Cross-meeting semantic search UX (`sqlite-vec` infrastructure is v1; search UX is v2)
- **ADV-04**: Named speaker attribution — "Alice" / "Bob" in place of Speaker 1/2/3
- **ADV-05**: Google Calendar / Outlook direct API integration (`.ics` export covers v1; OAuth is v2)
- **ADV-06**: Slack, Notion, CRM integrations

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Live assistant chat UI | ContextEngine built in v1; interactive chat is post-launch — needs usage data to design UX well |
| Named speaker attribution | v1 ships Speaker 1/2/3 labels; name confirmation UX requires additional design |
| Cross-meeting search UX | DB infrastructure ships in v1; search UX is a standalone post-launch feature |
| Meeting templates | One universal template in v1; template variety needs real usage data |
| Google/Outlook direct API | `.ics` export covers all calendar apps; OAuth complexity disproportionate to v1 value |
| Interview-assistance / exam use case | MeetingAssist is legitimate meeting assistance only; interview-cheating is explicitly not the product |
| Gemini free-tier API | Free tier allows training on meeting data — disqualified (RSCH-03 critical warning) |
| Auto-writing artifacts to external systems | Proposed-with-confirm contract is absolute; user must confirm before any external write |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 6: Foundation & Scaffold | Pending |
| FOUND-02 | Phase 6: Foundation & Scaffold | Pending |
| FOUND-03 | Phase 6: Foundation & Scaffold | Pending |
| FOUND-04 | Phase 6: Foundation & Scaffold | Pending |
| FOUND-05 | Phase 6: Foundation & Scaffold | Pending |
| FOUND-06 | Phase 6: Foundation & Scaffold | Pending |
| FOUND-07 | Phase 6: Foundation & Scaffold | Pending |
| FOUND-08 | Phase 6: Foundation & Scaffold | Pending |
| FOUND-09 | Phase 6: Foundation & Scaffold | Pending |
| CAPT-01 | Phase 7: Capture + TranscriptStore | Complete |
| CAPT-02 | Phase 7: Capture + TranscriptStore | Complete |
| CAPT-03 | Phase 7: Capture + TranscriptStore | Complete (v1 limitation — see note) |
| CAPT-04 | Phase 7: Capture + TranscriptStore | Complete |
| CAPT-05 | Phase 7: Capture + TranscriptStore | Complete |
| CAPT-06 | Phase 7: Capture + TranscriptStore | Complete |
| CAPT-07 | Phase 7: Capture + TranscriptStore | Complete |
| CAPT-08 | Phase 7: Capture + TranscriptStore | Complete |
| CAPT-09 | Phase 7: Capture + TranscriptStore | Complete |
| ART-01 | Phase 8: ArtifactPipeline | Complete |
| ART-02 | Phase 8: ArtifactPipeline | Complete |
| ART-03 | Phase 8: ArtifactPipeline | Complete |
| ART-04 | Phase 8: ArtifactPipeline | Complete |
| ART-05 | Phase 8: ArtifactPipeline | Complete |
| ART-06 | Phase 8: ArtifactPipeline | Complete |
| ART-07 | Phase 8: ArtifactPipeline | Complete |
| ART-08 | Phase 8: ArtifactPipeline | Complete |
| ART-09 | Phase 8: ArtifactPipeline | Complete |
| ART-10 | Phase 8: ArtifactPipeline | Complete |
| ART-11 | Phase 8: ArtifactPipeline | Complete |
| UI-01 | Phase 9: Overlay UI + Live Summary Board | Pending |
| UI-02 | Phase 9: Overlay UI + Live Summary Board | Complete |
| UI-03 | Phase 9: Overlay UI + Live Summary Board | Complete |
| UI-04 | Phase 9: Overlay UI + Live Summary Board | Pending |
| UI-05 | Phase 9: Overlay UI + Live Summary Board | Complete |
| UI-06 | Phase 9: Overlay UI + Live Summary Board | Complete |
| CTX-01 | Phase 10: ContextEngine + Break Assist | Pending |
| CTX-02 | Phase 10: ContextEngine + Break Assist | Pending |
| CTX-03 | Phase 10: ContextEngine + Break Assist | Pending |
| CTX-04 | Phase 10: ContextEngine + Break Assist | Pending |
| CTX-05 | Phase 10: ContextEngine + Break Assist | Pending |
| CTX-06 | Phase 10: ContextEngine + Break Assist | Pending |
| PACK-01 | Phase 11: Packaging + Eval Harness | Pending |
| PACK-02 | Phase 11: Packaging + Eval Harness | Pending |
| PACK-03 | Phase 11: Packaging + Eval Harness | Pending |
| PACK-04 | Phase 11: Packaging + Eval Harness | Pending |
| PACK-05 | Phase 11: Packaging + Eval Harness | Pending |

**Coverage:**

- v1 requirements: 46 total
- Mapped to phases: 46
- Unmapped: 0

---
*Requirements defined: 2026-06-26*
*Last updated: 2026-06-27 — Phase 7 complete: CAPT-01–09 marked verified; CAPT-03 carries v1 limitation note (Chromium loopback health reflects error state)*
