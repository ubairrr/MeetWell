---
phase: 12
slug: named-speaker-attribution
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-02
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^2.0.0 |
| **Config file** | `vitest.config.ts` — `include: ['tests/**/*.test.ts', 'src/main/**/*.test.ts']`, `exclude: ['src/renderer/**', 'node_modules/**']` |
| **Quick run command** | `npx vitest run <specific new test file>` |
| **Full suite command** | `npm test` (== `vitest run`) |
| **Estimated runtime** | ~10-20 seconds (small unit suite, 5 existing `src/main/context/__tests__/*.test.ts` files as baseline) |

Note: renderer/React components have zero automated test coverage in this project's convention (explicitly excluded in `vitest.config.ts`). `RenameSpeakersModal.tsx` is validated by manual UAT, not Vitest. All automated coverage for this phase belongs in `src/main/**`.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <specific new test file for that task>`
- **After every plan wave:** Run `npm test` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~20 seconds

---

## Per-Task Verification Map

*Task IDs are assigned during planning (step 8) — this table maps requirements to their expected test coverage; the planner should populate exact Task ID / Plan / Wave columns as tasks are created.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | SPKR-01 | V3/V5 | `get-speaker-roster`/`rename-speakers` handlers accept valid payload, reject when session state != `Complete` | unit | `npx vitest run src/main/store/__tests__/SpeakerAliasStore.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SPKR-02 | — | `renameInContentJson` correctly replaces word-boundary matches without corrupting JSON (incl. `"`/`\`/`$` in new name) | unit | `npx vitest run src/main/store/__tests__/speakerRename.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SPKR-02 | — | Re-renaming the same speaker twice in one session propagates from the *current* effective name (idempotent lookup via `speaker_aliases`) | unit | `npx vitest run src/main/store/__tests__/SpeakerAliasStore.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SPKR-03 | — | `action_items.assignee_label` mutated in the same transaction as `content_json`; exported `.ics` description matches renamed label | unit/integration | `npx vitest run src/main/calendar/__tests__/CalendarExportService.test.ts` | ❌ W0 (no existing test file for this service) | ⬜ pending |
| TBD | TBD | TBD | SPKR-05 | V4 | Renaming in meeting A leaves meeting B's rows untouched (every propagation query scoped `WHERE meeting_id = ?`) | unit | `npx vitest run src/main/store/__tests__/SpeakerAliasStore.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/main/store/__tests__/speakerRename.test.ts` — pure-function tests for `renameInContentJson`, `renameKeyedContributions`, `escapeReplacement`, word-boundary edge cases (`"Speaker 1"` inside prose vs. as a citation field vs. a name containing `$`/`"`)
- [ ] `src/main/store/__tests__/SpeakerAliasStore.test.ts` — DDL creation, upsert-on-conflict, per-meeting scoping, idempotent re-rename lookup
- [ ] `src/main/calendar/__tests__/CalendarExportService.test.ts` — no existing test file for this service at all; a rename-propagation test would be the first coverage here (broader gap, not phase-specific, but this phase is the first to need it)
- [ ] Framework install: none — Vitest already configured and used by 5 existing `src/main/context/__tests__/*.test.ts` files as a direct pattern reference

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Rename modal UI (roster listing, representative excerpts, staged edits, batch Save) | SPKR-01 | Renderer/React components have zero automated test coverage in this project's convention | Open ArtifactReview for a Complete meeting with 2+ speakers, click "Rename Speakers," verify roster shows every distinct `speaker_label` with a representative excerpt, edit 2+ names, click Save, confirm modal closes and MOM/summary/key points/action items re-render with new names |
| Cross-artifact visual consistency after rename | SPKR-02 | End-to-end rendering correctness across MOM/summary/key points/action items/citations is a UI/perception check, not unit-testable | After a rename, visually scan MOM, summary, key points, action items, and citation panel for the renamed meeting — confirm no stale label remains anywhere |
| False-positive risk of matching generic "You" in generated prose | SPKR-01/SPKR-02 (D-08) | Locked design decision (D-08); accepted risk per research Pitfall 4, not something to redesign or unit-test | UAT reviewer scans MOM/summary text after a "You" rename for any unexpected second-person "You" that was incorrectly substituted |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (speakerRename.test.ts, SpeakerAliasStore.test.ts, CalendarExportService.test.ts)
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
