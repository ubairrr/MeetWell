# Project Research Summary

**Project:** MeetingAssist — v3.0 "Advanced Assistant Features" milestone
**Domain:** AI meeting assistant (Electron desktop) — adding named speaker attribution, live grounded chat, cross-meeting semantic search, and meeting-type templates to a shipped v1/v2.0 product
**Researched:** 2026-07-01
**Confidence:** HIGH

## Executive Summary

This milestone adds four features to an already-shipped, faithfulness-first Electron meeting assistant: manual speaker relabeling, an in-overlay live chat grounded in meeting content, cross-meeting semantic search, and meeting-type-specific artifact templates (Standup/1:1/Planning). The critical finding across all four research files is that almost none of this requires new infrastructure — `EmbeddingAdapter` (Gemini `gemini-embedding-001`), `LLMAdapter.stream()`, `ContextEngine.getContext()`, and the `vec_chunks` table already exist in the codebase but are either unused in production or only exercised for a rare edge case (the 560K-token `EpochCompressor` threshold, which normal meetings never reach). The work is activating and orchestrating existing plumbing, not building new subsystems — with one exception: `vec_chunks` needs a schema change (`chunk_type`, `model_id` columns) that must be resolved as a `vec0` virtual-table migration question before any indexing code is written.

The recommended approach is dependency-ordered, not effort-ordered: build Named Speaker Attribution first (fully independent, cheapest, validates the "new domain folder + IPC pair" pattern), then Meeting-Type Templates (also independent, zero FSM risk), then Cross-Meeting Semantic Search (the riskiest single decision — the `vec_chunks` schema/backfill problem — but a hard prerequisite), and only then Live Assistant Chat, since its differentiating cross-meeting-grounding capability is meaningless without the search backbone already in place.

The single largest risk category is faithfulness-contract erosion: this product's entire value proposition is a trustworthy, citation-backed record, and three of the four features have a plausible-but-wrong shortcut that quietly breaks that contract — chat answering from raw context with no evidence-extraction step, speaker relabeling mutating `speaker_label` in place instead of resolving at read time, and meeting-type Stage 1 extraction becoming template-aware and pre-filtering evidence. A second major risk is shipping cross-meeting search against an effectively empty index, since pre-milestone meetings were never embedded and a backfill job is not automatically implied by "the feature works for new meetings." Mitigating both categories is mostly a matter of explicit phase-level guardrails rather than novel engineering.

## Key Findings

### Recommended Stack

No new core dependencies are required for embeddings, LLM streaming, or schema structuring — all three already have a working, tested implementation in the codebase (`EmbeddingAdapter`, `LLMAdapter.stream()`, per-purpose Zod schemas). The only new npm packages are `react-markdown` 10.1.0 + `remark-gfm` 4.0.1 for rendering LLM markdown output in the chat panel (and retroactively, MOM rendering). A critical structural constraint: OpenAI/Gemini strict-mode structured outputs reject a root-level `anyOf`/`oneOf`, so meeting-type template schemas must be selected in application code (the meeting type is already known at session start) — never via `z.discriminatedUnion` passed to `zodResponseFormat`.

**Core technologies:**
- `gemini-embedding-001` via existing `EmbeddingAdapter` (Matryoshka-truncated to 1536 dims) — for both card-level and meeting-level embeddings; no new provider, no second API key, keeps DEC-02's single-paid-provider constraint intact
- `react-markdown` + `remark-gfm` — chat response rendering; default HTML-escaping avoids any XSS surface from untrusted LLM output in a privileged Electron renderer
- Flat, per-meeting-type Zod schemas selected by application code (not a discriminated union) — consistent with the codebase's existing "many small per-purpose schemas" convention
- Custom `useLiveChat()` IPC hook (not Vercel AI SDK `useChat`) — the app's LLM calls happen in the main process, reaching the renderer only via typed IPC, not an HTTP stream

### Expected Features

Four features, researched against Otter.ai, Fireflies.ai, Fathom, and related competitors. MeetingAssist already has the hard infrastructure (SQLCipher + `sqlite-vec`, two-stage citation validation) that most competitors are still building toward — the gap is specifically these UI/product layers.

**Must have (table stakes):**
- Manual speaker relabel, per-meeting scope, propagating to every downstream artifact/citation/export at read time
- Meeting-local live chat (current-meeting grounding), with response citations, before attempting cross-meeting grounding
- Cross-meeting semantic search with result snippets showing matching quote + meeting/date/speaker
- Meeting type selected at session start (not inferred), each mapping to a genuinely distinct output schema (not just relabeled fields), with a generic-template fallback

**Should have (competitive):**
- Cross-meeting-grounded chat answers with visible source/provenance (the feature none of Otter/Fathom/Grain meaningfully replicate; Fireflies AskFred is the closest comparator)
- "Summarize the last N minutes" as a first-class quick action
- Type-specific extraction prompts, not just output schemas, per meeting type

**Defer (v2+):**
- Voiceprint-based automatic speaker identification — explicit anti-feature (biometric/consent risk, contradicts proposed-with-confirm ethos), not merely deferred
- Fully custom user-defined artifact templates beyond the 3 fixed types
- Chat-triggered auto-actions (auto-scheduling, auto-writing external systems) — blocked by the absolute proposed-with-confirm contract
- "Remember this speaker" named-profile picker, bulk speaker merge, search filters by type/date, type-aware live summary cards — all P2/P3, add after validating the P1 core slice

### Architecture Approach

Every new feature attaches to the existing `src/main/<domain>/` convention (new `speakers/`, `search/`, `chat/` folders) without modifying the `SessionManager` FSM's states or transitions. Speaker aliasing is a pure display-time resolution layer (new `speaker_aliases` table, resolved at render time — `transcript_segments.speaker_label` stays immutable). Cross-meeting search requires a new `MeetingIndexer` that embeds every meeting at `Processing` state (not gated behind the rare `EpochCompressor` threshold), writing into a `vec_chunks` table that must first be recreated (not `ALTER TABLE`'d) with new `chunk_type`/`model_id` columns since `vec_chunks` is a `sqlite-vec` virtual table with uncertain `ALTER TABLE` support. Live chat is pure orchestration reusing two already-built-but-dormant pieces — `ContextEngine.getContext()` and `LLMAdapter.stream()` — plus a new `SemanticSearchService` for cross-meeting grounding. Meeting-type templates are a schema-registry lookup inside `ArtifactPipeline`'s existing Stage 2, keyed by a new `meetings.meeting_type` column threaded through from session start as a plain payload field — never a new FSM state.

**Major components:**
1. `SpeakerAliasStore` + `resolveSpeaker()` — CRUD for alias mapping and pure read-time display transform, never touching `transcript_segments`
2. `MeetingIndexer` + `SemanticSearchService` — universal end-of-meeting embedding writer and KNN query reader over `vec_chunks`
3. `LiveChatService` — orchestrates `ContextEngine` (current meeting) + `SemanticSearchService` (past meetings, `excludeMeetingId` mandatory) into one grounded, streamed answer
4. Meeting-type template registry (`pipeline/templates/*.ts`) — one Zod schema + Stage 2 prompt per type, consulted by an otherwise-unchanged shared Stage 1

### Critical Pitfalls

1. **Speaker label is duplicated by value and by JSON key across 5+ tables/blobs** — relabeling only `transcript_segments` leaves summary cards, epoch summaries, action items, and frozen artifact `content_json` stale. Avoid by never mutating `speaker_label` anywhere; add a `speaker_mappings`/`speaker_aliases` table scoped by `(meeting_id, original_label)` and resolve at every read/export path.
2. **Chat bypassing the two-stage faithfulness contract** — the single highest-stakes pitfall, since chat is the surface where users are most likely to trust an authoritative-sounding answer without visible evidence. Avoid by reusing the Stage 1 (evidence extraction) → Stage 2 (constrained generation) pattern for chat, with per-answer citations and an explicit "no information found" fallback rather than falling back to parametric knowledge.
3. **Cross-meeting search shipping against an empty vector index** — `vec_chunks` is empty for every pre-milestone meeting; without an explicit backfill job the feature appears broken for a user's entire existing history. Avoid by treating backfill as a first-class deliverable with a visible "Indexing your meeting history…" state, not a silent afterthought.
4. **`artifacts.artifact_type` CHECK constraint cannot be extended via `ALTER TABLE`** — SQLite requires a full table-rebuild migration for CHECK constraint changes. Avoid by keeping the existing 5 artifact types and modeling meeting-type variance inside `content_json` + a new `meetings.meeting_type` column instead of adding new enum values.
5. **Template-aware Stage 1 extraction quietly re-introduces fabrication risk** — making evidence extraction "smart" about the target template turns Stage 1 into a filtering/paraphrasing step, undermining independent auditability. Avoid by keeping exactly one universal, template-agnostic Stage 1 contract; only Stage 2's schema/prompt varies by `meeting_type`.

## Implications for Roadmap

Based on research, suggested phase structure (also independently derived as the "Suggested Build Order" in ARCHITECTURE.md — both agree):

### Phase 1: Named Speaker Attribution
**Rationale:** Fully independent of the other 3 features; cheapest and lowest-risk; validates the "new domain folder + new IPC pair" pattern the remaining phases will repeat.
**Delivers:** Per-meeting manual speaker relabel UI, propagated to all downstream artifacts/exports/search results at read time.
**Addresses:** Table-stakes inline rename + rename-propagates-everywhere from FEATURES.md Feature 1.
**Avoids:** Speaker label duplication across tables/JSON blobs; treating diarization labels as stable cross-meeting identities. Both require `speaker_aliases` scoped by `(meeting_id, original_label)` and read-time resolution only.

### Phase 2: Meeting-Type Artifact Templates
**Rationale:** Independent of Phases 1 and 3; only lightly benefits from Phase 1. Validates carrying new session-start data through to `Capturing` with zero FSM changes.
**Delivers:** Meeting type selector (default `general`, optional/non-blocking) at session start; 3 fixed Zod schema + Stage 2 prompt variants (Standup/1:1/Planning) selected via a template registry; unchanged shared Stage 1.
**Addresses:** FEATURES.md Feature 4 — distinct output structure per type, default fallback preserved.
**Avoids:** CHECK-constraint wall (model variance in `content_json`, not new `artifact_type` values); template-aware Stage 1; mandatory blocking picker adding friction before the consent gate.

### Phase 3: Cross-Meeting Semantic Search
**Rationale:** Must precede Phase 4 — Feature 2's differentiating cross-meeting grounding has a hard dependency on this retrieval backbone existing. Also the single riskiest schema decision in the milestone (the `vec_chunks` virtual-table migration), so it should be resolved and de-risked before Phase 4 starts, not discovered mid-feature.
**Delivers:** Resolved `vec_chunks` schema (recreated with `chunk_type`, `model_id` columns), `MeetingIndexer` (universal per-meeting embedding, not gated behind the rare `EpochCompressor` threshold), `SemanticSearchService` (KNN query), `SemanticSearchPanel.tsx` + `HistoricalMeetingView.tsx`, and a first-class backfill job for pre-milestone meetings.
**Uses:** Existing `EmbeddingAdapter`/`gemini-embedding-001`, existing `vec_chunks` table (schema-migrated), existing `tiktoken`-based chunking pattern from `EpochCompressor`.
**Implements:** `main/search/` domain.
**Avoids:** Empty index / missing backfill; mixed/incompatible embedding providers (track `model_id` per chunk, enforce single provider).

### Phase 4: Live Assistant Interactive Chat
**Rationale:** Depends on Phase 3 for cross-meeting grounding; reuses `ContextEngine.getContext()` and `LLMAdapter.stream()` (both already built, currently dead code) for current-meeting grounding and the model call. Lowest new-plumbing risk of the four, but must ship last due to the Phase 3 dependency.
**Delivers:** `LiveChatService` (two-source grounding: `ContextEngine` + `SemanticSearchService` with mandatory `excludeMeetingId`), `LiveChatPanel.tsx` tabbed alongside `LiveSummaryBoard`, chat message persistence (`ChatMessageStore`), citation/source-chip rendering reusing Phase 3's provenance component.
**Uses:** `react-markdown` + `remark-gfm` for response rendering; existing `LLMAdapter.stream()`.
**Implements:** `main/chat/` domain.
**Avoids:** Bypassing the two-stage faithfulness contract (reuse evidence-extraction-then-constrained-generation); unbounded context/token growth from a second concurrent LLM consumer; concurrent LLM calls from chat + `SummaryCardTimer` contending on the single main process (needs a request queue/serialization).

### Phase Ordering Rationale

- Dependency correctness dominates: cross-meeting search (Phase 3) must exist before live chat's differentiating capability (Phase 4) can be built at all — this is the single most load-bearing sequencing finding across both FEATURES.md and ARCHITECTURE.md.
- Risk-reduction ordering within the independent pair: Phases 1 and 2 are both low-risk, disjoint-file, parallelizable phases that validate new architectural patterns (new domain folder + IPC pair; new session-start payload field) before the riskiest single decision in the milestone (the `vec_chunks` virtual-table schema change in Phase 3).
- Shared component reuse: the citation/provenance rendering component needed by chat (Phase 4) and search (Phase 3) should be designed once and consumed by both, not duplicated.
- Faithfulness-contract discipline governs internal phase design more than external ordering: every phase that generates or displays LLM-derived content (2, 3, 4) must explicitly re-apply this product's existing two-stage extraction / display-time-resolution disciplines rather than treating the new feature as exempt because it's "just a UI addition."

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Cross-Meeting Semantic Search):** Confirm `sqlite-vec` 0.1.9's actual support (or lack thereof) for `ALTER TABLE ADD COLUMN` on `vec0` virtual tables, and confirm the exact KNN query syntax (`MATCH` + `k = N` vs. `ORDER BY distance LIMIT N`) at this pinned version, before writing `MeetingIndexer`/`SemanticSearchService`. This is flagged as the single highest-uncertainty implementation detail in the entire milestone.
- **Phase 4 (Live Assistant Chat):** Short research/verification pass on `LLMAdapter.stream()`'s untested-in-production usage-accounting path (`finalChatCompletion()`) — confirm it doesn't throw or double-count tokens under a real streaming session before wiring it into the existing token-usage summary.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Named Speaker Attribution):** Straightforward extension of the existing "new domain folder + new IPC pair" convention; no new libraries, no schema-migration risk (plain table).
- **Phase 2 (Meeting-Type Templates):** New column + registry lookup, following the existing per-purpose Zod schema convention; zero FSM risk (confirmed no new states/transitions needed).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Embedding/LLM path is existing, tested, directly-read code; new UI libraries (`react-markdown`, `remark-gfm`) and the strict-mode `anyOf` constraint are cross-checked against npm registry + multiple independent web sources |
| Features | MEDIUM | Web-search corroborated across 3-5 independent sources per competitor feature; no official API/pricing-doc access or direct competitor product trials |
| Architecture | HIGH | Grounded directly in the actual `src/` tree (not just the original PRD docs), which was found to have drifted from the PRD in load-bearing ways (extra IPC channels, `EmbeddingAdapter` already wired into `EpochCompressor`) — all recommendations anchored to real files, not stale spec assumptions |
| Pitfalls | HIGH (internal) / MEDIUM (external) | Architecture/contract-derived pitfalls are grounded in the actual current DB DDL and the AI-SPEC faithfulness contract; general RAG/embedding/SQLite claims are corroborated by external sources but not project-specific |

**Overall confidence:** HIGH

### Gaps to Address

- **`vec_chunks` virtual-table migration mechanics:** whether `sqlite-vec` 0.1.9 supports `ALTER TABLE ADD COLUMN` on a `vec0` table is unverified — must be confirmed as a first sub-step of Phase 3 before any indexer/search code is written, since it decides whether a drop-and-recreate migration or an in-place alter is used.
- **`LLMAdapter.stream()` production readiness:** this method exists and is used by nothing in production today; its usage-accounting path is unexercised under real streaming traffic and should be verified early in Phase 4, not discovered at ship time.
- **Concurrency behavior between chat and `SummaryCardTimer`:** no existing test coverage exists for two concurrent main-process LLM calls; Phase 4 planning should treat "chat fires while a 5-minute summary tick is in flight" as a required integration test scenario, not an edge case to skip.
- **Embedding backfill scope/cost:** the exact volume of pre-milestone meetings needing backfill (and associated Gemini API cost/latency) is not quantified in research — should be sized against the actual current meeting count before Phase 3 implementation.

## Sources

### Primary (HIGH confidence)
- Direct codebase read: `src/main/llm/EmbeddingAdapter.ts`, `src/main/llm/LLMAdapter.ts`, `src/shared/schemas/index.ts`, `src/main/context/ContextEngine.ts`, `src/main/context/EpochCompressor.ts`, `src/main/session/SessionManager.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/main/store/db.ts`, `src/main/pipeline/ArtifactPipeline.ts`, `src/main/capture/SpeakerNormalizer.ts`
- `.planning/phases/05-prd-finalization/05-ARCHITECTURE.md` — locked project spec (baseline, cross-checked against actual code and found to have drifted in places)
- `.planning/milestones/v1.0-phases/04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md` — faithfulness contract, `CitationAnchorSchema`, two-stage extraction mandate
- `.planning/PROJECT.md` — v3.0 milestone scope
- SQLite ALTER TABLE docs (sqlite.org/lang_altertable.html) — CHECK constraints cannot be added/modified via ALTER TABLE

### Secondary (MEDIUM confidence)
- npm registry version checks for `react-markdown`, `remark-gfm`, `zod`, `zod-to-json-schema`, `openai`
- OpenAI structured-outputs docs + `openai-node` GitHub issues #995/#1709 — root-level `anyOf`/`oneOf` restriction, `zod` 4.1.13+ discriminated-union regression
- Competitor feature research: Otter.ai, Fireflies.ai (AskFred), Fathom, Fellow help docs/blogs
- Mindee (RAG hallucinations), Weaviate ("When Good Models Go Bad") — general RAG/embedding failure modes

### Tertiary (LOW confidence)
- alexgarcia.xyz/sqlite-vec docs on KNN/auxiliary-column semantics — needs direct verification against pinned 0.1.9 behavior before Phase 3 implementation

---
*Research completed: 2026-07-01*
*Ready for roadmap: yes*
