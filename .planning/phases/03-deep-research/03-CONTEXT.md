# Phase 3: Deep Research - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase resolves the open research questions that the PRD (Phase 5) depends on. All six RSCH requirements are addressed. No product code is written — the only hands-on code is the RSCH-04 throwaway capture spike (isolated experimental code, immediately discarded after the report is written). The deliverables are research findings, a capture-spike report, and a cross-meeting memory data model design.

Six outputs:
1. **RSCH-01:** Persona, positioning, monetization model, and competitive landscape
2. **RSCH-02:** Speaker-diarization approach decision
3. **RSCH-03:** Vendor DPA / no-training terms confirmed for Deepgram + chosen LLM provider(s)
4. **RSCH-04:** Capture-spike report (hands-on, throwaway) comparing both capture paths
5. **RSCH-05:** Cross-meeting memory data model design (`sqlite-vec`)
6. **RSCH-06:** Expanded use-case and feature discovery for PRD scoping

</domain>

<decisions>
## Implementation Decisions

### RSCH-04 — Capture spike scope

- **D-01:** Test **both capture paths side-by-side** — `electron-audio-loopback` (Chromium ScreenCaptureKit loopback) and `AudioTee.js` (Core Audio Taps). The spike's purpose is a direct comparison so the PRD can make an informed architecture decision.
- **D-02:** Run the spike on the **current machine only** (whatever macOS version is available). Multi-version testing is a QA concern for the build milestone. The supported-OS floor is derived from library constraints (electron-audio-loopback ≥ 13.2, AudioTee.js ≥ 14.2), not hands-on multi-version testing.
- **D-03:** The spike's **success signal** is end-to-end: play audio on the machine → capture via each path → stream to Deepgram Nova-3 → verify a coherent transcript returns. Silence or garbage transcript = capture failure. This is the highest-confidence proof the path works.
- **D-04:** Test **both channels** — mic ("You") and system audio ("Others") — simultaneously. MeetingAssist is dual-channel by design; the spike must validate both inputs can be captured at the same time.
- **D-05:** Spike code is **throwaway** — isolated experimental code, not product code. No merge, no packaging. The output is a written report comparing both paths on: audio quality, permissions UX, macOS version floor, and any integration surprises.

### RSCH-01 — Persona, positioning, and monetization

- **D-06:** Primary customer is **knowledge workers broadly** (PMs, managers, consultants, founders, remote/hybrid teams). The research should validate which segment shows the strongest pull — persona definition is evidence-first, not assumed.
- **D-07:** Starting monetization hypothesis: **subscription (monthly/annual)**. Research validates whether the market accepts it, at what price point, and whether any tier structure (free trial, tiered by AI usage) makes sense. This is the hypothesis to pressure-test, not a final decision.
- **D-08:** RSCH-01 includes a **focused competitive landscape scan** covering the main AI meeting-assistant tools (Otter.ai, Fireflies, Granola, Notion AI Meeting Notes, and any others the research surfaces). Goal: identify positioning gaps and articulate MeetingAssist's differentiation story (local-first, macOS-native, privacy-forward).

### RSCH-02 — Diarization minimum bar

- **D-09:** MVP diarization standard: **Speaker labels without names** — Speaker 1, Speaker 2, Speaker 3, etc. This is an upgrade over binary "You vs Others," provides attribution for multi-participant meetings, and doesn't require a name-matching mechanism.
- **D-10:** **Named speaker attribution** (Alice, Bob, etc.) is a **v2 differentiator**, not a v1 requirement. The label foundation ships in v1; names are added post-MVP via a post-meeting confirmation flow.
- **D-11:** Target speaker count for v1: **up to 8 speakers** reliably. Research must evaluate Deepgram Nova-3 diarization quality at 2–8 speakers and flag any accuracy cliff. Deepgram Nova-3 supports up to 12, but quality degrades — the research should recommend a realistic cap with an evidence basis.

### RSCH-06 — Use-case discovery breadth

- **D-12:** RSCH-06 uses **both lenses**: competitive research (what features do other tools support that our starter list misses?) + meeting-type discovery (what artifact/format differences do distinct meeting types require — standup, 1:1, design review, sales call, etc.).
- **D-13:** No pre-specified use cases to validate — **fully open discovery**. The research surfaces whatever the market and competitive landscape point to.
- **D-14:** Integrations beyond calendar (Slack, Notion, CRM) are **noted as v2 candidates** only. RSCH-06 should surface what integrations the competitive landscape considers table-stakes, but not scope any of them for v1. The PRD's MVP boundary decision (Phase 5) handles the final call.

### Claude's Discretion

- **RSCH-03 scope:** The research determines which LLM providers need DPA confirmation. Deepgram is required; the LLM provider list depends on which providers are evaluated in Phase 4 (AI-SPEC). The researcher should confirm Deepgram + at minimum Gemini (the default artifact model) and flag any others.
- **RSCH-05 design:** Cross-meeting memory data model design (`sqlite-vec` in SQLCipher DB) — schema design, chunk granularity, and embedding strategy are left to the researcher's judgment, informed by the REQUIREMENTS.md spec and the data-handling ADR constraints.
- **Spike report format:** The researcher chooses what format best communicates the capture-path comparison — the report is human-readable and feeds into the PRD stack decision, not machine-parsed.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 3: Deep Research" — phase goal, success criteria (5 items), and all six RSCH requirements (RSCH-01 through RSCH-06)
- `.planning/REQUIREMENTS.md` §"Deep Research (RSCH)" — full RSCH-01 through RSCH-06 definitions with acceptance criteria
- `.planning/PROJECT.md` — product vision, core value, business context TBDs (customer, revenue model, success metric) that RSCH-01 must resolve

### Foundational decisions (locked — inform research scope)
- `.planning/phases/02-foundational-decisions-adrs/02-CONTEXT.md` — DEC-01 and DEC-02 decisions; RSCH-03 vendor terms gate DEC-02 finalization
- `.planning/phases/02-foundational-decisions-adrs/` (ADR files) — DEC-01 Consent & Recording Posture ADR and DEC-02 Data-handling & Privacy ADR; RSCH-03 must confirm vendor terms against DEC-02's local-first + no-training stance

### DNA technique reference (input to capture spike)
- `.planning/phases/01-dna-deep-dive-project-setup/01-DNA-CATALOGUE.md` — DNA's real audio-capture approach, its macOS version floor, and the dual-channel (mic + system audio) architecture the spike must validate for MeetingAssist's use case

### Stack decisions (constrain capture spike and diarization research)
- `.claude/CLAUDE.md` §"macOS System-Audio Capture (the hard part)" — both capture paths, their macOS floors, entitlements, permissions UX tradeoffs, and the CLAUDE.md verdict for each
- `.claude/CLAUDE.md` §"Speech-to-Text — Options & Tradeoffs" — Deepgram Nova-3 diarization capability (up to 12 speakers, per-second billing) and the full STT provider comparison
- `.claude/CLAUDE.md` §"Local Persistence & Encryption" — SQLCipher (`better-sqlite3-multiple-ciphers`) + `safeStorage` as the locked persistence approach; RSCH-05 data model must be compatible

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- This is a **planning-only repo** — no product code exists yet. The capture spike (RSCH-04) produces throwaway experimental code that lives outside the product codebase and is not merged.

### Established Patterns
- Auto-push Stop hook commits + pushes every change. All research findings (reports, ADR updates, spike report) are committed as planning artifacts in the phase directory.
- Planning artifacts follow the `${padded_phase}-<DESCRIPTOR>.md` naming convention (e.g., `03-RSCH-04-SPIKE-REPORT.md`).

### Integration Points
- **RSCH-03** gates finalization of DEC-02 (data-handling ADR). The vendor DPA confirmation must be noted in or linked from the DEC-02 ADR.
- **RSCH-04 report** feeds the Phase 4 AI-SPEC (capture path affects the real-time hot-path architecture) and Phase 5 PRD (stack ratification).
- **RSCH-01** resolves the PROJECT.md TBDs (customer, revenue model, success metric) — the researcher updates PROJECT.md or notes the resolutions clearly for Phase 5 to incorporate.
- **RSCH-06** findings feed Phase 5 PRD's MVP boundary decision (PRD-01: feature spec with explicit MVP boundary).

</code_context>

<specifics>
## Specific Ideas

- The capture spike success signal is explicit: play audio → capture → stream to Deepgram Nova-3 → verify a coherent transcript returns. Not waveform inspection — an actual transcript round-trip.
- Diarization research should evaluate Deepgram Nova-3's real-world accuracy at 2, 4, and 8 speakers and explicitly flag any accuracy cliff above a certain count — this is the evidence base for the v1 speaker cap.
- Competitive scan for RSCH-01 should include at minimum: Otter.ai, Fireflies.ai, Granola, Notion AI Meeting Notes. Any other notable players the research surfaces should be included.
- The dual-capture test in RSCH-04 should simulate a real meeting scenario: mic recording voice + system audio playing back a video call or audio source simultaneously.

</specifics>

<deferred>
## Deferred Ideas

- **Named speaker attribution (Speaker 1 → "Alice")** — post-meeting name-confirmation UX deferred to v2. The label foundation (Speaker 1/2/3) ships in v1.
- **Integrations beyond calendar** (Slack summary posting, Notion page creation, CRM entry) — surfaced by RSCH-06 as v2 candidates. MVP boundary decision in Phase 5 PRD.
- **On-device mode full specification** — carried forward from Phase 2 deferral. Not in scope for Phase 3 research beyond noting its existence in DEC-02.
- **Multi-version macOS testing for capture** — deferred to the build milestone's QA. The spike runs on the current machine; supported-OS floor is documented from library constraints.

</deferred>

---

*Phase: 3-Deep Research*
*Context gathered: 2026-06-25*
