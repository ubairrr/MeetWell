# Phase 12: Named Speaker Attribution - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-02
**Phase:** 12-named-speaker-attribution
**Areas discussed:** Rename UI & entry point, When renaming is allowed, Propagating renames into already-generated prose, Is "You" (mic channel) renameable

---

## Rename UI & entry point

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated modal in ArtifactReview | "Rename Speakers" button opens a modal listing every distinct speaker_label with a transcript snippet preview and text input; one save commits all renames | ✓ |
| Inline click-to-rename on citations | Click any speaker label wherever it appears to rename in place; no dedicated screen | |
| Both | Modal for primary flow plus inline shortcut | |

**User's choice:** Dedicated modal in ArtifactReview

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — show first/longest quote per speaker | Query transcript_segments for each speaker_label, show one representative excerpt next to the rename input | ✓ |
| No — just show the label | Simpler, but harder for user to know who's who | |

**User's choice:** Yes — show a representative transcript excerpt per speaker

| Option | Description | Selected |
|--------|-------------|----------|
| Single Save commits all renames | User edits multiple names, one "Save" sends the full mapping in one IPC call | ✓ |
| Auto-save per field | Each rename commits immediately on blur/enter | |

**User's choice:** Single Save commits all renames
**Notes:** None additional — user confirmed recommended options at each step.

---

## When renaming is allowed

| Option | Description | Selected |
|--------|-------------|----------|
| Post-meeting only, in ArtifactReview | Rename UI only appears after session reaches Complete state | ✓ |
| Also live during Capturing/OnBreak | Add rename affordance to the live overlay too | |

**User's choice:** Post-meeting only, in ArtifactReview
**Notes:** Live rename during an active meeting deferred — see Deferred Ideas in CONTEXT.md.

---

## Propagating renames into already-generated prose

| Option | Description | Selected |
|--------|-------------|----------|
| String find/replace on stored content_json | Word-boundary-aware substitution pass over each artifact's stored content_json on save; no LLM re-run | ✓ |
| Re-run Stage 2 generation with the alias applied | Re-invoke Stage 2 using the same Stage 1 quotes with substituted labels; costs an LLM call, risk of prose drift | |

**User's choice:** String find/replace on stored content_json

| Option | Description | Selected |
|--------|-------------|----------|
| Same find/replace, mutate stored fields | Update action_items.assignee_label and content_json speaker_label references directly on save; consistent single mechanism | ✓ |
| Resolve via speaker_aliases join at read time | Keep stored labels untouched; every render/export path resolves via join | |

**User's choice:** Same find/replace, mutate stored fields
**Notes:** transcript_segments.speaker_label remains untouched — the "never mutate" anti-pattern protects only the immutable raw transcript, not derived artifacts.

---

## Is "You" (mic channel) renameable

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — include "You" in the rename list | Show "You" alongside "Speaker 1/2/3" in the modal | ✓ |
| No — only diarized system-channel speakers renameable | "You" stays hard-coded everywhere | |

**User's choice:** Yes — include "You" in the rename list

---

## Claude's Discretion

- Exact word-boundary regex/matching strategy for the find/replace pass, including edge cases like "Speaker 1" vs "Speaker 10" (though the app caps diarization at "Speaker 8").
- Whether `speaker_aliases` is also consulted for any transcript view within ArtifactReview, even though `transcript_segments` itself stays unmutated.
- Exact modal layout/styling — follow existing ArtifactReview/ArtifactItem visual conventions.

## Deferred Ideas

- Live rename during Capturing/OnBreak, requiring real-time sync with SummaryCardTimer/LiveSummaryBoard — deferred out of Phase 12's scope.
