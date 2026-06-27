# Phase 9: Overlay UI + Live Summary Board - Context

**Gathered:** 2026-06-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Full overlay UI is live and functional: the SessionManager FSM drives all state transitions end-to-end (Idle → PreCapture → Capturing → OnBreak → Processing → Complete → Idle), `SummaryCardTimer` fires every 5 minutes during capture and generates summary cards via LLM, `LiveSummaryBoard` stacks those cards in the overlay (newest at top), `BreakAssistPanel` handles going-on-break and returning with a card digest, `ArtifactReview` is polished (Phase 8 shipped the skeleton), and `SettingsPanel` exposes API key entry + overlay appearance prefs. Click-through behavior and `setContentProtection(true)` are verified working.

Requirements: UI-01 through UI-06 (6 requirements).

</domain>

<decisions>
## Implementation Decisions

### Summary Card Generation

- **D-01:** `SummaryCardTimer` lives in `src/main/context/` (main process). Timer fires in main, queries `transcript_segments` for the last 5-minute window only (not the full meeting), calls `LLMAdapter`, stores result in `summary_cards` DB table, pushes `summary-card-ready` IPC event to renderer. No renderer-side timer.
- **D-02:** The LLM call for each card uses the same `LLMAdapter` from Phase 8 (`src/main/llm/LLMAdapter.ts`). Input: `transcript_segments` rows with `created_at` in the last 5-minute window. Output: Zod-validated `SummaryCardSchema` (topic headline + ≥3 key points).
- **D-03:** If the SummaryCardTimer fires and there are no transcript segments in the last 5-minute window (e.g., silence), skip the LLM call — no card generated. No error pushed to renderer.

### Capturing Screen Layout

- **D-04:** Before the first summary card arrives (first 5 minutes), the overlay shows the existing `CapturingScreen` in full (two-dot health bar + Stop Meeting button). Once the first `summary-card-ready` IPC event arrives, the view transitions to the board layout.
- **D-05:** In the board layout (after first card arrives), health status collapses to a compact indicator (a small icon or dot in the header, not the full two-dot bar). The main area is `LiveSummaryBoard` (stacked cards, newest at top). Stop Meeting button remains accessible (pinned in the header).
- **D-06:** App.tsx manages this transition with a `hasSummaryCards` state flag (false until first `summary-card-ready` arrives). No new FSM state needed — this is a purely renderer-side display toggle within the `Capturing` session state.

### Settings Panel

- **D-07:** `SettingsPanel` exposes: Gemini API key input, Deepgram API key input, overlay width slider (default 380px), overlay opacity slider. Prominent Gemini paid-plan warning ("Free tier allows training on your meeting data — use a paid plan"). No model selector, no other prefs in v1.
- **D-08:** API keys (Gemini, Deepgram) are persisted via `safeStorage` → macOS Keychain (same pattern as the DB encryption key). Renderer sends keys via IPC; main process calls `safeStorage.encryptString` and stores encrypted bytes. Overlay width/opacity are non-sensitive and stored in `electron-store`.
- **D-09:** `SettingsPanel` is accessible via a gear icon always present in the top bar of the overlay (next to the quit button), regardless of session state. Clicking the gear opens settings as an inline slide-in panel over the current view; clicking it again (or an X button) closes it.

### Break Assist Panel

- **D-10:** The "Going on Break" button is embedded in the Capturing state view (header or footer of the board view, always visible during capture). Clicking it fires `start-break` IPC → FSM transitions `Capturing → OnBreak` → a minimal OnBreak screen renders ("You're on a break. Capture continues...") with an "I'm Back" button.
- **D-11:** Clicking "I'm Back" fires `end-break` IPC → FSM transitions `OnBreak → Capturing` → renderer shows the `BreakAssistDigest` inline (replacing the OnBreak screen). The digest shows **summary cards only** — the `SummaryCards` generated while on break, newest first. No extra LLM call on return. After dismissal, the board view (LiveSummaryBoard) resumes.
- **D-12:** If no summary cards were generated during the break (break duration < 5 minutes), the digest shows "Nothing to catch up on — the meeting was quiet while you were away."

### Claude's Discretion

- **SummaryCard Zod schema:** Topic headline (string) + key points array (3–5 items, each a string). Shape is straightforward — planner can finalize.
- **LLM prompt for summary cards:** Researcher/planner to design. Constraint: input is the last 5-minute window of `transcript_segments`; output must be headline + key points, faithful to what was said. Two-stage extraction is NOT required for summary cards (they are display artifacts, not citation-backed proposals).
- **Click-through behavior implementation:** How `setIgnoreMouseEvents(true, { forward: true })` and cursor-enter/leave detection are wired in the Electron main process. Leave to researcher.
- **Overlay width/opacity persistence:** `electron-store` key names and the IPC channel for communicating setting changes to the main process (to resize/restyle the window). Leave to planner.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 9: Overlay UI + Live Summary Board" — goal, 5 success criteria, UI-01–UI-06
- `.planning/REQUIREMENTS.md` §"Overlay UI + Live Summary Board" — UI-01 through UI-06 with full acceptance criteria text

### Architecture (component tree + IPC surface)
- `.planning/phases/05-prd-finalization/05-ARCHITECTURE.md` — module map (`src/main/context/SummaryCardTimer.ts`, `src/main/context/SummaryCardStore.ts`), renderer component tree (`LiveSummaryBoard.tsx`, `SummaryCard.tsx`, `BreakAssistPanel.tsx`, `BreakAssistDigest.tsx`, `SettingsPanel.tsx`, `AudioWorkletHost.tsx`), IPC channel surface (§7: `summary-card-ready`, `break-assist-digest-ready`, `start-break`, `end-break`)
- `.planning/phases/05-prd-finalization/05-ARCHITECTURE.md` §"ContextEngine" — `SummaryCardTimer` responsibility, `ContextEnginePort` interface, `SummaryCardSchema` structure

### FSM (session state machine)
- `src/main/session/SessionManager.ts` — FSM transitions including `Capturing → OnBreak → Capturing`; Phase 9 adds `start-break` / `end-break` IPC wiring in `src/main/index.ts`

### Existing Phase 8 reusable assets
- `src/main/llm/LLMAdapter.ts` — LLM adapter (Gemini 2.5 Flash via openai SDK + baseURL); Phase 9 reuses for summary card generation
- `src/main/store/db.ts` — `summary_cards` table DDL; `SummaryCardStore.ts` is Phase 9's write path into this table
- `src/preload/index.ts` — live contextBridge allowlist; `summary-card-ready` (listen), `start-break`, `end-break` (invoke) channels must be present
- `src/renderer/src/App.tsx` — current session state machine in renderer; Phase 9 adds `OnBreak` render branch and `hasSummaryCards` flag

### AI faithfulness contract
- `.planning/phases/04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md` §2.2 Pitfall 4 — `EpochCompressor` must read from `transcript_segments` ONLY. Note: `SummaryCardTimer` in Phase 9 also reads from `transcript_segments` (the 5-minute window), not from `summary_cards`. This is correct and must be enforced.

### Settings & secrets architecture
- `CLAUDE.md` — `electron-store` is for non-sensitive settings only; `safeStorage` for secrets (API keys go via `safeStorage`)
- `.planning/phases/05-prd-finalization/05-PRD.md` §DEC-02 — Gemini paid plan only; paid-plan warning is a hard UI requirement in `SettingsPanel`

### Feature scope (MVP boundary)
- `.planning/phases/05-prd-finalization/05-FEATURE-SPEC.md` — confirms Phase 9 scope; live assistant chat UI and named speaker attribution are v2 deferred

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/renderer/src/App.tsx` — existing `useSessionState` hook and render branches for Idle/PreCapture/Capturing/Complete. Phase 9 adds `OnBreak` branch and `hasSummaryCards` state. `QuitButton` component can be extended to include the gear icon.
- `src/renderer/src/components/CapturingScreen.tsx` — existing health bar + Stop Meeting UI. Phase 9 replaces this with the board view on first card, keeping the compact health indicator.
- `src/renderer/src/components/ArtifactReview.tsx`, `ArtifactItem.tsx`, `CitationPanel.tsx` — Phase 8 skeleton; Phase 9 polishes the visual design.
- `src/renderer/src/audio/MicCapture.ts` — existing mic AudioWorklet bridge. Phase 9 extracts this into `AudioWorkletHost.tsx` component (per ARCHITECTURE.md) for cleaner lifecycle management.
- `src/main/llm/LLMAdapter.ts` — Phase 8 LLM adapter; Phase 9 reuses for `SummaryCardTimer` card generation.
- `src/main/session/SessionManager.ts` — FSM already has `OnBreak` state and `start-break`/`end-break` events; Phase 9 wires the IPC handlers in `src/main/index.ts`.
- `src/main/store/db.ts` — `summary_cards` table already DDL'd; `SummaryCardStore.ts` (Phase 9, new file) is the write path.

### Established Patterns
- **Session state → render branch:** `App.tsx` uses a single `sessionState` value from `useSessionState` hook to switch render trees. Phase 9 follows the same pattern — add `OnBreak` branch, extend `Capturing` branch with `hasSummaryCards` toggle.
- **IPC push model:** Main process pushes `summary-card-ready` events; renderer accumulates them in state. Same pattern as `capture-health-update` and `artifact-proposals-ready`.
- **Main process owns LLM/DB:** `SummaryCardTimer`, `SummaryCardStore`, and any LLM call for cards live in `src/main/context/`. Renderer receives only IPC push events.
- **Settings via electron-store + safeStorage:** Non-sensitive prefs (overlay width/opacity) in `electron-store`; secrets (API keys) via `safeStorage`. Pattern mirrors DB key storage.

### Integration Points
- `src/main/index.ts` — add `start-break` / `end-break` IPC handlers, wire `SummaryCardTimer` start/stop to Capturing state entry/exit, push `summary-card-ready` to renderer on card generation.
- `src/preload/index.ts` — verify `summary-card-ready` (listen), `start-break`, `end-break`, settings-related channels are in the allowlist. Phase 9 may need `save-api-key`, `get-api-key`, `save-overlay-prefs` channels added.
- `src/renderer/src/App.tsx` — add `useSummaryCards` hook (accumulates `summary-card-ready` events), `OnBreak` render branch, gear icon for settings access.

</code_context>

<specifics>
## Specific Ideas

- **Board layout transition:** Full `CapturingScreen` (health bar) until first `summary-card-ready` IPC arrives, then collapses health to a compact indicator and expands the `LiveSummaryBoard`. No new FSM state — purely renderer-side `hasSummaryCards` flag in `App.tsx`.
- **OnBreak UI:** Simple screen ("You're on a break — capture continues...") with a single "I'm Back" button. No countdown or timer display needed for v1.
- **Break digest:** Shows only the summary cards generated during the break window (by `created_at` timestamp between `break_start` and `end-break`). No extra LLM call. If empty, shows "Nothing to catch up on" message. After dismissal, resumes the board view.
- **Gear icon placement:** Top bar, next to the existing quit (×) button. Settings opens as an inline slide-in, overlaying the current view. Same gear click closes it.
- **API key validation:** After saving a key, SettingsPanel should show a basic reachability check (a lightweight test call to the provider) and display "Connected" or "Invalid key" feedback inline.

</specifics>

<deferred>
## Deferred Ideas

- **Streaming artifact delivery during ArtifactReview** — pushing each artifact type to the renderer as its Stage 2 call completes (rather than waiting for all 4). Noted in Phase 8 deferred; still deferred to v2.
- **Overlay opacity/width persistence across windows** — more complex; v1 applies prefs at startup only. Live resizing of the Electron window from a slider is possible but adds complexity.
- **Model selector in SettingsPanel** — LLM stack is locked per PRD (Gemini 2.5 Flash). Not in Phase 9.
- **Named speaker attribution** — replacing "Speaker 1/2/3" with real names. Deferred to v2.

</deferred>

---

*Phase: 9-Overlay UI + Live Summary Board*
*Context gathered: 2026-06-27*
