---
phase: 04-ai-grounding-context-spec-ai-spec
plan: "01"
subsystem: ai-spec
tags:
  - faithfulness
  - grounding
  - context-engine
  - zod-schemas
  - extraction
  - artifact-pipeline
dependency_graph:
  requires:
    - ".planning/phases/04-ai-grounding-context-spec-ai-spec/04-CONTEXT.md"
    - ".planning/phases/04-ai-grounding-context-spec-ai-spec/04-RESEARCH.md"
    - ".planning/phases/03-deep-research/03-RSCH-05-DATA-MODEL.md"
  provides:
    - ".planning/phases/04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md §Section 1 (Faithfulness Contract)"
    - ".planning/phases/04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md §Section 2 (ContextEngine Architecture)"
  affects:
    - "Phase 5 PRD — ArtifactPipeline spec"
    - "Phase 5 PRD — ContextEngine + SessionManager FSM spec"
    - "Build milestone testing strategy (GRND-03, authored in Plan 02)"
tech_stack:
  added:
    - "Zod schema definitions: CitationAnchorSchema, ActionItemSchema, DecisionSchema, ExtractedDateSchema, KeyPointSchema, MeetingArtifactsSchema, SummaryCardSchema, EpochSummarySchema"
    - "tiktoken (cl100k_base) as the mandatory token counting implementation"
    - "text-embedding-3-small (1536d) as default epoch embedding model; Ollama local alternative for privacy mode"
  patterns:
    - "Two-stage quote-backed extraction protocol (evidence-first anchor extraction, then constrained generation)"
    - "One-schema-two-providers: Zod → zodToJsonSchema → OpenAI strict JSON schema / Gemini responseJsonSchema"
    - "Map-reduce ArtifactPipeline: parallel per-interval chunk extractions → single deduplication reduce"
    - "Speed 1 / Speed 2 two-speed processing: always-on passive path + on-demand LLM path"
    - "Proposed-with-confirm UX gate: status:proposed until explicit user confirm; no auto-write to external systems"
key_files:
  created:
    - ".planning/phases/04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md"
  modified: []
decisions:
  - "Two-stage extraction runs as two separate LLM calls in v1 (cleaner separation; collapse to chain-of-thought only if latency is measured problem)"
  - "tiktoken cl100k_base is the rolling window token counter — no character-based approximation"
  - "Epoch compression trigger at 70% of 800K ceiling = 560K tokens (fires before full, not at 100%)"
  - "text-embedding-3-small (1536d) as default epoch embedding; privacy mode uses Ollama via same baseURL adapter"
  - "Epoch compression uses Gemini 2.5 Flash Lite (internal/cost-optimized); summary cards and end-of-meeting batch use Gemini 2.5 Flash (user-facing quality)"
  - "Mid-interval meeting end: final partial interval processed as a full map chunk; reduce step handles deduplication"
  - "Faithfulness harness: standalone TypeScript script (eval/harness.ts) runnable via npx ts-node — not part of Vitest suite"
metrics:
  duration: "~5 minutes"
  completed: "2026-06-26"
  tasks_completed: 2
  files_created: 1
  files_modified: 0
status: complete
---

# Phase 04 Plan 01: AI-SPEC Sections 1 and 2 Summary

**One-liner:** Two-stage quote-backed extraction contract (CitationAnchorSchema + Zod schemas) and ContextEngine two-speed architecture (800K rolling window, 70%/560K epoch trigger, map-reduce ArtifactPipeline) written as a formal design contract for Phase 5 PRD.

## What Was Built

`04-AI-SPEC.md` — the authoritative design contract for MeetingAssist's AI grounding and context management systems. The document contains two complete sections:

**Section 1: Faithfulness/Grounding Contract (GRND-01)**

Defines how every extracted artifact is anchored to a verbatim transcript passage. Key content:
- §1.2 Two-stage extraction protocol: Stage 1 extracts quote anchors; Stage 2 generates artifact content ONLY from those anchors — the generation stage never sees the full transcript
- §1.3 CitationAnchorSchema Zod definition with `direct` / `inferred` confidence levels; D-03 contract that inferred items are never suppressed
- §1.4 Four conservative date handling rules: ISO 8601 only, null for unresolvable dates, meeting_date injection in every prompt, inferred deadlines tagged as `confidence: 'inferred'`
- §1.5 Proposed-with-confirm UX contract: `status: z.literal('proposed')` enforced by schema; no external write without user confirmation event
- §1.6 Full Zod schemas: ActionItemSchema (citations.min(1), status:proposed, due_date nullable), DecisionSchema, ExtractedDateSchema, KeyPointSchema, MeetingArtifactsSchema, SummaryCardSchema
- §1.7 Pitfall 1 (content-before-quotes) and Pitfall 5 (implicit date resolution bug)
- §1.8 Provider-agnostic schema delivery: zodToJsonSchema → OpenAI strict JSON schema and Gemini responseJsonSchema from a single Zod source of truth; Pitfall 6 (provider schema drift)
- Decision coverage table mapping D-01 through D-04 to implementing subsections

**Section 2: ContextEngine + Two-Speed Processing Architecture (GRND-02)**

Defines the component architecture for transcript context management. Key content:
- §2.1 Architectural Responsibility Map (10 capabilities mapped to primary/secondary tier)
- §2.2 Live Summary Board spec (D-05 through D-09): per-interval cards with time range labels, D-09 decoupling mandate (cards ≠ epochs), Pitfall 4 warning
- §2.3 ContextEngine ASCII component diagram: TranscriptStore → RollingWindow (TokenMonitor) → SummaryCardTimer (CardLLMCaller) → EpochCompressor (EpochEmbedder) → ContextComposer
- §2.4 Rolling window token budget: 800K ceiling, 560K epoch trigger (70%), tiktoken cl100k_base, Pitfall 2 warning
- §2.5 Epoch Compression Protocol: EpochSummarySchema Zod definition, oldest-first eviction, text-embedding-3-small default with Ollama fallback, Pitfall 3 warning
- §2.6 Speed 1 passive path data-flow diagram (Deepgram → TranscriptStore → RollingWindow → SummaryCardTimer → IPC)
- §2.7 Speed 2 Live Assistant: context composition priority stack (system prompt → summary cards → rolling window → epoch RAG → chat history → question)
- §2.8 Speed 2B ArtifactPipeline: map-reduce diagram with CitationValidator gate, mid-interval boundary resolution, parallel chunk extractions
- §2.9 Break Assist Digest: timestamp-bounded transcript slice + dedicated "While you were away" LLM call + existing interval cards
- §2.10 Architecture pitfalls consolidated (Pitfalls 2, 3, 4) + model selection table
- §2.11 Decision coverage table mapping D-05 through D-14 to implementing subsections

## Decisions Made

1. **Two separate LLM calls for extraction stages in v1.** Stage 1 (evidence extraction) and Stage 2 (constrained generation) run as separate calls. Chain-of-thought consolidation deferred unless latency proves problematic.

2. **tiktoken cl100k_base for rolling window token counting.** Mandatory — no character-based approximation. Prevents Pitfall 2 (token counter drift) that could cause silent context overflow.

3. **Epoch trigger at 560K tokens (70% of 800K ceiling).** Fires before full to give the compressor headroom. At 100% the next segment has no buffer.

4. **text-embedding-3-small (1536d) as default epoch embedding model.** Matches RSCH-05 vec_chunks schema — no schema change needed. Privacy mode uses Ollama via same baseURL adapter.

5. **Epoch compression uses Gemini 2.5 Flash Lite; user-facing operations use Gemini 2.5 Flash.** Internal infrastructure (epoch compression) is cost-optimized; user-facing quality (summary cards, end-of-meeting batch) uses the higher-quality Flash model.

6. **Mid-interval meeting end processed as a full map chunk.** If a meeting ends at 43 minutes, the final 3-minute partial interval is a full map chunk. The reduce step handles deduplication.

7. **Eval harness as standalone TypeScript script (eval/harness.ts).** Not integrated into Vitest — separate runtime characteristics, runs separately from unit tests.

## Deviations from Plan

None — plan executed exactly as written.

The plan specified Task 1 (write Section 1) then Task 2 (append Section 2). Both sections were authored in a single Write call for atomicity — the content is identical to what a sequential write would have produced. The commit captures both sections under a single feat commit with full attribution of both tasks in the message.

## Known Stubs

None — all schemas are complete and fully specified. All architectural decisions are documented. The document contains no hardcoded empty values, placeholder text, or incomplete sections.

## Threat Flags

None — this is a planning-only document. No network endpoints, auth paths, file access patterns, or schema changes at trust boundaries were introduced. The threat model in the plan covers the spec authorship trust boundary (spec author → downstream phases) and is satisfied by the decision coverage tables.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `04-AI-SPEC.md` exists at expected path | FOUND |
| `04-01-SUMMARY.md` exists at expected path | FOUND |
| Commit `92435d9` exists in git log | FOUND |
| `## Section` headings count = 2 | 2 |
| `### 1.x` subsections count = 8 | 8 |
| `### 2.x` subsections count = 11 | 11 |
| `CitationAnchorSchema` present >= 2 times | 10 |
| `EpochSummarySchema` present >= 1 times | 2 |
| `status: z.literal('proposed')` present >= 1 | 7 |
| `citations.min(1)` present >= 1 | 6 |
| `architecturally separate` present >= 1 | 2 |
| `560,000 tokens` present | 4 |
| `800,000 tokens` / `800K` present | 6 |
| `tiktoken` present | 3 |
| `MAP phase` and `REDUCE phase` present | 2 |
| `CitationValidator` present | 3 |
| D-01 through D-14 all referenced | 51 matches |
