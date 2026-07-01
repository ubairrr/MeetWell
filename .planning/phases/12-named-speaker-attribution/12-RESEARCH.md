# Phase 12: Named Speaker Attribution - Research

**Researched:** 2026-07-02
**Domain:** In-place JSON-blob string rewriting for a local-first Electron/SQLite app; no new external libraries
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** A "Rename Speakers" button in ArtifactReview opens a dedicated modal listing every distinct `speaker_label` detected in the meeting (not inline click-to-rename scattered across citations).
- **D-02:** Each speaker row in the modal shows a representative transcript excerpt (first substantial line from `transcript_segments` for that `speaker_label`) next to the rename text input, so the user can tell speakers apart without leaving the screen.
- **D-03:** Renames are staged in the modal and committed as a single batch on one "Save" — one IPC call carrying the full label→name mapping, not per-field auto-save.
- **D-04:** Rename UI is available post-meeting only, in ArtifactReview (session `Complete` state). Live renaming during `Capturing`/`OnBreak` is explicitly out of scope for this phase (see Deferred Ideas).
- **D-05:** On save, apply a word-boundary-aware find/replace of each exact `speaker_label` token across the meeting's stored artifact `content_json` — this covers LLM-generated prose (MOM, key points, summary) that already contains the label baked into sentences, since Stage 2 generation is explicitly instructed not to substitute real names at generation time.
- **D-06:** Structured fields — `action_items.assignee_label` and any `speaker_label` references embedded inside artifact `content_json` (e.g. citation anchors) — are updated the same way: direct mutation on save, not resolved via a join at read time. One mechanism for all artifact-level propagation.
- **D-07:** No Stage 2 LLM re-run on rename — the find/replace approach is deterministic, free, and instant.
- **Boundary (locked at project level):** `transcript_segments.speaker_label` is never mutated — resolved via a new `speaker_aliases` table `(meeting_id, original_label)` at read time for that one table only. The anti-pattern protects the immutable raw transcript; it does not extend to derived artifacts, which this phase's find/replace approach intentionally does mutate.
- **D-08:** "You" is included in the rename modal alongside "Speaker 1/2/3" — it's just another `speaker_label` value in `transcript_segments`, so the same rename mechanism applies uniformly.

### Claude's Discretion
- Exact word-boundary regex/matching strategy for the find/replace pass (e.g. handling "Speaker 1" as a substring of "Speaker 10"-style edge cases, though the app caps at "Speaker 8").
- Whether the `speaker_aliases` table is also consulted for the transcript view within ArtifactReview (if one exists) even though `transcript_segments` itself stays unmutated — implementation detail of the read path.
- Exact modal layout/styling — follow existing ArtifactReview/ArtifactItem visual patterns.

### Deferred Ideas (OUT OF SCOPE)
- **Live rename during Capturing/OnBreak** — renaming speakers while the meeting is still active, requiring real-time sync with `SummaryCardTimer`/`LiveSummaryBoard`. Deferred out of Phase 12's scope (D-04); could be a future enhancement if user feedback demands it.
</user_constraints>

## Summary

Phase 12 requires no new packages and no new architectural layers — it is a data-propagation problem inside code that already exists (`ArtifactStore`, `TranscriptStore`, `db.ts`). The entire technical risk is concentrated in one place: **safely rewriting speaker-label substrings inside JSON blobs without corrupting the JSON, without over-matching, and without losing renames when a speaker is renamed twice.**

The codebase reading confirms three things that materially change the plan shape from what CONTEXT.md's code_context implies:

1. **There is no "reload artifacts from DB" path today.** `ArtifactReview`'s `artifacts` prop is populated once, in-memory, from the `artifact-proposals-ready` push event (`App.tsx: useArtifactProposals()`). `ArtifactStore.getArtifacts(meetingId)` exists but is **currently unused dead code**. This means the rename IPC handler must return the updated artifact content directly (reusing `getArtifacts()` for the first time) so the renderer can replace its local state — there is nothing to "refresh from" otherwise.
2. **There is no transcript-view UI at all today.** `CaptureService` pushes a `transcript-segment` event and preload allowlists it, but `App.tsx` never subscribes to it — it's unused. This means the "read-time alias resolution join for the transcript view" that CONTEXT.md flags as Claude's Discretion has **no current consumer to wire up**. The `speaker_aliases` table must still be created and populated (it's a locked project-level decision and future phases will need it), but this phase has no read-path to build against it.
3. **Renaming must be idempotent against repeat edits within the same Complete-state session.** The modal enumerates labels from `transcript_segments` (immutable), but a second rename of an already-renamed speaker must find-replace the *currently effective name*, not the original raw label — otherwise the second save is a silent no-op. `speaker_aliases` is the natural place to look up "what name is currently live for this original_label" before building the regex.

**Primary recommendation:** Do the propagation as parse → deep-walk-replace-on-decoded-strings → re-stringify (never raw regex over serialized JSON text), with a single shared utility function used identically across all four artifact rows, the `action_items` table columns, and (for full-DB consistency) `summary_cards`/`epoch_summaries`. Look up the current effective name from `speaker_aliases` before building the "from" pattern so repeat renames work correctly.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Rename modal UI (roster, excerpts, staged edits) | Frontend (Renderer) | — | Pure display/interaction; no logic beyond staging a `Record<string,string>` |
| Speaker roster + representative excerpt lookup | API/Backend (Main) | Database | Reads `transcript_segments`, requires SQL aggregation (`DISTINCT`, `ORDER BY ... LIMIT 1`) — not renderer's job |
| Rename propagation (find/replace across artifacts) | API/Backend (Main) | Database | All mutation logic lives in `ArtifactStore`/new `SpeakerAliasStore`; renderer never touches SQL |
| `speaker_aliases` persistence + read-time resolution | Database / Storage | API/Backend | New table; owned by main-process store layer; no renderer access |
| Updated-artifacts propagation back to UI | API/Backend (Main) → Frontend | — | No DB-reload path exists; IPC response payload is the only channel back to renderer state |
| `.ics` export of renamed labels | API/Backend (Main) | — | `CalendarExportService` already reads `action_items.assignee_label` directly — satisfied for free once that column is mutated on rename |

## Project Constraints (from CLAUDE.md)

- All artifact edits go through Zod-validated `ipcMain.handle`, then a store method — mirror the exact pattern used by `edit-artifact`/`set-meeting-title` (`src/main/index.ts`), not ad hoc DB access from the renderer.
- No raw `ipcRenderer` in the renderer — the new `rename-speakers` (and any roster-fetch) channel must be added to `INVOKE_CHANNELS` in `src/preload/index.ts` before use.
- `SessionManager` FSM: renaming is a `Complete`-state-only feature (D-04). The main process must gate on `session.getState() === 'Complete'` server-side, not just hide the button — this mirrors the existing pattern where the consent gate is enforced in main, not just the UI (per CLAUDE.md "SessionManager FSM" convention).
- `transcript_segments.speaker_label` must never be mutated (anti-pattern from STATE.md, reinforced by CONTEXT.md's Boundary note). Only `speaker_aliases` may encode the mapping for that table.
- `EpochCompressor` reads exclusively from `transcript_segments` — renaming has no effect on and must not touch `EpochCompressor`'s read path (it never reads `content_json` or aliases).
- DB init sequence / DDL convention: new tables are added as `CREATE TABLE IF NOT EXISTS` inside `ALL_DDLS` in `src/main/store/db.ts`, executed unconditionally on every `openDatabase()` call. Only column additions to *existing* tables need the `runMigrations()` idempotent-`ALTER TABLE` pattern — a wholly new table does not.
- Zod schemas are the single source of truth (`src/shared/schemas/index.ts`) — but `speaker_aliases` is an internal DB row shape, not an LLM-facing structured output, so a plain TS interface (not a Zod schema feeding `zod-to-json-schema`) is appropriate, consistent with how `StoredSummaryCard`/`StoredEpochSummary` are handled (plain interfaces, not Zod, since they mirror DB columns exactly).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SPKR-01 | User can rename a diarized speaker label to a display name during or after a meeting | D-01/D-02/D-03/D-04 scope this to post-meeting (`Complete` state) only; see Architecture Patterns for modal data flow (roster query + batch save) |
| SPKR-02 | Renamed attribution persists and applies to MOM, summary, action items, citations for that meeting | Deep-walk find/replace over `artifacts.content_json` (all 4 types) + `action_items.assignee_label`/`citations_json`; see Code Examples |
| SPKR-03 | Renamed attribution appears in exported .ics and other export surfaces | `CalendarExportService` already reads `action_items.assignee_label` directly (`src/main/calendar/CalendarExportService.ts:33`) — satisfied automatically once that column is mutated in the same transaction as the artifact rewrite; no export-time resolution code needed |
| SPKR-05 | Speaker labels scoped per meeting — rename in one meeting never affects another | Every UPDATE/SELECT in the propagation path MUST include `WHERE meeting_id = ?`; `speaker_aliases` primary key is `(meeting_id, original_label)` — see Common Pitfalls #6 |
</phase_requirements>

## Standard Stack

### Core
No new libraries required. This phase is implemented entirely with packages already in `package.json`.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | ^3.25.76 (installed) | Validate the `rename-speakers` IPC payload (`meetingId`, `mapping: Record<string,string>`) | Matches existing `ipcMain.handle` pattern (`confirm-artifact`, `edit-artifact`, `set-meeting-title`) |
| `better-sqlite3-multiple-ciphers` | 12.11.1 (installed) | New `speaker_aliases` table, upsert via native SQLite `ON CONFLICT ... DO UPDATE` | Already the project's only DB layer; SQLite version bundled supports UPSERT syntax (SQLite ≥ 3.24, standard since 2018) [CITED: sqlite.org/lang_upsert.html] |
| Native `RegExp` + `String.prototype.replace` | built-in (Node 24 / Electron 42) | Word-boundary-aware substring replacement inside decoded JSON string values | No library needed; `$`-escaping caveat is well documented — see Common Pitfalls #2 [CITED: developer.mozilla.org/.../String/replace] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled deep-walk JSON mutator (~25 lines) | `lodash.clonedeepwith` / a generic tree-walk library | Adds a dependency for a trivial recursive function; project has zero lodash usage today — don't introduce it for this |
| Regex string-replace within decoded values | Regex string-replace over the raw serialized JSON text | **Unsafe** — see Common Pitfalls #1; corrupts JSON if the new display name contains `"`, `\`, or control characters |

**Installation:** None — no new dependencies.

## Package Legitimacy Audit

Not applicable — this phase introduces zero new external packages. All work is done with `zod`, `better-sqlite3-multiple-ciphers`, and native JS/TS already present in `package.json` and verified in prior phases.

## Architecture Patterns

### System Architecture Diagram

```
Renderer (ArtifactReview)                    Main process                              SQLite (encrypted)
──────────────────────────                   ────────────                              ──────────────────

[Rename Speakers] button
        │
        ▼
invoke('get-speaker-roster',{meetingId}) ──▶ ipcMain.handle('get-speaker-roster')
                                                  │
                                                  ├─ SELECT DISTINCT speaker_label       ──▶ transcript_segments
                                                  │  FROM transcript_segments WHERE meeting_id=?
                                                  ├─ per label: representative excerpt   ──▶ transcript_segments
                                                  │  (first segment, length(text) > N)
                                                  └─ current aliases (if any renamed      ──▶ speaker_aliases
                                                     already this session)
        ◀── {label, excerpt, currentName}[] ──────┘

Modal renders rows, user edits names,
stages in local state (no per-field save)
        │
        ▼ (Save)
invoke('rename-speakers',                 ──▶ ipcMain.handle('rename-speakers')
  {meetingId, mapping})                        │
                                                ├─ 1. assert session.getState()==='Complete'
                                                ├─ 2. Zod-validate mapping
                                                ├─ 3. for each (originalLabel, newName):
                                                │      a. read speaker_aliases row for
                                                │         (meetingId, originalLabel)          ──▶ speaker_aliases (read)
                                                │         → effectiveOldName = row?.display_name
                                                │                              ?? originalLabel
                                                │      b. deep-walk regex-replace
                                                │         effectiveOldName → newName across:
                                                │           - artifacts.content_json (4 rows)   ──▶ artifacts (write)
                                                │           - action_items.assignee_label       ──▶ action_items (write)
                                                │           - action_items.citations_json       ──▶ action_items (write)
                                                │           - summary_cards.speaker_contributions_json ──▶ summary_cards (write)
                                                │           - epoch_summaries.speaker_attributions_json ──▶ epoch_summaries (write)
                                                │           (dict-keyed tables: rename KEY + replace substrings in value)
                                                │      c. UPSERT speaker_aliases              ──▶ speaker_aliases (write)
                                                │         (meeting_id, originalLabel, newName)
                                                │    — all in a single db.transaction()
                                                ├─ 4. re-read artifacts via
                                                │      ArtifactStore.getArtifacts(meetingId)   ──▶ artifacts (read)
                                                │      → reconstruct MeetingArtifacts shape
        ◀── updated MeetingArtifacts ───────────┘
        │
        ▼
setArtifacts(updated)  (local React state — no other reload path exists)
        │
        ▼
MOM / Summary / KeyPoints / ActionItems / CitationPanel
re-render with new names already baked in

Later: Export to Calendar (.ics)  ──▶ invoke('export-ics') ──▶ CalendarExportService
                                        reads action_items.assignee_label directly
                                        (already mutated — SPKR-03 satisfied for free)
```

### Recommended Project Structure
```
src/main/
├── store/
│   ├── db.ts                    # add speaker_aliases DDL to ALL_DDLS
│   ├── ArtifactStore.ts         # add renamePropagation methods (or delegate to a helper module)
│   ├── SpeakerAliasStore.ts     # NEW — get/upsert/list aliases for a meeting
│   └── speakerRename.ts         # NEW — pure functions: escapeRegExp, buildWordBoundaryRegex,
│                                #        escapeReplacement, renameInValue, renameKeyAndValue
├── transcript/
│   └── TranscriptStore.ts       # add getDistinctSpeakerLabels(), getRepresentativeExcerpt()
└── index.ts                     # new ipcMain.handle('get-speaker-roster' / 'rename-speakers')

src/preload/index.ts              # add 'get-speaker-roster', 'rename-speakers' to INVOKE_CHANNELS

src/renderer/src/components/
└── RenameSpeakersModal.tsx       # NEW — modeled on ArtifactItem.tsx's isEditing/Save/Cancel pattern
```

### Pattern 1: Deep-walk JSON string-value replace (never raw-text regex)
**What:** Parse the JSON, recursively replace matched substrings only inside decoded string leaf values, then re-serialize.
**When to use:** Any propagation into `content_json`, `citations_json`, or any other TEXT column storing JSON.
**Example:**
```typescript
// Source: derived from MDN String.prototype.replace() docs (dollar-sign escaping)
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildWordBoundaryRegex(label: string): RegExp {
  return new RegExp(`\\b${escapeRegExp(label)}\\b`, 'g')
}

// $ has special meaning in the *replacement* string of String.replace
// (e.g. "$&", "$1", "$$"). A user-entered display name containing a
// literal "$" must be escaped or it corrupts unrelated matches.
function escapeReplacement(s: string): string {
  return s.replace(/\$/g, '$$$$')
}

function renameInValue(value: unknown, regex: RegExp, safeReplacement: string): unknown {
  if (typeof value === 'string') return value.replace(regex, safeReplacement)
  if (Array.isArray(value)) return value.map((v) => renameInValue(v, regex, safeReplacement))
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = renameInValue(v, regex, safeReplacement)
    }
    return out
  }
  return value
}

// Safe entry point: parse -> walk -> stringify. JSON.stringify handles all
// necessary escaping of quotes/backslashes in the new name automatically —
// a raw regex.replace() on the *serialized* JSON string would NOT.
export function renameInContentJson(rawJson: string, fromLabel: string, toName: string): string {
  const parsed = JSON.parse(rawJson)
  const regex = buildWordBoundaryRegex(fromLabel)
  const mutated = renameInValue(parsed, regex, escapeReplacement(toName))
  return JSON.stringify(mutated)
}
```

### Pattern 2: Dict-keyed propagation (summary_cards / epoch_summaries)
**What:** `speaker_contributions_json` / `speaker_attributions_json` are `Record<speakerLabel, string>` — the label is an exact-match object KEY, not a substring inside prose. Key rename is exact string equality, not regex; values still get the same substring pass in case the contribution text itself mentions the label.
**Example:**
```typescript
export function renameKeyedContributions(rawJson: string, fromLabel: string, toName: string): string {
  const parsed = JSON.parse(rawJson) as Record<string, string>
  const regex = buildWordBoundaryRegex(fromLabel)
  const safeReplacement = escapeReplacement(toName)
  const out: Record<string, string> = {}
  for (const [key, val] of Object.entries(parsed)) {
    const newKey = key === fromLabel ? toName : key
    out[newKey] = typeof val === 'string' ? val.replace(regex, safeReplacement) : val
  }
  return JSON.stringify(out)
}
```

### Pattern 3: Idempotent re-rename via `speaker_aliases` lookup
**What:** Always compute the "from" string as the *currently effective* name, not the raw `transcript_segments.speaker_label`, so a second rename in the same Complete-state session actually finds a match.
**Example:**
```typescript
// Source: project pattern — mirrors set-meeting-title's Zod-validate-then-store-write shape
const tx = db.transaction((meetingId: string, mapping: Record<string, string>) => {
  const getAlias = db.prepare(
    'SELECT display_name FROM speaker_aliases WHERE meeting_id = ? AND original_label = ?'
  )
  const upsertAlias = db.prepare(`
    INSERT INTO speaker_aliases (meeting_id, original_label, display_name, updated_at)
    VALUES (@meeting_id, @original_label, @display_name, @updated_at)
    ON CONFLICT(meeting_id, original_label) DO UPDATE
      SET display_name = excluded.display_name, updated_at = excluded.updated_at
  `)

  for (const [originalLabel, newName] of Object.entries(mapping)) {
    const existing = getAlias.get(meetingId, originalLabel) as { display_name: string } | undefined
    const fromName = existing?.display_name ?? originalLabel
    if (fromName === newName) continue // no-op, skip write

    // ... run renameInContentJson / renameKeyedContributions across all
    //     target rows scoped to this meetingId, using fromName -> newName ...

    upsertAlias.run({
      meeting_id: meetingId,
      original_label: originalLabel,
      display_name: newName,
      updated_at: Date.now(),
    })
  }
})
```

### Anti-Patterns to Avoid
- **Raw regex over serialized JSON text:** Corrupts JSON when the new display name contains `"`, `\`, or a literal newline. Always parse → walk decoded strings → re-stringify.
- **Building the "from" pattern from `transcript_segments.speaker_label` unconditionally:** Breaks re-renaming within the same session (the label was already replaced by a prior save). Look up `speaker_aliases` first.
- **Client-side (renderer) string replacement of local artifact state:** Duplicates the regex/escaping logic in two places and risks drift between what's persisted and what's displayed. Do all mutation in main, return the authoritative updated payload, and have the renderer simply replace its state with the response.
- **Skipping `WHERE meeting_id = ?` on any propagation query:** The single highest-risk mistake for SPKR-05 (cross-meeting leakage). Every SELECT/UPDATE touching `artifacts`, `action_items`, `summary_cards`, `epoch_summaries`, `speaker_aliases` must be scoped.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Manually escaping quotes/backslashes when splicing a new name into a JSON string | A custom JSON-string-escape function | `JSON.parse` → mutate decoded value → `JSON.stringify` | Native serialization handles all edge cases (quotes, backslashes, unicode, control chars) that a hand-rolled escaper would get wrong |
| Detecting whether a rename is a "no-op" | String-equality checks scattered across each propagation site | One check (`fromName === newName`) before the deep-walk, in the transaction loop | Single source of truth; avoids wasted writes and avoids `$`-escaping being applied to an unchanged value |
| Cross-meeting scoping enforcement | Ad hoc `if (row.meeting_id === meetingId)` filtering in application code after a broad SELECT | Parameterized `WHERE meeting_id = ?` in every prepared statement | SQL-level scoping is the only way to guarantee SPKR-05 — filtering in JS after the fact is a latent bug waiting to happen if a filter is forgotten in one call site |

**Key insight:** This phase's complexity is not "need a library" — it's "need every one of ~6 propagation sites to use the exact same parse-walk-restringify function, scoped by meeting_id, sourced from the same idempotent from-name lookup." The risk is inconsistency across call sites, not missing tooling.

## Common Pitfalls

### Pitfall 1: Raw string regex over serialized JSON corrupts the record
**What goes wrong:** Applying `contentJsonString.replace(/\bSpeaker 1\b/g, newName)` directly on the TEXT column value (before `JSON.parse`) will inject unescaped `"` or `\` characters into the JSON if `newName` contains them (e.g. a display name like `Jane "JJ" Doe`), producing a stored value that fails `JSON.parse` on next read.
**Why it happens:** It looks like the simplest possible implementation — "it's just a string, just replace it" — until the replacement value itself needs JSON-escaping.
**How to avoid:** Always `JSON.parse` first, replace inside decoded string values, `JSON.stringify` last (Pattern 1 above).
**Warning signs:** Any code path that calls `.replace()` directly on a `content_json`/`citations_json` column value without an intervening `JSON.parse`.

### Pitfall 2: `$` in the replacement string is interpreted by `String.replace`
**What goes wrong:** `String.prototype.replace(regex, newName)` treats `$&`, `$1`, `` $` ``, `$'`, `$$` in `newName` as special replacement patterns. A display name containing a literal `$` (e.g. "Sam $$ Lee") silently produces wrong output.
**Why it happens:** Not widely known; only surfaces with specific user input.
**How to avoid:** Escape all `$` in the replacement string to `$$` before passing it to `.replace()` (see `escapeReplacement` in Pattern 1). [CITED: developer.mozilla.org — String.prototype.replace()]
**Warning signs:** Any `.replace(regex, someUserProvidedString)` call without a preceding `.replace(/\$/g, '$$$$')` on that string.

### Pitfall 3: Re-renaming a speaker within the same session is a silent no-op
**What goes wrong:** If the propagation always computes the "from" pattern as `transcript_segments.speaker_label` (e.g. always "Speaker 1"), a second rename ("Jane" → "Jane Doe") finds no matches, because the content already says "Jane" — the original "Speaker 1" string no longer exists anywhere in the artifacts.
**Why it happens:** CONTEXT.md's D-05 describes the mechanism in terms of the raw `speaker_label` token; it's easy to miss that repeat edits change what the "current" token actually is.
**How to avoid:** Before building the regex, look up the current `display_name` from `speaker_aliases` for `(meeting_id, original_label)`; fall back to `original_label` only if no alias row exists yet (Pattern 3).
**Warning signs:** QA test case "rename a speaker twice in the same modal session" — if the second rename doesn't take effect, this is the cause.

### Pitfall 4: "You" is a common English word — false positives are possible but low-risk and accepted
**What goes wrong:** A word-boundary match on the literal capitalized token "You" could, in rare cases, coincidentally match a sentence-initial pronoun in generated prose unrelated to speaker attribution (e.g. an LLM producing "You" at the start of a sentence for stylistic reasons).
**Why it happens:** "You" is both the mic-channel speaker label (D-08) and an extremely common English word.
**How to avoid:** This is a locked design decision (D-08 includes "You" in the uniform rename mechanism) — not something to redesign in this phase. Mitigate risk by noting that Stage 2 prompts (`ArtifactPipeline.ts`) explicitly instruct the LLM to use the literal label "You" for attribution and never address the reader in second person, so almost all capitalized "You" occurrences in generated content are genuine attribution uses. Treat any residual false-positive risk as an accepted, documented limitation — do not attempt heuristic disambiguation (adds complexity disproportionate to the risk).
**Warning signs:** A UAT reviewer spotting an unexpected "You"-substitution inside MOM prose that wasn't originally an attribution.

### Pitfall 5: Duplicated data must be updated together or it drifts
**What goes wrong:** `assignee_label` and the action-item citation array exist in **two places each**: (a) inside `artifacts.content_json` for the `action_items` artifact row (the full `ActionItemList` shape, written once by `ArtifactStore.saveArtifacts`), and (b) as the `action_items.assignee_label` column and `action_items.citations_json` column (written by the same method, from the same source data). If a rename only updates one of the two locations, the renderer (which reads from the IPC-pushed/returned `content_json`-derived shape) and the exporter (`CalendarExportService`, which reads the `action_items` table columns directly) will disagree.
**Why it happens:** The schema has this duplication by design (row-level query performance for `getConfirmedActionItems`/export vs. a single JSON blob for full-artifact display) — it predates this phase and isn't something to refactor here.
**How to avoid:** Run the deep-walk replace against all four locations in the same `db.transaction()`: the `artifacts` row where `artifact_type='action_items'`, `action_items.assignee_label`, and `action_items.citations_json`. All three, every rename, every time.
**Warning signs:** A test that renames a speaker, exports `.ics`, and compares the exported description string against the on-screen action item text — a mismatch means one of the three locations was missed.

### Pitfall 6: No DB-reload path exists — the IPC response is the only way back to the UI
**What goes wrong:** Persisting the rename to SQLite and returning `{ ok: true }` (like `set-meeting-title` does) leaves the renderer's in-memory `artifacts` state stale — there is no "refetch artifacts" call anywhere in the app today (`ArtifactStore.getArtifacts()` is currently dead code), so the UI would keep showing the old label until the user restarts the app.
**Why it happens:** Every other mutation in this codebase (`confirm-artifact`, `dismiss-artifact`) is reflected via renderer-side local `Set` state changes that don't require re-reading persisted content — rename is the first mutation that changes content the renderer already displayed verbatim.
**How to avoid:** Have `rename-speakers` reconstruct and return the full updated `MeetingArtifacts` shape (using `ArtifactStore.getArtifacts()` — finally giving that method a caller), and have `ArtifactReview` replace its local artifacts state from the response.
**Warning signs:** After a rename, MOM/summary/key points still show the old label until "Start New Meeting" — the plan must include the response-payload step, not just the persistence step.

### Pitfall 7: `speaker_aliases` has no current UI consumer — don't over-scope this phase
**What goes wrong:** CONTEXT.md's Claude's-Discretion note raises "whether the speaker_aliases table is also consulted for the transcript view within ArtifactReview" — but no such transcript view exists in the shipped v2.0 codebase (`transcript-segment` IPC event is pushed by `CaptureService` and allowlisted in preload, but nothing in `App.tsx` subscribes to it or renders it).
**Why it happens:** It's easy to assume a "transcript view" exists because the plumbing (event, allowlist) is there, when in fact it's unused.
**How to avoid:** Scope this phase to: (1) create + populate `speaker_aliases` per the locked project decision, (2) do NOT build a transcript viewer or wire a join into a nonexistent UI. This table is forward-looking infrastructure for a future phase/feature, not something this phase needs to render against.
**Warning signs:** Scope creep — a task appearing in the plan like "add read-time alias resolution to the transcript panel" when no transcript panel exists to modify.

## Code Examples

### New DDL (append to `ALL_DDLS` in `src/main/store/db.ts`)
```sql
-- Source: pattern matches existing CREATE TABLE IF NOT EXISTS style in db.ts;
-- composite PK matches CONTEXT.md's locked spec (meeting_id, original_label)
CREATE TABLE IF NOT EXISTS speaker_aliases (
  meeting_id      TEXT NOT NULL
    REFERENCES meetings(id) ON DELETE CASCADE,
  original_label  TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (meeting_id, original_label)
);
```
No `runMigrations()` entry is needed for this — `CREATE TABLE IF NOT EXISTS` is naturally idempotent across app restarts, unlike the `ALTER TABLE ADD COLUMN` cases already in `runMigrations()`.

### Roster query (new method on `TranscriptStore`)
```typescript
// Source: project pattern — mirrors getSegmentsByMeeting's prepared-statement style
getDistinctSpeakerLabels(meetingId: string): string[] {
  const rows = this.db.prepare(
    'SELECT DISTINCT speaker_label FROM transcript_segments WHERE meeting_id = ? ORDER BY speaker_label ASC'
  ).all(meetingId) as Array<{ speaker_label: string }>
  return rows.map((r) => r.speaker_label)
}

getRepresentativeExcerpt(meetingId: string, label: string): string | null {
  // Prefer a substantial line; fall back to the first segment for that
  // label if nothing clears the length threshold (e.g. speaker only said
  // short filler words the whole meeting).
  const substantial = this.db.prepare(
    `SELECT text FROM transcript_segments
     WHERE meeting_id = ? AND speaker_label = ? AND length(text) > 15
     ORDER BY timestamp_start ASC LIMIT 1`
  ).get(meetingId, label) as { text: string } | undefined
  if (substantial) return substantial.text

  const any = this.db.prepare(
    `SELECT text FROM transcript_segments
     WHERE meeting_id = ? AND speaker_label = ?
     ORDER BY timestamp_start ASC LIMIT 1`
  ).get(meetingId, label) as { text: string } | undefined
  return any?.text ?? null
}
```

### IPC handler skeleton
```typescript
// Source: project pattern — mirrors edit-artifact / set-meeting-title Zod-validate-then-store shape
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
  return reconstructMeetingArtifacts(result.data.meetingId, rows) // JSON.parse each row by artifact_type
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| N/A — greenfield within this codebase | N/A | — | This phase adds new behavior to an existing v2.0 codebase rather than replacing an old pattern; no deprecations apply |

**Deprecated/outdated:** None applicable.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A display-name length cap of 100 chars is reasonable (mirrors `set-meeting-title`'s pattern but that uses 200) | Code Examples — IPC handler skeleton | Low — cosmetic; planner/user can pick either bound, doesn't affect correctness |
| A2 | `summary_cards`/`epoch_summaries` propagation, while flagged in CONTEXT.md's code_context, is not required to satisfy any of SPKR-01/02/03/05's observable success criteria (no current UI renders those tables post-Complete) — included anyway for DB consistency and to avoid latent drift ahead of Phase 14 | Architecture Patterns, Pitfall 7 | Low — if the planner decides to descope this, no currently-visible behavior breaks; only future-phase consistency is affected |
| A3 | The false-positive risk of matching generic "You" in generated prose is negligible in practice given Stage 2's system prompts (ArtifactPipeline.ts) explicitly instruct third-person, quote-grounded writing | Common Pitfalls #4 | Medium if wrong — could produce a visibly wrong rename in MOM text; mitigation is UAT review, not code, since D-08 is locked |

## Open Questions

1. **Should `speaker_aliases` populate proactively for all detected labels at meeting-end (before any rename), or lazily only on first rename?**
   - What we know: The table's only defined write path per D-05/D-06 is "on save" of a rename.
   - What's unclear: Whether a label with no rename should ever get a row (e.g. `display_name = original_label` as a no-op identity row), which would make future read-time joins simpler (`COALESCE(alias.display_name, transcript_segments.speaker_label)` always has a row to join against vs. sometimes needing the fallback).
   - Recommendation: Do not pre-populate. Only write a `speaker_aliases` row when a rename actually happens (skip no-op renames per Pattern 3's `fromName === newName` check) — keeps the table minimal and matches "on save" language in D-05.

2. **Exact max length / character policy for display names?**
   - What we know: `set-meeting-title` caps at 200 chars with a simple `.trim().min(1).max(200)`.
   - What's unclear: No explicit requirement states a cap for speaker display names.
   - Recommendation: Use `.trim().min(1).max(100)` (a name is shorter than a meeting title) — Claude's Discretion per CONTEXT.md, non-blocking either way.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^2.0.0 |
| Config file | `vitest.config.ts` — `include: ['tests/**/*.test.ts', 'src/main/**/*.test.ts']`, `exclude: ['src/renderer/**', 'node_modules/**']` |
| Quick run command | `npx vitest run src/main/store` (or the specific new test file path) |
| Full suite command | `npm test` (== `vitest run`) |

Note: renderer/React components have **zero automated test coverage** in this project's convention (explicitly excluded in `vitest.config.ts`) — the `RenameSpeakersModal.tsx` UI itself is validated by manual UAT, not Vitest. All automated coverage for this phase belongs in `src/main/**`.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SPKR-01 | `get-speaker-roster`/`rename-speakers` handlers accept valid payload, reject when session state != Complete | unit | `npx vitest run src/main/store/__tests__/SpeakerAliasStore.test.ts` | ❌ Wave 0 |
| SPKR-02 | `renameInContentJson` correctly replaces word-boundary matches without corrupting JSON (incl. `"`/`\`/`$` in new name) | unit | `npx vitest run src/main/store/__tests__/speakerRename.test.ts` | ❌ Wave 0 |
| SPKR-02 | Re-renaming the same speaker twice in one session propagates from the *current* effective name | unit | `npx vitest run src/main/store/__tests__/SpeakerAliasStore.test.ts` | ❌ Wave 0 |
| SPKR-03 | `action_items.assignee_label` mutated in the same transaction as `content_json` (exported `.ics` description matches renamed label) | unit/integration | `npx vitest run src/main/calendar/__tests__/CalendarExportService.test.ts` | ❌ Wave 0 (no existing test file for `CalendarExportService`) |
| SPKR-05 | Renaming in meeting A leaves meeting B's rows untouched | unit | `npx vitest run src/main/store/__tests__/SpeakerAliasStore.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the specific new test file for that task (`npx vitest run <file>`)
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/main/store/__tests__/speakerRename.test.ts` — pure-function tests for `renameInContentJson`, `renameKeyedContributions`, `escapeReplacement`, word-boundary edge cases (`"Speaker 1"` inside prose vs. as a citation field vs. a name containing `$`/`"`)
- [ ] `src/main/store/__tests__/SpeakerAliasStore.test.ts` — DDL creation, upsert-on-conflict, per-meeting scoping, idempotent re-rename lookup
- [ ] `src/main/calendar/__tests__/CalendarExportService.test.ts` — no existing test file for this service at all; a rename-propagation test would be the first coverage here (broader gap, not phase-specific, but this phase is the first to need it)
- [ ] Framework install: none — Vitest already configured and used by 5 existing `src/main/context/__tests__/*.test.ts` files as a direct pattern reference

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | Local single-user desktop app; no auth surface touched by this phase |
| V3 Session Management | Yes (narrow) | Reuse `SessionManager` FSM — gate `rename-speakers`/`get-speaker-roster` on `getState() === 'Complete'` server-side, matching the existing consent-gate-enforced-in-main-process convention |
| V4 Access Control | Yes | Every propagation query scoped by `WHERE meeting_id = ?` (parameterized) — this IS the SPKR-05 requirement; no cross-meeting query should ever omit this scope |
| V5 Input Validation | Yes | `zod` schema on the `rename-speakers` payload: `mapping: z.record(z.string(), z.string().trim().min(1).max(100))`; reject empty/whitespace-only names |
| V6 Cryptography | No | No new cryptographic surface; existing SQLCipher-at-rest encryption already covers the new `speaker_aliases` table since it lives in the same encrypted DB file |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| SQL injection via unparameterized rename mapping keys/values | Tampering | `better-sqlite3` prepared statements with bound parameters (`?`/`@named`) exclusively — never string-concatenate `originalLabel`/`newName` into SQL text |
| Regex denial-of-service (ReDoS) via a pathological display name used as a *pattern* | Denial of Service | Not applicable here — the user-entered `newName` is only ever used as a **replacement** string (never compiled into a `RegExp`); only the fixed, small, enum-bounded `speaker_label`/alias values ("You", "Speaker 1".."Speaker 8", or a previously-set alias) are ever compiled into a `RegExp`, and `escapeRegExp` neutralizes any special characters before compilation |
| JSON injection / stored-XSS-adjacent corruption via unescaped quotes in a user-provided name | Tampering | Never regex-replace on raw serialized JSON text; always `JSON.parse` → mutate → `JSON.stringify` (Pitfall 1) |
| Cross-meeting data leakage (renaming meeting A's "Speaker 1" affects meeting B) | Information Disclosure | Every read/write scoped by `meeting_id` (primary key of `speaker_aliases` is `(meeting_id, original_label)`; every UPDATE has `WHERE meeting_id = ?`) |

## Sources

### Primary (HIGH confidence)
- Direct codebase reads: `src/main/store/db.ts`, `src/main/store/ArtifactStore.ts`, `src/main/transcript/TranscriptStore.ts`, `src/main/capture/SpeakerNormalizer.ts`, `src/main/pipeline/ArtifactPipeline.ts`, `src/main/calendar/CalendarExportService.ts`, `src/main/session/SessionManager.ts`, `src/main/store/SummaryCardStore.ts`, `src/main/context/EpochCompressor.ts`, `src/shared/schemas/index.ts`, `src/preload/index.ts`, `src/renderer/src/App.tsx`, `src/renderer/src/components/{ArtifactItem,ArtifactReview,CitationPanel}.tsx`, `package.json`, `vitest.config.ts` — verified via `grep`/`Read`, not assumed.

### Secondary (MEDIUM confidence)
- [String.prototype.replace() — MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace) — confirms `$$` escaping behavior for replacement strings.
- [SQLite UPSERT — sqlite.org](https://sqlite.org/lang_upsert.html) — confirms `ON CONFLICT ... DO UPDATE SET ... excluded.` syntax used in the upsert example.

### Tertiary (LOW confidence)
- None — this phase required no speculative/unverified claims beyond the two assumptions logged above.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all verified directly against installed `package.json` versions
- Architecture: HIGH — every claim about existing data flow (no reload path, no transcript UI, dual-write duplication) was verified by reading the actual source files, not inferred
- Pitfalls: HIGH — JSON-corruption and `$`-escaping risks are confirmed via MDN; idempotent-rename and no-reload-path risks are confirmed by direct code inspection

**Research date:** 2026-07-02
**Valid until:** Stable — no external dependency drift risk since no new packages are introduced; re-validate only if `ArtifactPipeline.ts`'s content_json shapes or `db.ts`'s DDL change before this phase is planned/executed.
