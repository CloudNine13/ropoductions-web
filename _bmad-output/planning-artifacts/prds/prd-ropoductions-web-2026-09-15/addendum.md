# PRD Addendum: Technical Candidates, Constraints & Reference Material

This addendum preserves technical depth, architectural candidate options, and external references to be evaluated during subsequent Architecture and UX phases.

## 1. Design & Aesthetic References
* **Bungie (`bungie.net`):** Atmospheric, cinematic hero media, prestige studio branding, clear distinction between game universes and studio news.
* **Annapurna Interactive (`annapurnainteractive.com`):** High-taste artistic minimalism, immersive art-forward presentations, refined typography.
* **Riot Games (`riotgames.com`):** Punchy studio prestige, clear call-to-action cards, polished game showcase sections.
* **OppaiLab (`oppailab.com`):** Adult game portal layout, direct patron incentives, explicit age-gate placement, game release changelogs.
* **Dark Tether Games (`darktethergames.com`):** Direct-to-consumer patron-tier integration, playable game showcases for adult indie games.

## 2. Patreon Tier Matrix
Patreon API v2 campaign pledge tiers:
* **Tier 1 ($5.00/mo):** Ork Patron (Baseline threshold for web playable game access)
* **Tier 2 ($10.00/mo):** Ogre Pimp
* **Tier 3 ($15.00/mo):** Elf Sybarite
* **Tier 4 ($25.00/mo):** Horseman Aesthete
* **Tier 5 ($50.00/mo):** Mind Fucker Avatar

*v1 Uniformity Invariant:* All active patrons from Tier 1 through Tier 5 receive identical web player access. Differentiated tier perks are parked for v2+.

## 3. RPG Maker MZ Runtime & Save Persistence Invariants
* **Runtime:** HTML5/WebGL export, target bundle footprint 5–30MB.
* **Storage Namespace:** RPG Maker MZ uses browser IndexedDB (`rmmz_save`) or LocalStorage (`rmmz_save_{index}`). Storage is partitioned strictly by `https://domain:port`.
* **Deployment Origin Rule:** Game deployments and updates must stay on the exact same domain origin and storage namespace. Subdomains or ephemeral deployment URLs must never be exposed as the player origin.
* **Plugin Backward Compatibility Guarantee:** Ropoductions game developers maintain save schema backward compatibility via in-engine plugins. Missing or newly added variables across patches must resolve to default fallbacks.
* **Web Save HUD:**
  * Export: Serializes browser save storage and downloads as `.rpgsave` binary.
  * Import: Validates and injects user-uploaded `.rpgsave` into browser storage, refreshing in-game save indexes.

## 4. Architecture Candidate Exploration (For Architecture Phase with Winston)
* **Frontend Candidates:** Next.js (App Router) vs. Astro (SSR) vs. SvelteKit.
* **Backend / Edge / Hosting Candidates:**
  * Cloudflare Serverless: Workers/Pages, R2 (zero egress fee asset storage), D1 / KV for fast session cache.
  * Node.js VPS / Docker: Fastify or Hono on containerized host with Redis session store.
  * Vercel + Supabase: Vercel frontend with Supabase Auth / Storage.
* **Asset Protection:** RPG Maker MZ native encryption + session-authenticated edge route streaming returning 403 for unauthenticated direct requests.
* **Styling & UI:** Tailwind CSS, Radix UI / Shadcn UI primitives, Framer Motion for hero atmosphere.

## 5. Parked Roadmap (v2 - v5)
* **v2:** Download hub and catalog for non-web projects (e.g. Godot downloadable builds).
* **v3 - v5:** Cloud save synchronization across devices via user accounts.
* **Future:** Tier-exclusive gallery unlocks, in-portal community discussions.
