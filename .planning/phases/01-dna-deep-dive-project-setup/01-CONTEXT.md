# Phase 1: DNA Deep-Dive & Project Setup - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the Phase 1 **documentation/analysis artifacts** — it writes no product code and does not re-do git setup (repo, auto-push, and `.gitignore` were already wired at init; this phase only documents them).

Four outputs, covering requirements SETUP-01/02/03 and DNA-01/02/03/04:
1. **Setup-baseline record** — confirms the private repo + auto-push and the `.gitignore` rules (DNA/, GSD tooling, secrets ignored; `.planning/` tracked) as the operating conventions (SETUP-01, SETUP-02).
2. **Dev-baseline / project-conventions doc** — fixes the toolchain, the Node/Electron line, and the repo layout direction for the future app (SETUP-03).
3. **Selective-adoption catalogue** — each proven DNA technique with an explicit verdict (borrow-and-adapt / design-reference / leave-behind) and per-technique analysis; explicitly NOT a wholesale port (DNA-01, DNA-02, DNA-03).
4. **DNA audio-capture assessment** — the DNA's real capture approach and its effective minimum macOS version, written as input to the RSCH-04 spike and the supported-OS floor (DNA-04).

</domain>

<decisions>
## Implementation Decisions

### Deliverable structure
- **D-01:** Produce **separate, focused docs** rather than one consolidated file — each output is independently citable by later phases (the audio assessment feeds RSCH-04; the catalogue + conventions feed the PRD architecture in Phase 5).
- **D-02:** All Phase 1 docs live **inside the phase folder** (`.planning/phases/01-dna-deep-dive-project-setup/`) where GSD expects them. The two durable references (dev-baseline/conventions and the selective-adoption catalogue) are the long-lived pair the build milestone will lean on; no separate top-level `docs/` folder is introduced this phase.

### Catalogue format & verdicts
- **D-03:** Verdict taxonomy = the roadmap's **three verdicts**: `borrow-and-adapt` (lift the technique, change it for MeetingAssist), `design-reference` (re-implement clean, learn from theirs), `leave-behind`. Add a fourth verdict `defer/undecided` ONLY if a technique genuinely cannot be classified yet.
- **D-04:** Each catalogue entry uses a **5-field structure**: *what DNA does · why it's valuable · what to change for MeetingAssist · risk/effort · verdict*.
- **D-05:** Techniques catalogued (at minimum): dual-channel real-time STT handling (the `speech_final` accumulation state machine), the OpenAI-`baseURL` provider seam, hardened `contextBridge` IPC, the vision screenshot→sharp→model round-trip, and overlay/stealth window setup. The stealth verdict notes the consent/ethics question is decided in Phase 2 (DEC-01), not here.

### DNA read evidence depth
- **D-06:** **Code-level evidence** (`file:line` citations + real mechanism writeups) for the high-value techniques intended for `borrow-and-adapt`, so the build milestone can go straight to the proven implementation. **Conceptual summaries** suffice for `leave-behind` techniques — do not over-invest in things we won't take.

### Baseline locking posture
- **D-07:** The dev-baseline doc **records direction + rationale, it does not final-pin**. Capture the Node/Electron line, toolchain, and a *proposed* `main/<domain>/` repo layout — but explicitly mark exact-version pinning and the final layout as **PRD (Phase 5) / build-time decisions**. This respects the roadmap (final stack ratified in the PRD) and REQUIREMENTS.md Out-of-Scope ("Final tech-stack version pinning — re-verify and pin at build time").

### Claude's Discretion
- The user delegated all four gray areas ("go with your defaults"). Claude has latitude on exact doc filenames, section ordering, and table vs. prose formatting within each deliverable, as long as the decisions above hold.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 1: DNA Deep-Dive & Project Setup" — phase goal + the 4 success criteria this phase must make TRUE
- `.planning/REQUIREMENTS.md` §"Setup (SETUP)" and §"DNA Deep-Dive" — SETUP-01/02/03, DNA-01/02/03/04 definitions and the milestone-as-discovery framing
- `.planning/PROJECT.md` — product vision, the DNA "reference not clone" thesis, and the Key Decisions table

### Stack & technique direction (already-recommended, to be ratified later)
- `.claude/CLAUDE.md` §"Executive Verdict on the Inherited DNA" + §"Recommended Stack" — the DNA-choice verdicts and recommended stack the dev-baseline doc ratifies-as-direction (not final-pin)
- `.claude/CLAUDE.md` §"macOS System-Audio Capture" — the `electron-audio-loopback` vs `AudioTee.js` framing the DNA audio-capture assessment (DNA-04) compares the DNA's real approach against

### DNA reference repo (git-ignored, local-only — never pushed)
- `DNA/main.js` — Electron main process, window/overlay setup, IPC surface
- `DNA/src/` (renderer `App.jsx`, preload) — UI, `contextBridge` allowlist, hotkeys
- `DNA/adapters/` — provider-agnostic LLM layer (OpenAI `baseURL` seam)
- DNA audio module (locate the dual-channel STT / `speech_final` state machine; expected `audio.js` or under `src/`)
- `DNA/package.json`, `DNA/vite.config.js`, `DNA/VERSION`, `DNA/CHANGELOG.md`, `DNA/build/`, `DNA/release/` — stack versions, build/packaging, and the effective minimum macOS version for DNA-04

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- This is a **planning-only repo** — no product code exists yet. The only "code" assets are the DNA reference repo (`DNA/`, git-ignored) being mined and the GSD/.planning tooling.

### Established Patterns
- Auto-push Stop hook commits + pushes every change to `ubairrr/MeetingAssist`; `DNA/` and GSD tooling are git-ignored, `.planning/` is tracked. Phase 1 documents these as conventions (SETUP-01/02), it does not change them.

### Integration Points
- Phase 1 outputs are consumed by: Phase 3 RSCH-04 (audio-capture assessment → capture spike) and Phase 5 PRD (conventions + catalogue → architecture and build-order).

</code_context>

<specifics>
## Specific Ideas

- DNA is v1.1.0, Electron 40 / React 19 / Vite 7 per PROJECT.md — the dev-baseline doc records the bump direction (Electron 41 LTS line) without final-pinning.
- The stealth/overlay catalogue entry must defer the keep-vs-drop ethics call to Phase 2 (DEC-01) — Phase 1 documents the *technique* and its mechanism, not the product posture.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Stack ratification → Phase 5 PRD; consent/stealth posture → Phase 2 DEC-01; audio-capture validation spike → Phase 3 RSCH-04. These are roadmap-scheduled, not deferred ideas.)

</deferred>

---

*Phase: 1-DNA Deep-Dive & Project Setup*
*Context gathered: 2026-06-25*
