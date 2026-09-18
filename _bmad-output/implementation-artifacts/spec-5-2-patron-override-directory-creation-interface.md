---
title: 'Story 5.2: Patron Override Directory & Creation Interface'
type: 'feature'
created: '2026-09-19'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-ropoductions-web-2026-09-15/ARCHITECTURE-SPINE.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-ropoductions-web-2026-09-15/DESIGN.md'
  - '_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Studio creators and administrators need a secure visual dashboard to grant and manage elevated access passes ('admin' and 'comp') by Patreon ID without requiring manual SQL commands. The Two-Tier Admin Model must be strictly enforced: Creator Admins (sealed founding accounts configured via CREATOR_ADMIN_PATREON_IDS or granted_by = 'creator_bootstrap' / 'system_bootstrap') are permanently immutable, while Panel-Assigned Admins (granted_by = session.patron_id) are manageable via the dashboard.

**Approach:**
1. Enhance `src/lib/admin.ts`:
   - Export tokens: `ADMIN_ROLE_ADMIN_COLOR` (#FBBF24), `ADMIN_ROLE_COMP_COLOR` (#38BDF8), `ADMIN_CREATOR_TIER_LABEL` ("Creator Admin (Sealed)"), `ADMIN_PANEL_TIER_LABEL` ("Panel Admin").
   - Define `PATREON_ID_REGEX = /^\d{1,20}$/` and `validatePatreonId`.
   - Implement `isSealedCreatorAdmin` to identify sealed Creator Admins.
2. Implement Server Action `src/app/(admin)/admin/overrides/actions.ts`:
   - Enforce authentication via `requireAdminSession()`.
   - Validate input parameters (`patron_id` against `^\d{1,20}$`, `role` as `'admin' | 'comp'`, sanitize notes).
   - Enforce Two-Tier Admin Model: fail closed and reject any mutation attempt on Creator Admins.
   - Upsert record with `granted_by = session.patron_id` and revalidate path `/admin/overrides`.
3. Create Client Component `src/components/admin/override-form.tsx`:
   - React 19 `useActionState` form with accessible inputs, status messages (`role="status"`, `aria-live="polite"`), and 44x44px minimum touch targets.
   - Resets form inputs on each successful submission via state timestamp dependency.
4. Create Component `src/components/admin/overrides-table.tsx`:
   - Semantic table rendering active overrides with Patreon ID, Role badge, Admin Tier lock indicator, Notes, Granted By, and Date Added.
   - Strictly disables modification actions on Creator Admin records.
5. Update Server Component `src/app/(admin)/admin/overrides/page.tsx`:
   - Protects route with `requireAdminSession()`, loads overrides via `listPatronOverrides()`, and renders form and directory table.
6. Add unit test suite `tests/admin-overrides.test.ts`:
   - 20 unit tests covering validation regex, immutability invariant enforcement, Server Action core logic, database error fail-closed handling, design system tokens, touch targets, and accessibility semantics.

## Acceptance Criteria

- **Given** an authorized administrator on `/admin/overrides`
- **When** the page loads
- **Then** it displays an active overrides table showing Patreon ID, Role badge (`#FBBF24` for Admin, `#38BDF8` for Comp), Admin Tier (`#FBBF24` "Creator Admin (Sealed)" lock badge for `granted_by = 'creator_bootstrap'`, or `#38BDF8` "Panel Admin" for runtime grants), Notes, Granted By, and Date Added
- **And** the Two-Tier Admin Model is strictly enforced:
  1. **Creator Admins (`granted_by = 'creator_bootstrap'` / `'system_bootstrap'`):** Permanently sealed founding creator accounts. In the admin panel, Creator Admin rows are immutable: form updates to their role, notes, or status are strictly disabled.
  2. **Panel-Assigned Admins (`granted_by = session.patron_id`):** Runtime administrators and complimentary playtesters created or managed by studio staff via the dashboard form.
- **And** a registration form with inputs for Patreon ID (text), Role (dropdown select), and Notes (optional text) allows creating new overrides or updating existing panel-assigned records
- **And** submitting the form validates the Patreon ID against the numeric regex `^\d{1,20}$` (rejecting non-digits and whitespace), rejecting any attempt to reassign or modify a sealed Creator Admin
- **And** executes a Next.js Server Action inserting or updating `patron_overrides` with `granted_by = session.patron_id` and refreshes the table via `revalidatePath('/admin/overrides')`
- **And** all inputs and interactive buttons adhere to the 44x44px minimum touch target size.

</frozen-after-approval>
