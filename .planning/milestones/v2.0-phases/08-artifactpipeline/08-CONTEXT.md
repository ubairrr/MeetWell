# Phase 8: ArtifactPipeline - Context

**Gathered:** 2026-06-27
**Status:** Ready for planning

<domain>
## Phase Boundary

End-of-meeting batch artifact extraction pipeline: reads `transcript_segments` from the encrypted DB, runs two-stage LLM processing (Stage 1: verbatim quote extraction → Stage 2: structured artifact generation from quotes only), validates all output against Zod schemas, persists proposals with `status: 'proposed'`, and renders them in the ArtifactReview UI for user confirmation/edit/dismiss. Confirmed action items export as `.ics`. Phase ends when a 30-minute test transcript produces validated MOM, key points, summary, and action items inside the ArtifactReview panel with working confirm/dismiss/edit and .ics export.

Requirements: ART-01 through ART-11 (11 requirements).

</domain>

<decisions>
## Implementation Decisions

### Stage 1: Quote Extraction

- **D-01:** Stage 1 sends the full transcript (all `transcript_segments` for the meeting) in a single LLM call. Gemini 2.5 Flash's 1M token context window easily covers a 30-minute meeting (~8-15k tokens). No chunking logic needed for v1.
- **D-02:** Stage 1 reads from `transcript_segments` table ONLY — never from `summary_cards`. This is enforced in the pipeline code, not assumed from the caller.

### Stage 2: Parallel Artifact Generation

- **D-03:** Stage 2 runs 4 parallel LLM calls via `Promise.all` — one per artifact type: MOM, summary, key points, and action items. Each call receives the Stage 1 quote anchors as its input constraint. Parallel execution stays within the 120-second budget and makes per-artifact retry feasible.
- **D-04:** All 4 Stage 2 calls must complete before the `artifact-proposals-ready` IPC event is pushed to the renderer (batch delivery, not streaming). After all proposals are pushed, `pipeline-complete` FSM event fires.

### LLM Adapter

- **D-05:** `GEMINI_API_KEY` is loaded from `.env` via Vite's `loadEnv` in `electron.vite.config.ts` → `process.env.GEMINI_API_KEY` in the main process. Same pattern as `DEEPGRAM_API_KEY`. Settings panel UX for end users is a Phase 9 concern.
- **D-06:** LLM adapter uses `openai` SDK via `baseURL` pointing to Gemini 2.5 Flash — the locked stack choice. Model: `gemini-2.5-flash`.

### Pipeline ↔ FSM Integration

- **D-07:** The `Processing` state handler in `src/main/index.ts` is updated to: (1) call `captureService.stopCapture()`, (2) instantiate and run `ArtifactPipeline`, (3) push `artifact-proposals-ready` with all results, (4) fire `session.transition('pipeline-complete')`. The pipeline replaces the current immediate `pipeline-complete` transition.
- **D-08:** If the pipeline fails (LLM timeout, network error, Zod validation failure after per-item retries): always fire `pipeline-complete` and push `artifact-proposals-ready` with an empty proposals array plus an error flag. The renderer shows the ArtifactReview panel with an error banner ("Artifact generation failed — your transcript is saved"). The FSM always advances to `Complete`; no new FSM states added.

### CitationValidator

- **D-09:** CitationValidator uses word-token Jaccard similarity: tokenize both the artifact claim text and the Stage 1 verbatim quote into lowercase word-tokens, score = |intersection| / |union|. Threshold: Jaccard ≥ 0.90 passes. No external library required — pure TypeScript.
- **D-10:** Per-item retry on CitationValidator failure: retry that artifact item's Stage 2 call up to 2 times with a more constrained prompt. After 2 failed retries, drop the item entirely (do not include an unverified claim in proposals). Log the drop with the reason for eval harness analysis (feeds into CGFS/EHR metrics in Phase 11).

### ArtifactReview UI

- **D-11:** Phase 8 ships a functional skeleton ArtifactReview panel — not the full polished design (that's Phase 9). The skeleton includes: proposed items grouped by artifact type (MOM, key points, summary, action items), a "Verify" toggle per item that reveals the verbatim quote anchor, confirm button, dismiss button, and inline textarea edit (click-to-edit, no modal). Sufficient to satisfy ART-08 and ART-09.
- **D-12:** The ArtifactReview panel renders when `SessionState === 'Complete'` in `App.tsx`. It replaces the `CapturingScreen` / processing spinner.

### Zod Schemas

- **D-13:** `src/shared/schemas/index.ts` (currently a stub) is fully implemented in Phase 8. Schemas include `TranscriptSegmentSchema`, `QuoteAnchorSchema`, `MoMSchema`, `SummarySchema`, `KeyPointSchema`, `ActionItemSchema`, and the top-level `MeetingArtifactsSchema`. `zod-to-json-schema` generates both OpenAI `json_schema` and Gemini `responseJsonSchema` from the same source. No hand-authored provider-specific schemas.

### Claude's Discretion

- **Specific LLM prompts:** System prompt design for Stage 1 (quote extraction instruction) and Stage 2 (artifact generation constrained to Stage 1 quotes) are left to the researcher/planner. The constraint ("Stage 2 may only reference Stage 1 quotes") must be explicit in the prompt, not implied.
- **Gemini structured output format:** Whether to use `response_mime_type: 'application/json'` + `response_schema` or the `openai` SDK's `response_format: { type: 'json_schema', json_schema: ... }` via `baseURL` — left to researcher to confirm the correct approach for Gemini 2.5 Flash via OpenAI-compatible endpoint.
- **Token counting:** tiktoken `cl100k_base` must be used for all token budget calculations (never character approximation). Researcher should confirm the correct encoding for Gemini 2.5 Flash or use `cl100k_base` as the conservative estimate.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 8: ArtifactPipeline" — goal, success criteria (5 items), ART-01–ART-11
- `.planning/REQUIREMENTS.md` §"Artifact Pipeline" — ART-01 through ART-11 with full acceptance criteria text

### AI faithfulness contract (MANDATORY — governs all LLM output)
- `.planning/phases/04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md` §1.2 — two-stage extraction contract, proposed-with-confirm absolute rule, CitationValidator spec
- `.planning/phases/04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md` §2.2 Pitfall 4 — EpochCompressor anti-pattern (Stage 1 MUST read transcript_segments, never summary_cards)

### Architecture & IPC contracts
- `.planning/phases/05-prd-finalization/05-ARCHITECTURE.md` — module map, `ArtifactPipeline` interface spec, `CitationValidator` module spec, IPC channel surface (§7: `artifact-proposals-ready`, `confirm-artifact`, `edit-artifact`, `dismiss-artifact`, `export-ics`)
- `src/preload/index.ts` — live contextBridge allowlist; `artifact-proposals-ready` (listen), `confirm-artifact`, `edit-artifact`, `dismiss-artifact`, `export-ics` (invoke) channels are pre-wired
- `src/main/session/SessionManager.ts` — FSM states; Phase 8 hooks into `Processing` state entry to run the pipeline, fires `pipeline-complete` when done
- `src/main/index.ts` lines 107–117 — current Processing state handler (stub to replace with real pipeline)

### Feature scope (MVP boundary)
- `.planning/phases/05-prd-finalization/05-FEATURE-SPEC.md` — D-01–D-10 MVP boundary; confirms .ics export (not Google/Outlook API) and proposed-with-confirm contract

### DB schema (artifact tables)
- `src/main/store/db.ts` — `artifacts`, `action_items` table DDLs; `status` check constraint (`'proposed'` | `'confirmed'` | `'dismissed'`); `citations_json` column on `action_items`

### Zod schema source of truth
- `src/shared/schemas/index.ts` — stub comment confirms "Full Zod schemas implemented in Phase 8"; this file is the single source of truth for all LLM structured outputs

### Privacy & token counting
- `.planning/phases/05-prd-finalization/05-PRD.md` §DEC-02 — Gemini paid plan only; no cloud upload of transcript data
- CLAUDE.md — `tiktoken cl100k_base` required; never character approximation

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/main/session/SessionManager.ts` — FSM with `Processing` state; Phase 8 replaces the stub pipeline-complete-on-stopCapture with real pipeline call. `onStateChange` hook at `Processing` entry is the injection point.
- `src/main/store/db.ts` — `artifacts` and `action_items` tables are already DDL'd. Phase 8 writes to both. `openDatabase()` returns the DB handle used throughout.
- `src/preload/index.ts` — `artifact-proposals-ready` (listen), `confirm-artifact`, `edit-artifact`, `dismiss-artifact`, `export-ics` (invoke) are all pre-wired in the allowlist. Phase 8 replaces stub handlers with real implementations.
- `src/main/index.ts` lines 149–152 — `confirm-artifact`, `edit-artifact`, `dismiss-artifact`, `export-ics` are stub `ipcMain.handle` registrations returning `undefined`. Phase 8 replaces these.
- `src/main/index.ts` lines 107–117 — `Processing` state handler: `stopCapture()` → `pipeline-complete`. Phase 8 inserts the artifact pipeline between these two steps.
- `src/shared/schemas/index.ts` — stub file waiting for Phase 8 schema definitions.

### Established Patterns
- **Main process owns all LLM/DB logic:** `ArtifactPipeline`, `CitationValidator`, and `LLMAdapter` all live in `src/main/artifacts/`. Renderer receives only push events and sends user actions via typed channels.
- **Module boundaries:** Follow `src/main/<domain>/` pattern. Phase 8 adds `src/main/artifacts/` directory with `ArtifactPipeline.ts`, `CitationValidator.ts`, `LLMAdapter.ts`, `IcsExporter.ts`.
- **Zod as single source of truth:** All LLM structured outputs defined in `src/shared/schemas/index.ts` as Zod schemas. `zod-to-json-schema` converts to provider format at runtime.
- **Proposed-with-confirm is absolute:** Every artifact item must be inserted with `status: 'proposed'`. No item ever changes status without explicit user action via IPC.

### Integration Points
- `src/main/index.ts` → `Processing` state entry → instantiate `ArtifactPipeline(db, win, meetingId)` → run pipeline → push `artifact-proposals-ready` → `session.transition('pipeline-complete')`
- `ArtifactPipeline` → reads `transcript_segments` by `meeting_id` → Stage 1 LLM call → Stage 2 × 4 parallel calls → `CitationValidator` per item → write to `artifacts` + `action_items` tables → return proposals payload
- `confirm-artifact` IPC → update `action_items.status` = `'confirmed'` in DB
- `export-ics` IPC → read confirmed `action_items` for `meeting_id` → `ics` package → write `.ics` file → return path to renderer

</code_context>

<specifics>
## Specific Ideas

- **`Promise.all` parallelism:** Stage 2 runs `await Promise.all([momCall, summaryCall, keyPointsCall, actionItemsCall])` — each call is a separate `LLMAdapter.generate()` invocation with a type-specific Zod schema and a type-specific prompt.
- **CitationValidator:** Pure TypeScript implementation, no library. Lowercase word tokenization (`text.toLowerCase().split(/\W+/).filter(Boolean)`), Jaccard score, threshold ≥ 0.90. Drop items that fail after 2 retries; log reason as `{ item_id, artifact_type, attempts, final_score }` for Phase 11 eval harness.
- **ArtifactReview grouping:** Rendered as accordion sections per artifact type (MOM | Key Points | Summary | Action Items). Each section lists proposed items. "Verify" toggle expands an inline quote block beneath the item text. Confirm/Dismiss buttons inline per item. Edit = click on item text to activate inline textarea.
- **Error banner:** On pipeline failure, `artifact-proposals-ready` payload includes `{ error: true, message: 'Artifact generation failed — your transcript is saved', proposals: [] }`. ArtifactReview renders the error message prominently with a "Transcript saved" reassurance.
- **.ics export scope:** Only confirmed `action_items` with a `due_date` field populated are included in the `.ics` export (items without due dates are skipped with a note to the user). The `ics` package handles the file generation; renderer receives the output file path and triggers a native save dialog via Electron `dialog.showSaveDialog`.

</specifics>

<deferred>
## Deferred Ideas

- **Streaming artifact delivery** — pushing each artifact type to the renderer as its Stage 2 call completes (before all 4 finish). Better perceived UX but complex renderer state management. Deferred to Phase 9 overlay redesign if needed.
- **Action items without due dates in .ics** — more sophisticated handling (e.g., creating all-day events or reminders without a due date). Deferred to v2; Phase 8 skips undated items.
- **Named speaker attribution in MOM** — replacing "Speaker 1/2/3" with real names in the artifacts. Deferred to v2 (needs name-confirmation UX, out of Phase 8 scope).
- **Eval corpus seeding** — starting to build the eval harness corpus in Phase 8 (noted as advisable in STATE.md blockers). The CGFS/EHR gate is Phase 11 but early corpus seeding reduces Phase 11 risk. Flag for researcher to recommend whether Phase 8 should include lightweight eval fixture creation.

</deferred>

---

*Phase: 8-ArtifactPipeline*
*Context gathered: 2026-06-27*
