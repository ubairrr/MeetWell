---
phase: 04-ai-grounding-context-spec-ai-spec
plan: 02
subsystem: ai-spec
tags: [ai-spec, faithfulness, eval-harness, adversarial-corpus, cgfs, ehr, grounding]
status: complete

requires:
  - 04-01

provides:
  - 04-AI-SPEC.md (complete — all 9 sections, status: final)
  - GRND-03 adversarial evaluation harness specification
  - CGFS >= 0.85 / EHR <= 0.05 shipping gate contract
  - 60-transcript adversarial corpus specification

affects:
  - Phase 5 PRD Finalization (consumes AI-SPEC as authoritative design contract)
  - Build milestone ArtifactPipeline (shipping gate enforced by harness)
  - Build milestone eval strategy (eval/harness.ts architecture specified)

tech-stack:
  added: []
  patterns:
    - RAGAS-adapted faithfulness metric (CGFS) with 0.85 threshold
    - Extrinsic Hallucination Rate (EHR) with 0.05 threshold
    - Per-category CGFS floor (0.75) to prevent masking on adversarial categories
    - LLM-as-generator pipeline for synthetic adversarial corpus
    - Standalone eval/harness.ts (not Vitest CI) for ArtifactPipeline validation
    - 90% token-overlap fuzzy matching for citation verifier

key-files:
  created: []
  modified:
    - .planning/phases/04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md

decisions:
  - "CGFS >= 0.85 and EHR <= 0.05 are contractual shipping gates (not advisory) for the ArtifactPipeline build milestone"
  - "Per-category CGFS floor of 0.75 prevents masking: fabrication-bait category cannot score 0.60 while overall passes 0.85"
  - "60-transcript adversarial corpus across 8 categories (standard syncs x10, action-dense x10, date-heavy x10, high-speaker-count x5, fabrication-bait x10, attribution-bait x5, implicit-inference x5, short/no-content x5)"
  - "eval/harness.ts is a standalone TypeScript script (npx ts-node) — not part of the Vitest unit test suite"
  - "GRND-03 corpus composition and thresholds are Claude's Discretion locked by this document as authoritative spec"
  - "Two-stage extraction (OQ-1): specify as two separate LLM calls in v1; collapse to chain-of-thought only if latency is a measured problem"
  - "Epoch compression model (OQ-3): Gemini 2.5 Flash Lite for internal compression, Gemini 2.5 Flash for user-facing cards and batch"
  - "Section 4 master decision coverage table confirms all D-01 through D-14 are implemented in AI-SPEC"

metrics:
  duration: "5 minutes"
  completed: "2026-06-26"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 1
  lines_added: 320
---

# Phase 04 Plan 02: Finalize AI-SPEC — Adversarial Eval Harness and Unifying Sections Summary

**One-liner:** Completed AI-SPEC with Section 3 adversarial eval harness (CGFS >= 0.85, EHR <= 0.05 shipping gates), master decision coverage table (D-01 through D-14), cross-reference map, and Sections 4-9 to produce a self-contained 994-line design contract in status: final.

## What Was Built

This plan completed the 04-AI-SPEC.md design contract by adding six sections and finalizing the document for Phase 5 PRD consumption:

**Task 1 — Section 3: Adversarial Evaluation Harness (GRND-03)**

- §3.1 Purpose: harness as ArtifactPipeline shipping gate (not advisory)
- §3.2 CGFS metric: citation-verifiable items / total items, threshold >= 0.85
- §3.3 EHR metric: extrinsic hallucination rate, threshold <= 0.05
- §3.4 IDR metric: intrinsic distortion rate, manual-eval-only for v1 (no numeric gate)
- §3.5 Three-part passing bar: CGFS >= 0.85 AND EHR <= 0.05 AND no category < CGFS 0.75
- §3.6 Adversarial corpus: 60 synthetic transcripts, 8 categories, LLM-as-generator pipeline, AdversarialTestCase TypeScript interface
- §3.7 Harness architecture: standalone eval/harness.ts with 90% token-overlap citation verifier, eval_report.json output
- §3.8 Four trigger conditions for running the harness during build milestone
- §3.9 GRND-03 spec authority: thresholds and architecture locked as design decisions

**Task 2 — Sections 4-9, footer, status: final**

- §4 Master Decision Coverage Table: all 14 decisions (D-01 through D-14) mapped to implementing sections
- §5 Cross-Reference Map: GRND-01 → GRND-02 → GRND-03 → Phase 5 PRD dependency chain with what each section passes to the next
- §6 Open Questions Register: OQ-1 through OQ-4 with researcher recommendations that become build milestone defaults
- §7 Security Considerations: 5 threat patterns (prompt injection, LLM output injection, citation forgery, epoch corruption, sensitive content disclosure) with STRIDE categories and mitigations
- §8 Assumptions Log: A1 through A10 with section references and risk-if-wrong analysis
- §9 Deferred Items: 4 explicit v1 boundary items (configurable interval, named speaker attribution, auto-break detection, real corpus)
- Document footer with version, consumed-by, requirements covered
- YAML frontmatter status updated from draft to final

**Self-consistency verification (passed):**
- CitationAnchorSchema `quote_full` in §1 matches the field the §3 citation verifier checks
- EpochSummarySchema `covered_interval_start`/`covered_interval_end` field names are consistent with §5 cross-reference and §7 security mitigations
- No deferred item from §9 appears in §§1-3 as a v1 requirement ("configurable" in §§1-2 refers to the embedding provider adapter, not the interval setting)
- Section 4 master table confirms all 14 decisions are covered with no gaps

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria passed on first attempt.

## Threat Model Verification

T-04-04 (Tampering — master decision coverage table): mitigated — Section 4 maps all D-01 through D-14 to implementing sections; verified by grep confirming all 14 decisions appear in the master table with >= 7 occurrences each.

T-04-05 (Repudiation — deferred items as v1 requirements): mitigated — Section 9 enumerates all 4 deferred items; self-consistency check confirmed none appear in §§1-3 as v1 requirements.

T-04-06 (Tampering — schema inconsistency §1 vs §3): mitigated — self-consistency check confirmed CitationAnchorSchema `quote_full` and 90% token-overlap threshold are consistent across §1 definitions, §2.8 CitationValidator, and §3.7 harness citation verifier.

## Known Stubs

None — this is a design specification document. All sections contain substantive content (not placeholders). The `AdversarialTestCase` interface defines the corpus format but the actual JSON files are build-milestone deliverables (documented in §3.6 and Wave 0 gaps in RESEARCH.md).

## Threat Flags

No new security-relevant surface introduced. This plan modified only a planning specification document — no network endpoints, auth paths, file access patterns, or schema changes at trust boundaries were added.

## Self-Check: PASSED

- AI-SPEC.md exists and is 994 lines: FOUND
- Section count = 9: VERIFIED (grep -c "## Section" returns 9)
- All D-01 through D-14 in Section 4: VERIFIED (14 rows in master table)
- AdversarialTestCase interface: VERIFIED (4 occurrences)
- eval/harness.ts: VERIFIED (8 occurrences)
- CGFS >= 0.85 / EHR <= 0.05: VERIFIED
- status: final in frontmatter: VERIFIED
- Task 1 commit c8efdc8: VERIFIED
- Task 2 commit 12899a1: VERIFIED
