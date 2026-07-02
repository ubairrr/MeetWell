# Phase 14: Cross-Meeting Semantic Search - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-02
**Phase:** 14-cross-meeting-semantic-search
**Areas discussed:** Chunking & embedding, Backfill, Search panel UI, Result scope & ranking

> **Session note:** The user was unavailable for most of this session — 3 of 4 AskUserQuestion prompts (Chunking, Panel UI, Ranking) timed out after 60s with no response, so Claude proceeded with recommended defaults per the workflow's "proceed using best judgment" fallback. Only the Backfill question received a live answer. CONTEXT.md flags this explicitly so the unconfirmed decisions get a quick review pass before/during planning.

---

## Chunking & embedding storage

| Option | Description | Selected |
|--------|-------------|----------|
| New fine-grained chunk type for search | Separate chunking path from `transcript_segments` (verbatim text, real speaker), stored in a new `vec_search_chunks` table alongside untouched `vec_chunks` | ✓ (Claude default — no response) |
| Reuse epoch chunks only | Query existing `vec_chunks` as-is | |
| Let Claude decide | | |

**User's choice:** No response after 60s — Claude proceeded with the recommended option.
**Notes:** Recommended because existing `vec_chunks` (written by `EpochCompressor`) has `speaker_label` hardcoded to `'epoch'` and stores a synthesized summary, not a verbatim quote — fails SRCH-02 outright. A new table also sidesteps `vec0` virtual tables not reliably supporting `ALTER TABLE ADD COLUMN` (needed for SRCH-04's model_version tracking).

---

## Backfill job trigger & UX

| Option | Description | Selected |
|--------|-------------|----------|
| Automatic on-demand backfill | Lazy background indexing triggered by first opening the search panel | |
| Manual "Index older meetings" button | Explicit button with a progress bar | ✓ (as a toggle switch) |
| Let Claude decide | | |

**User's choice:** "a toggle switch for option 2" — manual trigger, confirmed, but implemented as a toggle switch rather than a button.
**Notes:** Placement (likely `SettingsPanel.tsx`), exact copy, and progress-feedback treatment left to Claude's discretion.

---

## Search panel entry point & layout

| Option | Description | Selected |
|--------|-------------|----------|
| Same modal-overlay pattern as Settings | New button beside gear icon, full-overlay panel in the existing 380px window | ✓ (Claude default — no response) |
| Separate resizable window | New dedicated `BrowserWindow` for search | |
| Let Claude decide | | |

**User's choice:** No response after 60s — Claude proceeded with the recommended option.
**Notes:** No precedent anywhere in the app for multi-window management; `SettingsPanel` is the only existing analog for a persistent secondary panel and was chosen for consistency.

---

## Result scope & ranking controls

| Option | Description | Selected |
|--------|-------------|----------|
| Top 10, no filters, similarity floor | Simple relevance-only ranking | ✓ (Claude default — no response) |
| Top 10 + date range filter | Adds a date-range picker | |
| Let Claude decide | | |

**User's choice:** No response after 60s — Claude proceeded with the recommended option.
**Notes:** Kept v1 minimal; date-range/per-meeting filtering noted as a deferred idea.

---

## Claude's Discretion

- Exact chunk boundary strategy (per-speaker-turn vs. sliding window) for `vec_search_chunks`
- Backfill batching/throttle strategy to avoid contention with a live capture session
- Toggle placement/copy/progress-feedback treatment in `SettingsPanel.tsx`
- Search panel's exact `SessionState` availability beyond Idle
- Similarity-floor threshold value
- Naming/documentation clarity between `vec_chunks` (live grounding) and `vec_search_chunks` (search)

## Deferred Ideas

- Date-range / per-meeting filter UI for search results
- Separate resizable search window
- Live citations grounded in cross-meeting search (Phase 15 — already scoped there)
