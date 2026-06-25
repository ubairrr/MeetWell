# Phase 3: Deep Research — Research

**Researched:** 2026-06-25
**Domain:** Market research, speaker diarization, vendor privacy terms, macOS audio capture validation, cross-meeting memory data model, use-case discovery
**Confidence:** MEDIUM

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**RSCH-04 — Capture spike scope**
- D-01: Test **both capture paths side-by-side** — `electron-audio-loopback` (Chromium ScreenCaptureKit loopback) and `AudioTee.js` (Core Audio Taps). Purpose: direct comparison so the PRD makes an informed architecture decision.
- D-02: Run spike on **current machine only** (macOS 26.5.1 / Tahoe). Multi-version testing is QA concern for build milestone.
- D-03: Success signal: play audio → capture via each path → stream to Deepgram Nova-3 → verify coherent transcript returns. Silence or garbage = capture failure.
- D-04: Test **both channels** — mic ("You") and system audio ("Others") — simultaneously.
- D-05: Spike code is **throwaway** — isolated experimental code, not product code. Output = written report comparing both paths on: audio quality, permissions UX, macOS version floor, and integration surprises.

**RSCH-01 — Persona, positioning, and monetization**
- D-06: Primary customer = **knowledge workers broadly** (PMs, managers, consultants, founders, remote/hybrid teams). Persona definition is evidence-first.
- D-07: Starting monetization hypothesis: **subscription (monthly/annual)**. Research validates acceptance, price point, tier structure.
- D-08: Competitive scan covers at minimum: Otter.ai, Fireflies.ai, Granola, Notion AI Meeting Notes, and others surfaced.

**RSCH-02 — Diarization minimum bar**
- D-09: MVP diarization standard: **Speaker labels without names** — Speaker 1, Speaker 2, Speaker 3, etc.
- D-10: **Named speaker attribution** (Alice, Bob) is v2 differentiator.
- D-11: Target speaker count for v1: **up to 8 speakers** reliably.

**RSCH-06 — Use-case discovery breadth**
- D-12: Both lenses: competitive research (feature gaps) + meeting-type discovery (what artifact/format differences distinct meeting types require).
- D-13: Fully open discovery — no pre-specified use cases to validate.
- D-14: Integrations beyond calendar noted as v2 candidates only.

### Claude's Discretion
- **RSCH-03 scope:** Determine which LLM providers need DPA confirmation. Deepgram required; LLM provider list depends on Phase 4 AI-SPEC. Confirm Deepgram + at minimum Gemini.
- **RSCH-05 design:** Cross-meeting memory data model (`sqlite-vec` in SQLCipher DB) — schema design, chunk granularity, and embedding strategy left to researcher's judgment.
- **Spike report format:** Researcher chooses format best communicating the capture-path comparison.

### Deferred Ideas (OUT OF SCOPE)
- Named speaker attribution (Speaker 1 → "Alice") — v2 post-meeting name-confirmation UX
- Integrations beyond calendar (Slack, Notion, CRM) — v2 candidates surfaced in RSCH-06 but not scoped for v1
- On-device mode full specification — carried from Phase 2 deferral
- Multi-version macOS testing for capture — deferred to build milestone QA
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RSCH-01 | Persona, positioning, and monetization model defined (resolves PROJECT.md TBDs: customer, revenue model, success metric) | Competitive landscape, pricing benchmarks, market positioning gaps, and persona signals in §RSCH-01 findings |
| RSCH-02 | Speaker-diarization approach decided — reliable baseline, whether/when to attempt 3+ speaker naming, trust bar | Deepgram Nova-3 diarization capability data, speaker count limits, accuracy characteristics in §RSCH-02 findings |
| RSCH-03 | Vendor DPA / no-training terms confirmed for Deepgram and chosen LLM provider(s) | DPA/opt-out mechanisms for Deepgram, OpenAI, Gemini API, AssemblyAI in §RSCH-03 findings |
| RSCH-04 | System-audio capture validated via hands-on throwaway spike comparing both capture paths | Spike plan with success criteria, known API surface, macOS version context in §RSCH-04 findings |
| RSCH-05 | Cross-meeting memory data model designed (`sqlite-vec`) | sqlite-vec schema patterns, chunk granularity strategy, embedding design in §RSCH-05 findings |
| RSCH-06 | Expanded use-case & feature discovery beyond starter list, consolidated for PRD scoping | Competitive feature gap analysis, meeting-type artifact format differences in §RSCH-06 findings |
</phase_requirements>

---

## Summary

Phase 3 is not a "build phase" — it is a **research execution phase** producing six discrete deliverables that gate the PRD (Phase 5). This RESEARCH.md documents what is known about each of the six RSCH requirements so the planner can construct precise, scoped tasks for each research work stream.

The primary risk is RSCH-04 (capture spike): this is the only hands-on code in the entire milestone, and it carries the highest technical uncertainty. The current machine runs macOS 26.5.1 (Tahoe), which is well above all library minimums and means the **Core Audio Taps path is available for both capture libraries**. On macOS 15+, the ScreenCaptureKit path is explicitly not recommended per Chromium flags documentation; the spike must therefore test both paths but the tester should expect the Core Audio Tap path to be the reliable one on this machine.

The market research (RSCH-01, RSCH-06) is a documentation-and-synthesis task with no implementation risk. The vendor terms research (RSCH-03) is a policy-review task with clear sources. The diarization research (RSCH-02) supplements confirmed capabilities with a recommendation. The data model design (RSCH-05) is a design-doc task with a clear schema pattern to follow.

**Primary recommendation:** Plan each RSCH item as a separate, parallel task where possible. The only sequencing dependency is that RSCH-03 results must be noted in the DEC-02 ADR after completion. RSCH-04 is the longest-running task (spike requires code + report); it should be planned with the most time buffer.

---

## Architectural Responsibility Map

This phase produces **documentation artifacts only** (research reports, data model design, spike report). There are no application tiers involved. The capture spike (RSCH-04) produces throwaway code that never enters the product codebase.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Market research (RSCH-01, RSCH-06) | Planning artifact | — | Web research → markdown report; no code |
| Vendor DPA confirmation (RSCH-03) | Planning artifact | → DEC-02 ADR update | Policy review → ADR note; no code |
| Capture spike (RSCH-04) | Throwaway experimental code | → written report | Isolated spike project, discarded after report |
| Diarization approach (RSCH-02) | Planning artifact | — | Analysis of Deepgram docs → recommendation |
| Cross-meeting data model (RSCH-05) | Planning artifact | → SQLCipher DB design | Schema design doc; no product code |

---

## RSCH-01 Findings: Persona, Positioning & Monetization

### Competitive Landscape (Confirmed Players)

[CITED: useluminix.com/reports] [CITED: granola.ai/blog]

| Tool | Approach | Pricing (Business tier) | Privacy Posture | Key Strength | Weakness |
|------|----------|------------------------|-----------------|--------------|----------|
| **Granola** | Bot-free, macOS-native, local audio capture, SOC 2 Type 2 (Jul 2025), \$43M raised May 2025 | \$14/user/mo | Best: audio never uploaded, cloud transcript only, no-training by contract | Hybrid note-taking UX, no visible bot | Mac-only, no speaker name memory, 30-day free history cap |
| **Fathom** | Bot-optional (April 2026 update added silent capture mode), unlimited free tier | \$15/user/mo | Flexible: 3 capture modes (bot-visible, audio-only, silent) | Unlimited free tier, 5.0 G2 rating (6k+ reviews), 30-sec summaries | Less CRM depth than Fireflies |
| **Fireflies.ai** | "Fred" bot joins calls, CRM-first, 100+ integrations | \$19/user/mo | Standard bot model; BIPA lawsuit filed Dec 2025 for voiceprint collection | Sales team depth, 100+ languages, AskFred cross-meeting search | Visible bot causes social friction; "like removing a deer tick" to cancel |
| **Otter.ai** | OtterPilot bot, real-time live captions | ~\$20/user/mo | Standard bot; federal class-action filed Aug 2025 for unauthorized recording | Real-time collaborative transcription | Litigation risk; bot persistence post-cancellation |
| **Notion AI** | Integrated meeting notes (requires Business plan since Aug 2025) | \$20/user/mo (Business required) | Google/Microsoft cloud storage | Seamless for existing Notion users | Requires Business plan upgrade; not standalone |
| **Meetily** | Open-source, 100% local transcription, no bot, offline | Free (individuals) | Maximum: everything local, BYOK | Privacy-maximum, zero cloud dependencies | Less polished UX, no team features |

### Market Size and Dynamics [CITED: useluminix.com/reports]

- AI meeting assistant market: **USD 3.67 billion in 2024**, projected **34.7% CAGR through 2034**
- 46–50% of workers cite privacy/security as top reason to **avoid** these tools
- 84% of users alter speech when AI is visibly present
- Real-world transcription accuracy in noisy multi-accent meetings: **~62%** (vs. 95%+ marketing claims)
- Speaker attribution errors: **11–13%** causing misattributed action items

### Positioning Gap for MeetingAssist

[ASSUMED — synthesis from competitive data, not a primary source]

The market has a clear underserved segment: **privacy-forward knowledge workers who want local-first capture without a bot, on macOS, with production-grade artifact quality**. Granola is the closest competitor but:
- Cloud-stores transcripts (not purely local)
- Mac-only but without cross-meeting memory
- No live assistant / break assist features
- No encrypted local storage (DEC-02 posture)

MeetingAssist's differentiation story: **local-first encrypted storage + no-bot + dual-channel capture + live in-meeting intelligence + production-grade artifact extraction**.

### Persona Signal

[ASSUMED — inferred from competitive positioning data]

Primary persona: **Independent knowledge workers and small teams** (PMs, founders, consultants, managers) who have back-to-back meetings, value accurate records over real-time collaboration, and are privacy-conscious enough to be blocked by cloud-only tools. Secondary persona: **Remote/hybrid teams** needing consistent meeting artifacts across Zoom, Meet, Teams, and in-person.

### Monetization Research

[CITED: useluminix.com/reports] [CITED: granola.ai/blog/meeting-notes-tool-pricing-benchmarks]

- Standard model: **monthly subscription with annual discount** (~40% cheaper annually)
- Individual tier: \$8–15/user/month (Otter \$8–17, Fathom \$15, Granola \$14 business)
- Business tier: \$14–30/user/month
- Market trend: trials/reverse trials convert better than permanent free tiers in 2025–2026
- Usage caps (minutes, AI credits) are the primary user frustration point — avoid hard caps
- Freemium with feature gating (not minute caps) is the emerging model
- Granola uses 30-day history cap as the upgrade trigger — effective for "aha moment" after first month of use

**Recommended hypothesis for PRD (RSCH-01 output to validate):**
- Free tier: time-limited trial (14 or 30 days) with full features — no minute cap
- Pro: \$12–15/user/month, unlimited meetings, full artifact suite
- No business tier for v1 — single-user product in initial release

---

## RSCH-02 Findings: Speaker Diarization Approach

### Deepgram Nova-3 Diarization Capabilities

[CITED: deepgram.com/learn/nextgen-speaker-diarization-and-language-detection-models]

- **Supports up to 12 speakers** (official documented limit; upgraded from 6–8 in Nova-2)
- **53.1% overall accuracy improvement** over prior version
- **61.5% improvement specifically for meetings** (the most relevant domain)
- **Free with all ASR models** — no additional per-minute charge for diarization
- Trained on **100,000+ speakers across 80+ languages**
- Performance: 10x faster turnaround than next-fastest vendor per Deepgram benchmarks
- Known weakness: **overlapping speech** — performance degrades when speakers talk simultaneously

[CITED: deepgram.com/learn/speech-to-text-benchmarks]

- Deepgram outperforms common open-source alternatives (PyAnnote) on domain-specific real-world data
- No published per-speaker-count accuracy breakdown — "up to 12 reliable" without cliff data

### V1 Speaker Cap Recommendation

**Recommend v1 cap: 8 speakers** — rationale:
- Deepgram officially supports 12, but no published accuracy breakdown by speaker count
- Overlapping speech degradation is the primary quality cliff, not total count
- 8 is a reasonable buffer below the 12 limit; covers the vast majority of real meeting scenarios
- Standard team meeting: 4–6 people; max common meeting: 8; beyond 8 is a conference/all-hands scenario where speaker attribution matters less for action items

### V1 Diarization Flow (Recommended for PRD)

```
Audio capture (mic channel + system audio channel)
     ↓
Deepgram Nova-3 streaming with diarization=true
     ↓
Per-word speaker field ("speaker": 0, "speaker": 1, ...)
     ↓
Transcript segments labeled "Speaker 1:", "Speaker 2:", ...
     ↓
Mic-channel always = "You" / "Speaker 0"
System-audio channel = "Speaker 1", "Speaker 2" ... (diarized by Deepgram)
```

### V2 Named Attribution (Deferred per D-10)

Post-meeting name-confirmation flow: "Speaker 1 said 3 things — who was this?" The label foundation in v1 makes this straightforward to add without re-processing transcripts.

---

## RSCH-03 Findings: Vendor DPA / No-Training Terms

### Deepgram [CITED: developers.deepgram.com/trust-security/data-privacy-compliance] [CITED: developers.deepgram.com/docs/the-deepgram-model-improvement-partnership-program]

| Requirement | Status | Action Required |
|-------------|--------|-----------------|
| No training on customer data | **Available via opt-out** | Add `mip_opt_out=true` query param to all API requests |
| Data retention for opted-out requests | **Minimum** — "only for duration necessary to process" | Opt out by default in all requests |
| DPA availability | Yes | Contact security@deepgram.com or per-region addendum |
| Compliance certifications | SOC 2 Type 1+2, GDPR, HIPAA, CCPA, PCI | Covered |
| EU data residency | Yes — `api.eu.deepgram.com` endpoint | Use if GDPR-sensitive |

**Verdict for DEC-02:** Deepgram API with `mip_opt_out=true` satisfies the DEC-02 local-first + no-training stance. No DPA signature required for API use; opt-out parameter is sufficient for development. Enterprise DPA available for commercial launch.

### OpenAI API [CITED: openai.com/enterprise-privacy/]

| Requirement | Status | Action Required |
|-------------|--------|-----------------|
| No training on customer data | **Default for API** (since March 1, 2023) | No action required — API data not used for training by default |
| Data retention | 30 days for abuse monitoring | Request ZDR via enterprise agreement to reduce to zero |
| Zero Data Retention (ZDR) | Available via enterprise agreement only | Not needed for development; flag for GA launch |
| DPA availability | Yes — Data Processing Addendum available | Sign for GDPR compliance |

**Verdict for DEC-02:** OpenAI API with default settings satisfies no-training requirement. 30-day retention for abuse monitoring is the only residual; ZDR available via enterprise agreement at GA.

### Google Gemini API [CITED: docs.cloud.google.com/gemini/docs/discover/data-governance]

| Requirement | Status | Action Required |
|-------------|--------|-----------------|
| No training on customer data | **Paid API only** — free tier DOES allow training | Must use paid quota — free tier explicitly NOT safe |
| Training restriction | Section 17 of Service Specific Terms for paid services | Ensure paid API key is always used |
| Zero data retention | Available via Vertex AI contractual amendments | Contact Google Cloud account team |
| DPA availability | Cloud Data Processing Addendum (CDPA) | Available |

**Verdict for DEC-02:** Gemini API on **paid quota** satisfies no-training requirement. Free tier is disqualified — never use free tier API key for meeting transcript processing. Document this as a product requirement: the app must validate that the user's Gemini API key is on a paid plan or fallback to a different provider.

### AssemblyAI (fallback STT provider) [CITED: assemblyai.com/docs/faq/can-i-sign-a-dpa-agreement-with-assemblyai]

| Requirement | Status | Action Required |
|-------------|--------|-----------------|
| DPA | **Auto-included in ToS** — no separate signature needed | None |
| Training opt-out | Available via API flag | Add opt-out flag to all requests |
| EU data residency | Available (Dublin, Ireland) | Use EU endpoint if needed |
| Compliance | SOC 2, PCI-DSS 4.0 Level 1 (Mar 2025) | Covered |

**Verdict for DEC-02:** AssemblyAI satisfies DEC-02 out of the box — DPA is automatic and training opt-out is available.

### DEC-02 ADR Update Required

After RSCH-03 task completes, the planner must add a task to update `02-DEC-02-data-handling-privacy.md` to note:
- Deepgram: `mip_opt_out=true` resolves the open dependency
- OpenAI: API default satisfies no-training; ZDR flagged for GA
- Gemini: Paid quota required; free tier prohibited
- AssemblyAI: DPA auto-included

---

## RSCH-04 Findings: Capture Spike Plan

### Current Machine Context

- **macOS version:** 26.5.1 (Tahoe) — well above all library minimums
- **Node.js:** v26.3.1
- **npm:** 11.16.0

### Capture Path 1: electron-audio-loopback (Chromium ScreenCaptureKit/Core Audio)

[CITED: github.com/alectrocute/electron-audio-loopback] [CITED: alec.is/posts/bringing-system-audio-loopback-to-electron/]

- **npm package:** `electron-audio-loopback@1.0.6` (verified on registry)
- **macOS requirement:** 12.3+
- **Electron requirement:** >=31.0.1
- **CRITICAL NOTE:** For Electron 39+, this package is NOT needed — native Chromium support built in
- **On macOS 15+ (including 26.x):** ScreenCaptureKit (`MacSckSystemAudioLoopbackOverride`) is NOT recommended; use Core Audio Taps (`MacCatapSystemAudioLoopbackCapture`) flag instead
- **Spike implementation:** Use `MacLoopbackAudioForScreenShare` + `MacCatapSystemAudioLoopbackCapture` flags; call `setDisplayMediaRequestHandler` with `"loopback"` audio param
- **Permissions:** "Screen & System Audio Recording" TCC permission required; purple screen-recording indicator appears in Control Center

### Capture Path 2: AudioTee.js (Core Audio Taps, Swift binary)

[ASSUMED — based on CLAUDE.md documentation; npm package name needs verification during spike]

- **macOS requirement:** 14.2+
- **Approach:** Wraps ~600KB universal Swift binary using `AudioHardwareCreateProcessTap` + aggregate device
- **Permissions:** "System Audio Recording Only" TCC + `NSAudioCaptureUsageDescription`; no purple screen-recording indicator
- **Entitlements:** Requires `com.apple.security.cs.disable-library-validation` to load bundled Swift binary
- **Audio quality:** Pre-mixer (volume-independent) — captures audio regardless of system volume setting
- **Current machine macOS 26.x:** Core Audio Tap APIs available

### Spike Architecture (Recommended Structure)

```
spike/
├── package.json          # electron + spike deps only, no product deps
├── main.js               # Electron main: IPC wiring, Deepgram connections
├── preload.js            # contextBridge for audio IPC
├── renderer.js           # Audio capture setup (both paths)
├── audio-processor.js    # AudioWorkletProcessor (from DNA, adapted)
└── SPIKE-REPORT.md       # Output artifact
```

### Spike Success Criteria (from D-03 + D-04)

1. Mac plays audio (video call, music, or audio file)
2. Mic channel captures voice simultaneously
3. System audio channel captures playback simultaneously
4. Both streams forwarded to Deepgram Nova-3 with `diarization=true`
5. Coherent transcript returned for both channels
6. Report documents: permissions dialog behavior, audio quality (subjective), any failures

### Known Risks for Spike

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| electron-audio-loopback not needed for Electron 39+ | HIGH — package may be vestigial on modern Electron | Test native Chromium flags directly first |
| AudioTee.js Swift binary signing required even for throwaway spike | MEDIUM | Use unsigned binary with `disable-library-validation` for spike only |
| Core Audio Taps flag (`MacCatapSystemAudioLoopbackCapture`) behavior on macOS 26.x untested | MEDIUM | Document result empirically in report |
| Purple recording indicator (ScreenCaptureKit path) cannot be tested for UX without system audio playing | LOW | Use audio file playback as test source |

### Spike Output Artifact

File: `03-RSCH-04-SPIKE-REPORT.md`

Required sections:
1. Environment (macOS version, Electron version, Node version)
2. Path 1 results (electron-audio-loopback / Chromium flags)
3. Path 2 results (AudioTee.js)
4. Side-by-side comparison: audio quality, permissions UX, macOS version floor, integration complexity
5. Architecture recommendation for PRD

---

## RSCH-05 Findings: Cross-Meeting Memory Data Model

### sqlite-vec Technical Foundation

[CITED: github.com/asg017/sqlite-vec] [CITED: medium.com/@stephenc211/how-sqlite-vec-works]

- Version `0.1.9` on npm registry (verified)
- Written in pure C, no external dependencies, runs anywhere SQLite runs
- Vectors stored in `vec0` virtual tables
- Supports float, int8, and binary vectors
- KNN queries via `MATCH` operator with `ORDER BY distance LIMIT k`
- Custom metadata columns supported (label, timestamp, etc.) for pre-filter before distance calculation
- Transactional semantics — vector inserts/updates/deletes are atomic within SQLite transactions
- Lives inside the same SQLCipher DB — **inherits encryption automatically**

### Recommended Schema Design

```sql
-- Meeting metadata table (regular SQLite table, SQLCipher encrypted)
CREATE TABLE meetings (
  id TEXT PRIMARY KEY,           -- UUID
  title TEXT,
  started_at INTEGER NOT NULL,   -- Unix timestamp
  ended_at INTEGER,
  participant_count INTEGER,
  raw_audio_path TEXT,           -- NULL if deleted after transcription (DEC-02 D-06)
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Transcript segments (regular table, searchable by meeting)
CREATE TABLE transcript_segments (
  id TEXT PRIMARY KEY,           -- UUID
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  speaker_label TEXT NOT NULL,   -- "Speaker 1", "You", etc.
  channel TEXT NOT NULL,         -- "mic" | "system"
  timestamp_start REAL NOT NULL, -- seconds from meeting start
  timestamp_end REAL NOT NULL,
  text TEXT NOT NULL,
  is_speech_final INTEGER NOT NULL DEFAULT 1,  -- Deepgram speech_final flag
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Vector chunks for cross-meeting semantic search (vec0 virtual table)
CREATE VIRTUAL TABLE vec_chunks USING vec0(
  embedding float[1536],         -- dimension matches chosen embedding model
  +chunk_id TEXT,                -- rowid + metadata columns
  +meeting_id TEXT,
  +speaker_label TEXT,
  +timestamp_start REAL,
  +text_preview TEXT             -- first 200 chars for display
);

-- Artifacts: MOM, summaries, action items (regular table)
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL,   -- "mom" | "summary" | "key_points" | "action_items" | "dates"
  content_json TEXT NOT NULL,    -- Structured JSON (Zod-validated output)
  model_used TEXT,               -- Which LLM produced this
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Action items (extracted from artifacts, first-class for calendar export)
CREATE TABLE action_items (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  assignee_label TEXT,           -- "Speaker 2", "You", etc.
  due_date TEXT,                 -- ISO 8601 or NULL
  ics_exported_at INTEGER,       -- NULL until exported
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

### Chunking Strategy for Cross-Meeting Search

[CITED: qdrant.tech/course/essentials/day-1/chunking-strategies/] [ASSUMED — recommended parameters]

- **Chunk unit:** Contiguous transcript segments by speaker turn or topic shift
- **Chunk size:** ~300–500 tokens per chunk (corresponds to ~3–5 transcript_segments)
- **Overlap:** 50-token overlap between adjacent chunks to prevent context split
- **Embedding dimension:** 1536 (matches `text-embedding-3-small` from OpenAI; also matches Gemini embedding models — allows provider swap)
- **When to embed:** After `speech_final` accumulates a chunk threshold OR at end-of-meeting batch pass
- **Privacy consideration (DEC-02):** Embeddings are derived from transcript text, not audio; they live in the same SQLCipher DB and are encrypted at rest

### KNN Query Pattern

```sql
-- Find top-5 transcript chunks most relevant to a query embedding
SELECT
  vc.chunk_id,
  vc.meeting_id,
  vc.speaker_label,
  vc.timestamp_start,
  vc.text_preview,
  vc.distance,
  m.title,
  m.started_at
FROM vec_chunks AS vc
JOIN meetings AS m ON m.id = vc.meeting_id
WHERE vc.embedding MATCH ?    -- query embedding as JSON array or binary
ORDER BY vc.distance
LIMIT 5;
```

### In-Meeting vs Cross-Meeting Architecture

| Use Case | Approach | Rationale |
|----------|----------|-----------|
| In-meeting chat ("What did she just say?") | Rolling transcript in LLM context (1M token window) | No embeddings needed; current meeting fits in context |
| End-of-meeting summary/MOM | Full transcript → LLM batch | Single pass over complete meeting |
| Cross-meeting recall ("What did we decide about auth last month?") | sqlite-vec KNN + transcript_segments fetch | Past meetings don't fit in context; semantic search surfaces relevant chunks |

---

## RSCH-06 Findings: Use-Case & Feature Discovery

### Meeting Type Taxonomy

[CITED: peoplemanagingpeople.com/tools/best-ai-meeting-assistants] [ASSUMED — artifact format mapping]

| Meeting Type | Primary Artifact Need | Secondary Artifact | Key Differentiator |
|-------------|----------------------|-------------------|-------------------|
| **Standup / Sync** | Who said what they'd do (blockers, progress) | Yesterday/today/blockers format | Brevity; structured by speaker |
| **1:1 (Manager-Report)** | Action items + follow-ups + commitments | Private notes | Attribution matters (You vs Them) |
| **Design/Tech Review** | Decisions made + rationale + open questions | Action items (who investigates what) | Decision capture is primary |
| **Sales Call / Demo** | Objections, commitments, next steps | Internal recap for product/marketing | Quote extraction from prospect |
| **Client / Stakeholder Briefing** | Key messages delivered + commitments | Follow-up email draft | Professional tone; no jargon |
| **All-hands / Town Hall** | Key announcements + Q&A highlights | Action items by team | High speaker count (>8); summary-heavy |
| **Interview** | Questions asked + candidate responses + assessment | Comparison across candidates | Audio quality critical; multi-speaker |
| **Training / Workshop** | Key concepts + exercises | Follow-up materials | Long-form; content-heavy |
| **Retrospective** | What went well / poorly + action items | Trend comparison | Structured format (start/stop/continue) |

### Competitive Feature Gap Analysis

[CITED: get-alfred.ai/blog/best-ai-meeting-notetakers] [CITED: useluminix.com/reports]

Features competitors offer that MeetingAssist should address in PRD scoping:

| Feature | Competitive Standard | MeetingAssist v1 Status | Note |
|---------|---------------------|------------------------|------|
| Real-time transcription | Table stakes (all tools) | Yes — core | |
| Meeting summary | Table stakes | Yes — core | |
| Action item extraction | Table stakes | Yes — core | |
| Speaker attribution | Table stakes | Yes — Speaker 1/2/3 in v1 | |
| Search past meetings | Table stakes (bot-based tools) | Cross-meeting via sqlite-vec | |
| Calendar integration / .ics export | Table stakes | Yes — .ics baseline in v1 | |
| Meeting-type-specific templates | Differentiator (Granola, Fireflies) | v1 candidate | PRD-01 decision |
| Cross-meeting search / Q&A | Differentiator (Fireflies AskFred) | v1 candidate via sqlite-vec | |
| Live in-meeting assistant | **MeetingAssist unique** vs bots | Yes — live assistant | Key differentiator |
| Break assist | **MeetingAssist unique** | Yes — core differentiator | |
| Vision (screenshot analysis) | Rare (DNA reference) | Yes — from DNA | |
| CRM integration (HubSpot, Salesforce) | Table stakes for sales tools | **v2** (per D-14) | |
| Slack / Notion export | Standard integration | **v2** (per D-14) | |
| Named speaker attribution | Differentiator (Jamie) | **v2** (per D-10) | |
| Cross-platform (Windows, Linux) | Most tools | macOS-first for v1 | Research question for PRD |
| Multi-language support | Fireflies leads (100+ languages) | Deepgram 80+ via Nova-3 | No extra work |
| Team collaboration | Most business tools | Single-user v1 | v2 |
| On-device / offline mode | Meetily (100% local), Natively | **v2** deferred (DEC-02 D-09) | |

### Notable Market Signals for PRD

[CITED: useluminix.com/reports] [CITED: granola.ai/blog]

1. **Bot-free is a differentiator becoming table stakes** — Fathom added silent capture in April 2026; users strongly prefer no-bot where privacy or social dynamics matter
2. **Otter litigation (Aug 2025)** and **Fireflies BIPA lawsuit (Dec 2025)** validate MeetingAssist's disclosed-consent-first posture (DEC-01) as both ethical and legally safer
3. **Granola's \$43M raise (May 2025)** validates significant investor confidence in macOS-native, bot-free approach — direct overlap with MeetingAssist's target
4. **Privacy is the top blocker** — 46–50% of workers cite it as why they don't use these tools; MeetingAssist's encrypted local-first storage (DEC-02) directly addresses this
5. **Speaker attribution errors (11–13%)** are a major quality pain point — the "trustworthy record" value requires addressing this through diarization quality (RSCH-02)

### V2 Integrations to Note (Not Scope for V1)

Per D-14, the following are surfaced as v2 candidates for PRD awareness:
- Slack (post summary to channel)
- Notion (create meeting page)
- HubSpot / Salesforce (CRM sync after sales calls)
- Google Calendar / Outlook (direct event creation beyond .ics)
- Zapier / Make (workflow automation)

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vector search in SQLite | Custom nearest-neighbor SQL | `sqlite-vec` vec0 virtual table | C-native, transactional, no extra process |
| Speaker diarization | Custom audio segmentation | Deepgram Nova-3 diarization=true | 61.5% better than prior gen; free with ASR |
| Structured LLM output parsing | Regex or JSON.parse on loose output | Zod schema + OpenAI `response_format` / Gemini `responseSchema` | Eliminates hallucinated fields and missing keys |
| System audio capture | Direct Core Audio C API in JS | `electron-audio-loopback` flags OR AudioTee.js | Proven paths; Core Audio is notoriously hard to get right |
| Transcript chunking | Custom tokenizer | Token-count via OpenAI tiktoken or equivalent | Off-by-one errors in chunking cause silent retrieval failures |
| DB encryption key management | Custom keychain | Electron `safeStorage` (Keychain-backed) | macOS Keychain is the right layer; hand-rolling is a security anti-pattern |

---

## Common Pitfalls

### Pitfall 1: Using Gemini Free Tier for Transcript Processing
**What goes wrong:** Meeting transcript data sent to Gemini free tier API is used by Google for model training, violating DEC-02 no-training stance.
**Why it happens:** Free tier API key looks identical to paid tier key in code; easy to test with free key and ship it.
**How to avoid:** Validate in settings that Gemini API key is on paid quota, or default to a different provider with unconditional no-training guarantee (OpenAI API default).
**Warning signs:** User sets Gemini as provider but has never added billing info.

### Pitfall 2: Assuming electron-audio-loopback is Required for Modern Electron
**What goes wrong:** Spike installs and configures `electron-audio-loopback` unnecessarily for Electron 39+, adding complexity that isn't needed.
**Why it happens:** Package was needed for Electron 31–38; CLAUDE.md references it without noting the Electron version boundary.
**How to avoid:** For Electron 41+ (the target), use native Chromium flags directly — no package needed. Verify during spike.
**Warning signs:** electron-audio-loopback package README says it targets Electron 31–38 workaround.

### Pitfall 3: ScreenCaptureKit Path on macOS 15+ Triggers Warning UX
**What goes wrong:** `MacSckSystemAudioLoopbackOverride` flag on macOS 15+ (Sequoia/Tahoe) causes the purple screen-recording indicator in Control Center. The indicator's label can confuse users ("Is this recording my screen?").
**Why it happens:** ScreenCaptureKit loopback and screen capture share the same TCC permission on macOS 15+.
**How to avoid:** On macOS 15+, use `MacCatapSystemAudioLoopbackCapture` (Core Audio Taps) flag instead. Spike must determine which flag works on the test machine and document the behavior.
**Warning signs:** Purple indicator appearing when audio starts, even though the user only consented to audio recording.

### Pitfall 4: sqlite-vec Requires SQLite Loaded with Extension
**What goes wrong:** `better-sqlite3-multiple-ciphers` opens the SQLCipher DB, but `sqlite-vec` extension must be explicitly loaded before the virtual table is usable.
**Why it happens:** sqlite-vec is a loadable extension, not bundled into better-sqlite3.
**How to avoid:** `db.loadExtension(sqliteVecPath)` before any vec0 table operations. The path must be resolved from the asar-unpacked location.
**Warning signs:** "no such table: vec_chunks" error at runtime despite the CREATE VIRTUAL TABLE having run at DB init.

### Pitfall 5: Diarization speaker IDs Reset Between API Connections
**What goes wrong:** Speaker "0" in the mic connection and Speaker "0" in the system audio connection are different people, but the same numeric ID is reused.
**Why it happens:** Each Deepgram WebSocket connection has independent speaker ID space.
**How to avoid:** Mic channel is always labeled "You" regardless of Deepgram speaker ID. System audio channel speaker IDs are prefixed with "Other:" or mapped to a separate speaker registry. Never merge speaker IDs across channels.
**Warning signs:** Transcript shows "Speaker 0" saying things from both the mic and system audio streams.

### Pitfall 6: Assuming Vendor Privacy Terms Without Verification
**What goes wrong:** DEC-02 ADR shipped as "complete" without RSCH-03 confirming Deepgram/LLM no-training terms — if terms turn out to require DPA negotiation (not just a query param), the PRD's data-handling posture is wrong.
**Why it happens:** RSCH-03 is a blocking dependency on DEC-02 finalization that can be overlooked during planning.
**How to avoid:** RSCH-03 task must complete and update DEC-02 ADR before PRD (Phase 5) begins.
**Warning signs:** DEC-02 ADR still has "pending RSCH-03 vendor confirmation" open dependency when Phase 4 starts.

---

## Environment Availability

| Dependency | Required By | Available | Version | Notes |
|------------|------------|-----------|---------|-------|
| Node.js | Spike code + all npm installs | ✓ | 26.3.1 | Well above any minimum |
| npm | Package management | ✓ | 11.16.0 | Current |
| macOS | Spike execution | ✓ | 26.5.1 (Tahoe) | Above 14.2+ for AudioTee.js; above 15+ for Core Audio Tap preference |
| Electron (for spike) | RSCH-04 spike | Available via npx | Will download at spike time | Target: 41.x or 42.x |
| Deepgram API key | RSCH-04 spike (transcript round-trip) | Must be user-provided | — | User must supply key for spike; spike fails silently without it |
| AudioTee.js binary | RSCH-04 spike Path 2 | Must be downloaded | — | npm package or repo — verify during spike planning |

**Missing dependencies with fallback:**
- Deepgram API key: spike cannot be run without a valid key — user must supply one. Planner should add a pre-spike task confirming key is available.
- AudioTee.js binary: availability needs verification at spike planning time.

---

## Package Legitimacy Audit

> Packages relevant to the RSCH-04 spike (throwaway code) and RSCH-05 data model design.

| Package | Registry | Age | Downloads/wk | Source Repo | Verdict | Disposition |
|---------|----------|-----|-------------|-------------|---------|-------------|
| `electron-audio-loopback` | npm | ~10 mo (Aug 2025) | 9,218 | github.com/alectrocute/electron-audio-loopback | OK | Approved — official author's package, referenced in Electron issue #47490 |
| `sqlite-vec` | npm | Active (Mar 2026 latest) | 2,966,151 | github.com/asg017/sqlite-vec | OK | Approved — asg017 is known author, 3M+ weekly downloads |
| `better-sqlite3-multiple-ciphers` | npm | Active (Jun 2026 latest) | 62,510 | github.com/m4heshd/better-sqlite3-multiple-ciphers | SUS (too-new latest version) | Approved — known package, referenced in CLAUDE.md. "Too-new" flag is a recent version publish, not a new package. m4heshd is the documented author. |
| `@deepgram/sdk` | npm | Active (Jun 2026 latest) | 605,770 | github.com/deepgram/deepgram-js-sdk | SUS (too-new latest version) | Approved — official Deepgram org repo, 600k+ downloads. "Too-new" flag is a recent version publish. |

**Packages removed due to [SLOP] verdict:** None

**Packages flagged as suspicious [SUS]:** `better-sqlite3-multiple-ciphers` and `@deepgram/sdk` flagged "too-new" by legitimacy seam due to recent version publishes. Both are established packages from documented authors; CLAUDE.md explicitly endorses both. No planner checkpoint required — the SUS flag is a false positive here.

---

## Validation Architecture

> nyquist_validation is enabled in config.json.

This phase produces **documentation artifacts only** (research reports, data model design documents, spike report). There is no application code to test.

The capture spike (RSCH-04) is throwaway experimental code with its own informal success criterion: does a coherent Deepgram transcript return? This is a pass/fail empirical test, not a test suite.

### Phase Requirements → Validation Map

| Req ID | Deliverable | Validation Approach | Automated? |
|--------|-------------|---------------------|-----------|
| RSCH-01 | Persona/positioning/monetization report | Human review: does it resolve PROJECT.md TBDs? | Manual |
| RSCH-02 | Diarization approach recommendation | Human review: does it answer D-09/D-10/D-11? | Manual |
| RSCH-03 | Vendor terms confirmation + DEC-02 ADR update | Human review: are DEC-02 open dependencies closed? | Manual |
| RSCH-04 | Spike report comparing both capture paths | Human review: does a transcript come back from both paths? | Manual (spike run) |
| RSCH-05 | Cross-meeting memory data model | Human review: is schema complete, consistent with DEC-02? | Manual |
| RSCH-06 | Use-case and feature discovery report | Human review: does it feed PRD-01 MVP boundary? | Manual |

**Wave 0 Gaps:** None — this is a pure research phase; no test framework needed.

---

## Security Domain

> security_enforcement: true in config.json.

### Applicable ASVS Categories for This Phase

This phase produces only research/design artifacts (markdown reports and a throwaway spike). No production code is written. ASVS controls apply to design decisions surfaced in the research, not to artifacts themselves.

| ASVS Category | Applies to Phase 3 | Control Surfaced in Research |
|---------------|--------------------|------------------------------|
| V2 Authentication | No (no auth code) | — |
| V3 Session Management | No | — |
| V4 Access Control | No | — |
| V5 Input Validation | Design only — Zod schema for LLM output (RSCH-02/05) | Use strict Zod schema for all structured outputs |
| V6 Cryptography | Design only — SQLCipher key for RSCH-05 schema | Electron `safeStorage` → macOS Keychain; never hand-roll key storage |

### Threat Patterns Surfaced

| Pattern | Applies | Mitigation Documented |
|---------|---------|----------------------|
| Cloud vendor training on meeting data | Yes — RSCH-03 | Opt-out params + paid quota requirement for Gemini |
| Vendor data breach (transcript cloud storage) | Yes — RSCH-03 | All transcripts stored locally (DEC-02); only API calls go to cloud |
| Unencrypted transcript on disk | Yes — RSCH-05 | SQLCipher mandatory; safeStorage for key |
| Unauthorized recording (consent bypass) | Design — DEC-01 | Consent gate per-meeting; DEC-01 ADR locked |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | MeetingAssist's differentiation story (local-first + no-bot + live intelligence) addresses a gap not fully covered by existing tools | RSCH-01 Positioning | Low — Granola's \$43M raise validates the space, but competitive moat needs ongoing validation |
| A2 | Recommended v1 pricing: free trial → Pro at \$12–15/user/mo is viable | RSCH-01 Monetization | Medium — user research needed to validate willingness-to-pay; price anchors from competitors are directional only |
| A3 | 8-speaker cap for v1 is sufficient for the vast majority of MeetingAssist meetings | RSCH-02 | Low — covers standard team meetings; edge case is large all-hands where speaker attribution matters less |
| A4 | AudioTee.js works on macOS 26.x without modification | RSCH-04 | Medium — must be validated in spike; 26.x is a newer macOS than the library's published requirement |
| A5 | Electron 41+ has native Core Audio Tap support without electron-audio-loopback | RSCH-04 | Medium — must be validated in spike; CLAUDE.md describes this as expected path |
| A6 | Embedding dimension of 1536 (text-embedding-3-small compatible) is appropriate for cross-meeting search | RSCH-05 | Low — can be changed at DB init; vec0 table dimension is fixed but DB can be recreated |
| A7 | 300–500 token chunk size is appropriate for meeting transcript semantic search | RSCH-05 | Low — empirically adjustable during build milestone; design doc is directional |

---

## Open Questions

1. **Does electron-audio-loopback serve any purpose on Electron 41+?**
   - What we know: Package README says "Electron 39+, you're in the clear — you won't require electron-audio-loopback." Chromium flags may be directly usable without the package.
   - What's unclear: Exactly which flags to enable and whether they need the package to work.
   - Recommendation: Spike starts by testing native flags without the package on Electron 41; only fall back to installing the package if native flags fail.

2. **What is AudioTee.js's exact npm package name?**
   - What we know: Referenced in CLAUDE.md as "audiotee.js"; not verified against npm registry in this session.
   - What's unclear: Exact package name for `npm install`.
   - Recommendation: Planner task for RSCH-04 must include a step to locate and verify the AudioTee.js npm package before spike coding begins.

3. **Does Deepgram diarization quality degrade notably between 4 and 8 speakers?**
   - What we know: Officially supports up to 12; "61.5% improvement for meetings" is an aggregate. No per-speaker-count breakdown published.
   - What's unclear: Whether there's an accuracy cliff between 4 and 8 speakers that warrants a lower v1 cap recommendation.
   - Recommendation: The RSCH-02 research task should attempt to find published per-speaker-count WER or DER data; if unavailable, 8 stands as conservative below the 12 limit.

4. **Which embedding model should be the default for cross-meeting search?**
   - What we know: 1536 dimensions covers OpenAI `text-embedding-3-small`; Gemini embedding models are also 1536-compatible.
   - What's unclear: Whether to hardcode a provider or use the same provider-agnostic adapter pattern as the LLM layer.
   - Recommendation: Apply same `baseURL` adapter pattern to embeddings — embedding provider is configurable. Document this in RSCH-05 output.

---

## Sources

### Primary (MEDIUM confidence — WebSearch verified against official sources)

- [deepgram.com/learn/nextgen-speaker-diarization-and-language-detection-models](https://deepgram.com/learn/nextgen-speaker-diarization-and-language-detection-models) — Nova-3 diarization improvement metrics, speaker count limits
- [developers.deepgram.com/docs/the-deepgram-model-improvement-partnership-program](https://developers.deepgram.com/docs/the-deepgram-model-improvement-partnership-program) — MIP opt-out mechanism (`mip_opt_out=true`), data retention for opted-out requests
- [developers.deepgram.com/trust-security/data-privacy-compliance](https://developers.deepgram.com/trust-security/data-privacy-compliance) — DPA availability, compliance certifications
- [openai.com/enterprise-privacy/](https://openai.com/enterprise-privacy/) — API default no-training, 30-day retention, ZDR via enterprise
- [docs.cloud.google.com/gemini/docs/discover/data-governance](https://docs.cloud.google.com/gemini/docs/discover/data-governance) — Paid vs free tier training distinction, Section 17 training restriction
- [assemblyai.com/docs/faq/can-i-sign-a-dpa-agreement-with-assemblyai](https://www.assemblyai.com/docs/faq/can-i-sign-a-dpa-agreement-with-assemblyai) — DPA auto-included in ToS
- [github.com/alectrocute/electron-audio-loopback](https://github.com/alectrocute/electron-audio-loopback) — macOS 12.3+ requirement, Electron 39+ native support, Core Audio vs ScreenCaptureKit flags
- [alec.is/posts/bringing-system-audio-loopback-to-electron/](https://alec.is/posts/bringing-system-audio-loopback-to-electron/) — Chromium flags for audio loopback, macOS 15+ recommendation
- [github.com/asg017/sqlite-vec](https://github.com/asg017/sqlite-vec) — vec0 schema, KNN query syntax, metadata columns
- [useluminix.com/reports/industry-analysis/ai-meeting-notes-comparison-granola-vs-otter-vs-fireflies-vs-fathom-2026](https://www.useluminix.com/reports/industry-analysis/ai-meeting-notes-comparison-granola-vs-otter-vs-fireflies-vs-fathom-2026) — Detailed pricing, competitive UX analysis, market problems
- [granola.ai/blog/meeting-notes-tool-pricing-benchmarks](https://www.granola.ai/blog/meeting-notes-tool-pricing-benchmarks) — Pricing benchmarks

### Secondary (MEDIUM confidence — WebSearch, cross-referenced)

- [deepgram.com/learn/speech-to-text-benchmarks](https://deepgram.com/learn/speech-to-text-benchmarks) — comparative benchmarks
- [deepgram.com/learn/introducing-nova-3-speech-to-text-api](https://deepgram.com/learn/introducing-nova-3-speech-to-text-api) — Nova-3 introduction
- npm registry: electron-audio-loopback@1.0.6, sqlite-vec@0.1.9, better-sqlite3-multiple-ciphers@12.11.1, @deepgram/sdk@5.4.0 — versions verified
- [medium.com/@stephenc211/how-sqlite-vec-works-for-storing-and-querying-vector-embeddings](https://medium.com/@stephenc211/how-sqlite-vec-works-for-storing-and-querying-vector-embeddings) — sqlite-vec chunk storage internals

---

## Project Constraints (from CLAUDE.md)

The following CLAUDE.md directives constrain research and downstream planning:

| Directive | Impact on Phase 3 |
|-----------|-------------------|
| No product code this milestone | Spike (RSCH-04) is explicitly throwaway; must not be merged into any product path |
| Every change committed + pushed | All research reports, spike report, ADR update committed as planning artifacts |
| `better-sqlite3-multiple-ciphers` (SQLCipher) for transcripts/artifacts | RSCH-05 data model must be compatible — schema uses SQLCipher, never plain SQLite |
| `electron-audio-loopback` as default capture, AudioTee.js as premium path | Spike must test both; RSCH-04 report must make a recommendation for the PRD |
| Deepgram Nova-3 (upgrade from Nova-2) | RSCH-02 diarization research uses Nova-3 as the target, not Nova-2 |
| OpenAI SDK `baseURL` provider-agnostic adapter | RSCH-05 embedding design should follow same pattern — embedding provider is swappable |
| `sqlite-vec` for cross-meeting recall | RSCH-05 schema design is non-optional; it is a locked stack decision |
| `electron-store` only for small prefs | RSCH-05 data model must NOT use electron-store for transcripts or artifacts |
| `safeStorage` for secrets/keys | RSCH-05 schema design notes encryption key management via safeStorage — do not design alternative |
| macOS-first platform | All capture spike research is macOS-only; cross-platform is a PRD question, not a spike concern |

---

## Metadata

**Confidence breakdown:**
- RSCH-01 market landscape: MEDIUM — based on web sources, Granola funding confirmed, pricing cited from multiple sources
- RSCH-02 diarization: MEDIUM — official Deepgram docs cited; per-speaker accuracy breakdown [ASSUMED] based on aggregate metrics
- RSCH-03 vendor terms: MEDIUM — official docs for all four vendors; specific DPA workflow details (contact process) may require direct vendor engagement
- RSCH-04 spike plan: MEDIUM — capture API well-documented; AudioTee.js exact npm name is [ASSUMED] pending spike verification
- RSCH-05 data model: MEDIUM — sqlite-vec API confirmed; chunking parameters [ASSUMED] as standard RAG values
- RSCH-06 use cases: MEDIUM — competitive features cited; meeting-type artifact format mapping [ASSUMED] based on synthesis

**Research date:** 2026-06-25
**Valid until:** 2026-07-25 (30 days — market data, vendor terms, and npm versions move but not daily)
