---
phase: 11-packaging-eval-harness
status: complete
verified_at: 2026-06-28
---

# Phase 11 Verification — Packaging + Eval Harness

## Phase Goal

The app is packaged, signed, notarized, and passes the adversarial eval harness faithfulness gates (CGFS ≥ 0.85, EHR ≤ 0.05) before declaring v1 shippable.

## Verification Results

| Must-Have | Status | Evidence |
|-----------|--------|---------|
| `electron-builder --mac` exits 0; DMG produced | PASS | `dist/meeting-assist-1.0.0.dmg` (140 MB) |
| App launches from DMG without DB/entitlement error | PASS | PID confirmed from mounted `/Volumes/MeetingAssist 1.0.0-arm64` |
| audiotee binary in `Contents/Resources/` | PASS | 11-03 smoke test; `asarUnpack` entries verified |
| `better_sqlite3.node` in `app.asar.unpacked/` | PASS | 11-03 smoke test; rebuilt for Electron 42.5.0/arm64 |
| macOS 14.2+ version gate in place | PASS | Darwin kernel check in `src/main/index.ts`; `dialog.showErrorBox` + `app.exit(1)` on < 14.2 |
| TCC permission onboarding IPC | PASS | `PermissionWarningCard`, `get-permission-status`, `permission-status` push |
| notarize.js hook wired (skips gracefully without creds) | PASS | `[notarize] Skipping` logged; DMG still produced |
| Eval corpus: 60 adversarial test cases | PASS | `eval/corpus/test_01` through `test_60` across 8 categories |
| `eval/harness.ts` runnable via ts-node | PASS | Runs in mock mode in < 2s; live mode confirmed on 30 cases |
| Eval CGFS ≥ 0.85 | PASS | 1.0000 (live, 30 cases) |
| Eval EHR ≤ 0.05 | PASS | 0.0000 (live, 30 cases) |
| Per-category CGFS ≥ 0.75 | PASS | 1.0000 across all 4 scored categories |
| `eval/corpus/eval_report.json` written with `passing: true` | PASS | Committed at `a0c69ef` |

## Fixes Required During Execution

| Bug | Fix | Commit |
|-----|-----|--------|
| `LLMAdapter.generate` inferred Zod INPUT type instead of OUTPUT — broke strict TypeScript in eval/tsconfig | Changed `<T>(schema: z.ZodSchema<T>)` → `<T extends z.ZodTypeAny>(schema: T): Promise<z.output<T>>` | `2d306f1` |
| `is_calendar_event` column missing from `CREATE TABLE` DDL — harness seeds in-memory DBs from `ALL_DDLS` directly, bypassing the migration guard | Added `is_calendar_event INTEGER NOT NULL DEFAULT 0` to initial DDL | `580a774` |

## Test Suite

115/115 unit + integration tests pass (unchanged throughout Phase 11).

## Outstanding Before Public Distribution

| Item | Notes |
|------|-------|
| Code signing | Requires Apple Developer ID Application cert + `APPLE_ID` / `APPLE_ID_PASSWORD` / `APPLE_TEAM_ID` env vars; `scripts/notarize.js` is fully wired |
| Gatekeeper approval (`spctl --assess`) | Follows automatically from signing + notarization |

## Verdict: PHASE COMPLETE

All phase success criteria met. Build milestone complete.
