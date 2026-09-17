---
title: 'Story 1.2: Mandatory 21+ Age Gate Modal with Cookie Persistence'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Visitors arriving at the Ropoductions web portal can access public pages without age verification, creating legal and compliance exposure for mature indie gaming content.

**Approach:** Implement a mandatory Radix UI `Dialog` modal in `src/components/age-gate-dialog.tsx` mounted within `src/app/(portal)/layout.tsx` that checks for the `ropoductions_age_verified=true` cookie (max-age 5 days / 432000s, locked per owner decision, `SameSite=Lax`, `Secure`), traps focus with `backdrop-blur-xl`, sets the cookie and smoothly dissolves on "I am 21 or older — Enter Studio", immediately redirects to `https://google.com` on "Exit", and remains hidden for verified returning visitors.

</frozen-after-approval>

## Implementation Notes
- Created `src/lib/cookies.ts` providing `hasAgeVerifiedCookie` and `setAgeVerifiedCookie` utilities with 5-day max-age, Lax, and Secure flags.
- Created `src/components/age-gate-dialog.tsx` implementing a mandatory Radix UI `Dialog` modal with focus trap, explicit cookie disclosure notice, backdrop blur (`backdrop-blur-xl`), dark obsidian card design token styling (`#121522` / `bg-card`), glowing crimson top border (`border-t-2 border-t-primary`), Lucide `ShieldAlert` icon, Cinzel typography, and >=44px touch targets.
- Updated `src/app/globals.css` with dedicated keyframe animations and exact center translation for `.age-gate-content` and `.age-gate-overlay` ensuring smooth 200ms ease-out dissolution.
- Mounted `<AgeGateDialog />` inside `src/app/(portal)/layout.tsx` to protect all public portal pages.
- Verified via headless browser automation: initial visit blocking, focus trap on primary CTA, cookie setting and smooth dissolution on confirmation, automatic bypass on page reload with cookie, and immediate redirection to `https://google.com` on exit.

## Review Triage Log
- high: Prevent client-side gate bypass / FOUC — patched by reading cookie in PortalLayout server component and passing `isServerVerified` to AgeGateDialog.
- high: Disallow unverified dismissal via `onOpenChange` — patched by validating `hasAgeVerifiedCookie()` before permitting `isOpen(false)`.
- medium: Intercept `onInteractOutside` — patched by adding `onInteractOutside={(e) => e.preventDefault()}` on Dialog.Content.
- medium: Small-height / landscape viewport clipping — patched by adding `max-h-[calc(100dvh-2rem)] overflow-y-auto` to Dialog.Content.
- medium: Back-button navigation loop on exit — patched by switching `window.location.href` to `window.location.replace(redirectUrl)`.
- medium: Quoted cookie values in `hasAgeVerifiedCookie` — patched by stripping quotes from raw cookie values.
- low: Capture pointer events during exit dissolution animation — patched with `pointer-events: none` on `[data-state="closed"]` in globals.css.
