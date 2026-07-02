---
phase: 13-meeting-type-artifact-templates
plan: 04
subsystem: pipeline
tags: [llm-prompts, meeting-type, mom, zod, artifact-pipeline]
requires:
  - 13-01 (meetings.meeting_type column, MeetingType schema, MoMSchema.meeting_type)
provides:
  - MOM_SECTION_SPECS exported lookup (distinct markdown section block per MeetingType)
  - MoMGenerationSchema exported LLM-facing schema (no meeting_type field)
  - ArtifactPipeline.getMeetingType() private DB read with 'general' fallback
  - runStage2Mom(anchors, meetingDate, meetingType) type-conditional prompt
  - mom.meeting_type stamped programmatically on every run() return path
affects: []
tech-stack:
  added: []
  patterns:
    - LLM-facing schema narrower than storage schema; system-known fields stamped post-call (D-08)
    - type-conditional prompt block interpolated into a shared prompt skeleton (D-02)
key-files:
  created:
    - tests/unit/ArtifactPipeline.test.ts
  modified:
    - src/main/pipeline/ArtifactPipeline.ts
decisions:
  - "MoMSchema import removed from ArtifactPipeline (now unused after switching the LLM call to MoMGenerationSchema) — keeps the file at its exact 2-error tsc baseline"
  - "Catch-block fallback keeps hardcoded meeting_type: 'general' — actual type not reliably readable if the try block failed before the DB read"
  - "general's Action Items table block moved to the shared skeleton AFTER the type-conditional sections; Next Steps lives inside MOM_SECTION_SPECS.general"
metrics:
  duration: ~12 min
  completed: 2026-07-02
status: complete
---

# Phase 13 Plan 04: Type-Conditional MOM Generation Summary

`runStage2Mom` now interpolates a per-meeting-type section spec (`MOM_SECTION_SPECS`) into its OUTPUT FORMAT and stamps `meeting_type` programmatically via a narrowed LLM schema (`MoMGenerationSchema`), while Stage 1 and the Summary/Key Points/Action Items prompts are proven byte-identical across meeting types.

## What Was Built

### Task 1 — Type-conditional runStage2Mom + meeting_type stamping (commit aa9f556)
- `export const MOM_SECTION_SPECS: Record<MeetingType, string>` — 4 distinct section blocks:
  - `general`: `## Agenda Items Discussed` / `## Key Discussion Points` / `## Decisions Made` / `## Next Steps` (guidance text copied verbatim from the pre-existing prompt)
  - `standup`: `## Yesterday` / `## Today` / `## Blockers`
  - `1:1`: `## Discussion Topics` / `## Feedback Themes` / `## Growth Notes` / `## Follow-ups`
  - `planning`: `## Decisions` / `## Next Steps` / `## Open Questions`
- `export const MoMGenerationSchema = z.object({ markdown_content: z.string() })` — the schema sent to the LLM; intentionally omits `meeting_type` so the pipeline never relies on an LLM echo (D-08)
- `getMeetingType(): MeetingType` — mirrors `getMeetingDate()`'s SELECT-by-id shape; falls back to `'general'` when the row is missing or the stored value is not a `MOM_SECTION_SPECS` key (T-13-06 mitigation)
- `runStage2Mom(anchors, meetingDate, meetingType)` — shared skeleton (`# Minutes of Meeting` header, `## Attendees`, ABSOLUTE RULES, INPUT FORMAT all unchanged) with `${MOM_SECTION_SPECS[meetingType]}` interpolated between `## Attendees` and the `## Action Items` table block; returns `{ markdown_content, meeting_type: meetingType }` constructed post-call
- `run()` computes `meetingType` once at the top and threads it into the two early-return `mom` literals and the `runStage2Mom` call only — the `runStage2Summary`/`runStage2KeyPoints`/`runStage2ActionItems` calls and prompts are byte-for-byte untouched (D-05/D-06); catch fallback keeps hardcoded `'general'`

### Task 2 — ArtifactPipeline behavioral tests (commit 237537d)
- `tests/unit/ArtifactPipeline.test.ts` — 10 tests, all passing:
  - 4 pure `MOM_SECTION_SPECS` content-shape assertions (per-key distinctness via `.toContain()`/`.not.toContain()`)
  - standup run: captured `minutes_of_meeting` systemPrompt contains standup headings, none of the general headings; general run: original headings preserved (regression)
  - `quote_anchors` prompt byte-identical (`.toBe()`) across standup vs general runs with identical transcripts (TMPL-05/D-06)
  - `meeting_summary`/`key_points`/`action_items` prompts each byte-identical across types (D-05)
  - `mom.meeting_type === '1:1'` for a seeded 1:1 meeting even though the mocked LLM response for `minutes_of_meeting` contains no `meeting_type` key (D-08 programmatic stamping)
  - empty-transcript early return on a seeded `planning` meeting returns `mom.meeting_type: 'planning'` with zero LLM calls
- Mocks `LLMAdapter` per `CaptureService.test.ts`'s internal-instantiation precedent; in-memory DB per `TranscriptStore.test.ts`'s `openTestDb()` precedent; `ArtifactStore.saveArtifacts` runs against the same real in-memory DB (no mock)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `import { z } from 'zod'` to ArtifactPipeline.ts**
- **Found during:** Task 1
- **Issue:** The plan said to define `MoMGenerationSchema` "using the already-imported `z`", but ArtifactPipeline.ts had no direct `zod` import (schemas were previously imported pre-built from `shared/schemas`).
- **Fix:** Added the direct `z` import alongside the existing imports.
- **Files modified:** src/main/pipeline/ArtifactPipeline.ts
- **Commit:** aa9f556

**2. [Rule 3 - Blocking] Removed now-unused `MoMSchema` import**
- **Found during:** Task 1
- **Issue:** Switching the `minutes_of_meeting` LLM call from `MoMSchema` to `MoMGenerationSchema` left `MoMSchema` unused, which would have added a 3rd TS6133 error — violating the acceptance criterion that the file stay at exactly its 2 pre-existing baseline errors.
- **Fix:** Dropped `MoMSchema` from the shared-schemas import (the `MoM` type import remains).
- **Files modified:** src/main/pipeline/ArtifactPipeline.ts
- **Commit:** aa9f556

## TDD Gate Compliance

Task 2 carried `tdd="true"`, but the plan's own task ordering placed the full implementation (Task 1) before the tests, so a RED phase was structurally impossible — the tests validate already-committed behavior and passed on first run. This is plan-designed sequencing, not a skipped gate; the tests exercise the behavior through the public `run()` surface with the LLM fully mocked.

## Verification

- `npx vitest run tests/unit/ArtifactPipeline.test.ts` — 10 passed
- `npm test` — 164 passed / 0 failed (154 post-13-01 baseline + 10 new)
- `npx tsc --noEmit -p tsconfig.node.json` — ArtifactPipeline.ts at exactly its 2 pre-existing baseline errors (unused `MeetingArtifactsSchema` import, unused `win` property); no new errors anywhere
- Task 2's human-check (live Standup meeting end-to-end through ConsentGate → ArtifactReview) deferred to end-of-phase UAT per `human_verify_mode: end-of-phase`; requires Plans 13-02/13-03 merged, which wave sequencing guarantees

## Threat Model Compliance

- T-13-06 (Tampering, mitigate): `getMeetingType()` returns `'general'` for a missing row or any value not present as a `MOM_SECTION_SPECS` key — an `undefined` section spec can never be interpolated into the LLM prompt
- T-13-07 (Information Disclosure, accept): stamped `meeting_type` duplicates data already in the `meetings` row; the Stage 1 → Stage 2 grounding contract is unweakened (Stage 1 and all other Stage 2 prompts proven byte-identical across types)

## Known Stubs

None — no placeholder data flows to UI. The catch-block fallback's `meeting_type: 'general'` is an intentional error-path default per the plan (real type unavailable if the try block failed before the DB read).

## Requirements

TMPL-03, TMPL-04, TMPL-05 — satisfied by this plan (type-conditional MOM structure, distinct sections per type, Stage 1 template-agnostic), proven by direct behavioral tests. End-of-phase UAT human-check remains for user-visible confirmation.

## Commits

| Task | Commit  | Message |
| ---- | ------- | ------- |
| 1    | aa9f556 | feat(13-04): make runStage2Mom type-conditional and stamp meeting_type programmatically |
| 2    | 237537d | test(13-04): prove type-conditional MOM generation and prompt isolation |

## Self-Check: PASSED

- tests/unit/ArtifactPipeline.test.ts — FOUND
- src/main/pipeline/ArtifactPipeline.ts modifications — FOUND
- Commits aa9f556, 237537d — FOUND
