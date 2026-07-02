# Phase 13: Meeting-Type Artifact Templates - Pattern Map

**Mapped:** 2026-07-02
**Files analyzed:** 6
**Analogs found:** 6 / 6 (all are self-analogs — this phase modifies existing files in place, not net-new files)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/renderer/src/components/ConsentGate.tsx` | component | request-response (IPC invoke) | itself (existing checkbox/button UI in same file) | exact — self-modification |
| `src/main/pipeline/ArtifactPipeline.ts` (`runStage2Mom`) | service | request-response (LLM generate call) | `runStage2Summary`/`runStage2KeyPoints`/`runStage2ActionItems` in the same file (sibling Stage 2 methods) | exact — same class, same method shape |
| `src/shared/schemas/index.ts` (`MoMSchema`) | model (zod schema) | transform | `QuoteAnchorSchema`, `KeyPointSchema` in the same file | exact — same file, same zod convention |
| `src/main/store/db.ts` (`meetings` DDL + migration) | migration/config | batch (schema DDL) | `runMigrations()`'s existing `action_items.is_calendar_event` / `transcript_segments.confidence` column-add pattern in the same file | exact — established precedent in same function |
| `src/main/session/SessionManager.ts` / `src/main/capture/CaptureService.ts` (`createMeeting` call site) + `src/main/transcript/TranscriptStore.ts` (`createMeeting` method) | model/service (DB write) | CRUD (insert) | `TranscriptStore.createMeeting()` itself | exact — same method being extended |
| `src/preload/index.ts` (INVOKE_CHANNELS payload typing) | middleware (IPC allowlist) | request-response | itself — channel already allowlisted, only payload shape at call sites changes | exact — no new channel needed |

## Pattern Assignments

### `src/renderer/src/components/ConsentGate.tsx` (component, request-response)

**Analog:** same file, existing checkbox + button block (lines 95–117) and `handleConfirm` (lines 66–73).

**Current state (imports + component shell)** (lines 1, 58–59):
```tsx
import React, { useState } from 'react'
...
export function ConsentGate({ onConfirmed, permissionStatus }: ConsentGateProps): React.JSX.Element {
  const [agreed, setAgreed] = useState(false)
```
Add a `meetingType` state var alongside `agreed`, e.g. `const [meetingType, setMeetingType] = useState<'general' | 'standup' | '1:1' | 'planning'>('general')`.

**IPC payload pattern to extend** (lines 66–73):
```tsx
async function handleConfirm() {
  if (!agreed) return
  await window.electronAPI.invoke('consent-confirmed', {
    meetingId: crypto.randomUUID(),
    timestamp: Date.now(),
  })
  onConfirmed()
}
```
Add `meetingType` into the payload object: `meetingType` key alongside `meetingId`/`timestamp`.

**Inline-style button convention to copy for the 4 segmented buttons** (lines 31–48, the "Fix in System Preferences" button, and lines 105–117, the "Start Meeting" button):
```tsx
<button
  onClick={...}
  style={{
    flexShrink: 0,
    fontSize: '11px',
    background: 'rgba(239,68,68,0.25)',
    border: '1px solid rgba(239,68,68,0.5)',
    borderRadius: '4px',
    color: '#fca5a5',
    padding: '3px 8px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }}
>
  Fix in System Preferences &rarr;
</button>
```
And the disabled/enabled toggle-style pattern used on the "Start Meeting" button (lines 105–117):
```tsx
<button
  onClick={handleConfirm}
  disabled={!agreed}
  style={{
    marginTop: '12px',
    padding: '8px 16px',
    fontSize: '13px',
    cursor: agreed ? 'pointer' : 'not-allowed',
    opacity: agreed ? 1 : 0.5,
  }}
>
  Start Meeting
</button>
```
For the segmented selector, render 4 buttons in a flex row, each toggling `meetingType` on click, with the selected one visually distinguished (e.g. different `background`/`border` when `meetingType === value`) — follow the same flat inline-style-object convention, no CSS framework, no external classnames. Place the row above the existing consent `<label>` block (after the `<p>` disclosure text, before line 95's checkbox label), per D-01.

---

### `src/main/pipeline/ArtifactPipeline.ts` — `runStage2Mom` (service, request-response)

**Analog:** the other three Stage 2 methods in the same class (`runStage2Summary` lines 154–173, `runStage2KeyPoints` lines 175–200, `runStage2ActionItems` lines 202–240) — all follow: build `systemPrompt` string → call `this.llmAdapter.generate(Schema, label, systemPrompt, JSON.stringify({ anchors }))`.

**Current `runStage2Mom` signature and prompt shape to extend** (lines 111–152):
```typescript
private async runStage2Mom(anchors: QuoteAnchor[], meetingDate: string): Promise<MoM> {
  const systemPrompt = `You are a meeting minutes writer. ...
ABSOLUTE RULES — READ CAREFULLY:
1. ...
Meeting date (ISO 8601): ${meetingDate}

INPUT FORMAT: ...

OUTPUT FORMAT — a JSON object with a "markdown_content" key containing the full MOM as a markdown string with these sections:
# Minutes of Meeting
...
## Agenda Items Discussed
...
## Decisions Made
...
## Action Items
...
## Next Steps
...`

  return this.llmAdapter.generate(MoMSchema, 'minutes_of_meeting', systemPrompt, JSON.stringify({ anchors }))
}
```

**Pattern to apply (D-02/D-03/D-04):** add a third parameter `meetingType: MeetingType` to the signature. Extract the section-list portion of the OUTPUT FORMAT (currently hardcoded: Agenda Items Discussed / Key Discussion Points / Decisions Made / Action Items / Next Steps) into a small per-type lookup object (module-level `const MOM_SECTION_SPECS: Record<MeetingType, string>` or similar), keyed by `meetingType`, and interpolate it into the template in place of the hardcoded section list — keep the shared skeleton (`# Minutes of Meeting`, `**Date:**`, `## Attendees`, `## Action Items` table, ABSOLUTE RULES block, INPUT FORMAT) exactly as-is per D-02. Follow the exact ABSOLUTE RULES → meeting date → INPUT FORMAT → OUTPUT FORMAT shape already used consistently across all 4 Stage 2 methods (established pattern, see Shared Patterns below).

**Call site to update** (`run()`, line 280, specifically line 310):
```typescript
const [mom, summary, keyPoints, actionItems] = await Promise.all([
  this.runStage2Mom(anchors, meetingDate),
  this.runStage2Summary(anchors, meetingDate),
  this.runStage2KeyPoints(anchors, meetingDate),
  this.runStage2ActionItems(anchors, meetingDate),
])
```
Needs `meetingType` sourced and threaded into the first call only (D-05 — only MOM varies). Follow the existing `getMeetingDate()` query pattern (lines 66–70) to add a `getMeetingType()` (or extend `getMeetingDate` to also select `meeting_type`) — same `this.db.prepare('SELECT ... FROM meetings WHERE id = ?').get(this.meetingId)` shape:
```typescript
private getMeetingDate(): string {
  const row = this.db.prepare('SELECT started_at FROM meetings WHERE id = ?').get(this.meetingId) as { started_at: number } | undefined
  const startedAt = row?.started_at ?? Date.now()
  return new Date(startedAt).toISOString().split('T')[0]
}
```

**D-08 stamping requirement:** after `runStage2Mom` returns, the resulting `mom.meeting_type` field must be present in the object saved via `this.artifactStore.saveArtifacts(...)` (line 327) — since `MoMSchema` gains a `meeting_type` field (see next section), either have the LLM populate it directly per the OUTPUT FORMAT spec, or stamp it programmatically after the `llmAdapter.generate` call returns (safer — avoids relying on the LLM to echo back a value we already know).

---

### `src/shared/schemas/index.ts` — `MoMSchema` (model/zod schema, transform)

**Analog:** `KeyPointSchema` (lines 41–46) and `QuoteAnchorSchema` (lines 17–25) — both show the project convention of `z.object({...})` + `z.enum([...])` for closed string sets, paired with an exported `z.infer` type alias.

**Current `MoMSchema`** (lines 31–34):
```typescript
export const MoMSchema = z.object({
  markdown_content: z.string(),
})
export type MoM = z.infer<typeof MoMSchema>
```

**Pattern to apply (D-08):** add a `meeting_type` field using the same `z.enum([...])` convention seen in `QuoteAnchorSchema.confidence` (line 23) and `artifact_hint` (line 24):
```typescript
export const MoMSchema = z.object({
  markdown_content: z.string(),
  meeting_type: z.enum(['general', 'standup', '1:1', 'planning']),
})
export type MoM = z.infer<typeof MoMSchema>
```
Consider exporting a shared `MeetingTypeSchema = z.enum([...])` / `type MeetingType = z.infer<typeof MeetingTypeSchema>` near the top of the file (alongside `TranscriptSegmentSchema`) so both `MoMSchema` and `ArtifactPipeline.ts`'s `runStage2Mom` signature can reuse the same type instead of duplicating the string-literal union.

---

### `src/main/store/db.ts` — `meetings` DDL + migration (migration/config, batch)

**Analog:** the existing `runMigrations()` function's own precedent for adding columns to a shipped table (lines 126–145) — this is the exact pattern D-07 asks to follow/extend, not an external analog.

**DDL to extend** (lines 12–20):
```sql
CREATE TABLE IF NOT EXISTS meetings (
  id               TEXT PRIMARY KEY,
  title            TEXT,
  started_at       INTEGER NOT NULL,
  ended_at         INTEGER,
  participant_count INTEGER,
  raw_audio_path   TEXT,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
```
Add `meeting_type TEXT NOT NULL DEFAULT 'general' CHECK (meeting_type IN ('general','standup','1:1','planning'))` as a new column in this DDL (covers fresh installs).

**Migration pattern to copy exactly** (lines 126–145):
```typescript
export function runMigrations(db: Database.Database): void {
  const runSafe = (sql: string) => {
    try {
      db.exec(sql)
    } catch (err: unknown) {
      if (err instanceof Error && err.message.toLowerCase().includes('duplicate column name')) return
      throw err
    }
  }

  const transcriptCols = db.pragma('table_info(transcript_segments)') as Array<{ name: string }>
  if (!transcriptCols.some((c) => c.name === 'confidence')) {
    runSafe('ALTER TABLE transcript_segments ADD COLUMN confidence REAL')
  }

  const actionCols = db.pragma('table_info(action_items)') as Array<{ name: string }>
  if (!actionCols.some((c) => c.name === 'is_calendar_event')) {
    runSafe('ALTER TABLE action_items ADD COLUMN is_calendar_event INTEGER NOT NULL DEFAULT 0')
  }
}
```
Add a third block using the identical `db.pragma('table_info(meetings)')` + `.some((c) => c.name === 'meeting_type')` + `runSafe('ALTER TABLE meetings ADD COLUMN meeting_type TEXT NOT NULL DEFAULT \'general\' CHECK (meeting_type IN (\'general\',\'standup\',\'1:1\',\'planning\'))')` shape (note: SQLite's `ALTER TABLE ADD COLUMN` does not support inline CHECK constraints referencing multiple values reliably across all SQLite versions used by `better-sqlite3` — verify at implementation time whether the CHECK needs to be a separate `CREATE TRIGGER` or whether SQLite's ALTER COLUMN CHECK support suffices; this is a Claude's Discretion item flagged in CONTEXT.md D-07/footnote). No new function needed — extend the existing `runMigrations()`, called already at line 191 (`openDatabase()`) after `ALL_DDLS`.

---

### `TranscriptStore.createMeeting()` + call site in `CaptureService.ts` (model/service, CRUD insert)

**Analog:** the method itself, `TranscriptStore.ts` lines 16–35.

**Current INSERT + method signature**:
```typescript
constructor(private db: Database.Database) {
  this.insertMeetingStmt = db.prepare(
    'INSERT INTO meetings (id, started_at, created_at) VALUES (?, ?, ?)'
  )
  ...
}

createMeeting(meetingId: string, startedAt: number): void {
  this.insertMeetingStmt.run(meetingId, startedAt, Date.now())
}
```

**Call site** (`src/main/capture/CaptureService.ts:27`):
```typescript
this.transcriptStore.createMeeting(meetingId, Date.now())
```

**Pattern to apply:** extend the prepared statement to `INSERT INTO meetings (id, started_at, created_at, meeting_type) VALUES (?, ?, ?, ?)`, add a `meetingType: MeetingType = 'general'` parameter to `createMeeting()`, and thread it through from `CaptureService.ts`'s call site. The `meetingType` value itself needs to flow from the renderer's `consent-confirmed` IPC payload (`ConsentGate.tsx`) through `src/main/index.ts`'s `ipcMain.handle('consent-confirmed', (_event, _payload) => {...})` handler (line 259) into wherever `CaptureService` is invoked/constructed — currently `_payload` is discarded entirely (`(_event, _payload) =>`), so this handler needs to actually read `_payload.meetingType` and propagate it (likely via `session.transition('consent-confirmed', payload)` or a similar mechanism — check `SessionManager.transition()`'s signature for how event payloads are threaded through the FSM, since `CaptureService.createMeeting` call happens downstream of the FSM transition, not directly in the IPC handler).

---

### `src/preload/index.ts` — INVOKE_CHANNELS payload typing (middleware, request-response)

**Analog:** the file itself — `consent-confirmed` is already present in `INVOKE_CHANNELS` (line 14) and typed generically (`invoke(channel: string, payload?: unknown)`, line 41).

**No channel-list change needed.** The allowlist mechanism (lines 40–46) accepts any `payload?: unknown` and passes it through — this file requires **no code change** for this phase since the channel already exists and payload typing is not statically enforced at the preload boundary (it's `unknown` end-to-end). The `meetingType` addition is purely a call-site concern in `ConsentGate.tsx` (sender) and `src/main/index.ts`'s `consent-confirmed` handler (receiver) — confirm this during planning rather than assuming a schema/type file needs updating here.

---

## Shared Patterns

### Stage 2 prompt shape (ABSOLUTE RULES → meeting date → INPUT FORMAT → OUTPUT FORMAT)
**Source:** `src/main/pipeline/ArtifactPipeline.ts` — all four `runStage2*` methods (lines 111–240)
**Apply to:** the new type-conditional `runStage2Mom` — preserve this exact four-part shape; only the OUTPUT FORMAT section list becomes type-conditional (D-02/D-03).

### Migration-on-startup pattern (`table_info` pragma + duplicate-column-safe ALTER)
**Source:** `src/main/store/db.ts` `runMigrations()` (lines 126–145)
**Apply to:** the new `meeting_type` column addition (D-07) — this is the first precedent Phase 14 (`vec_chunks` columns) will also reuse per CONTEXT.md, so keep the `runSafe` helper generic (already is).

### Inline-style-only component styling (no CSS framework)
**Source:** `src/renderer/src/components/ConsentGate.tsx` (entire file, lines 13–120)
**Apply to:** the new segmented-button row in the same file — do not introduce any CSS-in-JS library, styled-components, or Tailwind classes; use plain `style={{...}}` objects matching existing color/spacing tokens (e.g. `fontSize: '13px'`, `borderRadius: '4px'`/`'6px'`, `rgba(...)` colors).

### Zod schema + z.infer type-export convention
**Source:** `src/shared/schemas/index.ts` (entire file)
**Apply to:** the extended `MoMSchema` and any new `MeetingTypeSchema` — always pair `export const XSchema = z.object({...})` with `export type X = z.infer<typeof XSchema>` immediately below it.

## No Analog Found

None — every target file in this phase is a modification of an existing file, and the closest analog for each is either the file itself (sibling code within the same file) or an established in-repo precedent (e.g. the migration pattern). No net-new architectural pattern is being introduced.

## Metadata

**Analog search scope:** `src/renderer/src/components/`, `src/main/pipeline/`, `src/main/store/`, `src/main/session/`, `src/main/capture/`, `src/main/transcript/`, `src/preload/`, `src/shared/schemas/`
**Files scanned:** `ConsentGate.tsx`, `ArtifactPipeline.ts`, `schemas/index.ts`, `db.ts`, `SessionManager.ts`, `TranscriptStore.ts`, `CaptureService.ts`, `main/index.ts`, `preload/index.ts`
**Pattern extraction date:** 2026-07-02
</content>
