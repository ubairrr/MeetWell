---
plan: 09-02
phase: 9
title: SummaryCardTimer + Main Process Wiring + Bug Fixes
status: complete
completed_date: 2026-06-27
duration_seconds: 312
tasks_completed: 3
tasks_total: 3
files_created:
  - src/main/context/SummaryCardTimer.ts
files_modified:
  - src/main/index.ts
  - src/preload/index.ts
decisions:
  - SummaryCardTimer skips LLM call when no transcript segments exist in the 5-minute window (D-03 guard)
  - Capturing→OnBreak→Capturing cycle preserves existing meeting ID; timer continues through break
  - loadApiKeys() called before createOverlayWindow() so keys are available before CaptureService/LLMAdapter init
  - OnBreak added to interactive states list to fix I'm Back button mouse-event bug
requires:
  - Plan 09-01 (SummaryCardSchema, SummaryCardStore)
  - Phase 6 db.ts (summary_cards DDL)
  - Phase 8 LLMAdapter
provides:
  - SummaryCardTimer (started/stopped by main index.ts FSM onStateChange)
  - Fully implemented start-break, end-break, get-settings, set-setting IPC handlers
  - set-focusable IPC channel in both main and preload
  - API key loading from safeStorage at startup
affects:
  - src/main/index.ts
  - src/preload/index.ts
tech_stack_added:
  - electron-store@11 (already installed; used for overlay-width/opacity and encrypted key storage)
tech_stack_patterns:
  - safeStorage.encryptString/decryptString for Gemini and Deepgram API key persistence
  - setTimeout-based recursive scheduling (not setInterval) for clean stop/cancel semantics
  - FSM previous-state guard to avoid double-starting timer on OnBreak→Capturing return
requirements_satisfied:
  - UI-02
  - UI-05
  - UI-06
tags:
  - timer
  - ipc
  - main-process
  - electron-store
  - safeStorage
  - phase-9
---

# Phase 9 Plan 02: SummaryCardTimer + Main Process Wiring + Bug Fixes Summary

**One-liner:** SummaryCardTimer drives 5-minute LLM card generation with D-03 silence guard; main process fully wired with safeStorage key loading, OnBreak mouse-event fix, and four previously-stub IPC handlers implemented.

## What Was Built

### T1 — SummaryCardTimer (src/main/context/SummaryCardTimer.ts)

New class in `src/main/context/` implementing the 5-minute summary card generation loop:

- Constructor takes `Database.Database`, `BrowserWindow`, `SummaryCardStore`, and `LLMAdapter` — no singleton assumptions, all dependencies injected
- `start(meetingId)`: sets `currentMeetingId`, resets `cardIndex = 0`, calls `scheduleNext()`
- `stop()`: clears the pending `setTimeout`, nulls `timeoutHandle` and `currentMeetingId`
- `scheduleNext()`: sets a `setTimeout` for `INTERVAL_MS` (5 minutes); in the callback, calls `fire()` inside try/catch, then in `finally` re-schedules if `timeoutHandle` is still set (i.e., `stop()` was not called)
- `fire()`: early-returns if `GEMINI_API_KEY` is absent or `currentMeetingId` is null; queries `transcript_segments` for the last 5-minute window; skips LLM call if `segments.length === 0` (D-03); formats segments as `[speaker] (channel): text` lines; calls `LLMAdapter.generate()` with `SummaryCardSchema`; saves via `SummaryCardStore.saveCard()`; retrieves the stored card and pushes `summary-card-ready` IPC

### T2 — Main Process Wiring (src/main/index.ts)

Rewrote `app.whenReady()` body to wire all Phase 9 components:

**API key loading at startup:**
- `loadApiKeys()` decrypts Gemini and Deepgram keys from `electron-store` via `safeStorage.decryptString()` and sets them as `process.env` variables before `CaptureService` and `LLMAdapter` are instantiated
- Each key decrypt is wrapped in try/catch — a corrupt stored key logs an error but does not crash startup

**Overlay width from settings:**
- `overlayWidth` read from `electron-store` (default 380) before `createOverlayWindow()`
- `createOverlayWindow` now accepts a `width` parameter (replaces hardcoded `OVERLAY_WIDTH` constant)

**New instances:**
- `SummaryCardStore(db!)` and `LLMAdapter(geminiApiKey)` instantiated after window creation
- `SummaryCardTimer(db!, win!, summaryCardStore, llmAdapter)` instantiated once

**FSM onStateChange additions:**
- `Capturing` (from non-OnBreak): calls `summaryCardTimer.start(currentMeetingId)` — preserves existing ID on OnBreak return
- `Processing`: calls `summaryCardTimer.stop()` before stopping capture
- `Idle`: calls `summaryCardTimer.stop()` as a safety guard

**OnBreak mouse-event fix:**
- Added `'OnBreak'` to the interactive-states list (`setIgnoreMouseEvents(false)`)
- Fixes the I'm Back button being unreachable when mouse events were ignored

**Implemented stub handlers:**
- `start-break`: transitions FSM to `OnBreak`, records `breakStartMs = Date.now()`
- `end-break`: transitions FSM back to `Capturing`, queries `summaryCardStore.getCardsSince(currentMeetingId, breakStartMs)`, pushes `break-assist-digest-ready` with `{ cardsMissed, isEmpty }`
- `get-settings`: returns `{ overlayWidth, overlayOpacity, hasGeminiKey, hasDeepgramKey }` from `electron-store`
- `set-setting`: switch on `key` — encrypts API keys via `safeStorage`, clamps `overlay-width` to 280–600, clamps `overlay-opacity` to 0.3–1.0

**New handler:**
- `set-focusable`: `win.setFocusable(!!payload)` — allows renderer to control overlay focus

### T3 — Preload Allowlist (src/preload/index.ts)

Added `'set-focusable'` to `INVOKE_CHANNELS`. No other changes, no reformatting.

## Verification

`npx tsc --noEmit` — zero errors after all three tasks. App not launched (runtime verification deferred to Plan 09-07 integration test).

## Deviations from Plan

**1. [Rule 1 - Bug] Capturing→OnBreak→Capturing meeting ID preservation**
- **Found during:** T2 implementation
- **Issue:** The original code unconditionally generated a new `currentMeetingId` on every entry to `Capturing`. Returning from OnBreak would have overwritten the active meeting ID and broken the transcript/timer continuity.
- **Fix:** Added `previous !== 'OnBreak'` guard so `currentMeetingId` and `captureService.startCapture()` are only called on initial Capturing entry (from PreCapture), not on return from a break.
- **Files modified:** `src/main/index.ts`
- **Commit:** 7e17571

## Known Stubs

None. All handlers return correct shapes; no display rendering or placeholder values.

## Threat Flags

No new network endpoints introduced. `safeStorage.encryptString/decryptString` is the established macOS Keychain pattern for this project. `set-setting` validates input before encryption. No threat flags.

## Self-Check: PASSED

- [x] `src/main/context/SummaryCardTimer.ts` — created
- [x] `src/main/index.ts` — modified, all stubs replaced, OnBreak fix applied
- [x] `src/preload/index.ts` — modified, set-focusable added
- [x] Commit eb9e408 (T1), 7e17571 (T2), 35a9325 (T3) exist in git log
- [x] `tsc --noEmit` exits zero
