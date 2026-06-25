# Phase 2: Foundational Decisions (ADRs) - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase produces two ADR documents — DEC-01 and DEC-02 — fixing the two existential product decisions that gate the legitimacy of the entire product. No product code is written. The deliverables are committed Markdown ADR files that downstream phases (Phase 3 research, Phase 5 PRD) treat as locked decisions.

Two outputs:
1. **DEC-01: Consent & Recording Posture ADR** — locks the disclosed-not-covert posture, all-party-consent default, consent gate design as a hard precondition to capture, and the separation of "hide own panel from own screen-share" (keep) from "conceal the fact of recording" (never ship).
2. **DEC-02: Data-handling & Privacy ADR** — locks local-first storage, encryption at rest (SQLCipher + safeStorage), retention defaults, the transcribe-then-delete-raw-audio stance, and notes on-device mode as a planned future capability.

</domain>

<decisions>
## Implementation Decisions

### ADR format
- **D-01:** Both ADRs use **standard MADR format** (Status, Context/Problem, Decision Drivers, Options Considered, Decision Outcome, Consequences). One file per ADR. Clean, referenceable from the PRD.

### DEC-01 — Consent gate design
- **D-02:** The consent gate fires **per-meeting** — a dialog appears every time the user starts a recording session. It does not fire once at setup and never again.
- **D-03:** The gate mechanism is a **checkbox + Start button**: "I confirm all meeting participants have been informed and consented to this recording." The checkbox must be checked before the Start Recording button becomes active. No checkbox → no capture.
- **D-04:** **Always require all-party consent — no jurisdiction exceptions.** The ADR fixes the highest-bar standard globally. The app does not offer a lower-consent mode for one-party jurisdictions; users in such jurisdictions may exceed the app's requirement, but the app does not relax it.

### DEC-01 — Content protection (hide overlay from screen-share)
- **D-05:** `setContentProtection(true)` (via Electron's `setContentProtection` → macOS `NSWindowSharingNone`) is **ON by default**. The user's overlay panel is never visible in their screen-share unless they explicitly turn off content protection in settings. The ADR explicitly separates this ("hide my private workspace from my own screen-share") from concealing the fact of recording (which is never the intent and never shipped).

### DEC-02 — Raw audio retention
- **D-06:** Raw audio is **deleted by default after transcription**. However, a settings toggle lets users opt-in to keep the raw audio file. The ADR records "delete after transcription" as the default stance and "keep audio" as an explicit opt-in, not the default.

### DEC-02 — Transcript and artifact retention
- **D-07:** Transcripts, MOM, summaries, and action items are **kept indefinitely until the user deletes them**. No automatic expiry. The user deletes individual meetings or all data via an explicit in-app action. This matches the product's core value ("trustworthy record").

### DEC-02 — Data on uninstall
- **D-08:** Data **persists on disk after uninstall** unless the user explicitly deletes it first. The ADR notes this and recommends the app surface a clear "Delete All Meeting Data" action in settings so users have a clean-delete path before uninstalling. No automatic cleanup mechanism is introduced.

### DEC-02 — On-device mode
- **D-09:** On-device/offline mode is a **planned future capability** — its scope and implementation details are deferred to a later phase. The DEC-02 ADR notes its existence as a future privacy-tier option without committing to specifics now.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 2: Foundational Decisions (ADRs)" — phase goal, success criteria (4 items), and the two ADR requirements (DEC-01, DEC-02)
- `.planning/REQUIREMENTS.md` §"Foundational Decisions — ADRs (DEC)" — DEC-01 and DEC-02 definitions including the required ADR content
- `.planning/PROJECT.md` — product vision, core value statement, and Key Decisions table (consent/stealth ethics open question marked as pending)

### DNA technique — stealth overlay (input to DEC-01)
- `.planning/phases/01-dna-deep-dive-project-setup/01-DNA-CATALOGUE.md` §"Technique 5: Overlay / Stealth Window Setup" — the `setContentProtection` / `setVisibleOnAllWorkspaces` mechanism, its verdict (`borrow-and-adapt`), and the note that consent/ethics posture is decided here in Phase 2

### Stack & architecture context
- `.claude/CLAUDE.md` §"Local Persistence & Encryption" — SQLCipher (`better-sqlite3-multiple-ciphers`) + Electron `safeStorage` (Keychain-backed) as the locked encryption approach for DEC-02
- `.claude/CLAUDE.md` §"macOS System-Audio Capture" — context on why raw-audio handling matters (loopback capture → transcript pipeline)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- This is a **planning-only repo** — no product code exists yet. Both ADRs are documentation artifacts.

### Established Patterns
- Auto-push Stop hook commits + pushes every change; `.planning/` is tracked. ADR files belong in the phase folder and are versioned as planning artifacts.

### Integration Points
- **DEC-01** is consumed by: Phase 3 RSCH-03 (vendor DPA / no-training confirmation gates DEC-02 fully), Phase 5 PRD (consent posture shapes onboarding UX spec).
- **DEC-02** is consumed by: Phase 3 RSCH-03 (vendor terms gate the final data-handling ADR), Phase 5 PRD (encryption + retention shapes the data model and storage spec).
- Both ADRs note their open dependency on RSCH-03 (vendor DPA/no-training confirmation) per the REQUIREMENTS.md DEC-02 clause.

</code_context>

<specifics>
## Specific Ideas

- The consent checkbox text can be iterated during implementation but must semantically match: "I confirm all meeting participants have been informed and consented to this recording."
- The "Delete All Meeting Data" settings action is a recommendation in DEC-02, not a full spec — Phase 5 PRD will specify the exact settings surface.
- On-device mode is flagged as "planned future capability" in DEC-02 — no scope commitment yet. Details deferred to a later phase.

</specifics>

<deferred>
## Deferred Ideas

- **On-device mode full specification** — scope (full offline vs. partial) and implementation details deferred to a later phase. DEC-02 notes its existence without committing to the architecture.

</deferred>

---

*Phase: 2-Foundational Decisions (ADRs)*
*Context gathered: 2026-06-25*
