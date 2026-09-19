---
title: 'Story 5.1: Restricted Admin Layout & Authentication Guard'
type: 'feature'
created: '2026-09-19'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-ropoductions-web-2026-09-15/ARCHITECTURE-SPINE.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-ropoductions-web-2026-09-15/DESIGN.md'
  - '_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Internal studio administrative controls and overrides (e.g., granting or revoking playtester and administrator passes) must be completely inaccessible to unauthorized visitors, crawlers, and regular patrons. Navigating to `/admin` or any `/admin/*` subroute without an active administrator session must never redirect (which leaks route existence) and instead return a standard Next.js `notFound()` (HTTP 404) to prevent route enumeration. Authorized administrators require a secure, isolated `(admin)` layout with dark studio branding, an admin status badge in Patron Gold (`#FBBF24`), and direct navigation back to `/play`.

**Approach:**
1. Implement `src/lib/admin.ts`:
   - Define designated design tokens: `#090A0F` background, `#121522` card surface, `#23283E` border, and `#FBBF24` gold status badge.
   - Implement `validateAdminSession` to evaluate `ropoductions_session` and `ropoductions_age_verified` cookies, verify HMAC cryptographic signatures, query D1 `sessions`, enforce `revoked === 0` and unexpired sessions, verify `session.role === 'admin'`, and auto-elevate initial admins via `initialAdminIds`.
   - Implement `requireAdminSession` for Server Components to enforce authentication and invoke Next.js `notFound()` on any unauthorized or failing access attempt, failing closed without leaking route existence.
2. Build `src/app/(admin)/layout.tsx`:
   - Isolated admin layout Server Component applying `requireAdminSession`.
   - Renders dark studio aesthetic with `#090A0F` background, `#121522` header with `#23283E` border, and Studio Emerald brand badge.
   - Renders `#FBBF24` Gold admin status badge (`data-testid="admin-status-badge"`) and a direct return link back to `/play` (`data-testid="admin-nav-play"`) respecting 44x44px minimum touch targets.
3. Build `src/app/(admin)/admin/page.tsx`:
   - Admin dashboard Server Component displaying authenticated admin patron ID, role, and entitlement.
   - Quick navigation cards linking to `/admin/overrides` and `/play`.
4. Build `src/app/(admin)/admin/overrides/page.tsx`:
   - Protected placeholder for Story 5.2 overrides management table.
5. Update `src/proxy.ts`:
   - Document anti-enumeration handling for `/admin` routes.
6. Add unit test suite `tests/admin-layout.test.ts`:
   - 16 unit tests covering session validation, `notFound()` triggers on unauthenticated, expired, revoked, comp, and patron sessions, design tokens, and layout/dashboard contracts.

## Acceptance Criteria

- **Given** an unauthorized visitor or regular patron navigating to `/admin` or any `/admin/*` subroute
- **When** the `(admin)/layout.tsx` Server Component evaluates session state (middleware does NOT route `/admin`; anti-enumeration is enforced entirely at the layout via `requireAdminSession`)
- **Then** if `session.role !== 'admin'`, the request returns a standard Next.js `notFound()` (HTTP 404) to prevent route enumeration
- **And** if `session.role === 'admin'`, the page renders the isolated `(admin)` layout with dark studio theme (`#090A0F` background, `#121522` card surface)
- **And** displays an admin status badge (`#FBBF24` Gold) and a direct navigation link back to `/play`.

</frozen-after-approval>
