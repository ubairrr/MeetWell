---
phase: 11-packaging-eval-harness
plan: "04"
subsystem: eval-corpus
tags: [eval, corpus, adversarial-testing, synthetic-transcripts]
dependency_graph:
  requires: []
  provides: [eval/corpus/60 test_*.json files]
  affects: [eval/harness.ts (11-05)]
tech_stack:
  added: []
  patterns:
    - AdversarialTestCase JSON format with adversarial_injections object array
    - ground_truth with source_quote verbatim substring constraint
    - 8 category distribution: standard_sync, action_item_dense, date_heavy, high_speaker_count, fabrication_bait, attribution_bait, implicit_inference_traps, short_no_content
key_files:
  created:
    - eval/corpus/test_11_standard_sync_05.json
    - eval/corpus/test_12_standard_sync_06.json
    - eval/corpus/test_13_standard_sync_07.json
    - eval/corpus/test_14_standard_sync_08.json
    - eval/corpus/test_15_standard_sync_09.json
    - eval/corpus/test_16_standard_sync_10.json
    - eval/corpus/test_17_action_item_dense_01.json
    - eval/corpus/test_18_action_item_dense_02.json
    - eval/corpus/test_19_action_item_dense_03.json
    - eval/corpus/test_20_action_item_dense_04.json
    - eval/corpus/test_21_action_item_dense_05.json
    - eval/corpus/test_22_action_item_dense_06.json
    - eval/corpus/test_23_action_item_dense_07.json
    - eval/corpus/test_24_action_item_dense_08.json
    - eval/corpus/test_25_action_item_dense_09.json
    - eval/corpus/test_26_action_item_dense_10.json
    - eval/corpus/test_27_date_heavy_01.json
    - eval/corpus/test_28_date_heavy_02.json
    - eval/corpus/test_29_date_heavy_03.json
    - eval/corpus/test_30_date_heavy_04.json
    - eval/corpus/test_31_date_heavy_05.json
    - eval/corpus/test_32_date_heavy_06.json
    - eval/corpus/test_33_date_heavy_07.json
    - eval/corpus/test_34_date_heavy_08.json
    - eval/corpus/test_35_date_heavy_09.json
    - eval/corpus/test_36_date_heavy_10.json
    - eval/corpus/test_37_high_speaker_count_01.json
    - eval/corpus/test_38_high_speaker_count_02.json
    - eval/corpus/test_39_high_speaker_count_03.json
    - eval/corpus/test_40_high_speaker_count_04.json
    - eval/corpus/test_41_high_speaker_count_05.json
    - eval/corpus/test_42_fabrication_bait_05.json
    - eval/corpus/test_43_fabrication_bait_06.json
    - eval/corpus/test_44_fabrication_bait_07.json
    - eval/corpus/test_45_fabrication_bait_08.json
    - eval/corpus/test_46_fabrication_bait_09.json
    - eval/corpus/test_47_fabrication_bait_10.json
    - eval/corpus/test_48_attribution_bait_01.json
    - eval/corpus/test_49_attribution_bait_02.json
    - eval/corpus/test_50_attribution_bait_03.json
    - eval/corpus/test_51_attribution_bait_04.json
    - eval/corpus/test_52_attribution_bait_05.json
    - eval/corpus/test_53_implicit_inference_01.json
    - eval/corpus/test_54_implicit_inference_02.json
    - eval/corpus/test_55_implicit_inference_03.json
    - eval/corpus/test_56_implicit_inference_04.json
    - eval/corpus/test_57_implicit_inference_05.json
    - eval/corpus/test_58_short_no_content_03.json
    - eval/corpus/test_59_short_no_content_04.json
    - eval/corpus/test_60_short_no_content_05.json
  modified:
    - eval/corpus/test_05_fabrication_bait_01.json
    - eval/corpus/test_06_fabrication_bait_02.json
    - eval/corpus/test_07_fabrication_bait_03.json
    - eval/corpus/test_08_fabrication_bait_04.json
    - eval/corpus/test_09_short_no_content_01.json
    - eval/corpus/test_10_short_no_content_02.json
decisions:
  - adversarial_injections uses object format {description, expected_behavior} throughout (Rule 2 — existing files test_05-10 retrofitted to match AI-SPEC schema)
  - implicit_inference_traps files include ground_truth action_items with hedged source_quotes (might/should probably/circle back) so harness can verify confidence: inferred
  - date_heavy files use structured dates array with {description, raw_deadline_text, resolved_date} objects for unresolvable-date testing
metrics:
  duration: "~45 minutes"
  completed: "2026-06-28"
  tasks_completed: 9
  files_created: 50
  files_modified: 6
status: complete
---

# Phase 11 Plan 04: Adversarial Corpus Expansion Summary

Expanded the adversarial eval corpus from 10 to 60 synthetic meeting transcripts across all 8 required categories, implementing the full AdversarialTestCase schema with correct adversarial_injections object format per AI-SPEC §3.6.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| Pre-task fix | Retrofit existing adversarial files to object format | 96dccfc | test_05–10 (6 files) |
| 1 | Generate 6 standard_sync cases (test_11–16) | b90075f | 6 new files |
| 2 | Generate 10 action_item_dense cases (test_17–26) | 504d778 | 10 new files |
| 3 | Generate 10 date_heavy cases (test_27–36) | 30c223b | 10 new files |
| 4 | Generate 5 high_speaker_count cases (test_37–41) | 5eb427f | 5 new files |
| 5 | Generate 6 more fabrication_bait cases (test_42–47) | 2e33867 | 6 new files |
| 6 | Generate 5 attribution_bait cases (test_48–52) | 873b385 | 5 new files |
| 7 | Generate 5 implicit_inference_traps cases (test_53–57) | 94b986a | 5 new files |
| 8 | Generate 3 more short_no_content cases (test_58–60) | daca60b | 3 new files |
| 9 | Verify corpus totals | (verification only) | — |

## Corpus Final State

| Category | Count | Target |
|----------|-------|--------|
| standard_sync | 10 | 10 |
| action_item_dense | 10 | 10 |
| date_heavy | 10 | 10 |
| high_speaker_count | 5 | 5 |
| fabrication_bait | 10 | 10 |
| attribution_bait | 5 | 5 |
| implicit_inference_traps | 5 | 5 |
| short_no_content | 5 | 5 |
| **Total** | **60** | **60** |

All 60 files are valid JSON, all transcript_id values are unique, and all source_quote values are verified as verbatim substrings of their corresponding transcript.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Retrofitted existing adversarial_injections to object format**
- **Found during:** Pre-execution review of test_05–10
- **Issue:** The 6 existing adversarial files (test_05–08 fabrication_bait, test_09–10 short_no_content) used plain string arrays for adversarial_injections. The AI-SPEC §3.6 TypeScript interface defines it as `{description: string; expected_behavior: 'not-extracted' | 'flagged-inferred'}[]`. Without the expected_behavior field, the harness (11-05) cannot check injection behavior programmatically.
- **Fix:** Rewrote all 6 existing adversarial files to use the object format with explicit description and expected_behavior fields.
- **Files modified:** test_05–10
- **Commit:** 96dccfc

**2. [Rule 1 - Bug] Fixed missing hedged source_quotes in implicit_inference_traps files**
- **Found during:** Task 7 verification (plan must_have: "at least one action_item in ground_truth with a source_quote that uses hedging language")
- **Issue:** test_54 and test_56 initially had only direct-commitment source_quotes in ground_truth action_items; test_57 had only one direct item.
- **Fix:** Added hedged action items (with source_quotes containing "might be worth", "should probably", etc.) to all affected files, including corresponding transcript lines to ensure verbatim substring constraint is met.
- **Files modified:** test_54, test_56, test_57

## Corpus Design Decisions

**standard_sync (test_11–16):** Varied business domains: sprint retrospective, API design review, Q3 budget review, engineer onboarding, code review, product roadmap. 4–5 speakers each. All source_quotes verified verbatim.

**action_item_dense (test_17–26):** 6–11 action items per file. Domains: engineering sprint, sales pipeline, marketing launch, legal compliance, infrastructure migration, design system, customer success, finance, security audit, hiring. Two files (test_21, test_24) include conditional action items with context noted in description.

**date_heavy (test_27–36):** Structured dates array format: `{description, raw_deadline_text, resolved_date}`. Each file has 8–10 dates. At least 2 per file use unresolvable expressions (resolved_date: null) — "sometime in September", "as soon as possible", "probably around November 15th", etc. Meeting date headers span June, July, August 2026 for relative-date resolution testing.

**high_speaker_count (test_37–41):** 7–8 speakers per file. Every speaker has at least one action item to stress-test diarization attribution. Files test_40 (8 speakers, incident postmortem) and test_41 (7 speakers, OKR planning) include "You" as an assignee.

**fabrication_bait (test_42–47):** Six distinct trap patterns: vague "someone should" adjacent to real commitment; past-tense discussed items; rejected ideas explicitly stated; hypothetical planning adjacent to real outreach; wish expressions ("it would be great if"); overheard misattribution corrected in meeting. All use expected_behavior: 'not-extracted'.

**attribution_bait (test_48–52):** Five distinct patterns: two speakers with same first name; redirected task (asked of X, answered by Y); past meeting attribution reconfirmed; volunteer handoff chain; group commitment resolved to individual speakers.

**implicit_inference_traps (test_53–57):** All five files have at least one ground_truth action_item with hedging language in source_quote ("might", "should probably", "circle back", "it might be worth"). The adversarial_injections use expected_behavior: 'flagged-inferred'. Hedged items are in ground_truth to allow the harness to check for confidence: 'inferred' if the pipeline extracts them.

**short_no_content (test_58–60):** Pure no-content scenarios: 3-minute check-in, 6-minute team social, 8-minute informational briefing. All three have empty ground_truth arrays. The informational briefing explicitly states "no immediate action on our end".

## Threat Flags

None. This plan creates static JSON data files only. No trust boundary changes.

## Self-Check: PASSED

- eval/corpus/ contains exactly 60 test_*.json files: FOUND
- All 60 files parse as valid JSON: VERIFIED
- adversarial_injections count: 25 files (requirement >= 21): PASSED
- All transcript_id values unique: VERIFIED
- All files have transcript_id field: VERIFIED
- All category quotas met (standard_sync=10, action_item_dense=10, date_heavy=10, high_speaker_count=5, fabrication_bait=10, attribution_bait=5, implicit_inference_traps=5, short_no_content=5): VERIFIED
- implicit_inference_traps files all have >= 1 hedged source_quote: VERIFIED
