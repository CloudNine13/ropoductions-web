---
title: 'Story 2.2: Patreon OAuth 2.0 PKCE Authorization & Admin Secret Bootstrap'
type: 'feature'
created: '2026-09-17'
status: 'review'
baseline_commit: 'edbee44036fa7cf0cf03e857dd8d72df3b369165'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-ropoductions-web-2026-09-15/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Patrons and studio founders cannot log into the web portal via Patreon OAuth 2.0 with PKCE, and studio founders have no automated bootstrap mechanism to receive initial administrative access roles from secrets without manual database seeding.

**Approach:** Implement RFC 7636 compliant PKCE and state token generation using Web Crypto API in `src/lib/crypto.ts`, implement Patreon API v2 OAuth client in `src/lib/patreon.ts` (authorization URL builder, token exchange, identity fetch, initial admin parsing and D1 bootstrap), establish OAuth initiation route at `src/app/api/auth/patreon/route.ts`, and establish callback route at `src/app/api/auth/callback/route.ts` that validates state, exchanges code for tokens, retrieves user identity, and auto-bootstraps admin overrides when `patron_id` matches `INITIAL_ADMIN_PATREON_IDS`.

## Boundaries & Constraints

**Always:**
- Use Web Crypto API (`crypto.subtle`, `crypto.getRandomValues`) exclusively for cryptographic operations to ensure Cloudflare Workers / Edge runtime compatibility; never import Node native `crypto` module.
- Enforce PKCE code challenge method `S256` (SHA-256 base64url encoded without padding) per RFC 7636.
- Temporary OAuth verification cookies must be `HttpOnly`, `SameSite=Lax`, and `Secure` (in HTTPS environments), with short lifespan (10 minutes max).
- Parse `INITIAL_ADMIN_PATREON_IDS` as an exact trimmed `Set<string>` (stripping whitespace, filtering empty strings).
- Admin bootstrap upserts into `patron_overrides` using parameterized prepared statements (`upsertPatronOverride`) with `role = 'admin'`, `granted_by = 'system_bootstrap'`, and `notes = 'Initial Env Admin'`.
- Never expose Patreon access tokens or refresh tokens to client JavaScript.

**Never:**
- Never use emojis in code, logs, or commit messages.
- Never write comments unless describing an exceptionally difficult piece of code.
- Never expose raw secret keys or access tokens to client browsers.
- Never push to `develop` or `master` directly.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Initiate OAuth | GET `/api/auth/patreon` | 302 Redirect to `https://www.patreon.com/oauth2/authorize?...` with `response_type=code`, `client_id`, `redirect_uri`, `scope=identity campaigns.members`, `state`, `code_challenge`, and `code_challenge_method=S256`; sets temporary verification cookie | Missing client_id returns 500 error response |
| Callback with Error | GET `/api/auth/callback?error=access_denied` | 302 Redirect to `/?auth_error=access_denied` with cleared verification cookie | Graceful redirect |
| Callback State Mismatch | GET `/api/auth/callback?code=xxx&state=bad_state` | 400 Bad Request or redirect `/?auth_error=invalid_state` | Rejects CSRF attempt |
| Missing Verification Cookie | GET `/api/auth/callback?code=xxx&state=valid_state` (no cookie) | 400 Bad Request or redirect `/?auth_error=missing_verifier` | Rejects unverified request |
| Token Exchange & Identity | Valid code & state matching cookie | Exchanges code for tokens via POST to Patreon, retrieves identity via GET `/api/oauth2/v2/identity` | Throws on non-200 responses from Patreon |
| Admin Bootstrap Match | `patron_id` matches ID in `INITIAL_ADMIN_PATREON_IDS` | Upserts `patron_overrides` row with `role='admin'`, `granted_by='system_bootstrap'`, `notes='Initial Env Admin'` | Logged and persisted transactionally |
| Non-Admin User | `patron_id` does not match `INITIAL_ADMIN_PATREON_IDS` | No override row created; proceeds with regular flow | Continues without override |

</frozen-after-approval>

## Code Map

- `src/types/auth.ts` -- TypeScript type definitions for OAuth responses, tokens, identity, and state payloads.
- `src/lib/crypto.ts` -- Web Crypto utilities for PKCE (S256), state generation, AES-256-GCM token encryption, and HMAC-SHA256 cookie signing.
- `src/lib/patreon.ts` -- Patreon API v2 client functions: authorization URL builder, authorization code exchange, identity retrieval, initial admin set parser, and admin bootstrap helper.
- `src/lib/cookies.ts` -- Cookie constants and helper functions for OAuth verification cookie and session cookie.
- `src/app/api/auth/patreon/route.ts` -- Route handler initiating OAuth 2.0 PKCE flow and setting temporary verification cookie.
- `src/app/api/auth/callback/route.ts` -- Route handler processing OAuth callback, validating state and PKCE, fetching identity, and bootstrapping admin.
- `tests/patreon-oauth.test.ts` -- Test suite verifying PKCE math, state validation, admin bootstrap matching, and mock OAuth flow.
