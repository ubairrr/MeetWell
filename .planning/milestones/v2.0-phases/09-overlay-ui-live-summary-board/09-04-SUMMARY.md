---
plan: 09-04
phase: 9
title: AudioWorkletHost Extraction + App.tsx Board View Wiring
status: complete
completed_date: 2026-06-27
duration_seconds: 99
tasks_completed: 2
tasks_total: 2
files_created:
  - src/renderer/src/components/AudioWorkletHost.tsx
files_modified:
  - src/renderer/src/App.tsx
decisions:
  - AudioWorkletHost always mounted via renderContent() + Fragment pattern; active prop drives mic lifecycle
  - useSummaryCards returns void from on() — no cleanup branch needed (preload on() is fire-and-forget)
  - ChannelHealthDot used with status/label props in board view compact header (matches existing component interface)
  - renderContent() helper function avoids duplicating AudioWorkletHost across all branches
requires:
  - Plan 09-01 (StoredSummaryCard type in shared schemas)
  - Plan 09-02 (summary-card-ready IPC channel in preload allowlist, start-break handler)
  - Plan 09-03 (LiveSummaryBoard component)
provides:
  - AudioWorkletHost component (mic capture lifecycle decoupled from App.tsx)
  - useSummaryCards hook (accumulates IPC cards newest-first in renderer state)
  - Board view transition in Capturing branch (hasSummaryCards toggle)
affects:
  - src/renderer/src/components/AudioWorkletHost.tsx
  - src/renderer/src/App.tsx
tech_stack_added: []
tech_stack_patterns:
  - Behavior-only React component returning null (AudioWorkletHost)
  - renderContent() helper to share AudioWorkletHost mount across all branches
  - useSummaryCards hook following same IPC accumulation pattern as useArtifactProposals
requirements_satisfied:
  - UI-01
  - UI-05
  - UI-06
tags:
  - renderer
  - components
  - app-wiring
  - phase-9
---

# Phase 9 Plan 04: AudioWorkletHost Extraction + App.tsx Board View Wiring Summary

**One-liner:** Mic lifecycle extracted to AudioWorkletHost behavior component; useSummaryCards hook and board-view transition wired in App.tsx so Capturing switches from CapturingScreen to stacked summary board on first card arrival.

## What Was Built

### T1 — AudioWorkletHost (src/renderer/src/components/AudioWorkletHost.tsx)

New named-export behavior component managing mic capture lifecycle:

- **Props:** `active: boolean`
- **Body:** Single `useEffect([active])` — when `active` becomes true, calls `startMicCapture()` via a `cancelled` flag pattern to prevent handle leaks if the component unmounts before the promise resolves
- **Cleanup:** Sets `cancelled = true`, calls `handleRef.current?.stop()`, nulls the ref — no handle leak on unmount or `active` flip
- **Return:** `null` — renders nothing, behavior-only component
- **Export:** Named export (consistent with `CapturingScreen`, `ConsentGate`, etc.)

Exact function and type names (`startMicCapture`, `MicCaptureHandle`) verified against `src/renderer/src/audio/MicCapture.ts` before writing.

### T2 — App.tsx Modifications (src/renderer/src/App.tsx)

**Removed:**
- `import { startMicCapture } from './audio/MicCapture'`
- `import type { MicCaptureHandle } from './audio/MicCapture'`
- `const micHandleRef = useRef<MicCaptureHandle | null>(null)`
- The `useEffect` block that called `startMicCapture` and managed `micHandleRef`
- `useRef` removed from React import (no longer needed)

**Added imports:**
- `import type { StoredSummaryCard } from '../../shared/schemas'`
- `import { ChannelHealthDot } from './components/ChannelHealthDot'`
- `import { AudioWorkletHost } from './components/AudioWorkletHost'`
- `import LiveSummaryBoard from './components/LiveSummaryBoard'`

**Added `useSummaryCards` hook (above App component):**
- Registers a single `window.electronAPI.on('summary-card-ready', ...)` listener
- Prepends each incoming card to state (`[card, ...prev]`) — newest first
- No cleanup: `on()` in preload returns `void`, not an unsubscribe function

**Updated `App` component:**
- Added `const summaryCards = useSummaryCards()` and `const hasSummaryCards = summaryCards.length > 0`
- Extracted all render-branch logic to `renderContent()` helper function
- `AudioWorkletHost active={isCapturing}` rendered unconditionally before `renderContent()` in a React Fragment — always mounted regardless of session state
- `Capturing` branch: `!hasSummaryCards` → renders `CapturingScreen` with original props; `hasSummaryCards` → renders board view
- Board view: compact top bar (ChannelHealthDot + Stop Meeting button), scrollable `LiveSummaryBoard`, footer "Going on Break" button firing `start-break` IPC
- All other branches (PreCapture, Complete, Idle, fallback) preserved exactly as before

## Verification

`npx tsc --noEmit` — zero errors after both tasks.

Confirmed via grep: no `micHandleRef`, `startMicCapture`, or `MicCaptureHandle` references remain in App.tsx. Single `summary-card-ready` listener in `useSummaryCards` — no duplicates.

## Deviations from Plan

**1. [Rule 2 - Enhancement] renderContent() helper instead of top-level Fragment**
- **Found during:** T2 implementation
- **Issue:** The plan's Step 5 suggested placing `AudioWorkletHost` as first child in a Fragment before state-branch JSX, but the Capturing branch used multiple early `return` statements. Placing `AudioWorkletHost` outside the returns while keeping early-return structure requires either restructuring all branches to not use early return, or extracting them to a helper.
- **Fix:** Extracted all render-branch logic into `renderContent()` helper function. The `App` return is a single `<> <AudioWorkletHost .../> {renderContent()} </>` — AudioWorkletHost always mounts, all branches live in `renderContent()`. This is equivalent to the plan's intent but cleaner than duplicating `AudioWorkletHost` in every branch.
- **Files modified:** `src/renderer/src/App.tsx`
- **Commit:** b0f27d6

## Known Stubs

None. All components render real data; no placeholder values.

## Threat Flags

No new network endpoints, auth paths, file access, or trust boundary changes introduced. `AudioWorkletHost` accesses the mic via the existing `startMicCapture` path (unchanged). No new IPC channels added. No threat flags.

## Self-Check: PASSED

- [x] `src/renderer/src/components/AudioWorkletHost.tsx` — created, named export, returns null
- [x] `src/renderer/src/App.tsx` — modified, old mic code removed, useSummaryCards added, board view wired
- [x] Commit f304fa5 (T1) exists in git log
- [x] Commit b0f27d6 (T2) exists in git log
- [x] `npx tsc --noEmit` exits zero
- [x] No `micHandleRef`, `startMicCapture`, or `MicCaptureHandle` in App.tsx
- [x] Single `summary-card-ready` listener in App.tsx (useSummaryCards hook)
