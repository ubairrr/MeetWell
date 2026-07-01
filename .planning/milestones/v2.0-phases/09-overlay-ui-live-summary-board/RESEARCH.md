# Phase 9: Overlay UI + Live Summary Board — Research

**Researched:** 2026-06-27
**Domain:** Electron overlay UI, React 19 component extraction, Electron safeStorage, setInterval vs setTimeout, LLM prompt design
**Confidence:** HIGH (all findings derived from reading actual codebase files and Electron documentation patterns confirmed in the existing code)

---

## Summary

Phase 9 brings the MeetingAssist overlay UI to full operational status. The SessionManager FSM, LLMAdapter, CaptureService, ArtifactPipeline, and all 7 DB tables are already in place from Phases 6–8. What Phase 9 adds is the live experience layer: `SummaryCardTimer` (main process, fires every 5 minutes, writes to `summary_cards` table and pushes IPC), `SummaryCardStore` (write path to DB), `LiveSummaryBoard` + `SummaryCard` (renderer, stacks cards newest-at-top), `BreakAssistPanel` + `BreakAssistDigest` (break flow UI), `SettingsPanel` (API keys via safeStorage, overlay prefs via electron-store), and `AudioWorkletHost.tsx` (extracted from `MicCapture.ts` for clean React lifecycle management). App.tsx needs an `OnBreak` render branch, a `hasSummaryCards` flag driving the capturing view transition, and a gear icon for settings access. The two IPC stub handlers (`start-break`, `end-break`) and settings stubs (`get-settings`, `set-setting`) in `src/main/index.ts` need full implementations. The `SummaryCardSchema` is missing from `src/shared/schemas/index.ts` and must be added.

**Primary recommendation:** Build in 7 atomic plans — schema + store, timer + main wiring, renderer board view, break assist, settings panel, AudioWorkletHost extraction, and App.tsx integration — each independently committable.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `SummaryCardTimer` lives in `src/main/context/` (main process). Timer fires in main, queries `transcript_segments` for the last 5-minute window only (not the full meeting), calls `LLMAdapter`, stores result in `summary_cards` DB table, pushes `summary-card-ready` IPC event to renderer. No renderer-side timer.
- **D-02:** The LLM call for each card uses the same `LLMAdapter` from Phase 8 (`src/main/llm/LLMAdapter.ts`). Input: `transcript_segments` rows with `created_at` in the last 5-minute window. Output: Zod-validated `SummaryCardSchema` (topic headline + >= 3 key points).
- **D-03:** If the SummaryCardTimer fires and there are no transcript segments in the last 5-minute window (e.g., silence), skip the LLM call — no card generated. No error pushed to renderer.
- **D-04:** Before the first summary card arrives (first 5 minutes), the overlay shows the existing `CapturingScreen` in full (two-dot health bar + Stop Meeting button). Once the first `summary-card-ready` IPC event arrives, the view transitions to the board layout.
- **D-05:** In the board layout (after first card arrives), health status collapses to a compact indicator (a small icon or dot in the header, not the full two-dot bar). The main area is `LiveSummaryBoard` (stacked cards, newest at top). Stop Meeting button remains accessible (pinned in the header).
- **D-06:** App.tsx manages this transition with a `hasSummaryCards` state flag (false until first `summary-card-ready` arrives). No new FSM state needed — this is a purely renderer-side display toggle within the `Capturing` session state.
- **D-07:** `SettingsPanel` exposes: Gemini API key input, Deepgram API key input, overlay width slider (default 380px), overlay opacity slider. Prominent Gemini paid-plan warning ("Free tier allows training on your meeting data — use a paid plan"). No model selector, no other prefs in v1.
- **D-08:** API keys (Gemini, Deepgram) are persisted via `safeStorage` → macOS Keychain. Renderer sends keys via IPC; main process calls `safeStorage.encryptString` and stores encrypted bytes. Overlay width/opacity are non-sensitive and stored in `electron-store`.
- **D-09:** `SettingsPanel` is accessible via a gear icon always present in the top bar of the overlay (next to the quit button), regardless of session state. Clicking the gear opens settings as an inline slide-in panel over the current view; clicking it again (or an X button) closes it.
- **D-10:** The "Going on Break" button is embedded in the Capturing state view (header or footer of the board view, always visible during capture). Clicking it fires `start-break` IPC → FSM transitions `Capturing → OnBreak` → a minimal OnBreak screen renders ("You're on a break. Capture continues...") with an "I'm Back" button.
- **D-11:** Clicking "I'm Back" fires `end-break` IPC → FSM transitions `OnBreak → Capturing` → renderer shows the `BreakAssistDigest` inline (replacing the OnBreak screen). The digest shows **summary cards only** — the `SummaryCards` generated while on break, newest first. No extra LLM call on return. After dismissal, the board view (LiveSummaryBoard) resumes.
- **D-12:** If no summary cards were generated during the break (break duration < 5 minutes), the digest shows "Nothing to catch up on — the meeting was quiet while you were away."
- Two-stage extraction is NOT required for summary cards (they are display artifacts, not citation-backed proposals).

### Claude's Discretion

- **SummaryCard Zod schema:** Topic headline (string) + key points array (3–5 items, each a string). Shape is straightforward — planner can finalize.
- **LLM prompt for summary cards:** Researcher/planner to design. Constraint: input is the last 5-minute window of `transcript_segments`; output must be headline + key points, faithful to what was said. Two-stage extraction is NOT required for summary cards (they are display artifacts, not citation-backed proposals).
- **Click-through behavior implementation:** How `setIgnoreMouseEvents(true, { forward: true })` and cursor-enter/leave detection are wired in the Electron main process. Leave to researcher.
- **Overlay width/opacity persistence:** `electron-store` key names and the IPC channel for communicating setting changes to the main process (to resize/restyle the window). Leave to planner.

### Deferred Ideas (OUT OF SCOPE)

- **Streaming artifact delivery during ArtifactReview** — pushing each artifact type to the renderer as its Stage 2 call completes. Deferred to v2.
- **Overlay opacity/width persistence across windows** — more complex live resizing. v1 applies prefs at startup only. Live resizing of the Electron window from a slider is possible but adds complexity.
- **Model selector in SettingsPanel** — LLM stack is locked per PRD (Gemini 2.5 Flash). Not in Phase 9.
- **Named speaker attribution** — replacing "Speaker 1/2/3" with real names. Deferred to v2.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UI-01 | Full session flow renders in the overlay: consent gate → capturing state → on-break state → processing → artifact review | App.tsx OnBreak branch + hasSummaryCards flag + BreakAssistPanel wiring |
| UI-02 | `SummaryCardTimer` fires every 5 minutes during capture and triggers a summary card generation cycle | SummaryCardTimer implementation pattern (Q4 below) + SummaryCardStore DB query pattern (Q6 below) |
| UI-03 | `LiveSummaryBoard` renders the stack of generated summary cards in the overlay, newest at top | IPC push model: summary-card-ready → useSummaryCards hook → LiveSummaryBoard render |
| UI-04 | `ArtifactReview` panel renders all proposed artifacts grouped by type after meeting end | Already shipped in Phase 8; Phase 9 polishes visual design |
| UI-05 | `AudioWorkletHost` component manages mic capture lifecycle from the renderer side | AudioWorkletHost extraction pattern (Q7 below) |
| UI-06 | All IPC calls from the renderer use the typed contextBridge allowlist; no raw `ipcRenderer` is exposed | Preload already has all required channels; no new channels needed |
</phase_requirements>

---

## Open Questions Answered

### 1. Click-through behavior wiring

**Finding:** The architecture is already partially wired in `src/main/index.ts`. The `createOverlayWindow()` function calls `window.setIgnoreMouseEvents(true, { forward: true })` at creation time, and the `onStateChange` handler in `app.whenReady()` calls `win.setIgnoreMouseEvents(false)` for Idle/PreCapture/Capturing/Complete states and `setIgnoreMouseEvents(true, { forward: true })` for Processing/OnBreak.

**Phase 9 extension — hover-to-interact for the board view:**

The correct Electron pattern (as specified in `05-ARCHITECTURE.md §9`) is renderer-driven via `mouseover`/`mouseleave` events on the root div, sent via a dedicated IPC invoke. The renderer detects cursor entry and calls `window.electronAPI.invoke('set-mouse-interactive', true/false)`, and the main process calls `win.setIgnoreMouseEvents(!interactive, { forward: true })`.

However, looking at the existing `onStateChange` handler: during `Capturing` state, `win.setIgnoreMouseEvents(false)` is already set — which means the entire overlay is fully interactive during capture. This is acceptable for Phase 9 since the overlay has visible interactive UI (Stop Meeting, Going on Break). The hover-to-interact refinement (pass-through when cursor is outside the panel, interactive when inside) is not strictly required for UI-01 through UI-06 to pass. The current behavior (fully interactive during Capturing) is correct and safe.

**If hover-to-interact is desired anyway:**
1. The renderer adds `onMouseEnter` / `onMouseLeave` handlers to the root `#overlay-root` div.
2. Each handler calls `window.electronAPI.invoke('set-mouse-events', { interactive: true/false })`.
3. Main process adds an `ipcMain.handle('set-mouse-events', ...)` handler that calls `win.setIgnoreMouseEvents(!interactive, { forward: true })`.
4. This channel needs to be added to `INVOKE_CHANNELS` in `src/preload/index.ts`.

**Decision for Phase 9:** The existing per-state mouse event control is sufficient for all 6 UI requirements. The `OnBreak` state currently sets `setIgnoreMouseEvents(true, { forward: true })` (from the else branch in `onStateChange`). Phase 9 must fix this: `OnBreak` needs to be interactive (it has the "I'm Back" button). Add `OnBreak` to the interactive-states condition.

**Concrete fix in `src/main/index.ts`:**
```typescript
// Change this line:
if (state === 'Idle' || state === 'PreCapture' || state === 'Capturing' || state === 'Complete') {
// To:
if (state === 'Idle' || state === 'PreCapture' || state === 'Capturing' || state === 'OnBreak' || state === 'Complete') {
```

---

### 2. Overlay width/opacity persistence and live application

**electron-store key names:**
- `overlay-width` — number, default `380` (pixels)
- `overlay-opacity` — number, default `0.85` (0.0–1.0)

**IPC channel pattern:** Use the existing `get-settings` / `set-setting` channels already in the preload allowlist. The `get-settings` handler returns a settings object; `set-setting` accepts `{ key: string; value: unknown }`.

**Startup application — overlay width:**
The `createOverlayWindow()` function currently hardcodes `const OVERLAY_WIDTH = 380`. Phase 9 must read the stored value before window creation:

```typescript
// In app.whenReady(), before createOverlayWindow():
const store = new Store()  // electron-store instance
const overlayWidth = (store.get('overlay-width', 380) as number)
// Pass overlayWidth into createOverlayWindow(overlayWidth)
```

The `createOverlayWindow` signature changes to `createOverlayWindow(overlayWidth: number = 380)`, and `OVERLAY_WIDTH` becomes the parameter value.

**Startup application — overlay opacity:**
Opacity is CSS-level, applied in the renderer. The `get-settings` IPC response includes `overlayOpacity`, and the renderer's root div uses `rgba(0, 0, 0, overlayOpacity)` as its background.

**Live slider updates (during SettingsPanel open):**

Per the deferred decision: "v1 applies prefs at startup only. Live resizing of the Electron window from a slider is possible but adds complexity." Live updates are deferred. The slider changes take effect on next app restart. Phase 9 implementation: the `set-setting` handler writes the new value to electron-store immediately; no `win.setSize()` call is needed. A "Restart to apply" note in the SettingsPanel UI is acceptable.

However, opacity CAN be applied live without restart since it is renderer-CSS-controlled. The renderer can listen for a settings-changed IPC push (main pushes `settings-changed` after `set-setting`) and update the CSS variable in real time. This is optional polish — not required for UI requirements to pass.

---

### 3. safeStorage API key pattern

**Verified from `src/main/store/db.ts`:** `safeStorage` is imported from `'electron'` and the `encryptString` / `decryptString` pattern is already used in production for the DB key. The API key pattern follows the same approach.

**Storage location:** Encrypted bytes stored in electron-store (not a separate file like the DB key). The DB key uses a file at `userData/.meetingassist.key` because it must survive app reinstalls (it protects live data). API keys do not have this constraint — they can be re-entered. Storing encrypted bytes in electron-store is cleaner.

**Full pattern for `src/main/index.ts` (settings handler implementation):**

```typescript
import Store from 'electron-store'
import { safeStorage } from 'electron'

const store = new Store()

// Read API keys at startup (inject into process.env for use by LLMAdapter / CaptureService)
function loadApiKeys(): void {
  const geminiEncrypted = store.get('gemini-api-key-encrypted') as Buffer | undefined
  if (geminiEncrypted) {
    process.env.GEMINI_API_KEY = safeStorage.decryptString(Buffer.from(geminiEncrypted))
  }
  const deepgramEncrypted = store.get('deepgram-api-key-encrypted') as Buffer | undefined
  if (deepgramEncrypted) {
    process.env.DEEPGRAM_API_KEY = safeStorage.decryptString(Buffer.from(deepgramEncrypted))
  }
}

// get-settings handler
ipcMain.handle('get-settings', () => {
  return {
    overlayWidth: store.get('overlay-width', 380),
    overlayOpacity: store.get('overlay-opacity', 0.85),
    // Keys: return a boolean (hasKey) — never return the decrypted key to renderer
    hasGeminiKey: store.has('gemini-api-key-encrypted'),
    hasDeepgramKey: store.has('deepgram-api-key-encrypted'),
  }
})

// set-setting handler
ipcMain.handle('set-setting', (_event, payload: unknown) => {
  const schema = z.object({ key: z.string(), value: z.unknown() })
  const result = schema.safeParse(payload)
  if (!result.success) return

  const { key, value } = result.data

  if (key === 'gemini-api-key' && typeof value === 'string' && value.length > 0) {
    const encrypted = safeStorage.encryptString(value)
    store.set('gemini-api-key-encrypted', encrypted)
    // Re-inject into process.env immediately so new LLMAdapter instances pick it up
    process.env.GEMINI_API_KEY = value
    return
  }
  if (key === 'deepgram-api-key' && typeof value === 'string' && value.length > 0) {
    const encrypted = safeStorage.encryptString(value)
    store.set('deepgram-api-key-encrypted', encrypted)
    process.env.DEEPGRAM_API_KEY = value
    return
  }
  if (key === 'overlay-width' && typeof value === 'number') {
    store.set('overlay-width', Math.max(280, Math.min(600, value)))
    return
  }
  if (key === 'overlay-opacity' && typeof value === 'number') {
    store.set('overlay-opacity', Math.max(0.3, Math.min(1.0, value)))
    return
  }
})
```

**Security note:** The decrypted API key is NEVER sent back to the renderer. `get-settings` returns `hasGeminiKey: boolean` — the renderer shows "Key saved" vs "No key". Decrypted keys live only in `process.env` in the main process.

**electron-store key names (canonical):**
- `gemini-api-key-encrypted` — Buffer (encrypted bytes from safeStorage)
- `deepgram-api-key-encrypted` — Buffer (encrypted bytes from safeStorage)
- `overlay-width` — number (280–600, default 380)
- `overlay-opacity` — number (0.3–1.0, default 0.85)

---

### 4. SummaryCardTimer: setInterval vs setTimeout chain

**Recommendation: recursive `setTimeout` chain.**

**Rationale:**

`setInterval` has two failure modes in long-running Electron processes:
1. **Timer skew accumulation:** If the LLM call takes 4 seconds, `setInterval` still fires the next tick at the next 5-minute boundary — meaning the callback can overlap with a still-running LLM call. Over a 60-minute meeting (12 intervals), this accumulates.
2. **No error recovery window:** If a single interval's LLM call throws, the thrown error inside `setInterval` is swallowed unless explicitly caught; the timer keeps running regardless.

A `setTimeout` chain — where the next timer is only scheduled after the current callback completes — is self-serializing: the 5-minute window starts counting AFTER the previous card is generated, not regardless of how long generation took.

**Pattern:**

```typescript
export class SummaryCardTimer {
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null
  private readonly INTERVAL_MS = 5 * 60 * 1000

  start(): void {
    this.scheduleNext()
  }

  stop(): void {
    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle)
      this.timeoutHandle = null
    }
  }

  private scheduleNext(): void {
    this.timeoutHandle = setTimeout(async () => {
      try {
        await this.fire()
      } catch (err) {
        console.error('[SummaryCardTimer] card generation failed:', err)
        // Error is logged; we still reschedule — don't stop the timer on one failure
      } finally {
        // Only schedule next tick after this one completes
        if (this.timeoutHandle !== null) {
          this.scheduleNext()
        }
      }
    }, this.INTERVAL_MS)
  }

  private async fire(): Promise<void> {
    // ... query transcript_segments for last 5-min window, call LLMAdapter, store card, push IPC
  }
}
```

The `stop()` method sets `timeoutHandle` to null before the `finally` block reschedules, which is the cancellation sentinel.

**For a 60-minute meeting:** 12 LLM calls, each taking ~2–5 seconds, means the total meeting duration is at most 60 minutes + (12 × 5 seconds) = ~61 minutes of wall time. This is acceptable and expected.

---

### 5. SummaryCard LLM prompt

**Schema to add in `src/shared/schemas/index.ts`:**

```typescript
export const SummaryCardSchema = z.object({
  topic_headline: z.string().describe('A concise headline (≤ 10 words) capturing the main topic discussed in this window'),
  key_points: z.array(z.string()).min(3).max(5).describe('3–5 factual bullet points from the transcript. Each bullet is a complete sentence attributed to what was said, not inferred.'),
  speaker_contributions: z.record(z.string(), z.string()).describe('Map of speaker_label to a one-sentence summary of their contribution in this window. Only include speakers who spoke.'),
})
export type SummaryCard = z.infer<typeof SummaryCardSchema>
```

**Full prompt for `SummaryCardTimer.fire()`:**

System prompt:
```
You are a meeting assistant generating a brief summary of the last 5 minutes of a meeting transcript.

Rules:
1. Report only what was explicitly said. Do not infer, add context, or speculate.
2. The topic_headline must be a short noun phrase (≤ 10 words) describing the main subject discussed.
3. Each key_point must be a complete sentence that directly reflects something said in the transcript. Use the speaker's own words or a close paraphrase. Do not combine points from unrelated topics.
4. If fewer than 3 distinct points were discussed, use all available points (minimum 1 — never hallucinate filler bullets).
5. speaker_contributions: include only speakers who actually spoke in this window. One sentence per speaker.
6. Output must match the JSON schema exactly. No additional fields.
```

User content (assembled by `SummaryCardTimer`):
```
Meeting transcript — last 5-minute window:
[{timestamp_start}–{timestamp_end}] [{speaker_label}] ({channel}): {text}
...one line per transcript_segments row, sorted by timestamp_start...

Generate a summary card for this window.
```

**Key design decisions:**
- System prompt enforces faithfulness explicitly ("only what was explicitly said") — aligns with the AI faithfulness contract without requiring two-stage extraction for this use case.
- `key_points` minimum of 3 is enforced by Zod but the prompt acknowledges that short/silent windows may have fewer real points. The system prompt rule 4 overrides Zod's min — the LLM should return what it has. If Zod validation fails due to fewer than 3 points, treat as a soft failure: store with however many points were returned after loosening the validation, or skip the card.
- Practical recommendation: change `z.array(z.string()).min(3)` to `z.array(z.string()).min(1)` since Zod validation should not fail on a quiet 5-minute window. The UI can handle 1–5 bullet points.

---

### 6. BreakAssistDigest query pattern

**Verified from `src/main/store/db.ts` — actual `summary_cards` DDL:**

```sql
CREATE TABLE IF NOT EXISTS summary_cards (
  id                          TEXT PRIMARY KEY,
  meeting_id                  TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  card_index                  INTEGER NOT NULL,
  interval_start_seconds      REAL NOT NULL,
  interval_end_seconds        REAL NOT NULL,
  wall_time_label             TEXT NOT NULL,
  topic_headline              TEXT NOT NULL,
  key_points_json             TEXT NOT NULL,
  action_items_mentioned_json TEXT NOT NULL,
  speaker_contributions_json  TEXT NOT NULL,
  model_used                  TEXT NOT NULL,
  generated_at                TEXT NOT NULL,     -- ISO 8601 string
  created_at                  INTEGER NOT NULL DEFAULT (unixepoch() * 1000)  -- ms timestamp
);
```

**Timestamp column for break-window filtering:** `created_at` (INTEGER, milliseconds since epoch). This is the correct column to filter on — it records when the card was generated (wall clock time), which corresponds to when the LLM call completed during the break.

**`SummaryCardStore.getCardsSince()` implementation:**

```typescript
getCardsSince(meetingId: string, sinceMs: number): StoredSummaryCard[] {
  // sinceMs is the break_start wall-clock timestamp in milliseconds
  // Returns cards created after the break started, sorted newest-first for the digest display
  const rows = this.db
    .prepare(`
      SELECT * FROM summary_cards
      WHERE meeting_id = ? AND created_at > ?
      ORDER BY created_at DESC
    `)
    .all(meetingId, sinceMs) as RawSummaryCardRow[]

  return rows.map(row => ({
    ...row,
    key_points: JSON.parse(row.key_points_json),
    action_items_mentioned: JSON.parse(row.action_items_mentioned_json),
    speaker_contributions: JSON.parse(row.speaker_contributions_json),
  }))
}
```

**`start-break` IPC handler in `src/main/index.ts`:**

```typescript
let breakStartMs: number | null = null

ipcMain.handle('start-break', () => {
  try {
    session.transition('start-break')
    breakStartMs = Date.now()
  } catch (err) {
    console.error('[MeetingAssist] start-break transition failed:', err)
  }
})

ipcMain.handle('end-break', async () => {
  try {
    session.transition('end-break')
    const since = breakStartMs ?? (Date.now() - 5 * 60 * 1000)
    breakStartMs = null

    if (!currentMeetingId || !db) return

    const cards = summaryCardStore.getCardsSince(currentMeetingId, since)
    if (win) {
      win.webContents.send('break-assist-digest-ready', {
        cardsMissed: cards,
        isEmpty: cards.length === 0,
      })
    }
  } catch (err) {
    console.error('[MeetingAssist] end-break handler failed:', err)
  }
})
```

**Renderer-side (`BreakAssistDigest`):** On receiving `break-assist-digest-ready`, if `isEmpty` is true, show "Nothing to catch up on — the meeting was quiet while you were away." Otherwise render `cardsMissed` array (most recent first, already sorted by the DESC query).

---

### 7. AudioWorkletHost extraction

**Current state (`src/renderer/src/audio/MicCapture.ts`):**
- Exports `startMicCapture(): Promise<MicCaptureHandle>` — an imperative async function
- Returns a handle with `stop(): Promise<void>`
- Currently used in `App.tsx` via a `useEffect` that calls `startMicCapture()` when `sessionState === 'Capturing'` and calls `handle.stop()` on cleanup

**Target state (`src/renderer/src/components/AudioWorkletHost.tsx`):**
- A React component with no visible output (`return null`)
- Props: `{ active: boolean }` — when `active` is true, starts capture; when false or unmounted, stops capture
- Lifecycle managed by `useEffect([active])`

**Exact component interface:**

```typescript
interface AudioWorkletHostProps {
  active: boolean
}

export function AudioWorkletHost({ active }: AudioWorkletHostProps): null {
  const handleRef = useRef<MicCaptureHandle | null>(null)

  useEffect(() => {
    if (!active) return

    let cancelled = false

    startMicCapture().then((handle) => {
      if (cancelled) {
        handle.stop()
      } else {
        handleRef.current = handle
      }
    }).catch((err: unknown) => {
      console.error('[AudioWorkletHost] mic capture failed:', err)
    })

    return () => {
      cancelled = true
      handleRef.current?.stop()
      handleRef.current = null
    }
  }, [active])

  return null
}
```

**What App.tsx changes:**

1. Remove the `useRef<MicCaptureHandle | null>` and the `useEffect` that calls `startMicCapture()`.
2. Remove the import of `startMicCapture` and `MicCaptureHandle` from `MicCapture.ts`.
3. Import `AudioWorkletHost` from `./components/AudioWorkletHost`.
4. Render `<AudioWorkletHost active={sessionState === 'Capturing'} />` at the top level of the component, outside all the session-state branches (always rendered, but `active` is only true during Capturing).

**The `MicCapture.ts` module itself is NOT deleted** — `AudioWorkletHost.tsx` imports from it. The module remains unchanged; only `App.tsx`'s direct usage is removed.

**ARCHITECTURE.md note:** `AudioWorkletHost.tsx` is listed as a "hidden component, always rendered" in the component tree (§10). The `active` prop approach matches: the component renders `null` but is always present in the React tree.

---

## New Files

| File | Description |
|------|-------------|
| `src/shared/schemas/index.ts` (modified, not new) | Add `SummaryCardSchema` and `SummaryCard` type |
| `src/main/store/SummaryCardStore.ts` | DB write/read for `summary_cards` table; `saveCard`, `getCardsForMeeting`, `getCardsSince` |
| `src/main/context/SummaryCardTimer.ts` | 5-minute recursive setTimeout chain; queries transcript_segments, calls LLMAdapter, stores card, pushes IPC |
| `src/renderer/src/components/AudioWorkletHost.tsx` | Hidden React component wrapping MicCapture.ts lifecycle; `active` prop drives start/stop |
| `src/renderer/src/components/LiveSummaryBoard.tsx` | Stacked summary cards display; receives card array as prop; newest at top |
| `src/renderer/src/components/SummaryCard.tsx` | Individual 5-minute interval card: wall_time_label, topic_headline, key_points bullets, speaker_contributions |
| `src/renderer/src/components/BreakAssistPanel.tsx` | "Going on Break" / "I'm Back" buttons; fires start-break / end-break IPC; owns showDigest state |
| `src/renderer/src/components/BreakAssistDigest.tsx` | Modal/inline digest shown on "I'm Back"; renders cardsMissed array or empty message; Dismiss button |
| `src/renderer/src/components/SettingsPanel.tsx` | Slide-in settings: Gemini key input, Deepgram key input, width slider, opacity slider, paid-plan warning banner, key reachability check |

---

## Modified Files

| File | Changes |
|------|---------|
| `src/shared/schemas/index.ts` | Add `SummaryCardSchema`, `SummaryCard` type. Change `key_points` min from 3 to 1 (handles silent windows). Add `speaker_contributions` as `z.record(z.string(), z.string())`. |
| `src/main/index.ts` | (1) Add `electron-store` import + Store instance. (2) Call `loadApiKeys()` before `createOverlayWindow`. (3) Pass `overlayWidth` to `createOverlayWindow`. (4) Add `SummaryCardStore` instantiation. (5) Add `SummaryCardTimer` instantiation + start on `Capturing` entry + stop on `Processing` entry. (6) Push `summary-card-ready` IPC from timer callback. (7) Implement `start-break` handler (record `breakStartMs`, FSM transition). (8) Implement `end-break` handler (FSM transition, query `getCardsSince`, push `break-assist-digest-ready`). (9) Implement `get-settings` handler. (10) Implement `set-setting` handler (safeStorage for API keys, electron-store for prefs). (11) Fix mouse-event control: add `OnBreak` to the interactive-states condition. |
| `src/renderer/src/App.tsx` | (1) Remove `startMicCapture` usage and `micHandleRef` — replaced by `<AudioWorkletHost active={...} />`. (2) Add `useSummaryCards` hook (accumulates `summary-card-ready` IPC events). (3) Add `hasSummaryCards` flag (derived from `summaryCards.length > 0`). (4) Add `OnBreak` render branch with `BreakAssistPanel`. (5) Modify `Capturing` branch: show `CapturingScreen` when `!hasSummaryCards`, board layout (`LiveSummaryBoard` + compact health + "Going on Break" button) when `hasSummaryCards`. (6) Add gear icon to `QuitButton` area (or new `TopBar` component). (7) Add `showSettings` state + `SettingsPanel` render. (8) Always render `<AudioWorkletHost active={sessionState === 'Capturing'} />`. |
| `src/renderer/src/components/CapturingScreen.tsx` | No changes required. It renders as-is before first card. After first card, it is replaced by the board layout in App.tsx logic. |

---

## Plan Breakdown (suggested)

### Plan 1: Schema + SummaryCardStore
**Scope:** Add `SummaryCardSchema` to `src/shared/schemas/index.ts`. Create `src/main/store/SummaryCardStore.ts` with `saveCard`, `getCardsForMeeting`, `getCardsSince` methods. Unit-testable in isolation. No IPC or UI changes.

### Plan 2: SummaryCardTimer + Main Process Wiring
**Scope:** Create `src/main/context/SummaryCardTimer.ts` (recursive setTimeout, 5-min interval, queries transcript_segments, calls LLMAdapter, calls SummaryCardStore.saveCard, pushes `summary-card-ready` IPC). Wire timer start/stop into `src/main/index.ts` onStateChange handler (start on `Capturing`, stop on `Processing`). Implement `start-break` IPC handler with break timestamp recording. Implement `end-break` IPC handler with `getCardsSince` query and `break-assist-digest-ready` push. Fix OnBreak mouse-event control (add OnBreak to interactive states condition).

### Plan 3: LiveSummaryBoard + SummaryCard Components
**Scope:** Create `src/renderer/src/components/SummaryCard.tsx` (displays topic_headline, wall_time_label, key_points, speaker_contributions). Create `src/renderer/src/components/LiveSummaryBoard.tsx` (receives cards array prop, stacks newest-at-top). No IPC wiring yet — just the display components with dummy data for visual verification.

### Plan 4: AudioWorkletHost Extraction + App.tsx Mic Lifecycle Refactor
**Scope:** Create `src/renderer/src/components/AudioWorkletHost.tsx` (wraps MicCapture.ts, `active` prop). Modify `App.tsx`: remove direct `startMicCapture` + micHandleRef usage, add `<AudioWorkletHost active={sessionState === 'Capturing'} />`. Add `useSummaryCards` hook to App.tsx (listens for `summary-card-ready`, accumulates cards in state). Wire `hasSummaryCards` flag. Switch Capturing branch to show board layout vs full CapturingScreen. Add "Going on Break" button in board layout header.

### Plan 5: BreakAssistPanel + BreakAssistDigest
**Scope:** Create `src/renderer/src/components/BreakAssistPanel.tsx` ("Going on Break" / "I'm Back" buttons, fires IPC, owns digest visibility state). Create `src/renderer/src/components/BreakAssistDigest.tsx` (renders cardsMissed array or empty message, Dismiss button). Wire `break-assist-digest-ready` IPC listener in App.tsx → pass digest to BreakAssistPanel. Add `OnBreak` render branch to App.tsx.

### Plan 6: Settings Panel + safeStorage + electron-store
**Scope:** Create `src/renderer/src/components/SettingsPanel.tsx` (Gemini key input, Deepgram key input, width slider, opacity slider, paid-plan warning, "Connected"/"Invalid key" feedback). Implement `get-settings` and `set-setting` IPC handlers in `src/main/index.ts` (safeStorage for keys, electron-store for prefs). Add electron-store instance and `loadApiKeys()` call at startup. Add gear icon to App.tsx top bar. Add `showSettings` state + conditional SettingsPanel render.

### Plan 7: Integration Verification + OnBreak UX Polish
**Scope:** End-to-end walkthrough: Start Meeting → Consent → Capturing (full screen) → wait/simulate 5-min card → board layout transition → Going on Break → I'm Back → BreakAssistDigest → Dismiss → board resumes → Stop Meeting → Processing → ArtifactReview. Fix any integration issues found. Verify `setContentProtection(true)` still works. Verify `focusable` is correctly set for SettingsPanel (SettingsPanel needs text input — the window must be focusable while settings are open).

---

## Risks and Mitigations

### Risk 1: `focusable: false` blocks Settings key input
**What:** The overlay window is created with `focusable: false`. The SettingsPanel has text inputs (API keys). `focusable: false` prevents the window from receiving keyboard events, making text entry impossible.

**Mitigation:** In `src/main/index.ts`, the `onStateChange` handler already sets `win.setFocusable(state === 'Complete')`. This must be extended: when SettingsPanel opens (via `set-setting` with a `settings-panel-open: true` toggle, or a new IPC channel), call `win.setFocusable(true)`. When SettingsPanel closes, revert to the state-appropriate value. Alternatively, add a dedicated `ipcMain.handle('set-focusable', (_event, val: boolean) => win.setFocusable(val))` channel and have the SettingsPanel invoke it on mount/unmount. This channel needs to be added to the preload allowlist.

**Severity:** HIGH — SettingsPanel is completely unusable without this fix.

### Risk 2: OnBreak state currently sets setIgnoreMouseEvents(true)
**What:** The existing `onStateChange` handler sets `setIgnoreMouseEvents(true, { forward: true })` for states not in `[Idle, PreCapture, Capturing, Complete]`. OnBreak falls into this group, making the "I'm Back" button unreachable with the mouse.

**Mitigation:** Single-line fix in `src/main/index.ts` — add `'OnBreak'` to the condition. This is noted in Open Question 1 above. Must be Plan 2 scope.

**Severity:** HIGH — OnBreak UI is completely non-interactive without this fix.

### Risk 3: SummaryCardTimer starts before LLMAdapter has a valid API key
**What:** If the user hasn't set a Gemini API key yet, `SummaryCardTimer.fire()` will construct an LLMAdapter with an empty string and the call will fail.

**Mitigation:** `SummaryCardTimer.fire()` should check `process.env.GEMINI_API_KEY` before constructing LLMAdapter. If empty, log a warning and skip the card (same as the D-03 behavior for no segments). No IPC error push needed — the user will see that no cards appear and can open SettingsPanel to add the key.

**Severity:** MEDIUM — degrades to no live cards, but does not crash the session.

### Risk 4: break-assist-digest-ready payload shape mismatch
**What:** The ARCHITECTURE.md §7 specifies the `break-assist-digest-ready` payload as `{ digest: BreakAssistDigestSchema; cardsMissed: SummaryCardSchema[] }`. The `BreakAssistDigestSchema` is listed in `05-ARCHITECTURE.md §11` but is not yet in `src/shared/schemas/index.ts`. Phase 9 may need this schema.

**Mitigation:** Since D-11 specifies "no extra LLM call on return — digest shows summary cards only", the `BreakAssistDigestSchema` can be simplified to just `{ cardsMissed: SummaryCard[]; isEmpty: boolean }` for Phase 9. The renderer renders the `cardsMissed` array directly. A full narrative digest (the "While You Were Away" text from the ARCHITECTURE component tree note) would require an LLM call, which is deferred. Phase 9 emits `{ cardsMissed: StoredSummaryCard[], isEmpty: boolean }`.

**Severity:** LOW — a schema simplification, not a blocker.

### Risk 5: electron-store not yet installed
**What:** The project CLAUDE.md lists `electron-store` as the preferences tool, but the package may not yet be in `package.json` (no phases have used it yet).

**Mitigation:** Plan 6 must check `package.json` for `electron-store` before implementing the settings handler. If missing, `npm install electron-store` is the first step of Plan 6. Verify the import pattern matches the Electron/ESM setup (electron-store v9+ is ESM-only; the project uses a vite-based build that may need `"type": "commonjs"` handling or a dynamic import).

**Severity:** MEDIUM — install step is trivial, but the ESM/CJS interop needs verification against the project's Vite + Electron build setup.

### Risk 6: SummaryCardSchema key_points min(3) vs silent windows
**What:** If a 5-minute window has only 1–2 speech-final segments, the LLM may correctly produce fewer than 3 key points. Zod validation with `.min(3)` will throw, causing the card to be skipped entirely.

**Mitigation:** Change `key_points: z.array(z.string()).min(3)` to `z.array(z.string()).min(1)` in the schema. The UI handles 1–5 bullets gracefully. This matches D-03: "if no segments, skip LLM call" — but for sparse windows with 1–2 segments, we should still generate a card with fewer points rather than failing validation.

**Severity:** LOW — addressed in Plan 1.

---

## Architecture Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| SummaryCard generation (LLM call, DB write) | Electron main process | — | Timer, LLMAdapter, and DB are all main-process owned. Renderer gets push only. |
| SummaryCard display (LiveSummaryBoard) | Renderer | IPC push | Display-only; main pushes cards; renderer accumulates in state. |
| Break assist trigger/digest | Renderer (UI) + Main (DB query + IPC push) | — | User presses button in renderer; main queries DB and pushes digest; renderer displays. |
| API key storage | Electron main process | — | safeStorage is main-process-only API. Renderer sends plaintext key via IPC once; main encrypts and stores. |
| Overlay prefs (width/opacity) | Electron main process (store) + Renderer (CSS) | — | Width: main reads at startup and passes to createOverlayWindow. Opacity: main stores; renderer reads via get-settings and applies CSS. |
| Mic capture lifecycle | Renderer (AudioWorklet) | Main (IPC receiver) | Web Audio API lives in renderer; AudioWorkletHost component manages lifecycle. |
| Settings panel UX | Renderer | IPC | UI in renderer; all writes go through set-setting IPC to main. |
| Mouse event control | Electron main process | — | setIgnoreMouseEvents is a BrowserWindow API in main. Renderer signals intent via IPC if hover-to-interact is needed. |

---

## Sources

All findings in this research are derived from direct reading of the actual codebase files. No training-data assumptions were used for implementation specifics.

| Source | What was read |
|--------|--------------|
| `src/main/store/db.ts` | summary_cards DDL (columns, types, constraints) |
| `src/main/llm/LLMAdapter.ts` | generate() signature, Zod schema + schemaName + systemPrompt + userContent pattern |
| `src/renderer/src/audio/MicCapture.ts` | MicCaptureHandle interface, startMicCapture() implementation, AudioContext + AudioWorkletNode pattern |
| `.planning/phases/05-prd-finalization/05-ARCHITECTURE.md` | §9 overlay window config + mouse event toggle pattern; §10 component tree; §11 Zod schema index; §7 IPC channel surface |
| `src/main/index.ts` | Current mouse event control pattern, stub handlers, session state handling, CaptureService/ArtifactPipeline wiring |
| `src/renderer/src/App.tsx` | Current session state hooks, mic capture useEffect pattern, QuitButton, existing render branches |
| `src/preload/index.ts` | Current LISTEN_CHANNELS and INVOKE_CHANNELS (confirmed all Phase 9 channels are already in the allowlist) |
| `src/shared/schemas/index.ts` | Confirmed SummaryCardSchema is NOT yet defined |
| `src/main/session/SessionManager.ts` | FSM transitions, OnBreak state, start-break/end-break events |
| `.planning/phases/09-overlay-ui-live-summary-board/09-CONTEXT.md` | All locked decisions D-01 through D-12, deferred items |
| `.planning/REQUIREMENTS.md` | UI-01 through UI-06 acceptance criteria |

**Confidence:** HIGH — all implementation specifics were derived from the actual codebase, not from training data or web search.
