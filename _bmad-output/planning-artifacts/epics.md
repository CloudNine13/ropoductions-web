---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-ropoductions-web-2026-09-15/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-ropoductions-web-2026-09-15/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-ropoductions-web-2026-09-15/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-ropoductions-web-2026-09-15/EXPERIENCE.md
  - _bmad-output/specs/spec-ropoductions-web/SPEC.md
---

# ropoductions-web - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for ropoductions-web, decomposing the requirements from the PRD, UX Design contracts, and Architecture specifications into implementable stories.

## Requirements Inventory

### Functional Requirements

- **FR-1:** Mandatory 21+ Confirmation Modal blocking all underlying interactions on first visit until user confirms age self-attestation.
- **FR-2:** Age Confirmation Persistence storing verification status in a 14-hour persistent cookie (`max-age=50400`, locked per owner decision) to avoid repeated prompting.
- **FR-3:** Responsive Hero & Studio Identity displaying studio branding, key art, lore, and primary calls-to-action across desktop and mobile.
- **FR-4:** Project Showcase & Media Cards displaying RPG Maker MZ title, character profiles, screenshots with lightbox, and future Godot teaser.
- **FR-5:** Social & Community Hub providing verified external links to Patreon, Discord, and Twitter/X with security attributes.
- **FR-6:** Patreon OAuth 2.0 Authorization Flow with PKCE requesting identity and campaign membership scopes.
- **FR-7:** Tier Access Verification validating active pledges ($5 Ork Patron, $10 Ogre Pimp, $15 Elf Sybarite, $25 Horseman Aesthete, $50 Mind Fucker Avatar) to grant `/play` access.
- **FR-8:** Paywall Interstitial & Renewal Prompt displaying tier breakdown and direct checkout links when unauthenticated or unpledged users access `/play`.
- **FR-9:** Graceful Session Re-check verifying patron status on route navigation without mid-gameplay disconnection.
- **FR-10:** Embedded Game Canvas Container hosting RPG Maker MZ in an aspect-ratio locked 16:9 container scaling to available viewport.
- **FR-11:** Cross-Platform Input Parity supporting mouse, keyboard (WASD/Arrows), and mobile touch coordinate mapping without double-tap delay.
- **FR-12:** Fullscreen Mode Toggle expanding game container to native device fullscreen via HTML5 Fullscreen API.
- **FR-13:** Origin-Stable Save Persistence guaranteeing browser IndexedDB (`rmmz_save`) namespaces remain intact across build and patch deployments.
- **FR-14:** Save File Export (.zip Archive) bundling all active save slots (slots 1–20, global, and config) into a single downloadable zip file.
- **FR-15:** Save File Import (.zip or .rpgsave) accepting zip bundles or individual save files, injecting them into browser storage, and refreshing the game index.
- **FR-16:** Safe Storage Reset / Wipe Option providing a two-step confirmation dialog to purge local game save data.
- **FR-17:** Encrypted Asset Runtime Support enabling the game engine to decrypt static assets in memory during execution.
- **FR-18:** Authenticated Edge Asset Routing verifying active session cookies on `/api/game/*` requests and returning HTTP 403 for unauthorized requests.
- **FR-19:** Multilanguage Web Shell & Language Selector providing an accessible language switcher supporting multiple locales (English default, plus e.g. Japanese, Spanish, Russian, Chinese, Polish) persisting locale selection in a 365-day cookie.
- **FR-20:** Restricted Studio Admin Shell & Anti-Enumeration Guard providing an isolated `(admin)` layout restricted to `session.role === 'admin'` returning HTTP 404 for unauthorized visitors.
- **FR-21:** Studio Patron Override Management & Lockout Protection providing an internal dashboard to register, list, and revoke Patreon ID access passes with sole-admin lockout prevention and audit metadata.

### NonFunctional Requirements

- **NFR-1 (Performance):** Landing page initial load (LCP) under 1.8 seconds; game title screen interactive within 5.0 seconds on 25Mbps connection.
- **NFR-2 (Security):** OAuth access and refresh tokens stored strictly in Cloudflare D1; client browser receives only signed, HTTP-only, `SameSite=Lax`, secure session cookie.
- **NFR-3 (Reliability):** 99.9% uptime; cached session resilience during third-party Patreon API downtime.
- **NFR-4 (Usability & Accessibility):** Minimum 44x44px touch targets on mobile; WCAG AA contrast ratio on dark studio theme.

### Additional Requirements

- **ARCH-1 (Starter & Runtime):** Next.js 15+ App Router compiled via `@opennextjs/cloudflare` targeting Cloudflare Workers serverless runtime.
- **ARCH-2 (Engine Sandbox):** RPG Maker MZ hosted within a same-origin `<iframe>` at `/engine/index.html` to prevent DOM/window pollution and preserve IndexedDB storage.
- **ARCH-3 (PostMessage Bridge):** `Ropoductions_WebBridge.js` plugin with strict `window.location.origin` locking and payload validation.
- **ARCH-4 (Existing Private R2 Bucket):** Bind existing Cloudflare R2 bucket (`GAME_ASSETS`) with zero public URLs, streamed exclusively via authenticated edge route handlers with `Cache-Control: private, max-age=86400`.
- **ARCH-5 (Database & Migrations):** Cloudflare D1 SQLite database using parameterized prepared statements and versioned migrations in `migrations/0001_initial_sessions.sql`.
- **ARCH-6 (Client Compression):** `jszip` client-side library integrated into the Web Shell for bundling and unzipping save data archives.
- **ARCH-7 (UI/UX Pro Max Intelligence):** Implement UI using ui-ux-pro-max guidelines (OLED deep-black palette, Cinzel luxury serif headlines, 44x44px minimum touch targets, 7:1+ contrast ratio, semantic Tailwind tokens).

### UX Design Requirements

- **UX-DR1 (Design Tokens):** Obsidian dark studio theme palette (`#090A0F` background, `#121522` card, `#E11D48` crimson flame, `#FBBF24` gold tier badge) with Tailwind CSS variables.
- **UX-DR2 (Typography):** Display typography in `Cinzel` serif paired with `Geist Sans`/`Inter` for UI body microcopy.
- **UX-DR3 (Age Gate Component):** Radix UI Dialog with `backdrop-blur-xl`, focus trap, and safe external exit redirect.
- **UX-DR4 (Save HUD Dock):** Floating frosted-glass pill dock (`bg-black/75 backdrop-blur-md rounded-full`) with auto-dimming to 25% opacity after 4s idle.
- **UX-DR5 (Save Modals):** Accessible dialogs for save import file selection, error alerts, and destructive storage wipe confirmation.
- **UX-DR6 (Responsive Canvas):** Aspect-ratio locked 16:9 container bounded by `100dvh` and `100dvw` to eliminate mobile browser address bar shifts.
- **UX-DR7 (Paywall Interstitial):** Elevated tier breakdown card with gold lock accent and Patreon brand button.

### FR Coverage Map

* **FR-1:** Epic 1 — Mandatory 21+ Confirmation Modal
* **FR-2:** Epic 1 — Age Confirmation Persistence (14-hour cookie, 50400s)
* **FR-3:** Epic 1 — Responsive Hero & Studio Identity
* **FR-4:** Epic 1 — Project Showcase & Media Cards
* **FR-5:** Epic 1 — Social & Community Hub
* **FR-6:** Epic 2 — Patreon OAuth 2.0 Authorization Flow with PKCE
* **FR-7:** Epic 2 — Tier Access Verification ($5+ Threshold)
* **FR-8:** Epic 2 — Paywall Interstitial & Renewal Prompt
* **FR-9:** Epic 2 — Graceful Session Re-check & Lapsed Handling
* **FR-10:** Epic 3 — Embedded Game Canvas Container (16:9 aspect ratio)
* **FR-11:** Epic 3 — Cross-Platform Input Parity (touch, mouse, keyboard)
* **FR-12:** Epic 3 — Fullscreen Mode Toggle
* **FR-13:** Epic 4 — Origin-Stable Save Persistence (rmmz_save)
* **FR-14:** Epic 4 — Save File Export (.zip Archive)
* **FR-15:** Epic 4 — Save File Import (.zip or .rpgsave)
* **FR-16:** Epic 4 — Safe Storage Reset / Wipe Option
* **FR-17:** Epic 3 — Encrypted Asset Runtime Support
* **FR-18:** Epic 3 — Authenticated Edge Asset Routing (R2 streaming proxy)
* **FR-19:** Epic 1 — Multilanguage Web Shell & Language Selector
* **FR-20:** Epic 5 — Restricted Studio Admin Shell & Anti-Enumeration Guard
* **FR-21:** Epic 5 — Studio Patron Override Management & Lockout Protection

## Epic List

### Epic 1: Studio Presence, Multilanguage Web Shell & 21+ Age Compliance
Visitors can verify their age, select their preferred language, and explore studio branding, game showcases, media, and community links across desktop and mobile.
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-19
**UX-DRs covered:** UX-DR1, UX-DR2, UX-DR3
**Architecture & NFRs:** ARCH-1, ARCH-7, NFR-1, NFR-4

### Epic 2: Patreon Member Authentication & Access Paywall
Patrons can link their Patreon account, verify active campaign membership ($5+ tiers), and access secured portal features with graceful session management and paywall messaging.
**FRs covered:** FR-6, FR-7, FR-8, FR-9
**UX-DRs covered:** UX-DR7
**Architecture & NFRs:** ARCH-5, AD-3, AD-7, NFR-2, NFR-3

### Epic 3: Web Game Client & Protected Asset Streaming
Authorized patrons can launch and play the embedded RPG Maker MZ game in an aspect-ratio-locked, responsive canvas with mobile touch/desktop parity, fed by session-authenticated streaming from the existing private R2 bucket.
**FRs covered:** FR-10, FR-11, FR-12, FR-17, FR-18
**UX-DRs covered:** UX-DR6
**Architecture & NFRs:** ARCH-2, ARCH-4 (existing R2 bucket), AD-2, AD-5, AD-9, NFR-1

### Epic 4: Origin-Stable Save Persistence & Backup HUD
Players can play with confidence knowing their saves persist across game patches, and can export/import all save slots as a bundled .zip archive or reset local storage via a dedicated HUD dock.
**FRs covered:** FR-13, FR-14, FR-15, FR-16
**UX-DRs covered:** UX-DR4, UX-DR5
**Architecture & NFRs:** ARCH-3, ARCH-6, AD-4, AD-6, NFR-4

### Epic 5: Internal Studio Administration & Access Controls
Studio creators and administrators can manage persistent role overrides (admin/comp passes) via an internal, anti-enumerated dashboard with self-lockout safeguards and audit logs.
**FRs covered:** FR-20, FR-21
**Architecture & NFRs:** ARCH-5, AD-8, NFR-2, NFR-4

## Epic 1: Studio Presence, Multilanguage Web Shell & 21+ Age Compliance

Visitors can verify their age, select their preferred language, and explore studio branding, game showcases, media, and community links across desktop and mobile.

### Story 1.1: Project Scaffolding, OpenNext Runtime & Design System Tokens

As a developer,
I want a Next.js 15+ App Router project configured with `@opennextjs/cloudflare`, Tailwind CSS, and custom studio tokens,
So that all subsequent features have a verified build substrate and consistent aesthetic foundations.

**Acceptance Criteria:**

**Given** a clean workspace
**When** running `npm run build` and `wrangler dev`
**Then** the application compiles cleanly with `@opennextjs/cloudflare` targeting Cloudflare Workers
**And** Tailwind CSS theme defines design tokens for `#090A0F` (background), `#121522` (card), `#E11D48` (crimson), and `#FBBF24` (gold)
**And** Google Fonts imports `Cinzel` display serif and `Geist Sans` for typography.

### Story 1.2: Mandatory 21+ Age Gate Modal with Cookie Persistence

As an unverified visitor,
I want a blocking 21+ confirmation modal upon first arriving at the website,
So that I am legally informed of mature content and unconfirmed visitors are kept out.

**Acceptance Criteria:**

**Given** a visitor with no `ropoductions_age_verified` cookie
**When** navigating to any portal page
**Then** a Radix UI `Dialog` modal renders over a blurred backdrop (`backdrop-blur-xl`) with focus trapped
**And** clicking "I am 21 or older" sets a `ropoductions_age_verified=true` cookie (max-age 14 hours / 50400s, locked per owner decision) and smoothly dissolves the modal
**And** clicking "Exit" immediately redirects the browser window to `https://google.com`
**And** returning visitors with a valid cookie bypass the modal automatically.

### Story 1.3: Responsive Studio Showcase, Project Media Cards & Social Hub

As a visitor,
I want an atmospheric studio landing page showcasing Ropoductions' game, screenshots, and community links,
So that I can explore the studio's lore, preview the game, and connect on community channels.

**Acceptance Criteria:**

**Given** a verified 21+ visitor on desktop or mobile
**When** viewing the home page (`/`)
**Then** the hero banner displays key art, studio tagline, and a prominent "Play Now with Patreon" CTA
**And** the project showcase displays the RPG Maker MZ title with character blurbs and clickable screenshots opening in a lightbox modal
**And** external links to Patreon, Discord, and Twitter/X include `rel="noopener noreferrer"` and `target="_blank"`
**And** touch targets on mobile viewports measure at least 44x44px with zero horizontal scroll.

### Story 1.4: Multilanguage Web Shell & Accessible Language Selector

As an international visitor,
I want to select my preferred language from a language switcher,
So that all studio portal text, age gate notices, and microcopy are presented in my native language.

**Acceptance Criteria:**

**Given** a visitor viewing any public page
**When** clicking the language switcher dropdown in the header or footer
**Then** a menu displays supported locales (`EN`, `JA`, `ES`, `RU`, `ZH`, `PL`) with flag emoji icons
**And** selecting a language updates all portal text instantly without requiring a page reload
**And** the selection is stored in a `ropoductions_lang` cookie (valid 365 days)
**And** missing keys in any non-English dictionary fall back gracefully to English without rendering raw translation keys.

---

## Epic 2: Patreon Member Authentication & Access Paywall

Patrons can link their Patreon account, verify active campaign membership ($5+ tiers), and access secured portal features with graceful session management and paywall messaging.

### Story 2.1: Cloudflare D1 Sessions & Overrides Schema Migration

As an engineer,
I want Cloudflare D1 SQLite database tables for managing user sessions and persistent patron overrides,
So that patron tokens and administrative access roles are securely stored server-side with zero client exposure.

**Acceptance Criteria:**

**Given** a Cloudflare D1 database binding named `DB` in `wrangler.toml`
**When** executing `wrangler d1 migrations apply DB`
**Then** the `sessions` table is created (`migrations/0001_initial_sessions.sql`) with columns for `id`, `patron_id`, `email`, `role` (`CHECK(role IN ('admin', 'comp', 'patron'))`, default `'patron'`), `tier_id`, `tier_name`, `pledge_cents`, `encrypted_access_token`, `encrypted_refresh_token`, `token_expires_at_sec`, `expires_at_sec`, `revoked`, `created_at_sec`, and `last_verified_at_sec`
**And** indexes on `sessions` are created for `patron_id`, `role`, `expires_at_sec`, and `revoked`
**And** the `patron_overrides` table is created (`migrations/0002_patron_overrides.sql`) with columns for `patron_id` (PK), `role` (`CHECK(role IN ('admin', 'comp'))`), `notes`, `granted_by`, `created_at_sec`, and `updated_at_sec` with an index on `role`
**And** all SQL queries in the codebase utilize parameterized prepared statements (`db.prepare().bind()`).

### Story 2.2: Patreon OAuth 2.0 PKCE Authorization & Admin Secret Bootstrap

As a patron or studio administrator,
I want to log in using my Patreon account via a secure OAuth 2.0 flow and have initial studio admins auto-enrolled from secrets,
So that the portal identifies my account securely and studio founders gain immediate administrative access without manual database seeding.

**Acceptance Criteria:**

**Given** a user clicking "Login with Patreon"
**When** the request reaches `/api/auth/patreon`
**Then** the route generates a cryptographic state and PKCE code challenge, sets a temporary verification cookie, and redirects to Patreon's authorization endpoint requesting `identity` and `campaigns.members` scopes
**And** upon successful authorization, Patreon redirects back to `/api/auth/callback` with a code and state
**And** the callback handler validates the state token, exchanges the authorization code for access and refresh tokens, and queries `/api/oauth2/v2/identity` to extract `patron_id`
**And** if `patron_id` strictly matches an ID in `env.CREATOR_ADMIN_PATREON_IDS` or `env.INITIAL_ADMIN_PATREON_IDS` (parsed as an exact trimmed `Set`), the handler upserts a record into `patron_overrides` with `role = 'admin'`, `granted_by = 'creator_bootstrap'`, and `notes = 'Creator Admin (Sealed)'`
**And** developers configure `CREATOR_ADMIN_PATREON_IDS` (or alias `INITIAL_ADMIN_PATREON_IDS`) as comma-separated numeric Patreon IDs in `.env.local` (for Next.js dev) or `.dev.vars` (for Cloudflare Wrangler dev), with an automated seeding CLI (`npm run db:seed:admins`) available to sync sealed creator admin IDs directly to D1.
### Story 2.3: Active Tier Verification ($5+ Threshold) & Override Short-Circuit Evaluation

As an authenticated patron or team member,
I want the portal to verify my active pledge or bypass verification via persistent override,
So that backers and team members are recognized and granted immediate access to the game player without unnecessary API latency.

**Acceptance Criteria:**

**Given** an authenticated user in the OAuth callback handler
**When** the handler queries `patron_overrides` for `patron_id`
**Then** if an override record exists (`role IN ('admin', 'comp')`), it skips the Patreon `/campaigns/{campaign_id}/members` API call entirely
**And** it generates a UUIDv4 session ID, stores the record in Cloudflare D1 with `role = override.role`, `tier_id = 'override_' || override.role`, `tier_name = (role === 'admin' ? 'Studio Admin' : 'Complimentary Pass')`, and `pledge_cents = 0`
**And** if no override exists, it queries Patreon API v2 `/campaigns/{campaign_id}/members` and verifies if the user holds an active pledge matching Ork Patron ($5), Ogre Pimp ($10), Elf Sybarite ($15), Horseman Aesthete ($25), or Mind Fucker Avatar ($50)
**And** authorization evaluation is centralized in a pure `isAccessAuthorized(session)` policy function
**And** upon successful authorization, it sets a signed, HTTP-only, `SameSite=Lax`, `Secure` cookie named `ropoductions_session` and redirects directly to `/play`.

### Story 2.4: Paywall Interstitial & Transactional Override Revocation

As an unpledged visitor or revoked tester,
I want a clear, informative paywall card when attempting to access `/play`,
So that I understand subscription requirements and revoked passes are immediately and transactionally invalidated.

**Acceptance Criteria:**

**Given** an unauthenticated visitor or patron without an active $5+ tier navigating to `/play`
**When** middleware or route guards check the session cookie
**Then** the user is redirected to the home page or paywall interstitial displaying the 5 patron tiers and a direct checkout link
**And** if `session.role IN ('admin', 'comp')`, the server performs a point lookup against `patron_overrides`
**And** if the override row has been deleted, it executes a transactional revocation: sets `revoked = 1` in `sessions`, clears `ropoductions_session` (`Max-Age: 0`), and redirects to `/?paywall=revoked`
**And** if a patron's pledge lapses while actively playing in an open tab, the active session is not abruptly terminated, detecting lapsed status on the next navigation or reload.
---

## Epic 3: Web Game Client & Protected Asset Streaming

Authorized patrons can launch and play the embedded RPG Maker MZ game in an aspect-ratio-locked, responsive canvas with mobile touch/desktop parity, fed by session-authenticated streaming from the existing private R2 bucket.

### Story 3.1: Sandboxed Same-Origin Game Iframe & Responsive 16:9 Viewport Container

As an authorized patron,
I want to launch the RPG Maker MZ game in a responsive 16:9 container that fits my screen cleanly,
So that I can play seamlessly on my phone, tablet, or desktop monitor without letterbox distortion.

**Acceptance Criteria:**

**Given** an authorized patron arriving at `/play`
**When** the game page mounts
**Then** it renders a same-origin `<iframe>` pointing to `/engine/index.html`
**And** the container locks to a 16:9 aspect ratio constrained by `100dvh` and `100dvw` to avoid mobile address bar shifts
**And** touch inputs on mobile screens map directly to canvas mouse/touch coordinates without double-tap zoom delay
**And** clicking the "Fullscreen" button triggers the HTML5 Fullscreen API, expanding the game to the physical display boundary.

### Story 3.2: Authenticated R2 Asset Streaming Route & Edge Middleware Protection

As studio creators,
I want game assets streamed exclusively from our pre-created private Cloudflare R2 bucket to authenticated patron sessions,
So that unauthorized visitors and web scrapers cannot rip or hotlink our encrypted game assets.

**Acceptance Criteria:**

**Given** a browser requesting game assets at `/api/game/[...asset]`
**When** the request includes a valid `ropoductions_session` cookie verified in Cloudflare D1
**Then** the route handler streams the requested file from the pre-created Cloudflare R2 bucket (`GAME_ASSETS`)
**And** sets `Cache-Control: private, max-age=86400` so legitimate clients cache encrypted assets locally
**And** any request without a valid session cookie returns `HTTP 403 Forbidden` with zero asset data streamed.

### Story 3.3: Upstream Game Release Ingestion & R2 Sync Workflow (Manual & Remote Trigger)

As a project maintainer or upstream game developer,
I want an on-demand GitHub Action in `ropoductions-web` that can be triggered locally via `workflow_dispatch` or remotely from `salamin888/Final_Orginity` via `repository_dispatch`,
So that verified game assets are automatically validated, injected with our web bridge, and synced to private R2 without manual upload errors, edge isolate overhead, or leaking Cloudflare secrets to upstream.

**Acceptance Criteria:**

**Given** a project maintainer triggering `.github/workflows/sync-game-release.yml` via `workflow_dispatch` OR an upstream developer triggering publication from `salamin888/Final_Orginity` via `repository_dispatch` (event type `game_release_published`)
**When** the workflow executes with input `branch` or `client_payload.branch` (defaulting to `auto`)
**Then** if `auto`, the runner queries `salamin888/Final_Orginity:main`'s `tools/release.json` to extract the active `base` version string and target branch
**And** shallow-clones the target release branch using a read-only upstream GitHub PAT (`UPSTREAM_READ_TOKEN`)
**And** validates file structure (`Final Orginity/data/System.json`, `package.json`, `index.html`)
**And** injects `Ropoductions_WebBridge.js` into `js/plugins/` and registers the plugin in `js/plugins.js`
**And** transfers static media assets (`audio/`, `img/`, `effects/`, `movies/`, `data/`) directly to private R2 (`GAME_ASSETS`) using AWS CLI S3 sync (`--endpoint-url`)
**And** syncs the lightweight HTML5 engine shell (`index.html`, `js/`, `css/`, `fonts/`) additively to private R2 (`GAME_ASSETS`) under the `engine/` prefix, streamed same-origin at `/engine/*`; the runner never commits to `ropoductions-web`
**And** Cloudflare R2 credentials (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_ACCOUNT_ID`) reside strictly within `ropoductions-web`, with zero secrets exposed to the upstream repository.
---

## Epic 4: Origin-Stable Save Persistence & Backup HUD

Players can play with confidence knowing their saves persist across game patches, and can export/import all save slots as a bundled .zip archive or reset local storage via a dedicated HUD dock.

### Story 4.1: In-Game PostMessage Web Bridge (`Ropoductions_WebBridge.js`) with Origin Locking

As a game player,
I want an engine plugin that bridges browser storage to the web shell securely,
So that my save files can be backed up and restored without exposing storage keys to cross-origin tampering.

**Acceptance Criteria:**

**Given** the RPG Maker MZ runtime initialized inside the iframe
**When** the `Ropoductions_WebBridge.js` plugin loads
**Then** it registers a message listener strictly checking `event.origin === window.location.origin`
**And** upon receiving `{ type: 'ROPODUCTIONS_GET_SAVES' }`, it iterates populated save slots via `StorageManager`, gathers their contents, and posts `{ type: 'ROPODUCTIONS_SAVES_DATA', payload }` back to the parent window
**And** upon receiving `{ type: 'ROPODUCTIONS_SET_SAVES', payload }`, it validates payload structure, writes to `StorageManager`, and triggers `DataManager.loadGlobalInfo()` to refresh in-game title and load screens immediately without page refresh.

### Story 4.2: Floating Frosted-Glass Save HUD Dock with Auto-Dimming

As a player,
I want an unobtrusive floating Save HUD dock at the bottom of the game screen,
So that I can access save management controls easily without distracting from gameplay.

**Acceptance Criteria:**

**Given** an active gameplay session on `/play`
**When** the user is actively interacting with the game canvas
**Then** the floating Save HUD dock (`bg-black/75 backdrop-blur-md rounded-full`) smoothly dims to `opacity: 0.25` after 4 seconds of idle time
**And** hovering or tapping near the dock restores `opacity: 1.0` instantly
**And** the dock displays clean Lucide SVG icons and labels for "Export (.zip)", "Import", "Fullscreen", and "Reset"
**And** all touch targets measure at least 44x44px.

### Story 4.3: Client-Side .zip Save Export & Compression via JSZip

As a player,
I want to download all my save slots bundled into a single .zip archive,
So that I have a portable, complete backup of my entire game progress.

**Acceptance Criteria:**

**Given** a player clicking "Export (.zip)" on the Save HUD
**When** the Web Shell receives the save slots from the engine bridge
**Then** it utilizes `jszip` client-side to package all populated save files (`file1.rpgsave` ... `file20.rpgsave`, `global.rpgsave`, `config.rpgsave`) into a single archive
**And** triggers an immediate browser download named `ropoductions_saves_{YYYY-MM-DD}.zip`
**And** displays a temporary checkmark indicator on the HUD confirming the download.

### Story 4.4: Save Import Validation Dialog & Safe Storage Reset Modal

As a player,
I want to upload a .zip archive or .rpgsave file to restore my saves, or safely reset my storage if needed,
So that I can migrate progress between browsers or start completely fresh with safety prompts.

**Acceptance Criteria:**

**Given** a player clicking "Import" on the Save HUD
**When** selecting a valid `.zip` archive or `.rpgsave` file
**Then** the dialog unzips and validates save headers, sends the slots through the postMessage bridge, and refreshes the in-game load menu
**And** selecting an invalid or corrupt file displays a clear error alert: "Invalid save file format. Please upload a valid .zip archive or .rpgsave file."
**And** clicking "Reset" displays a destructive confirmation dialog with a prominent warning before purging local game storage.

---

## Epic 5: Internal Studio Administration & Access Controls

Studio creators and administrators can manage persistent role overrides (admin/comp passes) via an internal, anti-enumerated dashboard with self-lockout safeguards and audit logs.

### Story 5.1: Restricted Admin Layout & Authentication Guard

As a studio administrator,
I want a secure `/admin` route shell that blocks non-admin users,
So that internal controls are inaccessible to regular patrons and visitors.

**Acceptance Criteria:**

**Given** an unauthorized visitor or regular patron navigating to `/admin` or any `/admin/*` subroute
**When** middleware and the `(admin)/layout.tsx` Server Component evaluate session state
**Then** if `session.role !== 'admin'`, the request returns a standard Next.js `notFound()` (HTTP 404) to prevent route enumeration
**And** if `session.role === 'admin'`, the page renders the isolated `(admin)` layout with dark studio theme (`#090A0F` background, `#121522` card surface)
**And** displays an admin status badge (`#FBBF24` Gold) and a direct navigation link back to `/play`.

### Story 5.2: Patron Override Directory & Creation Interface

As a studio administrator,
I want a visual dashboard to grant `'admin'` or `'comp'` passes by Patreon ID,
So that I can grant playtest and team access without asking developers to run manual SQL commands.

**Acceptance Criteria:**

**Given** an authorized administrator on `/admin/overrides`
**When** the page loads
**Then** it displays an active overrides table showing Patreon ID, Role badge (`#FBBF24` for Admin, `#38BDF8` for Comp), Admin Tier (`#FBBF24` "Creator Admin (Sealed)" lock badge for `granted_by = 'creator_bootstrap'`, or `#38BDF8` "Panel Admin" for runtime grants), Notes, Granted By, and Date Added
**And** the Two-Tier Admin Model is strictly enforced:
  1. **Creator Admins (`granted_by = 'creator_bootstrap'`):** Permanently sealed founding creator accounts (configured via `CREATOR_ADMIN_PATREON_IDS`). In the admin panel, Creator Admin rows are immutable: form updates to their role, notes, or status are strictly disabled.
  2. **Panel-Assigned Admins (`granted_by = session.patron_id`):** Runtime administrators and complimentary playtesters created or managed by studio staff via the dashboard form.
**And** a registration form with inputs for Patreon ID (text), Role (dropdown select), and Notes (optional text) allows creating new overrides or updating existing panel-assigned records
**And** submitting the form validates the Patreon ID against the numeric regex `^\d{1,20}$` (rejecting non-digits and whitespace), rejecting any attempt to reassign or modify a sealed Creator Admin
**And** executes a Next.js Server Action inserting or updating `patron_overrides` with `granted_by = session.patron_id` and refreshes the table via `revalidatePath('/admin/overrides')`
**And** all inputs and interactive buttons adhere to the 44x44px minimum touch target size.

### Story 5.3: Override Revocation & Self-Lockout Prevention

As a studio administrator,
I want to revoke existing access passes with confirmation and lockout protection,
So that I can easily manage access while preventing accidental removal of all administrators.

**Acceptance Criteria:**

**Given** an authorized administrator viewing the overrides table
**When** reviewing an override entry
**Then** each panel-assigned row provides a "Revoke" button triggering an accessible Radix Dialog confirmation modal
**And** the modal displays a clear warning and a `#E11D48` crimson confirmation button
**And** for Creator Admins (`granted_by = 'creator_bootstrap'`): NOBODY can delete, revoke, or modify these records; the Revoke action is completely disabled and omitted in the UI with a permanent sealed lock indicator, and the server-side revocation action strictly rejects any deletion attempt with HTTP 403 Forbidden
**And** for panel-assigned admins: if the target entry is the administrator's own ID and `COUNT(*) FROM patron_overrides WHERE role = 'admin'` is 1, the Revoke action is disabled with the warning "Cannot revoke the sole remaining administrator"
**And** upon confirming a valid revocation of a panel-assigned pass, a Server Action deletes the row from `patron_overrides` and revalidates the path
**And** any active session belonging to the revoked user is invalidated on their next navigation per Story 2.4.

### Story 5.4: Override Integrity Hardening

As a studio owner and as added admins,
I want privilege changes to be attributable, caller-fresh, and founder-proof,
So that the admin panel's integrity survives honest mistakes and session compromise alike.

**Acceptance Criteria:**

**Given** the epic 5 retrospective findings F2 (owner-corrected), F3, F6, F12, F13, F15 and the owner decisions of 2026-09-19
**When** this story completes
**Then** a regression test proves a founder session reaches `/admin` with zero override rows and zero other admins (env bootstrap path)
**And** `deletePatronOverrideGuarded` no longer blocks the last added admin from self-revoking (founder-preservation, not mutable-pool preservation, is the invariant — see Amendment A-2026-09-19-01), and no sole-admin guard is added to `upsertPatronOverride`
**And** updating an existing override preserves the original `granted_by` (set on INSERT only), with `tests/admin-overrides.test.ts:379` flipped to a preserved-grantor assertion written red first
**And** the upsert path re-verifies the caller's admin override at mutation time, symmetric with the revoke path
**And** patron IDs match `/^[1-9]\d{0,19}$/` from one shared constant (server + client), notes truncate code-point-safely
**And** the dead `/admin` proxy branch is removed (or matcher-extended and documented), `config.matcher` is pinned by test, and spec-5-1's "middleware AND layout" wording is reconciled to the layout-authority reality
**And** dead code is gone: zero-caller `deletePatronOverride`, dead `admin.ts` token exports (verify = caller grep), duplicated `createMockD1` shared into `tests/helpers/`, `play/page.tsx` inline quote-strip replaced by `unquoteCookieValue`
**And** the full admin panel UI is localized across all six locales (owner decision 2026-09-19: full localization, superseding the retro room's safety-copy-only line)
**And** `/admin` has e2e coverage (unauthorized 404 without redirect leak; seeded-admin render) and the exported server-action wrappers are executed by at least one test each

### Story 5.5: Grant/Revoke Audit Trail

As a studio owner,
I want an append-only trail of who granted, changed, or revoked which pass and when,
So that founder promises are kept, admin-tier self-amplification is observable, and any future second-person approval has a substrate.

**Acceptance Criteria:**

**Given** the epic title's promised "audit logs" dropped without record (retro finding F9)
**When** this story completes
**Then** an append-only `override_audit` table exists (migration `0003`) with actor, target, action, before/after role, and timestamp
**And** every upsert, update, and revoke (including sealed-bootstrap events) writes exactly one trail row within the same D1 interaction (AD-8 parameterized)
**And** `/admin/overrides` renders the trail (newest first, bounded pagination)
**And** 4-eyes (second-person approval of admin grants) is recorded as a formal v1 non-goal in deferred-work.md with the reopen trigger "more than a handful of operators hold keys"

---

## Amendments

### A-2026-09-19-01 — Story 5.3 sole-admin clause reinterpreted (owner decision)

`epics.md` Story 5.3 ("Cannot revoke the sole remaining administrator", line 421) protected the wrong invariant for this studio. Owner decision 2026-09-19, evidence `_bmad-output/implementation-artifacts/epic-5-retro-2026-09-19.md` (findings F2/F5, Team Discussion sign-off + owner correction): the protected invariant is **founder access**, which is guaranteed by `CREATOR_ADMIN_PATREON_IDS` env bootstrap independent of `patron_overrides` row state. Consequences: (a) sealed founder rows counting toward "admin exists" is no longer a live question; (b) the last added admin MAY revoke or self-demote — added-admin stranding is an accepted outcome; (c) Story 5.4 relaxes the shipped DELETE-path guard and adds founder-preservation regression coverage instead of guarding the upsert path. The 2026-09-15 text stands above as originally approved; this note is the dated amendment of record.
