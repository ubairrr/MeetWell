# Phase 12: Named Speaker Attribution - Pattern Map

**Mapped:** 2026-07-02
**Files analyzed:** 9 (new + modified)
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/main/store/db.ts` (add `speaker_aliases` DDL) | model/config (DDL) | CRUD | `src/main/store/db.ts` (existing `ALL_DDLS`, e.g. `action_items` table) | exact (same file, additive) |
| `src/main/store/SpeakerAliasStore.ts` (NEW) | model/store | CRUD | `src/main/store/ArtifactStore.ts` | exact (same store-class shape: constructor(db), prepared statements, transaction) |
| `src/main/store/speakerRename.ts` (NEW) | utility | transform | none direct — closest shape is `src/main/calendar/CalendarExportService.ts` for "pure transform functions over stored JSON/text" style; otherwise net-new pattern (see Research Pattern 1/2) | role-match (utility, no strong existing analog) |
| `src/main/transcript/TranscriptStore.ts` (add `getDistinctSpeakerLabels`, `getRepresentativeExcerpt`) | model/store | CRUD (read) | same file, existing `getSegmentsByMeeting()` method | exact (same file, additive) |
| `src/main/index.ts` (add `ipcMain.handle('get-speaker-roster', ...)`, `ipcMain.handle('rename-speakers', ...)`) | controller (IPC handler) | request-response | `src/main/index.ts:381-385` (`set-meeting-title`) and `:312-323` (`edit-artifact`) | exact |
| `src/preload/index.ts` (add `'get-speaker-roster'`, `'rename-speakers'` to `INVOKE_CHANNELS`) | config (allowlist) | request-response | same file, existing `INVOKE_CHANNELS` array | exact |
| `src/renderer/src/components/RenameSpeakersModal.tsx` (NEW) | component | request-response | `src/renderer/src/components/ArtifactItem.tsx` (isEditing/Save/Cancel inline-edit pattern) | role-match |
| `src/renderer/src/components/ArtifactReview.tsx` (add "Rename Speakers" button, modal wiring, replace-artifacts-on-response) | component | request-response | same file, existing `handleSaveTitle` / title-input pattern (lines 49-84) | exact |
| `src/main/calendar/CalendarExportService.ts` (no change expected — verify only) | service | request-response | n/a — verification target, not a new file | n/a |

## Pattern Assignments

### `src/main/store/db.ts` — add `speaker_aliases` DDL

**Analog:** same file, `action_items` table DDL (lines 63-79)

**Core DDL pattern** (lines 63-79, existing `action_items` table — shows FK-to-meetings + composite scoping style to mirror):
```sql
CREATE TABLE IF NOT EXISTS action_items (
  id              TEXT PRIMARY KEY,
  meeting_id      TEXT NOT NULL
    REFERENCES meetings(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  assignee_label  TEXT,
  ...
);

CREATE INDEX IF NOT EXISTS idx_action_items_meeting_id
  ON action_items(meeting_id);
```

**New DDL to append inside `ALL_DDLS` template string** (append after `epoch_summaries`, before the closing backtick at line 112):
```sql
CREATE TABLE IF NOT EXISTS speaker_aliases (
  meeting_id      TEXT NOT NULL
    REFERENCES meetings(id) ON DELETE CASCADE,
  original_label  TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (meeting_id, original_label)
);
```

**No `runMigrations()` entry needed** — `CREATE TABLE IF NOT EXISTS` is naturally idempotent (unlike the `ALTER TABLE ADD COLUMN` pattern at lines 117-130 used for column additions to *existing* tables).

---

### `src/main/store/SpeakerAliasStore.ts` (NEW)

**Analog:** `src/main/store/ArtifactStore.ts` (full file, 116 lines)

**Class shape / constructor pattern** (lines 1-6):
```typescript
import crypto from 'crypto'
import Database from 'better-sqlite3-multiple-ciphers'
import type { MeetingArtifacts } from '../../shared/schemas'

export class ArtifactStore {
  constructor(private db: Database.Database) {}
```

**Transaction + prepared-statement pattern** (lines 8-39, `saveArtifacts`) — mirror for `applyRenames`:
```typescript
saveArtifacts(meetingId: string, artifacts: MeetingArtifacts): void {
  const insertArtifact = this.db.prepare(
    'INSERT INTO artifacts (id, meeting_id, artifact_type, content_json, model_used) VALUES (?, ?, ?, ?, ?)'
  )
  const tx = this.db.transaction(() => {
    // ... multiple prepared .run() calls scoped to meetingId ...
  })
  tx()
}
```

**Scoped-update pattern** (lines 51-74, `editArtifact` — shows the "only update fields provided" + always-scope-by-id/meeting style):
```typescript
editArtifact(
  id: string,
  updates: { description?: string; due_date?: string | null; assignee_label?: string | null }
): void {
  const fields: string[] = []
  const values: unknown[] = []
  if (updates.description !== undefined) {
    fields.push('description = ?')
    values.push(updates.description)
  }
  if (fields.length === 0) return
  values.push(id)
  this.db.prepare(`UPDATE action_items SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}
```

**Read pattern to reuse for the roster/alias lookup** (lines 110-114, `getArtifacts` — note RESEARCH.md flags this as currently-unused dead code that Phase 12 gives its first caller):
```typescript
getArtifacts(meetingId: string): Array<{ artifact_type: string; content_json: string }> {
  return this.db.prepare(
    'SELECT artifact_type, content_json FROM artifacts WHERE meeting_id = ? ORDER BY created_at ASC'
  ).all(meetingId) as Array<{ artifact_type: string; content_json: string }>
}
```

**Apply this shape to `SpeakerAliasStore`:**
```typescript
export class SpeakerAliasStore {
  constructor(private db: Database.Database) {}

  getAlias(meetingId: string, originalLabel: string): string | null {
    const row = this.db.prepare(
      'SELECT display_name FROM speaker_aliases WHERE meeting_id = ? AND original_label = ?'
    ).get(meetingId, originalLabel) as { display_name: string } | undefined
    return row?.display_name ?? null
  }

  applyRenames(meetingId: string, mapping: Record<string, string>): void {
    const getAlias = this.db.prepare(
      'SELECT display_name FROM speaker_aliases WHERE meeting_id = ? AND original_label = ?'
    )
    const upsertAlias = this.db.prepare(`
      INSERT INTO speaker_aliases (meeting_id, original_label, display_name, updated_at)
      VALUES (@meeting_id, @original_label, @display_name, @updated_at)
      ON CONFLICT(meeting_id, original_label) DO UPDATE
        SET display_name = excluded.display_name, updated_at = excluded.updated_at
    `)
    const tx = this.db.transaction((meetingId: string, mapping: Record<string, string>) => {
      for (const [originalLabel, newName] of Object.entries(mapping)) {
        const existing = getAlias.get(meetingId, originalLabel) as { display_name: string } | undefined
        const fromName = existing?.display_name ?? originalLabel
        if (fromName === newName) continue
        // ... propagation writes across artifacts/action_items/summary_cards/epoch_summaries here ...
        upsertAlias.run({ meeting_id: meetingId, original_label: originalLabel, display_name: newName, updated_at: Date.now() })
      }
    })
    tx(meetingId, mapping)
  }
}
```

---

### `src/main/store/speakerRename.ts` (NEW — pure utility functions)

**No strong existing analog** — this is the one genuinely new pattern in the phase (deep-walk JSON string replace). RESEARCH.md's Pattern 1/2 code (already vetted against MDN + project conventions) should be used verbatim as the implementation baseline:

```typescript
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
function buildWordBoundaryRegex(label: string): RegExp {
  return new RegExp(`\\b${escapeRegExp(label)}\\b`, 'g')
}
function escapeReplacement(s: string): string {
  return s.replace(/\$/g, '$$$$')
}
function renameInValue(value: unknown, regex: RegExp, safeReplacement: string): unknown {
  if (typeof value === 'string') return value.replace(regex, safeReplacement)
  if (Array.isArray(value)) return value.map((v) => renameInValue(v, regex, safeReplacement))
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = renameInValue(v, regex, safeReplacement)
    return out
  }
  return value
}
export function renameInContentJson(rawJson: string, fromLabel: string, toName: string): string {
  const parsed = JSON.parse(rawJson)
  const regex = buildWordBoundaryRegex(fromLabel)
  return JSON.stringify(renameInValue(parsed, regex, escapeReplacement(toName)))
}
```

**Style note (from `ArtifactStore.ts`):** keep functions small and composable, export named functions (not a class) — this file has no state, unlike the Store classes, so it should follow the free-function style already used nowhere else in `src/main/store/` but is consistent with how `src/shared/schemas/index.ts` exports plain functions/types rather than classes.

---

### `src/main/transcript/TranscriptStore.ts` — add roster query methods

**Analog:** same file, existing `getSegmentsByMeeting` (lines 52-77)

**Prepared-statement-in-constructor vs. ad hoc `.prepare()` note:** existing methods pre-compile statements in the constructor (lines 17-30) for hot-path methods (`appendSegment`, `getSegmentsByMeeting`), but the new roster methods are called rarely (only when the rename modal opens) — inline `.prepare()` per call (as `ArtifactStore.getConfirmedActionItems` does at lines 98-99) is acceptable and matches RESEARCH.md's provided code:

```typescript
getDistinctSpeakerLabels(meetingId: string): string[] {
  const rows = this.db.prepare(
    'SELECT DISTINCT speaker_label FROM transcript_segments WHERE meeting_id = ? ORDER BY speaker_label ASC'
  ).all(meetingId) as Array<{ speaker_label: string }>
  return rows.map((r) => r.speaker_label)
}

getRepresentativeExcerpt(meetingId: string, label: string): string | null {
  const substantial = this.db.prepare(
    `SELECT text FROM transcript_segments
     WHERE meeting_id = ? AND speaker_label = ? AND length(text) > 15
     ORDER BY timestamp_start ASC LIMIT 1`
  ).get(meetingId, label) as { text: string } | undefined
  if (substantial) return substantial.text
  const any = this.db.prepare(
    `SELECT text FROM transcript_segments WHERE meeting_id = ? AND speaker_label = ? ORDER BY timestamp_start ASC LIMIT 1`
  ).get(meetingId, label) as { text: string } | undefined
  return any?.text ?? null
}
```

Return-shape convention to follow (same file, lines 65-77 `getSegmentsByMeeting`): map raw snake_case SQL rows to camelCase before returning, matching the rest of `TranscriptStore`'s public API.

---

### `src/main/index.ts` — add `get-speaker-roster` and `rename-speakers` IPC handlers

**Analog:** `set-meeting-title` (lines 381-385) for the simple-validate-then-write shape; `edit-artifact` (lines 312-323) for the nested-object Zod schema shape.

**Imports pattern** (top of file — verify existing `z` import and store instantiation block; not re-read here since already confirmed via grep, follow existing `artifactStore`/`calendarExportService` instantiation convention).

**Simple validate-then-write pattern** (lines 381-385, `set-meeting-title`):
```typescript
ipcMain.handle('set-meeting-title', (_event, payload: unknown) => {
  const result = z.object({ meetingId: z.string(), title: z.string().min(1).max(200) }).safeParse(payload)
  if (!result.success) return
  db!.prepare('UPDATE meetings SET title = ? WHERE id = ?').run(result.data.title.trim(), result.data.meetingId)
})
```

**Nested-object Zod validation pattern** (lines 312-323, `edit-artifact`):
```typescript
ipcMain.handle('edit-artifact', (_event, payload: unknown) => {
  const result = z.object({
    id: z.string(),
    updates: z.object({
      description: z.string().optional(),
      due_date: z.string().nullable().optional(),
      assignee_label: z.string().nullable().optional(),
    }),
  }).safeParse(payload)
  if (!result.success) return
  artifactStore.editArtifact(result.data.id, result.data.updates)
})
```

**Session-state gating pattern** (from `src/main/session/SessionManager.ts:49` `getState()` and usage at `src/main/index.ts:236,251,255,264,271,279,289` via `session.transition(...)`) — the rename handler must gate the same way state transitions are checked elsewhere:
```typescript
ipcMain.handle('rename-speakers', (_event, payload: unknown) => {
  if (session.getState() !== 'Complete') {
    return { error: 'rename only allowed after meeting completion' }
  }
  const result = z.object({
    meetingId: z.string(),
    mapping: z.record(z.string(), z.string().trim().min(1).max(100)),
  }).safeParse(payload)
  if (!result.success) return { error: 'invalid payload' }

  speakerAliasStore.applyRenames(result.data.meetingId, result.data.mapping)
  const rows = artifactStore.getArtifacts(result.data.meetingId)
  return reconstructMeetingArtifacts(result.data.meetingId, rows)
})
```

**Error handling convention:** existing handlers in this file (`edit-artifact`, `set-meeting-title`) return `undefined` on validation failure (silent no-op to renderer); `export-ics`/`set-setting` return an explicit `{ error: string }` object. For `rename-speakers`, follow the `{ error }` convention (matches `set-setting` lines 344-379) since the renderer needs to distinguish "state gate rejected" from "success" to show useful UI feedback.

---

### `src/preload/index.ts` — add new channels to `INVOKE_CHANNELS`

**Analog:** same file, existing array (lines 13-33)

**Exact edit location:**
```typescript
const INVOKE_CHANNELS = [
  'consent-confirmed',
  'mic-audio-chunk',
  'start-meeting',
  'end-meeting',
  'dismiss-session',
  'start-break',
  'end-break',
  'confirm-artifact',
  'edit-artifact',
  'dismiss-artifact',
  'export-ics',
  'get-settings',
  'set-setting',
  'set-meeting-title',
  'set-focusable',
  'quit-app',
  'resize-window',
  'open-permission-settings',
  'get-permission-status',
  // ADD: 'get-speaker-roster',
  // ADD: 'rename-speakers',
] as const
```
No changes needed to `LISTEN_CHANNELS` — the rename flow is request-response only (no server-push event), consistent with RESEARCH.md's finding that there is no reload/refresh-event path in this app; the IPC *response* payload is the only channel back to the UI (mirrors how `export-ics`'s return value, not a push event, drives `ArtifactReview`'s `exportResult` state at lines 89-90).

---

### `src/renderer/src/components/RenameSpeakersModal.tsx` (NEW)

**Analog:** `src/renderer/src/components/ArtifactItem.tsx` (full file, 158 lines) — the `isEditing` / textarea / Save-Cancel button-row pattern.

**State + inline-edit toggle pattern** (lines 32-34, 39-55, 83-119):
```typescript
const [isEditing, setIsEditing] = useState(false)
const [editValue, setEditValue] = useState(text)
// ...
{isEditing ? (
  <textarea
    value={editValue}
    onChange={(e) => setEditValue(e.target.value)}
    rows={3}
    style={{ width: '100%', background: 'rgba(255,255,255,0.08)', border: '1px solid #4b5563', borderRadius: '4px', color: '#f3f4f6', fontSize: '12px', padding: '6px 8px', resize: 'vertical', boxSizing: 'border-box' }}
  />
) : (
  <span onClick={() => setIsEditing(true)} style={{ fontSize: '12px', color: '#f3f4f6', cursor: 'pointer' }}>
    {text}
  </span>
)}
```

**Save/Cancel button pair styling** (lines 84-119) — reuse verbatim for the modal's per-row Save affordance, but per D-03 the modal stages all rows and has ONE outer "Save" (not per-row), so only the *visual* button styles should be copied, not the per-row commit logic.

**Adaptation for this component:** Model the roster list as an array of `{ label: string, excerpt: string | null, currentName: string }` rows, each rendered as a `<span>`/`<input>` pair (not textarea — single-line names), with local component state `Record<label, string>` for staged edits, following the same "local state until explicit Save" idiom as `ArtifactItem`'s `editValue`.

---

### `src/renderer/src/components/ArtifactReview.tsx` — add "Rename Speakers" entry point

**Analog:** same file, existing title-save flow (lines 49-50, 79-84) — closest existing "open input, stage local value, invoke on save" pattern in this exact component.

**Staged-value + invoke-on-save pattern** (lines 49-50, 79-84):
```typescript
const [meetingTitle, setMeetingTitle] = useState('')
const [titleSaved, setTitleSaved] = useState(false)
// ...
const handleSaveTitle = () => {
  const trimmed = meetingTitle.trim()
  if (!trimmed) return
  window.electronAPI.invoke('set-meeting-title', { meetingId, title: trimmed }).catch(console.error)
  setTitleSaved(true)
}
```

**Existing artifact-mutation invoke pattern** (lines 61-77, `handleConfirm`/`handleDismiss`/`handleEdit`) — note these do NOT replace `artifacts` state (no reload path exists per RESEARCH.md); the new rename flow is the first mutation that must replace `artifacts` prop/state from the IPC response:
```typescript
const handleConfirm = (id: string) => {
  window.electronAPI.invoke('confirm-artifact', { id, type: 'action_item' }).catch(console.error)
  setConfirmedItems((prev) => new Set([...prev, id]))
}
```

**New pattern needed (not in existing code) — replace-state-from-response:**
```typescript
const handleRenameSpeakers = async (mapping: Record<string, string>) => {
  try {
    const result = await window.electronAPI.invoke('rename-speakers', { meetingId, mapping }) as
      | { error: string }
      | ArtifactReviewProps['artifacts']
    if ('error' in result) { console.error('[ArtifactReview] rename failed:', result.error); return }
    setArtifacts(result) // requires lifting `artifacts` from prop to local state, or lifting this handler to the parent (App.tsx) that owns `artifacts`
  } catch (err) {
    console.error('[ArtifactReview] rename failed:', err)
  }
}
```
**Important:** `ArtifactReview` currently receives `artifacts` as a read-only prop (line 42, `{ meetingId, artifacts }: ArtifactReviewProps`) — there is no local state for it in this component. The planner must decide whether to (a) lift `artifacts` into local state inside `ArtifactReview` via `useState(artifacts)` seeded from the prop, or (b) have the parent (`App.tsx`, which owns `useArtifactProposals()`) handle the state replacement and pass an updated `artifacts` prop back down. Check `src/renderer/src/App.tsx`'s `useArtifactProposals()` hook before choosing.

---

### `src/main/calendar/CalendarExportService.ts` — verification only, no code change expected

**Analog:** same file (lines 1-45 read) — confirms `.ics` export reads `action_items.assignee_label` directly:
```typescript
description: item.assignee_label ? `Owner: ${item.assignee_label}` : 'Owner: You',
```
Since D-06 mutates `action_items.assignee_label` in place on rename, this line requires **no change** — SPKR-03 is satisfied automatically once the propagation transaction includes this column. Include a regression test here (per RESEARCH.md Wave 0 gap) rather than a code change.

---

## Shared Patterns

### Session-state gating (SessionManager FSM)
**Source:** `src/main/session/SessionManager.ts:49` (`getState()`), usage pattern at `src/main/index.ts:251,255,264,271,279,289` (`session.transition(...)`)
**Apply to:** `rename-speakers` and `get-speaker-roster` IPC handlers — both must check `session.getState() === 'Complete'` server-side per CLAUDE.md's "consent gate enforced in main process, not just UI" convention.

### Zod-validate-then-store-write IPC handler shape
**Source:** `src/main/index.ts:307-385` (`confirm-artifact`, `edit-artifact`, `dismiss-artifact`, `set-meeting-title`)
**Apply to:** All new IPC handlers in this phase — `safeParse`, bail with `undefined`/`{ error }` on failure, delegate the actual mutation to a store method (never inline SQL in `index.ts` beyond the one-liner `set-meeting-title` exception).

### Prepared-statement + `db.transaction()` wrapping for multi-row writes
**Source:** `src/main/store/ArtifactStore.ts:8-39` (`saveArtifacts`), `:76-82` (`stampIcsExported`)
**Apply to:** `SpeakerAliasStore.applyRenames` — every propagation write (artifacts, action_items, summary_cards, epoch_summaries, speaker_aliases upsert) must happen inside one `db.transaction()` per SPKR-02/05 requirements.

### `WHERE meeting_id = ?` scoping on every query
**Source:** pervasive across `ArtifactStore.ts` and `TranscriptStore.ts` (every method takes `meetingId` and parameterizes it)
**Apply to:** All new SQL in `SpeakerAliasStore` and `TranscriptStore` roster methods — this is the SPKR-05 cross-meeting-isolation requirement; no query in this phase may omit it.

### Preload allowlist addition
**Source:** `src/preload/index.ts:13-33` (`INVOKE_CHANNELS`)
**Apply to:** `get-speaker-roster`, `rename-speakers` — must be added here before `window.electronAPI.invoke(...)` calls will work; forgetting this produces a runtime "Blocked: channel not in allowlist" rejection, not a compile error.

### Invoke-then-optimistic-local-state renderer pattern
**Source:** `src/renderer/src/components/ArtifactReview.tsx:61-84` (`handleConfirm`, `handleDismiss`, `handleSaveTitle`)
**Apply to:** `RenameSpeakersModal`'s Save button and `ArtifactReview`'s rename handler — but note the rename flow is the *first* case in this codebase where the IPC response must overwrite existing displayed content rather than just toggle a `Set`/boolean flag (see Pitfall 6 in RESEARCH.md).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/main/store/speakerRename.ts` | utility | transform | No existing "parse JSON → deep-walk mutate decoded strings → re-stringify" utility exists anywhere in the codebase; this is genuinely new logic. Use RESEARCH.md's Pattern 1/2 code (already vetted against MDN docs) as the implementation baseline rather than searching further for an analog. |

## Metadata

**Analog search scope:** `src/main/store/`, `src/main/transcript/`, `src/main/index.ts`, `src/main/session/`, `src/main/calendar/`, `src/main/capture/SpeakerNormalizer.ts`, `src/preload/index.ts`, `src/renderer/src/components/`
**Files scanned:** 9 read directly (`db.ts`, `ArtifactStore.ts`, `TranscriptStore.ts`, `index.ts` [partial, grep-targeted], `preload/index.ts`, `ArtifactItem.tsx`, `ArtifactReview.tsx` [partial], `SpeakerNormalizer.ts` [partial], `CalendarExportService.ts` [partial]) + grep sweeps for `ipcMain.handle`, `CREATE TABLE`, `INVOKE_CHANNELS`, `getState`
**Pattern extraction date:** 2026-07-02
