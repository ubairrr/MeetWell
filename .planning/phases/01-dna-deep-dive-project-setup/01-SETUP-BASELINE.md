# Phase 1 Setup Baseline — MeetingAssist Operating Conventions

**Domain:** Version-control and workspace setup conventions for the MeetingAssist project
**Recorded:** 2026-06-25
**Confidence:** HIGH — verified from local repo state (git remote, .gitignore), corroborated by PROJECT.md / STATE.md / CLAUDE.md

> This document records the SETUP baseline as operating conventions. It does NOT re-wire git or hook setup — the repo and auto-push were wired at project initialization. The purpose is to make this state explicit and citable by later phases.

---

## SETUP-01 — Private Repo & Auto-Push Convention

**Requirement satisfied:** SETUP-01

### Remote Origin

```
git remote -v:
  origin  https://github.com/ubairrr/MeetingAssist.git (fetch)
  origin  https://github.com/ubairrr/MeetingAssist.git (push)
```

**VERIFIED** — `origin` resolves to `https://github.com/ubairrr/MeetingAssist.git` for both fetch and push. This is a private repository under the `ubairrr` GitHub account.

### Auto-Push Convention

Every turn that stops Claude Code automatically commits any working-tree changes and pushes them to `origin/main`. This is implemented as a **Claude Code Stop hook** wired at project initialization. The hook triggers after every Claude Code session stop, not just at manual commit points.

**Evidence source:** Documented in `.planning/PROJECT.md` §Constraints ("Every change is committed and pushed to the private GitHub repo `ubairrr/MeetingAssist` (auto-push Stop hook)"), `.planning/STATE.md`, and `.claude/CLAUDE.md` §Constraints. Recent commit history (`docs(...)`, `chore: auto-sync working tree` commits) corroborates the hook is active.

**Caveat (A1):** The `.claude/` directory — which holds the hook configuration — was sandbox-read-denied during the Phase 1 research session. This convention is documented from the project files listed above plus corroboration from the git remote and commit history. It is NOT derived from reading the hook script directly. If a human-verify of the exact hook config is wanted, inspect `.claude/settings.json` or `.claude/settings.local.json`.

**Convention:** Do not disable or bypass the Stop hook. Do not push sensitive data (API keys, secrets) — the `.gitignore` rules below prevent this for known patterns. If the hook config is ever modified, update this document.

---

## SETUP-02 — `.gitignore` Rules as Operating Conventions

**Requirement satisfied:** SETUP-02

The following rules are recorded from the actual `/Users/ubair/Gits/MeetingAssist/.gitignore` file (VERIFIED, read directly). Every rule below matches the file exactly.

### What Is Excluded from Version Control

**DNA reference repo:**

```
DNA/
```

The `DNA/` directory contains the Interview Helper reference application (Electron app v1.0.0). It is git-ignored because it contains a live `.env` file with API keys and a full `node_modules/` tree. It exists on the local machine as an architectural reference only and must never be pushed to GitHub.

**GSD framework tooling dirs:**

```
.claude/
.agents/
.gsd/
.codex/
.gemini/
.cursor/
```

These directories contain GSD AI-coding-assistant tooling (installed, reinstallable). They are not project code and are excluded. Note: the `.gitignore` comment in the file explicitly states that `.planning/` is intentionally NOT ignored — see below.

**Secrets and environment files:**

```
.env
.env.*
!.env.example
*.pem
*.key
.secrets
```

The `!.env.example` rule un-ignores the example environment file so it can be committed as a template. All real secret files (`.env`, `.env.production`, `.env.local`, etc.) remain excluded.

**Build and OS artifacts:**

```
node_modules/
dist/
build/
out/
release/
coverage/
.cache/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
Thumbs.db
*.swp
.idea/
.vscode/
```

Standard Node, Electron, and macOS/editor junk. `release/` excludes built Electron installers (`.dmg`, `.zip`) from version control.

### What IS Tracked

**`.planning/` is intentionally NOT listed in `.gitignore`.**

This is an explicit project decision. The research, PRD, roadmap, and planning deliverables that make up the Discovery & PRD milestone are the version-controlled work product for this milestone. They belong on GitHub. The `.gitignore` comment confirms: *".planning/ is intentionally NOT ignored — research, PRD and roadmap are this milestone's deliverables and belong on GitHub."*

### Summary Table

| Category | Rule | Tracked? |
|----------|------|----------|
| DNA reference repo | `DNA/` | No — excluded |
| GSD tooling dirs | `.claude/`, `.agents/`, `.gsd/`, `.codex/`, `.gemini/`, `.cursor/` | No — excluded |
| Real secrets | `.env`, `.env.*` (except `.env.example`), `*.pem`, `*.key`, `.secrets` | No — excluded |
| Example env template | `!.env.example` | Yes — un-ignored |
| Build artifacts | `node_modules/`, `dist/`, `build/`, `out/`, `release/`, etc. | No — excluded |
| OS / editor junk | `.DS_Store`, `*.swp`, `.vscode/`, `.idea/`, etc. | No — excluded |
| Planning deliverables | `.planning/` | **Yes — tracked (intentional)** |

---

## Operating Conventions Summary

1. **All commits and pushes go to `https://github.com/ubairrr/MeetingAssist.git` (private).** The Stop hook ensures this happens automatically after every Claude Code turn.
2. **`DNA/` and all GSD tooling directories stay git-ignored and never reach GitHub.** This protects the live API keys in `DNA/.env`.
3. **`.planning/` is version-controlled.** Research, PRD, roadmap, requirements, and planning deliverables are the deliverable artifact of this milestone.
4. **Secrets are excluded by pattern** (`.env`, `*.pem`, `*.key`). The `.env.example` template is the safe, committable substitute.

---

*Requirements satisfied by this document: SETUP-01, SETUP-02*
*Source: `/Users/ubair/Gits/MeetingAssist/.gitignore` (direct read, verified); git remote, commit history, PROJECT.md/STATE.md/CLAUDE.md (corroborating sources for SETUP-01)*
