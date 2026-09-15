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
- **FR-2:** Age Confirmation Persistence storing verification status in a 30-day persistent cookie to avoid repeated prompting.
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
- **FR-19:** Multilanguage Web Shell & Language Selector providing an accessible language switcher supporting multiple locales (English default, plus e.g. Japanese, Spanish, Russian, Chinese) persisting locale selection in a 365-day cookie.

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
* **FR-2:** Epic 1 — Age Confirmation Persistence (30-day cookie)
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
**Architecture & NFRs:** ARCH-2, ARCH-4 (existing R2 bucket), AD-2, AD-5, NFR-1

### Epic 4: Origin-Stable Save Persistence & Backup HUD
Players can play with confidence knowing their saves persist across game patches, and can export/import all save slots as a bundled .zip archive or reset local storage via a dedicated HUD dock.
**FRs covered:** FR-13, FR-14, FR-15, FR-16
**UX-DRs covered:** UX-DR4, UX-DR5
**Architecture & NFRs:** ARCH-3, ARCH-6, AD-4, AD-6, NFR-4

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
**And** clicking "I am 21 or older" sets a `ropoductions_age_verified=true` cookie (max-age 30 days) and smoothly dissolves the modal
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
**Then** a menu displays supported locales (`EN`, `JA`, `ES`, `RU`, `ZH`) with Lucide globe SVG icons
**And** selecting a language updates all portal text instantly without requiring a page reload
**And** the selection is stored in a `ropoductions_lang` cookie (valid 365 days)
**And** missing keys in any non-English dictionary fall back gracefully to English without rendering raw translation keys.

---

## Epic 2: Patreon Member Authentication & Access Paywall

Patrons can link their Patreon account, verify active campaign membership ($5+ tiers), and access secured portal features with graceful session management and paywall messaging.

### Story 2.1: Cloudflare D1 Sessions Database & Schema Migration

As an engineer,
I want a Cloudflare D1 SQLite database table for managing user sessions and OAuth tokens,
So that patron tokens are securely stored server-side with zero client exposure.

**Acceptance Criteria:**

**Given** a Cloudflare D1 database binding named `DB` in `wrangler.toml`
**When** executing `wrangler d1 migrations apply DB`
**Then** the `sessions` table is created with columns for `id`, `patron_id`, `email`, `tier_id`, `tier_name`, `pledge_cents`, `access_token`, `refresh_token`, `token_expires_at`, `created_at`, and `last_verified_at`
**And** an index on `patron_id` is created for rapid lookup
**And** all SQL queries in the codebase utilize parameterized prepared statements (`db.prepare().bind()`).

### Story 2.2: Patreon OAuth 2.0 PKCE Authorization & Callback Route Handlers

As a patron,
I want to log in using my Patreon account via a secure OAuth 2.0 flow,
So that the portal can identify my account without requiring a separate password.

**Acceptance Criteria:**

**Given** a user clicking "Login with Patreon"
**When** the request reaches `/api/auth/patreon`
**Then** the route generates a cryptographic state and PKCE code challenge, sets a temporary verification cookie, and redirects to Patreon's authorization endpoint requesting `identity` and `campaigns.members` scopes
**And** upon successful authorization, Patreon redirects back to `/api/auth/callback` with a code and state
**And** the callback handler validates the state token, exchanges the authorization code for access and refresh tokens, and handles errors with user-friendly error banners.

### Story 2.3: Active Tier Verification ($5+ Threshold) & Secure Session Cookie Issuance

As an authenticated patron,
I want the portal to verify my active pledge against Ropoductions' $5+ tiers and issue my session,
So that I am recognized as an active backer and granted access to the game player.

**Acceptance Criteria:**

**Given** valid tokens received in the OAuth callback
**When** the server queries the Patreon API v2 `/campaigns/{campaign_id}/members` endpoint
**Then** it verifies if the user holds an active pledge matching Ork Patron ($5), Ogre Pimp ($10), Elf Sybarite ($15), Horseman Aesthete ($25), or Mind Fucker Avatar ($50)
**And** if eligible, it generates a UUIDv4 session ID, stores the record in Cloudflare D1, and sets a signed, HTTP-only, `SameSite=Lax`, `Secure` cookie named `ropoductions_session`
**And** redirects the patron directly to `/play`.

### Story 2.4: Paywall Interstitial & Graceful Navigation Session Verification

As an unpledged or lapsed visitor,
I want a clear, informative paywall card when attempting to access `/play`,
So that I understand subscription requirements and can easily pledge or renew.

**Acceptance Criteria:**

**Given** an unauthenticated visitor or patron without an active $5+ tier navigating to `/play`
**When** middleware checks the session cookie
**Then** the user is redirected to the home page or paywall interstitial displaying the 5 patron tiers and a direct checkout link
**And** if a patron's pledge lapses while actively playing in an open tab, the active session is not abruptly terminated
**And** on the user's next navigation or page reload, the lapsed status is detected and redirected with a polite renewal notice.

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
**And** upon receiving `{ type: 'ROPODUCTIONS_SET_SAVES', payload }`, it validates payload structure, writes to `StorageManager`, and signals the engine to refresh the save index.

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
