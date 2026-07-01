# DEC-01: Consent & Recording Posture

**Status:** Accepted
**Decided:** 2026-06-25
**Deciders:** Product (ubair)
**Supersedes:** —
**Superseded by:** —

---

## Status

Accepted — 2026-06-25

This ADR satisfies requirement [DEC-01](../../REQUIREMENTS.md) from the Discovery & PRD milestone.

---

## Context / Problem Statement

MeetingAssist captures live meeting audio — microphone input ("You" channel) and system audio (the room's or call's audio output) — and produces transcripts, minutes of meeting, and actionable artifacts from that recording. Before any recording starts, the product must adopt a clear and fixed consent posture: the choice between a disclosed, consent-gated recording model and a covert recording model is an existential legal and ethical decision that gates every other product and architecture choice downstream (capture design, onboarding UX, marketing posture, vendor selection). This ADR fixes that posture permanently so Phase 3 research and the Phase 5 PRD cannot drift from this boundary.

---

## Decision Drivers

- **Legal defensibility across all operating jurisdictions** — multi-party consent recording laws vary across US states and countries; the highest-bar standard is defensible everywhere
- **User trust** — the product's core value proposition ("a trustworthy record of your meetings") depends on participants believing the record was made with their knowledge and consent
- **Ethical obligation to all meeting participants** — meeting participants who are recorded have rights, not just the app user who initiates the recording
- **Avoidance of existential liability** — covert recording is a criminal offence in multiple jurisdictions (e.g., California Penal Code §632, UK Regulation of Investigatory Powers Act); shipping covert recording would be an unsalvageable liability
- **Simplicity** — one consent posture globally, no jurisdiction branching, no lower-consent mode; reduces implementation complexity and eliminates the risk of misclassifying a user's jurisdiction

---

## Options Considered

| Option | Description | Rationale | Verdict |
|--------|-------------|-----------|---------|
| **A — Disclosed + all-party consent gate (per-meeting)** | A consent dialog fires every time the user starts a recording session. The dialog contains a checkbox ("I confirm all meeting participants have been informed and consented to this recording.") and a Start Recording button that is disabled until the checkbox is checked. No checkbox checked → no audio capture initiated. | Highest-bar consent standard; legally defensible globally; no per-session ambiguity; consent is re-confirmed for each specific meeting's participants. | **Chosen** (per D-02, D-03, D-04) |
| **B — Disclosed + one-party consent (jurisdiction-aware)** | A lower consent bar for jurisdictions where one-party consent is legal; the app detects or lets the user select their jurisdiction and relaxes the consent requirement accordingly. | Reduces per-meeting friction for some users in one-party jurisdictions. | Rejected — jurisdiction detection adds implementation complexity; trust cost of offering any lower-consent mode outweighs the friction saving; increases liability surface when jurisdiction is misclassified or the meeting spans jurisdictions. |
| **C — Setup-only consent acknowledgement** | A one-time gate at first run: the user acknowledges the consent requirement once and is never prompted again for subsequent recording sessions. | Reduces ongoing friction; user need only confirm once. | Rejected — no per-session accountability; user cannot confirm consent for each specific meeting's participants; a blanket one-time acknowledgement cannot substitute for per-meeting consent when participants differ. |
| **D — Covert / undisclosed recording** | No consent gate; the app records audio without informing or obtaining consent from meeting participants. | None acceptable. | **Never ship.** Existential legal and ethical liability. Recording without disclosure is a criminal offence in multiple jurisdictions. The product is a disclosed, consent-first recorder. Explicitly listed in the Out of Scope table of [REQUIREMENTS.md](../../REQUIREMENTS.md). |

---

## Decision Outcome

**MeetingAssist is a disclosed, all-party-consent recorder: the app gates every recording session behind a per-meeting consent checkpoint and never conceals the fact of recording from any participant.**

The four sub-decisions that compose this posture are locked as follows:

**Per D-02 — Per-meeting consent gate:**
The consent gate fires per-meeting — a dialog appears every time the user starts a recording session. It does not fire once at setup and never again. Per-session confirmation is required because each meeting has potentially different participants whose consent must be obtained for that specific meeting.

**Per D-03 — Checkbox + Start Recording mechanism:**
The gate mechanism is a checkbox with a disabled Start Recording button. The checkbox text reads: "I confirm all meeting participants have been informed and consented to this recording." The Start Recording button remains disabled until the checkbox is checked. No checkbox checked → no audio capture initiated. This mechanism creates an explicit, intentional confirmation action at the start of each recording session.

**Per D-04 — All-party consent, globally, no jurisdiction exceptions:**
All-party consent is required globally, with no jurisdiction exceptions. The app does not offer a lower-consent mode for one-party jurisdictions. Users in one-party jurisdictions may exceed the app's requirement, but the app does not relax its standard for them. One consistent consent bar globally eliminates jurisdiction-branching complexity and ensures the product is legally defensible in all markets.

**Per D-05 — Content protection: separating hide-from-screen-share from concealing recording:**
`setContentProtection(true)` (via Electron's `setContentProtection` API, which maps to macOS `NSWindowSharingNone` internally) is ON by default. This makes the user's MeetingAssist overlay panel invisible in the user's own screen-share output — the panel does not appear in the content the user is sharing with others in their video call. This is a **user-privacy feature**: it hides the user's private workspace (their meeting assistant panel) from their screen-share audience, just as a user would close a personal chat window before sharing their screen.

This use of `setContentProtection` is explicitly **separate** from any intent to conceal the fact of recording from meeting participants. Content protection hides the user's own overlay panel from the user's own screen-share. It does not make the recording invisible to participants, does not suppress notification to participants that recording is taking place, and is not a mechanism for covert recording. Concealing the fact of recording from participants is in Option D above — never ship.

Technical substrate: see [01-DNA-CATALOGUE.md §Technique 5](./../01-dna-deep-dive-project-setup/01-DNA-CATALOGUE.md) for the `setContentProtection` mechanism, its `borrow-and-adapt` verdict, and the stealth window primitives the DNA established as working on macOS.

---

## Consequences

**Positive:**
- **Legal defensibility** — per-meeting confirmation creates an auditable consent moment for every recording session; the consent posture is the highest-bar standard and is defensible in all jurisdictions
- **User trust** — the product's trustworthiness claim is grounded in a verifiable, per-session consent posture; "trustworthy record" is the core value and this consent gate is the foundation of that claim
- **Clear ethical posture** — all meeting participants are treated as having rights, not just the app user; the product cannot be characterized as a surveillance tool
- **Content protection default-on** — the user's overlay panel is not accidentally visible in their own screen-share; no action required from the user to preserve their privacy in screen-share contexts
- **Implementation simplicity** — one consent posture globally eliminates jurisdiction-detection logic and the associated edge cases and liability from misclassification

**Negative / Tradeoffs:**
- **Per-meeting friction** — users must confirm consent at the start of every recording session, including with the same recurring meeting participants. This is an accepted tradeoff: the friction is the cost of the trustworthy posture, and that posture is core to the product's value. The checkbox + disabled-button mechanism is intentionally lightweight to minimize friction while preserving accountability.
- **No lower-consent convenience mode** — users in one-party jurisdictions must still confirm all-party consent. Accepted — the complexity and trust cost of a tiered consent model outweigh the convenience gain for a subset of users.

---

## Open Dependencies

DEC-01 itself has no unresolved vendor or technical dependencies — the consent posture decision is fixed and can be implemented without any external confirmation.

The data-handling side of the recording posture (how transcripts and artifacts are stored, encrypted, retained, and whether raw audio is kept after transcription) is governed by [DEC-02](./02-DEC-02-data-handling-privacy.md). DEC-02 carries an open dependency on RSCH-03 (vendor DPA / no-training terms for Deepgram and the chosen LLM provider); see that ADR for details.
