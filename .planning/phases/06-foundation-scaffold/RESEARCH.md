# Phase 6: Foundation & Scaffold — Research

**Researched:** 2026-06-26
**Domain:** Electron 42 + Vite 7 + React 19 desktop app scaffolding; SQLCipher DB init; hardened contextBridge IPC; SessionManager FSM
**Confidence:** MEDIUM (stack well-understood; native module path edge cases are LOW)

---

## Summary

Three things matter most for Phase 6 to succeed:

1. **`electron-vite` is the correct scaffold tool.** Use `npm create @quick-start/electron@latest` with the `react-ts` template. It gives you the main/renderer/preload three-config split, HMR, and the correct native module external wiring out of the box. Manual Vite wiring is unnecessary and error-prone for this stack.

2. **Native module path hygiene is the highest Phase 6 risk.** `better-sqlite3-multiple-ciphers` and `sqlite-vec` both require `asarUnpack` configuration AND exclusion from Vite's bundle (`rollupOptions.external`). Failing to do both causes hard-to-debug load errors that only surface in packaged builds. Configure `asarUnpack` now even though Phase 6 has no packaging step — it must be correct before Phase 7 starts.

3. **Use Electron 42.5.0 (current `latest`).** The RSCH-04 spike ran on 42.5.0. Electron 41.9.0 is still on the 41.x track but 42 is now `latest` on npm. Either is acceptable per `05-BUILD-ORDER.md §6` — pin to whichever you install; do not drift between dev and build.

**Primary recommendation:** Scaffold with `electron-vite` + `react-ts` template, pin Electron to 42.5.0, set up `asarUnpack` and `rollupOptions.external` for native modules immediately, implement the FSM as a plain TypeScript class (no XState), and wire all 18 IPC channels as stubs on day one.

---

## Project Constraints (from CLAUDE.md)

| Directive | Required Behavior |
|-----------|------------------|
| Electron 41 LTS (or 42 stable — re-verify at build) | Pin to 42.5.0 (current `latest`; RSCH-04 spike validated on 42.5.0) |
| React 19 hooks-only | No class components anywhere in renderer |
| `better-sqlite3-multiple-ciphers` (SQLCipher AES-256) | Required — `@journeyapps/sqlcipher` is explicitly forbidden |
| `safeStorage` for DB key | DB key generated/stored via macOS Keychain; `electron-store` for non-sensitive prefs only |
| `sqlite-vec` 0.1.9 | Pin to 0.1.9 — not latest (0.1.9 is already latest as of research date) |
| `audiotee` Swift binary in `asarUnpack` | Must be configured in Phase 6 even though audio is Phase 7 |
| `electron-builder` + `hardenedRuntime: true` | `altool` is forbidden — use `@electron/notarize` → notarytool |
| contextBridge hardened allowlist | No raw `ipcRenderer` in renderer; typed channel allowlist only |
| All audio/DB/LLM logic in Electron main process | Renderer is display-only |
| SessionManager FSM in main process | All session transitions go through FSM; direct `CaptureService` calls are forbidden |
| Consent gate FSM guard in main process | Not a UI-only check; FSM blocks `PreCapture → Capturing` until `consent-confirmed` arrives |
| No direct repo edits outside GSD workflow | Use `/gsd-execute-phase` for all changes |

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-01 | App launches from `npm run dev`; overlay panel on right edge, always-on-top, dock-free, hidden from screen-share | §1 (electron-vite dev script), §5 (BrowserWindow overlay config) |
| FOUND-02 | Overlay window: always-on-top (`screen-saver` level), no dock icon, `setContentProtection(true)` | §5 (overlay window configuration) |
| FOUND-03 | SQLCipher AES-256 DB opens on first launch; `safeStorage` generates and stores key in macOS Keychain | §2 (DB open sequence), §3 (safeStorage pattern) |
| FOUND-04 | All 7 DB tables created on first launch | §2 (DB DDL execution sequence) |
| FOUND-05 | `sqlite-vec` extension loads from `asarUnpack` path immediately after DB open | §3 (sqlite-vec loading) |
| FOUND-06 | Hardened contextBridge with all 18 typed channels; unlisted channel invocations rejected | §4 (contextBridge allowlist) |
| FOUND-07 | `SessionManager` FSM enforces `Idle → PreCapture`; blocks `PreCapture → Capturing` until consent event | §7 (SessionManager FSM) |
| FOUND-08 | `ConsentGateScreen` renders in `PreCapture` state; Start button disabled until checkbox checked | §8 (ConsentGate component) |
| FOUND-09 | `electron-builder --mac --dir` produces `.app` bundle launching without DB or entitlement error | §6 (electron-builder config) |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Electron app lifecycle (ready, window creation) | Main process | — | `app` API is main-only |
| SQLCipher DB open/init (7 tables) | Main process | — | DB I/O never runs in renderer |
| `safeStorage` key management | Main process | — | `safeStorage` API is main-only |
| `sqlite-vec` extension loading | Main process | — | Called on the `better-sqlite3` instance in main |
| SessionManager FSM | Main process | — | Authoritative session state; renderer reflects via IPC push |
| Consent gate enforcement | Main process (FSM guard) | Renderer (UX) | Main enforces; renderer provides UI |
| IPC bridge / contextBridge allowlist | Preload script | — | Typed allowlist; no raw `ipcRenderer` |
| `ConsentGate.tsx` component | Renderer | IPC | Display and user input only |
| `App.tsx` + `useSessionState` hook | Renderer | IPC | Drives conditional rendering from `session-state-changed` pushes |
| `electron-builder` packaging config | Build tooling | — | `package.json` `build` section; not runtime |
| `audiotee` binary in `asarUnpack` | Build config | — | Must be declared now for Phase 7; no runtime use in Phase 6 |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `electron` | 42.5.0 [VERIFIED: npm registry] | Desktop shell; overlay window; contextBridge | Current `latest`; RSCH-04 spike validated on this exact version |
| `electron-vite` | 5.0.0 [VERIFIED: npm registry] | Unified build tool for main/preload/renderer with HMR | Official electron-vite project; 538K weekly downloads |
| `vite` | 7.3.6 [VERIFIED: npm registry] | Renderer bundler | Locked at 7.x — electron-vite 5.0.0 does NOT support Vite 8 |
| `react` | 19.2.7 [VERIFIED: npm registry] | UI framework | Locked choice (CLAUDE.md) |
| `react-dom` | 19.2.7 [VERIFIED: npm registry] | React DOM renderer | Paired with react |
| `@vitejs/plugin-react` | 6.0.3 [VERIFIED: npm registry] | React Fast Refresh plugin for Vite | Standard Vite+React pairing |
| `better-sqlite3-multiple-ciphers` | 12.11.1 [VERIFIED: npm registry] | SQLCipher AES-256 encrypted SQLite | Locked choice; supports Electron 42 |
| `sqlite-vec` | 0.1.9 [VERIFIED: npm registry] | Vector extension for SQLite | Locked version per CLAUDE.md |
| `electron-store` | 11.0.2 [VERIFIED: npm registry] | Non-sensitive prefs persistence | Locked choice; never for transcripts/secrets |

### Supporting (Dev)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@electron/rebuild` | 4.0.4 [VERIFIED: npm registry] | Rebuild native modules for Electron ABI | Required `postinstall` step |
| `@electron/notarize` | 3.1.1 [VERIFIED: npm registry] | macOS notarization via notarytool | Phase 6 stub; full use in Phase 11 |
| `electron-builder` | 26.15.3 [VERIFIED: npm registry] | App packaging and distribution | `--mac --dir` for smoke test in Phase 6 |
| `typescript` | 5.x [ASSUMED] | Type safety | Standard for any TS project |
| `@types/react` | 19.2.17 [VERIFIED: npm registry] | React TypeScript definitions | Paired with react 19 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `electron-vite` | Manual Vite wiring | Manual setup is error-prone; electron-vite handles CJS/ESM split, preload sandboxing, and HMR correctly |
| Plain TypeScript FSM class | XState v5 | XState adds ~20KB bundle and conceptual overhead for a 6-state machine; plain class is sufficient and zero-dep |
| `electron-builder` | `electron-forge` | BUILD-ORDER uses electron-builder throughout; switching tools mid-build is not worth it |

**Installation:**

```bash
# Scaffold (run once to create project structure)
npm create @quick-start/electron@latest . -- --template react-ts

# Pin exact versions after scaffold
npm install electron@42.5.0 --save-dev
npm install react@19.2.7 react-dom@19.2.7
npm install better-sqlite3-multiple-ciphers@12.11.1
npm install sqlite-vec@0.1.9
npm install electron-store@11.0.2
npm install -D @electron/rebuild@4.0.4 electron-builder@26.15.3 @electron/notarize@3.1.1
```

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads/wk | Source Repo | Verdict | Disposition |
|---------|----------|-----|--------------|-------------|---------|-------------|
| `electron` | npm | ~10 yrs | Very high | github.com/electron/electron | OK | Approved |
| `electron-vite` | npm | ~3 yrs | 537,718 | github.com/alex8088/electron-vite | OK | Approved |
| `better-sqlite3-multiple-ciphers` | npm | Active | 62,510 | github.com/m4heshd/better-sqlite3-multiple-ciphers | SUS (too-new signal) | Flagged — pre-authorized by locked decision in CLAUDE.md; use as-is |
| `electron-builder` | npm | ~8 yrs | 2,931,972 | github.com/electron-userland/electron-builder | SUS (too-new signal) | Flagged — industry-standard tool; SUS flag is a false positive from recent release date; approved |
| `electron-store` | npm | ~7 yrs | 1,005,645 | github.com/sindresorhus/electron-store | OK | Approved |
| `@electron/notarize` | npm | ~4 yrs | 4,383,902 | github.com/electron/notarize | OK | Approved |
| `@electron/rebuild` | npm | ~4 yrs | 4,055,461 | github.com/electron/rebuild | OK | Approved |
| `sqlite-vec` | npm | ~2 yrs | 2,966,151 | github.com/asg017/sqlite-vec | OK | Approved |

**Packages removed due to SLOP verdict:** none

**Packages flagged as SUS:** `better-sqlite3-multiple-ciphers` and `electron-builder` triggered the `too-new` signal due to recent release dates (not because they are suspicious — both are pre-authorized in CLAUDE.md). No human-verify checkpoint needed; both are locked decisions.

---

## Architecture Patterns

### System Architecture Diagram

```
npm run dev
    │
    └─► electron-vite dev
              │
              ├─► [main] src/main/index.ts
              │         app.on('ready') → createOverlayWindow()
              │         → open DB (safeStorage key → PRAGMA key → sqlite-vec.load() → 7 DDLs)
              │         → new SessionManager() [FSM: Idle]
              │         → ipcMain.handle() for 12 outbound channels (stubs)
              │         → ipcMain.on() for 6 inbound channels (stubs)
              │         ↓ session-state-changed IPC push on FSM transitions
              │
              ├─► [preload] src/preload/index.ts
              │         contextBridge.exposeInMainWorld('electronAPI', {
              │           invoke(ch, payload): validates against ALLOWED_INVOKE list → ipcRenderer.invoke
              │           on(ch, cb): validates against ALLOWED_LISTEN list → ipcRenderer.on
              │           off(ch, cb): ipcRenderer.off
              │         })
              │
              └─► [renderer] src/renderer/main.tsx
                        ReactDOM.render(<App/>)
                        App.tsx
                          useSessionState() → listens on 'session-state-changed'
                          currentState === 'PreCapture' → <ConsentGate/>
                          ConsentGate.tsx
                            useState(agreed)
                            checkbox → setAgreed
                            button disabled={!agreed}
                            onClick → window.electronAPI.invoke('consent-confirmed', ...)
```

### Recommended Project Structure

```
MeetingAssist/
├── src/
│   ├── main/
│   │   ├── index.ts                # app lifecycle, createOverlayWindow, IPC setup
│   │   ├── session/
│   │   │   └── SessionManager.ts   # 6-state FSM class (Phase 6: Idle→PreCapture only)
│   │   └── store/
│   │       └── db.ts               # DB open, safeStorage key, sqlite-vec load, 7 DDLs
│   ├── preload/
│   │   └── index.ts                # hardened contextBridge allowlist (18 channels)
│   ├── renderer/
│   │   ├── main.tsx                # renderer entry
│   │   ├── App.tsx                 # root, useSessionState hook
│   │   └── components/
│   │       └── ConsentGate.tsx     # checkbox + disabled-until-checked Start button
│   └── shared/
│       └── schemas/
│           └── index.ts            # Zod schemas (stubs for Phase 6 — real schemas in Phase 8)
├── build/
│   └── entitlements.mac.plist      # allow-jit, allow-unsigned-executable-memory, disable-library-validation
├── electron.vite.config.ts         # three-section build config
└── package.json                    # electron-builder config in "build" key
```

---

## Research Area 1: Electron + Vite + React Setup

**Scaffold command:**

```bash
npm create @quick-start/electron@latest . -- --template react-ts
```

This generates the full three-process structure with TypeScript. [CITED: electron-vite.org/guide]

**`electron.vite.config.ts`:**

```typescript
import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: [
          'better-sqlite3-multiple-ciphers',
          'sqlite-vec',
          'electron',
        ],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: { '@renderer': resolve('src/renderer/src') },
    },
  },
});
```

**`package.json` key fields:**

```json
{
  "main": "./out/main/index.js",
  "scripts": {
    "dev":      "electron-vite dev",
    "build":    "electron-vite build",
    "start":    "electron-vite preview",
    "postinstall": "electron-rebuild -f -w better-sqlite3-multiple-ciphers"
  }
}
```

**HMR behavior:** [CITED: electron-vite.org/guide/dev]
- Renderer: full Vite HMR (instant React component updates)
- Main process: hot reload (restarts main on save — NOT HMR)
- Preload: hot reload (triggers renderer reload)

**Vite 8 is NOT supported** by electron-vite 5.0.0. Peer dependencies state `^5.0.0 || ^6.0.0 || ^7.0.0`. Use Vite 7.3.6. [VERIFIED: npm view electron-vite peerDependencies]

---

## Research Area 2: better-sqlite3-multiple-ciphers

**Why not regular better-sqlite3:** `better-sqlite3-multiple-ciphers` is a direct fork that adds SQLCipher encryption. It is API-compatible with better-sqlite3 — the import path changes but all method calls are identical. [ASSUMED]

**Electron ABI rebuild requirement:** Electron uses a different Node ABI than the system Node. Native `.node` binaries compiled against system Node will fail to load in Electron. `@electron/rebuild` rebuilds them against Electron's ABI. [CITED: electronjs.org/docs/latest/tutorial/using-native-node-modules]

**Rebuild command (postinstall):**

```bash
# Run after npm install
npx electron-rebuild -f -w better-sqlite3-multiple-ciphers
```

Or as `postinstall` script: `"postinstall": "electron-rebuild -f -w better-sqlite3-multiple-ciphers"` [CITED: electron/rebuild GitHub]

**electron-builder integration:** Set `"build": { "npmRebuild": true }` — electron-builder calls `@electron/rebuild` automatically during packaging. [CITED: electron.build docs]

**asarUnpack (critical):**

```json
{
  "build": {
    "asar": true,
    "asarUnpack": [
      "**/node_modules/better-sqlite3-multiple-ciphers/**",
      "**/node_modules/better-sqlite3-multiple-ciphers/**/*.node"
    ]
  }
}
```

**Vite external (critical):** Native modules must not be bundled:

```typescript
// In electron.vite.config.ts main section:
rollupOptions: {
  external: ['better-sqlite3-multiple-ciphers']
}
```

**Electron 41/42 support:** Release notes for v12.x explicitly add Electron 41 and 42 build targets (confirmed fix: "use Holder() instead of This() for Electron 41 compatibility"). [CITED: github.com/m4heshd/better-sqlite3-multiple-ciphers/releases]

---

## Research Area 3: DB Open Sequence (safeStorage + sqlite-vec)

### safeStorage Key Pattern

`safeStorage` is the Electron API for OS-backed encryption (macOS Keychain). [CITED: electronjs.org/docs/latest/api/safe-storage]

```typescript
// src/main/store/db.ts
import { safeStorage, app } from 'electron';
import Database from 'better-sqlite3-multiple-ciphers';
import * as sqliteVec from 'sqlite-vec';
import path from 'path';
import fs from 'fs';

const KEY_FILE = path.join(app.getPath('userData'), '.dbkey');

function getOrCreateDbKey(): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage not available — macOS Keychain required');
  }

  if (fs.existsSync(KEY_FILE)) {
    // Subsequent runs: decrypt stored key
    const encrypted = fs.readFileSync(KEY_FILE);
    return safeStorage.decryptString(encrypted);
  } else {
    // First run: generate random key, encrypt, persist
    const key = require('crypto').randomBytes(32).toString('hex');
    const encrypted = safeStorage.encryptString(key);
    fs.writeFileSync(KEY_FILE, encrypted);
    return key;
  }
}

export function openDb(): Database.Database {
  const dbPath = path.join(app.getPath('userData'), 'meetingassist.db');
  const key = getOrCreateDbKey();

  // Step 1: open (unencrypted until PRAGMA key is set)
  const db = new Database(dbPath);

  // Step 2: set SQLCipher encryption key
  db.pragma(`key = '${key}'`);

  // Step 3: load sqlite-vec extension (BEFORE any vec0 DDLs)
  sqliteVec.load(db);

  // Step 4: run all 7 DDLs in a single transaction
  db.exec(ALL_SEVEN_DDLS);

  return db;
}
```

**Note on `sqliteVec.load(db)`:** The `sqlite-vec` npm package exposes `load(db)` which handles `db.loadExtension()` internally. You do NOT call `db.loadExtension()` directly. [CITED: alexgarcia.xyz/sqlite-vec/js.html]

**Important:** `db.loadExtension()` on `better-sqlite3-multiple-ciphers` requires that `app.allowRendererProcessReuse` is not interfering, and that the path resolves to the asar-unpacked copy. The `sqlite-vec` `load()` API handles path resolution automatically from `node_modules`. [ASSUMED — see Open Questions]

### sqlite-vec asarUnpack Configuration

```json
{
  "build": {
    "asarUnpack": [
      "**/node_modules/sqlite-vec/**",
      "**/node_modules/sqlite-vec-darwin-arm64/**",
      "**/node_modules/sqlite-vec-darwin-x64/**",
      "**/node_modules/sqlite-vec-linux-x64/**",
      "**/node_modules/sqlite-vec-win32-x64/**"
    ]
  }
}
```

**Critical anti-pattern:** Do NOT specify the same module in both `asarUnpack` AND `extraResources`. This causes the double-extension bug (`vec0.dylib.dylib`) documented in electron-builder issue #8824. [CITED: github.com/electron-userland/electron-builder/issues/8824]

### vec0 Virtual Table DDL

```sql
-- Must be run AFTER sqliteVec.load(db)
CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
  embedding        float[1536],
  +chunk_id        TEXT,
  +meeting_id      TEXT,
  +speaker_label   TEXT,
  +timestamp_start REAL,
  +text_preview    TEXT
);
```

`+` prefix = auxiliary column (metadata stored alongside vector). `float[1536]` = 1536-dimensional float32 vector. [CITED: alexgarcia.xyz/sqlite-vec/features/vec0.html]

---

## Research Area 4: contextBridge Hardened Allowlist

**Pattern (18 channels — all present as stubs in Phase 6):**

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

// Inbound: main → renderer (renderer subscribes)
const LISTEN_CHANNELS = [
  'session-state-changed',
  'transcript-segment',
  'summary-card-ready',
  'break-assist-digest-ready',
  'artifact-proposals-ready',
  'capture-health-update',
] as const;

// Outbound: renderer → main (renderer invokes)
const INVOKE_CHANNELS = [
  'consent-confirmed',
  'mic-audio-chunk',
  'start-meeting',
  'end-meeting',
  'start-break',
  'end-break',
  'confirm-artifact',
  'edit-artifact',
  'dismiss-artifact',
  'export-ics',
  'get-settings',
  'set-setting',
] as const;

type ListenChannel = typeof LISTEN_CHANNELS[number];
type InvokeChannel = typeof INVOKE_CHANNELS[number];

contextBridge.exposeInMainWorld('electronAPI', {
  invoke(channel: InvokeChannel, payload?: unknown): Promise<unknown> {
    if (!(INVOKE_CHANNELS as readonly string[]).includes(channel)) {
      return Promise.reject(new Error(`Blocked: channel "${channel}" not in allowlist`));
    }
    return ipcRenderer.invoke(channel, payload);
  },

  on(channel: ListenChannel, callback: (...args: unknown[]) => void): void {
    if (!(LISTEN_CHANNELS as readonly string[]).includes(channel)) {
      throw new Error(`Blocked: channel "${channel}" not in allowlist`);
    }
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },

  off(channel: ListenChannel, callback: (...args: unknown[]) => void): void {
    ipcRenderer.off(channel, callback);
  },
});

// Global type declaration for renderer TypeScript:
// declare global {
//   interface Window {
//     electronAPI: typeof import('./index').electronAPI;
//   }
// }
```

**Security requirements:** [CITED: electronjs.org/docs/latest/api/context-bridge]
- `contextIsolation: true` (default since Electron 12)
- `nodeIntegration: false`
- `sandbox: false` — required so preload script can access `ipcRenderer`; sandbox: true blocks ipcRenderer

**Phase 6 main-process stubs:** All 12 `ipcMain.handle()` calls resolve immediately with `undefined`. The 6 inbound `ipcMain.on()` channels log and no-op.

---

## Research Area 5: Overlay Window Configuration

All APIs confirmed current in Electron 41/42. [CITED: electronjs.org/docs/latest/api/browser-window]

```typescript
// src/main/index.ts
import { BrowserWindow, screen, app } from 'electron';
import path from 'path';

function createOverlayWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const OVERLAY_WIDTH = 380;

  const win = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height,
    x: width - OVERLAY_WIDTH,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,          // required for preload ipcRenderer access
      preload: path.join(__dirname, '../preload/index.js'),
    },
  });

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true }); // default: click-through
  win.setContentProtection(true); // hides overlay from user's own screen-share (DEC-01 §2)

  return win;
}

app.whenReady().then(() => {
  app.dock.hide(); // no dock icon — overlay assistant
  const win = createOverlayWindow();
  // Load renderer
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
});
```

**`screen-saver` level confirmed:** This is one of 9 named levels for `setAlwaysOnTop`. It is the highest non-deprecated level, placing the overlay above most other windows including full-screen apps. [CITED: electronjs.org/docs/latest/api/browser-window]

**Mouse event toggle pattern:**

```typescript
// In renderer, wire pointer events to toggle clickability:
win.webContents.on('ipc-message', (_, channel) => {
  if (channel === 'overlay-mouse-enter') win.setIgnoreMouseEvents(false);
  if (channel === 'overlay-mouse-leave') win.setIgnoreMouseEvents(true, { forward: true });
});
// In renderer component, on pointerenter/pointerleave events on the overlay root div
```

---

## Research Area 6: electron-builder Configuration

**Phase 6 minimal config for smoke test (`--mac --dir`):**

```json
{
  "build": {
    "appId": "com.meetingassist.app",
    "productName": "MeetingAssist",
    "asar": true,
    "asarUnpack": [
      "**/node_modules/better-sqlite3-multiple-ciphers/**",
      "**/node_modules/better-sqlite3-multiple-ciphers/**/*.node",
      "**/node_modules/sqlite-vec/**",
      "**/node_modules/sqlite-vec-darwin-arm64/**",
      "**/node_modules/sqlite-vec-darwin-x64/**"
    ],
    "npmRebuild": true,
    "mac": {
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "entitlements": "build/entitlements.mac.plist",
      "entitlementsInherit": "build/entitlements.mac.plist"
    },
    "afterSign": "scripts/notarize.js",
    "files": [
      "out/**/*",
      "!out/**/*.map"
    ]
  }
}
```

**`build/entitlements.mac.plist`:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- Required for V8 JIT compilation -->
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <!-- Required for unsigned executable memory (Electron internals) -->
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <!-- Required for audiotee Swift binary and other third-party .node binaries -->
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
</dict>
</plist>
```

**`scripts/notarize.js` (Phase 6 no-op stub):**

```javascript
// scripts/notarize.js — stub for Phase 6; full implementation in Phase 11
exports.default = async function notarize(_context) {
  // No-op stub: notarization is configured in Phase 11
  // Full implementation: require('@electron/notarize').notarize({...})
  console.log('[notarize] stub — skipping notarization in Phase 6');
};
```

[CITED: electron.build/docs/notarization, github.com/electron-userland/electron-builder/blob/master/.../entitlements.mac.plist]

---

## Research Area 7: SessionManager FSM

**Decision: plain TypeScript class, no XState.** XState v5 is viable but adds ~20KB and conceptual overhead for a 6-state machine. The FSM is internal to the main process and does not need visualization or formal tooling. [ASSUMED]

```typescript
// src/main/session/SessionManager.ts
import { EventEmitter } from 'events';

export type SessionState =
  | 'Idle'
  | 'PreCapture'
  | 'Capturing'
  | 'OnBreak'
  | 'Processing'
  | 'Complete';

export type SessionEvent =
  | 'start-meeting'
  | 'consent-confirmed'
  | 'start-break'
  | 'end-break'
  | 'end-meeting'
  | 'pipeline-complete'
  | 'session-dismissed';

// Allowed transitions: Map<currentState, Map<event, nextState>>
const TRANSITIONS: Record<SessionState, Partial<Record<SessionEvent, SessionState>>> = {
  Idle:        { 'start-meeting':      'PreCapture' },
  PreCapture:  { 'consent-confirmed':  'Capturing'  },  // HARD GUARD: see below
  Capturing:   { 'start-break':        'OnBreak', 'end-meeting': 'Processing' },
  OnBreak:     { 'end-break':          'Capturing'  },
  Processing:  { 'pipeline-complete':  'Complete'   },
  Complete:    { 'start-meeting':      'PreCapture', 'session-dismissed': 'Idle' },
};

export class SessionManager extends EventEmitter {
  private state: SessionState = 'Idle';
  private consentReceived = false;  // hard FSM guard (DEC-01)

  getState(): SessionState {
    return this.state;
  }

  transition(event: SessionEvent): void {
    // HARD GUARD: PreCapture → Capturing requires prior consent-confirmed
    if (event === 'consent-confirmed') {
      this.consentReceived = true;
    }
    if (this.state === 'PreCapture' && event !== 'consent-confirmed' && !this.consentReceived) {
      throw new Error('FSM: cannot transition from PreCapture without consent');
    }

    const nextState = TRANSITIONS[this.state]?.[event];
    if (!nextState) {
      throw new Error(`FSM: invalid transition ${this.state} → ${event}`);
    }

    const previous = this.state;
    this.state = nextState;
    this.emit('state-change', this.state, previous);
  }

  onStateChange(cb: (state: SessionState, previous: SessionState) => void): void {
    this.on('state-change', cb);
  }
}
```

**Phase 6 scope:** Wire only the `Idle → PreCapture` transition via the `start-meeting` IPC handler. The `PreCapture → Capturing` guard must exist (to enforce DEC-01) even if the Capturing state has no behavior yet.

**IPC wiring in main:**

```typescript
// src/main/index.ts (after session manager creation)
const session = new SessionManager();

session.onStateChange((state, previous) => {
  win.webContents.send('session-state-changed', { state, previous });
});

ipcMain.handle('start-meeting', (_e, payload) => {
  session.transition('start-meeting');
  // Phase 6: no meeting ID generation yet; return undefined
});

ipcMain.handle('consent-confirmed', (_e, payload) => {
  session.transition('consent-confirmed');
  // Phase 6: stub — no capture start
});
```

---

## Research Area 8: ConsentGate Component

```tsx
// src/renderer/components/ConsentGate.tsx
import { useState } from 'react';

interface ConsentGateProps {
  onConfirmed: () => void;
}

export function ConsentGate({ onConfirmed }: ConsentGateProps): JSX.Element {
  const [agreed, setAgreed] = useState(false);

  async function handleConfirm(): Promise<void> {
    if (!agreed) return;
    // Fire IPC: triggers FSM PreCapture → Capturing in main
    await window.electronAPI.invoke('consent-confirmed', {
      meetingId: crypto.randomUUID(),
      timestamp: Date.now(),
    });
    onConfirmed();
  }

  return (
    <div className="consent-gate">
      <h2>Recording Disclosure</h2>
      <p>
        MeetingAssist will capture audio from your microphone and system audio
        during this session. Transcripts are stored locally and encrypted.
        Audio is discarded after transcription.
      </p>
      <label>
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        {' '}I understand and consent to recording this session
      </label>
      <button disabled={!agreed} onClick={handleConfirm}>
        Start Meeting
      </button>
    </div>
  );
}
```

**`App.tsx` skeleton with `useSessionState`:**

```tsx
// src/renderer/App.tsx
import { useState, useEffect } from 'react';
import { ConsentGate } from './components/ConsentGate';
import type { SessionState } from '../../main/session/SessionManager';

function useSessionState(): SessionState {
  const [state, setState] = useState<SessionState>('Idle');
  useEffect(() => {
    window.electronAPI.on('session-state-changed', ({ state: s }: { state: SessionState }) => {
      setState(s);
    });
  }, []);
  return state;
}

export function App(): JSX.Element {
  const sessionState = useSessionState();

  return (
    <div id="overlay-root">
      {sessionState === 'PreCapture' && (
        <ConsentGate onConfirmed={() => { /* state change comes via IPC push */ }} />
      )}
      {/* Other components render based on sessionState — stubs for Phase 6 */}
    </div>
  );
}
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Electron + Vite build wiring | Custom webpack/rollup config | `electron-vite` | Main/preload/renderer split requires careful CJS/ESM boundary handling; electron-vite solves it correctly |
| DB encryption key storage | Homebrew key file or env var | `safeStorage` → Keychain | Keychain is OS-backed; custom key storage is insecure and reviewable |
| Native module ABI rebuild | Manually specifying `--target` for node-gyp | `@electron/rebuild` | ABI mismatch is hard to debug; electron-rebuild knows the correct Electron ABI automatically |
| SQLite vector extension loading | Custom `dlopen` or manual path resolution | `sqlite-vec` npm package + `sqliteVec.load(db)` | Package handles platform-specific binary selection and path resolution |
| FSM event multiplexing | Custom EventEmitter + state spaghetti | Transition table in `SessionManager` class | Hard-coded table makes allowed transitions explicit and prevents invalid state bugs |
| Overlay window always-on-top | Custom Objective-C bridge | `win.setAlwaysOnTop(true, 'screen-saver')` | Electron exposes this natively; custom NSWindow manipulation would bypass Electron's window management |

---

## Common Pitfalls

### Pitfall 1: Native Module Not in `rollupOptions.external`

**What goes wrong:** Vite tries to bundle `better-sqlite3-multiple-ciphers` into `out/main/index.js`. The bundled `.js` file loses the ability to `require()` the native `.node` binding — the app throws `Cannot find module` at runtime.

**Why it happens:** Vite treats all imports as bundleable by default. Native modules with binary `.node` files cannot be inlined.

**How to avoid:** Add `'better-sqlite3-multiple-ciphers'` and `'sqlite-vec'` to `rollupOptions.external` in the `main` section of `electron.vite.config.ts`. The `externalizeDepsPlugin()` also handles this broadly but is less explicit.

**Warning signs:** Stack trace mentioning `Cannot find module` or `ERR_REQUIRE_ESM` on the encrypted DB module.

---

### Pitfall 2: Double `.dylib` Extension (`vec0.dylib.dylib`)

**What goes wrong:** sqlite-vec fails to load in the packaged app with `dlopen: tried '…/vec0.dylib.dylib'` — a path with the extension doubled.

**Why it happens:** The sqlite-vec bindings already include the extension in their filename. If the wrong path resolution logic appends `.dylib` again, the path is doubled.

**How to avoid:** Do NOT put sqlite-vec in both `asarUnpack` AND `extraResources`. Use only `asarUnpack`. The `sqlite-vec` package's `load()` function resolves paths correctly if the module is properly unpacked. [CITED: github.com/electron-userland/electron-builder/issues/8824]

**Warning signs:** `dlopen` error in packaged app logs referencing a `.dylib.dylib` path.

---

### Pitfall 3: `safeStorage` Called Before `app.ready`

**What goes wrong:** `safeStorage.encryptString()` throws `Error: safeStorage is not available` if called before `app.whenReady()` resolves.

**Why it happens:** `safeStorage` requires the Keychain service to be initialized, which only happens after the Electron app is fully ready.

**How to avoid:** Always call `openDb()` inside `app.whenReady().then(...)`, never at module top-level.

**Warning signs:** `safeStorage is not available` error on startup; or `isEncryptionAvailable()` returns false.

---

### Pitfall 4: `sqlite-vec.load(db)` Called After DDLs That Reference `vec0`

**What goes wrong:** `db.exec('CREATE VIRTUAL TABLE ... USING vec0(...)')` throws `no such module: vec0` if called before the extension is loaded.

**Why it happens:** SQLite virtual table modules must be registered before any DDL references them.

**How to avoid:** Strict ordering in `db.ts`: open → PRAGMA key → `sqliteVec.load(db)` → `db.exec(ALL_DDLS)`. The vec_chunks table DDL is part of `ALL_DDLS` and must come after `load()`.

---

### Pitfall 5: FSM Guard Implemented Only in Renderer

**What goes wrong:** A malicious browser extension or injected script can call `window.electronAPI.invoke('consent-confirmed', ...)` before the user checks the box, bypassing consent.

**Why it happens:** Renderer-side state is not trusted. IPC messages can be sent from DevTools console or injected scripts.

**How to avoid:** The `SessionManager` in the main process is the authoritative FSM. The main process's `consent-confirmed` IPC handler calls `session.transition('consent-confirmed')`. Until that IPC call has been received, the FSM blocks `PreCapture → Capturing`. The UI checkbox is a UX convenience, not a security control.

---

### Pitfall 6: Vite 8 Instead of Vite 7

**What goes wrong:** `electron-vite` 5.0.0 peer dependency is `vite: "^5.0.0 || ^6.0.0 || ^7.0.0"`. Installing Vite 8 causes a peer dependency conflict and potentially broken builds.

**Why it happens:** Vite 8 was released after electron-vite 5.0.0. electron-vite 6.0.0-beta.0 is in beta but not stable.

**How to avoid:** Explicitly pin `"vite": "^7.3.6"` in package.json. [VERIFIED: npm view electron-vite peerDependencies]

---

### Pitfall 7: `sandbox: false` Not Set in webPreferences

**What goes wrong:** Preload script cannot access `ipcRenderer` — the contextBridge setup throws at load time.

**Why it happens:** Electron's sandbox mode blocks `ipcRenderer` in preload scripts. The sandboxed preload cannot import from the electron module.

**How to avoid:** Set `sandbox: false` in `webPreferences`. This is required when `contextIsolation: true` and the preload uses `ipcRenderer`. Note: `sandbox: false` does NOT expose Node.js to the renderer — `contextIsolation` handles that boundary. [CITED: 05-ARCHITECTURE.md §9]

---

## Code Examples

### Verified Pattern: DB Open Sequence

```typescript
// Source: 05-ARCHITECTURE.md §8 (DB initialization sequence — authoritative)
// Combined with safeStorage pattern from electronjs.org/docs/latest/api/safe-storage

import { safeStorage, app } from 'electron';
import Database from 'better-sqlite3-multiple-ciphers';
import * as sqliteVec from 'sqlite-vec';
import { randomBytes } from 'crypto';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';

export function openDatabase(): Database.Database {
  // 1. safeStorage key: generate on first run, decrypt on subsequent
  const keyFile = join(app.getPath('userData'), '.meetingassist.key');
  let plainKey: string;

  if (existsSync(keyFile)) {
    plainKey = safeStorage.decryptString(readFileSync(keyFile));
  } else {
    plainKey = randomBytes(32).toString('hex');
    writeFileSync(keyFile, safeStorage.encryptString(plainKey));
  }

  // 2. Open DB
  const dbPath = join(app.getPath('userData'), 'meetingassist.db');
  const db = new Database(dbPath);

  // 3. Set SQLCipher key
  db.pragma(`key = '${plainKey}'`);

  // 4. Load sqlite-vec extension
  sqliteVec.load(db);

  // 5. Run all 7 table DDLs
  db.exec(`
    CREATE TABLE IF NOT EXISTS meetings (...);
    CREATE TABLE IF NOT EXISTS transcript_segments (...);
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(embedding float[1536], +chunk_id TEXT, ...);
    CREATE TABLE IF NOT EXISTS artifacts (...);
    CREATE TABLE IF NOT EXISTS action_items (...);
    CREATE TABLE IF NOT EXISTS summary_cards (...);
    CREATE TABLE IF NOT EXISTS epoch_summaries (...);
  `);

  return db;
}
```

### Verified Pattern: SessionManager Transition Wiring

```typescript
// Source: 05-ARCHITECTURE.md §5 (SessionManager FSM transition table)
const session = new SessionManager();
session.onStateChange((state, previous) => {
  mainWindow.webContents.send('session-state-changed', { state, previous });
});
ipcMain.handle('start-meeting', () => session.transition('start-meeting'));
ipcMain.handle('consent-confirmed', (_, payload) => {
  session.transition('consent-confirmed');
  // Phase 6: capture start wired in Phase 7
});
```

---

## Runtime State Inventory

This is a greenfield phase — no existing runtime state to inventory. The `src/` directory does not exist yet. No data migrations, OS registrations, or stored data apply.

**Nothing found in any category:** Verified by checking project root — only `DNA/`, `spike/`, and `.planning/` directories exist. No `src/`, `package.json`, or compiled artifacts present.

---

## Open Questions

1. **`sqlite-vec.load()` path resolution in packaged app**
   - What we know: `sqliteVec.load(db)` works in dev. In a packaged app, the module resolves from `app.asar.unpacked`. The `load()` function is documented to handle this automatically.
   - What's unclear: Whether `load()` correctly resolves from the `asar.unpacked` directory when the module is in `asarUnpack` — or whether a manual path override is needed (`db.loadExtension(resolvedPath)`).
   - Recommendation: Test `electron-builder --mac --dir` early (Phase 6 acceptance criterion 5). If `load()` fails, fall back to: `db.loadExtension(require('sqlite-vec').getLoadablePath())` or manual path: `app.getAppPath().replace('app.asar', 'app.asar.unpacked') + '/node_modules/sqlite-vec-darwin-arm64/vec0.dylib'`.

2. **Electron 41 vs 42 final decision**
   - What we know: Both 41.9.0 and 42.5.0 are current. RSCH-04 spike ran on 42.5.0. `better-sqlite3-multiple-ciphers` explicitly supports both. `npm latest` tag resolves to 42.5.0.
   - What's unclear: Whether there's an official "LTS" designation between 41 and 42 that matters for the build milestone timeline.
   - Recommendation: Pin to 42.5.0. It is the current `latest` on npm, the spike-validated version, and `better-sqlite3-multiple-ciphers` explicitly added 42 support. Document the pin in `package.json` with a comment.

3. **`better-sqlite3-multiple-ciphers` first-run key storage location**
   - What we know: `safeStorage.encryptString()` produces a Buffer. This Buffer must be persisted between runs (it is NOT stored in the Keychain directly — safeStorage uses the Keychain to encrypt the buffer, but you store the encrypted bytes yourself).
   - What's unclear: Whether storing the encrypted key file in `app.getPath('userData')` is sufficient, or whether additional file-permission hardening is expected.
   - Recommendation: Store in `userData` directory (standard Electron practice). Set file permissions to `0600` on write. This is adequate for v1. [ASSUMED]

4. **`setContentProtection(true)` in development**
   - What we know: `setContentProtection(true)` prevents the window from appearing in screen-share. In dev mode, this also prevents the window from appearing in any recording tool.
   - What's unclear: Whether this should be conditional (`process.env.NODE_ENV !== 'development'`) for developer ergonomics or always-on per the spec.
   - Recommendation: Always-on per 05-ARCHITECTURE §9 spec. Developers can use DevTools console or IPC inspector; the UX requirement is unconditional.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js ≥ 22.12 | electron-vite, electron-rebuild | Check at build | — | Upgrade Node |
| npm | Package installation | Yes (system) | — | — |
| macOS 14.2+ | safeStorage + audiotee (Phase 7) | Phase 6: macOS required for safeStorage | — | None for Phase 6 |
| Xcode Command Line Tools | @electron/rebuild (node-gyp) | Check at build | — | `xcode-select --install` |

```bash
# Verify before starting Phase 6:
node --version    # must be ≥ 22.12.0
npm --version
xcode-select -p   # must return a path
```

**Missing dependencies with no fallback:**
- Xcode Command Line Tools (required for `@electron/rebuild` → `node-gyp`)
- macOS (required; Linux/Windows not supported for this project)

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (standard for electron-vite projects) |
| Config file | `vitest.config.ts` — Wave 0 gap |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-03 | safeStorage key generated, DB opens without error | integration | `vitest run tests/db.test.ts` | Wave 0 gap |
| FOUND-04 | All 7 tables exist after `openDatabase()` | integration | `vitest run tests/db.test.ts` | Wave 0 gap |
| FOUND-05 | `sqlite-vec` vec0 table queryable after load | integration | `vitest run tests/db.test.ts` | Wave 0 gap |
| FOUND-06 | Unlisted channel rejected by contextBridge | manual | DevTools console: `window.electronAPI.invoke('INVALID')` — should reject | N/A |
| FOUND-07 | FSM blocks PreCapture→Capturing without consent | unit | `vitest run tests/session.test.ts` | Wave 0 gap |
| FOUND-08 | ConsentGate button disabled until checkbox | component | Manual UI test during `npm run dev` | N/A |

### Wave 0 Gaps

- [ ] `tests/db.test.ts` — covers FOUND-03, FOUND-04, FOUND-05 (DB init, table creation, vec0)
- [ ] `tests/session.test.ts` — covers FOUND-07 (FSM transitions, consent guard)
- [ ] `vitest.config.ts` — Vitest configuration for main-process tests (Node environment, not jsdom)
- [ ] Framework install: `npm install -D vitest` if not included by electron-vite scaffold

**Note on main-process tests:** Vitest tests for `SessionManager` and `db.ts` run in Node environment (not browser). Set `environment: 'node'` in vitest config or use `@vitest/node`. The DB tests can use `:memory:` to avoid filesystem I/O. `safeStorage` is not available in Vitest — mock it.

---

## Security Domain

### Applicable ASVS Categories (Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No user authentication in Phase 6 |
| V3 Session Management | Yes (partial) | SessionManager FSM enforces state transitions; consent guard blocks unauthorized capture start |
| V4 Access Control | Yes | contextBridge allowlist enforces IPC channel access control (renderer cannot invoke unlisted channels) |
| V5 Input Validation | Yes | IPC channel name validated against allowlist in preload; payload shapes validated at handler level |
| V6 Cryptography | Yes | SQLCipher AES-256 via `better-sqlite3-multiple-ciphers`; key via `safeStorage` → macOS Keychain |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Renderer bypasses consent gate via IPC | Spoofing / Elevation | Main-process FSM guard; `consent-confirmed` IPC only enables capture after FSM receives it — renderer UI is not authoritative |
| Raw `ipcRenderer` exposed to renderer | Tampering | contextBridge allowlist — never expose `ipcRenderer` directly; typed allowlist blocks unlisted channels |
| DB key in plaintext | Information Disclosure | `safeStorage` encrypts key with OS Keychain; key file stored as encrypted bytes, not plaintext |
| Native module loaded from ASAR | Tampering | `asarUnpack` ensures binaries are code-signed and loaded from unpacked directory |
| malicious IPC channel injection | Tampering | Allowlist in preload rejects unknown channel names before forwarding to ipcRenderer |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Plain TypeScript class FSM is sufficient; XState not needed | §7 SessionManager | Low risk — class can be replaced with XState later if needed without changing the interface |
| A2 | `sqliteVec.load(db)` resolves paths correctly from `asar.unpacked` in packaged app | §3 sqlite-vec | Medium risk — if wrong, packaged build fails; fallback is manual `db.loadExtension()` with resolved path |
| A3 | Storing `safeStorage`-encrypted key file in `userData` with `0600` permissions is adequate for v1 | §3 safeStorage | Low risk — adequate for v1; Keychain-native storage is a v2 hardening |
| A4 | `better-sqlite3-multiple-ciphers` 12.11.1 supports Electron 42.5.0 without additional patches | §2 native modules | Low risk — release notes confirm Electron 42 target added; a rebuild failure would surface immediately |
| A5 | `setContentProtection(true)` should remain enabled in dev mode | §5 overlay window | Low risk — developer ergonomics issue only; spec requires always-on |

---

## Package Legitimacy Audit Summary

**Packages removed due to SLOP verdict:** none

**Packages flagged as SUS:** `better-sqlite3-multiple-ciphers` (SUS: too-new signal from recent release date) and `electron-builder` (SUS: too-new signal). Both are industry-standard packages pre-authorized in CLAUDE.md as locked decisions. The SUS flags are false positives — no human-verify checkpoint required.

---

## Sources

### Primary (MEDIUM confidence — Context7/official docs)
- [electronjs.org/docs/latest/api/safe-storage](https://www.electronjs.org/docs/latest/api/safe-storage) — safeStorage API, async methods
- [electronjs.org/docs/latest/api/context-bridge](https://www.electronjs.org/docs/latest/api/context-bridge) — contextBridge hardened pattern
- [electronjs.org/docs/latest/api/browser-window](https://www.electronjs.org/docs/latest/api/browser-window) — overlay window APIs, alwaysOnTop levels
- [electronjs.org/docs/latest/tutorial/using-native-node-modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules) — electron-rebuild workflow
- [electron-vite.org/guide](https://electron-vite.org/guide/) — scaffold command, config structure, HMR behavior
- [alexgarcia.xyz/sqlite-vec/js.html](https://alexgarcia.xyz/sqlite-vec/js.html) — `sqliteVec.load(db)` API
- [alexgarcia.xyz/sqlite-vec/features/vec0.html](https://alexgarcia.xyz/sqlite-vec/features/vec0.html) — vec0 DDL syntax
- [electron.build/docs/notarization](https://www.electron.build/docs/notarization/) — electron-builder notarization config
- [github.com/electron-userland/electron-builder/blob/master/.../entitlements.mac.plist](https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/templates/entitlements.mac.plist) — default entitlements

### Secondary (MEDIUM confidence — verified via npm + web search)
- npm registry: electron 42.5.0, electron-vite 5.0.0, better-sqlite3-multiple-ciphers 12.11.1, sqlite-vec 0.1.9, react 19.2.7, vite 7.3.6
- [github.com/electron-userland/electron-builder/issues/8824](https://github.com/electron-userland/electron-builder/issues/8824) — sqlite-vec double-extension bug in asarUnpack
- [coldfusion-example.blogspot.com — fixing node-gyp rebuild errors with better-sqlite3 in Electron](https://coldfusion-example.blogspot.com/2026/01/fixing-node-gyp-rebuild-errors-with.html) — electron-rebuild steps

### Authoritative internal documents
- `05-ARCHITECTURE.md` — module map, IPC channels, DB DDL, overlay config, component tree
- `05-BUILD-ORDER.md` — Phase 1 (Phase 6 in ROADMAP) deliverables and acceptance criteria
- `CLAUDE.md` — locked technology stack decisions

---

## Metadata

**Confidence breakdown:**
- Electron overlay window APIs: HIGH — confirmed current in official Electron docs
- electron-vite scaffold and config: MEDIUM — official electron-vite docs; peerDependency for Vite 7 confirmed via npm
- better-sqlite3-multiple-ciphers Electron rebuild: MEDIUM — multiple sources confirm pattern; Electron 42 support confirmed in release notes
- sqlite-vec `load()` API: MEDIUM — official docs confirm `sqliteVec.load(db)`; packaged app path resolution is ASSUMED
- contextBridge allowlist: MEDIUM — official Electron docs confirm pattern; exact implementation is ASSUMED based on documented approach
- SessionManager FSM (plain class): LOW — design recommendation based on scope assessment; XState is equally valid

**Research date:** 2026-06-26
**Valid until:** 2026-07-26 (30 days; stable stack)
