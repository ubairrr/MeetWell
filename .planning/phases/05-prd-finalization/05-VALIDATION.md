---
phase: 5
slug: prd-finalization
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-26
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — planning-only phase; validation is document inspection |
| **Config file** | none |
| **Quick run command** | `ls .planning/phases/05-prd-finalization/05-*.md` |
| **Full suite command** | `ls .planning/phases/05-prd-finalization/05-PRD.md .planning/phases/05-prd-finalization/05-FEATURE-SPEC.md .planning/phases/05-prd-finalization/05-ARCHITECTURE.md .planning/phases/05-prd-finalization/05-BUILD-ORDER.md` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `ls .planning/phases/05-prd-finalization/05-*.md`
- **After every plan wave:** Run full artifact existence check
- **Before `/gsd-verify-work`:** All 4 deliverable files must exist and be non-empty
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | PRD-01 | — | N/A | doc-inspect | `ls .planning/phases/05-prd-finalization/05-FEATURE-SPEC.md` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 1 | PRD-02 | — | N/A | doc-inspect | `ls .planning/phases/05-prd-finalization/05-ARCHITECTURE.md` | ❌ W0 | ⬜ pending |
| 05-03-01 | 03 | 2 | PRD-03 | — | N/A | doc-inspect | `ls .planning/phases/05-prd-finalization/05-BUILD-ORDER.md` | ❌ W0 | ⬜ pending |
| 05-04-01 | 04 | 2 | PRD-04 | — | N/A | doc-inspect | `ls .planning/phases/05-prd-finalization/05-PRD.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Output files are created by the executor (no stub needed — doc-writing phase)

*Existing infrastructure covers all phase requirements (planning-only).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| FEATURE-SPEC.md has explicit MVP boundary table | PRD-01 | Requires human reading | Open file, confirm table with table-stakes/differentiators/deferred v2+ columns |
| ARCHITECTURE.md covers all 7 DB tables | PRD-02 | Requires human reading | Grep for `summary_cards` and `epoch_summaries` in ARCHITECTURE.md |
| BUILD-ORDER.md has 4–6 phases with dependency chain | PRD-03 | Requires human reading | Open file, count phase sections, verify dependency annotations |
| PRD.md has executive summary (investor-readable) | PRD-04 | Requires human reading | Open PRD.md, confirm non-technical executive summary section at top |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
