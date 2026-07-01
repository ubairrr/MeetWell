# MeetingAssist Retrospective

---

## Milestone: v2.0 — Build

**Shipped:** 2026-07-01
**Phases:** 6 | **Plans:** 42
**Timeline:** 2026-06-25 → 2026-07-01 (7 days)
**Commits:** 261
**Codebase at ship:** ~6,080 LOC TypeScript/TSX

### What Was Built

- Electron 42.5.0 app shell with hardened contextBridge IPC (18 typed channels), SQLCipher AES-256 DB, sqlite-vec, SessionManager FSM with DEC-01 consent guard enforced in main process (Phase 6)
- Dual-channel audio: audiotee 0.0.7 (Core Audio Taps, no purple indicator) + Chromium loopback fallback; Deepgram Nova-3 dual-WebSocket; encrypted transcript persistence in `transcript_segments` (Phase 7)
- Two-stage LLM artifact pipeline (verbatim quotes → structured MOM/summary/key points/action items); CitationValidator ≥90% Jaccard threshold; ArtifactReview UI with confirm/edit/dismiss; .ics export (Phase 8)
- 5-minute SummaryCardTimer → LiveSummaryBoard overlay; ArtifactReview panel; BreakAssistPanel + digest; SettingsPanel; full FSM session flow end-to-end (Phase 9)
- ContextEngine + EpochCompressor (rolling 800K-token context from `transcript_segments` ONLY); 60-minute Vitest test; OnBreak FSM transitions verified (Phase 10)
- Packaging pipeline + asarUnpack audit + adversarial eval harness (CGFS=1.000, EHR=0.000); 140 MB DMG produced (Phase 11)

### What Worked

- **PRD-first approach** — having ARCHITECTURE, FEATURE-SPEC, and AI-SPEC locked before coding eliminated scope churn. Zero rework from architectural misalignment.
- **Strict dependency chain** (6→7→8→9→10→11) — each phase built exactly on what the prior phase left. No integration surprises.
- **Two-stage artifact extraction pattern** — clear contract (verbatim quotes first, structured content from quotes only) made CitationValidator straightforward to implement and test.
- **Vitest for 60-minute test** — running the ContextEngine's compression pipeline in a unit test (not a live meeting) was the right call; caught real watermark bugs before production.
- **`mip_opt_out:true` as a code-level constant** — never a setting, never a config. Reduced security surface and eliminated a class of audit concerns.
- **Eval harness first-pass success** — CGFS=1.000, EHR=0.000 on first live harness run with no prompt tuning. The two-stage extraction + CitationValidator design is effective.

### What Was Inefficient

- **REQUIREMENTS.md traceability not maintained** — checkboxes and traceability table fell out of sync with actual completion status after Phase 7. Required a full audit pass at milestone close to confirm 46/46 satisfied. Future milestones: update REQUIREMENTS.md traceability at each phase close.
- **Phase 8 consolidated plan** — ArtifactPipeline was delivered as one large plan (08-PLAN.md) rather than the standard per-plan structure. This made it harder to track sub-task progress mid-execution. Future: use per-plan structure (08-01-PLAN.md, 08-02-PLAN.md…) even for tightly-coupled phases.
- **Code signing deferred** — no Apple Developer ID cert meant signing/notarization skipped. Should be treated as a Phase 0 setup item (obtain cert before build milestone) rather than a Phase 11 task. This was a known risk from Day 1 of the PRD that didn't get resolved in time.
- **Eval harness seeding** — plan was to seed the eval corpus in Phase 8; deferred to Phase 11. This added late-milestone pressure. Future: seed corpus incrementally starting from Phase 7/8.

### Patterns Established

- **`src/main/<domain>/` module boundaries** — all audio/STT/DB/LLM/session logic in main process; renderer is display-only. This boundary was never broken during the milestone.
- **Zod + `zod-to-json-schema` as single schema source of truth** — all LLM structured outputs validated against schemas in `src/shared/schemas/index.ts`.
- **Proposed-with-confirm contract** — all artifact items `status: 'proposed'`; no external write without explicit user confirmation. This is now a documented invariant.
- **IPC rejection guard** — any unlisted channel invoked from the renderer is rejected at the contextBridge allowlist level.
- **`asarUnpack` audit as a packaging checklist step** — verifying that both `better-sqlite3-multiple-ciphers` `.node` and `audiotee` binary are in `asarUnpack` is now a mandatory pre-build checklist item.

### Key Lessons

1. **Update traceability docs at phase close, not milestone close.** One-time traceability debt compounds. Mark REQUIREMENTS.md at each VERIFICATION.md sign-off.
2. **Obtain distribution certs before build.** Apple Developer ID cert is a months-long process in the worst case. Don't treat it as a Phase 11 task.
3. **Seed eval corpus progressively.** Start adding adversarial cases in Phase 8 when the pipeline first exists; don't defer corpus expansion to the packaging phase.
4. **ContextEngine anti-pattern documentation works.** The explicit "EpochCompressor reads transcript_segments ONLY — never summary_cards" rule (in STATE.md, REQUIREMENTS.md, and AI-SPEC) was the right call. Zero violations during execution.
5. **Consolidated plans (Phase 8) are harder to track.** Prefer per-plan granularity even for tightly coupled work — it makes progress clearer during execution.

### Cost Observations

- Model mix: ~90% sonnet, ~10% other (primarily execution phases; haiku for routine file ops)
- Sessions: ~15 across the 7-day build milestone
- Notable: Eval harness passed first live run (no iterations needed) — two-stage design + CitationValidator was the key efficiency win

---

## Cross-Milestone Trends

| Milestone | Duration | Phases | Plans | LOC | Key Pattern |
|-----------|----------|--------|-------|-----|-------------|
| v1.0 Discovery & PRD | 1 day | 5 | 17 | - | PRD-first; all decisions locked before coding |
| v2.0 Build | 7 days | 6 | 42 | ~6,080 | Strict dependency chain; two-stage LLM pattern |

### Traceability Maintenance

Both milestones experienced REQUIREMENTS.md traceability drift. This is now a known anti-pattern. Establish a per-phase traceability update step at VERIFICATION.md sign-off in v3.0.

### Eval-First Thinking

The two-stage extraction + CitationValidator + adversarial eval harness combination worked better than expected (CGFS=1.000 first run). Maintain this pattern in future LLM pipeline work.
