---
phase: "06-foundation-scaffold"
plan_set: true
total_plans: 7
type: execute
wave_count: 4
depends_on: []
autonomous: true
requirements:
  - FOUND-01
  - FOUND-02
  - FOUND-03
  - FOUND-04
  - FOUND-05
  - FOUND-06
  - FOUND-07
  - FOUND-08
  - FOUND-09

must_haves:
  truths:
    - "npm run dev" launches the overlay and the process exits cleanly on window close
    - Overlay appears at the right edge of the primary display as always-on-top, frame-less, dock-free, and content-protected from screen capture
    - ConsentGate renders when sessionState is PreCapture; the Start Meeting button remains disabled until the disclosure checkbox is checked
    - SQLCipher DB opens on first run using a safeStorage-generated key; all 7 tables exist; sqlite-vec vec0 module is queryable
    - Invoking an unlisted channel name via window.electronAPI.invoke or window.electronAPI.on throws or rejects immediately
    - SessionManager FSM starts in Idle; transitions to PreCapture on start-meeting IPC; blocks any further capture transition until consent-confirmed is received
    - electron-builder --mac --dir produces a .app bundle that launches without a DB error or entitlement error
  artifacts:
    - package.json with pinned dependencies (electron 42.5.0, react 19.2.7, better-sqlite3-multiple-ciphers 12.11.1, sqlite-vec 0.1.9, vite 7.3.6)
    - electron.vite.config.ts with main/preload/renderer three-section split and native module externals
    - src/main/index.ts with createOverlayWindow() and app lifecycle
    - src/main/store/db.ts with 4-step init sequence and all 7 DDLs
    - src/main/session/SessionManager.ts with full 6-state FSM class
    - src/preload/index.ts with all 18 typed channels (6 listen + 12 invoke) and allowlist enforcement
    - src/renderer/App.tsx with useSessionState hook
    - src/renderer/components/ConsentGate.tsx with checkbox and disabled-until-checked button
    - src/shared/schemas/index.ts (stub for Phase 6 — real schemas in Phase 8)
    - build/entitlements.mac.plist with allow-jit, allow-unsigned-executable-memory, disable-library-validation
    - scripts/notarize.js (no-op stub)
    - vitest.config.ts for Node-environment main-process tests
    - tests/db.test.ts covering DB open, 7 tables, vec0 virtual table
    - tests/session.test.ts covering FSM transitions and consent guard
  key_links:
    - SessionManager.onStateChange → win.webContents.send('session-state-changed') → useSessionState hook → conditional ConsentGate render
    - safeStorage key decrypt → db.pragma('key') → sqliteVec.load(db) → db.exec(ALL_DDLS) — must occur in exactly this sequence inside app.whenReady()
    - contextBridge INVOKE_CHANNELS allowlist → ipcMain.handle() stubs — every channel in the allowlist must have a corresponding handler in main/index.ts
    - asarUnpack in package.json must cover better-sqlite3-multiple-ciphers .node AND audiotee binary glob (Phase 7 dep declared now)
---

# Phase 6: Foundation & Scaffold

## Phase Goal

Stand up the Electron app shell: overlay window (right edge of screen, always-on-top, no dock icon, hidden from screen-share), SQLCipher DB with all 7 tables, hardened contextBridge IPC surface with all 18 typed channels (stubbed), consent gate UI, and SessionManager FSM skeleton (Idle → PreCapture transition only). No audio capture yet.

## Execution Plan Summary

| Plan | Wave | Scope | Key Files |
|------|------|-------|-----------|
| 06-01 | 1 | Project scaffold — electron-vite + packages + test harness scaffold | package.json, electron.vite.config.ts, tsconfig files, vitest.config.ts, test stubs |
| 06-02 | 2 | DB initialization — safeStorage key, SQLCipher, sqlite-vec, 7 DDLs | src/main/store/db.ts, tests/db.test.ts |
| 06-03 | 2 | Overlay window + app lifecycle | src/main/index.ts (window creation only — IPC wired in Plan 05) |
| 06-04 | 2 | contextBridge allowlist — 18 typed channels | src/preload/index.ts, src/renderer/env.d.ts |
| 06-05 | 3 | SessionManager FSM + IPC stub wiring in main | src/main/session/SessionManager.ts, tests/session.test.ts, src/main/index.ts (IPC handlers added) |
| 06-06 | 3 | ConsentGate component + App.tsx skeleton | src/renderer/App.tsx, src/renderer/components/ConsentGate.tsx, src/renderer/main.tsx, src/shared/schemas/index.ts |
| 06-07 | 4 | electron-builder packaging config + smoke test | build/entitlements.mac.plist, scripts/notarize.js, package.json (build section) |

---

## Plan 06-01 — Project Scaffold

```yaml
plan: "06-01"
wave: 1
depends_on: []
files_modified:
  - package.json
  - electron.vite.config.ts
  - tsconfig.json
  - tsconfig.node.json
  - tsconfig.web.json
  - vitest.config.ts
  - tests/db.test.ts
  - tests/session.test.ts
autonomous: true
requirements:
  - FOUND-01
```

### Objective

Scaffold the electron-vite + React 19 + Vite 7 project from scratch using `npm create @quick-start/electron@latest` with the `react-ts` template, then pin all exact versions, configure `rollupOptions.external` for native modules, and create empty test files that Wave 2+ tasks will fill. This is the only Wave 1 plan — all other plans depend on the package.json and tsconfigs existing.

Purpose: Establish the hosting container — correct three-process build split, pinned dependency tree, native module externals, and Vitest config — before any feature code is written.

Output: A working `npm run dev` invocation (even if the renderer is still the electron-vite default placeholder), a `vitest.config.ts` for Node-environment main-process tests, and empty test stub files.

### Task 1: Bootstrap electron-vite scaffold and pin versions

**Files:** `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`

**Action:**

Run the electron-vite scaffold command from the project root, then overwrite the generated package.json with exact pinned versions. The scaffold generates the correct three-process directory structure (`src/main/`, `src/preload/`, `src/renderer/`). After scaffolding, immediately pin versions to avoid dependency drift.

Exact scaffold command (run once):
`npm create @quick-start/electron@latest . -- --template react-ts`

After scaffold completes, update `package.json` to set these exact versions (overriding whatever the scaffold generated):

Dependencies:
- `electron`: `42.5.0` (devDependency — pin to this exact version; RSCH-04 spike validated on 42.5.0)
- `react`: `19.2.7`
- `react-dom`: `19.2.7`
- `better-sqlite3-multiple-ciphers`: `12.11.1` (regular dependency — native module)
- `sqlite-vec`: `0.1.9` (regular dependency — pin exactly; do not use a range)
- `electron-store`: `11.0.2`
- `vite`: `7.3.6` (devDependency — do NOT use Vite 8; electron-vite 5.0.0 peer dep is `^5||^6||^7` only)
- `electron-vite`: `5.0.0` (devDependency)
- `@vitejs/plugin-react`: `6.0.3` (devDependency)
- `@types/react`: `19.2.17` (devDependency)
- `@electron/rebuild`: `4.0.4` (devDependency)
- `electron-builder`: `26.15.3` (devDependency)
- `@electron/notarize`: `3.1.1` (devDependency)

Scripts section (replace scaffold defaults):
```
"dev": "electron-vite dev",
"build": "electron-vite build",
"start": "electron-vite preview",
"postinstall": "electron-rebuild -f -w better-sqlite3-multiple-ciphers",
"test": "vitest run",
"test:watch": "vitest"
```

Set `"main": "./out/main/index.js"` at the top level.

After version pins are written, run `npm install` so that `postinstall` fires and rebuilds `better-sqlite3-multiple-ciphers` against Electron 42's ABI. If `electron-rebuild` is not yet on PATH, invoke it as `npx electron-rebuild -f -w better-sqlite3-multiple-ciphers`.

In `electron.vite.config.ts`, set the main section's `rollupOptions.external` to explicitly list `['better-sqlite3-multiple-ciphers', 'sqlite-vec']`. Do NOT rely solely on `externalizeDepsPlugin()` for these two packages — the explicit list is required because both are native modules. The preload section uses `externalizeDepsPlugin()`. The renderer section uses `@vitejs/plugin-react`. The renderer alias should map `@renderer` to `src/renderer`.

Do NOT change the tsconfig files from what the scaffold generates unless the scaffold places the renderer under a non-standard path. The scaffold should produce `tsconfig.json` (root), `tsconfig.node.json` (main/preload), and `tsconfig.web.json` (renderer).

**Verify:**
`npm run dev` launches the Electron app (even with the default scaffold placeholder renderer). Process exits cleanly on window close. `npm run build` completes without error.

**Done:** `npm run dev` opens an Electron window. `npm run build` produces `out/` artifacts. `electron-rebuild` ran successfully (check that `node_modules/better-sqlite3-multiple-ciphers/build/Release/*.node` exists and was modified recently).

---

### Task 2: Vitest config + test stub files

**Files:** `vitest.config.ts`, `tests/db.test.ts`, `tests/session.test.ts`

**Action:**

Create `vitest.config.ts` in the project root. Main-process unit tests run in Node environment (not jsdom) because they test `SessionManager` and `db.ts` which use Node APIs. Set `environment: 'node'`. Exclude `src/renderer` from the test glob. Point `include` at `tests/**/*.test.ts`.

Install `vitest` as a devDependency if the scaffold did not include it: `npm install -D vitest`. Add `"vitest": "^2.0.0"` to devDependencies.

Create `tests/db.test.ts` as an empty stub with a single failing placeholder test:
- Import `describe`, `it`, `expect` from `vitest`
- One `describe('DB initialization', () => { it.todo('all 7 tables exist after openDatabase()') })` block

Create `tests/session.test.ts` as an empty stub with a single failing placeholder test:
- One `describe('SessionManager FSM', () => { it.todo('transitions Idle → PreCapture on start-meeting') })` block

These stubs establish the test files so that Wave 2 tasks (Plans 06-02 and 06-05) can fill them in without creating new files. The Nyquist Rule requires test files to exist before the code they test.

Do NOT mock `safeStorage` in this plan — that is done in Plan 06-02.

**Verify:**
`npx vitest run` exits 0 (todo tests are skipped, not failures in Vitest). Check output shows "2 skipped" or "2 todo".

**Done:** `tests/db.test.ts` and `tests/session.test.ts` exist. `vitest.config.ts` exists with `environment: 'node'`. `npx vitest run` exits 0.

---

### Threat Model

| Boundary | Description |
|----------|-------------|
| npm install → postinstall | `electron-rebuild` runs `node-gyp` against the system's Xcode Command Line Tools. If CLT is absent, the build fails immediately. |

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-06-01-01 | Tampering | npm install (better-sqlite3-multiple-ciphers) | medium | mitigate | Package pre-authorized in CLAUDE.md as locked decision; verify download integrity via `npm audit` after install |
| T-06-01-02 | Denial of Service | electron-rebuild ABI mismatch | high | mitigate | Pin Electron to 42.5.0 in package.json devDependencies; `postinstall` script rebuilds immediately after install so mismatch is caught early, not at runtime |
| T-06-01-SC | Tampering | npm/pip/cargo installs | high | mitigate | All packages are pre-audited in RESEARCH.md Package Legitimacy Audit; no [ASSUMED]/[SUS] packages require blocking checkpoint |

### Verification

1. `npm run dev` opens an Electron window (scaffold placeholder renderer acceptable)
2. `npm run build` produces `out/` without error
3. `node_modules/better-sqlite3-multiple-ciphers/build/Release/*.node` exists (electron-rebuild ran)
4. `npx vitest run` exits 0 with todo stubs

### Success Criteria

Scaffold is live: `npm run dev` works, native module is rebuilt for Electron ABI, test harness is wired. All subsequent plans can assume `package.json`, `electron.vite.config.ts`, and test files exist.

---

## Plan 06-02 — DB Initialization

```yaml
plan: "06-02"
wave: 2
depends_on:
  - "06-01"
files_modified:
  - src/main/store/db.ts
  - tests/db.test.ts
autonomous: true
requirements:
  - FOUND-03
  - FOUND-04
  - FOUND-05
```

### Objective

Implement `src/main/store/db.ts` with the 4-step DB initialization sequence: safeStorage key generation/decryption, SQLCipher PRAGMA key, sqlite-vec extension load, and all 7 table DDLs executed in a single transaction. Fill in `tests/db.test.ts` with concrete tests using an in-memory database and a mocked `safeStorage`.

Purpose: The DB is the persistence layer that every other phase depends on. The 4-step sequence is a hard constraint from ARCHITECTURE.md §8 — any deviation causes silent data corruption or load failures in packaged builds.

Output: `src/main/store/db.ts` with `openDatabase(): Database.Database` export. Passing tests for all 7 tables and vec0 virtual table.

### Task 1: Implement src/main/store/db.ts

**Files:** `src/main/store/db.ts`

**Action:**

Implement `openDatabase()` following the exact 4-step sequence from ARCHITECTURE.md §8. Do not reorder the steps; each step depends on the previous:

Step 1 — safeStorage key (call ONLY inside `app.whenReady()` in main/index.ts — never at module top-level):
- Key file path: `path.join(app.getPath('userData'), '.meetingassist.key')`
- First run: generate `crypto.randomBytes(32).toString('hex')`, encrypt via `safeStorage.encryptString(plainKey)`, write encrypted Buffer to key file with `fs.writeFileSync(keyFile, encrypted, { mode: 0o600 })` (restrict permissions to owner)
- Subsequent runs: `safeStorage.decryptString(fs.readFileSync(keyFile))`
- Guard: if `safeStorage.isEncryptionAvailable()` returns false, throw `new Error('safeStorage unavailable — macOS Keychain required')` — do not fall back to plaintext

Step 2 — Open DB and set SQLCipher key:
- `import Database from 'better-sqlite3-multiple-ciphers'`
- DB path: `path.join(app.getPath('userData'), 'meetingassist.db')`
- `const db = new Database(dbPath)`
- `db.pragma(\`key = '${plainKey}'\`)`

Step 3 — Load sqlite-vec extension:
- `import * as sqliteVec from 'sqlite-vec'`
- `sqliteVec.load(db)` — do NOT call `db.loadExtension()` directly; the `sqlite-vec` npm package's `load()` function handles path resolution and platform-specific binary selection automatically
- This MUST occur before any DDL that references `vec0`

Step 4 — Execute all 7 DDLs in a single `db.exec()` call (wrap in `db.transaction(() => { db.exec(ALL_DDLS) })()`):
Copy the exact DDL text from ARCHITECTURE.md §8. All 7 tables in exact order:
1. `meetings` table
2. `transcript_segments` table + `idx_transcript_segments_meeting_id` index
3. `vec_chunks` virtual table (`USING vec0(embedding float[1536], ...)`) — must come AFTER `sqliteVec.load(db)`
4. `artifacts` table + `idx_artifacts_meeting_id` index
5. `action_items` table + `idx_action_items_meeting_id` index
6. `summary_cards` table
7. `epoch_summaries` table

Export: `export function openDatabase(): Database.Database`. Also export a `closeDatabase(db: Database.Database): void` that calls `db.close()`.

Do NOT call `openDatabase()` at module top-level. It must be called from inside `app.whenReady().then(...)` in `src/main/index.ts` (wired in Plan 06-03).

**Verify (automated):**
`npx vitest run tests/db.test.ts` passes (after Task 2 fills in the tests).

**Done:** `openDatabase()` function exists and is exported. All 7 DDLs are present verbatim from ARCHITECTURE.md §8. `sqliteVec.load(db)` is called before the vec_chunks DDL.

---

### Task 2: Fill in tests/db.test.ts

**Files:** `tests/db.test.ts`

**Action:**

Replace the placeholder stub from Plan 06-01 Task 2 with concrete tests. Use `better-sqlite3-multiple-ciphers` in-memory mode (`:memory:`) to avoid filesystem I/O. Mock `safeStorage` and `app` from electron using Vitest's `vi.mock()` — neither API is available in the Node test environment.

The test file must mock `electron` at the top:
- Mock `safeStorage.isEncryptionAvailable()` to return `true`
- Mock `safeStorage.encryptString(s)` to return `Buffer.from(s)` (no real encryption in tests — correctness of key storage is the app's concern, not the test's)
- Mock `safeStorage.decryptString(buf)` to return `buf.toString()`
- Mock `app.getPath('userData')` to return a temp directory path (use `os.tmpdir()`)
- Mock `fs` calls or use a real temp directory — prefer a real temp directory with cleanup in `afterEach`

Test cases to implement (replace the `it.todo` entries):

1. `it('opens a new database without error')` — call `openDatabase()`; assert the return value is truthy and has a `.prepare` method
2. `it('creates all 7 tables')` — after `openDatabase()`, run `db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()` and assert the result contains all 7 table names: `action_items`, `artifacts`, `epoch_summaries`, `meetings`, `summary_cards`, `transcript_segments`, `vec_chunks`
3. `it('vec_chunks virtual table is queryable')` — run `db.prepare("SELECT * FROM vec_chunks LIMIT 0").all()` and assert it does not throw
4. `it('is idempotent — running DDLs twice does not error')` — call `openDatabase()` twice (or manually run the DDLs twice); assert no error is thrown (all DDLs use IF NOT EXISTS)

For in-memory usage with SQLCipher: pass `:memory:` as the DB path. The PRAGMA key still works on an in-memory DB — use a test key string directly rather than the safeStorage path.

Create a helper `openTestDb()` that skips the safeStorage path and opens an in-memory instance with a hardcoded test key and loads sqlite-vec, for use in unit tests.

**Verify (automated):**
`npx vitest run tests/db.test.ts` — all 4 tests pass. Zero skips. Zero failures.

**Done:** All 4 DB tests pass. `vec_chunks` virtual table is confirmed queryable. Tests do not hit the real filesystem.

---

### Threat Model

| Boundary | Description |
|----------|-------------|
| safeStorage → key file | The encrypted key bytes are written to `userData/.meetingassist.key`. If this file is readable by other processes, the encryption key is exposed (though it requires safeStorage to decrypt it). |
| DB file | The SQLCipher-encrypted `meetingassist.db` file is at `userData/meetingassist.db`. At-rest protection requires the safeStorage key not to be compromised. |

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-06-02-01 | Information Disclosure | `.meetingassist.key` file | high | mitigate | Write key file with `mode: 0o600` (owner-read-only); safeStorage encryption means the file bytes are not plaintext; Keychain-native storage is a v2 hardening |
| T-06-02-02 | Information Disclosure | SQLCipher DB file | high | mitigate | AES-256 SQLCipher encryption via PRAGMA key; key is safeStorage-protected; raw DB bytes are opaque without the key |
| T-06-02-03 | Denial of Service | safeStorage unavailable (non-macOS, CI env) | medium | mitigate | Throw immediately with a clear error; no silent fallback to plaintext — forces developer to run on macOS |
| T-06-02-04 | Tampering | sqlite-vec extension loading | medium | mitigate | `sqliteVec.load(db)` uses the npm package's own path resolution; asarUnpack ensures the .dylib is outside the ASAR archive and loadable; do NOT put sqlite-vec in both asarUnpack and extraResources (double-extension bug) |

### Verification

1. `npx vitest run tests/db.test.ts` — all 4 tests pass
2. Manually inspect that `db.ts` contains the 4-step sequence in order: key decrypt → `new Database()` → `db.pragma('key')` → `sqliteVec.load(db)` → `db.exec(ALL_DDLS)`
3. Confirm all 7 table names appear in the DDL string: `meetings`, `transcript_segments`, `vec_chunks`, `artifacts`, `action_items`, `summary_cards`, `epoch_summaries`

### Success Criteria

`openDatabase()` is implemented with the correct 4-step sequence. All 7 DDLs are present. Tests confirm the DB is functional and all tables exist including the vec_chunks virtual table.

---

## Plan 06-03 — Overlay Window + App Lifecycle

```yaml
plan: "06-03"
wave: 2
depends_on:
  - "06-01"
files_modified:
  - src/main/index.ts
autonomous: true
requirements:
  - FOUND-01
  - FOUND-02
```

### Objective

Implement `src/main/index.ts` with the Electron app lifecycle: `app.dock.hide()`, `createOverlayWindow()` (right-edge panel, always-on-top at `screen-saver` level, `setContentProtection(true)`, no dock icon), and renderer loading. IPC handlers are NOT wired here — they are added in Plan 06-05 to avoid file conflicts.

Purpose: The overlay window configuration is an exact specification from ARCHITECTURE.md §9. Every parameter has a reason; none are optional.

Output: `src/main/index.ts` with `createOverlayWindow()` and `app.whenReady()` lifecycle. The DB is opened here (calling `openDatabase()` from Plan 06-02), but IPC handlers are stubs added later.

### Task 1: Implement src/main/index.ts — window creation and app lifecycle

**Files:** `src/main/index.ts`

**Action:**

Replace the electron-vite scaffold's `src/main/index.ts` with the production implementation. Follow ARCHITECTURE.md §9 exactly.

`createOverlayWindow()` must configure the BrowserWindow with these exact parameters (no deviation without PRD update):
- `width: 380` (OVERLAY_WIDTH constant)
- `height`: full work area height from `screen.getPrimaryDisplay().workAreaSize.height`
- `x`: `workAreaSize.width - 380` (right edge)
- `y: 0`
- `frame: false`
- `transparent: true`
- `alwaysOnTop: true`
- `hasShadow: false`
- `skipTaskbar: true`
- `focusable: false` (default; toggled later in Phase 9 for mouse interaction)
- `webPreferences.contextIsolation: true`
- `webPreferences.nodeIntegration: false`
- `webPreferences.sandbox: false` — REQUIRED: preload script needs `ipcRenderer`; sandbox mode blocks it. This does NOT expose Node.js to the renderer — contextIsolation handles that boundary.
- `webPreferences.preload`: use `join(__dirname, '../preload/index.js')` — the compiled preload output path for electron-vite

After window creation, call in order:
1. `win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`
2. `win.setAlwaysOnTop(true, 'screen-saver')` — `screen-saver` is the named level; sets overlay above most windows including full-screen apps
3. `win.setIgnoreMouseEvents(true, { forward: true })` — default click-through; Phase 9 adds the toggle
4. `win.setContentProtection(true)` — ALWAYS on; never conditional on `NODE_ENV`; hides overlay from user's screen-share per DEC-01 §2

Renderer loading:
- Dev: `if (process.env.VITE_DEV_SERVER_URL) { win.loadURL(process.env.VITE_DEV_SERVER_URL) }`
- Prod: `else { win.loadFile(join(__dirname, '../renderer/index.html')) }`

App lifecycle in `app.whenReady().then(async () => { ... })`:
1. `app.dock.hide()` — removes dock icon; app is a background overlay assistant
2. Call `openDatabase()` from `src/main/store/db.ts` — assign to a module-level `db` variable. If `openDatabase()` throws, log the error and call `app.quit()`. Do NOT let a DB failure cause the app to hang.
3. Call `createOverlayWindow()` — assign to module-level `win`
4. Load renderer (dev URL or file)

Note: IPC `ipcMain.handle()` and `ipcMain.on()` registrations are NOT placed here yet — they will be added in Plan 06-05 (SessionManager plan) to keep file modification scope clean. Reserve a comment block `// IPC handlers — wired in 06-05` after the window creation.

`app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })` — standard macOS behavior.

Export `getMainWindow(): BrowserWindow` and `getDb(): Database.Database` for use by Plan 06-05's IPC handlers.

**Verify (automated):**
`npm run dev` — Electron app launches. The overlay window appears at the right edge of the screen. Window is transparent and frameless. No dock icon appears. Running `npm run dev` and then closing the window exits the process cleanly.

**Done:** `src/main/index.ts` has `createOverlayWindow()` with all 9 BrowserWindow parameters correct. `setContentProtection(true)` is called unconditionally. `app.dock.hide()` fires in `app.whenReady()`. `openDatabase()` is called inside `whenReady`.

---

### Threat Model

| Boundary | Description |
|----------|-------------|
| renderer → main process | contextIsolation + contextBridge enforces this boundary; sandbox: false is required for preload ipcRenderer access but does NOT weaken the renderer isolation |
| overlay window visibility | setContentProtection(true) prevents screen capture; setIgnoreMouseEvents prevents click-through interference |

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-06-03-01 | Information Disclosure | setContentProtection(true) conditional bypass | high | mitigate | Never conditionalize on NODE_ENV; always-on per ARCHITECTURE §9 and DEC-01 §2 |
| T-06-03-02 | Elevation of Privilege | nodeIntegration: true (forbidden config) | critical | mitigate | nodeIntegration: false is explicit in webPreferences; contextIsolation: true enforces boundary; sandbox: false is the correct tradeoff for preload ipcRenderer access |
| T-06-03-03 | Spoofing | preload path resolution in packaged app | medium | mitigate | Use `__dirname`-relative path `'../preload/index.js'`; electron-vite outputs to this exact location |

### Verification

1. `npm run dev` — overlay window appears at right edge, frameless, transparent
2. `app.dock.hide()` verified — no MeetingAssist icon in Dock during `npm run dev`
3. `setContentProtection(true)` verified — open QuickTime screen recording; overlay should NOT appear in the recorded frame
4. Window exits cleanly on close

### Success Criteria

Overlay window launches with all required parameters. No dock icon. Content protection active. DB opens without error in `app.whenReady()`. Renderer loads successfully.

---

## Plan 06-04 — contextBridge Allowlist (18 Channels)

```yaml
plan: "06-04"
wave: 2
depends_on:
  - "06-01"
files_modified:
  - src/preload/index.ts
  - src/renderer/env.d.ts
autonomous: true
requirements:
  - FOUND-06
```

### Objective

Implement `src/preload/index.ts` with the hardened contextBridge allowlist exposing exactly 18 typed channels (6 listen + 12 invoke) as `window.electronAPI`. Any channel not in the allowlist is rejected before reaching `ipcRenderer`. Add the global type declaration for `window.electronAPI` to `src/renderer/env.d.ts`.

Purpose: This is the security boundary between the renderer (untrusted) and the main process (trusted). Raw `ipcRenderer` is NEVER exposed. Every channel is validated by name before forwarding.

Output: `src/preload/index.ts` with 18 channels. `src/renderer/env.d.ts` with `Window.electronAPI` type.

### Task 1: Implement src/preload/index.ts

**Files:** `src/preload/index.ts`

**Action:**

Replace the electron-vite scaffold preload with the hardened allowlist implementation. Source: ARCHITECTURE.md §7 (complete channel list) and RESEARCH.md §4 (implementation pattern).

The 6 inbound (listen) channels — renderer subscribes, main sends via `win.webContents.send()`:
1. `session-state-changed`
2. `transcript-segment`
3. `summary-card-ready`
4. `break-assist-digest-ready`
5. `artifact-proposals-ready`
6. `capture-health-update`

The 12 outbound (invoke) channels — renderer calls `invoke()`, main handles via `ipcMain.handle()`:
1. `consent-confirmed`
2. `mic-audio-chunk`
3. `start-meeting`
4. `end-meeting`
5. `start-break`
6. `end-break`
7. `confirm-artifact`
8. `edit-artifact`
9. `dismiss-artifact`
10. `export-ics`
11. `get-settings`
12. `set-setting`

Define both as `as const` arrays (`LISTEN_CHANNELS` and `INVOKE_CHANNELS`). Use `typeof LISTEN_CHANNELS[number]` and `typeof INVOKE_CHANNELS[number]` as the channel types.

Expose via `contextBridge.exposeInMainWorld('electronAPI', { ... })` with three methods:

`invoke(channel, payload?)`:
- If `channel` is not in `INVOKE_CHANNELS`, return `Promise.reject(new Error(\`Blocked: channel "${channel}" not in allowlist\`))` — do NOT call `ipcRenderer`
- Otherwise: `return ipcRenderer.invoke(channel, payload)`

`on(channel, callback)`:
- If `channel` is not in `LISTEN_CHANNELS`, throw `new Error(\`Blocked: channel "${channel}" not in allowlist\`)` — synchronous throw
- Otherwise: `ipcRenderer.on(channel, (_event, ...args) => callback(...args))`
- Note: strip the `_event` object — never expose the `IpcRendererEvent` to the renderer

`off(channel, callback)`:
- Call `ipcRenderer.off(channel, callback)` directly (channel validation is less critical for unsubscribe; the channel was validated on subscribe)

In `webPreferences`, `sandbox: false` was set in Plan 06-03 — this is what allows the preload to import `ipcRenderer`. Without it, `ipcRenderer` would be undefined and the preload would throw at load time.

**Verify (automated):**
After Plans 06-03 and 06-04 are both complete, open DevTools in the running app (`npm run dev`) and run in the console:
- `window.electronAPI.invoke('INVALID_CHANNEL')` must reject (not hang or silently succeed)
- `window.electronAPI.on('INVALID_CHANNEL', () => {})` must throw
- `window.electronAPI.invoke('get-settings')` must resolve (returns undefined — stub handler from Plan 06-05 not yet wired, but the channel should pass the allowlist check)

**Done:** `src/preload/index.ts` exports the `electronAPI` object with all 18 channels. The allowlist guard rejects unlisted channels before any `ipcRenderer` call.

---

### Task 2: Add global type declaration

**Files:** `src/renderer/env.d.ts`

**Action:**

Add or update `src/renderer/env.d.ts` to declare `window.electronAPI`. The electron-vite scaffold may already have this file with Vite client types — append to it, do not replace.

Add:
```ts
// Global type for the contextBridge-exposed API
// Source: src/preload/index.ts LISTEN_CHANNELS + INVOKE_CHANNELS
interface Window {
  electronAPI: {
    invoke(channel: string, payload?: unknown): Promise<unknown>;
    on(channel: string, callback: (...args: unknown[]) => void): void;
    off(channel: string, callback: (...args: unknown[]) => void): void;
  };
}
```

In Phase 8, this will be replaced with stricter typed channel literals. For Phase 6, the broad `string` type is acceptable since the allowlist enforcement happens at runtime in the preload.

**Verify:**
`npm run build` produces no TypeScript errors related to `window.electronAPI` usage in renderer files.

**Done:** `src/renderer/env.d.ts` includes the `Window.electronAPI` interface. No TS errors in renderer files using `window.electronAPI`.

---

### Threat Model

| Boundary | Description |
|----------|-------------|
| renderer JavaScript → preload contextBridge | The allowlist is the enforcement point. Renderer cannot bypass it without modifying the preload script (which would require compromising the main process). |

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-06-04-01 | Elevation of Privilege | Raw ipcRenderer exposure | critical | mitigate | contextBridge.exposeInMainWorld only; ipcRenderer object itself is never in the exposed API — only the three wrapped methods |
| T-06-04-02 | Tampering | Unlisted channel invocation | high | mitigate | allowlist check before any ipcRenderer.invoke/on call; rejection is synchronous (no ipcRenderer call at all for blocked channels) |
| T-06-04-03 | Information Disclosure | IpcRendererEvent object leaking | medium | mitigate | Strip event from callbacks: `ipcRenderer.on(ch, (_event, ...args) => callback(...args))` — never pass the event to renderer code |

### Verification

1. DevTools console test: `window.electronAPI.invoke('INVALID_CHANNEL')` rejects with "Blocked" error
2. DevTools console test: `window.electronAPI.on('INVALID_CHANNEL', () => {})` throws synchronously
3. All 18 channel names are present in the preload source (grep for each LISTEN and INVOKE channel name)
4. `grep -c 'ipcRenderer' src/renderer/` returns 0 — no raw ipcRenderer usage in renderer files

### Success Criteria

18 channels are present. Allowlist blocks unknown channels. No raw `ipcRenderer` is reachable from renderer code.

---

## Plan 06-05 — SessionManager FSM + IPC Stub Wiring

```yaml
plan: "06-05"
wave: 3
depends_on:
  - "06-03"
  - "06-04"
files_modified:
  - src/main/session/SessionManager.ts
  - src/main/index.ts
  - tests/session.test.ts
autonomous: true
requirements:
  - FOUND-07
```

### Objective

Implement `src/main/session/SessionManager.ts` as a plain TypeScript class FSM with all 6 states and 7 transitions defined (only `Idle → PreCapture` transition is exercised in Phase 6). Wire the two active IPC handlers (`start-meeting` and `consent-confirmed`) into `src/main/index.ts`. Fill in `tests/session.test.ts` with unit tests covering the consent guard.

Purpose: The consent gate is a hard FSM guard enforced in the main process. The guard must exist before audio capture is wired in Phase 7 — it cannot be added retroactively. A renderer-only check can be bypassed from DevTools console.

Output: `SessionManager.ts` with full 6-state transition table. Two active IPC handlers. Passing session tests.

### Task 1: Implement src/main/session/SessionManager.ts

**Files:** `src/main/session/SessionManager.ts`

**Action:**

Implement the `SessionManager` class following ARCHITECTURE.md §5 exactly. Use `EventEmitter` from Node's built-in `events` module. Do NOT use XState or any state machine library — a plain TypeScript class is the locked choice per RESEARCH.md.

Define `SessionState` and `SessionEvent` as union types (copy from ARCHITECTURE.md §5 TypeScript Interface exactly):

```
SessionState: 'Idle' | 'PreCapture' | 'Capturing' | 'OnBreak' | 'Processing' | 'Complete'
SessionEvent: 'start-meeting' | 'consent-confirmed' | 'start-break' | 'end-break' | 'end-meeting' | 'pipeline-complete' | 'session-dismissed'
```

The transition table (copy from RESEARCH.md §7 — TRANSITIONS constant):
- `Idle` accepts `start-meeting` → `PreCapture`
- `PreCapture` accepts `consent-confirmed` → `Capturing`
- `Capturing` accepts `start-break` → `OnBreak`, `end-meeting` → `Processing`
- `OnBreak` accepts `end-break` → `Capturing`
- `Processing` accepts `pipeline-complete` → `Complete`
- `Complete` accepts `start-meeting` → `PreCapture`, `session-dismissed` → `Idle`

Private members:
- `state: SessionState = 'Idle'`
- `consentReceived: boolean = false` — the hard FSM guard flag

`transition(event: SessionEvent): void` method:
1. If `event === 'consent-confirmed'`, set `this.consentReceived = true`
2. If `this.state === 'PreCapture'` AND `event !== 'consent-confirmed'` AND `!this.consentReceived`, throw `new Error('FSM: cannot transition from PreCapture without prior consent-confirmed event')` — this is the DEC-01 guard
3. Look up `nextState = TRANSITIONS[this.state]?.[event]`
4. If `nextState` is undefined, throw `new Error(\`FSM: invalid transition ${this.state} --[${event}]--> (no such transition)\`)`
5. Record `previous = this.state`, set `this.state = nextState`
6. Emit `'state-change'` with `(this.state, previous)`

`onStateChange(cb: (state: SessionState, previous: SessionState) => void): void` — calls `this.on('state-change', cb)`

`getState(): SessionState` — returns `this.state`

Export `SessionManager` as a named export. Export `SessionState` and `SessionEvent` as named type exports.

**Verify (automated):**
`npx vitest run tests/session.test.ts` — all tests pass (after Task 3 fills them in).

**Done:** `SessionManager.ts` exists with all 6 states in the transition table. `consentReceived` guard throws on premature Capturing transitions.

---

### Task 2: Wire IPC handlers in src/main/index.ts

**Files:** `src/main/index.ts`

**Action:**

Add IPC handler registrations to `src/main/index.ts`. This plan modifies the file that Plan 06-03 created — add only the IPC wiring section, do not modify the window creation logic.

After the `// IPC handlers — wired in 06-05` comment block, add:

1. Instantiate `SessionManager`: `const session = new SessionManager()`
2. Wire the state-change callback to push IPC events to the renderer:
   `session.onStateChange((state, previous) => { win.webContents.send('session-state-changed', { state, previous }) })`
3. Wire the two active handlers:
   - `ipcMain.handle('start-meeting', () => { session.transition('start-meeting') })` — returns undefined (Phase 6 stub; meeting ID generation is Phase 7)
   - `ipcMain.handle('consent-confirmed', (_, payload) => { session.transition('consent-confirmed') })` — returns undefined (Phase 6 stub; capture start is Phase 7)
4. Wire stubs for all remaining 10 invoke channels (resolve immediately with undefined):
   - `mic-audio-chunk`, `end-meeting`, `start-break`, `end-break`, `confirm-artifact`, `edit-artifact`, `dismiss-artifact`, `export-ics`, `get-settings`, `set-setting`
   - Pattern: `ipcMain.handle('end-meeting', () => undefined)` for each
5. Wire stubs for all 6 listen channels (on() style — these are main→renderer pushes, so no ipcMain.on needed; they are emitted by the main process, not received)

Note: The 6 listen channels (`session-state-changed`, `transcript-segment`, etc.) are pushed FROM main TO renderer via `win.webContents.send()` — they do not require `ipcMain.on()` registrations. Only `session-state-changed` is actively pushed in Phase 6 (by the SessionManager state-change callback). The other 5 listen channels will be wired in later phases.

Move the `session` instance out of the `app.whenReady()` callback to module scope if needed for access from multiple places (or pass via closure — choose whichever is cleaner). Do NOT call `new SessionManager()` before `app.whenReady()` resolves.

**Verify:**
After `npm run dev`, fire `window.electronAPI.invoke('start-meeting')` from DevTools. The `session-state-changed` event should arrive in the renderer. Verify by adding a temporary `window.electronAPI.on('session-state-changed', console.log)` in DevTools first.

**Done:** All 12 invoke channels have `ipcMain.handle()` registrations (2 active + 10 stubs). `session-state-changed` is pushed on FSM state changes. No invoke channel invocation hangs unresolved.

---

### Task 3: Fill in tests/session.test.ts

**Files:** `tests/session.test.ts`

**Action:**

Replace the placeholder stub with concrete unit tests. `SessionManager` is a pure TypeScript class with no Electron dependencies — it can be tested directly in Vitest's Node environment without any mocks.

Test cases:

1. `it('initializes in Idle state')` — `new SessionManager().getState()` equals `'Idle'`
2. `it('transitions Idle → PreCapture on start-meeting')` — call `transition('start-meeting')`; assert `getState()` equals `'PreCapture'`
3. `it('transitions PreCapture → Capturing on consent-confirmed')` — reach PreCapture; call `transition('consent-confirmed')`; assert `getState()` equals `'Capturing'`
4. `it('emits state-change event on transition')` — attach listener via `onStateChange`; call `transition('start-meeting')`; assert listener was called with `('PreCapture', 'Idle')`
5. `it('throws on invalid transition')` — in Idle state, call `transition('end-meeting')`; assert it throws
6. `it('blocks PreCapture → Capturing without consent-confirmed (DEC-01 guard)')` — reach PreCapture; call `transition('start-break')` (not consent-confirmed); assert it throws with a message about consent. Note: `start-break` is not valid from PreCapture anyway (invalid transition), so verify the error is thrown for ANY event that is not `consent-confirmed` while `consentReceived` is false. Alternatively test by attempting `transition('end-meeting')` from PreCapture without prior consent-confirmed — confirm it throws.
7. `it('resets consentReceived correctly when re-entering PreCapture from Complete')` — run a full cycle to Complete; then `transition('start-meeting')` back to PreCapture; assert that attempting any non-consent-confirmed transition from PreCapture still throws (the guard must reset properly or persist — test the actual behavior of your implementation)

**Verify (automated):**
`npx vitest run tests/session.test.ts` — all 7 tests pass. Zero failures.

**Done:** 7 tests pass. The consent guard (DEC-01) is covered by at least one test.

---

### Threat Model

| Boundary | Description |
|----------|-------------|
| renderer IPC → FSM transition | The FSM is the authoritative enforcer. The renderer can only send IPC events; it cannot directly manipulate FSM state. |

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-06-05-01 | Elevation of Privilege | Consent gate bypass | critical | mitigate | FSM guard in main process: `consentReceived` flag must be true before PreCapture → Capturing transition; UI checkbox is UX only, not security |
| T-06-05-02 | Tampering | FSM state manipulation from DevTools | high | mitigate | FSM state is private to the main process class; renderer can only trigger transitions via allowlisted IPC channels; no FSM state is exposed via IPC |
| T-06-05-03 | Spoofing | Renderer calling consent-confirmed before checkbox | medium | mitigate | Main process FSM only registers consent on the `consent-confirmed` IPC event; whether the renderer's checkbox was checked is irrelevant — the main process receives or does not receive the IPC call |

### Verification

1. `npx vitest run tests/session.test.ts` — 7 tests pass
2. DevTools test: `window.electronAPI.invoke('start-meeting')` fires; `window.electronAPI.on('session-state-changed', console.log)` receives `{ state: 'PreCapture', previous: 'Idle' }`
3. DevTools test: calling `window.electronAPI.invoke('end-meeting')` from PreCapture state (without consent) causes the main process to log an FSM error (check terminal output); it does NOT transition to Processing

### Success Criteria

`SessionManager.ts` is implemented with all 6 states. All 7 tests pass. IPC wiring pushes `session-state-changed` on transitions. DEC-01 consent guard is enforced.

---

## Plan 06-06 — ConsentGate Component + App.tsx Skeleton

```yaml
plan: "06-06"
wave: 3
depends_on:
  - "06-04"
files_modified:
  - src/renderer/App.tsx
  - src/renderer/components/ConsentGate.tsx
  - src/renderer/main.tsx
  - src/shared/schemas/index.ts
autonomous: true
requirements:
  - FOUND-08
```

### Objective

Implement the renderer entry point (`src/renderer/main.tsx`), the root `App.tsx` with a `useSessionState` hook that drives conditional rendering, the `ConsentGate.tsx` component (checkbox + disabled-until-checked Start button), and a stub `src/shared/schemas/index.ts` for the Zod schemas that Phase 8 will flesh out.

Purpose: This is the user-facing layer. The ConsentGate must render in `PreCapture` state and guard the Start button with a checkbox. The `useSessionState` hook wires the renderer to the FSM via IPC.

Output: Functional renderer with conditional ConsentGate rendering. No styling required beyond functional layout. The Start button works end-to-end: checkbox → button enabled → IPC fires → FSM transitions.

### Task 1: Implement src/renderer/main.tsx and src/shared/schemas/index.ts

**Files:** `src/renderer/main.tsx`, `src/shared/schemas/index.ts`

**Action:**

Replace the electron-vite scaffold's `src/renderer/main.tsx` (or equivalent entry file) with the production renderer entry. Import React and ReactDOM, render `<App />` into the `#root` element.

Use `React 19` render syntax: `ReactDOM.createRoot(document.getElementById('root')!).render(<App />)`. Do NOT use the legacy `ReactDOM.render()` API.

Create `src/shared/schemas/index.ts` as a stub. Phase 8 will define the real Zod schemas. For Phase 6, this file only needs to export the `SessionState` type re-export (imported by App.tsx):

```ts
// src/shared/schemas/index.ts
// Stub for Phase 6 — full Zod schemas implemented in Phase 8
// Re-export session types for renderer use
export type { SessionState } from '../main/session/SessionManager';
```

Note: This cross-import from main to shared is acceptable in the dev build. In Phase 8, `SessionState` will be re-declared in schemas/index.ts directly (removing the main process dependency from the shared module). For Phase 6 this shortcut avoids duplicating the type definition.

Install `zod` as a dependency if not already present: `npm install zod`. The scaffold may not include it.

**Verify:**
`npm run dev` — renderer loads without console errors. `document.getElementById('root')` contains the rendered React tree.

**Done:** `src/renderer/main.tsx` renders `<App />`. `src/shared/schemas/index.ts` exists with the SessionState re-export.

---

### Task 2: Implement App.tsx with useSessionState hook

**Files:** `src/renderer/App.tsx`

**Action:**

Replace the scaffold's `App.tsx` with the production skeleton. This file is the root component and IPC event wiring hub.

`useSessionState()` hook:
- `useState<SessionState>('Idle')` as initial state
- `useEffect(() => { window.electronAPI.on('session-state-changed', ({ state }) => setState(state)) }, [])` — subscribe once on mount
- Return `state`

`App` component:
- Call `useSessionState()` to get `sessionState`
- Conditional rendering: when `sessionState === 'PreCapture'`, render `<ConsentGate onConfirmed={() => {}} />`; otherwise render a placeholder `<div>MeetingAssist — {sessionState}</div>`
- The `onConfirmed` callback is a no-op because the state change arrives via the `session-state-changed` IPC push — the parent does not need to manually update state
- Wrap the root in `<div id="overlay-root">` — this is the CSS anchor for overlay layout styling in Phase 9

Do NOT import `SessionState` directly from `../../main/session/SessionManager` — import from `../../shared/schemas` (which re-exports it). This enforces the shared module boundary for Phase 8.

No CSS modules or global styles are required in Phase 6 — plain inline styles or no styles are acceptable. The overlay layout polish happens in Phase 9.

**Verify:**
After `npm run dev`, fire `window.electronAPI.invoke('start-meeting')` from DevTools. The renderer should update to show `<ConsentGate />` (the FSM pushes `session-state-changed` with `state: 'PreCapture'`).

**Done:** `App.tsx` exists with `useSessionState` hook. `sessionState === 'PreCapture'` renders `<ConsentGate />`. The app reflects FSM state changes from the main process.

---

### Task 3: Implement src/renderer/components/ConsentGate.tsx

**Files:** `src/renderer/components/ConsentGate.tsx`

**Action:**

Implement the `ConsentGate` component following ARCHITECTURE.md §10 and RESEARCH.md §8.

Props: `interface ConsentGateProps { onConfirmed: () => void }`

State: `const [agreed, setAgreed] = useState(false)`

Render:
- A heading: "Recording Disclosure"
- A disclosure paragraph explaining that audio will be captured, transcripts are stored locally and encrypted, and audio is discarded after transcription (copy from RESEARCH.md §8 exactly for Phase 6)
- A checkbox `input[type=checkbox]` with `checked={agreed}` and `onChange={(e) => setAgreed(e.target.checked)}`
- A label wrapping the checkbox: "I understand and consent to recording this session"
- A `<button disabled={!agreed}>Start Meeting</button>` — the `disabled` attribute is the UX enforcement; the FSM guard is the security enforcement

`handleConfirm` async function (called on button click):
1. If `!agreed`, return early (safety check — button should be disabled anyway)
2. Call `await window.electronAPI.invoke('consent-confirmed', { meetingId: crypto.randomUUID(), timestamp: Date.now() })`
3. Call `onConfirmed()` (parent callback — currently a no-op; the state change arrives via IPC push)

Wire `onClick={handleConfirm}` on the Start Meeting button.

Use only hooks-based React (no class components). Use TypeScript with explicit prop types. The component signature: `export function ConsentGate({ onConfirmed }: ConsentGateProps): JSX.Element`.

Do NOT add complex styling — Phase 9 handles overlay polish. A minimal structure with readable text and a working button is sufficient.

**Verify (manual):**
`npm run dev` → DevTools console → `window.electronAPI.invoke('start-meeting')` → ConsentGate renders → checkbox unchecked → Start Meeting button is disabled → check checkbox → button enables → click button → DevTools network/IPC inspector shows `consent-confirmed` invoked → `session-state-changed` pushes `{ state: 'Capturing', previous: 'PreCapture' }` → App.tsx renders the placeholder "MeetingAssist — Capturing".

**Done:** `ConsentGate.tsx` renders correctly. Checkbox toggles `agreed` state. Button is `disabled` when `agreed` is false. Clicking Start Meeting invokes `consent-confirmed` IPC. The full `PreCapture → consent → Capturing` flow works end-to-end.

---

### Threat Model

| Boundary | Description |
|----------|-------------|
| renderer checkbox state → IPC | The checkbox is UX only. Security enforcement is in the main-process FSM. The button's disabled state is a convenience — a script could call window.electronAPI.invoke('consent-confirmed') directly from DevTools. The FSM in main is the actual gate. |

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-06-06-01 | Spoofing | ConsentGate button bypass from DevTools | medium | accept | Accepted: the FSM in main process is the authoritative gate; a user with DevTools access already has local machine access; the renderer check is UX, not security |
| T-06-06-02 | Repudiation | No consent audit trail | medium | mitigate | Phase 7 will persist consent event (meetingId + timestamp) to the meetings DB row on FSM transition; for Phase 6, the IPC payload captures timestamp |

### Verification

1. `npm run dev` → DevTools: `window.electronAPI.invoke('start-meeting')` → ConsentGate appears (sessionState becomes PreCapture)
2. Checkbox unchecked → Start Meeting button has `disabled` attribute
3. Checkbox checked → Start Meeting button is clickable
4. Click Start Meeting → DevTools shows `session-state-changed` event with `{ state: 'Capturing', previous: 'PreCapture' }`
5. App.tsx renders "MeetingAssist — Capturing" placeholder

### Success Criteria

ConsentGate renders in PreCapture state. Button disabled until checkbox checked. Full IPC round-trip works: Start Meeting button → consent-confirmed IPC → FSM guard → session-state-changed push → App.tsx re-renders.

---

## Plan 06-07 — electron-builder Packaging Config + Smoke Test

```yaml
plan: "06-07"
wave: 4
depends_on:
  - "06-02"
  - "06-03"
  - "06-04"
  - "06-05"
  - "06-06"
files_modified:
  - package.json
  - build/entitlements.mac.plist
  - scripts/notarize.js
autonomous: false
requirements:
  - FOUND-09
user_setup:
  - service: "macOS developer environment"
    why: "electron-builder --mac --dir requires Xcode Command Line Tools for native module rebuilding and entitlement signing"
    env_vars: []
    dashboard_config:
      - task: "Verify Xcode Command Line Tools are installed"
        location: "Terminal: xcode-select -p (must return a path; install with xcode-select --install if missing)"
```

### Objective

Add the `electron-builder` packaging configuration to `package.json`, create `build/entitlements.mac.plist` with the three required entitlements, create a no-op `scripts/notarize.js` stub, and run `electron-builder --mac --dir` to produce and smoke-test a `.app` bundle.

Purpose: The packaging config must be correct from Phase 6 onward. Specifically, `asarUnpack` must declare BOTH `better-sqlite3-multiple-ciphers` `.node` AND the `audiotee` Swift binary glob — even though `audiotee` is not used until Phase 7. Waiting to add the `audiotee` asarUnpack entry until Phase 7 risks packaging failures that only surface late. The entitlements plist (`disable-library-validation`) is required for both binaries.

Output: A `.app` bundle that launches without a DB error or entitlement error.

### Task 1: Create build/entitlements.mac.plist and scripts/notarize.js

**Files:** `build/entitlements.mac.plist`, `scripts/notarize.js`

**Action:**

Create `build/entitlements.mac.plist` with exactly three entitlements (copy verbatim from RESEARCH.md §6):
1. `com.apple.security.cs.allow-jit` → `<true/>` — required for V8 JIT compilation
2. `com.apple.security.cs.allow-unsigned-executable-memory` → `<true/>` — required for Electron internals
3. `com.apple.security.cs.disable-library-validation` → `<true/>` — required for the `audiotee` Swift binary and `better-sqlite3-multiple-ciphers` native module

Do NOT add any other entitlements in Phase 6. If additional entitlements are needed (e.g., microphone, screen recording), they are added in Phase 7.

Create `scripts/notarize.js` as a CommonJS no-op stub (copy from RESEARCH.md §6). The stub logs a message and returns without calling `@electron/notarize`. Full notarization is Phase 11.

**Verify:**
Both files exist. `build/entitlements.mac.plist` is valid XML (run `plutil -lint build/entitlements.mac.plist`).

**Done:** `build/entitlements.mac.plist` exists with 3 entitlements. `scripts/notarize.js` exists as a no-op stub. `plutil -lint` reports no errors.

---

### Task 2: Add electron-builder config to package.json and run smoke test

**Files:** `package.json`

**Action:**

Add the `"build"` section to `package.json` (copy from RESEARCH.md §6 with the full asarUnpack list):

```json
"build": {
  "appId": "com.meetingassist.app",
  "productName": "MeetingAssist",
  "asar": true,
  "asarUnpack": [
    "**/node_modules/better-sqlite3-multiple-ciphers/**",
    "**/node_modules/better-sqlite3-multiple-ciphers/**/*.node",
    "**/node_modules/sqlite-vec/**",
    "**/node_modules/sqlite-vec-darwin-arm64/**",
    "**/node_modules/sqlite-vec-darwin-x64/**",
    "resources/audiotee"
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
```

Critical notes:
- Do NOT add `sqlite-vec` to `extraResources` — only `asarUnpack`. Both together causes the double-extension bug (`vec0.dylib.dylib`). RESEARCH.md §3 documents this anti-pattern.
- The `resources/audiotee` entry is a placeholder path for the Phase 7 `audiotee` Swift binary. The binary does not exist yet — this is a forward declaration so Phase 7 does not need to update `asarUnpack`.
- `gatekeeperAssess: false` prevents electron-builder from running `spctl` during the build (saves time in dev; full assessment is Phase 11).

Add a build script: `"build:mac-dir": "electron-vite build && electron-builder --mac --dir"` to the scripts section.

Run the smoke test after writing the config:
`npm run build:mac-dir`

The output `.app` bundle will be in `dist/mac-arm64/MeetingAssist.app` (or `dist/mac/` on Intel). Launch it: `open dist/mac-arm64/MeetingAssist.app`. The overlay should appear at the right edge. No DB error in the Console.app logs (check `~/Library/Logs/MeetingAssist/`).

If `sqlite-vec.load(db)` fails in the packaged app (Console.app shows `dlopen` or `No such file` errors), replace the single `sqliteVec.load(db)` call in `db.ts` with this exact fallback wrapper — copy it verbatim:

```typescript
function loadSqliteVec(db: Database): void {
  try {
    sqliteVec.load(db);
  } catch {
    // sqliteVec.load() failed to resolve from asar-unpacked — use explicit path.
    const appPath = app.getAppPath();
    const unpackedBase = appPath.replace('app.asar', 'app.asar.unpacked');
    const arch = process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
    const extPath = path.join(
      unpackedBase,
      'node_modules',
      `sqlite-vec-${arch}`,
      'vec0.dylib'
    );
    db.loadExtension(extPath);
  }
}
```

Call `loadSqliteVec(db)` in place of `sqliteVec.load(db)` in the 4-step init sequence. Do not leave a failing packaged build — resolve this before marking Plan 06-07 complete.

**Verify (automated):**
`npm run build:mac-dir` exits 0. `ls dist/mac-arm64/MeetingAssist.app` exists.

**Verify (manual — checkpoint):**
Open the `.app` bundle and confirm:
1. App launches (overlay appears at right edge)
2. No "DB error" in Console.app for the MeetingAssist process
3. No entitlement error in Console.app (would appear as "Library validation failed" or similar)

**Done:** `electron-builder --mac --dir` exits 0. The `.app` bundle launches. No DB or entitlement errors.

---

### Checkpoint: Human Verify — Packaged App

```xml
<task type="checkpoint:human-verify" gate="blocking">
  <what-built>electron-builder produced a .app bundle in dist/mac-arm64/MeetingAssist.app (or dist/mac/ on Intel). The bundle includes the SQLCipher DB init, the overlay window, and the ConsentGate renderer.</what-built>
  <how-to-verify>
    1. Run: open dist/mac-arm64/MeetingAssist.app
    2. Verify the overlay panel appears at the right edge of your screen
    3. Verify NO dock icon appears for MeetingAssist
    4. Open Console.app (Cmd+Space → "Console"), filter by "MeetingAssist" process name
    5. Confirm no "Library validation failed" messages in Console
    6. Confirm no "DB error" or "safeStorage" error messages in Console
    7. Click somewhere in the overlay area — ConsentGate should render after firing start-meeting (or check if it auto-shows)
    8. Close the app window — process should exit cleanly (no zombie in Activity Monitor)
  </how-to-verify>
  <resume-signal>Type "approved" if all 8 checks pass, or describe which check failed and what you observed.</resume-signal>
</task>
```

### Threat Model

| Boundary | Description |
|----------|-------------|
| ASAR archive → native modules | Native .node files must be outside the ASAR archive (asarUnpack) to be loadable by the OS. |
| hardenedRuntime + entitlements | Hardened runtime rejects code that doesn't match the entitlements. Missing allow-jit causes Electron to crash at startup. |

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-06-07-01 | Tampering | asarUnpack missing for native modules | high | mitigate | asarUnpack entries cover both better-sqlite3-multiple-ciphers and sqlite-vec platform variants; verified by successful packaged app launch |
| T-06-07-02 | Denial of Service | Missing allow-jit entitlement | critical | mitigate | entitlements.mac.plist includes allow-jit; hardenedRuntime: true is set; packaged app launch confirms no entitlement error |
| T-06-07-03 | Tampering | sqlite-vec in both asarUnpack and extraResources | high | mitigate | Use ONLY asarUnpack for sqlite-vec; never add to extraResources (double-extension bug documented in RESEARCH.md Pitfall 2) |
| T-06-07-04 | Information Disclosure | Source maps in ASAR | low | accept | "!out/**/*.map" in files array strips source maps from the bundle; acceptable for Phase 6 dev build |

### Verification

1. `npm run build:mac-dir` exits 0
2. `dist/mac-arm64/MeetingAssist.app` (or `dist/mac/`) exists
3. `open dist/mac-arm64/MeetingAssist.app` launches without Console errors
4. Overlay appears at right edge; no dock icon
5. No DB or entitlement errors in Console.app

### Success Criteria

`electron-builder --mac --dir` produces a `.app` bundle. The bundle launches. No DB error (SQLCipher + sqlite-vec work from asarUnpack path). No entitlement error (hardenedRuntime + plist are correctly configured).

---

## Phase-Level Threat Model

| Boundary | Description |
|----------|-------------|
| renderer → preload → main | contextBridge allowlist is the only communication path; no raw ipcRenderer |
| DB file on disk | AES-256 SQLCipher; key stored via safeStorage → macOS Keychain |
| ASAR archive → native binaries | Both .node and Swift binary must be in asarUnpack |
| FSM state in main | SessionManager state is private to main process; renderer cannot manipulate it directly |

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-06-00-01 | Elevation of Privilege | Consent gate — renderer bypass | critical | mitigate | FSM consent guard in main process (consentReceived flag); renderer checkbox is UX only |
| T-06-00-02 | Information Disclosure | DB key in plaintext | critical | mitigate | safeStorage.encryptString() backed by macOS Keychain; key file written with mode 0o600 |
| T-06-00-03 | Tampering | Raw ipcRenderer exposure | critical | mitigate | contextBridge.exposeInMainWorld only; INVOKE/LISTEN allowlists reject unknown channels |
| T-06-00-04 | Tampering | Native module ABI mismatch | high | mitigate | electron-rebuild postinstall; npmRebuild: true in electron-builder config |
| T-06-00-05 | Information Disclosure | Overlay in screen-share | high | mitigate | setContentProtection(true) unconditional; never conditionalized on NODE_ENV |
| T-06-00-06 | Denial of Service | safeStorage before app.ready | medium | mitigate | openDatabase() called only inside app.whenReady().then(); never at module top-level |
| T-06-00-07 | Tampering | sqlite-vec in asarUnpack AND extraResources | medium | mitigate | Only asarUnpack; extraResources path causes double-extension .dylib.dylib bug |

---

## Multi-Source Coverage Audit

| Source | Item | Status | Covered By |
|--------|------|--------|------------|
| GOAL | Overlay window at right edge, always-on-top, no dock icon | COVERED | Plan 06-03 |
| GOAL | SQLCipher DB with all 7 tables | COVERED | Plan 06-02 |
| GOAL | Hardened contextBridge IPC, 18 typed channels stubbed | COVERED | Plan 06-04 |
| GOAL | Consent gate UI | COVERED | Plan 06-06 |
| GOAL | SessionManager FSM skeleton (Idle → PreCapture) | COVERED | Plan 06-05 |
| GOAL | No audio capture yet | COVERED | All plans — no CaptureService, no audiotee, no STTAdapter |
| REQ | FOUND-01: npm run dev launches overlay at right edge, always-on-top, dock-free | COVERED | Plans 06-01, 06-03 |
| REQ | FOUND-02: Overlay always-on-top (screen-saver level), no dock icon, setContentProtection(true) | COVERED | Plan 06-03 |
| REQ | FOUND-03: SQLCipher DB opens; safeStorage key generated and stored in macOS Keychain | COVERED | Plan 06-02 |
| REQ | FOUND-04: All 7 DB tables created on first launch | COVERED | Plan 06-02 |
| REQ | FOUND-05: sqlite-vec loads from asarUnpack path immediately after DB open | COVERED | Plans 06-02, 06-07 |
| REQ | FOUND-06: Hardened contextBridge with 18 typed channels; unlisted channel invocations rejected | COVERED | Plan 06-04 |
| REQ | FOUND-07: SessionManager FSM enforces Idle → PreCapture; blocks PreCapture → Capturing without consent | COVERED | Plan 06-05 |
| REQ | FOUND-08: ConsentGateScreen renders in PreCapture; Start button disabled until checkbox checked | COVERED | Plan 06-06 |
| REQ | FOUND-09: electron-builder --mac --dir produces .app launching without DB or entitlement error | COVERED | Plan 06-07 |
| RESEARCH | electron-vite 5.0.0 scaffold with react-ts template | COVERED | Plan 06-01 |
| RESEARCH | Electron 42.5.0 pinned | COVERED | Plan 06-01 |
| RESEARCH | Vite 7.3.6 (NOT Vite 8) | COVERED | Plan 06-01 |
| RESEARCH | rollupOptions.external for better-sqlite3-multiple-ciphers and sqlite-vec | COVERED | Plan 06-01 |
| RESEARCH | electron-rebuild postinstall for Electron ABI | COVERED | Plan 06-01 |
| RESEARCH | 4-step DB init sequence (safeStorage → PRAGMA key → sqliteVec.load → DDLs) | COVERED | Plan 06-02 |
| RESEARCH | sqlite-vec NOT in both asarUnpack AND extraResources (double-extension bug) | COVERED | Plan 06-07 |
| RESEARCH | sandbox: false in webPreferences (required for preload ipcRenderer) | COVERED | Plan 06-03 |
| RESEARCH | Plain TypeScript class FSM (no XState) | COVERED | Plan 06-05 |
| RESEARCH | Key file mode 0o600 | COVERED | Plan 06-02 |
| RESEARCH | audiotee asarUnpack entry declared in Phase 6 even though audiotee is Phase 7 | COVERED | Plan 06-07 |
| RESEARCH | Vitest Wave 0 gaps: vitest.config.ts, tests/db.test.ts, tests/session.test.ts | COVERED | Plans 06-01, 06-02, 06-05 |
| CONTEXT | setContentProtection(true) always-on (DEC-01 §2) | COVERED | Plan 06-03 |
| CONTEXT | No raw ipcRenderer in renderer (CLAUDE.md) | COVERED | Plan 06-04 |
| CONTEXT | asarUnpack for better-sqlite3-multiple-ciphers AND audiotee (non-negotiable constraint) | COVERED | Plan 06-07 |
| CONTEXT | Consent gate enforced in main process, not renderer only | COVERED | Plan 06-05 |
| CONTEXT | All 18 IPC channels present as stubs (non-negotiable constraint) | COVERED | Plans 06-04, 06-05 |
| CONTEXT | DB uses 4-step init sequence | COVERED | Plan 06-02 |
| CONTEXT | electron-rebuild configured for better-sqlite3-multiple-ciphers | COVERED | Plan 06-01 |

No gaps. All FOUND-01 through FOUND-09 requirements are covered. All non-negotiable constraints from the phase brief are covered.

---

## Phase-Level Verification (All 5 Acceptance Criteria)

| # | Acceptance Criterion | Verification | Covered By |
|---|---------------------|-------------|------------|
| 1 | App launches from `npm run dev`; overlay at right edge, always-on-top, dock-free, hidden from screen-share | `npm run dev` → overlay appears; no dock icon; QuickTime screen record doesn't capture overlay | Plans 06-01, 06-03 |
| 2 | ConsentGateScreen renders in PreCapture; Start button disabled until checkbox checked | DevTools: `window.electronAPI.invoke('start-meeting')` → ConsentGate renders; button disabled; checkbox → button enabled | Plans 06-05, 06-06 |
| 3 | SQLCipher DB opens without error; all 7 tables exist; sqlite-vec loads from asarUnpack path | `npx vitest run tests/db.test.ts` — all 4 tests pass | Plans 06-02, 06-07 |
| 4 | Unlisted channel invoked from renderer is rejected | DevTools: `window.electronAPI.invoke('INVALID')` rejects; `window.electronAPI.on('INVALID', () => {})` throws | Plan 06-04 |
| 5 | `electron-builder --mac --dir` produces .app launching without DB error or entitlement error | `npm run build:mac-dir` → open bundle → Console.app shows no errors | Plan 06-07 |

---

## Phase-Level Success Criteria

Phase 6 is complete when ALL of the following are true:

1. `npm run dev` works — overlay appears at right edge, frameless, transparent, no dock icon, content-protected
2. ConsentGate renders when `start-meeting` fires — checkbox toggles button enabled state — Start Meeting invokes `consent-confirmed` IPC — FSM transitions to Capturing — App.tsx re-renders
3. `npx vitest run` — all 11 tests pass (4 DB + 7 FSM)
4. DevTools allowlist test — `window.electronAPI.invoke('INVALID')` rejects with "Blocked" message
5. `npm run build:mac-dir` — exits 0; `.app` bundle launches cleanly; no DB error, no entitlement error in Console.app

---

## Wave Execution Order

```
Wave 1 (run first — no dependencies):
  Plan 06-01: Project scaffold

Wave 2 (run after 06-01 — parallel):
  Plan 06-02: DB initialization
  Plan 06-03: Overlay window + app lifecycle
  Plan 06-04: contextBridge allowlist

Wave 3 (run after 06-03 AND 06-04 — parallel with each other):
  Plan 06-05: SessionManager FSM + IPC wiring (modifies src/main/index.ts — no conflict with 06-06)
  Plan 06-06: ConsentGate + App.tsx (modifies renderer only — no conflict with 06-05)

Wave 4 (run after all Wave 3 plans complete):
  Plan 06-07: electron-builder packaging config + smoke test
```

Note on Wave 2 parallelism: Plans 06-02, 06-03, 06-04 all create new files with no overlap. They can run in parallel. Plan 06-05 modifies `src/main/index.ts` (created by 06-03) — must run after 06-03.

---

## Output Instructions

When the full phase is complete, create `.planning/phases/06-foundation-scaffold/06-SUMMARY.md` with:
- What was built (file list)
- Key decisions made (e.g., sqlite-vec.load() fallback used or not, any version pin changes)
- Verification results (test counts, packaged app smoke test result)
- Open items for Phase 7 (e.g., confirm audiotee binary path for asarUnpack)
