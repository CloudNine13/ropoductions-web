---
title: "Product Brief: Ropoductions Web Portal & Patron Game Client"
status: complete
created: 2026-09-15
updated: 2026-09-15
---

# Product Brief: Ropoductions Web Portal & Patron Game Client

## Executive Summary
Ropoductions Web Portal is the official digital home and premium game-streaming hub for adult indie game studio Ropoductions. The platform bridges high-aesthetic studio prestige—inspired by modern gaming hubs like Bungie, Riot Games, and Annapurna Interactive—with a secure, patron-gated browser gaming experience. 

By integrating directly with Patreon's OAuth API, the portal validates subscriber status across active pledge tiers ($5 to $50), granting immediate, zero-installation access to in-browser RPG Maker MZ titles. Built to be fully responsive across mobile and desktop devices, the platform eliminates the friction of manual archive downloads while preserving player progress across game updates through origin-stable client-side save management.

## The Problem
Adult game development relies heavily on patron-funded subscription models, yet traditional distribution channels introduce friction for both players and creators:
1. **Download & Device Friction:** Players must download, extract, and manually manage multi-megabyte archives, creating barriers on shared machines, mobile phones, and non-PC devices.
2. **Subscription Verification & Leakage:** Distributing static archive links via Patreon posts leads to rapid link leaks, outdated builds circulating publicly, and zero visibility into lapsed subscribers continuing to access content.
3. **Patch Fragmentation & Save Loss:** When creators release new story chapters or game patches, players frequently struggle to migrate save files between builds, risking corrupted saves or lost playtime.

## The Solution
A unified, high-performance web platform featuring:
* **Studio Showcase & Landing:** An art-forward web presence showcasing Ropoductions' identity, current projects, and release announcements, gated by an initial 21+ age verification modal.
* **Patreon OAuth Gating:** Frictionless patron authentication verifying active membership against active tiers ($5 Ork Patron through $50 Mind Fucker Avatar). Lapsed pledges are handled gracefully on navigation rather than disrupting active sessions.
* **Secure Web Runtime:** An embedded, responsive RPG Maker MZ game client running encrypted assets delivered through session-authenticated backend/edge routes.
* **Origin-Stable Save Persistence:** Browser-based storage persistence paired with dedicated client-side `.rpgsave` export/import controls, ensuring zero progress loss when updating game builds.
* **Full Responsive Scaling:** Optimized experience across both desktop monitors and mobile/tablet touch viewports.

## What Makes This Different
* **Zero-Friction Immersion:** One-click play directly in modern browsers without unpacking archives or leaving executable traces on local drives.
* **Studio-First Prestige:** Unlike generic adult game hosts, the portal treats Ropoductions as a premium creative studio, balancing atmospheric branding with direct patron utility.
* **Developer-Friendly Patching:** Game updates deploy seamlessly without resetting the player's local browser storage namespace.

## Who This Serves
* **Primary — The Active Patron (21+):** Wants instant, discreet access to the latest game updates as soon as their pledge is active, with guaranteed save file continuity across patches on desktop or mobile.
* **Secondary — The Prospective Supporter:** Explores the public studio showcase, gets hooked on the visual style and lore, and converts into a Patreon backer to unlock access.
* **Tertiary — Studio Developers:** Deploys new web builds effortlessly without managing fragmented third-party download mirrors.

## Success Criteria
* **Frictionless Onboarding:** < 30 seconds from hitting "Play with Patreon" on the landing page to rendering the game title screen.
* **Save Retention:** 0% save data corruption or unexpected wipe reports across game patch deployments.
* **Patron Conversion & Security:** 100% of game asset requests authenticated against active session state; zero unauthenticated hotlinking.
* **Session Resilience:** Graceful handling of expired tokens—redirecting cleanly to the renewal flow without browser crashes.
* **Responsive Usability:** 100% feature parity (navigation, age verification, game play, save export/import) across desktop and mobile browsers.

## Scope
### In Scope (v1)
* High-aesthetic public studio landing page with 21+ age verification confirmation modal.
* Patreon OAuth 2.0 integration (login, callback, tier verification for $5, $10, $15, $25, $50 tiers).
* Protected `/play` web route hosting the RPG Maker MZ HTML5 game client with responsive viewport scaling.
* Client-side HUD overlay for manual `.rpgsave` export (download) and import (upload/inject).
* Secure authenticated asset serving mechanism for encrypted game files.
* Responsive mobile & desktop layout across the entire portal.

### Explicitly Out of Scope (Parked for v2+)
* Cloud save synchronization to remote user accounts (deferred to v3-v5).
* Tier-differentiated in-game perks (v1 treats all $5+ tiers uniformly).
* Web-playable client for Godot projects (future Godot games will be cataloged for download).
* In-portal community forums or user comment sections.
* Alternative payment gateways (Patreon remains the single source of truth for v1).

## Vision
Over the next 2–3 years, Ropoductions Web Portal evolves from a single-game patron player into a full-fledged independent studio distribution platform. It will catalog diverse studio projects (including Godot desktop titles), provide cross-device cloud save synchronization, and deliver exclusive interactive patron experiences directly to a thriving adult gaming community.
