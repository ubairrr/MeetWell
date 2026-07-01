---
phase: 12-named-speaker-attribution
plan: 03
subsystem: api
tags: [electron, ipc, zod, session-fsm, speaker-attribution]

# Dependency graph
requires:
  - phase: 12-01
    provides: speaker_aliases table, TranscriptStore.getDistinctSpeakerLabels()/getRepresentativeExcerpt(), SpeakerAliasStore.getAlias()/applyRenames(), speakerRename.reconstructMeetingArtifacts()
provides:
  - IPC channel 'get-speaker-roster' (invoke, request-response)
  - IPC channel 'rename-speakers' (invoke, request-response)
  - Both channels allowlisted in preload INVOKE_CHANNELS
affects: [12-04 (RenameSpeakersModal UI — consumes both new channels)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-side FSM gate before any store read/write: session.getState() !== 'Complete' check is the first executable statement in both handlers, mirroring the consent-gate-enforced-in-main convention"
    - "Zod-validate-then-store-write shape replicated from edit-artifact/set-meeting-title/export-ics"
    - "Request-response only (no push event) for the rename flow — mapping the export-ics precedent where the return value, not a server push, drives renderer state"

key-files:
  created: []
  modified:
    - src/preload/index.ts
    - src/main/index.ts

key-decisions:
  - "Both handlers return the identical error string 'rename only allowed after meeting completion' when the FSM gate fails, for consistency between the roster-fetch and rename-apply paths"
  - "rename-speakers success path returns reconstructMeetingArtifacts()'s full MeetingArtifacts object directly (not wrapped, not a bare {ok:true}) since it is the only reload mechanism the renderer has for refreshing displayed artifacts"

patterns-established: []

requirements-completed: [SPKR-01, SPKR-05]

coverage:
  - id: D1
    description: "get-speaker-roster and rename-speakers channels added to preload INVOKE_CHANNELS allowlist; LISTEN_CHANNELS untouched"
    requirement: "SPKR-01"
    verification:
      - kind: unit
        ref: "grep -q \"'get-speaker-roster'\" src/preload/index.ts && grep -q \"'rename-speakers'\" src/preload/index.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "ipcMain.handle('get-speaker-roster') and ipcMain.handle('rename-speakers') registered in src/main/index.ts, both gated on session.getState() === 'Complete', both Zod-validated, rename-speakers wired to SpeakerAliasStore.applyRenames() -> artifactStore.getArtifacts() -> reconstructMeetingArtifacts()"
    requirement: "SPKR-01"
    verification:
      - kind: unit
        ref: "grep -q \"ipcMain.handle('get-speaker-roster'\" src/main/index.ts && grep -q \"ipcMain.handle('rename-speakers'\" src/main/index.ts && grep -q reconstructMeetingArtifacts src/main/index.ts"
        status: pass
      - kind: unit
        ref: "npm test -- --run (full suite, 142 tests, 18 files)"
        status: pass
    human_judgment: false
  - id: D3
    description: "rename-speakers payload validated with z.object({ meetingId: z.string(), mapping: z.record(z.string(), z.string().trim().min(1).max(100)) }) — rejects missing meetingId, non-string mapping values, empty/whitespace-only names, and oversized names before any DB write"
    requirement: "SPKR-05"
    verification:
      - kind: unit
        ref: "grep -q \"z.record(z.string(), z.string().trim().min(1).max(100))\" src/main/index.ts"
        status: pass
    human_judgment: false

# Metrics
duration: 15min
completed: 2026-07-01
status: complete
---

# Phase 12 Plan 03: IPC Wiring for Named Speaker Attribution Summary

**Two new `ipcMain.handle` registrations (`get-speaker-roster`, `rename-speakers`) that server-side gate on `SessionManager.getState() === 'Complete'`, Zod-validate every field, and wire directly to Plan 12-01's `SpeakerAliasStore`/`TranscriptStore`/`speakerRename` layer.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-01T20:13:18Z
- **Completed:** 2026-07-01T20:27:13Z
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- Preload `INVOKE_CHANNELS` now allowlists `get-speaker-roster` and `rename-speakers` (request-response only; `LISTEN_CHANNELS` untouched at its original 7 entries)
- `ipcMain.handle('get-speaker-roster')`: FSM-gated on `Complete` state, Zod-validates `{ meetingId }`, builds roster rows from `transcriptStore.getDistinctSpeakerLabels()` + `getRepresentativeExcerpt()` + `speakerAliasStore.getAlias()`
- `ipcMain.handle('rename-speakers')`: FSM-gated on `Complete` state, Zod-validates `{ meetingId, mapping }` (mapping values trimmed, min 1 / max 100 chars), calls `speakerAliasStore.applyRenames()` then returns the freshly-reconstructed `MeetingArtifacts` via `reconstructMeetingArtifacts(meetingId, artifactStore.getArtifacts(meetingId))`

## Task Commits

Each task was committed atomically:

1. **Task 1: Allowlist new IPC channels in preload** - `6f66b09` (feat)
2. **Task 2: get-speaker-roster and rename-speakers IPC handlers** - `6c8a908` (feat)

_Note: no TDD tasks in this plan — matches existing `ipcMain.handle` convention (no dedicated test coverage for IPC wiring anywhere in this codebase)._

## Files Created/Modified
- `src/preload/index.ts` - Added `'get-speaker-roster'` and `'rename-speakers'` to `INVOKE_CHANNELS`
- `src/main/index.ts` - Added `TranscriptStore`/`SpeakerAliasStore` imports and instantiation, `reconstructMeetingArtifacts` import, and the two new `ipcMain.handle` registrations placed immediately after the `export-ics` handler

## Decisions Made
- Both handlers return the identical error message string on FSM-gate failure, for consistency between roster-fetch and rename-apply — matches plan's acceptance criteria
- `rename-speakers` returns the full `MeetingArtifacts` object as the sole reload mechanism (no separate push event exists anywhere in the app for this feature), per plan's explicit design rationale

## Deviations from Plan

None — plan executed exactly as written for the code changes. One baseline discrepancy noted below (not a deviation in code, just a stale acceptance-criteria number).

### Baseline Note (not a deviation, no code change required)

The plan's acceptance criteria for both tasks expected `npx tsc --noEmit -p tsconfig.node.json` to report exactly **8** pre-existing errors as an unchanged baseline. The actual pre-existing baseline in this worktree is **7** errors (all in `CaptureService.ts`, `DeepgramClient.ts`, `ArtifactPipeline.ts`, and one unrelated `app.dock` possibly-undefined warning in `index.ts`) — none introduced by this plan's changes, and the count did not change between Task 1 and Task 2 (7 before, 7 after both tasks). This is a stale number in the plan (likely drifted from when the plan was authored vs. current wave-1-merged state), not a regression. No action taken since the mismatch is a documentation artifact, not a code defect.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Both IPC channels are live, gated, and validated — ready for Plan 12-04 (RenameSpeakersModal UI) to invoke `get-speaker-roster` on modal open and `rename-speakers` on Save
- Full test suite green (142/142 tests, 18 files) after both tasks
- TypeScript baseline unchanged (7 pre-existing errors, none new)

---
*Phase: 12-named-speaker-attribution*
*Completed: 2026-07-01*

## Self-Check: PASSED

- FOUND: src/preload/index.ts
- FOUND: src/main/index.ts
- FOUND: .planning/phases/12-named-speaker-attribution/12-03-SUMMARY.md
- FOUND: 6f66b09 (Task 1 commit)
- FOUND: 6c8a908 (Task 2 commit)
- FOUND: e388d2f (SUMMARY commit)
