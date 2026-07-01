# Phase 10: ContextEngine + Break Assist - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-28
**Phase:** 10-ContextEngine + Break Assist
**Areas discussed:** Epoch boundaries, ContextComposer wiring scope, Embedding strategy for vec_chunks, Break digest + 60-min test scope

---

## Epoch Boundaries

| Option | Description | Selected |
|--------|-------------|----------|
| Token-count window | Epoch = oldest N tokens of transcript_segments. Fires at 560K threshold. | ✓ |
| Time-based window | Epoch = fixed time slice (e.g., 20 minutes of segments). | |
| Segment-count window | Epoch = every N transcript_segments rows. | |

**User's choice:** Token-count window (Recommended)
**Notes:** Oldest ~200K tokens compressed per pass (enough to bring rolling window below 50% capacity). Planner to determine exact N at compression time.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Oldest ~200K tokens | Compress oldest 200K tokens. Leaves ~360K rolling window. | ✓ |
| Oldest ~280K tokens | Compress half the context. | |
| You decide | Leave to planner per AI-SPEC. | |

**User's choice:** Oldest ~200K tokens (Recommended)

---

| Option | Description | Selected |
|--------|-------------|----------|
| LLM-generated prose summary | Dense paragraph per epoch. | |
| Structured JSON (Zod schema) | EpochSummarySchema: decisions[], action_items[], key_points[], speaker_contributions. | ✓ (via PRD) |
| You decide | Leave to planner. | |

**User's choice:** "check the prd planning files, there was RAG implementation for the epoch compression"
**Notes:** AI-SPEC §2.5 specifies structured EpochSummarySchema. Epoch embedding via text-embedding-3-small (OpenAI) or Gemini fallback. User resolved by pointing to PRD authority.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Add OpenAI key field to SettingsPanel | User provides OpenAI key; fallback to Gemini embedding if absent. | |
| Gemini embedding only for v1 | Use Gemini text-embedding via openai SDK baseURL. No new key field. | ✓ |
| You decide | Leave to planner. | |

**User's choice:** No — Gemini embedding only for v1

---

## ContextComposer Wiring Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Add LLM narrative above the cards | ContextComposer assembles break-window context; LLM call produces "While you were away" narrative; BreakAssistDigest shows narrative + cards. | |
| Cards only, per Phase 9 decision | Keep Phase 9 "no extra LLM call" decision. ContextComposer tested in isolation. | |
| You decide | Leave to planner. | |

**User's choice:** "context composer is for the live assistant"
**Notes:** ContextComposer is v2 infrastructure for the Live Assistant chat UI. Break Assist stays as Phase 9 built it (cards only, no LLM narrative). This is the authoritative decision.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Cards-only always | Break digest shows only summary cards. Epoch summaries are not displayed. | ✓ |
| Cards + epoch summaries if any exist | Digest shows epoch summaries too if compressed during break (rare edge case). | |
| You decide | Leave to planner. | |

**User's choice:** Cards-only always (Recommended)

---

## Break Digest + 60-Min Test Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Vitest unit test | Synthetic fixture in src/main/context/__tests__/. Same runner as unit tests. | ✓ |
| Standalone script | Separate ts-node script outside Vitest. Isolated like Phase 11 eval harness. | |
| You decide | Leave to planner. | |

**User's choice:** Vitest unit test (Recommended)

---

**Scope clarification:** User asked "are we making the context pipeline and RAG in this phase?"
**Answer confirmed:** Phase 10 builds full context pipeline (ContextEngine + TokenMonitor + EpochCompressor + ContextComposer) AND epoch embedding storage in vec_chunks (first half of RAG). RAG retrieval (vec_chunks semantic query) is v2 only.

---

## Claude's Discretion

- Gemini embedding model name and `output_dimensionality` parameter (researcher to confirm 1536-dim support)
- Exact N of segments to evict per epoch (TokenMonitor calculates at compression time to hit <50%)
- ContextEngine internal architecture (how it orchestrates SummaryCardTimer, TokenMonitor, EpochCompressor, ContextComposer)

## Deferred Ideas

- "While you were away" LLM narrative digest — AI-SPEC §2.9 feature; deferred to v2 when ContextComposer is wired into the Live Assistant
- RAG retrieval (vec_chunks semantic search) — v2 Live Assistant; vec_chunks is populated in v1 but never queried
- Cross-meeting search UX — post-launch v2
