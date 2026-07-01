---
phase: 11-packaging-eval-harness
plan: "01"
subsystem: main-process
tags: [packaging, permissions, macos-gate, tcc, ipc]
dependency_graph:
  requires: []
  provides: [macos-version-gate, permission-status-ipc, open-permission-settings-ipc]
  affects: [src/main/index.ts, src/preload/index.ts, src/renderer/src/components/ConsentGate.tsx, src/renderer/src/App.tsx]
tech_stack:
  added: []
  patterns: [os.release() Darwin kernel version check, systemPreferences TCC API, ipcMain.handle pull+push dual delivery]
key_files:
  created: []
  modified:
    - src/main/index.ts
    - src/preload/index.ts
    - src/renderer/src/components/ConsentGate.tsx
    - src/renderer/src/App.tsx
decisions:
  - Dual delivery (push + pull) for permission-status: did-finish-load push + get-permission-status invoke on mount to avoid timing race where push fires before React registers its listener
  - Enum guard on open-permission-settings handler: type parameter validated against hardcoded URL map before indexing — renderer cannot inject arbitrary URLs (T-11-01-A mitigation)
  - PermissionWarningCard lives in ConsentGate with permissionStatus prop passed from App-level hook — follows existing architecture pattern (App owns all IPC hooks)
metrics:
  duration: "~15 minutes"
  completed: "2026-06-28"
  tasks_completed: 2
  tasks_total: 2
status: complete
---

# Phase 11 Plan 01: macOS Version Gate + TCC Permission Onboarding Summary

macOS 14.2+ minimum version gate and TCC permission onboarding IPC added to main process; permission warning cards wired into ConsentGate via typed IPC channels.

## What Was Built

### Task 1: macOS minimum version gate (commit 965bde1)

Added a Darwin kernel version check at the top of `app.whenReady()`, before `app.dock.hide()` and before any window or DB initialization. Uses `os.release()` to parse the kernel version tuple.

- Darwin < 23 (macOS < 14.0): triggers `dialog.showErrorBox` + `app.exit(1)`
- Darwin 23.x with x < 2 (macOS 14.0 or 14.1): same error dialog + exit
- Darwin >= 23.2 (macOS >= 14.2): app continues normally

Error dialog message: "MeetingAssist requires macOS 14.2 or later" / "System audio capture requires macOS 14.2 (Sonoma) or later. Please update your macOS before using MeetingAssist."

New imports added: `dialog`, `systemPreferences`, `shell` from `'electron'`; `release` from `'os'`.

### Task 2: TCC permission check + IPC push to renderer (commit e62cecf)

**Main process (`src/main/index.ts`):**
- After window loads (`win.webContents.once('did-finish-load')`), queries `systemPreferences.getMediaAccessStatus('microphone')` and `getMediaAccessStatus('screen')` and sends `'permission-status'` with `{ microphone, screen }` to the renderer.
- Added `ipcMain.handle('get-permission-status')` for pull-based retrieval — renderer invokes this on mount so delivery is deterministic regardless of `did-finish-load` timing.
- Added `ipcMain.handle('open-permission-settings')` with a hardcoded URL map; validates the `type` argument against `{ microphone, screen }` before indexing — renderer cannot inject an arbitrary URL.

**Preload (`src/preload/index.ts`):**
- `'permission-status'` added to `LISTEN_CHANNELS` allowlist.
- `'open-permission-settings'` and `'get-permission-status'` added to `INVOKE_CHANNELS` allowlist.

**ConsentGate (`src/renderer/src/components/ConsentGate.tsx`):**
- Added `PermissionStatus` interface (exported).
- Added `PermissionWarningCard` sub-component: renders a red banner with a "Fix in System Preferences →" button that invokes `'open-permission-settings'`.
- `ConsentGate` now accepts optional `permissionStatus?: PermissionStatus` prop; renders `PermissionWarningCard` above the disclosure text for any `'denied'` or `'restricted'` channel.

**App (`src/renderer/src/App.tsx`):**
- Added `usePermissionStatus()` hook: calls `invoke('get-permission-status')` on mount (pull) and listens for `'permission-status'` events (push); starts with `{ microphone: 'granted', screen: 'granted' }` default.
- Hook result passed as `permissionStatus` prop to `ConsentGate` in the `PreCapture` render branch.

## Deviations from Plan

### Auto-added correctness features

**1. [Rule 2 - Missing Critical Functionality] Pull-based get-permission-status IPC handler**
- **Found during:** Task 2 implementation review
- **Issue:** The plan's push-only approach (`did-finish-load` event + listener in ConsentGate) has a timing race: `did-finish-load` fires at startup during `Idle` state, but `ConsentGate` only mounts during `PreCapture`. By the time ConsentGate mounts, the push has already been dropped.
- **Fix:** Added `ipcMain.handle('get-permission-status')` and corresponding invoke-channel allowlist entry. `usePermissionStatus` hook in App calls both pull (on mount) and listens for push events. This makes status delivery deterministic.
- **Files modified:** `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/App.tsx`
- **Commits:** e62cecf

**2. [Rule 2 - Security] Enum guard on open-permission-settings**
- **Found during:** Threat model review (T-11-01-A)
- **Issue:** The plan's sample code used `urls[type]` with `type` inferred from renderer input — if `type` were an unexpected string, `urls[type]` would be `undefined`, passing `undefined` to `shell.openExternal`.
- **Fix:** Added `typeof type !== 'string' || !(type in PERMISSION_URLS)` guard that logs and returns early for any non-enum input.
- **Files modified:** `src/main/index.ts`
- **Commits:** e62cecf

**3. [Rule 3 - Architecture alignment] Permission status hook at App level, not ConsentGate**
- **Found during:** Task 2 implementation
- **Issue:** The plan suggested adding `useEffect` inside `ConsentGate`, but the existing architecture pattern is that App owns all IPC subscription hooks (`useSessionState`, `useCapturingHealth`, etc.) and passes data down as props.
- **Fix:** Added `usePermissionStatus` hook in App.tsx, passed result as prop to `ConsentGate`. This matches the existing pattern and avoids mounting/unmounting subscription lifecycle issues.
- **Files modified:** `src/renderer/src/App.tsx`, `src/renderer/src/components/ConsentGate.tsx`
- **Commits:** e62cecf

## Known Stubs

None. All permission status paths are wired to live `systemPreferences` API calls.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: mitigated (T-11-01-A) | src/main/index.ts | open-permission-settings handler validates type against hardcoded enum before URL lookup |

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| src/main/index.ts exists | FOUND |
| src/preload/index.ts exists | FOUND |
| src/renderer/src/components/ConsentGate.tsx exists | FOUND |
| src/renderer/src/App.tsx exists | FOUND |
| 11-01-SUMMARY.md exists | FOUND |
| Task 1 commit 965bde1 exists | FOUND |
| Task 2 commit e62cecf exists | FOUND |
| No new TypeScript errors in node target | PASSED (only pre-existing errors) |
| No new TypeScript errors in web target | PASSED (only pre-existing errors) |
