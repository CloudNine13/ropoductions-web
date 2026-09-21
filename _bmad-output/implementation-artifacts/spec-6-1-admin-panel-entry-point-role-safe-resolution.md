---
title: 'Story 6.1: Admin Panel Entry Point & Role-Safe Resolution'
type: 'feature'
created: '2026-09-21'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/analytics/analytics-epic-6-2026-09-21.md'
  - '_bmad-output/planning-artifacts/architecture/architecture-ropoductions-web-2026-09-15/ARCHITECTURE-SPINE.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-ropoductions-web-2026-09-15/DESIGN.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-ropoductions-web-2026-09-15/EXPERIENCE.md'
  - '_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Story statement:** Give confirmed admins a server-rendered entry point to `/admin` in the `/play` header and the portal header, resolving admin identity exclusively from the `patron_overrides` table through one shared resolver (`resolveAdminAccess`), never from `session.role`; delete the patron-facing role pill; and leave `/admin` itself and every auth-flow property byte-identical (Q9: 404 for everyone except a valid admin session — logged out, stale, forged, or valid-but-non-admin alike).

**Problem:** The panel's gating is correct but its discoverability is absent: `src/proxy.ts` deliberately excludes `/admin`, no component anywhere links to it, and `requireAdminSession` (`src/lib/admin.ts:99-138`) fails closed with `notFound()` (decisions record §2). A secondary defect on the same path makes any `session.role`-gated chrome provably wrong: `src/lib/auth.ts:146-148` returns the raw patron session for an authorized pledge **before** `patron_overrides` is consulted (that lookup runs only on the insufficient-pledge path, `:152-176`), so an admin who also holds an active pledge — the owner — keeps `role: "patron"` at the session layer, and the existing `/play` role pill (`src/app/(game)/play/page.tsx:71-76`, gated `session.role !== "patron"`) never renders for them.

**Approach:**
1. Add `resolveAdminAccess` to `src/lib/admin.ts` as a React `cache()`d resolver returning `"admin" | "comp" | null`: cookie-presence short-circuit (no D1 read for anonymous visitors), full fail-closure to `null` (never `notFound()`, never throws), override-table-driven verdict including the founder env-bootstrap mirror of `validateAdminSession` (`src/lib/admin.ts:67-81`). `requireAdminSession` and `validateAdminSession` stay byte-identical so their pins in `tests/admin-layout.test.ts` hold.
2. `(portal)/page.tsx` resolves the verdict server-side and passes a new `isAdmin` boolean prop to `StudioHeader`; the header renders the entry in the desktop action cluster and the mobile drawer with parity.
3. `play/page.tsx` calls the same resolver and renders the entry in the vacated role-pill zone; the `session.role !== "patron"` pill block is deleted (Q10b), and the `Shield` import is retained for the entry itself (only the pill block is deleted).
4. New locale keys `header.navAdmin` and `game.adminPanel` ("Admin Panel" in `en`) land in all six dictionaries; `tests/i18n-locales.test.ts` key-parity tests enforce completeness.
5. E2e gains the two currently-uncovered properties: a valid (correctly signed) non-admin session gets 404 with no `Location` header, and an admin session reaches `/admin` through the rendered entry. Both surfaces are already dynamic (`src/app/layout.tsx` and `src/app/(portal)/layout.tsx` both `await cookies()`), so the added override read costs a conditional D1 round-trip on these pages rather than a static-to-dynamic transition.

## Acceptance Criteria

- **Given** a confirmed admin — creator-sealed, panel-assigned, or a pledging patron whose stored session role is `"patron"` but who has an `admin` row in `patron_overrides` — **When** `/play` or the portal landing renders **Then** the header shows an "Admin Panel" entry linking to `/admin`, rendered server-side (never CSS-hidden), with the portal desktop cluster and mobile drawer both showing it (`isAdmin` parity).
- **Given** a `comp` session or a plain patron session **When** either header renders **Then** no admin entry exists in the server HTML at all (`comp` cannot reach `/admin`, so `comp` never sees the entry).
- **Given** any visitor **When** `resolveAdminAccess` cannot positively confirm an `admin` override row — missing session cookie, age cookie absent or not `"true"`, invalid signature, non-authorized session status, no override row and bootstrap-ineligible, D1/env infrastructure failure, or a validation throw — **Then** it returns `null` and the headers render no entry; it never calls `notFound()` and never throws.
- **Given** an anonymous request (no `ropoductions_session` cookie) **When** the portal or `/play` header renders **Then** `resolveAdminAccess` issues zero D1 queries (cookie-presence short-circuit).
- **Given** the gating logic **When** `resolveAdminAccess` decides **Then** the verdict derives solely from `patron_overrides` (and the founder env bootstrap), never from `session.role`; a unit test with a pledging-admin fixture (cookie role `"patron"` + admin override row) proves the entry renders for exactly the profile the old pill missed.
- **Given** `/admin` **When** any non-admin request arrives — anonymous, forged, stale, or valid-but-non-admin — **Then** the response is still the epic-5 fail-closed 404: all four existing `e2e/admin.spec.ts` tests stay green, the new valid-signed-non-admin-session test adds 404 with no `Location`, and `requireAdminSession`/`validateAdminSession` are unchanged.
- **Given** `/play` after this story **When** any session renders the header **Then** the tier badge from `session.tier_name` still displays, the role pill (`session.role !== "patron"` block) is gone, and no role word (`admin`/`comp`) is shown in patron-facing chrome.
- **Given** the six locale dictionaries **When** `tests/i18n-locales.test.ts` runs **Then** `header.navAdmin` and `game.adminPanel` exist in `en`, `es`, `ja`, `pl`, `ru`, `zh` with non-empty translated values.
- **Given** an admin whose 30-day session or 14-hour age cookie has lapsed **When** they type `/admin` **Then** they receive 404 and recover via `/play` → age gate → Patreon login → `/play` → entry button; this Q12 consequence is accepted and documented, with no auth-flow change and no return-target plumbing (Q11′).

</frozen-after-approval>

## Files

- `src/lib/admin.ts` — add `AdminAccess` type and `resolveAdminAccess`; do NOT touch `isSealedCreatorAdmin` (`:25-30`), `validateAdminSession` (`:41-93`), `CookieReader` (`:95-97`), or `requireAdminSession` (`:99-138`).
- `src/app/(portal)/page.tsx` — `PortalPage` (`:17`): await `resolveAdminAccess()`; pass `isAdmin` to `<StudioHeader />` (`:24`).
- `src/components/studio-header.tsx` — `StudioHeader` (`:11`): new props interface with `isAdmin?: boolean`; render entry in the desktop action cluster (the `flex items-center gap-2.5` div at `:64-87`) and in the mobile drawer nav (`:91-134`).
- `src/app/(game)/play/page.tsx` — await `resolveAdminAccess()` after the authorized-session branch (`:49-53`); delete the role-pill block at `:71-76`; keep the `Shield` import (`:4`) since the entry uses it; render the entry inside the existing `flex items-center gap-3` cluster (`:66-77`).
- `src/locales/en.json`, `es.json`, `ja.json`, `pl.json`, `ru.json`, `zh.json` — add `header.navAdmin` and `game.adminPanel`.
- `tests/admin-entry.test.ts` — new suite (see Tests); register it in the `test:unit` script in `package.json` (`tests/suite-manifest.test.ts` fails on unregistered suites).
- `e2e/helpers/session.ts` — new Playwright-side session helper (see Contracts); `e2e/admin.spec.ts` — extend; `e2e/admin-entry.spec.ts` — new; `playwright.config.ts` / `package.json` `start` — see Tests for the required e2e-server constraint.
- `tests/design-motion-fixes.test.ts`, `tests/admin-layout.test.ts`, `tests/i18n-locales.test.ts` — unchanged; their existing pins must stay green.

## Contracts

```ts
// src/lib/admin.ts
export type AdminAccess = "admin" | "comp" | null;

export const resolveAdminAccess: (customCookieStore?: CookieReader) => Promise<AdminAccess>;
// React cache()-wrapped, same request-level dedupe as requireAdminSession.
// Order of operations (locked):
//   1. read ropoductions_session + ropoductions_age_verified via unquoteCookieValue;
//      if session cookie absent OR age cookie !== "true" -> null  (no D1 access, no getAuthEnv call)
//   2. getDatabase()/getAuthEnv() in try/catch -> null on throw
//   3. validateSessionAccess({db, sessionCookie, sessionSecret, initialAdminIds}) in try/catch -> null on throw
//      result.status !== "authorized" -> null
//   4. getPatronOverride(db, result.session.patron_id); if null and initialAdminIds present,
//      mirror the best-effort bootstrapInitialAdminIfEligible + re-read of validateAdminSession (:67-81)
//   5. override?.role === "admin" -> "admin"; override?.role === "comp" -> "comp"; else -> null
// NEVER branch on result.session.role. NEVER call notFound(). Every failure path returns null.
```

- `StudioHeader` props: `{ isAdmin?: boolean }` (default `false`; client component receives only the boolean — the session record never crosses to the client).
- Entry element: `<Link href="/admin">` labelled by the new keys — `data-testid="portal-admin-entry"` in `StudioHeader`, `data-testid="play-admin-entry"` on `/play` (distinct ids per surface, matching the repo's unique descriptive test-id convention) — `header.navAdmin` in `StudioHeader`, `game.adminPanel` on `/play`. Styling per DESIGN: canonical focus ring (`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`), `transition-colors` only (never `transition-all` — pinned by `tests/design-motion-fixes.test.ts` per-file), `min-h-[44px]` touch target, no emoji, no new icons beyond the locked map.
- Locale keys (exactly two new leaf keys per locale): `header.navAdmin` and `game.adminPanel`; English value `"Admin Panel"`.
- `e2e/helpers/session.ts`: `mintSessionCookie(sessionId: string, secret: string): Promise<string>` (wraps `signValue` from `src/lib/crypto.ts` — cookie wire format `<value>.<signature>` verified by `verifySignedValue`) and `seedSession(record)` inserting into the e2e D1 (`upsertSession` via the wrangler platform proxy, precedent: `scripts/seed-admin-overrides.ts`). The e2e server target must expose working D1/`.dev.vars` bindings (dev-mode platform proxy already wired in `next.config.ts:4-6`; alternative: an OpenNext/wrangler-served preview) while all seven existing e2e spec files stay green.
- No new API/message shapes beyond the above; `issueSessionResponse`, the OAuth callback, and `src/proxy.ts` are untouched (Q9/Q11′).

## Tests

New suite `tests/admin-entry.test.ts` (mock D1 via `globalThis.__D1_TEST_DB__` injection, harness precedent: `tests/admin-layout.test.ts:377-467`):
- `returns null without touching D1 when the session cookie is absent` — mock D1 counts `prepare()` calls; assertion: zero.
- `returns null without touching D1 when the age cookie is missing or not "true"` — zero D1 calls.
- `returns "admin" for a session with an admin override row` / `returns "comp" for a session with a comp override row` / `returns null when no override row exists and bootstrap is ineligible`.
- `returns "admin" for a pledging patron whose stored session role is "patron" and who has an admin override row` — the role-safety regression; fails pre-fix (any `session.role`-gated variant returns `null`).
- `returns "admin" for a founder with zero override rows via initialAdminIds bootstrap` — mirrors `tests/admin-layout.test.ts:470` founder-preservation.
- `returns null when getPatronOverride throws (fail closed, never surfaces an error)`.
- Source pins: `src/app/(portal)/page.tsx` contains `resolveAdminAccess` and passes `isAdmin=` to `StudioHeader`; `studio-header.tsx` contains `data-testid="portal-admin-entry"` and renders it in both the desktop cluster and the mobile drawer; `play/page.tsx` contains `data-testid="play-admin-entry"` and does NOT contain `session.role !== "patron"` while still importing `Shield` for the entry.

Existing suites that must stay green unchanged: `tests/admin-layout.test.ts` (all `requireAdminSession`/`validateAdminSession` pins — they fail if those functions change), `tests/i18n-locales.test.ts` (`keeps every locale on the same namespace contract as English`, `leaves no English leaf key untranslated so fallback stays silent`, `publishes no empty translation strings in any locale` — these fail if any of the six locales misses the two new keys), `tests/portal-guardrails.test.ts`, `tests/design-motion-fixes.test.ts`, `tests/suite-manifest.test.ts` (fails until `tests/admin-entry.test.ts` is registered in `test:unit`).

E2e:
- `e2e/admin.spec.ts` — all four existing tests unchanged and green. New: `valid signed session without an admin grant gets 404 with no Location header` (uses `mintSessionCookie` + seeded patron row; pre-harness this scenario was untested — anonymous and forged cookies only) and `admin session reaches /admin through the entry button from /play` (asserts `admin-status-badge` renders after clicking `[data-testid="play-admin-entry"]`).
- `e2e/admin-entry.spec.ts` — new: `anonymous landing and paywall interstitial contain no admin entry node` (assert `[data-testid$="-admin-entry"]` count is 0) (server HTML assertion via `page.content()`, proving Q3: no public locked button).

## Out of scope

- Any change to `requireAdminSession`, `validateAdminSession`, `issueSessionResponse`, the OAuth callback, `src/proxy.ts`, or the anti-enumeration 404 contract (Q9: admin login *is* the play login).
- Return-target/`?return=`/`?next=` plumbing of any form (Q11′, rejected: locked 2-2 contract plus open-redirect surface).
- The admin panel's sealed/Creator-Admin display and the two-tier model (untouched); role indicators for `comp` holders in patron chrome (deliberately removed, Q10b — their `Complimentary Pass` tier badge from `session.tier_name` still communicates their access).
- The entry inside the save dock (rejected, decision record §5.3) and any branded/custom 404 page.
- Stories 6.2/6.3 fullscreen and dock behaviour.

## Verification

1. `npm run test:unit` — includes the new `tests/admin-entry.test.ts` and all existing pins above.
2. `npx tsc --noEmit`
3. `npm test`
4. `npm run build`
Additionally, before the PR: `npm run test:e2e` (all `e2e/*.spec.ts`, existing seven files green plus the two new/extended specs) and zero conflicts against `origin/develop`.
