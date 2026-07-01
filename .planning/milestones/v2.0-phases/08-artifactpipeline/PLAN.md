# PLAN.md — Phase 8: ArtifactPipeline

## Goal

At meeting end, the system reads all `transcript_segments` for the meeting from the encrypted
SQLCipher database, runs a two-stage LLM batch extraction (Stage 1: verbatim quote anchors via
a single Gemini 2.5 Flash call; Stage 2: four parallel calls producing MOM, summary, key points,
and action items constrained exclusively to Stage 1 quotes), validates every extracted item
through `CitationValidator` (Jaccard word-token similarity ≥ 0.90 with up to 2 retries per item),
persists all passing items as `status: 'proposed'` in the `artifacts` and `action_items` tables,
pushes an `artifact-proposals-ready` IPC event to the renderer, then transitions the FSM to
`Complete`. The `ArtifactReview` panel renders in the overlay and lets the user confirm, edit, or
dismiss each item. Confirmed action items export as a `.ics` file via a native save dialog. Phase
8 is done when: a 30-minute test transcript produces `MeetingArtifactsSchema`-validated output in
under 120 seconds; all DB rows have `status: 'proposed'`; `CitationValidator` rejects a synthetic
fabricated citation in a unit test; a confirmed action item updates to `'confirmed'` in the DB and
appears in the exported `.ics` file.

---

## Requirements Covered

ART-01, ART-02, ART-03, ART-04, ART-05, ART-06, ART-07, ART-08, ART-09, ART-10, ART-11

---

## Threat Model

| Threat | Category | Mitigation |
|--------|----------|-----------|
| LLM prompt injection via meeting transcript | Tampering | Transcript content goes in the `user` message only; system prompt contains instructions only (per RESEARCH.md Q4 design principle 1). Stage 2 receives only extracted JSON anchors, not raw transcript. |
| Fabricated artifact items reaching `'confirmed'` status without user action | Spoofing | `proposed-with-confirm` contract is enforced in IPC handlers: only `confirm-artifact` IPC can advance status; pipeline always writes `'proposed'`. |
| Gemini API key exposure in logs or renderer | Information Disclosure | `GEMINI_API_KEY` is loaded from `.env` in the main process only; never forwarded to renderer; never logged. |
| Unvalidated LLM JSON written to DB | Tampering | Every Stage 2 response is parsed through Zod schemas before any DB write; Zod parse errors trigger per-item retry, not silent acceptance (ART-11). |
| Transcript data sent to Gemini free tier | Information Disclosure | `GEMINI_API_KEY` must be a paid-plan key; free tier is architecturally disqualified (DEC-02 / RSCH-03). The pipeline has no enforcement gate for this in Phase 8 — deferred to Phase 9 settings validator. Developer must supply a paid key in `.env`. |
| `.ics` file path traversal | Elevation of Privilege | `dialog.showSaveDialog` controls the write path; `IcsExporter` does not accept an arbitrary file path from the renderer — the renderer only receives the final saved path back. |

---

## Dependencies and Decisions

All decisions are from `08-CONTEXT.md`. Referenced throughout tasks as D-01 through D-13.

**Directory layout** (from 05-ARCHITECTURE.md — these paths are authoritative):
- `src/main/pipeline/` — `ArtifactPipeline.ts`, `CitationValidator.ts`
- `src/main/llm/` — `LLMAdapter.ts`
- `src/main/store/` — `ArtifactStore.ts`
- `src/main/calendar/` — `CalendarExportService.ts` (architecture calls this `IcsExporter` functionally)
- `src/renderer/src/components/` — `ArtifactReview.tsx`, `ArtifactItem.tsx`, `CitationPanel.tsx`
- `src/shared/schemas/index.ts` — all Zod schemas
- `eval/corpus/` — eval fixture JSON files

---

## Tasks

---

### Task 1: Install Phase 8 npm dependencies

**File:** `package.json` (modified by npm install; no manual edit)

**Action:** install

**What:**

Run the following install commands from the project root. Check `package.json` first to confirm
each package is not already present before installing.

```
npm install openai@^4.77.0 zod@^3.23.8 zod-to-json-schema@^3.23.5 tiktoken@^1.0.18 ics@^3.8.1
```

Notes:
- Do NOT install `uuid` — use `crypto.randomUUID()` (built into Node 24 / Electron 42).
- Do NOT install Zod v4 — the project uses Zod v3 + `zod-to-json-schema`. Combining Zod v4 with
  `zod-to-json-schema` produces silently malformed schemas (RESEARCH.md Q1).
- `openai@^4.77.0` is required for `zodResponseFormat` helper and `client.beta.chat.completions.parse`.
- After install, verify `package.json` `dependencies` section contains all five packages.

**Verify:**
Run `node -e "require('openai'); require('zod'); require('zod-to-json-schema'); require('tiktoken'); require('ics'); console.log('OK')"` from the project root. Output must be `OK` with no errors.

---

### Task 2: Implement full Zod schemas in `src/shared/schemas/index.ts`

**File:** `src/shared/schemas/index.ts`

**Action:** modify (replace stub)

**What:**

Replace the current stub (one line re-exporting `SessionState`) with the full Zod schema
definitions for all Phase 8 types. Keep the existing `SessionState` type re-export. Add all of
the following schemas (per D-13 and 04-AI-SPEC.md §1.3):

**`TranscriptSegmentSchema`** — mirrors the `transcript_segments` DB row as received by the
pipeline:
- `id`: `z.string()`
- `meeting_id`: `z.string()`
- `speaker_label`: `z.string()`
- `channel`: `z.enum(['mic', 'system'])`
- `timestamp_start`: `z.number()`
- `timestamp_end`: `z.number()`
- `text`: `z.string()`
- `confidence`: `z.number().nullable().optional()`

**`QuoteAnchorSchema`** — the Stage 1 LLM output atom (CitationAnchor from AI-SPEC §1.3):
- `quote_preview`: `z.string()` — first 8-12 words of the verbatim passage
- `quote_full`: `z.string()` — complete verbatim quote
- `speaker_label`: `z.string()`
- `timestamp_start`: `z.number().nullable()`
- `timestamp_end`: `z.number().nullable()`
- `confidence`: `z.enum(['direct', 'inferred'])`
- `artifact_hint`: `z.enum(['action_item', 'decision', 'date', 'key_point'])`

**`QuoteAnchorListSchema`** — `z.object({ anchors: z.array(QuoteAnchorSchema) })`

**`MoMSchema`** — Stage 2a output:
- `markdown_content`: `z.string()` — full MOM in markdown format

**`SummarySchema`** — Stage 2b output:
- `summary_text`: `z.string()` — 2-3 sentence summary, no markdown

**`KeyPointSchema`** — single key point:
- `text`: `z.string()`
- `speaker_label`: `z.string().nullable()`
- `source_quote_preview`: `z.string()`
- `confidence`: `z.enum(['direct', 'inferred'])`

**`KeyPointListSchema`** — `z.object({ key_points: z.array(KeyPointSchema) })`

**`CitationRefSchema`** — a citation as embedded inside Stage 2 artifact items. Deliberately omits `artifact_hint` (a Stage 1 annotation not regenerated by Stage 2 prompts; including it causes Zod parse failures on every action item):
- `quote_preview`: `z.string()`
- `quote_full`: `z.string()`
- `speaker_label`: `z.string()`
- `timestamp_start`: `z.number().nullable()`
- `timestamp_end`: `z.number().nullable()`
- `confidence`: `z.enum(['direct', 'inferred'])`

**`ActionItemSchema`** — single action item (this is the highest-trust artifact):
- `id`: `z.string()` — UUID v4
- `description`: `z.string()`
- `assignee_label`: `z.string().nullable()`
- `due_date`: `z.string().nullable()` — ISO 8601 or null
- `raw_deadline_text`: `z.string().nullable()` — raw expression when due_date is null
- `status`: `z.literal('proposed')` — always `'proposed'` from the LLM
- `citations`: `z.array(CitationRefSchema).min(1)` — use `CitationRefSchema`, NOT `QuoteAnchorSchema` (no `artifact_hint` field here)

**`ActionItemListSchema`** — `z.object({ action_items: z.array(ActionItemSchema) })`

**`MeetingArtifactsSchema`** — top-level pipeline output:
- `meetingId`: `z.string()`
- `mom`: `MoMSchema`
- `summary`: `SummarySchema`
- `keyPoints`: `KeyPointListSchema`
- `actionItems`: `ActionItemListSchema`
- `error`: `z.boolean().optional()`
- `errorMessage`: `z.string().optional()`

Export all schemas by name. Also export inferred TypeScript types using `z.infer<>` for each
schema (e.g., `export type QuoteAnchor = z.infer<typeof QuoteAnchorSchema>`).

Keep the existing `export type { SessionState } from '../../main/session/SessionManager'` line.

**Verify:**
Run `npx tsc --noEmit` from the project root. Must complete with zero errors. Also confirm the
file exports `MeetingArtifactsSchema` by running:
`node -e "const {MeetingArtifactsSchema}=require('./src/shared/schemas/index.ts'); console.log(typeof MeetingArtifactsSchema)"` — or verify via the TypeScript build that no import errors exist in any file that imports from `../../shared/schemas`.

---

### Task 3: Implement `CitationValidator.ts`

**File:** `src/main/pipeline/CitationValidator.ts` (new file, new directory)

**Action:** create

**What:**

Create the `src/main/pipeline/` directory. Create `CitationValidator.ts` implementing pure
TypeScript Jaccard word-token similarity (per D-09).

The module exports a single class `CitationValidator` with these methods:

**`tokenize(text: string): Set<string>`**
Split on non-word characters: `text.toLowerCase().split(/\W+/).filter(Boolean)`. Return as a `Set<string>`.

**`score(claimText: string, quoteText: string): number`**
Compute Jaccard similarity:
```
tokens_a = tokenize(claimText)
tokens_b = tokenize(quoteText)
intersection = tokens in both sets
union = all tokens from both sets
return intersection.size / union.size
```
If both sets are empty, return 1.0 (both empty = trivially matching).
If one set is empty and the other is not, return 0.0.

**`validate(claimText: string, citations: Array<{ quote_full: string }>): boolean`**
Returns `true` if at least one citation's `quote_full` produces a Jaccard score ≥ 0.90 against `claimText`. Returns `false` if no citation meets the threshold.

**`THRESHOLD: number`** — class constant = `0.90`

No external library imports. Only TypeScript standard Set operations.

**Verify:**
The unit test in Task 14 covers this. Manually confirm: `new CitationValidator().score('the cat sat on the mat', 'the cat sat on the mat')` returns `1.0` and `new CitationValidator().score('alice will handle deployment', 'bob confirmed the release date')` returns a value below `0.90`.

---

### Task 4: Implement `LLMAdapter.ts`

**File:** `src/main/llm/LLMAdapter.ts` (new file in existing directory `src/main/llm/`)

**Action:** create

**What:**

Create `src/main/llm/` directory if it does not exist. Implement `LLMAdapter.ts` wrapping the
`openai` SDK pointed at Gemini 2.5 Flash (per D-05, D-06).

**Constructor:**
```typescript
constructor(apiKey: string, baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai')
```
Instantiate `OpenAI` client with the provided `apiKey` and `baseURL`.

**`generate<T>(schema: z.ZodSchema<T>, schemaName: string, systemPrompt: string, userContent: string): Promise<T>`**

Implementation:
1. Call `client.beta.chat.completions.parse({ model: 'gemini-2.5-flash', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }], response_format: zodResponseFormat(schema, schemaName) })`.
2. If `completion.choices[0].message.parsed` is not null, return it directly (already Zod-parsed by the SDK).
3. If `.parsed` is null (SDK could not parse), fall back: extract `choices[0].message.content`, call `JSON.parse()` on it, then call `schema.parse(raw)` manually and return the result.
4. If both paths fail, throw an error with the message `LLMAdapter: failed to parse response for schema ${schemaName}`.

**`stream(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): AsyncIterable<string>`**

Implementation: call `client.chat.completions.stream({ model: 'gemini-2.5-flash', messages })` and yield each `chunk.choices[0]?.delta?.content ?? ''`.

Imports needed:
- `import OpenAI from 'openai'`
- `import { zodResponseFormat } from 'openai/helpers/zod'`
- `import { z } from 'zod'`

Do NOT log API keys anywhere in this file.

**Verify:**
`npx tsc --noEmit` must pass. The file must import cleanly from `ArtifactPipeline.ts` (Task 5).

---

### Task 5: Implement `ArtifactStore.ts`

**File:** `src/main/store/ArtifactStore.ts` (new file)

**Action:** create

**What:**

Create `ArtifactStore.ts` in `src/main/store/`. This class owns all DB writes for the `artifacts`
and `action_items` tables and the status lifecycle (per 05-ARCHITECTURE.md §6.6).

**Constructor:** `constructor(private db: Database.Database)`
Import `Database` type from `'better-sqlite3-multiple-ciphers'`.

**`saveArtifacts(meetingId: string, artifacts: z.infer<typeof MeetingArtifactsSchema>): void`**

Inserts rows into `artifacts` and `action_items` tables inside a single `db.transaction()`.

For the `artifacts` table, insert four rows — one per artifact type:
- `mom`: `artifact_type='mom'`, `content_json=JSON.stringify(artifacts.mom)`
- `summary`: `artifact_type='summary'`, `content_json=JSON.stringify(artifacts.summary)`
- `key_points`: `artifact_type='key_points'`, `content_json=JSON.stringify(artifacts.keyPoints)`
- `action_items`: `artifact_type='action_items'`, `content_json=JSON.stringify(artifacts.actionItems)`

For each action item in `artifacts.actionItems.action_items`, insert one row into `action_items`:
- `id`: the action item's `id` field (UUID from LLM)
- `meeting_id`: `meetingId`
- `description`: `item.description`
- `assignee_label`: `item.assignee_label ?? null`
- `due_date`: `item.due_date ?? null`
- `status`: `'proposed'` (hardcoded — never trust the LLM's `status` field)
- `citations_json`: `JSON.stringify(item.citations)`

Generate UUIDs for artifact table rows using `crypto.randomUUID()`.
Set `model_used` to `'gemini-2.5-flash'` on all artifact rows.
All rows must have `status: 'proposed'` — this is enforced here in application code, not
delegated to the LLM output (even though the schema requires it).

**`confirmArtifact(id: string, type: 'action_item' | 'decision' | 'date'): void`**

Updates `action_items` row where `id=? AND status='proposed'` to `status='confirmed'`.
Only handles `type='action_item'` in Phase 8. Log a warning and return for other types.

**`editArtifact(id: string, updates: { description?: string; due_date?: string | null; assignee_label?: string | null }): void`**

Updates `action_items` row where `id=?`. Only updates the fields present in `updates`.
Preserves `status='proposed'` — editing does not auto-confirm.

**`dismissArtifact(id: string): void`**

Updates `action_items` row where `id=? AND status='proposed'` to `status='dismissed'`.

**`getConfirmedActionItems(meetingId: string): Array<{ id: string; description: string; assignee_label: string | null; due_date: string | null; citations_json: string }>`**

Runs `SELECT id, description, assignee_label, due_date, citations_json FROM action_items WHERE meeting_id=? AND status='confirmed'`.

**`getArtifacts(meetingId: string): Array<{ artifact_type: string; content_json: string }>`**

Runs `SELECT artifact_type, content_json FROM artifacts WHERE meeting_id=? ORDER BY created_at ASC`.

**Verify:**
`npx tsc --noEmit` must pass. Import this file from `ArtifactPipeline.ts` (Task 6) to confirm no compile errors.

---

### Task 6: Implement `ArtifactPipeline.ts`

**File:** `src/main/pipeline/ArtifactPipeline.ts` (new file)

**Action:** create

**What:**

This is the central orchestration module. It reads the transcript, runs two-stage LLM extraction,
validates citations, persists to DB, and returns the proposals payload (per D-01 through D-10).

**Imports:**
- `Database` from `'better-sqlite3-multiple-ciphers'`
- `BrowserWindow` from `'electron'`
- `LLMAdapter` from `'../llm/LLMAdapter'`
- `CitationValidator` from `'./CitationValidator'`
- `ArtifactStore` from `'../store/ArtifactStore'`
- `get_encoding` from `'tiktoken'`
- All schemas from `'../../shared/schemas'`

**Constructor:**
```typescript
constructor(
  private db: Database.Database,
  private win: BrowserWindow,
  private meetingId: string
)
```

Instantiate `LLMAdapter` with `process.env.GEMINI_API_KEY ?? ''` inside the constructor.
Instantiate `CitationValidator` inside the constructor.
Instantiate `ArtifactStore` with `db` inside the constructor.

**Private method `loadTranscript(): string`**

Query: `SELECT speaker_label, timestamp_start, timestamp_end, text FROM transcript_segments WHERE meeting_id = ? ORDER BY timestamp_start ASC`.
Format each row as `[{timestamp_start}] {speaker_label}: {text}` (one per line).
Return the full formatted string.

Also: use `get_encoding('cl100k_base')` to count tokens. Log `[ArtifactPipeline] transcript token estimate: N` using `console.log`. If token count > 900000, log a warning `[ArtifactPipeline] WARNING: transcript exceeds 900K token estimate — Stage 1 may fail`. Call `enc.free()` after counting to release the tiktoken WASM memory.

**Private method `runStage1(transcriptText: string): Promise<QuoteAnchor[]>`**

Uses the following system prompt (replace `{{MEETING_DATE}}` with the `started_at` value from the `meetings` table, formatted as ISO 8601 date string, e.g. `2026-06-27`):

```
You are a meeting transcript analyst. Your sole task is to extract verbatim passages from the transcript that could support extractable meeting artifacts: action items, decisions, deadlines, and key discussion points.

ABSOLUTE RULES — READ CAREFULLY:
1. You MUST copy quote text VERBATIM from the transcript. Exact words only.
   - ALLOWED: "I'll own the Q3 planning doc" (copied exactly from transcript)
   - FORBIDDEN: "Speaker 1 will handle Q3 planning" (paraphrase — not allowed)
   - FORBIDDEN: "I'll own the Q3 planning document" (word substitution — not allowed)
2. Do NOT generate, infer, or paraphrase. Only extract.
3. Do NOT include any statement that is not an extractable artifact. Casual small talk, filler phrases, and purely informational statements that commit no one to anything should be omitted.
4. For each quote, record the exact speaker label from the transcript ("You", "Speaker 1", "Speaker 2", etc.).
5. For timestamps: use the start and end seconds from the meeting start that appear in the transcript segment. If timestamps are not present in the transcript, set timestamp_start and timestamp_end to null.
6. For the confidence field:
   - Use "direct" when the quote is an explicit, unambiguous statement (e.g., "I'll do X by Friday").
   - Use "inferred" when the artifact requires interpretation (e.g., "We should probably do X" — implicit soft commitment). When in doubt, use "inferred".
7. Dates: Record the raw date expression exactly as spoken ("next Friday", "by end of month"). Do NOT resolve relative dates — that happens downstream.

Meeting date (ISO 8601): {{MEETING_DATE}}

Output a JSON object with an "anchors" key containing an array of quote anchor objects. Each object MUST have:
- quote_preview: first 8-12 words of the verbatim passage
- quote_full: the complete verbatim passage
- speaker_label: exact label from transcript
- timestamp_start: number (seconds) or null
- timestamp_end: number (seconds) or null
- confidence: "direct" or "inferred"
- artifact_hint: one of ["action_item", "decision", "date", "key_point"] — your best guess at what kind of artifact this quote supports

If no extractable quotes exist in the transcript, output {"anchors": []}.
```

Call `this.llmAdapter.generate(QuoteAnchorListSchema, 'quote_anchors', systemPrompt, transcriptText)`.
Return `result.anchors`.

**Private method `retryPromptPrefix(): string`**

Returns: `"IMPORTANT: Your previous response contained an item that could not be verified against the source quotes. On this retry, be MORE conservative — if you are uncertain whether a claim is fully supported by the provided quotes, omit the item rather than include it.\n\n"`.

**Private method `runStage2Mom(anchors: QuoteAnchor[], meetingDate: string): Promise<MoM>`**

Uses system prompt (replace `{{MEETING_DATE}}`):

```
You are a meeting minutes writer. You will receive a JSON array of verbatim quote anchors extracted from a meeting transcript. Your task is to produce formal Minutes of Meeting (MOM) in markdown format.

ABSOLUTE RULES — READ CAREFULLY:
1. You MUST base ALL content exclusively on the provided quote anchors. You do NOT have access to the full transcript.
2. DO NOT introduce any information that is not derivable from the provided quotes. If a topic, person, or commitment does not appear in the quotes, it does not exist in this document.
3. DO NOT paraphrase quotes in a way that changes meaning. You may write natural prose that synthesizes the quotes, but every factual claim must be directly traceable to at least one provided quote.
4. Speaker attribution: use the exact speaker labels from the quotes ("You", "Speaker 1", "Speaker 2"). Do NOT substitute real names.
5. Dates: if a quote contains a relative date expression ("next Friday"), resolve it relative to the meeting date provided below. If it cannot be resolved to a specific calendar date, write the raw expression followed by "(date unresolved — confirm with participants)".
6. If the quotes do not contain enough information for a section (e.g., no decisions were made), write "None recorded" for that section. Do NOT fabricate content to fill empty sections.
7. Status: all extracted items are proposals pending user review. The MOM itself is a draft.

Meeting date (ISO 8601): {{MEETING_DATE}}

INPUT FORMAT: You will receive a JSON object with an "anchors" array where each item has: quote_full, speaker_label, timestamp_start, timestamp_end, confidence, artifact_hint.

OUTPUT FORMAT — a JSON object with a "markdown_content" key containing the full MOM as a markdown string with these sections:
# Minutes of Meeting
**Date:** {{MEETING_DATE}}
**Generated:** (leave blank — filled by system)

## Attendees
(List speaker labels present in the quotes)

## Agenda Items Discussed
(Bullet list of topics, each grounded in at least one quote)

## Key Discussion Points
(Bullet list of significant discussion points, each grounded in quotes — cite the speaker label)

## Decisions Made
(Numbered list — if none, write "None recorded")

## Action Items
(Table: | # | Description | Owner | Due Date | Quote Reference |)
(If no action items, write "None recorded")

## Next Steps
(Brief paragraph synthesizing confirmed action items and any follow-up dates)
```

User content: `JSON.stringify({ anchors })`.
Call `generate(MoMSchema, 'minutes_of_meeting', systemPrompt, userContent)`.
Return the result.

**Private method `runStage2Summary(anchors: QuoteAnchor[], meetingDate: string): Promise<Summary>`**

System prompt (replace `{{MEETING_DATE}}`):

```
You are a meeting summarizer. You will receive a JSON object with verbatim quote anchors extracted from a meeting transcript. Your task is to produce a concise, accurate meeting summary.

ABSOLUTE RULES — READ CAREFULLY:
1. You MUST base your summary EXCLUSIVELY on the provided quote anchors. You do NOT have access to the full transcript.
2. DO NOT include any information not present in the provided quotes. If an important topic was discussed but no quote was extracted for it, it does not appear in your summary.
3. DO NOT fabricate context, outcomes, or details. If the quotes are sparse, write a shorter, accurate summary rather than a longer, inaccurate one.
4. Keep the summary to 2-3 sentences maximum.
5. Write in past tense ("The team discussed...", "Attendees agreed...").
6. Do NOT include speaker labels in the summary text. The summary is an aggregate view, not an attribution log.
7. Do NOT include specific action items or dates in the summary — those belong in the action items artifact. The summary captures overall themes and outcomes only.

Meeting date (ISO 8601): {{MEETING_DATE}}

INPUT FORMAT: A JSON object with an "anchors" array of quote anchor objects (quote_full, speaker_label, confidence, artifact_hint fields).

OUTPUT FORMAT: A JSON object with a "summary_text" key containing a plain string — 2 to 3 sentences, no markdown formatting, no bullet points.
```

User content: `JSON.stringify({ anchors })`.
Call `generate(SummarySchema, 'meeting_summary', systemPrompt, userContent)`.
Return the result.

**Private method `runStage2KeyPoints(anchors: QuoteAnchor[], meetingDate: string): Promise<KeyPointList>`**

System prompt (replace `{{MEETING_DATE}}`):

```
You are a meeting analyst. You will receive a JSON object with verbatim quote anchors extracted from a meeting transcript. Your task is to extract the most important key points from the meeting.

ABSOLUTE RULES — READ CAREFULLY:
1. You MUST ground every key point in at least one provided quote anchor. If a key point cannot be traced to a provided quote, it MUST NOT appear in your output.
2. DO NOT generate key points from information not present in the quotes. You do NOT have access to the full transcript.
3. Each key point must be a distinct, standalone statement. Do not repeat information across key points.
4. Rank by importance: the most consequential points (decisions, commitments, critical information shared) come first.
5. Limit to a maximum of 8 key points. If fewer than 8 quotes support distinct key points, output fewer. Do NOT pad to reach 8.
6. Write each key point as a single, clear sentence in past tense.
7. Include the speaker label for attribution when the point is a direct statement from one speaker ("Speaker 1 confirmed that..."). For group-level observations, no attribution needed.

Meeting date (ISO 8601): {{MEETING_DATE}}

INPUT FORMAT: A JSON object with an "anchors" array of quote anchor objects.

OUTPUT FORMAT: A JSON object with a "key_points" array where each item has:
- text: string — the key point sentence
- speaker_label: string or null — attribution (null for group observations)
- source_quote_preview: string — the quote_preview from the anchor that supports this point
- confidence: "direct" or "inferred" — inherited from the supporting anchor's confidence field
```

User content: `JSON.stringify({ anchors })`.
Call `generate(KeyPointListSchema, 'key_points', systemPrompt, userContent)`.
Return the result.

**Private method `runStage2ActionItems(anchors: QuoteAnchor[], meetingDate: string): Promise<ActionItemList>`**

System prompt (replace `{{MEETING_DATE}}`):

```
You are a meeting action item extractor. This is the most trust-critical extraction task. You will receive a JSON object with verbatim quote anchors from a meeting transcript. Your task is to extract concrete, committable action items — and ONLY those.

ABSOLUTE RULES — READ CAREFULLY:
1. You MUST ground every action item in at least one provided quote anchor. An action item with no supporting quote MUST NOT appear in your output. This is non-negotiable.
2. You MUST cite the exact quote_full from the anchor that supports the action item in the citations array. Do not paraphrase the quote in the citation.
3. DO NOT extract soft suggestions, hypothetical discussions, or future wishes. Only extract statements where a specific person (or group) explicitly committed to a specific task.
   - EXTRACT: "I'll own the backend API changes by end of week" — explicit commitment
   - DO NOT EXTRACT: "We should probably think about redesigning the dashboard" — soft suggestion, no commitment
   - DO NOT EXTRACT: "It would be great if someone looked into the pricing model" — hypothetical, no owner
4. If an action item was discussed but the owner is unclear from the quotes, set assignee_label to null. Do NOT guess or infer an owner not mentioned in the quotes.
5. Dates: use the meeting_date to resolve relative expressions ("next Friday" to ISO 8601 date). If a deadline cannot be resolved to a specific date, set due_date to null and copy the raw expression to raw_deadline_text. Do NOT fabricate a date.
6. Status is always "proposed". Never use any other value.
7. Generate a UUID v4 for each action item's id field.
8. If no extractable action items exist, output {"action_items": []}. Do NOT create placeholder or example action items.
9. The confidence field comes from the supporting quote's confidence: "direct" if the quote is an explicit commitment, "inferred" if the action item requires interpretation of the quote.

Meeting date (ISO 8601): {{MEETING_DATE}}

INPUT FORMAT: A JSON object with an "anchors" array of quote anchor objects (quote_full, speaker_label, timestamp_start, timestamp_end, confidence, artifact_hint fields).

OUTPUT FORMAT: A JSON object with an "action_items" array where each object has:
- id: string (UUID v4)
- description: string — what must be done, written clearly
- assignee_label: string or null — exact speaker label, or null if unattributed
- due_date: string or null — ISO 8601 date string, or null if unresolvable
- raw_deadline_text: string or null — the raw expression if due_date is null (e.g., "by end of month")
- status: "proposed" (always this value)
- citations: array with at least one item, each containing:
    - quote_preview: string (first 8-12 words of the verbatim quote)
    - quote_full: string (exact verbatim quote — copy from the anchor)
    - speaker_label: string
    - timestamp_start: number or null
    - timestamp_end: number or null
    - confidence: "direct" or "inferred"
```

User content: `JSON.stringify({ anchors })`.
Call `generate(ActionItemListSchema, 'action_items', systemPrompt, userContent)`.
Return the result.

**Private method `validateAndRetryActionItems(items: ActionItem[], anchors: QuoteAnchor[], meetingDate: string): Promise<ActionItem[]>`**

Per D-10: for each action item, validate it against its own citations using `CitationValidator.validate(item.description, item.citations)`. If validation passes (returns true), keep the item. If it fails:
- Retry the Stage 2 action items call up to 2 times with `retryPromptPrefix()` prepended to the system prompt.
- After each retry, re-validate all returned action items.
- If after 2 retries an item still fails, drop it and log: `console.warn('[CitationValidator] dropped item', { item_id: item.id, artifact_type: 'action_item', attempts: 3, final_score: score })`.

Implementation note: validate the full batch after each call; per-item granularity would require isolating which item fails which retry, which is complex. Instead: if any item in a batch fails, retry the full Stage 2 action item call (not individual items). After retry 2, keep only items that pass validation; drop the rest with the log above.

Apply the same retry-then-drop logic to key point items: validate each `keyPoint.text` against a synthetic citation array built from the anchor matching `keyPoint.source_quote_preview` (find the anchor by `quote_preview` equality). If no anchor matches, the score is 0.0 — drop the item.

**Public method `run(): Promise<z.infer<typeof MeetingArtifactsSchema>>`**

Full orchestration:

1. Load the meeting `started_at` value from `meetings` table: `SELECT started_at FROM meetings WHERE id = ?`. Format as ISO 8601 date string: `new Date(startedAt).toISOString().split('T')[0]`.

2. Call `this.loadTranscript()` to get formatted transcript text.

3. If the transcript is empty (no segments), skip Stage 1 and Stage 2. Push `artifact-proposals-ready` with an empty proposals payload and return early:
   ```
   { meetingId, mom: { markdown_content: '# Minutes of Meeting\n\nNo content recorded.' },
     summary: { summary_text: 'No meeting content was recorded.' },
     keyPoints: { key_points: [] }, actionItems: { action_items: [] } }
   ```

4. Run Stage 1: `const anchors = await this.runStage1(transcriptText)`.

5. If `anchors` is empty (per OQ-3 in RESEARCH.md), skip Stage 2 and return an empty proposals payload (same structure as step 3 with appropriate empty-content messages).

6. Run Stage 2 — four parallel calls via `Promise.all`:
   ```typescript
   const [mom, summary, keyPoints, actionItems] = await Promise.all([
     this.runStage2Mom(anchors, meetingDate),
     this.runStage2Summary(anchors, meetingDate),
     this.runStage2KeyPoints(anchors, meetingDate),
     this.runStage2ActionItems(anchors, meetingDate),
   ])
   ```

7. Validate and retry action items and key points (call `validateAndRetryActionItems`).

8. Assemble the `MeetingArtifactsSchema`-conformant payload:
   ```typescript
   const artifacts = { meetingId, mom, summary, keyPoints: validatedKeyPoints, actionItems: validatedActionItems }
   ```

9. Persist via `this.artifactStore.saveArtifacts(meetingId, artifacts)`.

10. Return `artifacts`.

**Error handling (D-08):** Wrap the entire `run()` body in a try/catch. On any error (LLM timeout, Zod parse failure, DB error), log the error, and return the error payload:
```typescript
{ meetingId, mom: { markdown_content: '' }, summary: { summary_text: '' },
  keyPoints: { key_points: [] }, actionItems: { action_items: [] },
  error: true, errorMessage: 'Artifact generation failed — your transcript is saved' }
```
Do not throw — always return a value so the FSM can advance to `Complete`.

**Verify:**
`npx tsc --noEmit` must pass. The smoke-test script in Task 15 exercises this end-to-end.

---

### Task 7: Implement `CalendarExportService.ts`

**File:** `src/main/calendar/CalendarExportService.ts` (new file, new directory)

**Action:** create

**What:**

Create the `src/main/calendar/` directory. Implement `.ics` export for confirmed action items (per D-13, ART-10).

**Imports:**
- `createEvents` from `'ics'`
- `dialog`, `app` from `'electron'`
- `writeFileSync` from `'fs'`
- `join` from `'path'`
- `ArtifactStore` from `'../store/ArtifactStore'`

**Constructor:** `constructor(private artifactStore: ArtifactStore)`

**`export(meetingId: string): Promise<{ filePath: string | null; skippedCount: number }>`**

1. Call `this.artifactStore.getConfirmedActionItems(meetingId)` to retrieve confirmed items.
2. Filter to items where `due_date` is not null (items without due dates are skipped for `.ics`; count them as `skippedCount`).
3. If no items have a `due_date`, return `{ filePath: null, skippedCount: totalCount }`.
4. Build `EventAttributes[]` for the `ics` package:
   - For each item with a `due_date`:
     - Parse `due_date` as ISO 8601 (split by `-` to get `[year, month, day]` as numbers).
     - `title`: `item.description`
     - `description`: `assignee_label ? "Owner: " + assignee_label : "No assigned owner"`
     - `start`: `[year, month, day]` (all-day event)
     - `end`: `[year, month, day]` (same day = all-day)
     - `status`: `'CONFIRMED'`
     - `uid`: `item.id + '@meetingassist'`
5. Call `createEvents(eventsList)`. If `createEvents` returns an error, throw it.
6. Call `dialog.showSaveDialog({ defaultPath: join(app.getPath('downloads'), 'meeting-actions.ics'), filters: [{ name: 'iCalendar', extensions: ['ics'] }] })`.
7. If the user cancels (result is `{ canceled: true }`), return `{ filePath: null, skippedCount }`.
8. Write the `.ics` string to `result.filePath` using `writeFileSync`.
9. Return `{ filePath: result.filePath, skippedCount }`.

**Verify:**
`npx tsc --noEmit` must pass. Integration verified by the acceptance criterion in Task 14: after confirming an action item with a `due_date`, calling `export-ics` produces a non-null `filePath` and the file at that path is readable by `fs.readFileSync`.

---

### Task 8: Wire `Processing` state handler and IPC handlers in `src/main/index.ts`

**File:** `src/main/index.ts`

**Action:** modify

**What:**

Replace the stub `Processing` state handler (lines 107–117) and the four stub artifact IPC
handlers (lines 149–152) with real implementations. Also add the `GEMINI_API_KEY` warn similar
to the existing Deepgram warn.

**Step A — Add imports at the top of the file:**
```typescript
import { ArtifactPipeline } from './pipeline/ArtifactPipeline'
import { ArtifactStore } from './store/ArtifactStore'
import { CalendarExportService } from './calendar/CalendarExportService'
```

**Step B — Add `GEMINI_API_KEY` validation near the existing Deepgram key check:**
```typescript
const geminiApiKey = process.env.GEMINI_API_KEY ?? ''
if (!geminiApiKey) {
  console.warn('[MeetingAssist] GEMINI_API_KEY not set — artifact pipeline will fail')
}
```

**Step C — Instantiate `ArtifactStore` and `CalendarExportService` after `db` is confirmed open:**
```typescript
const artifactStore = new ArtifactStore(db!)
const calendarExportService = new CalendarExportService(artifactStore)
```

**Step D — Add a local `lastCompletedMeetingId` variable** (alongside `currentMeetingId`) to track which meeting was just processed:
```typescript
let lastCompletedMeetingId: string | null = null
```

**Step E — Replace the `Processing` state handler** (the `if (state === 'Processing')` block) with:

```typescript
if (state === 'Processing') {
  const meetingId = currentMeetingId
  currentMeetingId = null
  captureService.stopCapture()
    .catch((err: unknown) => {
      console.error('[MeetingAssist] CaptureService.stopCapture failed:', err)
    })
    .finally(async () => {
      let proposals: z.infer<typeof MeetingArtifactsSchema>
      try {
        const pipeline = new ArtifactPipeline(db!, win!, meetingId ?? '')
        proposals = await pipeline.run()
      } catch (err: unknown) {
        console.error('[MeetingAssist] ArtifactPipeline failed:', err)
        proposals = {
          meetingId: meetingId ?? '',
          mom: { markdown_content: '' },
          summary: { summary_text: '' },
          keyPoints: { key_points: [] },
          actionItems: { action_items: [] },
          error: true,
          errorMessage: 'Artifact generation failed — your transcript is saved',
        }
      }
      lastCompletedMeetingId = proposals.meetingId || meetingId
      if (win) {
        win.webContents.send('artifact-proposals-ready', proposals)
      }
      session.transition('pipeline-complete')
    })
}
```

Add these imports at the top of the file:
```typescript
import { z } from 'zod'
import { MeetingArtifactsSchema } from '../shared/schemas'
```
Use `z.infer<typeof MeetingArtifactsSchema>` for the `proposals` variable type in the Processing handler. Do not use a type-only import — the schema value itself is needed for `z.infer<>` to resolve.

**Step F — Replace stub IPC handlers** with real implementations (per D-07, architecture §7):

Replace `ipcMain.handle('confirm-artifact', () => undefined)` with:
```typescript
ipcMain.handle('confirm-artifact', (_event, payload: unknown) => {
  const { id, type } = payload as { id: string; type: 'action_item' | 'decision' | 'date' }
  artifactStore.confirmArtifact(id, type)
})
```

Replace `ipcMain.handle('edit-artifact', () => undefined)` with:
```typescript
ipcMain.handle('edit-artifact', (_event, payload: unknown) => {
  const { id, updates } = payload as { id: string; type: string; updates: Record<string, unknown> }
  artifactStore.editArtifact(id, updates as { description?: string; due_date?: string | null; assignee_label?: string | null })
})
```

Replace `ipcMain.handle('dismiss-artifact', () => undefined)` with:
```typescript
ipcMain.handle('dismiss-artifact', (_event, payload: unknown) => {
  const { id } = payload as { id: string; type: string }
  artifactStore.dismissArtifact(id)
})
```

Replace `ipcMain.handle('export-ics', () => undefined)` with:
```typescript
ipcMain.handle('export-ics', async (_event, payload: unknown) => {
  const { meetingId } = payload as { meetingId: string }
  return calendarExportService.export(meetingId)
})
```

**Verify:**
`npx tsc --noEmit` must pass. Start the app with `npm run dev`. Start and end a meeting. Observe in the console that `[ArtifactPipeline] transcript token estimate:` is logged, `artifact-proposals-ready` is emitted, and the FSM reaches `Complete` state.

---

### Task 9: Implement `CitationPanel.tsx`

**File:** `src/renderer/src/components/CitationPanel.tsx` (new file)

**Action:** create

**What:**

A pure display component. Renders a verbatim quote block (per D-11, ART-08, D-02 from AI-SPEC).

**Props interface:**
```typescript
interface CitationPanelProps {
  citations: Array<{
    quote_preview: string
    quote_full: string
    speaker_label: string
    timestamp_start: number | null
    timestamp_end: number | null
    confidence: 'direct' | 'inferred'
  }>
  isOpen: boolean
}
```

**Render:** If `!isOpen`, render nothing (return `null`).

If open, render a `<div>` with a subtle background (e.g., `background: 'rgba(255,255,255,0.05)'`, `borderLeft: '2px solid #4b5563'`, `padding: '8px 12px'`, `marginTop: '4px'`, `borderRadius: '4px'`).

For each citation, render:
- Speaker label + timestamp line: `{citation.speaker_label}` and if `timestamp_start` is not null, show `({Math.floor(citation.timestamp_start / 60)}:{String(Math.floor(citation.timestamp_start % 60)).padStart(2, '0')})` in muted gray.
- `confidence === 'inferred'` → show a small badge: `Inferred — no direct quote` in amber/yellow text.
- `quote_full` text in an italic, slightly dimmer style.

No external styling library. Use inline styles matching the existing overlay dark theme (dark background, white/gray text).

**Verify:**
`npx tsc --noEmit` must pass. Visual: import and render with a mock prop in `App.tsx` temporarily to confirm it renders without crashing, then remove the test render.

---

### Task 10: Implement `ArtifactItem.tsx`

**File:** `src/renderer/src/components/ArtifactItem.tsx` (new file)

**Action:** create

**What:**

A single proposed artifact item card with Verify toggle, confirm/dismiss buttons, and inline edit (per D-11, ART-08, ART-09).

**Props interface:**
```typescript
interface ArtifactItemProps {
  id: string
  text: string                    // primary display text (description, key point text, etc.)
  subtext?: string                // optional e.g. "Owner: Speaker 1 | Due: 2026-07-04"
  citations: Array<{
    quote_preview: string
    quote_full: string
    speaker_label: string
    timestamp_start: number | null
    timestamp_end: number | null
    confidence: 'direct' | 'inferred'
  }>
  artifactType: 'action_item' | 'key_point' | 'mom' | 'summary'
  onConfirm: (id: string) => void
  onDismiss: (id: string) => void
  onEdit: (id: string, updates: { description?: string }) => void
}
```

**State:**
- `verifyOpen: boolean` — controls `CitationPanel` visibility
- `isEditing: boolean` — inline textarea edit mode
- `editValue: string` — current text in the textarea (initialized to `text` prop)

**Render:**

Outer container: `<div>` with bottom border, padding `8px 0`.

Row 1: display text. If `isEditing`, render `<textarea>` (value bound to `editValue`, `onChange` updates `editValue`, `rows=3`, full width inline style). If not editing, render `<span>` that is clickable (cursor pointer) — `onClick` sets `isEditing=true`.

Row 2 (if `subtext`): render `subtext` in muted gray, `fontSize: '11px'`.

Row 3: action buttons row.
- "Verify" toggle button — `onClick` toggles `verifyOpen`. Label: `verifyOpen ? 'Hide Quote' : 'Verify'`. Style: small text button, no fill.
- If NOT editing: "Confirm" button (blue fill) and "Dismiss" button (transparent, border). Clicking "Confirm" calls `onConfirm(id)`. Clicking "Dismiss" calls `onDismiss(id)`.
- If IS editing: "Save" button — `onClick` calls `onEdit(id, { description: editValue })` then sets `isEditing=false`. "Cancel" button — `onClick` resets `editValue=text` and sets `isEditing=false`.

Below Row 3: `<CitationPanel citations={citations} isOpen={verifyOpen} />`

Import `CitationPanel` from `'./CitationPanel'`.

**Verify:**
`npx tsc --noEmit` must pass. Render with mock props in a test harness or temporarily in `App.tsx` to confirm state toggling works.

---

### Task 11: Implement `ArtifactReview.tsx`

**File:** `src/renderer/src/components/ArtifactReview.tsx` (new file)

**Action:** create

**What:**

The main proposal review panel shown when `sessionState === 'Complete'` (per D-11, D-12, ART-08, ART-09, UI-04).

**Props interface:**
```typescript
interface ArtifactReviewProps {
  meetingId: string
  artifacts: {
    mom: { markdown_content: string }
    summary: { summary_text: string }
    keyPoints: { key_points: Array<{ text: string; speaker_label: string | null; source_quote_preview: string; confidence: 'direct' | 'inferred' }> }
    actionItems: { action_items: Array<{ id: string; description: string; assignee_label: string | null; due_date: string | null; raw_deadline_text: string | null; status: string; citations: Array<{ quote_preview: string; quote_full: string; speaker_label: string; timestamp_start: number | null; timestamp_end: number | null; confidence: 'direct' | 'inferred' }> }> }
    error?: boolean
    errorMessage?: string
  }
}
```

**State:**
- `expandedSection: 'mom' | 'summary' | 'keyPoints' | 'actionItems' | null` — which accordion section is open (default: `'actionItems'`)
- `dismissedItems: Set<string>` — IDs of dismissed items (for local UI hiding without a full re-render from parent)
- `confirmedItems: Set<string>` — IDs of confirmed items (for visual feedback)
- `exportResult: { filePath: string | null; skippedCount: number } | null`
- `isExporting: boolean`

**Render:**

If `artifacts.error`:
- Show a red-tinted error banner: `artifacts.errorMessage ?? 'Artifact generation failed — your transcript is saved'`.
- Show "Start New Meeting" and "Dismiss" buttons (same as current `Complete` state in `App.tsx`).
- Return early — do not render artifact sections.

Header: "Meeting Artifacts" in white, `fontSize: '14px'`, `fontWeight: 600`.

Four accordion sections. Each section has a header row that toggles `expandedSection`. Header row: section title + chevron indicator (▼ when open, ▶ when closed). Inline style consistent with the overlay dark theme.

**Summary section** (when expanded): single `<p>` with `artifacts.summary.summary_text`.

**Key Points section** (when expanded): list of `<ArtifactItem>` for each key point (using `text=keyPoint.text`, `citations` built from a synthetic single-citation using `source_quote_preview` as both `quote_preview` and `quote_full`, `confidence=keyPoint.confidence`, `speaker_label=keyPoint.speaker_label ?? 'Unknown'`). Key points are non-dismissable for Phase 8 — `onConfirm` and `onDismiss` are no-ops for key points.

**MOM section** (when expanded): render `artifacts.mom.markdown_content` as preformatted text (`<pre>` with `whiteSpace: 'pre-wrap'`, `fontSize: '11px'`, `color: '#d1d5db'`). No inline-edit for MOM in Phase 8.

**Action Items section** (when expanded): list of `<ArtifactItem>` for each action item not in `dismissedItems`. For each item:
- `text = item.description`
- `subtext = [item.assignee_label ? "Owner: " + item.assignee_label : null, item.due_date ? "Due: " + item.due_date : (item.raw_deadline_text ? "Due: " + item.raw_deadline_text + " (unresolved)" : null)].filter(Boolean).join(' | ')`
- `citations = item.citations`
- `onConfirm`: call `window.electronAPI.invoke('confirm-artifact', { id, type: 'action_item' })` then add to `confirmedItems`.
- `onDismiss`: call `window.electronAPI.invoke('dismiss-artifact', { id, type: 'action_item' })` then add to `dismissedItems`.
- `onEdit`: call `window.electronAPI.invoke('edit-artifact', { id, type: 'action_item', updates })`.
- Confirmed items: render with a checkmark badge and disabled buttons (gray out Confirm/Dismiss).

If `confirmedItems.size > 0`: show an "Export to Calendar (.ics)" button. `onClick`:
- Set `isExporting=true`.
- Call `window.electronAPI.invoke('export-ics', { meetingId })`.
- On result: set `exportResult` and `isExporting=false`.
- Show result: if `exportResult.filePath`, show "Saved to: {filename}" (just the basename). If `exportResult.skippedCount > 0`, show "(N items skipped — no due date set)".

Below all sections: "Start New Meeting" button (calls `window.electronAPI.invoke('start-meeting')`) and "Dismiss" button (calls `window.electronAPI.invoke('dismiss-session')`).

Import `ArtifactItem` from `'./ArtifactItem'`.

**Verify:**
`npx tsc --noEmit` must pass. The integration test in Task 15 verifies end-to-end rendering.

---

### Task 12: Wire `ArtifactReview` into `App.tsx`

**File:** `src/renderer/src/App.tsx`

**Action:** modify

**What:**

Replace the current `sessionState === 'Complete'` render block (the simple "Meeting complete" div
with two buttons) with `ArtifactReview`. Add IPC listener for `artifact-proposals-ready` to
capture the proposals payload. Also add a `useArtifactProposals` hook.

**Step A — Add import:**
```typescript
import { ArtifactReview } from './components/ArtifactReview'
```

**Step B — Add `useArtifactProposals` hook** inside the file (above `App`):

```typescript
function useArtifactProposals() {
  const [proposals, setProposals] = useState<{
    meetingId: string
    mom: { markdown_content: string }
    summary: { summary_text: string }
    keyPoints: { key_points: Array<{ text: string; speaker_label: string | null; source_quote_preview: string; confidence: 'direct' | 'inferred' }> }
    actionItems: { action_items: Array<any> }
    error?: boolean
    errorMessage?: string
  } | null>(null)

  useEffect(() => {
    window.electronAPI.on('artifact-proposals-ready', (payload: unknown) => {
      setProposals(payload as any)
    })
  }, [])

  return proposals
}
```

**Step C — In the `App` component body**, call:
```typescript
const proposals = useArtifactProposals()
```

**Step D — Replace the `sessionState === 'Complete'` block:**

```typescript
if (sessionState === 'Complete') {
  if (!proposals) {
    return (
      <div id="overlay-root" style={{ width: '380px', minHeight: '100vh', background: 'rgba(0,0,0,0.85)', color: '#fff' }}>
        <div style={{ padding: '16px', fontSize: '13px', color: '#9ca3af' }}>
          Processing artifacts...
        </div>
      </div>
    )
  }
  return (
    <div id="overlay-root" style={{ width: '380px', minHeight: '100vh', background: 'rgba(0,0,0,0.85)', color: '#fff', overflowY: 'auto' }}>
      <ArtifactReview meetingId={proposals.meetingId} artifacts={proposals} />
    </div>
  )
}
```

**Verify:**
`npx tsc --noEmit` must pass. Run `npm run dev`, start and end a short test meeting. When `Processing` transitions to `Complete`, the `ArtifactReview` panel must render (even if empty) instead of the plain "Meeting complete" stub.

---

### Task 13: Create 10 eval corpus fixture files

**Files:** `eval/corpus/test_01_standard_sync_01.json` through `eval/corpus/test_10_short_no_content_02.json`

**Action:** create

**What:**

Create the `eval/corpus/` directory. Write 10 `AdversarialTestCase` JSON files (per RESEARCH.md
Q3 and AI-SPEC §3.6). Meeting date for all fixtures: `2026-06-27`. Include header line
`[Meeting date: 2026-06-27]` as the first line of every `transcript` field.

File naming convention: `test_NN_<category>_NN.json`.

**4 standard_sync files** (`test_01` through `test_04`): Normal 15-30 minute meeting excerpts
with 2-4 speakers. Include at least 2-3 action items with explicit commitments, 1-2 decisions,
and at least one date reference. Ground truth must list all action items with verbatim
`source_quote` values.

Example structure:
```json
{
  "transcript_id": "test_01_standard_sync_01",
  "category": "standard_sync",
  "transcript": "[Meeting date: 2026-06-27]\n[00:00] You: ...\n[00:45] Speaker 1: ...",
  "ground_truth": {
    "action_items": [
      {
        "description": "...",
        "assignee_label": "Speaker 1",
        "due_date": "2026-07-04",
        "source_quote": "..."
      }
    ],
    "decisions": [],
    "dates": []
  }
}
```

Write four distinct transcripts covering different meeting types: sprint planning, design review,
sales pipeline review, and a team retrospective.

**4 fabrication_bait files** (`test_05` through `test_08`): Transcripts where a topic is
discussed informally but no explicit commitment is made. The ground truth `action_items` must be
empty or contain only the genuine commitments. Add `adversarial_injections` array describing what
the model must NOT extract.

Example: a meeting discusses "maybe we should refresh the website" but only one person commits to
something concrete (e.g., "I'll send the analytics report by Friday"). The model must not
fabricate a website-refresh action item.

Write four distinct fabrication scenarios: informal brainstorming, second-hand report
("I heard someone might..."), hypothetical future planning, and a discussion that resolves to no
decision.

**2 short_no_content files** (`test_09` through `test_10`): Very short (5-8 line) meeting
transcripts with no actionable content — social catch-up, scheduling a future meeting only, or
a quick FYI exchange. Ground truth: all arrays empty.

**Verify:**
`ls eval/corpus/ | wc -l` must output `10`. Each file must be valid JSON: run
`for f in eval/corpus/*.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" && echo "$f OK"; done`.

---

### Task 14: Write `CitationValidator` unit test

**File:** `src/main/pipeline/CitationValidator.test.ts` (new file)

**Action:** create

**What:**

Write a Vitest unit test file for `CitationValidator`. The test file must import
`CitationValidator` from `'./CitationValidator'` and cover:

1. **Exact match returns 1.0:** `score('I will handle the backend changes by end of week', 'I will handle the backend changes by end of week')` equals `1.0`.

2. **High overlap passes threshold:** `score('I will handle the backend changes', 'I will handle the backend changes by end of week')` returns a value ≥ 0.90 (passes threshold).

3. **Fabricated citation fails threshold:** `score('Alice will lead the marketing campaign launch', 'I will handle the backend changes by end of week')` returns a value < 0.90 (rejects fabricated claim). This is the acceptance criterion for ART-04 / CitationValidator correctness.

4. **Empty inputs:** `score('', '')` returns `1.0`. `score('hello', '')` returns `0.0`.

5. **`validate()` returns true when best citation score ≥ 0.90:** Call `validate('I will handle the backend changes', [{ quote_full: 'I will handle the backend changes by end of week' }])`. Must return `true`.

6. **`validate()` returns false when no citation score ≥ 0.90:** Call `validate('Alice will launch the marketing campaign globally', [{ quote_full: 'I will handle the backend changes by end of week' }])`. Must return `false`. This satisfies acceptance criterion 3 from the phase goal: "CitationValidator rejects at least one item in a synthetic test with a fabricated citation."

Use `describe`/`it`/`expect` from `'vitest'`. No mocking needed — this is pure TypeScript logic.

**Verify:**
Run `npx vitest run src/main/pipeline/CitationValidator.test.ts`. All 6 tests must pass. Output must include the fabricated-citation rejection test passing.

---

### Task 15: Write pipeline smoke-test script

**File:** `eval/smoke-test.ts` (new file)

**Action:** create

**What:**

A standalone Node.js / ts-node script (not a Vitest test) that reads a fixture transcript from
`eval/corpus/`, calls `ArtifactPipeline` with a mock DB and mock BrowserWindow, and prints the
proposals JSON. This verifies the end-to-end pipeline can run without a live meeting.

Since `ArtifactPipeline` requires a real `better-sqlite3-multiple-ciphers` database, the smoke
test must open an in-memory SQLite database (`:memory:`) with the same DDL as `db.ts`, insert
transcript segments from the fixture file, and then run the pipeline.

**Implementation:**

```typescript
// eval/smoke-test.ts
// Run with: npx ts-node eval/smoke-test.ts <fixture_path>
// Example: npx ts-node eval/smoke-test.ts eval/corpus/test_01_standard_sync_01.json

import Database from 'better-sqlite3-multiple-ciphers'
import { ALL_DDLS } from '../src/main/store/db'  // Verify this export exists in db.ts before writing this file; add it if missing (export const ALL_DDLS = [DDL1, DDL2, ...].join('\n'))
import { ArtifactPipeline } from '../src/main/pipeline/ArtifactPipeline'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

const fixturePath = process.argv[2]
if (!fixturePath) {
  console.error('Usage: npx ts-node eval/smoke-test.ts <fixture_path>')
  process.exit(1)
}

const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))

// Open in-memory DB (no encryption for smoke tests)
const db = new Database(':memory:')
// Load sqlite-vec if available (optional for smoke tests — skip if not available)
try {
  const sqliteVec = require('sqlite-vec')
  sqliteVec.load(db)
} catch {
  console.warn('[smoke-test] sqlite-vec not available — skipping extension load')
}
db.exec(ALL_DDLS)

// Insert meeting row
const meetingId = crypto.randomUUID()
const now = Date.now()
db.prepare('INSERT INTO meetings (id, title, started_at, created_at) VALUES (?, ?, ?, ?)').run(
  meetingId, 'Smoke Test Meeting', now, now
)

// Parse transcript lines and insert segments
const lines = fixture.transcript.split('\n').filter((l: string) => l.trim() && !l.startsWith('[Meeting date:'))
lines.forEach((line: string, idx: number) => {
  const match = line.match(/^\[(\d+:\d+)\]\s+(.+?):\s+(.+)$/)
  if (!match) return
  const [, tsStr, speaker, text] = match
  const [min, sec] = tsStr.split(':').map(Number)
  const ts = min * 60 + sec
  db.prepare(
    'INSERT INTO transcript_segments (id, meeting_id, speaker_label, channel, timestamp_start, timestamp_end, text, is_speech_final, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)'
  ).run(crypto.randomUUID(), meetingId, speaker, 'mic', ts, ts + 30, text, now)
})

console.log(`[smoke-test] Inserted ${lines.length} transcript segments for meeting ${meetingId}`)
console.log('[smoke-test] Running ArtifactPipeline...')

// Mock BrowserWindow — pipeline only calls win.webContents.send which we do not need in smoke test
const mockWin = { webContents: { send: (...args: unknown[]) => console.log('[smoke-test] IPC push:', args[0]) } } as any

const pipeline = new ArtifactPipeline(db, mockWin, meetingId)
pipeline.run().then((result) => {
  console.log('\n[smoke-test] Pipeline complete. Proposals:')
  console.log(JSON.stringify(result, null, 2))
  db.close()
  process.exit(0)
}).catch((err: unknown) => {
  console.error('[smoke-test] Pipeline failed:', err)
  db.close()
  process.exit(1)
})
```

Note: `GEMINI_API_KEY` must be set in the environment for the smoke test to actually call the
Gemini API. If the key is not set, the pipeline will fail at the LLM call and return the error
payload — this is acceptable for testing the error path.

**Verify:**
Run `GEMINI_API_KEY=<your-key> npx ts-node eval/smoke-test.ts eval/corpus/test_01_standard_sync_01.json`.
With a valid key, the script must print a JSON blob containing `mom`, `summary`, `keyPoints`, and
`actionItems` keys within 120 seconds. Without a key, the error payload must be printed (not a
crash). Either way the script exits with a defined exit code (0 for success or error payload, 1
for unexpected crash).

---

## Phase Acceptance Checklist

All five acceptance criteria from `05-BUILD-ORDER.md` Phase 3 must be met before this phase is
marked complete:

1. **120-second budget:** Run the smoke-test with a 30-minute fixture. The script completes in
   under 120 seconds. Measure with `time npx ts-node eval/smoke-test.ts eval/corpus/test_01_standard_sync_01.json`.

2. **All proposed status:** After running the smoke-test, query the in-memory DB (or a real test
   DB): `SELECT DISTINCT status FROM action_items` must return only `proposed`. The `saveArtifacts`
   method in `ArtifactStore` hardcodes `'proposed'`; the Zod schema on `ActionItemSchema.status`
   is `z.literal('proposed')`.

3. **CitationValidator rejects fabricated citation:** Run the Vitest unit test in Task 14. Test 6
   (`validate()` returns false for fabricated citation) must pass.

4. **Confirm → DB update → .ics export:** Start a real meeting session (or inject via smoke-test
   DB), confirm one action item with a `due_date` via `window.electronAPI.invoke('confirm-artifact', ...)`,
   then invoke `window.electronAPI.invoke('export-ics', { meetingId })`. The DB row must have
   `status='confirmed'`, and the returned `filePath` must point to a valid `.ics` file readable
   by Apple Calendar.

5. **`.ics` file validity:** Open the exported `.ics` in Apple Calendar. The confirmed action item
   must appear as an event on the correct date.

---

## Source Audit

| Source Item | Covered By | Notes |
|-------------|-----------|-------|
| GOAL: Two-stage LLM batch extraction at meeting end | Task 6 (ArtifactPipeline.ts) | D-01, D-02, D-03 |
| GOAL: Zod-validated artifact proposals | Task 2 (schemas), Task 6 | D-13, ART-11 |
| GOAL: ArtifactReview UI | Tasks 9-12 | D-11, D-12 |
| GOAL: .ics export for confirmed action items | Task 7 (CalendarExportService.ts), Task 8 | ART-10 |
| ART-01: Stage 1 reads transcript_segments only | Task 6 (loadTranscript method) | D-02 |
| ART-02: Stage 2 constrained to Stage 1 quotes | Task 6 (Stage 2 prompts + architecture) | D-03 |
| ART-03: MOM generated at meeting end | Task 6 (runStage2Mom) | Stage 2a prompt |
| ART-04: Key points with CitationValidator ≥ 90% | Tasks 3, 6 | D-09 |
| ART-05: Summary paragraph generated | Task 6 (runStage2Summary) | Stage 2b prompt |
| ART-06: Action items with quote anchors, proposed status | Tasks 5, 6 | D-09, D-10 |
| ART-07: All items created as 'proposed' | Task 5 (ArtifactStore.saveArtifacts hardcodes 'proposed') | Enforced in app code |
| ART-08: Verify toggle reveals verbatim quote | Tasks 9-11 (CitationPanel, ArtifactItem) | D-11 |
| ART-09: Confirm/edit/dismiss each item | Tasks 10-12 (ArtifactItem, ArtifactReview) | D-11 |
| ART-10: .ics export via ics package | Task 7 | Zero OAuth |
| ART-11: Zod validation; invalid responses retried | Tasks 2, 6 (per-item retry in ArtifactPipeline) | D-10 |
| D-01: Single Stage 1 call, full transcript, no chunking | Task 6 | |
| D-02: Stage 1 reads transcript_segments only | Task 6 | |
| D-03: 4 parallel Stage 2 calls via Promise.all | Task 6 | |
| D-04: Batch delivery — all 4 complete before push | Task 6 | |
| D-05: GEMINI_API_KEY from .env | Task 8 | |
| D-06: openai SDK, gemini-2.5-flash baseURL | Task 4 | |
| D-07: Processing handler: stopCapture → pipeline → push → transition | Task 8 | |
| D-08: Pipeline failure → empty proposals + error flag → always advance | Task 6, Task 8 | |
| D-09: CitationValidator Jaccard ≥ 0.90 | Task 3 | |
| D-10: Per-item retry, 2 retries, then drop | Task 6 (validateAndRetryActionItems) | |
| D-11: ArtifactReview functional skeleton | Tasks 9-12 | |
| D-12: ArtifactReview renders when Complete | Task 12 (App.tsx) | |
| D-13: Full Zod schemas in shared/schemas/index.ts | Task 2 | |
| RESEARCH Q1: Zod v3 + zod-to-json-schema, zodResponseFormat | Tasks 1, 4 | |
| RESEARCH Q2: tiktoken cl100k_base for token budgeting | Task 6 (loadTranscript) | |
| RESEARCH Q3: 10 eval fixture files | Task 13 | Eval corpus seeding |
| RESEARCH Q4: All 5 LLM prompts | Task 6 | Inline in ArtifactPipeline.ts |
| Deferred: streaming artifact delivery | NOT INCLUDED | Deferred to Phase 9 |
| Deferred: action items without due_date in .ics | NOT INCLUDED | Skipped with note |
| Deferred: named speaker attribution | NOT INCLUDED | Deferred to v2 |
| Deferred: EpochCompressor | NOT INCLUDED | Phase 10 |
| Deferred: Settings panel UI | NOT INCLUDED | Phase 9 |
