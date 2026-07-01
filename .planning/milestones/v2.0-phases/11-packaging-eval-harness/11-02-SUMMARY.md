---
phase: 11-packaging-eval-harness
plan: "02"
subsystem: packaging
tags: [notarization, electron-builder, macos, signing]
dependency_graph:
  requires: []
  provides: [notarize-hook]
  affects: [electron-builder-mac-build]
tech_stack:
  added: []
  patterns: [electron-builder-afterSign-hook, notarytool-backend]
key_files:
  created: []
  modified:
    - scripts/notarize.js
decisions:
  - Used notarytool backend (not altool — altool deprecated since late 2023)
  - Graceful no-op when Apple credentials absent so local dev and CI without secrets work without error
  - CommonJS require (not ESM) because electron-builder hooks must be CommonJS
metrics:
  duration: "~3 minutes"
  completed: "2026-06-28"
  tasks_completed: 1
  files_modified: 1
status: complete
---

# Phase 11 Plan 02: Notarize Hook Implementation Summary

Replaced the `scripts/notarize.js` stub with a real `@electron/notarize` notarytool implementation that electron-builder calls as the `afterSign` hook after code-signing.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement notarize.js with @electron/notarize notarytool | c6c1b95 | scripts/notarize.js |

## What Was Built

`scripts/notarize.js` is now a fully functional notarization hook that:

1. Returns immediately (no-op) if not building for macOS (`electronPlatformName !== 'darwin'`)
2. Skips gracefully with a log message when any of `APPLE_ID`, `APPLE_ID_PASSWORD`, or `APPLE_TEAM_ID` is absent — safe for local dev and CI without Apple credentials
3. Constructs `appPath` from `context.appOutDir` and `context.packager.appInfo.productFilename`
4. Calls `notarize({ tool: 'notarytool', appPath, appleId, appleIdPassword, teamId })` when all credentials are present
5. Re-throws errors from `notarize()` so electron-builder reports the failure (not silently swallowed)

The `afterSign: scripts/notarize.js` hook entry in `electron-builder.yml` was already in place — no changes needed there.

## Notarization Setup

To notarize a release build, set these env vars before running `electron-builder --mac`:

| Env Var | Source | Description |
|---------|--------|-------------|
| `APPLE_ID` | Apple Developer account | Your Apple Developer account email |
| `APPLE_ID_PASSWORD` | [appleid.apple.com](https://appleid.apple.com) > App-Specific Passwords | App-specific password (not your main Apple ID password) |
| `APPLE_TEAM_ID` | [developer.apple.com/account](https://developer.apple.com/account) | 10-character alphanumeric team ID |

Example:
```bash
APPLE_ID=you@example.com \
APPLE_ID_PASSWORD=xxxx-xxxx-xxxx-xxxx \
APPLE_TEAM_ID=XXXXXXXXXX \
npm run build && electron-builder --mac
```

## Verification Passed

| Check | Command | Result |
|-------|---------|--------|
| require() | `node -e "require('./scripts/notarize.js'); console.log('ok')"` | exits 0 |
| notarytool used | `grep -c 'notarytool' scripts/notarize.js` | 1 |
| APPLE_ID refs | `grep -c 'APPLE_ID' scripts/notarize.js` | 5 (>= 3 required) |
| altool absent | `grep -c 'altool' scripts/notarize.js` | 0 |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - the stub was the subject of this plan and has been replaced with a real implementation.

## Threat Flags

None. T-11-02-A (APPLE_ID_PASSWORD information disclosure) is accepted as documented in the plan's threat model — the credential is an app-specific password scoped to notarization only, and is never committed to git.

## Self-Check: PASSED

- [x] `scripts/notarize.js` exists and requires without error
- [x] Commit c6c1b95 exists in git log
- [x] No STATE.md or ROADMAP.md modifications made
