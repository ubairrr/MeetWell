# Project Research Summary

**Project:** MeetingAssist
**Domain:** macOS desktop AI meeting-assistant overlay (Electron + real-time STT + LLM artifact pipeline), repurposing the Interview Helper DNA
**Researched:** 2026-06-25
**Confidence:** MEDIUM-HIGH (architecture HIGH — read from DNA source; stack/features/pitfalls MEDIUM — web-sourced, cross-checked, time-sensitive)

> **This milestone is Discovery & PRD — planning only.** The "roadmap implications" below are phrased as **PRD work-streams, ADRs, and technical spikes**, not build phases. Building the app is the next milestone. The single most consequential output of this milestone is a set of explicit product decisions (consent posture, data-handling, grounding strategy) plus a validated technical foundation.

## Executive Summary

MeetingAssist is a **local-capture, no-bot** AI meeting assistant — the same architectural camp as Granola, Krisp, and Cluely, and structurally distinct from the bot-joiner camp (Otter, Fireflies, Fathom). It captures system audio + mic locally, never appears as a participant, transcribes in real time, and turns the conversation into trustworthy artifacts (MOM, summary, key points, action items, dates) plus a live in-meeting assistant, context-preserving chat, and break-catch-up. The inherited Interview Helper DNA already solves the hard, non-obvious engineering — dual-channel real-time STT, stealth-capable overlay rendering, a provider-agnostic LLM layer, vision pipeline, and global hotkeys — so the new work concentrates in three places: **(1) reliable full-meeting system-audio capture, (2) encrypted local persistence of long transcripts/artifacts, and (3) a grounded AI artifact pipeline.** The DNA's single-file `main.js` must be generalized into a modular `main/<domain>/` service layer to meet the production-grade-architecture requirement.

The recommended approach keeps almost all of the DNA's stack (Electron → bump to 41 LTS, React 19, Vite 7, the OpenAI-`baseURL` provider seam, `sharp` vision), **augments** STT (Deepgram Nova-2 → Nova-3, kept behind a swappable provider port with AssemblyAI fallback and an optional on-device whisper.cpp privacy mode), and **replaces** `electron-store`-for-everything with **SQLCipher (`better-sqlite3-multiple-ciphers`)** for transcripts/artifacts plus `safeStorage` (Keychain) for secrets. New structural additions are the load-bearing design: a first-class **TranscriptStore** (the durable source of truth), a **SessionManager** lifecycle finite-state machine (idle→live→break→ending→archived), a **ContextEngine** (rolling window + RAG + epoch summaries), and **two-speed processing** (sub-second real-time stream + accuracy-optimized end-of-meeting batch via map-reduce).

Two pitfalls are **existential, not cosmetic**, and both must be resolved in this PRD milestone. First, the **consent/recording posture**: carrying the DNA's invisibility wholesale into a recording context is a direct legal-liability path (the live Otter.ai ECPA/CIPA class action is the cautionary tale). The product must separate two distinct invisibilities — hiding the user's private panel from their own screen-share (benign, keep it) versus hiding the *fact of recording* from other participants (the poison pill, never ship it) — and make recording disclosed and consented as table stakes. Second, **AI-artifact grounding/faithfulness**: fabricated action items and dates (false attribution, temporal smoothing, consensus fabrication) are the #1 trust-killer, and they *feel* trustworthy so users won't catch them — every structured artifact must be grounded to a transcript span/timestamp or it doesn't ship. The highest-risk *technical* dependency is **macOS system-audio capture**, which needs a dedicated spike before the stack is ratified.

## Key Findings

### Recommended Stack

Inherit and bump the DNA. The two genuinely new build areas the DNA does not cover are full-meeting system-audio capture and encrypted local persistence; everything else is configuration and prompt work on proven machinery. STT and LLM both sit behind swappable provider ports.

**Core technologies:**
- **Electron 41.x LTS** (Chromium 146 / Node 24 LTS) — bump from DNA's 40; provides `desktopCapturer` + ScreenCaptureKit loopback path. KEEP+bump.
- **React 19 + Vite 7** — DNA standard, still current. KEEP unchanged.
- **Deepgram Nova-3** (`@deepgram/sdk`) — real-time dual-channel STT; <300ms TTFT, ~6.84% WER, diarization to 12 speakers. AUGMENT from Nova-2; keep behind an `SttProvider` port.
- **OpenAI SDK as provider-agnostic adapter (`baseURL`)** — MOM/summary/actions/chat across 7+ providers with no code change. KEEP; add **strict Structured Outputs** + Zod validation for extraction.
- **`better-sqlite3-multiple-ciphers` (SQLCipher, AES-256)** — encrypted transcripts/artifacts/metadata; key sealed via Electron `safeStorage`. REPLACE electron-store for this data (electron-store stays for small prefs only).
- **System-audio capture (the gap):** default `electron-audio-loopback` (ScreenCaptureKit, widest support, no bundled binary, purple indicator), premium `AudioTee.js` (Core Audio Taps, macOS 14.2+, cleaner permissions, pre-mixer audio). **Do NOT** bundle virtual-audio kexts (BlackHole/Soundflower) — breaks notarization.
- **`.ics` export first** (`ics`/`ical-generator`, zero OAuth), Google/Outlook OAuth as later differentiators. `sqlite-vec` for cross-meeting RAG when prioritized (no separate vector DB).

### Expected Features

MeetingAssist's local-capture DNA places it in the no-bot camp; that single fact drives the feature calls. The core promise — a trustworthy record + artifacts with no notes taken — is non-negotiable; the live layer is the differentiator the bot-joiners structurally cannot match.

**Must have (table stakes):**
- Real-time dual-channel transcription with live on-screen text (DNA) + full transcript saved at meeting end (user's #1 stated need)
- Post-meeting Summary + Key Points + templated MOM
- Action-item extraction with owners/deadlines; date/deadline extraction → **.ics export**
- "You vs Others" 2-bucket speaker labeling (free from dual channel — honest, reliable)
- **Recording-consent disclosure prompt** — 2026 legal baseline, not optional
- Export (Markdown/clipboard/email); BYO-LLM provider selection (DNA)

**Should have (competitive differentiators — DNA-native):**
- Live in-meeting assistant (hotkey/keyword Q&A + research) — **win on latency** vs Cluely's observed 5–10s
- Context-preserving in-meeting chat; **break assist** (catch-up delta summary — genuine white space)
- Rolling live summary overlay; vision/screen-content Q&A (DNA); decision log; follow-up email draft
- Local-first posture (transcribe-then-delete raw audio — Granola's trust template)

**Defer (v2+):**
- Multi-meeting memory / "ask across all meetings" (RAG) — **design the data model in MVP** even though the feature ships later
- Agenda live-coverage tracking; real-time translation; CRM/Jira/Notion/Slack sync (persona-gated); 3+ speaker diarization; talk-time analytics

**Anti-features (explicitly avoid):** "undetectable stealth" recording framing, auto-joining bots, over-promised per-person diarization on a mixed stream, "meeting score"/sentiment reports, cloud storage of raw audio/video.

### Architecture Approach

Generalize the DNA's single-file `main.js` into a modular `main/<domain>/` service layer (group by capability, not technical layer), with a thin `ipc/handlers.ts`, a single typed `shared/ipc-contract.ts`, and port/adapter interfaces for STT and LLM. The renderer is a pure view + audio-capture layer that never imports vendor SDKs or secrets. Four patterns are load-bearing: port/adapter providers, the SessionManager FSM, hybrid context (rolling window + RAG + epoch summaries), and two-speed processing.

**DNA verdict — KEEP / REPLACE / AUGMENT:**
- **KEEP (reuse near-verbatim):** overlay window + stealth/normal modes, AudioWorklet PCM capture, OpenAI-`baseURL` LLM adapter, `sharp` vision pipeline, global hotkeys, hardened contextBridge/IPC isolation.
- **REPLACE:** `electron-store` for transcripts → SQLCipher; the hidden `currentQuestion` accumulator → first-class TranscriptStore; auto-fire-LLM-on-`speech_final` → user-invoked assistant; stringly-typed duplicated IPC channels → one typed contract; the renderer's `@deepgram/sdk`/env-key path → all SDKs in main.
- **AUGMENT:** Deepgram Nova-2 → Nova-3 behind a provider port; LLMService gains streaming + retry + token budgeting + Structured Outputs.

**Major components (new additions in bold):**
1. **TranscriptStore** — append-only, speaker-tagged, SQLite-persisted source of truth (the core-value backbone).
2. **SessionManager** — lifecycle FSM (idle→live→break→ending→postprocessing→archived); the only orchestrator that starts/stops services; powers break/resume.
3. **ContextEngine** — rolling verbatim window + RAG retrieval + epoch summaries; serves both live chat and break assist.
4. **ArtifactPipeline** — two-speed batch map-reduce over the transcript → MOM/summary/key points/actions/dates.
5. STTService, LLMService, AssistantService, DiarizationService, IntegrationsService, VisionService, HotkeyRegistry, Persistence (existing DNA pieces, generalized).

### Critical Pitfalls

1. **Consent/recording posture (existential).** Carrying stealth/invisibility into a recording product is a wiretap-liability path (Otter.ai ECPA/CIPA class action, MTD hearing May 2026). **Avoid:** separate "panel hidden from own screen-share" (keep) from "fact of recording hidden from participants" (never ship); make consent/disclosure a table-stakes gate that blocks the first byte of remote audio; default to all-party-consent posture. → **PRD decision + ADR this milestone.**
2. **Fabricated action items/dates (existential trust-killer).** Subtle, confidence-inspiring distortions — false attribution, temporal smoothing, consensus fabrication, topic inflation. **Avoid:** ground every artifact to a transcript span/timestamp with a verbatim supporting quote; surface items as *proposed* with one-tap confirm, never auto-write to calendar; preserve hedging ("tentatively next week"); evaluate against adversarial transcripts with a faithfulness metric. → **AI-SPEC design contract before extraction is built.**
3. **macOS system-audio capture (highest technical risk).** Capturing other participants' audio is the hardest part of the stack and the most likely to silently fail; Core Audio all-app taps need macOS 14.2+. **Avoid:** dedicated **spike** across supported macOS versions; capture-failure UX contract (live "audio healthy?" indicator); explicit supported-OS floor with graceful mic-only degrade.
4. **Privacy/data exposure via cloud STT/LLM.** Indefinite retention + vendor training are the Otter complaint's core; GDPR needs an Article 28 DPA. **Avoid:** PRD data-handling posture + ADR (local-first default, encryption at rest, retention/delete, confirmed no-training terms); offer local STT/LLM mode.
5. **Cost/performance blow-up on long meetings.** Re-sending a growing transcript scales quadratically and triggers lost-in-the-middle/context overflow. **Avoid:** rolling compaction + retrieval + epoch summaries + per-provider context budget (this is exactly the ContextEngine + two-speed design).
6. **Diarization errors presented as fact** and **TCC permission-onboarding abandonment** (quarantined-first-run silent-denial) round out the list — both addressed in build phases, but the diarization *approach* is a PRD research question.

## Implications for Roadmap

Because this milestone produces a PRD (not code), the "phases" below are **PRD work-streams, decisions/ADRs, and a technical spike** that together de-risk the next (build) milestone. The dependency-driven build order from ARCHITECTURE.md is preserved at the end as input to the future build roadmap.

### Phase 1: Consent & Recording Posture decision (ADR)
**Rationale:** The single most important product decision; it gates the legitimacy of the entire product and resolves the PROJECT.md open stealth/ethics question. Everything downstream (capture, marketing, data-handling) depends on it.
**Delivers:** An ADR fixing the posture — recording-party tool only, disclosed never covert, all-party-consent default; keep `NSWindowSharingNone` for the user's own panel only; consent gate as a hard precondition to capture.
**Avoids:** Pitfall #1 (consent landmine).

### Phase 2: Data-handling & privacy posture (ADR)
**Rationale:** Second existential decision; partners with consent and shapes the persistence/stack choices (SQLCipher, retention, local-first, no-training vendor terms).
**Delivers:** ADR on storage location (local-first), encryption at rest, retention defaults + per-meeting delete, transcribe-then-delete-raw-audio stance, and the local/on-device privacy mode.
**Uses:** SQLCipher + `safeStorage` from STACK.md.
**Avoids:** Pitfall #5 (privacy/data exposure).

### Phase 3: AI-artifact grounding design (AI-SPEC)
**Rationale:** The faithfulness constraint is a core design contract, not an implementation detail; it must exist before any extraction spec.
**Delivers:** AI-SPEC covering quote-backed extraction prompt contracts, per-artifact citation requirement, proposed-with-confirm UX, conservative-date handling, and an adversarial-transcript eval harness + faithfulness metric. Also specifies the ContextEngine/two-speed context architecture to keep long meetings within budget.
**Avoids:** Pitfalls #2 and #6 (fabrication, long-meeting cost).

### Phase 4: System-audio capture technical spike
**Rationale:** Highest-risk technical dependency; the stack cannot be ratified until capture is validated on real macOS versions. The DNA's 1:1 interview capture is not proven for full-meeting capture.
**Delivers:** A spike report validating `electron-audio-loopback` vs `AudioTee.js` on the declared min + current macOS, a documented supported-OS floor, a silent-audio detection approach, and the capture-failure UX contract.
**Avoids:** Pitfall #3 (system-audio capture).

### Phase 5: Modular architecture & stack ratification (PRD core)
**Rationale:** Synthesizes the above into the production-grade modular architecture the milestone requires; ratifies/extends the inherited stack.
**Delivers:** The `main/<domain>/` service-layer design, KEEP/REPLACE/AUGMENT mapping of the DNA, port/adapter contracts, TranscriptStore/SessionManager/ContextEngine/ArtifactPipeline specs, and the dependency-driven build order for the next milestone.
**Uses:** All of ARCHITECTURE.md; STACK.md ratification.

### Phase 6: Product positioning & feature PRD
**Rationale:** Locks the feature set, MVP boundary, and persona — informed by competitive landscape and the decisions above.
**Delivers:** PRD feature spec (table stakes vs differentiators vs deferred), MVP definition, and the open positioning/persona/monetization questions either resolved or flagged for dedicated research.

### Phase Ordering Rationale

- **Decisions before design before specification.** Consent (1) and data-handling (2) are existential gates that constrain everything; grounding (3) is the core AI contract; the capture spike (4) de-risks the stack; only then can the architecture/stack be ratified (5) and the feature PRD locked (6).
- **The two existential pitfalls are pulled to the front** because they are PRD-level product decisions, exactly as PITFALLS.md maps them.
- **The build-order from ARCHITECTURE.md** (1 foundation → 2 audio/STT → 3 TranscriptStore+SessionManager+persistence → 4 LLMService+live transcript → 5 ArtifactPipeline → 6 ContextEngine+Assistant → 7 break assist → 8 diarization → 9 integrations → 10 vision) becomes the skeleton of the *next* milestone's roadmap and should be carried into the PRD as the recommended build sequence.

### Research Flags

PRD work-streams likely needing deeper, dedicated research during planning (flagged by the researchers as open questions):
- **Persona / positioning / monetization** — PROJECT.md marks customer, revenue model, and success metric as TBD; pricing/tier strategy (free=AssemblyAI/whisper, paid=Nova-3/Gemini Pro) is unresolved.
- **Diarization approach** — provider-side vs local clustering for 3+ speakers; what trust bar must be cleared before shipping beyond the reliable 2-bucket case.
- **Vendor DPA / no-training terms** — must confirm Deepgram + chosen LLM providers support no-training and offer DPAs before the data-handling posture can be finalized.
- **Local vector store for cross-meeting memory** — `sqlite-vec` is the recommendation, but the cross-meeting data model must be designed now even though the feature is deferred.
- **System-audio capture** — the spike (Phase 4) is itself the research; treat as required, not optional.

Phases with well-established patterns (lighter research):
- **Modular Electron service layer** — patterns are HIGH-confidence (read from DNA + Electron docs); standard refactor.
- **`.ics` export** — well-documented, zero-auth baseline.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Web-sourced, cross-checked against official docs; versions/pricing move fast — re-verify at build time. System-audio capture method is a known gap pending spike. |
| Features | MEDIUM | Multiple independent 2026 product pages, reviews, and legal sources cross-referenced; not first-party benchmarked. |
| Architecture | HIGH | DNA read directly from source; external patterns corroborated by AssemblyAI/NVIDIA/AWS/arXiv. |
| Pitfalls | MEDIUM | Legal/consent and hallucination findings cross-verified across independent sources; specific statutes and macOS cutoffs are "verify before relying," not legal advice. |

**Overall confidence:** MEDIUM-HIGH — strong enough to write the PRD; the open questions are scoped and flagged, not blocking.

### Gaps to Address

- **Consent legal specifics** — research is directional, not legal advice; the PRD should adopt the strictest (all-party) posture and recommend legal review before GA.
- **System-audio capture viability** — unvalidated for full-meeting use; resolve via the Phase 4 spike before ratifying the stack.
- **Vendor no-training / DPA terms** — must be confirmed in writing before locking the data-handling ADR.
- **Persona & monetization** — TBD in PROJECT.md; resolve in the positioning work-stream or flag as a dedicated research phase.
- **Diarization beyond 2 speakers** — approach and trust bar unresolved; deferred but needs a design decision.
- **Pinned versions** — STACK.md gives "current major line as of 2026-06," not lockfile pins; pin at build time.

## Sources

### Primary (HIGH confidence)
- DNA source read directly: `DNA/src/main.js`, `preload.js`, `audio.js`, `renderer/App.jsx`, `package.json` — architecture, KEEP/REPLACE/AUGMENT verdicts
- Electron Process Model + Preload docs — main/renderer/preload boundaries
- AssemblyAI streaming diarization, NVIDIA Sortformer, arXiv 2312.17581 (action-item summarization) — diarization & map-reduce patterns

### Secondary (MEDIUM confidence)
- Deepgram Nova-3, AssemblyAI Universal-Streaming, OpenAI Realtime, whisper.cpp benchmarks — STT options/pricing/latency
- macOS Core Audio Taps + electron-audio-loopback + electron-builder notarization — capture paths & entitlements
- Structured Outputs (OpenAI/Gemini), SQLCipher/safeStorage, sqlite-vec — persistence & extraction
- 13 competitor product pages + 2026 reviews (Otter, Fireflies, Fathom, Granola, Cluely, SuperIntern, etc.) — feature landscape
- Otter.ai class-action coverage (NPR, Fisher Phillips, tl;dv, Workplace Privacy Report), IAPP/GDPR audio guidance, recording-consent state surveys — consent/legal
- Alibaba product-insights + Harvard Misinformation Review — LLM hallucination patterns in note-taking
- Electron #47490, Recall.ai system-audio + diarization, Apple media-capture authorization, DEV TCC quarantine fix — capture/permissions/diarization

### Tertiary (LOW confidence — needs validation)
- Specific statutes / all-party-consent state counts and macOS-version cutoffs — verify before relying; not legal advice
- Vendor no-training/DPA terms — must be confirmed directly with Deepgram + LLM providers

---
*Research completed: 2026-06-25*
*Ready for roadmap: yes*
