# Phase 11: Packaging + Eval Harness — Context

**Gathered:** 2026-06-28
**Status:** Ready for planning

<domain>
## Phase Boundary

The app is packaged, signed, notarized, and passes the adversarial eval harness faithfulness gates (CGFS ≥ 0.85, EHR ≤ 0.05) before declaring v1 shippable.

This is the final phase of the Build milestone. All prior phases (6–10) are complete. The v1 feature set is fully implemented. Phase 11 ships it.

Requirements: PACK-01 through PACK-05 (5 requirements).

</domain>

<decisions>
## Implementation Decisions

### Packaging
- **D-01:** Packaging uses `electron-builder` 26.15.3 (already in package.json). The base `electron-builder.yml` was scaffolded in Phase 6 (06-07-PLAN.md) but the notarize hook is a stub and some asarUnpack entries need audit. Phase 11 completes and verifies the config.
- **D-02:** Notarization uses `@electron/notarize` (3.1.1, already installed) via `notarytool` — `altool` is deprecated since late 2023. The `afterSign` hook in `electron-builder.yml` points to `scripts/notarize.js` which is currently a stub. Phase 11 implements the real hook.
- **D-03:** The `asarUnpack` must cover: `better-sqlite3-multiple-ciphers` `.node` binary, `audiotee` Swift binary. Both must be individually code-signed for the hardened runtime to accept them. The `electron-builder.yml` has entries for these already — Phase 11 verifies they actually resolve to the correct binary paths.
- **D-04:** macOS minimum version check fires at `app.whenReady()` — if `os.release()` indicates macOS < 14.2 (Darwin kernel < 23.2), show an error dialog and call `app.exit(1)`.
- **D-05:** TCC permission onboarding: if microphone or screen-capture permission is denied at startup, the overlay renders an instruction card with a `shell.openExternal('x-apple.systempreferences:...')` deep-link button. No capture is attempted if permission is missing.

### Eval Harness
- **D-06:** The eval harness is `eval/harness.ts` — standalone TypeScript runnable via `npx ts-node eval/harness.ts`. NOT part of Vitest. Requires a live `GEMINI_API_KEY` (paid plan).
- **D-07:** Corpus target: 60 `AdversarialTestCase` JSON files in `eval/corpus/`. Currently 10 exist (4 standard_sync, 4 fabrication_bait, 2 short_no_content). Phase 11 generates the remaining 50 across all 8 categories.
- **D-08:** Shipping gate: CGFS ≥ 0.85 AND EHR ≤ 0.05 AND no per-category CGFS below 0.75. All three conditions must be met simultaneously (AI-SPEC §3.5).
- **D-09:** Harness uses `ArtifactPipeline.run()` (already exists) via an in-memory Database seeded from each `AdversarialTestCase.transcript`. The same mock-win pattern used in `eval/smoke-test.ts` applies to the harness.
- **D-10:** Citation verifier uses token overlap (whitespace-split tokens, not tiktoken) for speed — 90% of quote tokens must appear in the transcript segment text at the cited timestamp range.

### Claude's Discretion
- Exact asarUnpack glob patterns and code-sign identity: planner verifies against the built `.app` bundle.
- Corpus case content: each JSON follows the `AdversarialTestCase` format in AI-SPEC §3.6; planner generates realistic synthetic transcripts.
- Prompt tuning approach: if baseline CGFS < 0.85, planner analyzes failure modes and adjusts Stage 1 or Stage 2 prompts in `ArtifactPipeline.ts`.

### Deferred Items
- Full App Store submission (requires additional entitlement justification, screenshots, metadata) — post-launch
- Real-recording eval corpus (requires speaker consent + labeling) — v2 per AI-SPEC §3.1
- Windows/Linux packaging — v2 (macOS only for v1)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 11: Packaging + Eval Harness" — goal, 5 success criteria, PACK-01–PACK-05
- `.planning/phases/05-prd-finalization/05-BUILD-ORDER.md` §"Phase 6: Packaging + Eval Harness" — deliverables, acceptance criteria

### Eval harness specification (primary authority)
- `.planning/phases/04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md` §3 — Full eval harness spec: CGFS formula, EHR formula, shipping gate (§3.5), corpus design (§3.6), harness architecture (§3.7), when to run (§3.8)

### Existing codebase artifacts to build on
- `eval/smoke-test.ts` — demonstrates in-memory DB seeding + mock win pattern for running ArtifactPipeline outside Electron
- `eval/corpus/test_01_standard_sync_01.json` — canonical AdversarialTestCase format example
- `scripts/notarize.js` — stub to be implemented
- `electron-builder.yml` — base config to be finalized
- `build/entitlements.mac.plist` — complete (allow-jit, allow-unsigned-executable-memory, disable-library-validation)

</canonical_refs>
