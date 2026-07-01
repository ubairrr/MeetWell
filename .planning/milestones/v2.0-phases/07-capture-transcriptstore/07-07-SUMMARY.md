---
plan: 07-07
phase: 07-capture-transcriptstore
title: Main process wiring — replace stubs, FSM hooks, CaptureService instantiation
status: complete
completed_at: 2026-06-27
---

`src/main/index.ts` fully wired: IPC stubs replaced with real `CaptureService` calls, `SessionManager` FSM hooks wired to `CaptureService.start()`/`stop()` on `Capturing`/`Complete` transitions. `CaptureService` instantiated with shared `Database` instance from `openDatabase()`. `transcript_segments` debug log added on session complete. Phase 7 requirements CAPT-01–09 verified and marked complete in REQUIREMENTS.md; STATE.md advanced to Phase 8.
