---
plan: 09-05
phase: 9
title: BreakAssistPanel + BreakAssistDigest + App.tsx Break Flow
status: complete
completed_date: 2026-06-27
duration_seconds: 84
tasks_completed: 3
tasks_total: 3
files_created:
  - src/renderer/src/components/BreakAssistPanel.tsx
  - src/renderer/src/components/BreakAssistDigest.tsx
files_modified:
  - src/renderer/src/App.tsx
decisions:
  - OnBreak branch shows BreakAssistPanel only — digest is NOT rendered in OnBreak state; it appears post-FSM-transition in Capturing
  - useBreakDigest hook follows same void-return on() pattern as useSummaryCards — no cleanup branch needed
  - showDigest state auto-sets to true when digest arrives (useEffect on digest); dismissed by setShowDigest(false) + clearDigest()
  - Digest overlay rendered within hasSummaryCards block before board view — preserves accumulated cards on dismiss
requires:
  - Plan 09-02 (end-break IPC handler, break-assist-digest-ready push, OnBreak FSM state)
  - Plan 09-03 (SummaryCard component imported by BreakAssistDigest)
  - Plan 09-04 (renderContent() helper + Capturing hasSummaryCards board view)
provides:
  - BreakAssistPanel component (OnBreak overlay with I'm Back button)
  - BreakAssistDigest component (post-break digest of missed cards, empty state or card list)
  - useBreakDigest hook (accumulates break-assist-digest-ready IPC payload)
  - Full break flow in App.tsx (OnBreak branch → I'm Back → Capturing + digest overlay → board)
affects:
  - src/renderer/src/components/BreakAssistPanel.tsx
  - src/renderer/src/components/BreakAssistDigest.tsx
  - src/renderer/src/App.tsx
tech_stack_added: []
tech_stack_patterns:
  - Digest overlay check before board view — showDigest && digest guard in hasSummaryCards block
  - useBreakDigest hook following same IPC accumulation pattern as useSummaryCards
  - OnBreak state isolation — digest never rendered there (FSM ordering guarantee)
requirements_satisfied:
  - UI-01
  - UI-03

coverage:
  - id: D1
    description: "BreakAssistPanel component renders OnBreak screen with heading, subtext, and I'm Back button"
    requirement: UI-01
    verification:
      - kind: manual_procedural
        ref: "Start meeting → click Going on Break → overlay shows On a Break + I'm Back button"
        status: unknown
    human_judgment: true
    rationale: "Visual rendering of overlay screen requires human confirmation"
  - id: D2
    description: "I'm Back button fires end-break IPC channel"
    requirement: UI-01
    verification:
      - kind: manual_procedural
        ref: "Click I'm Back → FSM transitions from OnBreak to Capturing"
        status: unknown
    human_judgment: true
    rationale: "IPC invocation confirmation requires observing FSM state change at runtime"
  - id: D3
    description: "BreakAssistDigest renders empty state when isEmpty=true"
    requirement: UI-03
    verification:
      - kind: manual_procedural
        ref: "Return from break with no cards generated → 'Nothing to catch up on' message visible"
        status: unknown
    human_judgment: true
    rationale: "Requires live session with timed break interval"
  - id: D4
    description: "BreakAssistDigest renders SummaryCard list when cards exist"
    requirement: UI-03
    verification:
      - kind: manual_procedural
        ref: "Return from break after cards generated → digest shows card list"
        status: unknown
    human_judgment: true
    rationale: "Requires live session with timed break interval and LLM card generation"
  - id: D5
    description: "Dismissing digest returns to board view without losing accumulated summary cards"
    requirement: UI-03
    verification:
      - kind: manual_procedural
        ref: "Click Dismiss → board view resumes with prior cards still visible"
        status: unknown
    human_judgment: true
    rationale: "State transition requires visual confirmation of card persistence"

duration: 2min
completed: 2026-06-27
---

# Phase 9 Plan 05: BreakAssistPanel + BreakAssistDigest + App.tsx Break Flow Summary

**OnBreak overlay (BreakAssistPanel) and post-break digest (BreakAssistDigest) wired into App.tsx via useBreakDigest hook and showDigest state, completing the full break assist flow.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-06-27T08:28:12Z
- **Completed:** 2026-06-27T08:29:36Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Created BreakAssistPanel with "On a Break" heading, subtext, and blue "I'm Back" button that fires `end-break` IPC
- Created BreakAssistDigest with header ("While You Were Away"), Dismiss button, and empty/non-empty body rendering SummaryCard components
- Wired full break flow in App.tsx: OnBreak branch, useBreakDigest hook, showDigest state, digest overlay within Capturing hasSummaryCards block

## Task Commits

Each task was committed atomically:

1. **T1: Create BreakAssistPanel component** - `72609b9` (feat)
2. **T2: Create BreakAssistDigest component** - `0e7d659` (feat)
3. **T3: Add break flow state to App.tsx** - `80bd904` (feat)

## Files Created/Modified

- `src/renderer/src/components/BreakAssistPanel.tsx` — New named-export component; OnBreak overlay with centered layout, "On a Break" heading, informational subtext, and blue "I'm Back" button calling `onBack` prop
- `src/renderer/src/components/BreakAssistDigest.tsx` — New named-export component; flex column with sticky header row ("While You Were Away" + Dismiss button) and scrollable body (empty-state message or mapped SummaryCard list)
- `src/renderer/src/App.tsx` — Added BreakAssistPanel/BreakAssistDigest imports, useBreakDigest hook, showDigest state, useEffect watching digest, OnBreak render branch, and digest overlay guard in Capturing hasSummaryCards block

## Decisions Made

- **OnBreak state isolation:** Digest is never shown in the OnBreak state. The flow is: `end-break` IPC → FSM transitions to Capturing → renderer re-renders as Capturing → then `break-assist-digest-ready` arrives. By the time the digest arrives, the renderer is already in Capturing. Showing it in OnBreak would require coordination that contradicts the main-process event ordering.
- **showDigest guard placement:** The `showDigest && digest` check is placed at the top of the `hasSummaryCards` block in the Capturing branch. This ensures the digest is shown before the board view (not overlapping it), and dismissing it reveals the accumulated board without any re-fetch.
- **useBreakDigest pattern:** Follows the same void-return `on()` pattern as `useSummaryCards` (preload returns void, no cleanup branch). Consistent with established hook pattern.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All rendering paths are wired to real data (IPC payloads from main process). No placeholder values.

## Threat Flags

No new network endpoints, auth paths, file access, or trust boundary changes. `BreakAssistPanel` and `BreakAssistDigest` are renderer-only display components. `useBreakDigest` registers a listener on an existing preload-allowlisted channel (`break-assist-digest-ready`). No new IPC channels introduced. No threat flags.

## Self-Check: PASSED

- [x] `src/renderer/src/components/BreakAssistPanel.tsx` — created, named export, I'm Back button with onBack prop
- [x] `src/renderer/src/components/BreakAssistDigest.tsx` — created, named export, empty/non-empty body
- [x] `src/renderer/src/App.tsx` — modified, OnBreak branch added, useBreakDigest hook added, showDigest state added, digest overlay in Capturing block
- [x] Commit 72609b9 (T1) exists in git log
- [x] Commit 0e7d659 (T2) exists in git log
- [x] Commit 80bd904 (T3) exists in git log
- [x] `npx tsc --noEmit` exits zero (all three stages)

## Next Phase Readiness

- Break assist UI is fully wired: OnBreak overlay, I'm Back button, digest display on return
- Phase 9 plan 06 (Settings panel) and plan 07 (integration test) can proceed
- No blockers

---
*Phase: 09-overlay-ui-live-summary-board*
*Completed: 2026-06-27*
