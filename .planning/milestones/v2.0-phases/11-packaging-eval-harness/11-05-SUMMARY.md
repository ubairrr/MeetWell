---
plan: 11-05
phase: 11-packaging-eval-harness
status: complete
completed_at: 2026-06-28
---

# Plan 11-05 Summary: Adversarial Eval Harness

## What Was Built

`eval/harness.ts` — a 475-line standalone TypeScript adversarial eval harness implementing the faithfulness contract from AI-SPEC §3. Runnable via `npx ts-node eval/harness.ts`.

## Key Files

- `eval/harness.ts` (new) — complete harness implementation

## Implementation Details

**Corpus loader:** reads all `eval/corpus/test_*.json` files (60 cases), supports `--category` and `--id` CLI filters.

**DB seeder:** mirrors `eval/smoke-test.ts` exactly — in-memory SQLite, `ALL_DDLS`, meetings + transcript_segments rows, `[MM:SS]` transcript parsing, graceful sqlite-vec skip.

**Citation verifier (AI-SPEC §3.2):**
- `tokenize()`: lowercase + split on whitespace+Unicode punctuation
- `tokenOverlap()`: `|tokens(quote) ∩ tokens(transcript)| / |tokens(quote)|`
- `isCitationVerifiable()`: overlap ≥ 0.90 (AI-SPEC threshold)
- `hasMatchingEvidence()`: overlap ≥ 0.35 (EHR loose threshold)

**CGFS / EHR computation:**
- Per-case: verifiable/total and no-evidence/total over extracted action_items
- Empty-output cases (CGFS = -1) excluded from aggregate (neutral for short_no_content)
- Pipeline error payloads (no crash) also excluded (-1); hard crashes → worst scores (0/1)

**Three-gate check (AI-SPEC §3.5):**
1. `overall_cgfs >= 0.85`
2. `overall_ehr <= 0.05`
3. All `per_category_cgfs[cat] >= 0.75`

**Output:** `eval/corpus/eval_report.json` with `{ overall_cgfs, overall_ehr, per_category_cgfs, per_category_ehr, passing, gates, failed_cases }`.

**Exit codes:** 0 = all gates pass, 1 = any gate fails.

## Verification

```
✓ eval/harness.ts exists (475 lines)
✓ npx tsc --noEmit exits 0
✓ tokenOverlap + isCitationVerifiable implemented
✓ eval_report.json output wired
✓ process.exit(0) and process.exit(1) present
✓ overall_cgfs >= 0.85 gate present
```

## Self-Check: PASSED

All plan must-haves satisfied:
- Standalone ts-node runnable
- In-memory DB seeding via smoke-test pattern
- 90% token overlap citation verifier
- CGFS/EHR per AI-SPEC §3.2–3.3
- Three-gate check per AI-SPEC §3.5
- eval_report.json output
- Exit 0/1

## Key Links
- `eval/smoke-test.ts` — pattern this mirrors
- `eval/corpus/eval_report.json` — output file (created on first run)
- `11-06-PLAN.md` — reads eval_report.json to drive prompt tuning
