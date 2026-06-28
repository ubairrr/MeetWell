---
phase: 10
slug: contextengine-break-assist
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-28
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (already configured) |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `npm test -- --run src/main/context/__tests__/contextengine.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds (unit tests; 60-min synthetic test seeds DB in-process) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | CTX-01 | T-10-01-B | EpochSummarySchema Zod validates LLM output | unit | `npx tsc --noEmit && npx vitest run src/shared/schemas --reporter=verbose` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | CTX-01 | — | N/A | unit | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 10-01-03 | 01 | 1 | CTX-01 | T-10-01-A | enc.free() releases WASM memory | unit | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 10-02-01 | 02 | 1 | CTX-02 | — | checkpoint:human-verify before EmbeddingAdapter | manual | N/A — human verify step | ❌ W0 | ⬜ pending |
| 10-02-02 | 02 | 1 | CTX-02 | — | embedding.length === 1536 asserted before INSERT | unit | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 10-03-01 | 03 | 2 | CTX-01, CTX-02 | — | EpochCompressor reads transcript_segments ONLY | unit | `npm test -- --run contextengine.test.ts` | ❌ W0 | ⬜ pending |
| 10-04-01 | 04 | 3 | CTX-01, CTX-03 | — | getContext() returns valid ContextWindow | unit | `npm test -- --run contextengine.test.ts` | ❌ W0 | ⬜ pending |
| 10-05-01 | 05 | 4 | CTX-05 | — | ContextEngine.start() wired on Capturing transition | unit | `npm test -- --run session.test.ts` | Yes | ⬜ pending |
| 10-06-01 | 06 | 5 | CTX-06 | — | EpochCompressor fires exactly once at 560K | unit | `npm test -- --run contextengine.test.ts` | ❌ W0 | ⬜ pending |
| 10-07-01 | 07 | 5 | CTX-04, CTX-05 | — | Break digest filtered by break_start_timestamp | unit | `npm test -- --run session.test.ts` | Yes | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/main/context/__tests__/contextengine.test.ts` — stubs for CTX-01, CTX-02, CTX-06 (created in 10-06-PLAN.md)
- [ ] No new test framework install needed — Vitest already configured
- [ ] No new test infrastructure — extends existing `tests/db.test.ts` pattern

*Wave 0 is delivered by 10-06-PLAN.md (60-min test). All other tests extend existing files.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Gemini embedding dimension probe | CTX-02 | Network call to Gemini API required; no key in CI | 10-02 checkpoint:human-verify task: call client.embeddings.create with model + dimensions param; assert response embedding length === 1536 before proceeding |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
