# Epic 6 Brief: Admin Entry Point, Fullscreen Continuity & HUD Default Visibility

- **Date:** 2026-09-21
- **Derives from:** `_bmad-output/planning-artifacts/analytics/analytics-epic-6-2026-09-21.md` (decisions, evidence, rejected alternatives)
- **Owner:** Igor

## Problem

Three defects surfaced in manual testing of the deployed portal:

1. **No way in.** The admin panel is correctly gated but has no entry point anywhere in the product. The only path is typing `/admin`. Additionally, the panel's chrome misreports admin state for an admin who also holds an active pledge.
2. **Fullscreen destroys play.** Using the dock's fullscreen button returns the game to the main menu on entering *and* on leaving fullscreen; in-memory progress is lost. The cause is host-side: the viewport returns two different React trees, so the engine iframe is remounted and reloaded on every toggle.
3. **Chrome over gameplay.** The save dock is visible by default and reopens on fullscreen entry, covering the game.

## Solution

- **Admin entry, admin-only, paywall-backed.** One shared override-table resolver decides admin identity; the `/play` header shows the admin-panel button only to admins (creator and panel-assigned alike, never `comp`), the portal header shows the same entry through a server-resolved prop, and the patron-facing role pill is deleted in favour of that button. `/admin` itself keeps returning 404 for every non-admin — logged out, stale, forged, or valid-but-non-admin — so no auth flow, no redirect and no enumeration property changes: the panel is behind the paywall because it requires a valid Patreon-derived session *and* an admin override row.
- **Fullscreen as a pure layout change.** The viewport becomes a single invariant DOM tree with only class names switching; the engine iframe is never remounted or moved, so the live game survives entering and leaving fullscreen.
- **Dock hidden by default in fullscreen.** The fullscreen dock starts collapsed behind its existing 44px affordance, expands only on explicit user action, and re-collapses when idle; the windowed dock keeps today's dim-only behaviour.

## Scope

**In:** the three defects above, their regression tests, and the documentation amendments they force (SPEC, PRD, architecture spine, design and experience spines, epics, tracking).

**Out:** any change to the auth flow, session issuance, OAuth, admin sealing/two-tier model, or the `/admin` 404 semantics; any return-target plumbing; branded 404 page; engine-side fullscreen handling; R2/shell delivery; the stale `public/engine/**` mirror contract.

## Success criteria

- An admin — including one holding an active pledge — reaches the panel from the portal or from `/play` without typing a URL; a non-admin sees no trace of the entry.
- Entering and leaving fullscreen is measurably free of engine reloads (boot count 1 across the transition, asserted end-to-end).
- In fullscreen the game is unobstructed by default, and no save action becomes unreachable: the affordance that reveals the dock stays keyboard-reachable and announced.
- All four existing `e2e/admin.spec.ts` assertions remain green, and a valid non-admin session is newly pinned to a 404 with no `Location`.

## Constraints

Repository policy applies unchanged: branch `<type>/<story-id>-<kebab-slug>` from updated `develop` inside a worktree, PR to `develop` only, Conventional Commits, no emojis, design tokens and the locked icon map, all new UI strings in six locales, no story/ticket references in code comments, and no silent cutover — obsolete behaviour is removed, not aliased.
