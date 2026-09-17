---
id: SPEC-ropoductions-web
companions:
  - patron-tier-matrix.md
  - save-and-runtime-contract.md
  - tech-candidates.md
sources:
  - ../../planning-artifacts/briefs/brief-ropoductions-web-2026-09-15/brief.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Spec: Ropoductions Web Portal & Patron Game Client

## Why

Ropoductions adult game studio currently distributes titles through manual archive downloads (.zip), resulting in high player friction on mobile or shared devices, link leakage and piracy, and frequent player save corruption across game updates. This platform establishes a prestige web portal with a 21+ age gate, authenticates patrons through Patreon OAuth 2.0 to unlock an in-browser RPG Maker MZ game client, preserves player saves seamlessly across patch deployments, and protects game assets from unauthorized scraping.

## Capabilities

- **CAP-1**
  - **intent:** Visitors must confirm they are 21 years of age or older via a blocking modal before accessing portal content or the game player.
  - **success:** First-time visitors are presented with a blocking 21+ confirmation dialog; until confirmed, underlying pages and assets remain inaccessible; confirmation persists across sessions in local state.

- **CAP-2**
  - **intent:** Visitors can explore studio branding, game showcases, community links, and patron subscription calls-to-action on desktop and mobile viewports.
  - **success:** The public landing page renders studio identity, project cards, and responsive navigation across desktop and mobile screens without layout breakage.

- **CAP-3**
  - **intent:** Patrons authenticate via Patreon OAuth 2.0 to unlock access to the restricted web game player based on active campaign tier membership ($5 Ork Patron, $10 Ogre Pimp, $15 Elf Sybarite, $25 Horseman Aesthete, $50 Mind Fucker Avatar).
  - **success:** Patrons with an active pledge of $5 or higher access `/play` immediately upon authentication; visitors without an active eligible pledge are redirected to the landing page with a prompt to subscribe or renew.

- **CAP-4**
  - **intent:** System verifies patron active status on route transitions and portal interactions without terminating an active in-gameplay session.
  - **success:** A patron whose subscription lapses during gameplay is allowed to finish their current session without interruption; subsequent route navigation or restricted interactions re-verify status, redirect to home, and prompt renewal if inactive.

- **CAP-5**
  - **intent:** Authorized patrons can launch and play the embedded RPG Maker MZ game directly in modern desktop and mobile browsers with responsive aspect ratio scaling and touch/keyboard input parity.
  - **success:** Embedded HTML5 game initializes, scales responsively to the viewport within an aspect-ratio-locked container, and accepts mouse, touch, and keyboard controls without letterbox distortion.

- **CAP-6**
  - **intent:** In-browser game save data persists automatically across deployments of updated game builds and patches under the same web origin.
  - **success:** Deploying an updated game build does not clear or partition client browser storage (`rmmz_save`), allowing existing saves to load successfully on the updated version.

- **CAP-7**
  - **intent:** Players can export all in-browser game save slots as a bundled `.zip` archive and import `.zip` or `.rpgsave` files into browser storage via a dedicated web HUD.
  - **success:** Triggering "Export Save" downloads a valid `.zip` archive containing all active save slots and system config; uploading a valid archive restores save data into browser storage and refreshes the in-game load menu.
- **CAP-8**
  - **intent:** System serves encrypted game assets only to requests carrying a valid patron session token, preventing unauthenticated scraping and direct hotlinking.
  - **success:** Direct unauthenticated HTTP requests for encrypted game assets return HTTP 403 Forbidden; authenticated patron game sessions load all assets without errors.


- **CAP-9**
  - **intent:** Visitors and players can select their preferred language from a language switcher, dynamically localizing the web shell, age gate, landing page, paywall, and save HUD.
  - **success:** Selecting a language instantly updates all portal microcopy and UI text, persisting the locale preference in a client cookie across sessions.

- **CAP-10**
  - **intent:** Studio creators and administrators manage role overrides and game playtest passes with anti-enumeration protection and sealed Creator Admin immutability.
  - **success:** The application enforces a Two-Tier Admin Model: Creator Admins configured via `CREATOR_ADMIN_PATREON_IDS` (or `INITIAL_ADMIN_PATREON_IDS`) in `.env.local` / `.dev.vars` are sealed inside the application and CANNOT be modified, updated, or deleted by any user or admin panel action. Panel Admins assigned through the dashboard can be created, updated, and revoked by authorized staff with sole-admin lockout protection.
## Constraints

- Embedded game engine is RPG Maker MZ HTML5 export with an initial payload footprint of 5–30MB.
- All 5 active patron tiers ($5-$50) receive identical game access in v1; tier-differentiated perks are prohibited in v1.
- Game developers guarantee backward compatibility of save data schemas across game patches via MZ plugins; the web shell guarantees origin-level storage persistence.
- Full responsive scaling is required across all web pages and the game canvas for desktop and mobile viewports.
- Patreon OAuth 2.0 is the sole authentication and authorization provider for v1.
- Web stack is Next.js (App Router) deployed on Cloudflare serverless runtime (Workers/Pages, R2 asset storage, D1 session database).
- Upstream game releases are ingested via GitHub Actions supporting both manual execution and upstream self-service trigger (`repository_dispatch`), syncing assets to private R2 and engine shell to `public/engine/` while isolating all Cloudflare secrets inside the web repository.
- The web player iframe container and Save HUD are architecturally testable in isolation via a same-origin mock canvas harness at `/engine/index.html` prior to upstream game asset availability.

## Non-goals

- Cloud save synchronization to remote user database accounts (parked for v3-v5).
- In-browser playable client for Godot games (future Godot titles cataloged for download only).
- Tier-differentiated in-game perks, beta branches, or cheat menus in v1.
- In-portal community forums, comments, or native social feeds.
- Multiple payment gateways (Stripe, PayPal, Subscribestar) in v1.
- Studio merchandise catalog and administrative item management panel (parked for v2).

## Success signal

- A 21+ patron authenticates via Patreon, launches the embedded RPG Maker MZ game in under 30 seconds on either desktop or mobile, plays a session, exports their `.rpgsave` file, and resumes play without save corruption after the studio deploys an updated game patch.
