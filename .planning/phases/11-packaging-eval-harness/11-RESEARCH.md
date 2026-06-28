# Phase 11: Packaging + Eval Harness — Research

**Researched:** 2026-06-28
**Domain:** Electron packaging, macOS notarization, TCC permissions, adversarial eval harness design
**Confidence:** HIGH (all info from existing PRD docs + codebase inspection)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01–D-05:** Packaging uses electron-builder 26.15.3; notarize via @electron/notarize 3.1.1 notarytool; asarUnpack covers better-sqlite3-multiple-ciphers + audiotee; macOS < 14.2 → error dialog + exit; TCC denied → instruction card with deep-link.
- **D-06–D-10:** Eval harness is `eval/harness.ts`, standalone TypeScript; corpus = 60 files; shipping gate = CGFS ≥ 0.85 + EHR ≤ 0.05 + per-category ≥ 0.75; uses ArtifactPipeline in-memory with mock win; token overlap = whitespace-split.

### Deferred
- App Store submission, real-recording corpus, Windows/Linux packaging — post-launch.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PACK-01 | `electron-builder --mac` succeeds; signed + notarized DMG produced; `spctl --assess --verbose` passes on the DMG | electron-builder.yml base config exists; notarize.js stub needs implementation; @electron/notarize 3.1.1 installed |
| PACK-02 | App launches from DMG on fresh macOS 14.2+ without DB or entitlement error; macOS < 14.2 shows clear error and exits | macOS version check needed in src/main/index.ts; entitlements plist is complete |
| PACK-03 | audiotee system audio works in packaged app; asarUnpack covers both better-sqlite3-multiple-ciphers .node and audiotee binary; native module ABI matches Electron's Node version | electron-builder.yml asarUnpack entries exist but need verification; npmRebuild: true is set |
| PACK-03a | Packaging smoke test deferred from Phase 6: `electron-builder --mac --dir` produces .app bundle that launches without DB error | Smoke test of .app bundle |
| PACK-04 | `node eval/harness.ts` reports CGFS ≥ 0.85 on 60-transcript adversarial corpus | eval/harness.ts needs implementation; corpus has 10 files, needs 50 more |
| PACK-05 | `node eval/harness.ts` reports EHR ≤ 0.05 on 60-transcript adversarial corpus; both PACK-04 and PACK-05 must pass simultaneously | Same harness run as PACK-04 |

</phase_requirements>

---

## Current State Audit

### What exists and is complete
- `electron-builder.yml`: base config with `hardenedRuntime: true`, `entitlements`, `asarUnpack` globs, `afterSign: scripts/notarize.js`
- `build/entitlements.mac.plist`: complete with `allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`
- `@electron/notarize` 3.1.1: installed in devDependencies
- `eval/corpus/`: 10 test cases (4 standard_sync, 4 fabrication_bait, 2 short_no_content)
- `eval/smoke-test.ts`: demonstrates in-memory DB seeding + mock win + ArtifactPipeline run pattern
- `eval/tsconfig.json`: configured for TypeScript eval scripts with baseUrl paths

### What is a stub or incomplete
- `scripts/notarize.js`: stub — logs "skipped" and returns. Needs real @electron/notarize notarytool implementation.
- `eval/harness.ts`: does NOT exist yet. Needs to be created from scratch.
- macOS version gate: NOT in `src/main/index.ts`. Needs to be added.
- TCC permission onboarding: NOT implemented. Needs to be added.
- Corpus: 50 more test cases needed across 6 remaining categories.

### asarUnpack audit
Current `electron-builder.yml` asarUnpack entries:
```
- 'resources/**'
- '**/node_modules/better-sqlite3-multiple-ciphers/**'
- '**/node_modules/better-sqlite3-multiple-ciphers/**/*.node'
- '**/node_modules/sqlite-vec/**'
- '**/node_modules/sqlite-vec-darwin-arm64/**'
- '**/node_modules/sqlite-vec-darwin-x64/**'
- 'resources/audiotee'
```

The `audiotee` binary is in `extraResources` (from `node_modules/audiotee/bin/audiotee` to `audiotee`), which means it lands in `Contents/Resources/audiotee` in the .app bundle. The `resources/audiotee` asarUnpack entry is correct for this. However, `audiotee` is a Swift binary — it needs to be individually code-signed in the packaging step for hardened runtime compatibility.

### npmRebuild
`npmRebuild: true` is set in electron-builder.yml. This triggers electron-rebuild automatically during packaging, which rebuilds native modules (better-sqlite3-multiple-ciphers, sqlite-vec) against Electron's Node ABI. This is correct.

### notarize.js Implementation
`@electron/notarize` 3.1.1 API:
```javascript
const { notarize } = require('@electron/notarize')
await notarize({
  tool: 'notarytool',
  appPath,  // path to the .app bundle
  appleId: process.env.APPLE_ID,
  appleIdPassword: process.env.APPLE_ID_PASSWORD,  // app-specific password
  teamId: process.env.APPLE_TEAM_ID,
})
```
Skip gracefully if env vars are not set (local dev / CI without credentials).

### macOS version check
```javascript
import { release } from 'os'
// Darwin kernel 23.2.0 corresponds to macOS 14.2
const [major] = release().split('.').map(Number)
if (major < 23) { // macOS 14.2 = Darwin 23.2; major < 23 means < macOS 14
  dialog.showErrorBox('MeetingAssist requires macOS 14.2+', 
    'This version of MeetingAssist requires macOS 14.2 (Sonoma) or later for system audio capture. Please update your macOS.')
  app.exit(1)
}
// More precise check for 14.0/14.1 (Darwin 23.0, 23.1):
if (major === 23) {
  const [, minor] = release().split('.').map(Number)
  if (minor < 2) { /* same error + exit */ }
}
```

### TCC permissions
- Microphone: `systemPreferences.getMediaAccessStatus('microphone')` → 'granted' | 'denied' | 'restricted' | 'not-determined'
- Screen capture: `systemPreferences.getMediaAccessStatus('screen')` → same values
- Deep-link to System Preferences: `shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone')`
- Screen capture: `shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')`
- Check should run after `app.whenReady()` but BEFORE creating the overlay window — or render the check result into the consent gate view.

### Eval harness architecture
Building on `eval/smoke-test.ts` pattern:
1. Load all `eval/corpus/test_*.json` files
2. For each `AdversarialTestCase`:
   a. Create in-memory Database with ALL_DDLS
   b. Insert meetings row + transcript_segments rows from transcript text
   c. Run `ArtifactPipeline.run()` with mock win
   d. Collect `MeetingArtifacts` output
   e. Citation verifier: for each action item's `citation_anchor.quote_full`, compute token overlap against transcript
   f. Compute per-case CGFS and EHR
3. Aggregate per-category CGFS and EHR
4. Apply three-gate shipping check
5. Write `eval/corpus/eval_report.json`

### AdversarialTestCase format
```typescript
interface AdversarialTestCase {
  transcript_id: string;
  category: string;
  transcript: string;  // [MM:SS] Speaker: text format
  ground_truth: {
    action_items: Array<{
      description: string;
      assignee_label: string;
      due_date: string | null;
      source_quote: string;
    }>;
    decisions: Array<{
      description: string;
      source_quote: string;
    }>;
    dates: Array<{
      description: string;
      raw_expression: string;
      resolved_date: string | null;
      source_quote: string;
    }>;
  };
  adversarial_injections?: Array<{
    description: string;
    expected_behavior: 'not-extracted' | 'flagged-inferred';
  }>;
}
```

### Corpus category gaps (50 needed)
| Category | Have | Need | To Add |
|----------|------|------|--------|
| standard_sync | 4 | 10 | 6 more |
| action_item_dense | 0 | 10 | 10 new |
| date_heavy | 0 | 10 | 10 new |
| high_speaker_count | 0 | 5 | 5 new |
| fabrication_bait | 4 | 10 | 6 more |
| attribution_bait | 0 | 5 | 5 new |
| implicit_inference_traps | 0 | 5 | 5 new |
| short_no_content | 2 | 5 | 3 more |
| **Total** | **10** | **60** | **50** |

File naming: `test_11_standard_sync_05.json` through `test_60_short_no_content_05.json` (sequential, 2-digit index).

---

## Open Questions

- **Q-01:** Apple Developer credentials availability — notarization requires valid APPLE_ID, APPLE_ID_PASSWORD (app-specific), APPLE_TEAM_ID env vars. If not available in the environment, the DMG can be built unsigned; notarization step is skipped gracefully.
- **Q-02:** Code-signing identity — `mac.identity` in electron-builder.yml defaults to auto-discovery from the macOS keychain. If no Developer ID Application certificate is installed, signing fails. Builder needs to document the credential setup.
- **Q-03:** CGFS baseline before tuning — unknown; will be revealed when harness runs for the first time. Budget 2–3 prompt tuning cycles if CGFS < 0.85.
