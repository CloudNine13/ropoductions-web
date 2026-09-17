---
title: 'Story 3.3: Upstream Game Release Ingestion & R2 Sync Workflow (Manual & Remote Trigger)'
type: 'feature'
created: '2026-09-17'
status: 'ready-for-dev'
baseline_commit: 'f0f0716c527e0255474cf47137f8490a2cfbfd40'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-ropoductions-web-2026-09-15/ARCHITECTURE-SPINE.md'
  - '_bmad-output/specs/spec-ropoductions-web/SPEC.md'
  - '_bmad-output/planning-artifacts/prds/prd-ropoductions-web-2026-09-15/prd.md'
  - '_bmad-output/planning-artifacts/handoffs/handoff-game-sync-pipeline-2026-09-16.md'
  - '_bmad-output/specs/spec-ropoductions-web/save-and-runtime-contract.md'
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The RPG Maker MZ game client (`Final Orginity`) is maintained in upstream private repository `salamin888/Final_Orginity`. Manually downloading, inspecting, splitting, and uploading multi-gigabyte game builds to Cloudflare R2 is error-prone, risks schema corruption (mismatched `System.json` and map databases crashing runtime saves), and creates critical security hazards if Cloudflare R2 credentials or repository write keys are exposed to external developers. Furthermore, Cloudflare Edge Workers cannot run Git operations or asset ingestion due to strict execution limits (128MB isolate memory ceiling).

**Approach:** Implement an automated, hardened on-demand GitHub Actions release pipeline (`.github/workflows/sync-game-release.yml`) driven by a modular Node.js ingestion engine (`scripts/sync-game-release.ts`):
1. **Dual-Trigger Architecture (AD-9):** Supports manual trigger by portal maintainers via `workflow_dispatch` (with `branch` parameter defaulting to `auto`), and remote trigger by upstream game developers via `repository_dispatch` (event type `game_release_published`) or GitHub Actions workflow dispatch API.
2. **Concurrency Serialization:** Implements workflow-level concurrency (`group: sync-game-release`, `cancel-in-progress: false`) to serialize rapid successive dispatches, eliminating R2 upload race conditions and Git push conflicts.
3. **Dynamic Upstream Branch Resolution with Strict Sanitization:** When `branch` is `auto` or omitted, queries upstream `main`'s `tools/release.json` via GitHub API with `Accept: application/vnd.github.raw+json` using `UPSTREAM_READ_TOKEN` to extract the active `base` version string (e.g. `0.6.0`). Enforces strict regex validation (`/^[a-zA-Z0-9][a-zA-Z0-9._\/-]{0,100}$/`), rejects leading hyphens (`-`), and prevents CLI flag or path injection.
4. **Game Root Location & Path Rebasing:** Intelligently resolves game root (`locateGameRoot`) whether files live inside `Final Orginity/` or repository root. Rebases all R2 media uploads and engine shell extraction strictly relative to the detected game root, ensuring R2 keys match `/api/game/*` expectations (`audio/...`, `img/...`, `data/...`) without subdirectory prefix contamination.
5. **Automated Structural & Comprehensive JSON Validation:** Shallow-clones the release snapshot using authenticated headers (never embedding tokens in git clone URLs). Verifies existence of `data/System.json`, `package.json`, and `index.html`. Iterates and parses all `data/*.json` files to ensure zero truncated, empty, or corrupted database files before any mutations occur.
6. **Syntax-Safe Idempotent Web Bridge Injection:** Automatically copies the origin-locked postMessage bridge (`src/engine-plugins/Ropoductions_WebBridge.js`) into `js/plugins/` and safely registers it in `js/plugins.js`. Handles empty arrays, comments, and trailing commas, validating modified file syntax with `new Function()` before persisting.
7. **Additive R2 Media Sync (Zero Deletion Hazard):** Synchronizes static media assets (`audio/`, `img/`, `effects/`, `movies/`, `data/`) directly to private Cloudflare R2 bucket (`GAME_ASSETS`) using AWS CLI S3 sync (`--endpoint-url`) strictly without `--delete`, preserving backward compatibility for historic patron save files.
8. **Symlink-Safe Shell Ingestion & Audit Metadata:** Ingests lightweight HTML5 shell (`index.html`, `js/`, `css/`, `fonts/`, `icon/`) to `public/engine/` after rejecting symbolic links and verifying path containment. Writes `public/engine/build-metadata.json` (recording upstream branch, commit SHA, and timestamp) and commits to Git using `github-actions[bot]`.
9. **Origin-Locked & Prototype-Pollution-Hardened WebBridge:** In-game bridge strictly enforces `event.origin === window.location.origin`, checks that inbound payloads are plain non-null objects, validates slot keys against strict regex `/^(file([1-9]|1[0-9]|20)|global|config)(\.rpgsave)?$/`, rejects `__proto__` / `constructor` pollution attempts, and invokes `DataManager.loadGlobalInfo()` for instant UI refresh.
10. **Absolute Secret Isolation:** Cloudflare R2 secrets (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_ACCOUNT_ID`) and clone credentials reside strictly within `ropoductions-web`. Upstream maintainers receive zero Cloudflare credentials and zero repository write permissions.

## Boundaries & Constraints

**Always:**
- Declare least-privilege workflow permissions in `.github/workflows/sync-game-release.yml`: `permissions: contents: write` (for engine shell commit).
- Add workflow concurrency control: `concurrency: { group: "sync-game-release", cancel-in-progress: false }`.
- Keep Cloudflare R2 credentials (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_ACCOUNT_ID`) and upstream clone token (`UPSTREAM_READ_TOKEN`) strictly inside `ropoductions-web` repository secrets. Pass them exclusively via step-level `env:` blocks, never via command line arguments.
- Upstream developers (`salamin888`) must NEVER receive Cloudflare tokens, R2 access keys, or repository write access.
- Support both `workflow_dispatch` (with `branch` defaulting to `auto`) and `repository_dispatch: [game_release_published]`.
- Pass all untrusted inputs (`github.event.inputs.branch`, `github.event.client_payload.branch`) via step environment variables (`BRANCH_INPUT`), never interpolating `${{ ... }}` directly into inline bash scripts.
- Enforce strict allowlist regex validation on branch names from both payload and upstream `release.json`: `/^[a-zA-Z0-9][a-zA-Z0-9._\/-]{0,100}$/`. Reject any branch starting with `-` (preventing git flag injection), and reject strings containing `..` or `//`.
- When input `branch` is `auto` or empty, query upstream `main`'s `tools/release.json` via GitHub API with `Accept: application/vnd.github.raw+json` using `UPSTREAM_READ_TOKEN` to extract `"base"`. Handle 401/403/404 with descriptive errors.
- Shallow-clone upstream release snapshots using `git -c http.extraheader="AUTHORIZATION: basic ${AUTH_HEADER}" clone --depth 1 --branch "$SAFE_BRANCH" -- "$REPO_URL" "$TARGET_DIR"`. Never embed credentials in the git clone URL.
- Rebase all asset paths using `locateGameRoot(targetDir)`. If files reside in `Final Orginity/`, resolve the game root to that subdirectory so R2 object keys never contain `Final Orginity/`.
- Validate required game files: `data/System.json`, `package.json`, `index.html`. Validate `data/System.json` contains required fields (`gameTitle`, `versionId`, `variables`, `switches`). Verify that every `.json` file in `data/` is non-empty and parses cleanly.
- Author `src/engine-plugins/Ropoductions_WebBridge.js` strictly enforcing `event.origin === window.location.origin`. Validate inbound payloads as non-null plain objects. Validate slot keys against `/^(file([1-9]|1[0-9]|20)|global|config)(\.rpgsave)?$/`. Reject `__proto__`, `constructor`, `prototype`. Enforce max slot size (10MB).
- Support message protocols: `ROPODUCTIONS_GET_SAVES` (reads slots via `StorageManager`, returns `ROPODUCTIONS_SAVES_DATA`), `ROPODUCTIONS_SET_SAVES` (persists slots, calls `DataManager.loadGlobalInfo()`, returns `ROPODUCTIONS_SET_SAVES_SUCCESS`), `ROPODUCTIONS_RESET_SAVES` (clears storage, calls `DataManager.loadGlobalInfo()`, returns `ROPODUCTIONS_RESET_SAVES_SUCCESS`).
- Inject `Ropoductions_WebBridge.js` into `js/plugins/` and register in `js/plugins.js` idempotently. Validate modified `plugins.js` syntax via `new Function(code)` before writing.
- Upload static media directories (`audio/`, `img/`, `effects/`, `movies/`, `data/`) directly to private R2 bucket `GAME_ASSETS` via AWS CLI S3 sync (`--endpoint-url https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`).
- During shell copy to `public/engine/`, check `fs.lstatSync().isSymbolicLink()` and reject/skip symlinks. Canonicalize all target paths and verify containment within `public/engine/`.
- Write `public/engine/build-metadata.json` containing `{ upstreamRepo, branch, commitSha, syncedAt }`.
- Commit changes using `github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>` with a deterministic message: `chore(engine): sync game release ${SAFE_BRANCH} [upstream:${SHORT_SHA}]`.
- Provide upstream workflow reference file (`docs/upstream/publish-to-web.yml`).
- Register all new test files in `package.json` under `test:unit` to satisfy `tests/suite-manifest.test.ts`.

**Never:**
- Never include the `--delete` flag in the `aws s3 sync` command. R2 asset synchronization must be strictly additive to prevent deleting historical assets referenced by older patron save files.
- Never auto-trigger ingestion on raw Git push to upstream `main`.
- Never execute Git operations or asset ingestion inside Cloudflare Edge Workers / Pages functions at runtime.
- Never write, push, or open branches in `salamin888/Final_Orginity` (portal is strictly read-only towards upstream).
- Never embed access tokens in git clone URLs or echo secret-bearing commands to CI logs.
- Never prefix R2 object keys with upstream directory wrappers like `Final Orginity/`.
- Never overwrite save slots without origin verification and key allowlist validation in `Ropoductions_WebBridge.js`.
- Never commit large media assets (`audio/`, `img/`, `effects/`, `movies/`) into the `ropoductions-web` Git repository.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Manual Dispatch with Explicit Branch | `workflow_dispatch` with `branch: "0.6.0"` | Validates branch name regex, clones `0.6.0`, validates structure, injects bridge, syncs R2 media, commits shell | Fails fast if branch does not exist in upstream |
| Manual Dispatch with `auto` Branch | `workflow_dispatch` with `branch: "auto"` | Fetches `tools/release.json` from `main`, reads `base: "0.6.0"`, validates regex, clones `0.6.0` | Fails with clear error if `tools/release.json` is missing or lacks `base` |
| Malicious Branch Input (Injection Attempt) | Dispatch with `branch: "-u; rm -rf /"` or `../../master` | Regex validation `/^[a-zA-Z0-9][a-zA-Z0-9._\/-]{0,100}$/` fails immediately; rejection before git execution | Process exits immediately with exit code 1 and error "Invalid branch name format" |
| Remote Repository Dispatch Trigger | `repository_dispatch` with `event_type: "game_release_published"`, `client_payload.branch: "0.6.1"` | Resolves and validates branch `0.6.1`, executes full pipeline | Fails fast if payload branch is invalid or missing |
| Remote Trigger with Auto Fallback | `repository_dispatch` with empty or `"auto"` payload | Resolves active base from `tools/release.json` on `main`, runs full pipeline | Fails if `tools/release.json` cannot be fetched or parsed |
| Missing Critical File in Upstream | Cloned branch lacks `data/System.json` or `index.html` | Validation step detects missing required files; halts immediately before R2 upload or Git commit | Emits descriptive error listing missing files; exits with non-zero code |
| Corrupted / Truncated JSON in Database | Cloned `data/Map001.json` is empty or invalid syntax | Comprehensive JSON validation step fails; halts immediately | Emits parse error with syntax details; exits with non-zero code |
| Subdirectory Upstream Structure | Upstream repo organizes game files inside `Final Orginity/` folder | `locateGameRoot` detects `Final Orginity/` and rebases all R2 and shell paths relative to it | Fails with clear path error if neither root nor `Final Orginity/` contains game files |
| Idempotent Bridge Plugin Registration | `js/plugins.js` already has `Ropoductions_WebBridge` registered from prior sync | Script detects existing entry, leaves intact; validates syntax with `new Function()` | Safely continues pipeline; zero duplicate plugin entries |
| Plugin Injection on Empty Plugins Array | Upstream `js/plugins.js` contains `var $plugins = [];` | Script injects bridge as first element without leading comma syntax errors; passes syntax check | Valid JavaScript written |
| No Engine Shell Changes Detected | Upstream HTML/JS/CSS shell matches current `public/engine/` exactly | R2 sync updates media; Git diff detects 0 changes in `public/engine/`; skips commit cleanly | Exits step with `0` exit code and log "No changes in public/engine, skipping commit" |
| Concurrent Workflow Triggers | Two dispatches received 5 seconds apart | Concurrency group `sync-game-release` queues the second run until the first finishes | Eliminates R2 sync races and Git commit push rejections |
| Cross-Origin Message to WebBridge | `postMessage` received from `https://malicious-site.com` | Bridge checks `event.origin !== window.location.origin`; discards message immediately | Silently ignores untrusted origin; does not touch `StorageManager` |
| Prototype Pollution Attempt via WebBridge | `ROPODUCTIONS_SET_SAVES` with payload `{"__proto__": {"polluted": true}}` | Key regex validation rejects `__proto__`; aborts save operation | Discards invalid key; does not modify `Object.prototype` |
| WebBridge Set Saves Execution | Inbound `ROPODUCTIONS_SET_SAVES` with valid payload | Saves slots via `StorageManager.saveObject`, calls `DataManager.loadGlobalInfo()`, returns `ROPODUCTIONS_SET_SAVES_SUCCESS` | Discards invalid payload types |
| WebBridge Storage Reset | Inbound `ROPODUCTIONS_RESET_SAVES` | Clears save slots via `StorageManager`, calls `DataManager.loadGlobalInfo()`, returns `ROPODUCTIONS_RESET_SAVES_SUCCESS` | Re-initializes empty global info |

</frozen-after-approval>

## Code Map

- `.github/workflows/sync-game-release.yml` -- Hardened GitHub Actions workflow definition with dual triggers (`workflow_dispatch`, `repository_dispatch`), concurrency group, secret injection via `env:`, safe git clone, script invocation, AWS S3 sync (without `--delete`), and shell commit with `build-metadata.json`.
- `src/engine-plugins/Ropoductions_WebBridge.js` -- In-game RPG Maker MZ plugin implementing origin-verified postMessage communication, prototype-pollution-resistant save slot export (`ROPODUCTIONS_GET_SAVES`), import (`ROPODUCTIONS_SET_SAVES`), reset (`ROPODUCTIONS_RESET_SAVES`), and `DataManager.loadGlobalInfo()` live screen refresh.
- `scripts/sync-game-release.ts` -- Core ingestion engine and CLI tool providing:
  - `validateBranchName(branch: string): string`: Enforces allowlist regex `/^[a-zA-Z0-9][a-zA-Z0-9._\/-]{0,100}$/` and rejects leading hyphens.
  - `resolveTargetBranch(inputBranch, fetchReleaseJson)`: Resolves `auto` to upstream `tools/release.json` `base` string with HTTP error handling.
  - `locateGameRoot(baseDir)`: Detects `Final Orginity/` subdirectory or repository root.
  - `validateGameStructure(gameDir)`: Verifies presence of `data/System.json`, `package.json`, and `index.html`; parses all `data/*.json` files.
  - `injectWebBridge(gameDir, bridgeSourcePath)`: Copies bridge plugin into `js/plugins/`, idempotently registers it in `js/plugins.js`, and validates syntax via `new Function()`.
  - `segregateAssets(gameDir, outputDir)`: Partitions game files into R2 media paths (`audio/`, `img/`, `effects/`, `movies/`, `data/`) and shell paths (`index.html`, `js/`, `css/`, `fonts/`, `icon/`), rejecting symlinks.
  - `generateBuildMetadata(options)`: Creates `build-metadata.json` for auditability.
- `docs/upstream/publish-to-web.yml` -- Upstream documentation and copy-paste GitHub Action workflow for `salamin888/Final_Orginity`.
- `package.json` -- Registers test files in `test:unit`.
- `tests/game-sync.test.ts` -- Unit tests verifying branch validation, branch resolution, game root location, JSON database integrity checks, plugin injection idempotency, and asset segregation.
- `tests/engine-bridge.test.ts` -- Unit tests for `Ropoductions_WebBridge.js` verifying origin security enforcement, prototype pollution resistance, save retrieval, save injection with `DataManager.loadGlobalInfo()`, and reset.
- `tests/workflow-manifest.test.ts` -- Validates GitHub Action workflow YAML syntax, dual triggers, concurrency group, absence of `--delete`, and required environment bindings.

## Tasks & Acceptance

**Execution:**
- [ ] `src/engine-plugins/Ropoductions_WebBridge.js` -- Implement RPG Maker MZ plugin with origin-locking (`window.location.origin`), prototype pollution guards, `ROPODUCTIONS_GET_SAVES`, `ROPODUCTIONS_SET_SAVES`, `ROPODUCTIONS_RESET_SAVES`, and `DataManager.loadGlobalInfo()` integration.
- [ ] `scripts/sync-game-release.ts` -- Implement modular release ingestion engine and CLI (`validateBranchName`, `resolveTargetBranch`, `locateGameRoot`, `validateGameStructure`, `injectWebBridge`, `segregateAssets`, `generateBuildMetadata`).
- [ ] `.github/workflows/sync-game-release.yml` -- Author GitHub Actions workflow with concurrency group, dual triggers (`workflow_dispatch`, `repository_dispatch`), runner clone with extra headers, script invocation, AWS CLI S3 sync (without `--delete`) to `GAME_ASSETS`, and git commit for `public/engine/`.
- [ ] `docs/upstream/publish-to-web.yml` -- Document upstream trigger workflow specification for `salamin888/Final_Orginity`.
- [ ] `tests/game-sync.test.ts` -- Unit tests covering branch sanitization, branch resolution, structural validation, corrupted JSON handling, plugin registration idempotency, and file segregation.
- [ ] `tests/engine-bridge.test.ts` -- Unit tests covering `Ropoductions_WebBridge.js` origin rejection, prototype pollution rejection, save queries, save injection, and storage reset.
- [ ] `tests/workflow-manifest.test.ts` -- Unit tests verifying `.github/workflows/sync-game-release.yml` YAML structure, concurrency, triggers, and absence of `--delete`.
- [ ] `package.json` -- Register new test files in `test:unit` script and verify `tests/suite-manifest.test.ts` passes.
- [ ] Verify test suite passes (`npm run test:unit`) and verify OpenNext build (`npm run build`).

**Acceptance Criteria:**
- Given a project maintainer triggering `.github/workflows/sync-game-release.yml` via `workflow_dispatch` or upstream developer triggering `repository_dispatch` (event type `game_release_published`), when input `branch` is `auto`, the runner queries upstream `tools/release.json` and shallow-clones the active release branch using `UPSTREAM_READ_TOKEN`.
- Given an untrusted branch name from inputs or payload, the system validates `/^[a-zA-Z0-9][a-zA-Z0-9._\/-]{0,100}$/` and rejects leading hyphens or path traversals before invoking Git commands.
- Given an upstream release snapshot, the ingestion engine detects `locateGameRoot()`, verifies `data/System.json`, `package.json`, and `index.html` exist, and validates that all `.json` files in `data/` parse without error.
- Given verified game files, `Ropoductions_WebBridge.js` is injected into `js/plugins/` and registered in `js/plugins.js` with syntax validation via `new Function()`.
- Given media directories `audio/`, `img/`, `effects/`, `movies/`, and `data/`, the pipeline synchronizes them relative to the game root to private Cloudflare R2 bucket `GAME_ASSETS` without `--delete`.
- Given lightweight shell files `index.html`, `js/`, `css/`, `fonts/`, and `icon/`, the pipeline copies them to `public/engine/`, generates `build-metadata.json`, and commits them to Git.
- Given `Ropoductions_WebBridge.js` receiving messages inside the iframe, any message whose `event.origin !== window.location.origin` or payload containing prototype pollution keys (`__proto__`, `constructor`) is rejected with zero storage access.
- Given Cloudflare R2 secrets (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_ACCOUNT_ID`), they reside strictly in `ropoductions-web` with zero exposure to `salamin888`.

## Implementation Notes

## Spec Change Log
- 2026-09-17: Initial review hardening from `SpecReviewer-2` and `SecurityReviewer-2`:
  - Enforced strict branch regex validation (`/^[a-zA-Z0-9][a-zA-Z0-9._\/-]{0,100}$/`) and forbidden leading hyphens to eliminate command and argument injection (SEC-001).
  - Added prototype pollution guards and save slot key allowlist validation in `Ropoductions_WebBridge.js` (SEC-002).
  - Forbade the `--delete` flag in `aws s3 sync` to preserve backward-compatible save assets (SEC-003).
  - Clarified trigger permissions and least-privilege workflow permissions `permissions: contents: write` (SEC-004, SPEC-1).
  - Mandated passing tokens via `http.extraheader` instead of URL embedding, and passing R2 keys strictly via step environment variables (SEC-005).
  - Added symlink rejection and path containment validation during shell extraction (SEC-006).
  - Added `build-metadata.json` generation for release auditability (SEC-007).
  - Expanded JSON validation to iterate and parse all `data/*.json` files (SEC-008).
  - Mandated path rebasing via `locateGameRoot()` to prevent `Final Orginity/` prefix contamination in R2 (SPEC-2).
  - Hardened `plugins.js` injection for empty arrays, comments, and added `new Function()` syntax verification (SPEC-3).
  - Added workflow concurrency group `sync-game-release` with `cancel-in-progress: false` (SPEC-5).

## Review Triage Log
- [SEC-001] Command/argument injection via branch inputs: Validated. Added strict regex validation, leading hyphen rejection, and `env:` parameter passing.
- [SEC-002] Prototype pollution in `Ropoductions_WebBridge.js`: Validated. Added key allowlist regex `/^(file([1-9]|1[0-9]|20)|global|config)(\.rpgsave)?$/`, plain object check, and slot size limit.
- [SEC-003] AWS S3 sync `--delete` flag hazard: Validated. Added explicit invariant forbidding `--delete` to protect historic save assets.
- [SEC-004] Repository dispatch permission boundary: Validated. Added least-privilege workflow permissions and documented both dispatch endpoints.
- [SEC-005] Credential masking and git clone URL security: Validated. Mandated `http.extraheader` authentication and step-level env bindings.
- [SEC-006] Symlink traversal during extraction: Validated. Added `lstat` symlink checks and destination canonicalization.
- [SEC-007] Supply chain auditability: Validated. Added `public/engine/build-metadata.json` generation.
- [SEC-008] Incomplete JSON database validation: Validated. Expanded check to all `data/*.json` files.
- [SPEC-1] Branch protection & write permissions: Validated. Configured `permissions: contents: write` and `github-actions[bot]` author identity.
- [SPEC-2] Subdirectory R2 key prefix contamination: Validated. Mandated rebasing R2 media and engine shell relative to `locateGameRoot()`.
- [SPEC-3] Idempotent plugin injection syntax safety: Validated. Added handling for empty arrays, comments, and `new Function()` validation.
- [SPEC-4] API transport & ref sanitization: Validated. Specified `Accept: application/vnd.github.raw+json` and HTTP status error handling.
- [SPEC-5] Workflow concurrency race conditions: Validated. Added `concurrency: group: sync-game-release, cancel-in-progress: false`.
- [SPEC-6] Unexpected directory policy: Validated. Explicitly partitioned media to R2 and shell to `public/engine/`, excluding dev files.

## Design Notes

### Ingestion Engine Separation of Concerns
The ingestion script `scripts/sync-game-release.ts` separates file system manipulation from network side-effects. Network actions (cloning upstream and running AWS S3 sync) are orchestrated by GitHub Actions, while directory inspection, JSON validation, plugin injection, and asset segregation run in pure TypeScript functions that can be executed and tested locally with mocked directories.

### Web Bridge Registration in `plugins.js`
RPG Maker MZ loads plugins declared in `js/plugins.js`:
```javascript
// Generated by RPG Maker.
// Do not edit this file directly.
var $plugins =
[
  {"name":"Ropoductions_WebBridge","status":true,"description":"Web Shell PostMessage Save Bridge","parameters":{}}
];
```
The injection script parses `var $plugins = [...]` or uses a regex/AST parser to check if `Ropoductions_WebBridge` is already present. If missing, it appends the plugin entry cleanly handling empty arrays `[]` and trailing commas, then executes `new Function(modifiedContent)` to guarantee valid JavaScript before writing.

## Verification

**Commands:**
- `npm run test:unit` -- expected: All unit tests pass, including `game-sync.test.ts`, `engine-bridge.test.ts`, and `workflow-manifest.test.ts`.
- `npm run build` -- expected: OpenNext Next.js build succeeds without TypeScript or bundle errors.
- `git status` -- expected: Clean working tree on working branch `feat/3-3-upstream-game-release-ingestion-r2-sync-workflow`.
