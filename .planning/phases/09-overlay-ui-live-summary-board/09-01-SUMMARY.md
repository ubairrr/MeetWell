---
plan: 09-01
phase: 9
title: SummaryCardSchema + SummaryCardStore
status: complete
completed_date: 2026-06-27
duration_seconds: 46
tasks_completed: 2
tasks_total: 2
files_created:
  - src/main/store/SummaryCardStore.ts
files_modified:
  - src/shared/schemas/index.ts
decisions:
  - SummaryCardSchema uses min(1)/max(5) key_points constraint matching context decision D-01
  - StoredSummaryCard is a plain TypeScript interface (not Zod) — represents hydrated DB row after JSON parsing
  - action_items_mentioned_json persisted as '[]' as specified — Phase 10 extensibility column
  - Prepared statements compiled once in constructor for performance
requires:
  - Phase 6 db.ts (summary_cards DDL)
  - Phase 8 shared schemas pattern
provides:
  - SummaryCardSchema (imported by SummaryCardTimer, Plan 09-02)
  - StoredSummaryCard type (imported by renderer IPC payloads)
  - SummaryCardStore class (used by SummaryCardTimer, Plan 09-02)
affects:
  - src/shared/schemas/index.ts
  - src/main/store/SummaryCardStore.ts
tech_stack_added: []
tech_stack_patterns:
  - Zod schema + inferred type pattern (consistent with existing schemas)
  - better-sqlite3 prepared statement pattern (consistent with ArtifactStore)
  - Private rowToStoredCard mapper to avoid JSON.parse repetition
requirements_satisfied:
  - UI-02
  - UI-03
tags:
  - schemas
  - store
  - sqlite
  - phase-9
---

# Phase 9 Plan 01: SummaryCardSchema + SummaryCardStore Summary

**One-liner:** Zod SummaryCardSchema (headline + key_points + speaker_contributions) added to shared registry with a typed SummaryCardStore wrapping the summary_cards SQLCipher table.

## What Was Built

### T1 — SummaryCardSchema (src/shared/schemas/index.ts)

Appended three exports to the shared Zod schema registry:

- `SummaryCardSchema`: `z.object` with `topic_headline: z.string()`, `key_points: z.array(z.string()).min(1).max(5)`, `speaker_contributions: z.record(z.string(), z.string())`
- `SummaryCard`: TypeScript type inferred via `z.infer<typeof SummaryCardSchema>`
- `StoredSummaryCard`: Plain TypeScript interface representing a fully hydrated DB row (all 13 columns from the `summary_cards` DDL, with `_json` columns already parsed)

No existing schemas were modified or reformatted.

### T2 — SummaryCardStore (src/main/store/SummaryCardStore.ts)

New class wrapping the `summary_cards` SQLCipher table:

- Constructor accepts `Database.Database`, compiles three prepared statements once (`stmtInsert`, `stmtSelectByMeeting`, `stmtSelectSince`)
- `saveCard(...)`: generates UUID via `crypto.randomUUID()`, serializes arrays/records via `JSON.stringify`, inserts all DDL columns, returns the generated `id`
- `getCardsForMeeting(meetingId)`: selects all cards for a meeting ordered by `card_index ASC`
- `getCardsSince(meetingId, sinceMs)`: selects cards with `created_at > sinceMs`, ordered by `created_at DESC`
- Private `rowToStoredCard(row)`: centralized JSON parsing of the three `_json` columns

Import style follows `db.ts` pattern: `import Database from 'better-sqlite3-multiple-ciphers'`.

## Verification

`npx tsc --noEmit` — zero errors. No runtime test needed per plan specification; correctness exercised end-to-end in Plan 09-02 (SummaryCardTimer) and Plan 09-07 (integration).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. SummaryCardStore is a pure DB wrapper with no display rendering or placeholder values.

## Threat Flags

No new network endpoints, auth paths, or trust boundary changes introduced. Both files are internal to the main process with no renderer exposure. No threat flags.

## Self-Check: PASSED

- [x] `src/shared/schemas/index.ts` — modified, SummaryCardSchema/SummaryCard/StoredSummaryCard present
- [x] `src/main/store/SummaryCardStore.ts` — created, three public methods implemented
- [x] Commit a52ffc3 exists in git log
- [x] `tsc --noEmit` exits zero
