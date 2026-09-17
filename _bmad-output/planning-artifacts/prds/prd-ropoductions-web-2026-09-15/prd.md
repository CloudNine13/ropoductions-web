---
title: "PRD: Ropoductions Web Portal & Patron Game Client"
status: final
created: 2026-09-15
updated: 2026-09-15
---

# PRD: Ropoductions Web Portal & Patron Game Client

## 0. Document Purpose

This Product Requirements Document defines the functional, experiential, and non-functional requirements for the **Ropoductions Web Portal & Patron Game Client (v1)**. It is authored for the engineering, architecture, and UX teams (specifically Architect Winston and UX Designer Sally) to establish unambiguous boundaries, user journeys, globally numbered functional requirements, and testable acceptance criteria before technical implementation.

Technical implementation alternatives (such as Next.js vs. Astro and Cloudflare vs. Node VPS) are intentionally abstracted into `addendum.md` to keep this document strictly focused on product behavior, customer value, and system invariants.

---

## 1. Vision

Ropoductions is an independent adult game studio developing narrative-rich, interactive gaming experiences. The studio's commercial engine relies on subscription patronage through Patreon. Today, distributing adult game builds via static file-sharing archives (.zip) creates significant friction: players on mobile or shared devices struggle with manual extraction, save files frequently break or get wiped across game patches, and distributed download links are quickly leaked to public piracy aggregators.

The **Ropoductions Web Portal** transforms this workflow into a premier, web-first studio destination. Drawing aesthetic inspiration from leading gaming portals like Bungie, Riot Games, and Annapurna Interactive, the portal pairs an art-forward studio showcase with instant, zero-installation browser gameplay for active patrons. By integrating Patreon OAuth 2.0, the portal seamlessly validates subscriber tiers ($5 to $50) to unlock an embedded, responsive RPG Maker MZ game client. With origin-stable local save persistence, client-side `.rpgsave` export/import controls, and session-authenticated asset delivery, Ropoductions provides its patrons with instant gratification and peace of mind while securing the studio's intellectual property.

---

## 2. Target User

### 2.1 Jobs To Be Done

* **Functional JTBD:** "When Ropoductions releases a new game update, I want to play immediately in my web browser without downloading or unzipping multi-megabyte archives, so that I can experience new content with zero friction."
* **Reliability JTBD:** "When the game receives a patch or new chapter, I want my previous save progress to remain intact automatically, so that I never lose hours of invested gameplay."
* **Portability JTBD:** "When I switch devices or want a local backup, I want to export and import my raw `.rpgsave` files easily, so that I maintain full ownership of my progress."
* **Discretion JTBD:** "When I play adult indie games, I want to play discreetly within a browser session without leaving executable game folders or unencrypted assets on my local machine."
* **Commercial JTBD (Creator):** "As studio founders, we want to ensure only active, paying patrons can access playable web builds and raw assets, so that our Patreon subscription revenue is protected."

### 2.2 Non-Users (v1)

* **Casual Minor Visitors:** Anyone under 21 years old is strictly barred from accessing portal content.
* **Non-Paying Casual Players:** Visitors unwilling to pledge to Ropoductions' Patreon ($5 minimum) will not have access to the playable web game.
* **Offline-Only Desktop Players:** Players who strictly demand standalone offline desktop installers (.exe) without internet connectivity (addressed via existing external archive links, not the web portal).

### 2.3 Key User Journeys

#### UJ-1. Alex (Active Patron) Plays the New Patch on Desktop
* **Persona + Context:** Alex, a $15 "Elf Sybarite" Patreon subscriber for 6 months, sees a Patreon notification that Ropoductions dropped Version 1.2.
* **Entry State:** Unauthenticated browser on desktop Chrome.
* **Path:**
  1. Alex lands on `ropoductions.com` and confirms the 21+ age verification modal.
  2. Alex clicks "Login with Patreon" on the hero banner.
  3. The browser redirects to Patreon OAuth; Alex authorizes access and returns to the portal.
  4. The portal validates Alex's active $15 tier and redirects immediately to `/play`.
  5. The RPG Maker MZ title screen loads in under 15 seconds with Alex's existing Chapter 2 save file already present in the "Continue" menu.
* **Climax:** Alex clicks "Continue" and immediately resumes their game with all progress, inventory, and choices preserved from Version 1.1.
* **Resolution:** Alex plays for 45 minutes, saves at an in-game checkpoint, uses the Web HUD to download a backup `.rpgsave` to their drive, and closes the tab.
* **Edge Case:** If the game developer introduced a new global variable in Version 1.2, in-engine fallback plugins initialize it without throwing a script error.

#### UJ-2. Marcus (Prospective Supporter) Discovers the Studio
* **Persona + Context:** Marcus discovers Ropoductions through social media art and visits the web portal to learn more.
* **Entry State:** Unauthenticated, non-subscriber on desktop.
* **Path:**
  1. Marcus passes the 21+ age gate.
  2. Marcus explores the high-polish landing page: browses character art, reads the studio lore, and watches game teaser clips.
  3. Marcus clicks "Play Game" and is greeted with an informative Patreon Paywall card detailing the accessible tiers ($5 Ork Patron to $50 Mind Fucker Avatar).
  4. Marcus clicks "Pledge on Patreon," subscribes at the $5 Ork Patron tier, and returns to the site.
* **Climax:** Marcus logs in via Patreon OAuth; the portal immediately verifies the new pledge and grants instant access to the Web Player.
* **Resolution:** Marcus plays the prologue directly in the browser and becomes an ongoing subscriber.

#### UJ-3. Elena (Mobile Patron) Plays on a Tablet
* **Persona + Context:** Elena is a $25 "Horseman Aesthete" patron who wants to relax on the couch with an iPad.
* **Entry State:** Mobile Safari on iPad, already authenticated from a previous session.
* **Path:**
  1. Elena navigates to the portal; the persistent session cookie keeps her logged in.
  2. Elena taps "Continue Playing"; the portal loads `/play`.
  3. The game container automatically locks into a responsive 16:9 aspect ratio fitting the tablet screen without browser scrollbar interference.
  4. Elena taps the Web HUD "Fullscreen" icon to enter an immersive touch experience.
* **Climax:** Touch events register cleanly on the canvas; movement and dialog progression respond smoothly to taps.
* **Resolution:** Elena plays, saves her game to local browser storage, and exits fullscreen.

#### UJ-4. Dave (Lapsed Patron) Attempts to Access Restricted Content
* **Persona + Context:** Dave was a $5 patron whose payment card expired on the 1st of the month.
* **Entry State:** Returning visitor with an expired Patreon pledge token.
* **Path:**
  1. Dave visits `/play` directly via bookmark.
  2. The portal checks Dave's Patreon pledge status during route middleware execution.
  3. The check identifies the pledge as inactive/lapsed.
* **Climax:** Dave is not shown an abrasive error; instead, he is redirected to the home landing page with a polite banner: *"Your Patreon subscription is currently paused or inactive. Please update your pledge on Patreon to resume playing."*
* **Resolution:** Dave clicks the renewal link, updates his payment details on Patreon, and is redirected back to resume playing.

---

## 3. Glossary

* **Patron:** An end-user who has linked their Patreon account and holds an active monthly pledge in one of the 5 eligible studio tiers.
* **Age Gate:** A mandatory, blocking modal dialog requiring visitors to confirm they are 21 years of age or older before viewing portal media or launching games.
* **Web Shell:** The outer web application wrapper (built with modern reactive web technologies) that houses navigation, user authentication status, age compliance, and the game container.
* **Web Player:** The embedded iframe or HTML5 canvas container running the compiled RPG Maker MZ runtime within the Web Shell.
* **Save HUD:** The dedicated UI control bar positioned adjacent or overlaid on the Web Player providing save file operations (Export, Import, Reset).
* **`.rpgsave`:** The binary/JSON file format generated by RPG Maker MZ representing an in-game save slot state.
* **Origin Invariant:** The non-negotiable architectural rule that web game builds must always be deployed and served under the exact same domain origin (`protocol://domain:port`) to maintain browser storage access (`IndexedDB`/`LocalStorage`).
* **Game Patch:** A newly deployed build of the RPG Maker MZ game containing bug fixes, balance changes, or new story content.
* **Lapsed Pledge:** A previously active Patreon membership that has expired, paused, or failed payment collection.

---

## 4. Features

### 4.1 Age Verification & Compliance

**Description:** To ensure legal compliance with adult gaming regulations and prevent domain blacklisting by payment processors and content delivery networks, all unverified visitors must pass a blocking 21+ age confirmation modal upon arrival. Realizes UJ-1, UJ-2.

#### FR-1: Mandatory 21+ Confirmation Modal
* **Actor:** Unverified Visitor.
* **Capability:** The system displays a high-contrast, blocking modal on initial site entry stating that the website hosts adult interactive content and requires confirmation of being 21 years of age or older.
* **Consequences (testable):**
  - Underlying page content, interactive buttons, and media streams are blurred and unclickable until the visitor clicks "I am 21 or older".
  - If the visitor clicks "Exit / Under 21", the browser redirects to a safe external site (e.g., Google or standard game ratings site).
* **Out of Scope:** Government ID upload or third-party identity verification APIs (self-attestation is sufficient for v1).

#### FR-2: Age Confirmation Persistence
* **Actor:** Verified Visitor.
* **Capability:** The system stores the confirmed age status in a secure client cookie (`ropoductions_age_verified=true`, max-age 5 days / 432,000 seconds, locked per project owner decision) so that returning visitors are not repeatedly prompted within a 5-day window.
* **Consequences (testable):**
  - Refreshing or reopening the browser within 5 days bypasses the age modal.
  - Clearing browser cookies/storage resets the gate, prompting re-confirmation on the next visit.

---

### 4.2 Studio Landing & Showcase

**Description:** Serves as the primary public showcase for Ropoductions. Reflects the prestige, artistic atmosphere, and quality of the studio, drawing visual cues from Bungie and Annapurna Interactive. Realizes UJ-2.

#### FR-3: Responsive Hero & Studio Identity
* **Actor:** Visitor / Patron.
* **Capability:** Displays studio branding, high-resolution key art banners, studio lore, and prominent calls-to-action ("Play Now with Patreon" / "Enter Game").
* **Consequences (testable):**
  - Layout adapts fluidly between mobile (320px+), tablet, and desktop (4K) viewports with zero horizontal overflow.
  - Hero media supports responsive image scaling to ensure fast initial page load (< 2.0s on standard 4G connections).

#### FR-4: Project Showcase & Media Cards
* **Actor:** Visitor.
* **Capability:** Showcases Ropoductions' current RPG Maker MZ title with character profiles, screenshots, story teasers, and future project announcements (e.g., upcoming Godot game teaser).
* **Consequences (testable):**
  - Screenshots render in a responsive lightbox modal upon click/tap.
  - Non-playable catalog items (e.g., Godot titles) clearly display a "Coming Soon" or "Desktop Download" status badge.

#### FR-5: Social & Community Hub
* **Actor:** Visitor.
* **Capability:** Provides verified links to the studio's external community channels (Patreon, Discord, Twitter/X).
* **Consequences (testable):**
  - Links open safely in a new browser tab with `rel="noopener noreferrer"`.

---

### 4.3 Patreon OAuth Authentication & Tier Gating

**Description:** Manages identity, token exchange, and tier-based access control using the official Patreon API v2. Realizes UJ-1, UJ-2, UJ-4.

#### FR-6: Patreon OAuth 2.0 Authorization Flow
* **Actor:** Visitor with Patreon account.
* **Capability:** The system initiates an OAuth 2.0 authorization code flow with PKCE, requesting the `identity` and `campaigns.members` scopes from Patreon.
* **Consequences (testable):**
  - Clicking "Login with Patreon" redirects to `https://www.patreon.com/oauth2/authorize`.
  - After user authorization, Patreon redirects back to the portal's `/api/auth/callback` handler with a valid authorization code.
  - Server securely exchanges code for encrypted access and refresh tokens.

#### FR-7: Tier Access Verification ($5+ Threshold)
* **Actor:** Authenticated User.
* **Capability:** The system queries Patreon API v2 to retrieve the user's active pledge amount and tier title for the Ropoductions campaign, comparing against the approved tier list:
  1. Ork Patron ($5.00)
  2. Ogre Pimp ($10.00)
  3. Elf Sybarite ($15.00)
  4. Horseman Aesthete ($25.00)
  5. Mind Fucker Avatar ($50.00)
* **Consequences (testable):**
  - If the user holds any of the 5 active tiers, the system issues an encrypted HTTP-only session cookie granting access to `/play`.
  - If the user has no active pledge or pledges below $5, access to `/play` is denied.

#### FR-8: Paywall Interstitial & Renewal Prompt
* **Actor:** Authenticated non-patron or unauthenticated visitor attempting to access `/play`.
* **Capability:** Renders an informative paywall card explaining that web game access requires an active Patreon subscription of $5 or more, displaying tier benefits and a direct checkout link. Realizes UJ-2, UJ-4.
* **Consequences (testable):**
  - Direct navigation to `/play` without an eligible session immediately redirects to the paywall view with an informative banner.

#### FR-9: Graceful Session Re-check & Lapsed Handling
* **Actor:** Patron whose subscription status changes while using the portal.
* **Capability:** The system performs session re-verification on route changes and portal interactions, but **never abruptly interrupts active gameplay mid-session**. Realizes UJ-4.
* **Consequences (testable):**
  - If a patron's pledge lapses while playing, gameplay continues uninterrupted in the current tab.
  - When the user navigates away or refreshes the page, the system re-validates the token; if lapsed, it redirects to the landing page with a polite renewal prompt.

---

### 4.4 In-Browser Game Client & Responsive Viewport

**Description:** Hosts and executes the compiled RPG Maker MZ HTML5/WebGL game build within a secured, responsive container. Realizes UJ-1, UJ-3.

#### FR-10: Embedded Game Canvas Container
* **Actor:** Authorized Patron.
* **Capability:** Renders the RPG Maker MZ HTML5 canvas within a dedicated `/play` web route, maintaining an aspect-ratio lock (16:9 default) that scales cleanly to fit available viewport dimensions.
* **Consequences (testable):**
  - Canvas scales dynamically without visual letterboxing distortion or clipping across desktop monitors and mobile viewports.
  - Game audio and graphics initialize correctly upon the user's first canvas interaction.

#### FR-11: Cross-Platform Input Parity
* **Actor:** Desktop or Mobile Player.
* **Capability:** Supports full input parity across mouse clicks, keyboard controls (Arrow keys / WASD / Enter / Esc), and mobile touch events. Realizes UJ-3.
* **Consequences (testable):**
  - Tapping on mobile screens maps seamlessly to RPG Maker MZ touch/mouse coordinates for player movement, dialog progression, and menu selections.

#### FR-12: Fullscreen Mode Toggle
* **Actor:** Player.
* **Capability:** Provides a fullscreen toggle button in the Web Shell HUD that expands the game canvas to native device fullscreen mode via the HTML5 Fullscreen API.
* **Consequences (testable):**
  - Tapping/clicking fullscreen expands the canvas to fill the entire physical display, hiding browser address bars on mobile devices.
  - Pressing `Esc` or tapping the HUD exit button cleanly restores standard portal layout.

---

### 4.5 Save Persistence, Patch Invariant & Save HUD

**Description:** Guarantees that player save files survive game patches and provides manual file export/import controls. Realizes UJ-1.

#### FR-13: Origin-Stable Save Persistence
* **Actor:** Player.
* **Capability:** The Web Shell guarantees that the game player is always hosted on the identical web origin (`https://portal.ropoductions.com`), ensuring browser IndexedDB (`rmmz_save`) and LocalStorage namespaces remain constant.
* **Consequences (testable):**
  - Deploying a new game version (e.g. updating asset bundles or engine scripts) retains 100% of existing save slots in browser storage.
  - The in-game "Continue" option remains active and clickable immediately following a game patch deployment.

#### FR-14: Save File Export (`.zip` Archive)
* **Actor:** Player.
* **Capability:** The Web HUD provides an "Export Save" button that serializes all active save slots (slots 1–20) and global engine config from browser storage, packaging and downloading them as a `.zip` archive.
* **Consequences (testable):**
  - Clicking "Export Save" prompts a file download named `ropoductions_saves_{timestamp}.zip`.
  - The exported zip archive contains valid, uncorrupted RPG Maker MZ save payload files for all populated save slots.

#### FR-15: Save File Import (`.zip` or `.rpgsave`)
* **Actor:** Player.
* **Capability:** The Web HUD provides an "Import Save" button with a file selector allowing players to upload an external `.zip` archive or `.rpgsave` file into browser storage.
* **Consequences (testable):**
  - Selecting a valid `.zip` or `.rpgsave` file parses and writes the save data into the target browser storage slots.
  - The Web Player triggers a safe reload or storage refresh, making the imported saves visible in the game's "Load Game" menu.
  - Uploading an invalid or corrupted file displays a clear error modal: *"Invalid save file format. Please upload a valid .zip archive or .rpgsave file."*
#### FR-16: Safe Storage Reset / Wipe Option
* **Actor:** Player / Tester.
* **Capability:** The Web HUD provides a "Reset Save Data" option with a two-step confirmation dialog to purge game storage keys in case of corrupted user experiments.
* **Consequences (testable):**
  - Clicking "Reset" prompts: *"Are you sure? This will delete all local browser save data for this game. Consider exporting a backup first."*
  - Confirming purges the game's storage keys and reloads the canvas to a clean initial state.

---

### 4.6 Encrypted Asset Protection & Edge Delivery

**Description:** Prevents unauthorized scraping, asset ripping, and hotlinking of Ropoductions' game assets.

#### FR-17: Encrypted Asset Runtime Support
* **Actor:** Game Engine / Web Player.
* **Capability:** The game engine loads and decrypts encrypted static game assets (images, audio, JSON data) in memory during execution.
* **Consequences (testable):**
  - Static game assets stored on the backend/storage layer are encrypted (via RPG Maker MZ native encryption or obfuscation) and cannot be viewed directly as plain PNG/OGG files without the runtime key.

#### FR-18: Authenticated Edge Asset Routing
* **Actor:** Browser client requesting game assets.
* **Capability:** The server/edge middleware validates the user's active session cookie on every request to game data endpoints (`/game/data/*`, `/game/img/*`, `/game/audio/*`).
* **Consequences (testable):**
  - Unauthenticated requests or requests with invalid session tokens return `HTTP 403 Forbidden`.
  - Direct URL hotlinking from external websites is blocked.


### 4.7 Multilanguage Web Shell & Localization

**Description:** Supports international patrons with a lightweight, edge-compatible localization system.

#### FR-19: Multilanguage Web Shell & Language Selector
* **Actor:** Visitor / Player.
* **Capability:** The Web Shell provides an accessible language selector (header and footer) supporting multiple locales (English default, plus initial languages e.g. Japanese, Spanish, Russian, Chinese, Polish), dynamically localizing the age gate, landing page showcase, Patreon paywall card, and Save HUD controls.
* **Consequences (testable):**
  - Selecting a language updates all portal text instantly without requiring a full page refresh.
  - Selected locale is stored in a `ropoductions_lang` cookie and persists across sessions.
  - Fallback mechanism defaults gracefully to English for any missing translation keys.
---

## 5. Non-Goals (Explicit)

* **Cloud Save Synchronization (v1):** Real-time cloud save sync to centralized user databases is out of scope for v1 (deferred to v3-v5). Local browser storage + `.rpgsave` export/import is the official v1 solution.
* **Tier-Differentiated In-Game Perks (v1):** In v1, all eligible tiers ($5 through $50) receive identical access. Beta branches, cheat menus, and tier-specific artbooks are deferred to v2+.
* **In-Browser Playable Client for Godot Games:** Future Godot games developed by Ropoductions will be cataloged on the site for desktop download only; web assembly streaming for Godot is explicitly out of scope for v1.
* **Native Community Forums & Comment Boards:** Community discussion remains hosted on the studio's official Patreon and Discord platforms.
* **Multiple Payment Processors:** Patreon remains the sole payment and subscription source of truth in v1. Direct Stripe, PayPal, or Subscribestar integrations are out of scope.
* **Studio Merchandise Store & Admin Catalog (v2):** An in-portal merchandise catalog grid allowing admins to add/edit/remove physical goods is parked for v2.
---

## 6. MVP Scope

### 6.1 In Scope for v1
* Mandatory 21+ age verification modal on entry with 5-day cookie persistence (432,000s, locked per owner decision).
* Responsive studio landing page showcasing studio identity, current RPG Maker MZ title, and teaser media.
* Patreon OAuth 2.0 authentication flow with active tier validation ($5, $10, $15, $25, $50).
* Protected `/play` route with paywall interstitial for unpledged/unauthenticated visitors.
* Graceful session verification on navigation without mid-gameplay termination.
* Embedded RPG Maker MZ HTML5 game runtime with responsive 16:9 canvas scaling.
* Mobile and desktop touch/mouse/keyboard control parity.
* Origin-stable local save persistence guaranteeing save continuity across game patches.
* Web HUD overlay with `.rpgsave` Export, Import, and Reset controls.
* Authenticated edge asset serving (HTTP 403 for unauthorized asset scraping).
* Multilanguage web shell with accessible language switcher and persistent locale cookie.

### 6.2 Out of Scope for MVP
* Cloud-synced user save profiles (deferred to v3-v5).
* Tier-gated exclusive content or DLC unlocks (deferred to v2).
* Native web player for Godot engine titles (desktop download only in v2).
* Native user registration / email passwords (auth is strictly delegated to Patreon).
* Studio merchandise store and administrative CRUD management panel (deferred to v2).
## 7. Success Metrics

### Primary Metrics
* **SM-1 (Time to Game):** < 30 seconds from clicking "Login with Patreon" on the landing page to rendering the game title screen for first-time authenticating patrons. *Validates FR-6, FR-7, FR-10.*
* **SM-2 (Patch Save Retention Rate):** 100% of player save slots remain intact and playable following the deployment of a new game patch. *Validates FR-13, FR-14.*

### Secondary Metrics
* **SM-3 (Asset Protection Ratio):** 100% of unauthenticated direct HTTP requests to game asset endpoints receive an HTTP 403 response. *Validates FR-18.*
* **SM-4 (Responsive Viewport Parity):** Zero reported game canvas layout breakage or touch input failures across iOS Safari and Android Chrome. *Validates FR-10, FR-11, FR-12.*

### Counter-Metrics (Do Not Optimize)
* **SM-C1 (Do Not Over-Enforce Mid-Game Auth):** Zero in-game gameplay kicks due to mid-session token expiration. The system must never abruptly disconnect a player in the middle of a dungeon or boss fight; verification belongs strictly on navigation and reloads. *Counterbalances FR-9.*
* **SM-C2 (Do Not Sacrifice Load Performance for Heavy DRM):** Asset encryption and auth checks must not add more than 300ms of latency to initial game bundle loading. DRM should never degrade the legitimate patron experience. *Counterbalances FR-17, FR-18.*

---

## 8. Cross-Cutting NFRs

* **NFR-1 (Performance):** Landing page initial load (LCP) under 1.8 seconds on standard broadband. Embedded game title screen interactive within 5.0 seconds on a 25Mbps connection.
* **NFR-2 (Security):** OAuth access and refresh tokens must never be exposed to client-side JavaScript. Tokens must be stored in encrypted, HTTP-only, `SameSite=Lax`, secure cookies or a protected edge KV store.
* **NFR-3 (Reliability):** 99.9% uptime for the landing page and authentication endpoints. If Patreon API is temporarily unavailable, returning users with valid cached session cookies must remain unaffected.
* **NFR-4 (Usability & Accessibility):** Age gate and Web HUD buttons must maintain minimum touch target dimensions of 44x44px for mobile accessibility. High contrast (WCAG AA) for all text overlays against dark studio themes.

---

## 9. Assumptions Index

* **[ASSUMPTION §4.1 / FR-2]:** A 5-day client-side age confirmation cookie (`max-age=432000`) is established and locked per project owner decision for legal compliance before re-prompting.
* **[ASSUMPTION §4.3 / FR-7]:** All 5 listed Patreon tiers ($5 Ork Patron, $10 Ogre Pimp, $15 Elf Sybarite, $25 Horseman Aesthete, $50 Mind Fucker Avatar) receive uniform access in v1 without tier-based gating.
* **[ASSUMPTION §4.3 / FR-9]:** Session token re-checks during route navigation provide sufficient business security without requiring aggressive periodic polling during active gameplay.
* **[ASSUMPTION §4.5 / FR-13]:** The Ropoductions game development team will enforce backward compatibility within their RPG Maker MZ plugins, ensuring that older save files do not crash the engine when new variables or switches are added in patches.
* **[ASSUMPTION §4.6 / FR-17]:** RPG Maker MZ's native asset encryption (or equivalent obfuscation) combined with session-authenticated edge streaming is sufficient deterrence against casual piracy.
