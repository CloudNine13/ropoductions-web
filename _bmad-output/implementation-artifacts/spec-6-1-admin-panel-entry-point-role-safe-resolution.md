---
title: 'Story 6.1: Admin Panel Entry Point & Role-Safe Resolution'
type: 'feature'
created: '2026-09-21'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '84d8bd0'
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
- `e2e/admin-entry.spec.ts` — new: `anonymous visitor gets no admin entry in the portal or paywall HTML` (assert `[data-testid*="admin-entry"]` count is 0, substring matching so the drawer id is covered too; server HTML assertion via `page.content()`, proving Q3: no public locked button).

## Tasks & Acceptance

- [x] Add `AdminAccess` and `resolveAdminAccess` to `src/lib/admin.ts` (cookie-presence short-circuit, fail-closed `null`, override-table verdict, founder env-bootstrap mirror, `console.error` on throw paths); `isSealedCreatorAdmin`, `validateAdminSession`, `CookieReader` and `requireAdminSession` untouched.
- [x] Resolve admin access server-side in `src/app/(portal)/page.tsx` and pass `isAdmin` to `StudioHeader`.
- [x] Render the portal entry in the desktop nav cluster (`data-testid="portal-admin-entry"`) and in the mobile drawer (`data-testid="portal-admin-entry-drawer"`).
- [x] Render the `/play` header with exactly one status badge plus `data-testid="play-admin-entry"`; delete the `session.role !== "patron"` pill block.
- [x] Refresh the server tree after age-gate confirmation so a lapsed age cookie no longer hides the entry until a manual reload.
- [x] Add `header.navAdmin`, `game.adminPanel`, `game.adminBadge` to all six locale dictionaries.
- [x] `tests/admin-entry.test.ts` (9 resolver behaviours + 7 surface pins) registered in `test:unit`.
- [x] E2E harness with real local D1 and signed cookies (`scripts/e2e/setup-e2e-env.ts`, `e2e/helpers/session.ts`), new `e2e/admin-entry.spec.ts`, extended `e2e/admin.spec.ts` (signed non-admin 404s + positive control).

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

## Spec Change Log

### 2026-09-21 — owner decisions from the pre-implementation roundtable

1. **One status badge per session (supersedes the AC reading "no role word in patron-facing chrome").** Owner: "I want ONLY ONE BADGE for EVERYBODY" — the `/play` header renders a single badge: the `tier-gold` Studio Admin badge (`game.adminBadge`, `Shield`) when `resolveAdminAccess` returns `"admin"`, otherwise the tier badge from `session.tier_name`. The role pill is deleted outright. Consequence: a third locale leaf (`game.adminBadge`) beyond the frozen two-key contract, and the pledge tier of a pledging admin is no longer displayed in patron chrome. `DESIGN.md` carries the matching amendment A-2026-09-21-02.
2. **Age-gate staleness is fixed in this story.** The portal layout renders the header server-side while the 14-hour age cookie is absent and confirmation never re-rendered the server tree, so the entry stayed hidden until a reload. `AgeGateDialog` now calls `router.refresh()` after confirmation — skipped while the URL carries server-derived modal state (`paywall`, `auth_required`, `auth_error`), because refreshing that state resurrects a dialog the visitor already dismissed (measured: `e2e/portal.spec.ts` "closing the … window returns to the landing page" failed ~1 in 3 runs before the guard). Covered by an e2e test that also proves no document reload occurred.
3. **E2E runs against the built OpenNext worker.** Owner: Playwright exists for local and GitHub runs and need not mirror Cloudflare's edge network. The harness: `e2e:setup` generates a gitignored `.dev.vars` with random local signing/encryption keys only when absent, applies local D1 migrations, and seeds fixtures once through the Wrangler platform proxy; `e2e:server` then builds the OpenNext worker and serves it with `opennextjs-cloudflare preview --port 3100` (local D1/R2 state, secrets from `.dev.vars`). Production-mode fidelity is preserved — the security assertions (anonymous/forged/signed non-admin 404s, no `Location` header) execute against the shipped worker rather than a dev server — and no `allowedDevOrigins` dev-only exception is needed. `.github/workflows/e2e.yml` no longer builds separately (the server command builds) and gains `scripts/**` in its path filter.

### 2026-09-21 — party adjudications and implementation deviations

4. **Resolver stays in `src/lib/admin.ts`** (Winston, accepted): the file already owns override semantics, and a new module would split that reasoning across two files for no business value.
5. **The spec's call sequence is preserved; the duplicate read is recorded, not refactored.** Mary and Amelia correctly showed that `/play` now validates the session twice per render (page + resolver). Deviating would rewrite the frozen Contracts signature, so the cost is recorded in `deferred-work.md` instead.
6. **The resolver's bootstrap mirror is load-bearing and stays.** Mary and Amelia called it redundant; it is not: `validateSessionAccess` returns `authorized` for an active pledge before its bootstrap block (`src/lib/auth.ts:146-148`), so a founder who also pledges is only materialized by the resolver's own mirror. Covered by `returns admin for a pledging founder with zero override rows via env bootstrap`.
7. **`console.error` on the resolver's throw paths** (Winston, accepted): silent `null` reproduces the invisibility this story repairs; the logs mirror `requireAdminSession` and carry no payload.
8. **Entry test ids:** `portal-admin-entry` (desktop) plus `portal-admin-entry-drawer` (mobile drawer) rather than one id rendered twice, so drawer parity is assertable.
9. **Positive control adopted** (John, accepted): `e2e/admin.spec.ts` asserts a seeded admin session reaches `admin-status-badge` in the same run as the signed non-admin 404 assertions, so a broken D1 binding cannot pass as a correct guard.
10. **Review patches (2026-09-21, post-implementation review).** Applied after the three review layers and the security reviewer reported: two fail-closed resolver paths covered by tests (infrastructure init, session-lookup throw) plus an out-of-contract override role case; the age-gate refresh guard extracted to `hasServerModalState(search)` in `src/lib/paywall.ts` and unit-covered (its only prior protection was the ~1-in-3 portal race, which CI retries mask); the mount effect now refreshes when the client sees an age cookie the server render did not; the founder e2e fixture only exists for a setup-generated `.dev.vars` (marked `# generated-by:`), so a developer's real creator id is never seeded over or deleted; local signing/encryption keys are random per machine instead of repository constants; `e2e.yml` path filter also watches `migrations/**` and `wrangler.toml`; trailing newlines restored. Residual findings recorded in `deferred-work.md`.

## Review Triage Log

Layers run 2026-09-21 against diff `/tmp/story-6-1-review.diff` (67,729 B): blind-hunter, edge-case-hunter, verification-gap, plus a security review. Verdicts below are the orchestrator's, rendered after verification against the worktree.

| # | Finding (layer) | Verdict | Evidence and route |
|---|---|---|---|
| 1 | Session-signing and token-encryption keys were repository constants written to `.dev.vars`, with `next dev` bound to every interface (security RPD-6.1-SEC-01) | `medium` | Real: `scripts/e2e/setup-e2e-env.ts` held literals and the dev server printed a LAN URL. **Patch:** keys are now `randomBytes(32)` per machine, and the harness serves the OpenNext worker, which binds `127.0.0.1:3100` only (verified with `ss -ltn`). |
| 2 | The `/admin` literal and entry test ids ship in the public client chunk (security RPD-6.1-SEC-02) | `low` | Real: `src/components/studio-header.tsx:1` is a client component. **Rejected as a code fix:** the frozen Contracts lock `StudioHeader` to an `isAdmin` boolean, and `/admin` still 404s identically to any unknown path, so no oracle exists. Accepted consequence recorded in `DESIGN.md` A-2026-09-21-02. |
| 3 | All anti-enumeration assertions run only against a dev-mode server; no CI job serves a built bundle (security RPD-6.1-SEC-03; verification-gap finding 3; blind-hunter 8 first half) | `medium` | Real when filed — the reviewed diff served `next dev`. **Patch:** `e2e:server` now runs `npm run build` and `opennextjs-cloudflare preview --port 3100`, so the 404/no-`Location` assertions execute against the built worker; full suite green twice (43 passed each) on the preview harness. |
| 4 | Two of the resolver's three fail-closed catch paths have no test (verification-gap 1; blind-hunter 2) | `medium` | Real: only the override-lookup throw was covered. **Patch:** `tests/admin-entry.test.ts` adds the session-lookup throw and the unavailable-binding cases, both asserting `null`. |
| 5 | The age-gate refresh guard is protected only by a race that CI retries mask (verification-gap 2; edge-case claim 2) | `medium` | Real: only source-text pins existed. **Patch:** predicate extracted to `hasServerModalState(search)` and unit-covered for five blocking and five allowing search strings; residual (admin landing on a modal-state URL) recorded in `deferred-work.md`. |
| 6 | The mount effect closes the gate without a server re-render when the client cookie outruns the server render (edge-case 1) | `low` | Real but narrow. **Patch:** the effect refreshes when `hasAgeVerifiedCookie()` is true while `isServerVerified` is false; a refresh never remounts the dialog, so no loop. |
| 7 | An override role outside `admin`/`comp` resolves to `"comp"` instead of `null` (edge-case 2) | `low` | Real: the frozen contract says else-`null`. **Patch:** explicit `null` return plus a unit case for an out-of-contract role. |
| 8 | The founder fixture can delete or overwrite a developer's real local identity (edge-case 3; security "non-security note") | `medium` | Real: the scoped `DELETE` ran for any `.dev.vars`. **Patch:** the founder fixture is only seeded when `.dev.vars` carries the setup script's `# generated-by:` marker, and the spec skips otherwise. |
| 9 | `e2e.yml` path filter misses `migrations/**` and `wrangler.toml`, which the setup applies (verification-gap other 2) | `low` | Real. **Patch:** both added to the filter. |
| 10 | Resolver doc comment omits the non-authorized status family (blind-hunter 4) | `low` | Real. **Patch:** comment now lists not-found, revoked, lapsed, and unauthorized. |
| 11 | Missing trailing newline in `src/lib/admin.ts` and `e2e/admin.spec.ts` (blind-hunter 1) | `low` | Real. **Patch:** restored. |
| 12 | `"comp"` is dead state with no branching consumer (blind-hunter 3) | `low` | Real but intended: the frozen Contracts require `"admin" \| "comp" \| null` and the Visibility rule depends on the distinction. **Rejected:** the verdict must not collapse to a boolean, or a future surface could conflate a comp pass with an admin. Pinned by `returns comp for a session holding a comp override row`. |
| 13 | Spec prose described a `$=` selector while the spec ships `*=` (blind-hunter 6) | `false` | The shipped substring selector is a deliberate superset that also matches the drawer id; prose corrected in the non-frozen Tests section, no code defect. |
| 14 | The `build:next` removal was justified with the engine-mock regeneration argument (blind-hunter 7) | `false` | The reviewed revision predates the harness pivot; the server command now runs `npm run build`, whose `prebuild` regenerates the mock, and the change-log entry was rewritten to say so. |
| 15 | Reviewed diff does not match the worktree (blind-hunter 9; edge-case claims 1–2) | `false` | True of the frozen snapshot: the harness pivoted to the built OpenNext worker during triage; `playwright.config.ts`, `package.json`, `next.config.ts` and the change log all reflect it. |
| 16 | Playwright `webServer.timeout` of 120 s cannot cover setup plus a first compile (edge-case 4; verification-gap other 1) | `false` | Current value is 420 s with a comment naming the build step; the reviewed hunk was stale. |
| 17 | Clicking the age-gate confirm before hydration can lose the click (edge-case 5) | `false` | The Radix `Dialog.Portal` content — including the confirm button — is client-rendered, so the element cannot exist before the handler is attached; Playwright's actionability wait cannot race it. |
| 18 | Committed `engine-mock.generated.ts` can drift from its plugin sources (verification-gap other 3) | `defer` | Pre-existing and not caused by this story; `npm run build` regenerates it on every e2e run. Recorded in `deferred-work.md`. |
| 19 | No e2e assertion covers real session-cookie attributes (`HttpOnly`, `SameSite`, `Secure`) (blind-hunter 8 second half) | `defer` | Pre-existing across all specs (they mint cookies with `addCookies`); unit-covered only. Recorded in `deferred-work.md`. |
