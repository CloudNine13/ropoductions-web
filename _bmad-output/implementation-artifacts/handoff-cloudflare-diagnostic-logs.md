# Handoff: Cloudflare & Client Diagnostic Logs (Story 7-9)

## Overview
To diagnose production/preview Cloudflare Worker behaviors (request tracing, D1 session memo hits/misses, R2 asset streaming, byte-range requests, and client engine readiness/failures), structured diagnostic logging has been installed across server and client boundaries.

All server-side Cloudflare logs output structured JSON tagged with `[CF_DIAGNOSTIC][<subtag>]` so they can be filtered cleanly in Cloudflare Dashboard, Wrangler tail, or browser console.

---

## Master Switch (Instant Disable)
All server-side Cloudflare diagnostic logs can be turned off instantly without modifying any call sites:
- **File:** `src/lib/cloudflare-diagnostic.ts`
- **Line:** Change `export const DIAGNOSTIC_LOGGING_ENABLED = true;` to `false;`.

---

## Log Inventory & Removal Checklist

### 1. `src/lib/cloudflare-diagnostic.ts` (NEW FILE)
- **Role:** Centralized structured logger and Cloudflare request context extractor.
- **Action for cleanup:** Delete file `src/lib/cloudflare-diagnostic.ts` once call sites below are removed.

### 2. `src/app/api/game/[[...asset]]/route.ts`
- **Tag:** `// [CLEANUP_TAG: CF_DIAGNOSTIC]`
- **Import:**
  ```typescript
  import {
    extractCloudflareContext,
    logCloudflareDiagnostic,
  } from "@/lib/cloudflare-diagnostic";
  ```
- **Call Sites:**
  1. Start of `handleAssetRequest`: `extractCloudflareContext(request)` and `startMs` benchmark.
  2. `game_asset_unauthorized` (status 403 on missing age/session cookies).
  3. `game_asset_infra_error` (status 500 when DB or authEnv binding fails).
  4. `game_asset_session_rejected` (status 403 when session is invalid/expired).
  5. `game_asset_validation_error` (status 500 when validation throws).
  6. `game_asset_bucket_error` (status 500 when R2 bucket binding fails).
  7. `game_asset_head_error` / `game_asset_read_error` (status 500 on R2 failure).
  8. `game_asset_not_found` (status 404 when asset is missing in R2).
  9. `game_asset_304` (status 304 Not Modified with ETag).
  10. `game_asset_range_read_error` (status 500 on R2 byte-range failure).
  11. `game_asset_206` (status 206 Partial Content with byte range and content length).
  12. `game_asset_200` (status 200 OK with object size, content type, and ETag).
  13. `game_asset_unhandled_get_error` / `game_asset_unhandled_head_error` (outer catch).

### 3. `src/app/engine/[...path]/route.ts`
- **Tag:** `// [CLEANUP_TAG: CF_DIAGNOSTIC]`
- **Import:**
  ```typescript
  import {
    extractCloudflareContext,
    logCloudflareDiagnostic,
  } from "@/lib/cloudflare-diagnostic";
  ```
- **Call Sites:**
  1. Start of `handleEngineRequest`: `extractCloudflareContext(request)` and `startMs`.
  2. `engine_unauthorized` (status 200/404 serving open mock harness to anonymous callers).
  3. `engine_infra_error` (status 500 when DB or authEnv fails).
  4. `engine_validation_error` (status 500 when validation throws).
  5. `engine_session_rejected` (status 403 on denied session).
  6. `engine_bucket_error` (status 500 when shell bucket fails).
  7. `engine_shell_missing_mock` (status 200/404 when shell is missing in R2).
  8. `engine_304` (status 304 Not Modified).
  9. `engine_range_read_error` (status 500 on range read).
  10. `engine_206` (status 206 Partial Content).
  11. `engine_read_error` (status 500 on R2 read).
  12. `engine_200` (status 200 OK with key, isAddressed, size).
  13. `engine_unhandled_get_error` / `engine_unhandled_head_error` (outer catch).

### 4. `src/lib/session-validation-memo.ts`
- **Tag:** `// [CLEANUP_TAG: CF_DIAGNOSTIC]`
- **Import:**
  ```typescript
  import { logCloudflareDiagnostic } from "./cloudflare-diagnostic";
  ```
- **Call Sites:**
  1. `session_memo_hit`: logs when amortised TTL memo returns authorized verdict without querying D1.
  2. `session_memo_miss_d1_validated`: logs when memo misses and executes full D1 query, measuring `durationMs`.

### 5. `src/app/(game)/play/page.tsx`
- **Tag:** `// [CLEANUP_TAG: CF_DIAGNOSTIC]`
- **Import:**
  ```typescript
  import { logCloudflareDiagnostic } from "@/lib/cloudflare-diagnostic";
  ```
- **Call Sites:**
  1. `play_page_age_unverified`: logs redirect to `/?auth_required=true`.
  2. `play_page_no_session`: logs redirect to `sessionClearHref("required")`.
  3. `play_page_session_rejected`: logs redirect when session is revoked/lapsed.
  4. `play_page_authorized`: logs successful mount with `isAdminSession` and `tierName`.

### 6. `src/components/game-viewport.tsx`
- **Tag:** `// [CLEANUP_TAG: CLIENT_DIAGNOSTIC]`
- **Call Sites:**
  1. `[GameViewport] Session rejected; escalating to revalidation.`
  2. `[GameViewport] Boot failure dropped after readiness:`
  3. `[GameViewport] Boot failure:`
  4. `[GameViewport] Engine ready.`
  5. `[GameViewport] Engine ready; preserving fatal failure:`

### 7. `src/engine-plugins/Ropoductions_WebBridge.js`
- **Tag:** `// [CLEANUP_TAG: BRIDGE_DIAGNOSTIC]`
- **Call Sites:**
  1. `[Ropoductions_WebBridge] Engine ready suppressed after fatal boot failure.`
  2. `[Ropoductions_WebBridge] Engine ready.`
  3. `[Ropoductions_WebBridge] Boot failure dropped after readiness:`
  4. `[Ropoductions_WebBridge] Duplicate boot failure dropped:`
  5. `[Ropoductions_WebBridge] Boot failure:`
  6. `[Ropoductions_WebBridge] WebGL context lost; propagation stopped:`
- *Note:* After editing `Ropoductions_WebBridge.js`, re-run `npm run generate:mock`.

---

## Fast Cleanup Command
To locate all lines across the repository for removal:
```bash
git grep "CLEANUP_TAG"
```
Or to remove the imports and delete `src/lib/cloudflare-diagnostic.ts`:
```bash
rm src/lib/cloudflare-diagnostic.ts
```
