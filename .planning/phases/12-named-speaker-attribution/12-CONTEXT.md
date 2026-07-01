# Phase 12: Named Speaker Attribution - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can rename any diarized speaker label ("Speaker 1", "Speaker 2", ... or "You") to a real display name, once the meeting has ended, via a dedicated modal in ArtifactReview. The rename propagates to every downstream artifact for that meeting — MOM prose, summary, key points, action item ownership, citations — without ever mutating `transcript_segments.speaker_label`, and without leaking across meetings.

Covers requirements SPKR-01, SPKR-02, SPKR-03, SPKR-05. (SPKR-04 — renamed speakers in cross-meeting search — is Phase 14's responsibility, not this phase's.)

</domain>

<decisions>
## Implementation Decisions

### Rename UI & entry point
- **D-01:** A "Rename Speakers" button in ArtifactReview opens a dedicated modal listing every distinct `speaker_label` detected in the meeting (not inline click-to-rename scattered across citations).
- **D-02:** Each speaker row in the modal shows a representative transcript excerpt (first substantial line from `transcript_segments` for that `speaker_label`) next to the rename text input, so the user can tell speakers apart without leaving the screen.
- **D-03:** Renames are staged in the modal and committed as a single batch on one "Save" — one IPC call carrying the full label→name mapping, not per-field auto-save.

### When renaming is allowed
- **D-04:** Rename UI is available post-meeting only, in ArtifactReview (session `Complete` state). Live renaming during `Capturing`/`OnBreak` — which would require synchronizing the live overlay's `SummaryCardTimer`/`LiveSummaryBoard` — is explicitly out of scope for this phase (see Deferred Ideas).

### Propagating renames into already-generated content
- **D-05:** On save, apply a word-boundary-aware find/replace of each exact `speaker_label` token across the meeting's stored artifact `content_json` — this covers LLM-generated prose (MOM, key points, summary) that already contains the label baked into sentences, since Stage 2 generation is explicitly instructed not to substitute real names at generation time.
- **D-06:** Structured fields — `action_items.assignee_label` and any `speaker_label` references embedded inside artifact `content_json` (e.g. citation anchors) — are updated the same way: direct mutation on save, not resolved via a join at read time. One mechanism for all artifact-level propagation.
- **D-07:** No Stage 2 LLM re-run on rename — the find/replace approach is deterministic, free, and instant.
- **Boundary (already locked at project level, not re-discussed here):** `transcript_segments.speaker_label` is never mutated — resolved via a new `speaker_aliases` table `(meeting_id, original_label)` at read time for that one table only. The anti-pattern protects the immutable raw transcript; it does not extend to derived artifacts, which this phase's find/replace approach intentionally does mutate.

### "You" (mic channel) label
- **D-08:** "You" is included in the rename modal alongside "Speaker 1/2/3" — it's just another `speaker_label` value in `transcript_segments`, so the same rename mechanism applies uniformly.

### Claude's Discretion
- Exact word-boundary regex/matching strategy for the find/replace pass (e.g. handling "Speaker 1" as a substring of "Speaker 10"-style edge cases, though the app caps at "Speaker 8").
- Whether the `speaker_aliases` table is also consulted for the transcript view within ArtifactReview (if one exists) even though `transcript_segments` itself stays unmutated — implementation detail of the read path.
- Exact modal layout/styling — follow existing ArtifactReview/ArtifactItem visual patterns.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product & requirements
- `.planning/PROJECT.md` — v3.0 milestone framing, locked key decisions table (includes the `speaker_aliases` read-time-resolution decision for Phase 12)
- `.planning/REQUIREMENTS.md` — SPKR-01 through SPKR-05 (Named Speaker Attribution section)
- `.planning/ROADMAP.md` §"Phase 12: Named Speaker Attribution" — goal, success criteria, dependency notes (SPKR-04 deliberately deferred to Phase 14)
- `.planning/STATE.md` — Active Decisions and Critical Anti-Patterns to Enforce sections (the `speaker_aliases` table decision and the "never mutate `transcript_segments.speaker_label`" anti-pattern originate here)

### Architecture
- `.planning/phases/05-prd-finalization/05-ARCHITECTURE.md` — DB DDL conventions, IPC contract conventions (channel typing, contextBridge allowlist pattern)
- `.planning/phases/04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md` — two-stage extraction contract (Stage 1 verbatim quotes → Stage 2 structured generation); relevant because Stage 2's current "do not substitute real names" instruction is why prose-text propagation needs the find/replace pass (D-05)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/renderer/src/components/ArtifactItem.tsx` (inline-edit pattern: `isEditing` state, textarea, Save/Cancel buttons) — closest existing UI pattern to adapt for the rename modal's per-speaker input rows.
- `src/main/index.ts:381–385` (`ipcMain.handle('set-meeting-title', ...)`) — reference example of the invoke-channel pattern (Zod validation → DB write) to replicate for the new speaker-rename channel.
- `src/renderer/src/components/ArtifactReview.tsx:79–84` — reference example of the renderer-side `window.electronAPI.invoke(...)` call pattern.

### Established Patterns
- IPC channels are allowlisted in `src/preload/index.ts` (`INVOKE_CHANNELS` / `LISTEN_CHANNELS` const arrays) — a new channel (e.g. `rename-speakers`) must be added there before use.
- All artifact edits go through Zod-validated `ipcMain.handle` in `src/main/index.ts`, then a store method (pattern: `ArtifactStore.editArtifact()`).

### Integration Points
- `src/main/store/db.ts` — `transcript_segments` (has `speaker_label`), `artifacts` (`content_json`), `action_items` (`assignee_label`), `summary_cards` (`speaker_contributions_json`), `epoch_summaries` (`speaker_attributions_json`) are all tables whose data needs read/write for this phase's find/replace propagation (D-05, D-06) and for the new `speaker_aliases` table lookup.
- `src/main/capture/SpeakerNormalizer.ts` — defines the label format: `"You"` (mic) / `"Speaker 1"`...`"Speaker 8"` (system, capped and reused beyond 8). The rename modal must enumerate exactly the labels actually present per meeting, not assume a fixed range.
- `src/main/calendar/CalendarExportService.ts:33` — `.ics` export reads `action_items.assignee_label` directly; since D-06 mutates that field on rename, no export-time resolution logic is needed (SPKR-03 satisfied by the same mechanism).
- `src/renderer/src/components/CitationPanel.tsx:29` — renders `citation.speaker_label` directly from stored artifact content; satisfied by D-06 mutating embedded citation labels on rename.

</code_context>

<specifics>
## Specific Ideas

No specific visual/reference examples given — standard modal pattern following existing ArtifactReview/ArtifactItem conventions.

</specifics>

<deferred>
## Deferred Ideas

- **Live rename during Capturing/OnBreak** — renaming speakers while the meeting is still active, requiring real-time sync with `SummaryCardTimer`/`LiveSummaryBoard`. Deferred out of Phase 12's scope (D-04); could be a future enhancement if user feedback demands it.

### Reviewed Todos (not folded)
None — discussion stayed within phase scope.

</deferred>

---

*Phase: 12-named-speaker-attribution*
*Context gathered: 2026-07-02*
