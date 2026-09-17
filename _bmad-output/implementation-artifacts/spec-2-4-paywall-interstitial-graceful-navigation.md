---
title: 'Story 2.4: Paywall Interstitial & Transactional Override Revocation'
type: 'feature'
created: '2026-09-17'
status: 'done'
baseline_commit: '14d54528ea612b52615ff8a9343ee481bd556441'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-ropoductions-web-2026-09-15/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/epic-2-context.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-ropoductions-web-2026-09-15/EXPERIENCE.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-ropoductions-web-2026-09-15/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Visitors without an active $5+ tier or unauthenticated users attempting to access `/play` need a clear, respectful paywall interstitial detailing the 5 supporter tiers and direct checkout links. Furthermore, when an administrative or complimentary override row is deleted from `patron_overrides`, existing sessions must be transactionally revoked on route navigation without abruptly kicking active players mid-game.

**Approach:** Implement `validateSessionAccess` in `src/lib/auth.ts` to perform D1 point lookups on `patron_overrides` for admin/comp roles, transactionally revoke deleted overrides (`revoked = 1`), and evaluate active patron tier eligibility. Create the elevated `PatreonPaywallCard` component (`src/components/patreon-paywall-card.tsx`) featuring the 5 supporter tiers, Patreon red login button, and direct checkout link. Establish `/play` route handling with session verification and transactional revocation redirects, and add dismissible paywall banners on the home portal.

## Boundaries & Constraints

**Always:**
- Strictly use parameterized prepared statements (`db.prepare().bind()`) for all D1 operations.
- Clear `ropoductions_session` cookie (`Max-Age: 0; Path=/; HttpOnly; SameSite=Lax; Secure`) upon transactional revocation or lapsed pledge detection.
- Transactionally mark deleted overrides as `revoked = 1` in `sessions` table.
- Never abruptly disconnect or terminate active gameplay in an open tab; enforce checks on route navigation, page reloads, and asset streaming requests.
- Zero emojis as icons; use Lucide React SVGs only.
- Adhere to design tokens: `#121522` card background, `#23283E` border, `#22C55E` studio emerald, `#FBBF24` tier gold, and `#FF424D` Patreon red.
- Maintain minimum 44x44px touch targets on interactive controls.

**Never:**
- Never expose sensitive tokens, raw error traces, or internal database IDs to client-side components.
- Never implement background polling intervals that sever active game canvas sessions mid-gameplay.
- Never display insulting or abrasive error copy like "Access Denied" or "403 Forbidden" to unpledged visitors.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Unauthenticated /play access | Missing `ropoductions_session` or age cookie | Redirect to `/?auth_required=true` or render paywall interstitial | Preserves return path |
| Deleted Admin/Comp Override | `session.role IN ('admin','comp')` and row missing in `patron_overrides` | `revoked = 1` written to D1, cookie cleared (`max-age=0`), redirect to `/?paywall=revoked` | Transactional update |
| Retained Override | `session.role IN ('admin','comp')` and row present in `patron_overrides` | Authorized access to `/play` | None |
| Lapsed Patron Pledge | `session.role = 'patron'` and `pledge_cents < 500` or expired | Cookie cleared (`max-age=0`), redirect to `/?paywall=lapsed` | Graceful notification banner |
| Active Tier Patron ($5-$50) | `session.role = 'patron'`, `pledge_cents >= 500`, unexpired, unrevoked | Authorized access to `/play` | None |
| Tampered / Invalid Session Cookie | Tampered HMAC signature on session cookie | Cookie cleared (`max-age=0`), redirect to `/?auth_required=true` | Rejects forged cookie |
| Lapsed Pledge in Open Tab | Active gameplay session with open tab | No mid-game termination; verified on next navigation or reload | Zero in-game interruption |

</frozen-after-approval>

## Code Map

- `src/lib/auth.ts` -- Add `validateSessionAccess` function handling D1 session lookup, transactional override point lookup, and revocation.
- `src/components/patreon-paywall-card.tsx` -- Dedicated paywall interstitial card component displaying the 5 supporter tiers, Patreon login button, and direct checkout link.
- `src/app/(game)/play/page.tsx` -- Protected game route performing session verification and rendering the authorized game container or paywall fallback.
- `src/app/(portal)/page.tsx` -- Landing page integrating dismissible paywall notice banners for `revoked`, `lapsed`, and `auth_required` states.
- `src/locales/*.json` -- Multilanguage strings for paywall card tiers, buttons, and notification banners.
- `tests/auth.test.ts` -- Unit tests covering `validateSessionAccess`, transactional revocation on deleted overrides, and edge cases.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/auth.ts` -- Implement `validateSessionAccess` with D1 session retrieval, override point lookup, and transactional revocation -- Centralizes session policy and revocation.
- [x] `src/components/patreon-paywall-card.tsx` -- Create the Patreon paywall card component with 5 tier matrices, Lucide lock badge, and Patreon red CTA -- Fulfills FR-8 and UX-DR7.
- [x] `src/app/(game)/play/page.tsx` -- Implement the `/play` page with session validation and transactional redirection -- Fulfills FR-7, FR-8, and FR-9.
- [x] `src/app/(portal)/page.tsx` -- Add dismissible banner handling for `paywall=revoked`, `paywall=lapsed`, and `auth_required` query parameters -- Informs users gracefully.
- [x] `src/locales/*.json` -- Add i18n keys for paywall card and banners in `en.json`, `ja.json`, `es.json`, `ru.json`, `zh.json`, `pl.json` -- Full multilanguage support.
- [x] `tests/auth.test.ts` -- Add comprehensive unit tests for `validateSessionAccess` covering all scenarios in the I/O matrix -- Automated verification.
- [x] `src/lib/paywall.ts` + `tests/paywall.test.ts` + `e2e/portal.spec.ts` -- Review follow-ups: pure query/status/banner helpers with unit tests, portal paywall e2e, 44px banner CTA, D1-failure guard on `/play`.

**Acceptance Criteria:**
- Given an unauthenticated visitor navigating to `/play`, when middleware or route guards check the session, then the user is redirected to the home page or paywall interstitial displaying the 5 patron tiers and direct checkout links.
- Given an authenticated admin or comp user, when the server checks `patron_overrides` and the override row has been deleted, then it executes transactional revocation (`revoked = 1`), clears the session cookie (`Max-Age: 0`), and redirects to `/?paywall=revoked`.
- Given an active patron in an open tab whose pledge lapses, when gameplay is active, then the session is not abruptly terminated, deferring lapsed status detection to the next navigation or reload.

## Implementation Notes

- `validateSessionAccess` (`src/lib/auth.ts`) resolves the signed session cookie, point-looks-up `sessions`, returns `revoked`/`lapsed` early, checks `patron_overrides` for `admin`/`comp` roles (writing `revoked = 1` when the row is gone), and applies `isAccessAuthorized` for patrons. All D1 access uses `db.prepare().bind()` via `src/lib/db.ts`.
- `/play` (`src/app/(game)/play/page.tsx`, `force-dynamic`) enforces the age cookie, then maps every non-`authorized` status to its paywall redirect through `mapSessionStatusToPlayRedirect` (`src/lib/paywall.ts`), clearing `ropoductions_session` first. D1/env failures and `validateSessionAccess` throws fall back to `/?paywall=required`. No background polling; checks run on navigation only.
- The portal (`src/app/(portal)/page.tsx`) maps `?paywall=` / `?auth_required=` through `resolvePaywallType` and renders `PaywallNotificationBanner` plus `PatreonPaywallCard` in `#paywall-section`. Successful Patreon logins land on `/play` (callback `Location: /play`), so the return path is preserved through the card's login CTA.
- `src/lib/paywall.ts` holds the pure, unit-tested mapping layer (`resolvePaywallType`, `mapSessionStatusToPaywall`, `mapSessionStatusToPlayRedirect`, `sessionClearHref`, `getPaywallBannerMessageKey`) plus `PAYWALL_TIERS`, `PATREON_LOGIN_HREF`, `SESSION_CLEAR_HREF`, and `PAYWALL_CAMPAIGN_URL` constants consumed by the banner and card.
- Cookie clearing happens in `GET /api/auth/session` (Route Handler, the only server context allowed to mutate cookies in production): it expires `ropoductions_session` (`Max-Age: 0; Path=/; HttpOnly; SameSite=Lax; Secure`) and bounces to `/?paywall=<revoked|lapsed|required>` from an allowlist. `/play` never calls `cookies().delete()` -- that throws `Cookies can only be modified in a Server Action or Route Handler` under `next start` (caught by CI e2e, invisible under `next dev`).
- `pl.json` is a tracked locale since Story 1-4; paywall keys were added to all six locales and parity is enforced by `tests/i18n-locales.test.ts`. `Final Orginity` is the canonical game title per SPEC/epics/architecture, not a typo.

## Spec Change Log

## Review Triage Log

- blind/no-d1-transaction -- verdict `false` -- sequential awaits complete the `revoked = 1` write before redirect; a crash between lookup and update still denies access and self-heals on next navigation.
- blind/asset-route-unaffected -- verdict `defer` -- `/api/game` auth enforcement belongs to Epic 3 story 3-2; recorded in deferred-work.
- blind+edge/return-path-dropped -- verdict `false` -- the auth callback redirects successful logins to `/play` (`route.ts:224,346`), so login from the interstitial preserves the destination.
- blind+edge/cookie-clear-attributes -- verdict `false` -- `cookies().delete()` emits an expired cookie on `Path=/` over HTTPS, which clears the Secure/HttpOnly session cookie.
- blind+edge/unsigned-secret-fail-open -- verdict `false` -- the only production caller always passes a string (`getAuthEnv` falls back to a dev default, never `undefined`); no unsigned path is reachable.
- blind+edge/expired-override-ordering -- verdict `low`, rejected -- expired sessions are already denied with cookie cleared; the missing `revoked` write is dead-session bookkeeping, and reordering risks authorizing expired sessions.
- blind/banner-mobile-cta-hidden -- verdict `false` -- the paywall card below the banner carries both CTAs on all viewports.
- blind/merged-required-type -- verdict `false` -- age verification is handled by the global age-gate modal and the required banner copy names both requirements.
- blind+edge/pl-locale-tier-names-aria -- verdict `false` on `pl.json` (tracked since 1-4, parity-tested); tier names are brand proper nouns; hardcoded banner `aria-label` graded `low`, rejected as cosmetic across six locales.
- blind/spec-sections-and-title -- verdict `false` on the title (canonical `Final Orginity` verified in SPEC/epics/architecture); spec sections filled during this review step.
- edge/d1-throw-500 -- verdict `patch` -- wrapped the `/play` validation call in try/catch falling back to `/?paywall=required`.
- edge/repeated-query-keys -- verdict `low`, rejected -- only self-crafted URLs produce arrays; fix would add normalization branches for no user harm.
- edge/banner-32px-target -- verdict `patch` -- raised the pledge link to `min-h-[44px]`.
- edge/unknown-role-message -- verdict `low`, rejected -- roles are DB-constrained to `admin`/`comp`/`patron`; no corrupt-role path demonstrated.
- edge/tampered-target-wording -- verdict `false` -- the portal normalizes `paywall=required` and `auth_required=true` to the identical interstitial.
- verification/play-mapping-untested -- verdict `patch` -- extracted `mapSessionStatusToPlayRedirect` into `src/lib/paywall.ts`, covered by `tests/paywall.test.ts`.
- verification/portal-mapping-untested -- verdict `patch` -- extracted `resolvePaywallType`, covered by unit tests plus `e2e/portal.spec.ts` interstitial visits.
- verification/banner-card-content-untested -- verdict `patch` -- extracted banner-key selector, tier data, and CTA constants; unit-tested with locale cross-checks plus Playwright banner/tier/CTA/dismiss assertions.
- e2e/dismiss-blocked-by-age-gate -- found during verification -- the blocking age-gate modal intercepts the banner dismiss click; the test now confirms the age gate first, matching the real user flow.
- ci/prod-cookie-mutation-500 -- CI e2e caught `cookies().delete()` in the `/play` Server Component throwing under `next start` (dev-tolerant, prod-fatal) -- verdict `patch` -- moved clearing into `GET /api/auth/session`, `/play` bounces through `sessionClearHref`; covered by route unit tests and the rewritten edge-gating e2e (forged session lands on `/?paywall=required` with the session cookie gone).

## Verification

**Commands:**
- `npm run test:unit` -- expected: all unit tests pass including new `validateSessionAccess` and transactional revocation tests
- `npm test` -- expected: d1 schema and patreon oauth verification checks pass
- `npm run build:next` -- expected: production Next.js build succeeds with zero type or build errors
- `npx playwright test e2e/portal.spec.ts` -- expected: landing, headers, and paywall interstitial cases pass

**Results (2026-09-17, feat/2-4-paywall-interstitial-graceful-navigation):**
- `npm run test:unit` -- 90 pass, 0 fail (18 suites; includes `validateSessionAccess`, paywall helpers, and `/api/auth/session` route tests)
- `npm test` -- d1 schema and Patreon OAuth/PKCE verification checks pass
- `npm run build:next` -- production build succeeds; routes `/`, `/play`, `/api/auth/patreon`, `/api/auth/callback`, `/api/auth/session`
- `npx playwright test` -- 15 passed, 0 failed (full suite against `next start`, matching CI)