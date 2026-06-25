# Phase 1: DNA Deep-Dive & Project Setup - Pattern Map

**Mapped:** 2026-06-25
**Files analyzed:** 4 deliverables (all Markdown analysis docs)
**Analogs found:** 4 / 4

> **Read this first.** Phase 1 ships **no product code** — its "files to be created" are FOUR focused Markdown analysis docs inside the phase folder (per CONTEXT.md D-01/D-02). So this map works on two axes that differ from a normal code phase:
> - **Document analog** — the existing analysis doc under `.planning/research/` (or `.planning/PROJECT.md`) whose *structure, voice, and citation style* each deliverable should follow. These are the real "patterns to copy."
> - **DNA source excerpts** — the few `file:line` snippets from the git-ignored `DNA/` reference tree that a deliverable will *quote*. These are the load-bearing evidence the catalogue/audio docs cite; they are **content**, not code to write.
>
> There is no source code to modify. The planner should treat the "Pattern Assignments" below as "write a doc shaped like analog X, citing DNA excerpts Y."

## File Classification

| Deliverable (to be created) | Role | Data Flow | Closest Analog | Match Quality |
|-----------------------------|------|-----------|----------------|---------------|
| `01-SETUP-BASELINE.md` (SETUP-01/02 — repo + auto-push + `.gitignore` conventions) | doc / config-record | transform (verified facts → recorded conventions) | `.planning/PROJECT.md` (Requirements/Key-Decisions register voice) | role-match |
| `01-DEV-BASELINE.md` (SETUP-03 — toolchain, Node/Electron line, proposed repo layout — **direction, not pinned**) | doc / config-record | transform (DNA stack + CLAUDE.md direction → conventions doc) | `.planning/research/STACK.md` | exact |
| `01-DNA-CATALOGUE.md` (DNA-01/02/03 — 5 techniques, 5-field entries, 3-verdict taxonomy) | doc / analysis | transform (DNA source reads → per-technique verdicts) | `.planning/research/ARCHITECTURE.md` | exact |
| `01-DNA-AUDIO-ASSESSMENT.md` (DNA-04 — real capture method + effective macOS floor) | doc / analysis | transform (DNA source/binary → assessment + RSCH-04 handoff) | `.planning/research/PITFALLS.md` (focused single-topic deep-dive voice) + `STACK.md` §macOS audio | role-match |

> Filenames above are a **recommendation** (Claude's Discretion per CONTEXT — latitude on filenames/section order). What is locked: four separate docs (D-01), all inside the phase folder (D-02).

## Shared Document Conventions (apply to ALL four deliverables)

The `.planning/research/*.md` docs are a coherent house style. Every Phase 1 deliverable should copy these conventions so it sits naturally beside the existing corpus and is citable by Phase 5.

**Header block** (copy from `.planning/research/STACK.md:1-5` / `ARCHITECTURE.md:1-3`):
```markdown
# <Title>

**Domain:** <one-line scope>
**Researched:** 2026-06-25      <!-- or "Mapped:" / "Assessed:" -->
**Confidence:** HIGH (direct local reads with file:line citations)
```

**Citation style** — every borrow-and-adapt mechanism claim carries an inline `file:line` to `DNA/src/...` (never root `main.js`, never `src/audio.js`, never `adapters/`). This is the corpus norm (see `ARCHITECTURE.md` intro: "read directly from `DNA/src/main.js`, `preload.js`...").

**`⚠ Correction` callouts** — when the DNA's own README overstates reality, the doc states the code reality and flags it. Pattern already used in `STACK.md` and seeded in `01-RESEARCH.md` "Doc-vs-Code Gaps". Copy that table verbatim into the catalogue.

**Verdict / decision tables** — prose backed by a compact table (the `STACK.md` "Executive Verdict on the Inherited DNA" table at `STACK.md:9-19` is the canonical shape for the catalogue's verdict column).

**Posture marker** — direction-not-pin docs explicitly mark final pins as out of scope (D-07). Mirror `STACK.md`'s "re-verify at build time" framing and `SUMMARY.md`'s "planning only" banner.

## Pattern Assignments

### `01-SETUP-BASELINE.md` (doc, SETUP-01/02)

**Document analog:** `.planning/PROJECT.md` (the project's fact/decision register — same "record verified state as a convention" job).

**Content source (no DNA code):** the verified SETUP facts already gathered in `01-RESEARCH.md` "SETUP Baseline Facts" (lines 204-215). Record-as-is; do **not** re-run git/hook setup (RESEARCH "Don't Hand-Roll").

**Facts to record:**
- `git remote -v` → `origin = https://github.com/ubairrr/MeetingAssist.git` (VERIFIED).
- `.gitignore` (read from `/Users/ubair/Gits/MeetingAssist/.gitignore`): `DNA/` ignored; GSD tooling (`.claude/ .agents/ .gsd/ .codex/ .gemini/ .cursor/`) ignored; secrets (`.env`, `.env.*` with `!.env.example`, `*.pem`, `*.key`) ignored; `.planning/` **NOT** listed → tracked.
- Auto-push = Claude Code Stop hook (wired at init). **Caveat to carry (A1):** `.claude/` hook config is sandbox-read-denied this session — document from PROJECT.md/STATE.md/CLAUDE.md, optionally add a one-line human-verify task. Non-blocking.

**No DNA excerpts** — this deliverable cites repo state, not DNA source.

---

### `01-DEV-BASELINE.md` (doc, SETUP-03)

**Document analog:** `.planning/research/STACK.md` — exact match. Copy its table-driven "DNA choice → verdict → action" layout and its "re-verify at build time" posture.

**Content source:** `01-RESEARCH.md` "Dev-Baseline Inputs" (lines 170-202) — the VERIFIED DNA stack table + the proposed `src/main/<domain>/` layout. Use the stack table at RESEARCH lines 174-188 directly.

**Critical accuracy fixes to honor (Doc-vs-Code Gaps):**
- DNA app version is **1.0.0** (package.json + all artifacts), NOT 1.1.0; `DNA/VERSION` (1.4.0) is GSD-tooling, not the app.
- Record **direction only** (D-07): Electron 40 → 41 LTS line, Nova-2 → Nova-3, keep React 19 / Vite 7, secrets → `safeStorage`, transcripts → SQLCipher. Mark exact pins + final `main/<domain>/` layout as **Phase 5 PRD / build-time** decisions.

**No DNA code excerpts to quote** (it cites `DNA/package.json` versions, already tabulated in RESEARCH). The proposed-layout code-fence at RESEARCH lines 191-201 is the artifact to reproduce.

---

### `01-DNA-CATALOGUE.md` (doc, DNA-01/02/03)

**Document analog:** `.planning/research/ARCHITECTURE.md` — exact match (it already maps DNA source → structured analysis with `file:line`). Copy its "map the proven DNA, flag what changes" framing.

**Structure (locked by D-04):** 5 entries, each with the 5-field structure — *what DNA does · why valuable · what to change for MeetingAssist · risk/effort · verdict*. **Verdict taxonomy (D-03):** `borrow-and-adapt` / `design-reference` / `leave-behind` (+ `defer/undecided` only if truly unclassifiable).

**Content backbone:** `01-RESEARCH.md` "Catalogue Source Map" (lines 105-145) — already carries every mechanism + `file:line` + recommended verdict. Plus the "Doc-vs-Code Gaps" table (RESEARCH 217-226) copied verbatim.

**DNA excerpts to quote (VERIFIED this session against the live tree):**

Technique 1 — dual-channel STT `speech_final` state machine (`borrow-and-adapt`, deep evidence per D-06). `DNA/src/main.js:102-109`:
```javascript
if (label === 'system') {
  currentQuestion += ' ' + transcript;
  if (data.speech_final && currentQuestion.trim().length > 10) {
    const question = currentQuestion.trim();
    currentQuestion = '';
    triggerLLM(question);
  }
}
```
Supporting cites: `DNA/src/renderer/audio.js:1-69`, `DNA/src/renderer/public/audio-processor.js:1-16`, `DNA/src/main.js:28-35, 79-123, 125-181`.

Technique 2 — OpenAI-`baseURL` provider seam (`borrow-and-adapt`, deep). `DNA/src/main.js:22-26`:
```javascript
function getLLMClient() {
  const apiKey = store.get('llmApiKey') || process.env.LLM_API_KEY;
  const baseURL = store.get('llmApiUrl') || process.env.LLM_API_URL;
  return new OpenAI({ apiKey, baseURL });
}
```
⚠ Correction to carry: seam is here, **NOT** in `DNA/adapters/` (that dir is GSD AI-assistant docs). Supporting: `SettingsPanel.jsx:3-9`, `main.js:46-69, 260-271, 309-332`.

Technique 3 — hardened `contextBridge` IPC allowlist (`borrow-and-adapt`, deep). `DNA/src/preload.js:10-29`:
```javascript
on: (channel, callback) => {
  const allowed = [
    'hotkey-triggered', 'capture-success', 'vision-analysis-success',
    'mode-changed', 'mic-transcript', 'system-transcript', 'transcript-error',
    'deepgram-ready', 'llm-answer', 'mic-toggle', 'dismiss-vision',
    'scroll-transcript', 'change-font-size',
  ];
  if (allowed.includes(channel)) {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  }
},
```
Window flags `DNA/src/main.js:234-238` (`nodeIntegration:false, contextIsolation:true`). Contrast cite (leave-behind): legacy `DNA/src/audio.js:3` assumes `nodeIntegration:true`.

Technique 4 — vision screenshot → downscale → model (`design-reference`, conceptual depth OK per D-06). `DNA/src/main.js:291-346` (resize at `303`, LLM call `310-332`). ⚠ Correction: DNA uses native `nativeImage.resize()`, **NOT** `sharp` (sharp absent from deps); MeetingAssist *recommends* `sharp`.

Technique 5 — overlay / stealth window setup (`borrow-and-adapt` for the technique; ethics call **DEFERRED to Phase 2 DEC-01**). `DNA/src/main.js:247-253`:
```javascript
mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
mainWindow.setAlwaysOnTop(true, 'screen-saver');
mainWindow.setContentProtection(true);
mainWindow.setIgnoreMouseEvents(true, { forward: true });
```
Plus `app.dock.hide()` at `main.js:286`. ⚠ Corrections: `setContentProtection(true)` *maps internally to* `NSWindowSharingNone` (constant never named); `LSUIElement` is documented-but-NOT-implemented (no key in shipped `Info.plist`).

**Leave-behind list (conceptual only):** copy RESEARCH lines 137-145 — legacy `src/audio.js`, root `main.js` duplicate, interview-specific prompts (`main.js:51-61`), plaintext `electron-store` keys, Nova-2 literal, `DNA/adapters/`.

---

### `01-DNA-AUDIO-ASSESSMENT.md` (doc, DNA-04)

**Document analog:** `.planning/research/PITFALLS.md` (focused, single-topic, "here is the real risk + the handoff" voice) layered with `STACK.md`'s §"macOS System-Audio Capture" table shape.

**Content backbone:** `01-RESEARCH.md` "DNA-04 Audio-Capture Assessment" (lines 147-168) — complete with method, flag, channel handling, permissions, and the macOS-floor evidence table.

**Facts to record:**
- Real method: Chromium ScreenCaptureKit loopback via `desktopCapturer` + `getUserMedia({ chromeMediaSource:'desktop' })`, video tracks discarded (`DNA/src/main.js:202-207`, `DNA/src/renderer/audio.js:11-37`).
- Mandatory flag: `--enable-features=MacLoopbackAudioForScreenShare` (`DNA/package.json:8,11`) — capture silently fails without it.
- Channels stay separate end-to-end (no diarization; "You vs Other" = which physical channel).
- Permission: macOS **Screen Recording** (purple indicator); failure path `main.js:209-223`.
- **Effective floor = macOS 12.0 (Monterey)** from shipped binary `Info.plist` `LSMinimumSystemVersion`.
- **RSCH-04 handoff:** 12.0 is the *packaging floor / starting hypothesis* only; the spike must validate loopback reliability across 12/13/14/15 under multi-speaker load and declare the supported floor (AudioTee premium path needs 14.2+).

**No code excerpt required** (the assessment is prose + the evidence table at RESEARCH 159-166); cite `file:line` inline.

## No Analog Found

None. All four deliverables have a clear document analog in `.planning/research/` or `.planning/PROJECT.md`. (The corpus was purpose-built as the analysis-doc house style this phase extends.)

## Metadata

**Document-analog scope:** `.planning/research/` (STACK, ARCHITECTURE, PITFALLS, FEATURES, SUMMARY), `.planning/PROJECT.md`.
**DNA excerpt scope:** `DNA/src/main.js`, `DNA/src/preload.js`, `DNA/src/renderer/audio.js`, `DNA/package.json` (git-ignored reference tree; `src/...` paths only — never root `main.js`, `src/audio.js`, or `adapters/`).
**Excerpts re-verified against live tree:** `main.js:22-26`, `main.js:102-109`, `main.js:247-253`, `preload.js:10-29` — all match `01-RESEARCH.md` citations.
**Pattern extraction date:** 2026-06-25
