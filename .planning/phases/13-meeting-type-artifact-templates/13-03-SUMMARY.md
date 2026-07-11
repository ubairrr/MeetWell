---
phase: 13-meeting-type-artifact-templates
plan: 03
subsystem: session
tags: [ipc, capture, meeting-type, zod-validation, fsm]
requires:
  - 13-01 (MeetingTypeSchema / MeetingType, TranscriptStore.createMeeting 3rd param)
provides:
  - CaptureService.startCapture(meetingId, meetingType = 'general') 2nd parameter
  - consent-confirmed IPC handler validates payload.meetingType via MeetingTypeSchema.safeParse
  - pendingMeetingType hand-off from IPC handler to Capturing state-transition block
affects:
  - 13-04 (pipeline can now read the persisted meetings.meeting_type for template selection)
tech-stack:
  added: []
  patterns:
    - safeParse-with-safe-default at the IPC trust boundary (allowlist validation, fallback 'general')
    - session-scoped mutable variable as hand-off between IPC handler and FSM state-transition callback (mirrors currentMeetingId)
key-files:
  created: []
  modified:
    - src/main/capture/CaptureService.ts
    - src/main/index.ts
    - tests/unit/CaptureService.test.ts
decisions:
  - "Validation lives in the consent-confirmed IPC handler (not CaptureService) so an unrecognized value never leaves the trust boundary — CaptureService's parameter is already typed MeetingType"
  - "Catch-block fallback mom.meeting_type: 'general' was already satisfied by Plan 13-01's deviation fix — no change needed"
metrics:
  duration: ~5 min
  completed: 2026-07-02
status: complete
---

# Phase 13 Plan 03: Meeting-Type IPC-to-DB Propagation Summary

The meetingType selected in ConsentGate now travels the full pipe — `consent-confirmed` IPC payload → `MeetingTypeSchema.safeParse` allowlist validation → `pendingMeetingType` → `captureService.startCapture(currentMeetingId, pendingMeetingType)` → `TranscriptStore.createMeeting()` → `meetings.meeting_type` column — with any malformed/missing value safely defaulting to `'general'`.

## What Was Built

### Task 1 — CaptureService.startCapture(meetingType) (commit 8a6208c)
- `startCapture(meetingId: string, meetingType: MeetingType = 'general'): Promise<void>` — new optional 2nd parameter
- Body now calls `this.transcriptStore.createMeeting(meetingId, Date.now(), meetingType)` (3 args)
- `type { MeetingType }` imported from `../../shared/schemas`
- Test 1 assertion updated to expect the 3-arg call with `'general'` default; new test proves an explicit `'standup'` forwards through

### Task 2 — consent-confirmed handler propagation (commit b92fb56)
- `MeetingTypeSchema` (value) and `type MeetingType` added to the existing shared-schemas import in `src/main/index.ts`
- `let pendingMeetingType: MeetingType = 'general'` declared beside `currentMeetingId` — the hand-off between the IPC handler and the FSM `Capturing` transition
- `consent-confirmed` handler now parses `(_payload as { meetingType?: unknown } | undefined)?.meetingType` via `MeetingTypeSchema.safeParse(...)` before transitioning; parse failure of any kind → `'general'`
- `Capturing && previous !== 'OnBreak'` block calls `captureService.startCapture(currentMeetingId, pendingMeetingType)`

## Deviations from Plan

### Already-satisfied action (no change needed)

**1. Catch-block fallback `mom: { markdown_content: '', meeting_type: 'general' }`**
- **Found during:** Task 2
- **Issue:** The plan instructed adding `meeting_type: 'general'` to the ArtifactPipeline-failure fallback `mom` object in `src/main/index.ts`, but Plan 13-01's Rule-3 deviation fix (commit ce16fb9) had already added it when `MoMSchema.meeting_type` became required.
- **Fix:** None required — verified present; the grep-based verify criterion passes against the existing line.
- **Files modified:** none
- **Commit:** n/a (pre-existing from ce16fb9)

No other deviations — plan executed as written.

## Verification

- `npx vitest run tests/unit/CaptureService.test.ts` — 13 passed (11 pre-existing + 1 updated + 1 new)
- `npm test` — 155 passed / 0 failed (154 baseline + 1 new)
- `npx tsc --noEmit -p tsconfig.node.json` — `CaptureService.ts` at exactly its 1 pre-existing baseline error; `index.ts` at exactly its 2 pre-existing baseline errors; no new errors
- All 4 plan grep checks pass: `pendingMeetingType`, `MeetingTypeSchema`, `meeting_type: 'general'`, `captureService.startCapture(currentMeetingId, pendingMeetingType)`
- Human check (start a meeting with a non-General type and inspect `meetings.meeting_type`) deferred per `human_verify_mode: end-of-phase`

## Threat Model Compliance

- T-13-04 (Tampering, mitigate): renderer-supplied `meetingType` is validated against the 4-value allowlist via `MeetingTypeSchema.safeParse` inside the `consent-confirmed` handler; any parse failure defaults to `'general'` — an unvalidated string can never reach `TranscriptStore.createMeeting()`
- T-13-05 (DoS, mitigate): same validation prevents an unrecognized value from reaching the DB CHECK constraint and throwing mid-session-start

## Known Stubs

None — the propagation is fully wired; no placeholder data flows to the UI.

## Requirements

TMPL-01 / TMPL-02 are claimed jointly by plans 13-01, 13-02, and 13-03. This plan closes the storage-propagation leg. REQUIREMENTS.md intentionally left untouched — the orchestrator owns shared-file writes post-wave.

## Commits

| Task | Commit  | Message |
| ---- | ------- | ------- |
| 1    | 8a6208c | feat(13-03): add meetingType parameter to CaptureService.startCapture |
| 2    | b92fb56 | feat(13-03): validate and propagate meetingType from consent-confirmed IPC |

## Self-Check: PASSED
