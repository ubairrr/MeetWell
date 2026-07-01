---
plan: 07-06
phase: 07-capture-transcriptstore
title: CapturingScreen UI — two-dot health bar + Stop Meeting
status: complete
completed_at: 2026-06-27
---

`CapturingScreen` React component rendered during FSM `Capturing` state, showing a two-dot health bar (mic + system channel) via `ChannelHealthDot`. Health state driven by `channel-health` IPC push from main. `Stop Meeting` button dispatches `stop-meeting` IPC. Mouse events re-enabled in `Complete` state so overlay buttons remain clickable. `App.tsx` updated to render `CapturingScreen` in the `Capturing` branch.
