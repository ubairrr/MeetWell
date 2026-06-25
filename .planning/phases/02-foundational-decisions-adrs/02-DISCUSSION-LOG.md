# Phase 2: Foundational Decisions (ADRs) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-25
**Phase:** 2-Foundational Decisions (ADRs)
**Areas discussed:** Consent Gate UX, Retention Policy Defaults, On-device Mode Scope, ADR Format & Depth

---

## Consent Gate UX

| Option | Description | Selected |
|--------|-------------|----------|
| Per-meeting dialog | A short confirmation dialog appears every time the user starts a recording session | ✓ |
| One-time acknowledgment at setup | Setup wizard on first launch; user agrees once, no per-meeting friction | |
| Configurable | Default one-time, with optional per-meeting reminder in settings | |

**User's choice:** Per-meeting dialog

---

| Option | Description | Selected |
|--------|-------------|----------|
| Checkbox + Start button | Checkbox "I confirm all parties have consented" must be checked before Start Recording activates | ✓ |
| Named meeting + checkbox | User enters meeting name AND checks consent | |
| Just a modal with OK button | Modal states the requirement; user clicks OK | |

**User's choice:** Checkbox + Start button

---

| Option | Description | Selected |
|--------|-------------|----------|
| Always require all-party consent, no exceptions | Highest-bar standard globally, no jurisdiction modes | ✓ |
| Allow user to select jurisdiction/consent mode | User can declare one-party vs all-party region | |
| Acknowledge but don't implement | ADR notes complexity, ships all-party default, no relaxed mode | |

**User's choice:** Always require all-party consent, no exceptions

---

| Option | Description | Selected |
|--------|-------------|----------|
| On by default, user can turn off | Content protection always active; overlay never appears in screen-shares unless disabled | ✓ |
| Off by default, user can turn on | Overlay visible in screen-shares unless user enables protection | |
| You decide | Claude picks based on privacy-first posture | |

**User's choice:** On by default, user can turn off

---

## Retention Policy Defaults

| Option | Description | Selected |
|--------|-------------|----------|
| Always deleted immediately after transcription | Non-negotiable default, no toggle | |
| Deleted by default, user can opt-in to keep audio | Default deletes; settings toggle lets users keep raw audio | ✓ |
| Kept until meeting is deleted | Audio stored alongside transcript until session deleted | |

**User's choice:** Deleted by default, user can opt-in to keep audio

---

| Option | Description | Selected |
|--------|-------------|----------|
| Keep indefinitely until user deletes | No automatic expiry; user manages deletion | ✓ |
| Auto-delete after 90 days (user can extend) | Auto-expiry with configurable window | |
| User chooses at setup (no default) | Onboarding lets user pick retention window | |

**User's choice:** Keep indefinitely until user deletes

---

| Option | Description | Selected |
|--------|-------------|----------|
| Data persists unless user explicitly deletes first | DB stays on disk after uninstall; in-app delete action recommended | ✓ |
| App provides 'wipe all data' button; uninstall leaves DB on disk | Same as above with explicit in-app button | |
| Uninstall triggers automatic data deletion | Cleanup mechanism on uninstall | |

**User's choice:** Data persists unless user explicitly deletes first

---

## On-device Mode Scope

**Notes:** User clarified the question and decided to defer on-device mode entirely to a later phase. The DEC-02 ADR will note it as a planned future capability without committing to scope. Rationale: the distinction between full-offline (local STT + local LLM) and partial (local STT only) matters for the privacy claim — user wants to think through it later.

---

## ADR Format & Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Standard MADR format | Status, Context/Problem, Decision Drivers, Options Considered, Decision Outcome, Consequences | ✓ |
| Lightweight narrative | Prose: what was decided, why, what was rejected | |
| You decide | Claude picks format for planning-milestone context | |

**User's choice:** Standard MADR format

---

## Claude's Discretion

None — user made explicit choices in all areas.

## Deferred Ideas

- **On-device mode full specification** — scope (full offline vs. partial local-STT-only) and implementation architecture deferred to a later phase.
