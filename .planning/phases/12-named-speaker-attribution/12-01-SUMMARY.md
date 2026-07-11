---
phase: 12-named-speaker-attribution
plan: 01
subsystem: database
tags: [sqlite, better-sqlite3, json-propagation, speaker-attribution, vitest]

# Dependency graph
requires:
  - phase: 06-11 (v2.0 Build)
    provides: ALL_DDLS/runMigrations DB init sequence, TranscriptStore, ArtifactStore, MeetingArtifacts Zod schema
provides:
  - speaker_aliases table (meeting_id, original_label, display_name, updated_at; composite PK)
  - TranscriptStore.getDistinctSpeakerLabels() / getRepresentativeExcerpt() roster queries
  - speakerRename.ts pure JSON-safe propagation utilities (7 exported functions)
  - SpeakerAliasStore class with getAlias()/applyRenames() transactional propagation
affects: [12-03 (IPC handlers), 12-04 (RenameSpeakersModal UI)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read-time alias resolution for transcript_segments.speaker_label — never mutate the raw transcript"
    - "Deep-walk JSON string-value replace (parse -> mutate decoded values -> stringify), never raw regex over serialized JSON text"
    - "Idempotent rename via speaker_aliases lookup before building the from-pattern"

key-files:
  created:
    - src/main/store/speakerRename.ts
    - src/main/store/__tests__/speakerRename.test.ts
    - src/main/store/SpeakerAliasStore.ts
    - src/main/store/__tests__/SpeakerAliasStore.test.ts
  modified:
    - src/main/store/db.ts
    - src/main/transcript/TranscriptStore.ts
    - tests/unit/TranscriptStore.test.ts
    - .gitignore

key-decisions:
  - "speaker_aliases uses CREATE TABLE IF NOT EXISTS with no runMigrations() entry — wholly new table, naturally idempotent"
  - "All UPDATE statements in SpeakerAliasStore.applyRenames() additionally scope by meeting_id = ? even though the row id was already fetched from a meeting_id-scoped SELECT — belt-and-suspenders SPKR-05 enforcement"
  - "reconstructMeetingArtifacts lives in speakerRename.ts (not ArtifactStore.ts) since it's a pure function consuming ArtifactStore.getArtifacts()'s row shape, matching the plan's file list"

patterns-established:
  - "Deep-walk JSON mutation: renameInValue() recursively walks parsed JSON, replacing only decoded string leaf values, then JSON.stringify re-serializes with automatic escaping"
  - "Dict-keyed propagation: renameKeyedContributions() renames exact-match object keys plus substring-replaces value strings, for Record<speakerLabel,string> shaped columns"

requirements-completed: [SPKR-02, SPKR-05]

coverage:
  - id: D1
    description: "speaker_aliases table added to ALL_DDLS, idempotently creatable, queryable"
    requirement: "SPKR-02"
    verification:
      - kind: unit
        ref: "tests/unit/TranscriptStore.test.ts#speaker_aliases DDL > creates a speaker_aliases table with the expected columns, and re-running ALL_DDLS does not throw"
        status: pass
    human_judgment: false
  - id: D2
    description: "TranscriptStore.getDistinctSpeakerLabels() and getRepresentativeExcerpt() roster queries"
    requirement: "SPKR-02"
    verification:
      - kind: unit
        ref: "tests/unit/TranscriptStore.test.ts#getDistinctSpeakerLabels / getRepresentativeExcerpt describe blocks"
        status: pass
    human_judgment: false
  - id: D3
    description: "speakerRename.ts JSON-safe deep-walk propagation utilities (escapeRegExp, buildWordBoundaryRegex, escapeReplacement, renameInValue, renameInContentJson, renameKeyedContributions, reconstructMeetingArtifacts)"
    requirement: "SPKR-02"
    verification:
      - kind: unit
        ref: "src/main/store/__tests__/speakerRename.test.ts (9 tests, all 7 functions covered)"
        status: pass
    human_judgment: false
  - id: D4
    description: "SpeakerAliasStore.applyRenames() atomically propagates a rename batch across artifacts/action_items/summary_cards/epoch_summaries, is idempotent across repeat renames, and never leaks across meetings (SPKR-05)"
    requirement: "SPKR-05"
    verification:
      - kind: unit
        ref: "src/main/store/__tests__/SpeakerAliasStore.test.ts (8 tests, incl. idempotent re-rename and cross-meeting isolation)"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-02
status: complete
---

# Phase 12 Plan 01: Speaker Attribution Data Layer Summary

**speaker_aliases table plus a deep-walk JSON find/replace propagation layer (speakerRename.ts + SpeakerAliasStore) that atomically renames a diarized speaker across MOM/summary/key-points/action-items/citations/summary-cards/epoch-summaries for one meeting, scoped by meeting_id, without ever mutating transcript_segments.speaker_label**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-02
- **Tasks:** 3/3 completed
- **Files modified:** 4 modified, 4 created

## Accomplishments
- `speaker_aliases` table (`meeting_id`, `original_label`, `display_name`, `updated_at`; composite PK `(meeting_id, original_label)`) added to `ALL_DDLS`, idempotently created on every `openDatabase()` call
- `TranscriptStore.getDistinctSpeakerLabels()` and `getRepresentativeExcerpt()` — the read-path the future rename modal (12-04) will query for its roster and per-speaker excerpts
- `speakerRename.ts` — 7 pure functions implementing the parse -> deep-walk-mutate-decoded-strings -> re-stringify pattern, safely handling `"`, `\`, and `$` in a new display name without corrupting stored JSON
- `SpeakerAliasStore` — `getAlias()` + `applyRenames()`, propagating a rename batch atomically (single `db.transaction()`) across `artifacts.content_json` (all 4 artifact types), `action_items.assignee_label`/`citations_json`, `summary_cards.speaker_contributions_json`, `epoch_summaries.speaker_attributions_json`, and upserting the alias row itself
- Idempotent re-rename verified: a second rename in the same session correctly finds the currently-effective name (via `getAlias`) rather than the stale original label
- Cross-meeting isolation verified: renaming in meeting A leaves meeting B's identical rows byte-for-byte unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: speaker_aliases DDL + TranscriptStore roster queries** - `74e072f` (feat)
2. **Task 2: speakerRename.ts — JSON-safe propagation utilities** - `f6b3072` (feat)
3. **Task 3: SpeakerAliasStore — transactional rename propagation** - `5616bc5` (feat)

**Plan metadata:** committed together with this SUMMARY.md (worktree mode — orchestrator handles the final metadata commit after wave merge)

_Note: All three tasks were `tdd="true"` — each commit includes both the implementation and its full test file since the test file was authored alongside the implementation in a single atomic commit per task (test-first authoring, single commit per task per plan convention)._

## Files Created/Modified
- `src/main/store/db.ts` - Added `speaker_aliases` CREATE TABLE IF NOT EXISTS block to `ALL_DDLS`
- `src/main/transcript/TranscriptStore.ts` - Added `getDistinctSpeakerLabels()` and `getRepresentativeExcerpt()` inline-prepared query methods
- `tests/unit/TranscriptStore.test.ts` - Extended with roster-query and DDL-idempotency describe blocks
- `src/main/store/speakerRename.ts` - New pure-function module: JSON-safe deep-walk rename propagation
- `src/main/store/__tests__/speakerRename.test.ts` - Unit tests for all 7 exported functions
- `src/main/store/SpeakerAliasStore.ts` - New class: transactional rename propagation across all derived-artifact tables
- `src/main/store/__tests__/SpeakerAliasStore.test.ts` - Unit tests covering all 8 required behaviors
- `.gitignore` - Added `*.tsbuildinfo` (composite tsconfig build artifact, was untracked and unignored)

## Decisions Made
- Followed 12-RESEARCH.md's Pattern 1/2/3 code verbatim as the implementation baseline (deep-walk JSON replace, dict-keyed propagation, idempotent alias lookup) — no deviation from the vetted approach
- Every UPDATE statement in `SpeakerAliasStore.applyRenames()` includes `WHERE id = ? AND meeting_id = ?` (not just `WHERE id = ?`) — an extra defense-in-depth layer beyond the plan's minimum requirement, since the `id` was already sourced from a `meeting_id`-scoped SELECT in the same step
- `reconstructMeetingArtifacts` was placed in `speakerRename.ts` per the plan's explicit file list (not a new file, not `ArtifactStore.ts`) — it's a pure function only, no DB access, consuming `ArtifactStore.getArtifacts()`'s row shape as documented in the plan's action step

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript baseline count shifted from 8 to 7 errors (pre-existing error resolved as a side effect, not a regression)**
- **Found during:** Task 1 (speaker_aliases DDL + TranscriptStore roster queries)
- **Issue:** The plan's acceptance criteria specified `npx tsc --noEmit -p tsconfig.node.json` must report "exactly 8 errors (this project's pre-existing baseline)". Before this plan's changes, one of those 8 errors was `TranscriptStore.ts(21,23): error TS6138: Property 'db' is declared but its value is never read` — because the constructor stored `private db: Database.Database` but no method in the class actually used `this.db` prior to this plan. Once Task 1 added `getDistinctSpeakerLabels()`/`getRepresentativeExcerpt()`, which legitimately call `this.db.prepare(...)`, that specific unused-property warning naturally disappeared. The count is now 7, not 8, for all three tasks in this plan.
- **Fix:** No code fix needed — this is a correct, expected side effect of implementing the feature as specified. Verified via `git stash`/`git stash pop` that the baseline was genuinely 8 before this plan's changes and the *only* diff between before/after tsc output is the removal of that one line — no new errors were introduced by any of the three tasks.
- **Files modified:** None (informational only — verification methodology, not a code change)
- **Verification:** `diff` between pre-change and post-change `tsc --noEmit` output showed exactly one line removed (`TranscriptStore.ts(21,23)`) and zero lines added, across all three tasks' final state
- **Committed in:** N/A (verification-only finding, not a commit)

**2. [Rule 2 - Missing Critical] Added `*.tsbuildinfo` to `.gitignore`**
- **Found during:** Task 1 (first `tsc --noEmit -p tsconfig.node.json` run, which uses `"composite": true`)
- **Issue:** `tsconfig.node.json` has `"composite": true`, which causes `tsc` to emit a `tsconfig.node.tsbuildinfo` incremental-build-cache file at the repo root on every run. This file was untracked and not covered by any existing `.gitignore` rule, so it would have been left as a permanently-untracked generated artifact (or accidentally committed) after this plan's verification runs.
- **Fix:** Added `*.tsbuildinfo` to `.gitignore`; deleted the generated file before each task's commit so it never entered the working tree at commit time.
- **Files modified:** `.gitignore`
- **Verification:** `git status --short` shows no untracked files after each task commit
- **Committed in:** `74e072f` (Task 1 commit)

---

**Total deviations:** 2 (1 informational TS-baseline note, 1 Rule 2 gitignore housekeeping fix)
**Impact on plan:** No scope creep, no functional changes beyond the plan's specification. The TS-baseline shift is a positive side effect (one fewer pre-existing warning) not a regression; the `.gitignore` addition is minor housekeeping required to keep the working tree clean per the task-commit protocol's "never leave generated files untracked" rule.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `speaker_aliases` table, roster queries, JSON-safe propagation utilities, and `SpeakerAliasStore.applyRenames()` are all in place and fully unit-tested — this is the complete data-layer foundation Plan 12-03 (IPC handlers) needs to build `get-speaker-roster` and `rename-speakers`.
- `reconstructMeetingArtifacts(meetingId, ArtifactStore.getArtifacts(meetingId))` is ready to be called directly from the `rename-speakers` IPC handler to build the response payload — the only refresh path back to the renderer (per 12-RESEARCH.md Pitfall 6).
- Full test suite (138 tests, 17 files) passes; `npx tsc --noEmit -p tsconfig.node.json` reports 7 errors (down from the pre-plan baseline of 8, with the single removed error being a genuine pre-existing warning resolved as a side effect — zero new errors introduced).
- No blockers for Plan 12-03 or 12-04.

---
*Phase: 12-named-speaker-attribution*
*Completed: 2026-07-02*

## Self-Check: PASSED

All created/modified files verified present on disk; all 3 task commit hashes (`74e072f`, `f6b3072`, `5616bc5`) verified present in `git log --oneline --all`.
