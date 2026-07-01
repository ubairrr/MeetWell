# Roadmap: MeetingAssist

## Milestones

- ✅ **v1.0 Discovery & PRD** — Phases 1–5 (shipped 2026-06-26)
- ✅ **v2.0 Build** — Phases 6–11 (shipped 2026-07-01)
- 📋 **v3.0 Advanced Assistant Features** — Phases 12–15 (planned)

## Phases

<details>
<summary>✅ v1.0 Discovery & PRD (Phases 1–5) — SHIPPED 2026-06-26</summary>

- [x] Phase 1: DNA Deep Dive & Project Setup — completed 2026-06-25
- [x] Phase 2: Foundational Decisions & ADRs — completed 2026-06-25
- [x] Phase 3: Deep Research (RSCH-01–04 spikes) — completed 2026-06-26
- [x] Phase 4: AI Grounding / Context Spec / AI-SPEC — completed 2026-06-26
- [x] Phase 5: PRD Finalization (ARCHITECTURE, FEATURE-SPEC, BUILD-ORDER, PRD) — completed 2026-06-26

Full details: `.planning/milestones/v1.0-ROADMAP.md` (if archived) or `.planning/phases/01–05`

</details>

<details>
<summary>✅ v2.0 Build (Phases 6–11) — SHIPPED 2026-07-01</summary>

- [x] Phase 6: Foundation & Scaffold (7/7 plans) — completed 2026-06-26
- [x] Phase 7: Capture + TranscriptStore (7/7 plans) — completed 2026-06-27
- [x] Phase 8: ArtifactPipeline (1/1 consolidated plan) — completed 2026-06-27
- [x] Phase 9: Overlay UI + Live Summary Board (7/7 plans) — completed 2026-06-28
- [x] Phase 10: ContextEngine + Break Assist (7/7 plans) — completed 2026-06-28
- [x] Phase 11: Packaging + Eval Harness (7/7 plans) — completed 2026-06-28

Full details: `.planning/milestones/v2.0-ROADMAP.md`

</details>

### 📋 v3.0 Advanced Assistant Features (Planned)

**Milestone Goal:** Layer the deferred v2 differentiators onto the shipped v1/v2.0 core — named speaker attribution, meeting-type artifact templates, cross-meeting semantic search, and a live grounded assistant chat. Code signing/notarization and direct calendar APIs remain out of scope for this milestone.

- [ ] **Phase 12: Named Speaker Attribution** - Manual per-meeting speaker relabeling that propagates to every downstream artifact, export, and citation
- [ ] **Phase 13: Meeting-Type Artifact Templates** - Session-start meeting type selection producing genuinely distinct MOM/summary structures per type
- [ ] **Phase 14: Cross-Meeting Semantic Search** - Dedicated search panel over all past meetings, including a backfill for pre-milestone history
- [ ] **Phase 15: Live Assistant Interactive Chat** - In-overlay chat grounded in the current meeting and relevant past meetings, with citations

## Phase Details

### Phase 12: Named Speaker Attribution

**Goal**: Users can correct any diarized "Speaker N" label to a real display name during or after a meeting, and that correction is reflected everywhere the speaker appears for that meeting — without ever mutating the immutable transcript record or leaking across meetings.
**Depends on**: Nothing new — builds directly on the shipped v2.0 codebase (independent of Phases 13–15)
**Requirements**: SPKR-01, SPKR-02, SPKR-03, SPKR-05
**Success Criteria** (what must be TRUE):

  1. User can rename a diarized speaker label (e.g. "Speaker 1") to a custom display name via an in-app relabeling UI, during or after a meeting
  2. Renamed speaker names appear consistently across the MOM, summary, key points, action items, and citations for that meeting
  3. Renamed speaker names appear in the exported .ics file and any other export surface for that meeting
  4. Renaming a speaker in one meeting has zero effect on the speaker labels shown in any other meeting

**Plans**: 4 plans

Plans:
**Wave 1**

- [ ] 12-01-PLAN.md — speaker_aliases DDL, speakerRename.ts propagation utilities, SpeakerAliasStore (Wave 1)
- [ ] 12-02-PLAN.md — CalendarExportService regression test coverage (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 12-03-PLAN.md — get-speaker-roster / rename-speakers IPC handlers (Wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 12-04-PLAN.md — RenameSpeakersModal UI + ArtifactReview wiring (Wave 3)

**UI hint**: yes

### Phase 13: Meeting-Type Artifact Templates

**Goal**: Users can optionally declare what kind of meeting this is at session start and receive an artifact whose structure and content genuinely fits that meeting type, without weakening the faithfulness of the underlying transcript extraction.
**Depends on**: Nothing new — independent of Phase 12; builds directly on the shipped v2.0 codebase
**Requirements**: TMPL-01, TMPL-02, TMPL-03, TMPL-04, TMPL-05
**Success Criteria** (what must be TRUE):

  1. User can select a meeting type (Standup, 1:1, Planning, or General/default) from a selector view at session start
  2. Meeting type selection is optional and non-blocking — declining it starts the meeting with the General template
  3. Standup, 1:1, and Planning meetings each produce a distinctly structured MOM/summary artifact, not just relabeled fields
  4. Each meeting type's generated content reflects a type-specific extraction prompt (e.g. Standup surfaces blockers, 1:1 surfaces feedback themes, Planning surfaces decisions/next steps), not a generic one
  5. The verbatim-quote extraction stage (Stage 1) produces identical behavior regardless of the selected meeting type — only Stage 2 generation varies

**Plans**: TBD
**UI hint**: yes

### Phase 14: Cross-Meeting Semantic Search

**Goal**: Users can search across their entire meeting history — including meetings recorded before this milestone — through a dedicated panel, and trust that every result is correctly attributed and drawn from a consistent embedding index.
**Depends on**: Phase 12 (reuses the speaker-resolution logic so search results reflect renamed speakers)
**Requirements**: SRCH-01, SRCH-02, SRCH-03, SRCH-04, SPKR-04
**Success Criteria** (what must be TRUE):

  1. User can search across past meetings via a dedicated search panel view and see relevant results
  2. Each search result shows the matching quote plus the source meeting's name/date and speaker — reflecting any renamed speaker attribution for that meeting
  3. Meetings recorded before this milestone are backfilled and appear in search results, not just newly recorded meetings
  4. Each indexed chunk records which embedding model/version produced it, so results are never mixed across incompatible embeddings

**Plans**: TBD
**UI hint**: yes

### Phase 15: Live Assistant Interactive Chat

**Goal**: Users can converse with an assistant during a live meeting that answers are grounded in the current meeting plus relevant past meetings, always shows its evidence, and is honest when it has no answer.
**Depends on**: Phase 14 (cross-meeting grounding is meaningless without the search backbone already in place)
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05, CHAT-06
**Success Criteria** (what must be TRUE):

  1. User can ask questions in a chat panel component during a live meeting and receive answers grounded in the current meeting's transcript/context
  2. Chat answers include citations back to verbatim source transcript quotes, produced via the same evidence-extraction → constrained-generation pattern used elsewhere in the product — never generated directly from raw context
  3. Chat answers incorporate relevant, correctly-attributed context from past meetings, always excluding the current meeting from its own cross-meeting retrieval
  4. User can trigger "summarize the last N minutes" as a one-click quick action inside the chat panel
  5. When no relevant information is found for a question, chat explicitly states that rather than fabricating an answer

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 12 → 13 → 14 → 15

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. DNA Deep Dive & Project Setup | v1.0 | 3/3 | ✅ Complete | 2026-06-25 |
| 2. Foundational Decisions & ADRs | v1.0 | 2/2 | ✅ Complete | 2026-06-25 |
| 3. Deep Research | v1.0 | 6/6 | ✅ Complete | 2026-06-26 |
| 4. AI Grounding / AI-SPEC | v1.0 | 2/2 | ✅ Complete | 2026-06-26 |
| 5. PRD Finalization | v1.0 | 4/4 | ✅ Complete | 2026-06-26 |
| 6. Foundation & Scaffold | v2.0 | 7/7 | ✅ Complete | 2026-06-26 |
| 7. Capture + TranscriptStore | v2.0 | 7/7 | ✅ Complete | 2026-06-27 |
| 8. ArtifactPipeline | v2.0 | 1/1 | ✅ Complete | 2026-06-27 |
| 9. Overlay UI + Live Summary Board | v2.0 | 7/7 | ✅ Complete | 2026-06-28 |
| 10. ContextEngine + Break Assist | v2.0 | 7/7 | ✅ Complete | 2026-06-28 |
| 11. Packaging + Eval Harness | v2.0 | 7/7 | ✅ Complete | 2026-06-28 |
| 12. Named Speaker Attribution | v3.0 | 0/4 | 📋 Not started | - |
| 13. Meeting-Type Artifact Templates | v3.0 | 0/? | 📋 Not started | - |
| 14. Cross-Meeting Semantic Search | v3.0 | 0/? | 📋 Not started | - |
| 15. Live Assistant Interactive Chat | v3.0 | 0/? | 📋 Not started | - |

## Roadmap Rationale

Phase structure follows research (`.planning/research/SUMMARY.md`) dependency ordering exactly: Phase 12 and 13 are independent, low-risk phases validating new architectural patterns (new domain folder + IPC pair; new session-start payload field) before Phase 14's riskier `vec_chunks` schema decision. Phase 15 ships last because its differentiating cross-meeting grounding has a hard dependency on Phase 14's search backbone.

One deviation from research's requirement grouping: **SPKR-04** ("renamed speaker attribution appears correctly in cross-meeting search results") is mapped to **Phase 14**, not Phase 12, even though it is a Speaker Attribution-numbered requirement. Phase 12 builds the read-time speaker resolver, but SPKR-04's actual observable behavior — renamed names showing up correctly in search results — cannot be verified until the search panel exists in Phase 14. Assigning it to Phase 12 would leave an unverifiable success criterion at that phase's completion; assigning it to Phase 14 keeps every phase's success criteria genuinely checkable by a human at the moment that phase finishes. Phase 14 depends on Phase 12 as a result, reusing its resolver rather than re-implementing it.
