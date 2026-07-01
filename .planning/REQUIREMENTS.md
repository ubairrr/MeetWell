# Requirements: MeetingAssist

**Defined:** 2026-07-01
**Core Value:** A user walks out of any meeting with an accurate, trustworthy record and a ready-to-act set of artifacts — minutes, decisions, action items, dates — without having taken a single note.

## v1 Requirements

Requirements for the v3.0 "Advanced Assistant Features" milestone. Each maps to roadmap phases.

### Named Speaker Attribution

- [ ] **SPKR-01**: User can rename a diarized speaker label to a display name during or after a meeting
- [ ] **SPKR-02**: Renamed speaker attribution persists and applies to all downstream artifacts (MOM, summary, action items, citations) for that meeting
- [ ] **SPKR-03**: Renamed speaker attribution appears in exported .ics and any other export surfaces
- [ ] **SPKR-04**: Renamed speaker attribution appears correctly in cross-meeting search results
- [ ] **SPKR-05**: Speaker labels are scoped per meeting — renaming in one meeting does not affect other meetings' speaker labels

### Meeting-Type Artifact Templates

- [ ] **TMPL-01**: User selects a meeting type (Standup, 1:1, Planning, or General/default) at session start
- [ ] **TMPL-02**: Meeting type selection is optional and non-blocking — defaults to General if not chosen
- [ ] **TMPL-03**: Each meeting type produces a distinctly structured MOM/summary artifact (not just relabeled fields)
- [ ] **TMPL-04**: Standup, 1:1, and Planning each have type-specific extraction prompts guiding Stage 2 generation
- [ ] **TMPL-05**: Stage 1 verbatim-quote extraction remains template-agnostic and unchanged regardless of meeting type

### Cross-Meeting Semantic Search

- [ ] **SRCH-01**: User can search across past meetings via a dedicated search panel
- [ ] **SRCH-02**: Search results show the matching quote plus meeting name/date and speaker
- [ ] **SRCH-03**: All meetings, including those recorded before this milestone, are embedded and searchable via a backfill job
- [ ] **SRCH-04**: Search index tracks embedding model/version per chunk to avoid mixing incompatible embeddings

### Live Assistant Interactive Chat

- [ ] **CHAT-01**: User can ask questions in a chat panel during a live meeting, grounded in the current meeting's transcript/context
- [ ] **CHAT-02**: Chat answers include citations back to source transcript quotes
- [ ] **CHAT-03**: Chat incorporates relevant context from past meetings (cross-meeting grounding), excluding the current meeting from its own retrieval
- [ ] **CHAT-04**: Chat responses use the two-stage evidence-extraction → constrained-generation pattern — never generated directly from raw context without an extraction step
- [ ] **CHAT-05**: User can ask the assistant to "summarize the last N minutes" as a quick action
- [ ] **CHAT-06**: Chat explicitly indicates when no relevant information is found rather than fabricating an answer

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Distribution

- **DIST-01**: Code signing + notarization with Apple Developer ID Application cert
- **DIST-02**: Full live eval harness run (all 60 corpus cases)
- **DIST-03**: Gatekeeper-approved DMG verified on fresh macOS 14.2+ machine

### Calendar Integration

- **ADV-05**: Google Calendar / Outlook direct API integration (.ics covers v1/v3.0; OAuth is a later feature)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Voiceprint-based automatic speaker identification | Biometric/consent risk; contradicts the product's proposed-with-confirm ethos — explicit anti-feature, not merely deferred |
| Cross-meeting persistent speaker identity ("remember this speaker" beyond per-meeting relabeling) | Not resolved as in-scope by PROJECT.md; per-meeting scope keeps the data model simple and avoids cross-meeting identity-matching risk |
| Fully custom user-defined artifact templates beyond the 3 fixed types | Adds unbounded schema/prompt surface; validate the 3 fixed types first |
| Chat-triggered auto-actions (auto-scheduling, auto-writing to external systems) | Blocked by the absolute proposed-with-confirm contract (04-AI-SPEC) |
| Meeting-type auto-detection/auto-suggestion | User-selection only for v3.0; auto-detection adds ambiguity risk without validated need |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SPKR-01 | Phase 12 | Pending |
| SPKR-02 | Phase 12 | Pending |
| SPKR-03 | Phase 12 | Pending |
| SPKR-04 | Phase 14 | Pending |
| SPKR-05 | Phase 12 | Pending |
| TMPL-01 | Phase 13 | Pending |
| TMPL-02 | Phase 13 | Pending |
| TMPL-03 | Phase 13 | Pending |
| TMPL-04 | Phase 13 | Pending |
| TMPL-05 | Phase 13 | Pending |
| SRCH-01 | Phase 14 | Pending |
| SRCH-02 | Phase 14 | Pending |
| SRCH-03 | Phase 14 | Pending |
| SRCH-04 | Phase 14 | Pending |
| CHAT-01 | Phase 15 | Pending |
| CHAT-02 | Phase 15 | Pending |
| CHAT-03 | Phase 15 | Pending |
| CHAT-04 | Phase 15 | Pending |
| CHAT-05 | Phase 15 | Pending |
| CHAT-06 | Phase 15 | Pending |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0 ✓

**Note:** SPKR-04 is mapped to Phase 14 (Cross-Meeting Semantic Search) rather than Phase 12 (Named Speaker Attribution), since its observable behavior — renamed speakers appearing correctly in search results — cannot be verified until the search panel exists. See ROADMAP.md "Roadmap Rationale" for detail.

---
*Requirements defined: 2026-07-01*
*Last updated: 2026-07-01 after v3.0 roadmap creation (Phases 12–15, 20/20 requirements mapped)*
