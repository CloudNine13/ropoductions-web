# Handoff: Game Ingestion & Automated Sync Pipeline Debate

**Date:** 2026-09-16  
**Topic:** Integrating `salamin888/Final_Orginity` into `ropoductions-web` behind the patron paywall  
**Context:** Brainstorming session with BMAD agents (Winston, Amelia, John, Sally, Mary)  
**Status:** Consensus reached on architecture; pending operational decisions for pipeline implementation.

---

## 1. Context & Discovery Summary

- **Cloudflare Pages Investigation:** The `final-orginity` project on Cloudflare Pages was linked to the private GitHub repository `salamin888/Final_Orginity` (`main` branch).
- **The 404 Explanation:** The live Pages site was returning 404 because its build command was configured as `rm -f "Final Orginity/index.html"`. The studio had intentionally broken the web entrypoint to prevent raw, unauthenticated game assets from being publicly downloaded or hotlinked without patron verification.
- **Repository Inspection (Read-Only):**
  - Engine: RPG Maker MZ HTML5 export (`Final Orginity/game.rmmzproject`).
  - Resolution: Hardcoded to 1280×720 (16:9 aspect ratio).
  - Plugin Stack: `FO_*` custom game scripts, `VisuStella MZ` core plugins, `ODW_MultiLanguageSystem`.
  - Directories: `audio/`, `img/`, `data/`, `effects/`, `movies/`, `fonts/`, `css/`, `js/`.

---

## 2. Core Architecture Consensus (Inviolable Rules)

1. **Same-Origin Sandboxed Iframe (AD-2):**
   - The game runtime shell (`index.html`, `js/`, `css/`, `fonts/icon/`, ~10MB) must be served on the main origin at `/engine/index.html` from the private R2 `engine/` prefix (streamed by `/engine/[...path]`), never committed to the web repository.
   - *Why:* Hosting the game on a separate domain or Pages subdomain causes modern browsers (Safari ITP, Chrome Storage Partitioning) to isolate IndexedDB, wiping or partitioning patron save data (`rmmz_save`).
2. **Private R2 Asset Bucket (AD-5):**
   - Heavy static assets (`audio/`, `img/`, `effects/`, `movies/`, `data/`) must live in the private Cloudflare R2 bucket (`GAME_ASSETS`).
   - The R2 bucket has **zero public HTTP endpoints**.
3. **Edge Paywall Proxy (AD-3, Story 3.2):**
   - When the game requests assets, it calls `/api/game/[...asset]`.
   - Cloudflare Worker edge middleware inspects the `ropoductions_session` cookie against D1.
   - Active $5+ tier patrons or administrative overrides receive the stream with `Cache-Control: private, max-age=86400`. Unauthenticated visitors receive 403.
4. **Read-Only Upstream Constraint:**
   - The team has read-only collaborator access to `salamin888/Final_Orginity`. The portal repo must **never write, push, or open branches** against the upstream game repo.

---

## 3. The Agent Debate & Key Arguments

| Agent | Perspective & Concerns | Proposed Resolution |
|---|---|---|
| **Amelia (Senior Dev)** | **Vehemently opposed continuous auto-deployment on push.** Game devs commit work-in-progress maps, broken scripts, and uncompressed audio directly to `main` at odd hours. Auto-syncing on push would break production mid-game. | Automate the pipeline, but **never auto-trigger on push**. Gate it strictly on a manual dispatch trigger or formal Git release tag. |
| **Winston (Architect)** | **Opposed manual drag-and-drop / FTP.** Manual asset uploads lead to mismatched JSON schemas (e.g. updating `Map014.json` without `System.json`), causing unrecoverable engine crashes. | Build a dedicated GitHub Actions workflow (`.github/workflows/sync-game-assets.yml`) that automates validation, splitting, and deployment on demand. |
| **John (Product Manager)** | **Release control and user communication.** Patrons on Discord expect scheduled updates, patch notes, and advance warning. Mid-game asset swapping corrupts in-flight sessions. | Igor retains 100% control over release timing via a **manual "Sync Game Release" button** in GitHub Actions. |
| **Sally (UX Designer)** | **Save state integrity and viewport scaling.** RPG Maker MZ freezes or loses character sprites if variable/switch IDs in `data/System.json` shift across patches. | The pipeline must include a JSON schema integrity check, and the Save HUD must display the active `Game Build ID` so players know their version before restoring old saves. |
| **Mary (Business Analyst)** | **Security & Access Boundaries.** `salamin888` is an external account. We must not leak Cloudflare API tokens or R2 keys to external webhooks. | The workflow lives entirely inside `CloudNine13/ropoductions-web`. It pulls from `salamin888/Final_Orginity` using a read-only Fine-Grained GitHub PAT stored as a secret in *our* repository. |

---

## 4. Agreed Workflow Blueprint

```mermaid
graph TD
    A[Game Dev pushes to salamin888/Final_Orginity: main] -->|Resting upstream - No trigger| B[(GitHub: salamin888/Final_Orginity)]
    C[Igor clicks 'Sync Game Release' in GitHub Actions] --> D[Workflow runs in CloudNine13/ropoductions-web]
    D -->|Clones repo using Read-Only PAT| E[Temp Runner Workspace]
    E --> F[Validation Step: Verify index.html, package.json, and data/*.json]
    F --> G[Injection Step: Inject Ropoductions_WebBridge.js into plugins.js]
    G --> H[Upload Media to Private R2 Bucket: GAME_ASSETS via S3/Wrangler]
    G --> I[Additive sync of shell to private R2: engine/ prefix]
    H & I --> J[Deploy to Staging / Production Edge]
```

---

## 5. Decisions Settled & Implementation Blueprint (2026-09-17 Session)

### 5.1 Upstream Studio Workflow Findings
1. **Trunk-Based Development on `main`:** The studio develops exclusively on `main` to prevent unresolvable RPG Maker MZ monolithic JSON database merge conflicts (`System.json`, `Items.json`, `Actors.json`) between non-technical artists and writers.
2. **Version Branches as Release Snapshots:** The studio cuts release snapshot branches named after version numbers (e.g., `0.5.8`, `0.6.0`).
3. **Upstream Version File (`tools/release.json`):** Upstream `main` contains `tools/release.json` with `{ "base": "0.6.0", "minBase": "0.6.0" }` and a publishing script `tools/publish.js`.

### 5.2 Pipeline Architecture Decisions
1. **Edge Runtime Isolation (Cloudflare Workers / Pages):**
   - **Decision:** Cloudflare Edge Workers will **never** interact with Git or perform asset synchronization. Edge isolates run under strict CPU/memory limits (128MB ceiling) and are dedicated solely to D1 session validation and R2 byte streaming via `/api/game/*`.
2. **Release Trigger Mechanism (Dual-Trigger Architecture):**
   - **Decision:** Support both portal maintainer manual execution and upstream developer self-service execution without compromising credentials:
     - **Portal Manual Trigger:** `workflow_dispatch` (manual button in GitHub Actions) in `CloudNine13/ropoductions-web`. Input `branch` defaults to `auto`.
     - **Upstream Self-Service Trigger:** `repository_dispatch` (event type `game_release_published`) in `CloudNine13/ropoductions-web`, triggered by an on-demand workflow in `salamin888/Final_Orginity`.
   - **Auto-Default:** When `branch` is `auto` (or omitted from dispatch payload), the runner queries `salamin888/Final_Orginity:main`'s `tools/release.json`, reads the `"base"` string (e.g. `0.6.0`), and clones that branch.
   - **Security Boundary:** Zero Cloudflare credentials (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_ACCOUNT_ID`) or repository write permissions are shared with `salamin888`. Upstream repository receives only a fine-grained GitHub PAT with actions dispatch permissions to `CloudNine13/ropoductions-web`.
3. **R2 Transfer Tooling:**
   - **Decision:** Use the **AWS S3-compatible CLI** (`aws s3 sync --endpoint-url https://<account_id>.r2.cloudflarestorage.com`) with Cloudflare R2 credentials. S3 sync calculates checksum deltas and only transfers modified audio/images, reducing ingestion run times from 15+ minutes down to under 60 seconds.
4. **Engine Shell vs. Static Asset Separation:**
   - **Static Media to Private R2 (`GAME_ASSETS`):** `audio/`, `img/`, `effects/`, `movies/`, `data/`.
   - **Lightweight Shell to Private R2 (`engine/` prefix):** `index.html`, `js/`, `css/`, `fonts/`, `icon/` (~8–10MB).
5. **In-Game Web Bridge (`Ropoductions_WebBridge.js`) Injection:**
   - **Decision:** Ingestion workflow automatically injects `Ropoductions_WebBridge.js` into `js/plugins/` of the staged shell and registers `{ "name": "Ropoductions_WebBridge", "status": true, "description": "Web Shell PostMessage Save Bridge", "parameters": {} }` in `js/plugins.js`.
   - **Protocol:** Enforces `event.origin === window.location.origin`. Handles `ROPODUCTIONS_GET_SAVES` and `ROPODUCTIONS_SET_SAVES` via RPG Maker MZ's `StorageManager`.
   - **Instant Index Refresh:** Upon importing saves, the bridge invokes `DataManager.loadGlobalInfo()` so the in-game "Continue" / load screen updates immediately without requiring an iframe or page reload.
6. **Video Cutscene Handling:**
   - **Decision:** Streamed via `/api/game/movies/*` from R2 with HTTP 206 Partial Content byte-range support enabled in the Next.js/Worker route handler.

---

## 6. Actionable Implementation Checklist

- [ ] Create `.github/workflows/sync-game-release.yml` with dual triggers (`workflow_dispatch` and `repository_dispatch: [game_release_published]`).
- [ ] Add GitHub Secrets in `ropoductions-web`: `UPSTREAM_READ_TOKEN` (fine-grained PAT for `salamin888/Final_Orginity`), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_ACCOUNT_ID`.
- [ ] Generate fine-grained GitHub Dispatch PAT scoped to `CloudNine13/ropoductions-web` actions dispatch and provide to upstream maintainers.
- [ ] Provide upstream maintainers (`salamin888`) with the lightweight `.github/workflows/publish-to-web.yml` dispatch workflow.
- [ ] Implement `Ropoductions_WebBridge.js` plugin under `src/engine-plugins/Ropoductions_WebBridge.js` with postMessage listener, origin checking, and `StorageManager` / `DataManager` hooks.
- [ ] Implement Save HUD import modal with JSZip client-side unzipping, header validation, and error handling.
- [ ] Scaffold lightweight mock canvas harness at `src/engine-plugins/mock-shell.html` (served by `/engine/[...path]` at `/engine/index.html`) to enable decoupled local and E2E testing of Story 3.1 and Epic 4 before live asset ingestion.

---

## 7. Addendum: Upstream Action Contract (`publish-to-web.yml`)

To allow upstream game maintainers to trigger deployment directly from their repository without holding Cloudflare keys:

### 7.1 Upstream Workflow Specification (`salamin888/Final_Orginity:.github/workflows/publish-to-web.yml`)
```yaml
name: Publish Game to Web Portal

on:
  workflow_dispatch:
    inputs:
      branch:
        description: "Branch or tag to publish (or 'auto')"
        required: true
        default: "auto"

jobs:
  dispatch-to-portal:
    name: Trigger ropoductions-web Ingestion
    runs-on: ubuntu-latest
    steps:
      - name: Send Repository Dispatch Event
        run: |
          curl -sS -X POST \
            -H "Accept: application/vnd.github+json" \
            -H "Authorization: Bearer ${{ secrets.ROPODUCTIONS_TRIGGER_TOKEN }}" \
            -H "X-GitHub-Api-Version: 2022-11-28" \
            https://api.github.com/repos/CloudNine13/ropoductions-web/dispatches \
            -d '{"event_type": "game_release_published", "client_payload": {"branch": "${{ github.event.inputs.branch }}"}}'
          echo "Dispatched game_release_published event to CloudNine13/ropoductions-web."
```

### 7.2 Secrets & Token Setup
1. **`ROPODUCTIONS_TRIGGER_TOKEN`:** Fine-grained GitHub PAT issued by `CloudNine13` with `Actions: Read and write` on `CloudNine13/ropoductions-web` only.
2. Saved in `salamin888/Final_Orginity` repository secrets.
3. Upstream developers trigger the workflow manually via GitHub Actions UI ("Run workflow") or chain it to their release tagging workflow.

---

## 8. Decoupled Testing Strategy for Story 3.1 & Epic 4

### 8.1 Problem
Developing and testing Story 3.1 (16:9 responsive iframe, mobile touch parity, fullscreen) and Epic 4 (Save HUD dock, postMessage bridge, JSZip backup) cannot block on upstream release ingestion or private R2 asset population.

### 8.2 Solution: Local Mock Canvas Harness
1. `src/engine-plugins/mock-shell.html` hosts a 16:9 mock canvas (1280x720) with touch/pointer coordinate display and origin-verified postMessage handling, served by `/engine/[...path]` at `/engine/index.html`.
2. Story 3.1 verifies viewport locking (`100dvh`/`100dvw`), touch handling (`touch-action: manipulation`), and Fullscreen API against the mock.
3. Story 3.2 verifies authenticated R2 streaming via Vitest unit tests mocking `R2Bucket` and Miniflare local emulation in `wrangler dev`.
4. Epic 4 verifies `ROPODUCTIONS_GET_SAVES`, `ROPODUCTIONS_SET_SAVES`, and `ROPODUCTIONS_RESET_SAVES` against the mock bridge.
5. When Story 3.3 sync runs, the `/engine/[...path]` route begins streaming the real RPG Maker MZ shell from the R2 `engine/` prefix once published, requiring zero code changes in the Next.js web application.
