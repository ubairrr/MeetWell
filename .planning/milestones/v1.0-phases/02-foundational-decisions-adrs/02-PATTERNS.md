# Phase 2: Foundational Decisions (ADRs) — Pattern Map

**Mapped:** 2026-06-25
**Files analyzed:** 2 deliverables (both Markdown ADR docs)
**Analogs found:** 2 / 2

> **Read this first.** Phase 2 ships **no product code** — its deliverables are two Markdown ADR files inside the phase folder (per CONTEXT.md D-01). This map works the same axis as Phase 1's PATTERNS.md:
> - **Document analog** — the closest existing planning doc whose *structure, voice, depth, and cross-reference style* each ADR should follow.
> - **Content sources** — the locked decisions from CONTEXT.md that each ADR encodes, plus the canonical references listed there.
>
> There is no source code to modify. The planner should treat "Pattern Assignments" below as "write an ADR shaped like analog X, encoding decisions Y."

## File Classification

| Deliverable (to be created) | Role | Data Flow | Closest Analog | Match Quality |
|-----------------------------|------|-----------|----------------|---------------|
| `02-DEC-01.md` — Consent & Recording Posture ADR (DEC-01) | doc / decision-record | transform (deliberated options → locked ADR) | `.planning/phases/01-dna-deep-dive-project-setup/01-DNA-CATALOGUE.md` §"Technique 5: Overlay / Stealth Window Setup" (structured multi-option analysis → verdict) | role-match |
| `02-DEC-02.md` — Data-handling & Privacy ADR (DEC-02) | doc / decision-record | transform (deliberated options → locked ADR) | `.planning/research/STACK.md` §"Local Persistence & Encryption" + §"macOS System-Audio Capture" (options table → recommendation → rationale) | role-match |

> Filenames `02-DEC-01.md` and `02-DEC-02.md` are recommended (Claude's Discretion). What is locked: two separate ADR files (D-01, from CONTEXT.md), both inside the phase folder.

## Shared Document Conventions (apply to BOTH ADRs)

Both ADRs use **standard MADR format** (CONTEXT.md D-01). The closest existing example of this multi-section, options-then-verdict structure in the planning corpus is `01-DNA-CATALOGUE.md`'s per-technique entries combined with `STACK.md`'s options-table layout. Apply these conventions so the ADRs are citable by Phase 5 PRD.

**Header block** — match the Phase 1 deliverable header style (`.planning/phases/01-dna-deep-dive-project-setup/01-DEV-BASELINE.md` lines 1–5):
```markdown
# DEC-0X: <Title>

**Status:** Accepted
**Decided:** 2026-06-25
**Deciders:** Product (ubair)
**Supersedes:** —
**Superseded by:** —
```

**MADR section order** (locked format per D-01):
1. Status
2. Context / Problem Statement
3. Decision Drivers
4. Options Considered (table)
5. Decision Outcome
6. Consequences (positive + negative)
7. Open Dependencies (required — both ADRs must name their RSCH-03 dependency)

**Options table shape** — copy the compact options table pattern from `.planning/research/STACK.md` (e.g., the "Speech-to-Text — Options & Tradeoffs" table structure: columns = Option | Behaviour | Rationale | Verdict):
```markdown
| Option | Description | Rationale | Verdict |
|--------|-------------|-----------|---------|
```

**Cross-reference style** — inline markdown links to other planning docs (e.g., `[RSCH-03](../../REQUIREMENTS.md)`, `[DEC-02](./02-DEC-02.md)`). Pattern from `01-DNA-CATALOGUE.md`'s "Phase 2 DEC-01" callout in Technique 5.

**"Open dependency" callout** — both ADRs must end with an explicit open-dependencies note. Model this on the `01-DNA-AUDIO-ASSESSMENT.md` "RSCH-04 handoff" pattern: a clearly labelled section naming what remains unresolved and which future phase resolves it.

**Posture statement** — the ADR's Decision Outcome section must open with a one-sentence declarative verdict (the "locked" posture), followed by the rationale. Model on `STACK.md`'s "Executive Verdict on the Inherited DNA" table where each row has a one-line action.

## Pattern Assignments

### `02-DEC-01.md` — Consent & Recording Posture ADR (doc, decision-record)

**Document analog:** `.planning/phases/01-dna-deep-dive-project-setup/01-DNA-CATALOGUE.md` §"Technique 5: Overlay / Stealth Window Setup" — the closest existing example of "examine a dual-use capability, separate legitimate use from ethically rejected use, deliver a locked verdict."

**Content backbone (locked decisions from CONTEXT.md):**

- **D-02:** Consent gate fires **per-meeting** — a dialog on every recording session start, not once at setup.
- **D-03:** Gate mechanism = **checkbox + disabled Start button**: "I confirm all meeting participants have been informed and consented to this recording." Checkbox must be checked; no checkbox → no capture.
- **D-04:** **All-party consent, globally, no jurisdiction exceptions.** Highest-bar standard; no lower-consent mode offered.
- **D-05:** `setContentProtection(true)` **ON by default** (hides overlay from user's own screen-share). ADR explicitly separates this from "conceal the fact of recording" (never ship).

**DNA technique context to reference (already catalogued in `01-DNA-CATALOGUE.md` Technique 5):**

`DNA/src/main.js:247-253` — the four stealth-window calls (`setVisibleOnAllWorkspaces`, `setAlwaysOnTop`, `setContentProtection(true)`, `setIgnoreMouseEvents`). The ADR acknowledges these as the technical substrate for content-protection while clarifying the ethical boundary. Do **not** re-quote the excerpt; reference the catalogue entry: `.planning/phases/01-dna-deep-dive-project-setup/01-DNA-CATALOGUE.md` §"Technique 5."

**Options to present (in options table):**

| Option | Description | Verdict |
|--------|-------------|---------|
| Disclosed + all-party consent gate (per-meeting) | Checkbox dialog every session; no capture without confirmation | **Chosen** |
| Disclosed + one-party consent (jurisdiction-aware) | Lower bar for one-party states | Rejected — complexity, liability, trust cost |
| Setup-only consent acknowledgement | One-time gate at first run | Rejected — no per-session accountability |
| Covert / undisclosed recording | No consent gate | Rejected — existential legal/ethical liability; never ship |

**Consequences to include:**
- Positive: legal defensibility, user trust, clear ethical posture.
- Negative: per-meeting friction (accepted; core value requires trustworthy posture).

**Open dependency to note:**
- No vendor dependency for DEC-01 itself. Cross-reference DEC-02 for the data-handling side.

---

### `02-DEC-02.md` — Data-handling & Privacy ADR (doc, decision-record)

**Document analog:** `.planning/research/STACK.md` §"Local Persistence & Encryption" and §"macOS System-Audio Capture" — options tables, rationale columns, and a clear recommended path. Also `.planning/research/PITFALLS.md` voice for the "raw audio retention" risk callout.

**Content backbone (locked decisions from CONTEXT.md):**

- **D-06:** Raw audio **deleted by default after transcription**. Settings toggle = opt-in to keep. Default stance = transcribe-then-delete-raw-audio.
- **D-07:** Transcripts, MOM, summaries, action items **kept indefinitely** until user-initiated delete. No automatic expiry. Matches core product value.
- **D-08:** Data **persists on disk after uninstall**. ADR notes this and recommends a "Delete All Meeting Data" settings action as a clean-delete path before uninstall. No automatic cleanup.
- **D-09:** On-device/offline mode = **planned future capability**. Noted without committing to implementation scope or architecture.

**Stack context to anchor decisions in (from `.claude/CLAUDE.md`):**

Local Persistence table (CLAUDE.md §"Local Persistence & Encryption"):
```
Transcripts / artifacts  → better-sqlite3-multiple-ciphers (SQLCipher, AES-256)
                            Key: generated on first run, stored via Electron safeStorage (Keychain-backed)
Small prefs / settings   → electron-store
Secrets (API keys)       → safeStorage
Vector embeddings        → sqlite-vec table inside same SQLCipher DB
```
Reference these library choices as the locked technical implementation; the ADR ratifies them as the data-handling decision.

**Options to present (in options table):**

Raw audio retention:
| Option | Behaviour | Verdict |
|--------|-----------|---------|
| Delete after transcription (default) | Raw audio purged once transcript is written; opt-in toggle to keep | **Chosen** |
| Keep raw audio always | User can re-transcribe; higher storage cost, higher privacy surface | Rejected as default; available as opt-in |
| Configurable retention window (N days) | Auto-expiry | Not adopted — complexity without clear user need |

Transcript retention:
| Option | Behaviour | Verdict |
|--------|-----------|---------|
| Keep until user deletes | Indefinite; per-meeting or bulk delete | **Chosen** |
| Auto-expiry (N days) | Automatic purge | Rejected — contradicts "trustworthy record" core value |

Encryption at rest:
| Option | Behaviour | Verdict |
|--------|-----------|---------|
| SQLCipher (better-sqlite3-multiple-ciphers) + safeStorage | Full-DB AES-256; key in macOS Keychain | **Chosen** |
| Plain SQLite + field-level encryption | App-layer only; more complex key management | Rejected — full-DB encryption is cleaner |
| No encryption | Plaintext on disk | Rejected — privacy non-starter |

**Consequences to include:**
- Positive: privacy-defensible, Keychain-backed key, no plaintext meeting data on disk.
- Negative: safeStorage is macOS-specific (cross-platform future work); on-device mode deferred.

**Open dependency to note (required by REQUIREMENTS.md DEC-02 clause):**
```
OPEN: RSCH-03 — Vendor DPA / no-training terms for Deepgram and the chosen LLM provider(s)
must be confirmed before this ADR is fully closed. Until RSCH-03 completes, the data-handling
ADR operates on the reasonable assumption that enterprise/API tiers exclude training on customer
data; Phase 3 RSCH-03 will verify and update this ADR if needed.
```

---

## Shared Patterns

### MADR Section Template
**Apply to:** Both ADR files

Standard section scaffold (no existing MADR in this repo — establish here as the project template):
```markdown
## Status
Accepted — [date]

## Context / Problem Statement
[1–3 sentences: what decision needed to be made and why it matters]

## Decision Drivers
- [driver 1]
- [driver 2]

## Options Considered
| Option | Description | Verdict |
|--------|-------------|---------|

## Decision Outcome
**[One-sentence locked verdict.]**

[Rationale paragraph]

## Consequences
**Positive:**
- [consequence]

**Negative / Tradeoffs:**
- [tradeoff]

## Open Dependencies
- **[RSCH-XX]:** [what is unresolved and which phase resolves it]
```

### Cross-reference linking convention
**Source:** `.planning/phases/01-dna-deep-dive-project-setup/01-DNA-CATALOGUE.md` §Technique 5 (uses "Phase 2 DEC-01" forward reference)
**Apply to:** Both ADRs — link to REQUIREMENTS.md, ROADMAP.md, and each other using relative markdown paths. Enables PRD (Phase 5) to cite both ADRs by stable relative path.

### "Never ship" callout pattern
**Source:** `.planning/research/PITFALLS.md` (single-topic risk callouts with clear consequence framing)
**Apply to:** DEC-01 §Options Considered — the "Covert / undisclosed recording" row must use explicit "never ship" language matching the REQUIREMENTS.md Out of Scope table: "Existential legal liability; the product is a disclosed, consent-first recorder."

## No Analog Found

None. Both ADRs have sufficient structural analogs in the existing planning corpus. The MADR format template above (Shared Patterns) is established here for the first time in this repo and becomes the project standard.

## Metadata

**Analog scope:** `.planning/phases/01-dna-deep-dive-project-setup/01-DNA-CATALOGUE.md`, `.planning/research/STACK.md`, `.planning/research/PITFALLS.md`, `.planning/REQUIREMENTS.md`
**DNA excerpts:** None required directly — DEC-01 references `01-DNA-CATALOGUE.md` §Technique 5 by link rather than re-quoting.
**Pattern extraction date:** 2026-06-25
