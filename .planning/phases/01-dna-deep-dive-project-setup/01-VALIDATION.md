---
phase: 1
slug: dna-deep-dive-project-setup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-25
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> **This phase produces documentation/analysis artifacts, not runtime code.** There is
> no product code to execute and therefore no automated test framework. "Validation"
> here means **citation accuracy** (every `file:line` claim resolves to the claimed
> mechanism in `DNA/src/...`) and **deliverable existence/completeness** (the four
> focused docs exist with the required structure). All checks are manual or
> lightweight grep guards over the git-ignored `DNA/` tree.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — docs-only phase; no product code to test |
| **Config file** | none |
| **Quick run command** | n/a (citation spot-check — see Manual-Only Verifications) |
| **Full suite command** | n/a |
| **Estimated runtime** | n/a |

---

## Sampling Rate

- **After every doc commit:** spot-check 2–3 `file:line` citations in the just-written doc resolve to the claimed mechanism in `DNA/src/...`.
- **Phase gate (before `/gsd-verify-work`):** all four deliverables exist in the phase folder; every `borrow-and-adapt` catalogue entry carries code-level evidence (D-06); no claim repeats a Doc-vs-Code gap as fact (RESEARCH.md §"Doc-vs-Code Gaps").
- **Max feedback latency:** n/a (manual review; no watch loop)

---

## Per-Requirement Verification Map

> Task IDs are assigned by the planner. This phase's verification is requirement-level
> and manual (Test Type = `doc-check`), per RESEARCH.md §"Validation Architecture".

| Requirement | Behavior | Test Type | Check | File Exists | Status |
|-------------|----------|-----------|-------|-------------|--------|
| SETUP-01 | SETUP baseline (repo + auto-push) documented | doc-check | Setup-baseline doc records private remote `ubairrr/MeetingAssist` + auto-push hook as conventions; matches verified facts | ❌ W0 | ⬜ pending |
| SETUP-02 | `.gitignore` rules documented | doc-check | Doc records DNA/, GSD tooling, secrets ignored; `.planning/` tracked — matches actual `.gitignore` | ❌ W0 | ⬜ pending |
| SETUP-03 | Dev-baseline / conventions documented | doc-check | Dev-baseline doc captures toolchain + Node/Electron line + proposed `main/<domain>/` layout as **direction, not pinned** (D-07) | ❌ W0 | ⬜ pending |
| DNA-01 | DNA modules read with evidence | doc-check | Each catalogue claim has a resolvable `file:line` in `DNA/src/...` | ❌ W0 | ⬜ pending |
| DNA-02 | Selective-adoption catalogue exists | doc-check | 5 techniques present, each with D-04 5-field structure | ❌ W0 | ⬜ pending |
| DNA-03 | Explicit verdicts assigned | doc-check | Every technique carries a verdict from D-03 taxonomy (borrow-and-adapt / design-reference / leave-behind / defer) | ❌ W0 | ⬜ pending |
| DNA-04 | Audio approach + macOS floor written | doc-check | Doc states method (ScreenCaptureKit loopback via `desktopCapturer` + `MacLoopbackAudioForScreenShare` flag) + floor (macOS 12.0) + RSCH-04 handoff | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- None — no test infrastructure is needed for a documentation phase.

*Optional lightweight guard (planner's discretion, non-blocking):* a grep asserting every
`file:line` citation in the catalogue points to an existing line in `DNA/src/*`. Operates on
a git-ignored tree, so it cannot run in CI — local-only convenience check.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Citation accuracy | DNA-01, DNA-02 | `DNA/` is a git-ignored reference tree; no runtime to assert against | For each `borrow-and-adapt` entry, open the cited `DNA/src/...:line` and confirm the code matches the described mechanism |
| Doc-vs-Code reconciliation | DNA-02, DNA-03 | Judgment call — narrative claims vs. shipped code | Confirm catalogue does NOT repeat the four README overstatements (sharp, LSUIElement, `DNA/adapters/`, app version) as fact; see RESEARCH.md §"Doc-vs-Code Gaps" |
| macOS floor sourcing | DNA-04 | Evidence-quality judgment | Confirm the 12.0 floor is attributed to the shipped binary's `Info.plist` and framed as RSCH-04's starting hypothesis, not a final guarantee |
| Direction-not-pinned posture | SETUP-03 | Judgment call per D-07 | Confirm dev-baseline marks exact version pinning + final layout as Phase 5 PRD / build-time decisions |

---

## Validation Sign-Off

- [ ] All deliverables have a `doc-check` verification or are listed under Manual-Only Verifications
- [ ] Sampling continuity: every catalogue `borrow-and-adapt` entry has a citation spot-check
- [ ] Wave 0 covers all MISSING references (N/A — no test infra)
- [ ] No watch-mode flags (N/A — docs phase)
- [ ] `nyquist_compliant: true` set in frontmatter once the planner maps each requirement to a doc deliverable

**Approval:** pending
