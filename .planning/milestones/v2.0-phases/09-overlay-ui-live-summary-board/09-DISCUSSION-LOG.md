# Phase 9: Overlay UI + Live Summary Board - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-27
**Phase:** 9-Overlay UI + Live Summary Board
**Areas discussed:** Summary card data window, Capturing screen layout, Settings panel scope, Break assist panel placement

---

## Summary Card Data Window

| Option | Description | Selected |
|--------|-------------|----------|
| Last 5 minutes only | Just segments from the current interval. Focused, fast. | ✓ |
| Full meeting so far | All transcript_segments. More context but grows with meeting length. | |
| Last N minutes (configurable) | E.g., last 10 minutes for transitions. Adds a config knob. | |

**User's choice:** Last 5 minutes only

**Follow-up — architecture location:**

| Option | Description | Selected |
|--------|-------------|----------|
| Main process (per architecture) | SummaryCardTimer.ts in src/main/context/. Timer fires in main. | ✓ |
| Renderer-driven | Non-standard; main should own all LLM/DB logic. | |

**Notes:** Confirmed main-process-owned timer per ARCHITECTURE.md. LLMAdapter from Phase 8 is reused.

---

## Capturing Screen Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Health bar stays + cards stack below | Compact health dots pinned at top, LiveSummaryBoard scrolls below. | |
| Cards take over, health collapses to icon | Main area becomes the board after first card; health becomes a compact indicator. | ✓ |
| Tab or toggle between health and board | Two-tab layout. More complex. | |

**User's choice:** Cards take over, health collapses to icon (board-first after first card)

**Follow-up — before first card:**

| Option | Description | Selected |
|--------|-------------|----------|
| Full health bar view until first card | Existing CapturingScreen shows until first summary-card-ready event. | ✓ |
| Empty board placeholder immediately | Show board layout immediately with placeholder. | |

**Notes:** hasSummaryCards flag in App.tsx (renderer-side) drives the transition. No new FSM state needed.

---

## Settings Panel Scope

| Option | Description | Selected |
|--------|-------------|----------|
| API keys only + paid-plan warning | Gemini + Deepgram API key inputs, nothing else. | |
| API keys + overlay appearance prefs | Add width and opacity sliders. | ✓ |
| API keys + model selector | Let user pick LLM model — premature for v1 per PRD. | |

**User's choice:** API keys + overlay appearance prefs (width + opacity sliders)

**Follow-up — access pattern:**

| Option | Description | Selected |
|--------|-------------|----------|
| Gear icon in top bar (any state) | Always-visible gear next to quit button; inline slide-in panel. | ✓ |
| Idle state only | Settings only accessible when not in a meeting. | |
| Separate Electron window | Opens in its own window. Breaks single-overlay model. | |

**Follow-up — API key persistence:**

| Option | Description | Selected |
|--------|-------------|----------|
| safeStorage → macOS Keychain | Same as DB encryption key. Most secure. | ✓ |
| electron-store (plaintext) | Violates CLAUDE.md constraint (electron-store is for non-sensitive only). | |

**Notes:** Overlay width/opacity are non-sensitive → electron-store. API keys → safeStorage. Phase 9 should add `save-api-key`, `get-api-key`, `save-overlay-prefs` IPC channels to the contextBridge allowlist.

---

## Break Assist Panel Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Embedded in CapturingScreen / board view | Break button always visible during Capturing; click transitions to OnBreak screen. | ✓ |
| Swipe or gesture to reveal | Hidden by default. More complex for a desktop overlay. | |
| Keyboard shortcut only | No visible button. Less discoverable. | |

**User's choice:** Embedded in board view (always visible during Capturing)

**Follow-up — break digest content (revised):**

| Option | Description | Selected |
|--------|-------------|----------|
| Summary cards only (no LLM call on return) | Cards generated during break, newest first. Fast. | ✓ |
| Narrative paragraph + cards | LLM-generated 'While you were away' paragraph + cards. Adds latency. | (initial choice, changed) |

**Notes:** User initially selected "Narrative paragraph + cards" then revised to "Summary cards only." Final decision: digest shows only the SummaryCards generated during the break window. No extra LLM call on "I'm Back." If empty, show "Nothing to catch up on" message.

---

## Claude's Discretion

- **SummaryCard Zod schema shape:** Topic headline + 3–5 key points array. Finalized by planner.
- **LLM prompt for summary cards:** Researcher/planner to design. Two-stage extraction NOT required for cards (display artifacts, not citation-backed proposals).
- **Click-through behavior wiring:** `setIgnoreMouseEvents` + cursor-enter/leave detection. Left to researcher.
- **Overlay width/opacity IPC channels:** Key names and live-resize behavior. Left to planner.

## Deferred Ideas

- Streaming artifact delivery during ArtifactReview — deferred to v2
- Live window resizing from slider (v1 applies overlay prefs at startup only)
- Model selector in SettingsPanel — LLM stack locked per PRD
- Named speaker attribution — v2
