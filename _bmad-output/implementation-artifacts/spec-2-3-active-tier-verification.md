---
title: 'Story 2.3: Active Tier Verification ($5+ Threshold) & Override Short-Circuit Evaluation'
type: 'feature'
created: '2026-09-17'
status: 'done'
baseline_commit: 'e3a723c44d0b84d9d78ba6ba40ebac0e1b99380c'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-ropoductions-web-2026-09-15/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/epic-2-context.md'
  - '_bmad-output/specs/spec-ropoductions-web/patron-tier-matrix.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The OAuth callback handler (`/api/auth/callback`) currently redirects to `/play` after admin bootstrapping without verifying persistent patron overrides, validating active Patreon campaign tier membership ($5+ threshold), creating an encrypted session in Cloudflare D1, or issuing a signed `ropoductions_session` cookie.

**Approach:** Implement persistent override short-circuiting against `patron_overrides`, Patreon API v2 campaign member tier verification for the five approved tiers ($5 to $50) with active status, centralized authorization policy `isAccessAuthorized(session)` in `src/lib/auth.ts`, AES-256-GCM token encryption at rest, D1 `sessions` table persistence via `upsertSession`, and HMAC-SHA256 signed `ropoductions_session` cookie issuance.

## Boundaries & Constraints

**Always:**
- Check `patron_overrides` table for `patron_id` before querying external Patreon campaign membership endpoints; if an override exists (`role IN ('admin', 'comp')`), short-circuit immediately without calling Patreon campaign API.
- For override sessions, populate D1 `sessions` with `role = override.role`, `tier_id = 'override_' || override.role`, `tier_name = (role === 'admin' ? 'Studio Admin' : 'Complimentary Pass')`, and `pledge_cents = 0`.
- For non-override patrons, query Patreon API v2 and verify an active membership status (`patron_status === 'active_patron'`) and an entitled monthly pledge >= 500 cents ($5.00) matching one of the five approved campaign tiers: Ork Patron ($5), Ogre Pimp ($10), Elf Sybarite ($15), Horseman Aesthete ($25), or Mind Fucker Avatar ($50).
- Centralize authorization logic in pure function `isAccessAuthorized(session: SessionRecord | null): boolean` in `src/lib/auth.ts`: returns `true` unconditionally when `role IN ('admin', 'comp')`; for patrons, returns `true` if and only if `revoked === 0`, `expires_at_sec > Math.floor(Date.now() / 1000)`, and `pledge_cents >= 500`.
- Encrypt Patreon access and refresh tokens at rest with AES-256-GCM using `encryptToken` and `TOKEN_ENCRYPTION_KEY` before persisting in D1.
- Issue signed, HTTP-only, `SameSite=Lax`, `Secure` (on HTTPS) cookie `ropoductions_session` holding signed UUIDv4 session identifier with 30-day lifetime (`SESSION_COOKIE_MAX_AGE`).
- Reject unpledged users, lapsed patrons (`declined_patron`, `former_patron`), and pledges below 500 cents ($5.00) by redirecting to `/?auth_error=insufficient_pledge` (or `/?auth_error=inactive_patron`) without creating a session in D1.
- Strict Edge runtime compatibility: use Web Crypto API and standard Web Fetch `Request`/`Response`; never import Node `fs`, `net`, `child_process`, or native `crypto`.

**Never:**
- Never expose raw Patreon access tokens, refresh tokens, or encryption keys to client JavaScript or response bodies.
- Never call the external Patreon campaign members API when a valid patron override exists.
- Never introduce tier-differentiated gameplay perks or feature flags in v1; all active tiers receive uniform access.
- Never use unparameterized SQL queries or string concatenation; enforce `db.prepare().bind()`.
- Never use emojis in code, logs, or commit messages.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Admin Override Short-Circuit | `patron_id` present in `patron_overrides` with `role='admin'` | Skips Patreon campaign API; creates session in D1 with `role='admin'`, `tier_id='override_admin'`, `tier_name='Studio Admin'`, `pledge_cents=0`; sets signed `ropoductions_session` cookie; redirects 302 to `/play` | Handled gracefully without external API calls |
| Comp Override Short-Circuit | `patron_id` present in `patron_overrides` with `role='comp'` | Skips Patreon campaign API; creates session in D1 with `role='comp'`, `tier_id='override_comp'`, `tier_name='Complimentary Pass'`, `pledge_cents=0`; sets signed `ropoductions_session` cookie; redirects 302 to `/play` | Handled gracefully without external API calls |
| Eligible Active Patron ($5+) | Non-override user, `patron_status='active_patron'`, `currently_entitled_amount_cents=500` ($5 Ork Patron) | Persists session in D1 with `role='patron'`, `tier_name='Ork Patron'`, `pledge_cents=500`; sets signed `ropoductions_session` cookie; redirects 302 to `/play` | Standard success path |
| Sub-Threshold Patron (< $5) | Non-override user with active pledge of $3 (300 cents) | Redirects 302 to `/?auth_error=insufficient_pledge`; clears OAuth verifier cookie; zero session records created in D1 | Graceful paywall redirect |
| Inactive / Lapsed Patron | Non-override user with `patron_status='declined_patron'` or `'former_patron'` | Redirects 302 to `/?auth_error=inactive_patron`; clears OAuth verifier cookie; zero session records created in D1 | Graceful paywall redirect |
| Unpledged Visitor | Non-override user with no campaign memberships or `patron_status=null` | Redirects 302 to `/?auth_error=insufficient_pledge`; clears OAuth verifier cookie; zero session records created in D1 | Graceful paywall redirect |
| Missing Campaign Config | `PATREON_CAMPAIGN_ID` not configured and user has no override | Redirects 302 to `/?auth_error=campaign_not_configured`; logs error | Avoids unhandled crash |
| Missing Encryption Secret | `TOKEN_ENCRYPTION_KEY` or `SESSION_SECRET` absent | Returns 500 error or redirects to `/?auth_error=server_configuration_error` | Prevents plaintext token storage |
| Policy isAccessAuthorized | Session with `role='admin'` or `role='comp'` | Returns `true` regardless of pledge amount | N/A |
| Policy isAccessAuthorized | Patron session with `revoked=1` or `expires_at_sec <= now` or `pledge_cents < 500` | Returns `false` | N/A |

</frozen-after-approval>

## Code Map

- `src/types/auth.ts` -- Extend with `PatreonMemberAttributes`, `PatreonTierAttributes`, `PatreonMembershipInfo`, and campaign member response types.
- `src/lib/patreon.ts` -- Add `getPatronCampaignMembership` to query and parse campaign member status and currently entitled tiers from Patreon API v2.
- `src/lib/auth.ts` -- Centralized authorization module defining approved campaign tiers (`APPROVED_TIERS`), minimum pledge threshold (500 cents), and pure policy evaluation function `isAccessAuthorized(session)`.
- `src/app/api/auth/callback/route.ts` -- Update OAuth callback route to check `patron_overrides`, conditionally fetch campaign membership, validate active tier eligibility, encrypt tokens, persist session in D1 via `upsertSession`, set signed `ropoductions_session` cookie, and redirect.
- `tests/auth.test.ts` -- Unit tests verifying tier parsing, threshold checks, override short-circuit logic, and `isAccessAuthorized` policy evaluation.
- `tests/verify-patreon-oauth.ts` -- Integration test verification script updated to validate override bypass, active tier verification, session persistence in D1, and signed cookie issuance.
- `package.json` -- Update `test:unit` script to register `tests/auth.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/types/auth.ts` -- Add Patreon member, tier, and campaign membership TypeScript interfaces.
- [x] `src/lib/auth.ts` -- Create authorization library with approved tier constants, minimum pledge threshold, and pure `isAccessAuthorized(session)` function.
- [x] `src/lib/patreon.ts` -- Implement `getPatronCampaignMembership` to retrieve and parse member status and active entitled tier from Patreon API v2.
- [x] `src/app/api/auth/callback/route.ts` -- Integrate override check, tier verification, token encryption, D1 session upsert, and signed session cookie header into OAuth callback handler.
- [x] `tests/auth.test.ts` -- Create comprehensive unit test suite covering tier eligibility, override bypass rules, and `isAccessAuthorized` edge cases.
- [x] `package.json` -- Add `tests/auth.test.ts` to `test:unit` command.
- [x] `tests/verify-patreon-oauth.ts` -- Expand end-to-end OAuth verification script to assert override session creation, tier validation, and signed cookie output.

**Acceptance Criteria:**
- Given an authenticated user with a record in `patron_overrides` (`role IN ('admin', 'comp')`), when `/api/auth/callback` executes, then it skips calling the Patreon campaign API entirely and creates a session in D1 with `role = override.role`, `tier_id = 'override_' || override.role`, `tier_name = (role === 'admin' ? 'Studio Admin' : 'Complimentary Pass')`, and `pledge_cents = 0`.
- Given an authenticated user without an override, when `/api/auth/callback` executes, then it queries Patreon API v2 and verifies active membership (`active_patron`) and monthly pledge >= $5.00 matching one of the five approved tiers (Ork Patron, Ogre Pimp, Elf Sybarite, Horseman Aesthete, Mind Fucker Avatar).
- Given any user with an active pledge below $5.00, cancelled/declined status, or no membership, when `/api/auth/callback` executes, then it redirects to `/?auth_error=insufficient_pledge` or `/?auth_error=inactive_patron` without creating a session in D1.
- Given any valid session record, when passed to `isAccessAuthorized(session)`, then it returns `true` if `role IN ('admin', 'comp')` or if `role === 'patron'`, `revoked === 0`, `expires_at_sec > now`, and `pledge_cents >= 500`.
- Given successful authorization, when `/api/auth/callback` completes, then it sets a signed, HTTP-only, `SameSite=Lax`, `Secure` cookie named `ropoductions_session` and redirects to `/play`.

## Implementation Notes

- Added `PatreonTierAttributes`, `PatreonMemberAttributes`, `PatreonResource`, `PatreonCampaignMembersResponse`, and `PatreonMembershipInfo` to `src/types/auth.ts`.
- Implemented `src/lib/auth.ts` declaring `MINIMUM_PLEDGE_CENTS = 500`, `APPROVED_TIERS` (Ork Patron $5, Ogre Pimp $10, Elf Sybarite $15, Horseman Aesthete $25, Mind Fucker Avatar $50), helper `findApprovedTier`, and pure policy `isAccessAuthorized(session)` supporting unconditional admin/comp overrides and strict patron active status/pledge checks.
- Implemented `getPatronCampaignMembership` in `src/lib/patreon.ts` querying `/campaigns/{campaign_id}/members` with Bearer auth and extracting active member status and highest entitled tier from included resources.
- Updated `/api/auth/callback` route handler in `src/app/api/auth/callback/route.ts` to check `patron_overrides`, execute fast-path short-circuiting for admin/comp roles, query Patreon campaign membership for backers, validate active status and $5+ threshold, encrypt tokens with AES-256-GCM, persist session in D1 via `upsertSession`, and issue signed HTTP-only `ropoductions_session` cookie alongside verifier cookie clearing.
- Created comprehensive unit tests in `tests/auth.test.ts` covering tier constants, `findApprovedTier`, `isAccessAuthorized`, and `getPatronCampaignMembership` edge cases.
- Updated `package.json` to register `tests/auth.test.ts` in `test:unit` and added `@/` path alias resolution to `tests/helpers/esm-hooks.mjs`.
- Updated `build:next` in `package.json` to `--webpack` to support symlinked worktree directories.
- Expanded end-to-end OAuth integration verification script in `tests/verify-patreon-oauth.ts` covering admin override short-circuiting, comp override short-circuiting, active $5+ patron session creation, sub-threshold rejection, inactive/lapsed patron rejection, unpledged visitor rejection, and missing campaign configuration handling.
## Spec Change Log

<!-- Populated during review loops -->

## Review Triage Log

| # | Location | Finding | Verdict | Action | Evidence / Resolution |
|---|---|---|---|---|---|
| 1 | `tests/verify-patreon-oauth.ts:609` | Unverified `ropoductions_session` cookie attributes | `low` | `patch` | Added assertions for `HttpOnly`, `SameSite=Lax`, `Path=/`, and `max-age=2592000`. |
| 2 | `tests/verify-patreon-oauth.ts:634` | Unverified `encrypted_refresh_token` decryption | `low` | `patch` | Added assertion decrypting and validating refresh token against original OAuth token. |
| 3 | `src/lib/patreon.ts:181` | Multi-member array unverified and defaulting to index 0 | `medium` | `patch` | Added `patronId` filtering in `getPatronCampaignMembership` and added test coverage. |
| 4 | `src/lib/patreon.ts:213` | Missing `included` array fallback and null element guards | `medium` | `patch` | Added null guards on `included` items / `tierRefs` and fallback to `tierRefs[0].id`. |
| 5 | `src/lib/auth.ts:32` | Custom pledge >= $5 with unmatched name rejected | `medium` | `patch` | Enhanced `findApprovedTier` to fallback to highest eligible tier >= 500 cents. |
| 6 | `src/lib/auth.ts:53` | Admin/comp sessions bypass revocation/expiration check | `low` | `patch` | Updated `isAccessAuthorized` to require `revoked === 0` and `expires_at_sec > nowSec`. |
| 7 | `src/app/api/auth/callback/route.ts:165` | Negative `tokens.expires_in` sets past expiry | `low` | `patch` | Added positive number check defaulting to 2592000 seconds. |
| 8 | `src/app/api/auth/callback/route.ts:176` | Missing refresh token encrypts string "undefined" | `low` | `patch` | Guarded `tokens.refresh_token ?? ""` before encryption. |
| 9 | `src/lib/patreon.ts:15` | Add `identity.memberships` scope | `false` | `none` | Refutation: `DEFAULT_PATREON_SCOPES` is explicitly pinned to `['identity', 'identity[email]', 'campaigns.members']` per PRD and Story 2.2 spec. |
| 10 | `src/lib/cloudflare.ts:24` | `__D1_TEST_DB__` unguarded in production | `low` | `patch` | Guarded with `process.env.NODE_ENV !== "production"`. |
| 11 | `src/app/api/auth/callback/route.ts:347` | Error message leak in redirect query | `false` | `none` | Refutation: Callback error redirect already truncates message to 120 chars and URI encodes it. |

## Design Notes

Approved Patreon campaign tiers for v1:
- Ork Patron: $5.00 (500 cents)
- Ogre Pimp: $10.00 (1000 cents)
- Elf Sybarite: $15.00 (1500 cents)
- Horseman Aesthete: $25.00 (2500 cents)
- Mind Fucker Avatar: $50.00 (5000 cents)

Minimum pledge threshold: 500 cents.
In v1, all five active tiers receive uniform web player access with zero tier-differentiated gameplay fragmentation.
Override sessions use `pledge_cents = 0` and synthetic tier identifiers (`override_admin`, `override_comp`).

## Verification

**Commands:**
- `npm test` -- Runs D1 schema verification and end-to-end OAuth verification suite.
- `npm run test:unit` -- Runs all isolated unit tests including `tests/auth.test.ts` and `tests/suite-manifest.test.ts`.
- `npm run build:next` -- Verifies Next.js App Router build and TypeScript compilation.