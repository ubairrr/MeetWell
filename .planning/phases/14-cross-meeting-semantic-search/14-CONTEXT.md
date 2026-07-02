# Phase 14: Cross-Meeting Semantic Search - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can search across their entire meeting history — including meetings recorded before this milestone — through a dedicated search panel. Each result shows the matching quote, the source meeting's name/date, and the correctly-attributed speaker (reflecting any Phase 12 renames). Pre-milestone meetings are backfilled into the search index, and every indexed chunk records which embedding model/version produced it.

Covers requirements SRCH-01, SRCH-02, SRCH-03, SRCH-04, SPKR-04.

</domain>

<decisions>
## Implementation Decisions

> **Note on confidence:** D-02 was explicitly confirmed by the user in discussion. D-01, D-03, D-04 are Claude's recommended defaults — the user was unavailable to confirm them interactively (AskUserQuestion timed out 3 times with no response). They are reasoned from the codebase constraints found during scouting (see `code_context`) and should be treated as a strong starting point, not a hard lock. Flag for a quick user review before/during planning if anything looks off.

### Chunking & embedding storage
- **D-01 (recommended default, unconfirmed):** Build a **new, separate chunking path** dedicated to search — do not repurpose the existing `vec_chunks` table written by `EpochCompressor`. Those chunks are epoch-level (rolling 800K-token compression during live capture), have `speaker_label` hardcoded to the literal string `'epoch'`, and store a synthesized key-points blurb rather than a verbatim quote. They satisfy `ContextEngine`'s live-grounding need but fail SRCH-02's "matching quote + real speaker" bar outright.
  - New chunks are built from `transcript_segments` directly (verbatim `text`, real `speaker_label`), grouped by speaker turn or a bounded sliding window — chunking granularity is Claude's discretion at planning/implementation time.
  - Store these in a **new virtual table** (e.g. `vec_search_chunks`), not by altering `vec_chunks`. Reasoning: `vec_chunks` is a `vec0` virtual table (`CREATE VIRTUAL TABLE ... USING vec0(...)`); the project's only precedent for schema evolution (`runMigrations` in `src/main/store/db.ts`, used for Phase 13's `meeting_type` column) is `ALTER TABLE ... ADD COLUMN` on ordinary tables — `vec0` virtual tables do not reliably support `ALTER TABLE ADD COLUMN` the same way. A new table sidesteps that entirely and lets `model_version` (SRCH-04) be defined as a column at `CREATE VIRTUAL TABLE` time.
  - `vec_search_chunks` must include a `model_version` (or `embedding_model`) auxiliary column, populated from `EmbeddingAdapter`'s model constant at write time — this is what satisfies SRCH-04 ("never mixing incompatible embeddings"). Query-time filtering/joining by model_version so a future model change doesn't silently mix old and new vectors in one result set.
  - `EpochCompressor` and `vec_chunks` are **untouched** by this phase — live in-meeting grounding (`ContextEngine`) keeps using its existing coarse chunks; search is fully additive.

### Backfill
- **D-02 (confirmed by user):** Backfill is **manual, triggered via a toggle switch** (not an auto-run job, not a plain button). Location: most naturally `SettingsPanel.tsx` alongside existing settings toggles (exact placement/copy is Claude's discretion). Turning the toggle on kicks off indexing of every meeting missing `vec_search_chunks` rows (covers both true pre-milestone meetings and any meeting whose only chunks are the coarse `epoch` ones from D-01). Progress/completion feedback while indexing is Claude's discretion (e.g. toggle shows a spinner/label state, or a small progress line) — no requirement for a dedicated progress bar UI.

### Search panel UI
- **D-03 (recommended default, unconfirmed):** Follow the existing `SettingsPanel` pattern exactly — a new icon/button next to the gear icon in the overlay chrome (`App.tsx`'s `overlay-root` header area) toggles a full-overlay modal panel within the existing single 380px-wide `BrowserWindow` (no second window — there is no precedent for multi-window management anywhere in the app today). Panel contents: a query input at top, a scrollable result list below. Each result card shows the matching verbatim quote, the source meeting's title/date, and the resolved speaker display name (via the existing `speaker_aliases` read-time-resolution pattern from Phase 12 — not re-decided here, already locked at project level). Exact availability across session states (Idle-only like Settings, or also from other non-`Capturing` states) is Claude's discretion — default to matching `SettingsPanel`'s existing availability.

### Result scope & ranking
- **D-04 (recommended default, unconfirmed):** Return the top 10 nearest chunks by cosine similarity, above a minimum similarity floor (so an unrelated query returns "no results" rather than noise). No date-range or per-meeting filter UI in this phase — keep the panel to query-in, ranked-results-out. Sort strictly by relevance (no secondary sort).

### Claude's Discretion
- Exact chunk boundary strategy for `vec_search_chunks` (per-speaker-turn vs. bounded sliding window over `transcript_segments`) — pick whichever produces cleaner, more self-contained quotes.
- Exact backfill batching/throttle strategy (one meeting at a time vs. small batches) so it doesn't compete with a live in-progress capture session for main-process resources.
- Toggle placement, copy, and progress-feedback treatment in `SettingsPanel.tsx`.
- Search panel's exact availability across `SessionState` values beyond Idle.
- Similarity-floor threshold value — pick a sane default (e.g. cosine ≥ 0.3) and make it easy to tune later if eval reveals it's off.
- Whether `vec_search_chunks` needs its own index/table naming to avoid confusion with `vec_chunks` in code — naming clarity is important since two chunk types now coexist for different purposes.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product & requirements
- `.planning/PROJECT.md` — v3.0 milestone framing; "EmbeddingAdapter infrastructure-only in v1" note (this phase is the first to actually query embeddings, not just write them)
- `.planning/REQUIREMENTS.md` — SRCH-01 through SRCH-04, SPKR-04 (Cross-Meeting Semantic Search section); note SPKR-04 is deliberately mapped to this phase, not Phase 12, since it can't be observed until the search panel exists
- `.planning/ROADMAP.md` §"Phase 14: Cross-Meeting Semantic Search" — goal, success criteria, depends-on Phase 12 (speaker-resolution reuse)
- `.planning/STATE.md` — Active Decisions and Critical Anti-Patterns to Enforce

### Architecture
- `.planning/phases/05-prd-finalization/05-ARCHITECTURE.md` — DB DDL conventions, IPC contract conventions (channel typing, contextBridge allowlist pattern for the new search-query channel)
- `.planning/phases/04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md` — two-stage extraction / grounding contract context (relevant background for why chunks must carry verbatim text, not synthesized summary, to support faithful citation in Phase 15's chat)

### Prior-phase context (patterns this phase must reuse, not re-decide)
- `.planning/phases/12-named-speaker-attribution/12-CONTEXT.md` — `speaker_aliases` read-time-resolution pattern (D-01–D-08); search results MUST resolve speaker labels the same way ArtifactReview/citations do, never a second mechanism
- `.planning/phases/13-meeting-type-artifact-templates/13-CONTEXT.md` — schema-evolution/migration precedent (`runMigrations` in `src/main/store/db.ts`, `ALTER TABLE ... ADD COLUMN` wrapped in duplicate-column try/catch) — this phase's `vec_search_chunks` table creation is the next case in that lineage, explicitly anticipated by 13-CONTEXT.md's code_context section

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/main/llm/EmbeddingAdapter.ts` — `embed(text: string): Promise<Float32Array>`, Gemini `gemini-embedding-001`, 1536 dimensions, dimension-mismatch guard already implemented. Reuse directly for backfill and live query-time embedding — do not re-implement.
- `src/main/context/EpochCompressor.ts:196-223` — closest existing precedent for "embed text → write a `vec_chunks`-style row" pattern (concatenate text, call `embedding.embed()`, assert length, `INSERT INTO ... VALUES (?, ...)` with `new Float32Array(vector)` as the first bound param). Copy this shape for the new `vec_search_chunks` writer, adapted for verbatim per-turn text instead of synthesized epoch summaries.
- `src/renderer/src/components/SettingsPanel.tsx` + `App.tsx:230,248` (`showSettings` state, gear-icon toggle button, `{showSettings && <SettingsPanel onClose={...} />}` rendered inside every `overlay-root` variant) — exact pattern to replicate for the new search panel's toggle/render wiring.
- `.planning/phases/12-named-speaker-attribution/` implementation — `speaker_aliases` table + resolution logic (`SpeakerAliasStore`) for rendering renamed speakers in results.

### Established Patterns
- IPC channels are allowlisted in `src/preload/index.ts` (`INVOKE_CHANNELS` / `LISTEN_CHANNELS` arrays) — new channels (e.g. `search-meetings`, `start-backfill`, `backfill-progress`) must be added there before use.
- Schema evolution for already-shipped tables goes through `runMigrations()` in `src/main/store/db.ts`, called after `ALL_DDLS` inside `openDatabase()` — wrapped `ALTER TABLE` calls that swallow "duplicate column name" errors for idempotency. New table creation (`vec_search_chunks`) should live in `ALL_DDLS` itself (`CREATE VIRTUAL TABLE IF NOT EXISTS`), since it's a net-new table, not a column addition to an existing one.
- `sqlite-vec` extension is loaded once via `sqliteVec.load(db)` in `openDatabase()` Step 3, before `ALL_DDLS` executes — any new `vec0` virtual table automatically benefits from this, no separate load call needed.

### Integration Points
- `src/main/store/db.ts:40-46` — existing `vec_chunks` DDL, the direct model for `vec_search_chunks`'s DDL shape (same `float[1536]` embedding column, similar `+`-prefixed auxiliary columns, plus a new `+model_version TEXT` column).
- `src/main/context/ContextEngine.ts` — consumer of `vec_chunks` for live grounding; confirms `vec_chunks` must stay untouched/reserved for that purpose per D-01.
- `src/main/index.ts:172` (`new EmbeddingAdapter(geminiApiKey, ...)`) — where the adapter is already constructed at app startup; the new backfill/search-query code paths should receive/reuse this same instance rather than constructing a second one.

</code_context>

<specifics>
## Specific Ideas

No specific visual mockups given. Backfill trigger should be a toggle switch, not a button (D-02, user-confirmed). Otherwise open to standard approaches following `SettingsPanel`'s existing visual conventions.

</specifics>

<deferred>
## Deferred Ideas

- **Date-range / per-meeting filter UI for search results** — considered during D-04 discussion; deferred to keep the v1 panel to query-in/ranked-results-out. Revisit if users want to narrow scope beyond relevance ranking.
- **Separate resizable search window** — considered during D-03 discussion; rejected in favor of the existing single-overlay-window pattern to avoid introducing new window-management surface area. Revisit only if the narrow 380-600px overlay proves too cramped for result browsing in practice.
- **Live citations grounded in cross-meeting search** — that's Phase 15 (Live Assistant Interactive Chat), which explicitly depends on this phase's search backbone. Not re-litigated here.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 14-cross-meeting-semantic-search*
*Context gathered: 2026-07-02*
