# Phase 13: Meeting-Type Artifact Templates - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can optionally declare a meeting type (Standup, 1:1, Planning, or General/default) at session start. The selection produces a structurally distinct Minutes of Meeting (MOM) artifact for that type — not just relabeled fields — while Stage 1 verbatim-quote extraction and the Summary/Key Points/Action Items artifacts remain unchanged regardless of type.

Covers requirements TMPL-01, TMPL-02, TMPL-03, TMPL-04, TMPL-05.

</domain>

<decisions>
## Implementation Decisions

### Type selector UI
- **D-01:** The meeting type selector lives inside `ConsentGate.tsx`, as a row of 4 segmented buttons (General / Standup / 1:1 / Planning) shown above the existing consent checkbox — not a separate screen before ConsentGate. `General` is preselected by default. This keeps session start to one screen and satisfies TMPL-02 (optional, non-blocking) without adding a click before every meeting.
- The selected type is passed alongside the existing `consent-confirmed` IPC payload (`{ meetingId, timestamp }`) so it can be persisted on the `meetings` row at session creation.

### MOM structure — one flexible template, type-conditional sections
- **D-02:** Stage 2 MOM generation uses **one shared prompt template**, not 4 fully bespoke prompts. The template has a minimal universal skeleton — **Attendees** and **Action Items** table only — and a `{type_sections}` slot filled from a per-type section-spec object.
- **D-03:** Per-type section specs (this is where the real structural distinction lives, per SC-3/SC-4):
  - **General** (today's existing behavior, unchanged): Agenda Items Discussed, Key Discussion Points, Decisions Made, Next Steps
  - **Standup**: Yesterday, Today, Blockers
  - **1:1**: Discussion Topics, Feedback Themes, Growth Notes, Follow-ups
  - **Planning**: Decisions, Next Steps, Open Questions
- **D-04:** Mechanically this is "one template" (single prompt-building function, single LLM call shape, single `MoMSchema` output), but the section spec swap makes each type's *output* genuinely distinct — satisfies SC-3's "not just relabeled fields" bar without needing 4 independently-maintained prompt strings.
- **Rationale for choosing this over bespoke-per-type prompts:** less prompt duplication to keep in sync when Stage 1 anchor format changes; the minimal-shared-skeleton + type-specific-sections split still produces structurally different markdown per type, which is what SC-3 actually requires.

### Scope of variance across artifacts
- **D-05:** **Only MOM varies by meeting type.** Summary, Key Points, and Action Items keep today's single generic Stage 2 prompt for all 4 meeting types — `runStage2Summary`, `runStage2KeyPoints`, `runStage2ActionItems` are unchanged. "Important point" and "commitment" mean the same thing regardless of meeting type; only the MOM's narrative structure needs to reflect the meeting's shape.
- **D-06 (unchanged, reaffirmed):** Stage 1 (`runStage1`) is completely untouched by `meeting_type` — same verbatim-extraction prompt for every type (TMPL-05).

### Storage & migration
- **D-07:** Add `meeting_type TEXT NOT NULL DEFAULT 'general' CHECK (meeting_type IN ('general','standup','1:1','planning'))` to the `meetings` table DDL in `src/main/store/db.ts`. Existing rows get `'general'` automatically via the column default — no backfill migration needed since `better-sqlite3`'s `CREATE TABLE IF NOT EXISTS` won't retroactively add the column to an already-created table, so this requires an `ALTER TABLE meetings ADD COLUMN` migration step alongside the DDL for existing installed DBs (Claude's discretion on exact migration mechanism — see below).
- **D-08:** `ArtifactPipeline` stamps the `meeting_type` that produced the MOM into the artifact's `content_json` (e.g., a `meeting_type` field alongside `markdown_content` in the `MoM` schema/content) — so `ArtifactReview`/rendering code can read it directly from the artifact without a second DB join back to `meetings`.

### Claude's Discretion
- Exact migration mechanism for adding `meeting_type` to already-existing `meetings` tables in installed DBs (e.g., a versioned migration runner, or a defensive `ALTER TABLE ... ADD COLUMN` wrapped in a try/catch against "duplicate column" at DB init) — follow whatever pattern (if any) already exists in `src/main/store/db.ts` for schema evolution; if none exists, this is the first one and should be structured for reuse by later phases (Phase 14's `vec_chunks` columns).
- Exact `{type_sections}` prompt-templating mechanism (string interpolation vs. a small per-type object walked into markdown section headers) — implementation detail of `runStage2Mom`.
- Whether `'1:1'` as a CHECK-constraint/enum value needs escaping/quoting concerns in SQL — verify during implementation (colon is not a special SQL character, but worth a explicit check).
- Segmented button visual styling in `ConsentGate.tsx` — follow existing inline-style conventions already used in that file (no CSS framework in play).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product & requirements
- `.planning/PROJECT.md` — v3.0 milestone framing; locked key decision "Meeting-type variance lives in `content_json` + a new `meetings.meeting_type` column — never a new `artifact_type` CHECK-constraint value" (this phase implements that decision)
- `.planning/REQUIREMENTS.md` — TMPL-01 through TMPL-05 (Meeting-Type Artifact Templates section)
- `.planning/ROADMAP.md` §"Phase 13: Meeting-Type Artifact Templates" — goal, success criteria (SC-1 through SC-5), independent of Phase 12
- `.planning/STATE.md` — Active Decisions and Critical Anti-Patterns to Enforce (the `meeting_type` column decision and "Stage 1 verbatim-quote extraction must stay template-agnostic — only Stage 2 varies by `meeting_type`" anti-pattern originate here)

### Architecture
- `.planning/phases/05-prd-finalization/05-ARCHITECTURE.md` — DB DDL conventions, IPC contract conventions (channel typing, contextBridge allowlist pattern for the extended `consent-confirmed` payload)
- `.planning/phases/04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md` — two-stage extraction contract (Stage 1 verbatim quotes → Stage 2 structured generation); this phase's entire design (D-05, D-06) exists to preserve this contract while adding type variance only at Stage 2

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/renderer/src/components/ConsentGate.tsx` — the target file for D-01's segmented button row; `handleConfirm()` (line 66-73) already builds the `consent-confirmed` IPC payload and is where `meetingType` gets added.
- `src/main/pipeline/ArtifactPipeline.ts:111-152` (`runStage2Mom`) — the target function for D-02/D-03's `{type_sections}` templating; currently a single hardcoded prompt string that needs to become type-parameterized.
- `src/shared/schemas/index.ts:31-34` (`MoMSchema`) — currently `{ markdown_content: string }`; needs the `meeting_type` field added per D-08.

### Established Patterns
- IPC channels are allowlisted in `src/preload/index.ts` (`INVOKE_CHANNELS` array) — `consent-confirmed`'s payload type needs updating wherever it's typed, not the channel list itself (channel already exists).
- All Stage 2 prompts follow the same shape: ABSOLUTE RULES numbered list → meeting date → INPUT FORMAT → OUTPUT FORMAT. The new type-conditional MOM prompt should preserve this shape, varying only the OUTPUT FORMAT section list.
- `ArtifactPipeline.run()` (line 280) currently calls `runStage2Mom(anchors, meetingDate)` — will need a third parameter for `meetingType`, sourced from the `meetings` table row (already loaded via `getMeetingDate()`'s query pattern at line 66-70).

### Integration Points
- `src/main/store/db.ts:12-20` (`meetings` table DDL) — needs the new `meeting_type` column (D-07); this is the first schema-evolution case for an already-shipped table, so the migration approach set here will be a precedent for Phase 14's `vec_chunks` column additions.
- `src/main/session/SessionManager.ts` — wherever the `meetings` row is inserted on `consent-confirmed`, the `meetingType` from the IPC payload needs to flow into that INSERT.
- `src/renderer/src/components/ArtifactReview.tsx` — no rendering changes required since MOM stays markdown; per-type sections render identically to today's sections, just with different headers/content (D-08's `meeting_type` field is available if any future type-aware UI treatment is wanted, but none is needed for this phase's success criteria).

</code_context>

<specifics>
## Specific Ideas

No specific visual mockups given — segmented buttons should follow ConsentGate.tsx's existing inline-style conventions (see the existing checkbox/button styling in that file for spacing/font-size precedent).

</specifics>

<deferred>
## Deferred Ideas

- **Type-specific Summary/Key Points/Action Items prompts** — considered and explicitly rejected for this phase (D-05). If future user feedback shows the generic Summary reads oddly for Standup/1:1 meetings, revisit as a follow-up enhancement, not a blocker for this phase.
- **Fully custom user-defined templates beyond the 3 fixed types** — already out of scope per REQUIREMENTS.md "Out of Scope" table; not re-litigated here.
- **Meeting-type auto-detection** — already out of scope per REQUIREMENTS.md "Out of Scope" table; not re-litigated here.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 13-meeting-type-artifact-templates*
*Context gathered: 2026-07-02*
