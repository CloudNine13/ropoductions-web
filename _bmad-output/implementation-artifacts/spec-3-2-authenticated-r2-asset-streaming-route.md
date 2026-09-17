---
title: 'Story 3.2: Authenticated R2 Asset Streaming Route & Edge Middleware Protection'
type: 'feature'
created: '2026-09-17'
status: 'ready-for-dev'
baseline_commit: '4850ed2a210d72023eeae847e17446f2c5d18d45'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-ropoductions-web-2026-09-15/ARCHITECTURE-SPINE.md'
  - '_bmad-output/specs/spec-ropoductions-web/SPEC.md'
  - '_bmad-output/planning-artifacts/prds/prd-ropoductions-web-2026-09-15/prd.md'
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The embedded RPG Maker MZ game client requires access to static media, encrypted blobs, and data files (`audio/`, `img/`, `effects/`, `movies/`, `data/`). Serving these files publicly would allow unauthorized visitors, bots, and web scrapers to download, rip, or hotlink studio assets, circumventing the Patreon paywall and leaking exclusive game content. Furthermore, unauthenticated requests hitting database-backed route handlers could exhaust Cloudflare D1 query limits or degrade edge compute performance. Conversely, naive database checks on every individual asset burst (dozens of files requested simultaneously on scene load) risk breaching the 300ms asset load budget (PRD SM-C2).

**Approach:** Implement a hardened two-tier defense architecture:
1. **Edge Middleware Protection (`src/proxy.ts`):** Edge proxy intercepts all requests matching `/api/game` and `/api/game/*`. It inspects incoming cookies for `ropoductions_session` and `ropoductions_age_verified`. If either cookie is missing or unverified (`ageVerified !== true`), it fast-fails immediately with an `HTTP 403 Forbidden` JSON envelope (`Cache-Control: no-store`) without hitting Node/worker execution isolates or performing D1 queries.
2. **Authenticated R2 Asset Streaming Route (`src/app/api/game/[[...asset]]/route.ts`):** Next.js App Router optional catch-all route handler (`export const dynamic = "force-dynamic"`) supporting `GET` and `HEAD`:
   - **Authentication Precedence:** Strictly evaluates session authentication and 21+ age verification before any precondition handling or path resolution. Validates HMAC signature and verifies patron status ($5+ tier or active admin/comp override) via `validateSessionAccess`.
   - **Burst Session Caching:** In-isolate memory cache (short 15-30s TTL per verified session ID) to absorb burst asset storms during scene transitions and stay well under the 300ms latency budget (PRD SM-C2).
   - **Path Sanitization:** Decodes URI segments with try/catch; rejects empty paths, null bytes (`\0`), backslashes (`\`), consecutive slashes (`//`), segment traversal (`.` or `..`), and restricts the root namespace to allowed directories (`audio/`, `img/`, `effects/`, `movies/`, `data/`).
   - **R2 Storage & Range Requests:** Fetches object from private Cloudflare R2 bucket `GAME_ASSETS`. Parses `Range` headers into typed `R2Range` (`{ offset, length }` or `{ suffix }`), returning `206 Partial Content` with `Content-Range`, `Content-Length`, and `Accept-Ranges: bytes`. Returns `416 Range Not Satisfiable` for out-of-bounds byte ranges.
   - **Conditional Revalidation & Null Body Invariant:** Supports `If-None-Match` (normalizing weak `W/` ETags) and `If-Modified-Since`. Returns `304 Not Modified` with a strict `null` body (preventing Fetch API TypeError crashes) and `412 Precondition Failed` for failed `If-Match`.
   - **Security Headers:** Emits `Cache-Control: private, max-age=86400`, `Vary: Cookie`, and `Cross-Origin-Resource-Policy: same-origin` on authenticated responses; `no-store` on all errors.
   - **HEAD Support:** Uses `bucket.head(key)` instead of pulling file bodies.
   - **Failure Resilience:** Returns structured JSON envelopes for all error states (`400`, `403`, `404`, `412`, `416`, `500`).

## Boundaries & Constraints

**Always:**
- Declare `export const dynamic = "force-dynamic"` on `src/app/api/game/[[...asset]]/route.ts`.
- Serve game assets strictly through `/api/game/[[...asset]]` from the private Cloudflare R2 bucket (`GAME_ASSETS`). Public bucket access is strictly prohibited.
- Execute session authentication and 21+ age verification before evaluating preconditions (`If-None-Match`, `If-Match`) or serving assets; lapsed or unverified sessions must receive 403, never 304.
- In Next.js 16, type and await route parameters: `export async function GET(request: NextRequest, { params }: { params: Promise<{ asset?: string[] }> })`.
- Return `304 Not Modified` with a strictly `null` body (`new Response(null, { status: 304, headers })`) to comply with the Fetch standard and avoid edge runtime TypeErrors.
- Emit `Cache-Control: private, max-age=86400`, `Vary: Cookie`, and `Cross-Origin-Resource-Policy: same-origin` on all successful asset responses (`200 OK` and `206 Partial Content`).
- Emit `Cache-Control: no-store` on all error responses (`400`, `403`, `404`, `412`, `416`, `500`).
- Format all error responses as JSON envelopes conforming to `{ error: { code: string, message: string } }`.
- Parse HTTP `Range` headers into valid Cloudflare `R2Range` objects (`{ offset, length }` or `{ suffix }`). Return `416 Range Not Satisfiable` with `Content-Range: bytes */${object.size}` when range boundaries exceed the file size or are inverted. Ignore syntactically invalid or multipart ranges per RFC 9110 and serve `200 OK` full body.
- Explicitly set `Content-Length` on `200 OK`, `206 Partial Content`, and `HEAD` responses (essential for media players and iOS Safari audio/video buffering).
- Normalize weak ETags (`W/"..."` -> `"..."`) when evaluating `If-None-Match`.
- Return `412 Precondition Failed` (not 304) if `If-Match` or `If-Unmodified-Since` conditions are not met.
- Use `bucket.head(key)` for `HEAD` requests to avoid unnecessary internal R2 network egress.
- Sanitize keys: decode URI components in a try/catch (returning 400 on `URIError`); reject null bytes (`\0`), backslashes (`\`), consecutive slashes, dotfile segments, and `.`/`..` path traversals. Restrict asset keys to start with one of `audio/`, `img/`, `effects/`, `movies/`, `data/`.
- Explicitly map encrypted RPG Maker MZ assets (`.rpgmvp`, `.rpgmvo`, `.rpgmvm`, `.rpgsave`) to `application/octet-stream`.
- Export `unquoteCookieValue` from `src/lib/cookies.ts` to satisfy Epic 2 retrospective action item (`epic-2-retro-item-4-unify-cookie-quote-stripping`).
- Register all new test files in `package.json` under `test:unit` to satisfy `tests/suite-manifest.test.ts`.

**Never:**
- Never stream any asset data on unauthorized, unauthenticated, expired, or lapsed sessions.
- Never return `304 Not Modified` to an unauthenticated or lapsed session.
- Never pass a message body to a `304 Not Modified` response.
- Never expose Patreon access tokens, refresh tokens, or R2 credentials to client-side code.
- Never buffer large audio/video assets completely in edge isolate memory; stream directly via `R2ObjectBody.body` (`ReadableStream`).
- Never return `Cache-Control: public` on protected game assets.
- Never allow path traversal to escape the designated asset directories.

## I/O & Edge-Case Matrix

| Scenario | Request / Input | Expected Status | Response Headers | Body / Output |
|----------|----------------|-----------------|------------------|---------------|
| Anonymous Request | `GET /api/game/data/System.json` (no cookies) | `403 Forbidden` | `Content-Type: application/json`, `Cache-Control: no-store` | `{"error":{"code":"UNAUTHORIZED","message":"Active patron session and 21+ age verification required."}}` |
| Missing Age Gate | `GET /api/game/data/System.json` (valid session, no age cookie) | `403 Forbidden` | `Content-Type: application/json`, `Cache-Control: no-store` | `{"error":{"code":"UNAUTHORIZED","message":"Active patron session and 21+ age verification required."}}` |
| Tampered / Invalid Session | `GET /api/game/data/System.json` (forged HMAC signature) | `403 Forbidden` | `Content-Type: application/json`, `Cache-Control: no-store` | `{"error":{"code":"UNAUTHORIZED","message":"Invalid or unverified patron session."}}` |
| Lapsed / Revoked Session | `GET /api/game/data/System.json` (expired session in D1) | `403 Forbidden` | `Content-Type: application/json`, `Cache-Control: no-store` | `{"error":{"code":"UNAUTHORIZED","message":"Session has expired or was revoked."}}` |
| Lapsed Session with Cached ETag | `GET /api/game/data/System.json` with `If-None-Match: "w/123"` (lapsed session) | `403 Forbidden` | `Content-Type: application/json`, `Cache-Control: no-store` | `{"error":{"code":"UNAUTHORIZED","message":"Session has expired or was revoked."}}` (No 304 bypass!) |
| Valid Patron Asset Request | `GET /api/game/data/System.json` (valid patron session + age verified) | `200 OK` | `Content-Type: application/json`, `Cache-Control: private, max-age=86400`, `Vary: Cookie`, `Cross-Origin-Resource-Policy: same-origin`, `ETag: "..."`, `Content-Length: ...`, `Accept-Ranges: bytes` | Raw asset bytes streamed from R2 |
| Partial Content Range Request | `GET /api/game/audio/bgm/Theme1.ogg` with `Range: bytes=0-1023` | `206 Partial Content` | `Content-Type: audio/ogg`, `Content-Range: bytes 0-1023/524288`, `Content-Length: 1024`, `Accept-Ranges: bytes`, `Cache-Control: private, max-age=86400`, `Vary: Cookie` | Streamed byte slice (1024 bytes) |
| Out-of-Bounds Range Request | `GET /api/game/audio/bgm/Theme1.ogg` with `Range: bytes=9999999-` (file is 500KB) | `416 Range Not Satisfiable` | `Content-Range: bytes */524288`, `Cache-Control: no-store` | Empty body |
| Cache Revalidation (Fresh) | `GET /api/game/img/actors/Hero.png` with `If-None-Match: W/"etag123"` (valid session) | `304 Not Modified` | `ETag: "etag123"`, `Cache-Control: private, max-age=86400`, `Vary: Cookie` | Strict `null` body |
| Failed If-Match Precondition | `GET /api/game/data/System.json` with `If-Match: "oldetag"` (valid session) | `412 Precondition Failed` | `Content-Type: application/json`, `Cache-Control: no-store` | `{"error":{"code":"PRECONDITION_FAILED","message":"Precondition failed."}}` |
| Missing Asset in R2 | `GET /api/game/img/nonexistent.png` (valid patron session + age verified) | `404 Not Found` | `Content-Type: application/json`, `Cache-Control: no-store` | `{"error":{"code":"NOT_FOUND","message":"Asset not found."}}` |
| Path Traversal Attempt | `GET /api/game/../../secret.json` or `/api/game/img/..%2fsecret` | `400 Bad Request` | `Content-Type: application/json`, `Cache-Control: no-store` | `{"error":{"code":"BAD_REQUEST","message":"Invalid asset path."}}` |
| Unallowed Directory Root | `GET /api/game/config/database.json` | `400 Bad Request` | `Content-Type: application/json`, `Cache-Control: no-store` | `{"error":{"code":"BAD_REQUEST","message":"Invalid asset path."}}` |
| Empty Asset Path | `GET /api/game` | `400 Bad Request` | `Content-Type: application/json`, `Cache-Control: no-store` | `{"error":{"code":"BAD_REQUEST","message":"Asset path is required."}}` |
| HEAD Request | `HEAD /api/game/data/System.json` (valid session) | `200 OK` | Identical headers to GET (`Content-Length`, `ETag`, `Accept-Ranges`, etc.) | Strict `null` body (processed via `bucket.head`) |
| Infrastructure Failure | D1 or R2 throws unexpected exception | `500 Internal Server Error` | `Content-Type: application/json`, `Cache-Control: no-store` | `{"error":{"code":"INTERNAL_ERROR","message":"An unexpected error occurred."}}` |

</frozen-after-approval>

## Code Map

- `src/lib/cookies.ts` -- Export canonical `unquoteCookieValue` helper and replace duplicate regex across modules.
- `src/proxy.ts` -- Update edge proxy matcher to `pathname === "/api/game" || pathname.startsWith("/api/game/")` using `unquoteCookieValue`, preserving fast-fail 403 protection.
- `src/app/api/game/[[...asset]]/route.ts` -- Next.js 16 dynamic route handler (`export const dynamic = "force-dynamic"`) implementing session verification, in-isolate burst caching, path sanitization, R2 streaming, typed Range handling, 304 null-body invariant, and security headers.
- `src/lib/cloudflare.ts` -- Ensure typed resolution for D1 and R2 bindings across edge and test execution environments.
- `package.json` -- Register `tests/game-assets.test.ts` in `test:unit` script.
- `tests/game-assets.test.ts` -- Comprehensive unit test suite covering all 16 matrix scenarios using isolated in-memory mock harnesses for D1 and R2.

## Tasks & Acceptance

**Execution:**
- [ ] `src/lib/cookies.ts` -- Export `unquoteCookieValue(val?: string | null): string | undefined` and use it across cookie utilities.
- [ ] `src/proxy.ts` -- Tighten edge proxy prefix check and use `unquoteCookieValue`.
- [ ] `src/app/api/game/[[...asset]]/route.ts` -- Implement `GET` and `HEAD` route handler with async params, session verification, in-isolate session cache, path validation, typed R2Range parsing, 416 handling, 304 null-body handling, Content-Length calculation, and `Vary: Cookie` / `Cross-Origin-Resource-Policy: same-origin` headers.
- [ ] `package.json` -- Add `tests/game-assets.test.ts` to `test:unit` script to maintain manifest compliance.
- [ ] `tests/game-assets.test.ts` -- Implement comprehensive unit tests validating all 16 scenarios from the I/O & Edge-Case Matrix.
- [ ] Verify test suite passes (`npm run test:unit`) and verify OpenNext build (`npm run build`).

**Acceptance Criteria:**
- Given a browser requesting game assets at `/api/game/[...asset]`, when the request includes a valid `ropoductions_session` cookie verified in Cloudflare D1 and `ropoductions_age_verified`, then the route handler streams the requested file from the pre-created Cloudflare R2 bucket (`GAME_ASSETS`).
- Given an authenticated asset response, `Cache-Control: private, max-age=86400`, `Vary: Cookie`, `Cross-Origin-Resource-Policy: same-origin`, `ETag`, `Content-Length`, and `Accept-Ranges: bytes` are set.
- Given any request without a valid session cookie or without age verification, the system returns `HTTP 403 Forbidden` JSON envelope with zero asset data streamed.
- Given an audio or video asset request with an HTTP `Range` header, the route handler parses the range into `R2Range` and returns `206 Partial Content` with `Content-Range` and `Content-Length`.
- Given an out-of-bounds `Range` header, the route handler returns `416 Range Not Satisfiable` with `Content-Range: bytes */${object.size}`.
- Given an asset request with matching `If-None-Match`, the route handler returns `304 Not Modified` with a strict `null` body.
- Given a path traversal attempt, unallowed directory root, or empty asset path, the route handler returns `HTTP 400 Bad Request`.
