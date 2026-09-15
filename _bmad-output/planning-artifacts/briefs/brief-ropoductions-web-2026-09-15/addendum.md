# Product Brief Addendum: Ropoductions Web Portal

This addendum captures technical constraints, design references, candidate technologies, and downstream considerations volunteered during product brief discovery.

## 1. Design & Aesthetic References
The design identity is a hybrid between polished AAA game publisher portals and community-focused adult indie game sites.

* **Bungie (`bungie.net`):** Premium atmospheric UI, bold hero graphics, community updates, clear nav between games and lore/news.
* **Annapurna Interactive (`annapurnainteractive.com`):** High-taste artistic minimalism, immersive art-forward presentations, elegant typography.
* **Riot Games (`riotgames.com`):** Punchy branding, studio prestige, clear call-to-action cards, game showcase cards.
* **OppaiLab (`oppailab.com`):** Adult game portal flow, patron incentives, explicit age-gate placement, game release changelogs.
* **Dark Tether Games (`darktethergames.com`):** Direct-to-consumer patron-tier integration, direct downloads/playable showcases for adult indie games.

## 2. Patreon Tier Matrix
Patreon OAuth integration verifies membership against active campaign pledge tiers:
* **Tier 1 ($5):** Ork Patron (Baseline paywall threshold for web playable game access)
* **Tier 2 ($10):** Ogre Pimp
* **Tier 3 ($15):** Elf Sybarite
* **Tier 4 ($25):** Horseman Aesthete
* **Tier 5 ($50):** Mind Fucker Avatar

*Session Policy:*
* Lapsed/paused pledges do not terminate active gameplay in progress.
* Re-verification happens on route transitions or next access attempt. If verification fails, redirect to the landing page with an explicit renewal/re-authentication prompt.
* In v1, all 5 active tiers ($5 to $50) receive uniform access to the web game instance. Differentiated tier perks (e.g. beta branches, developer commentaries, gallery unlocks) are parked for future releases.

## 3. RPG Maker MZ Web Runtime & Save Persistence Constraints
* **Game Package Size:** Initial build 5–30MB.
* **Engine:** RPG Maker MZ HTML5/WebGL export.
* **Save Storage Mechanism:**
  * MZ default stores save files in IndexedDB (`rmmz_save`) or localStorage depending on build configuration.
  * Web wrapper UI needs a dedicated HUD / control bar (outside or overlaid on the canvas) providing:
    * **Export Save:** Serializes local storage saves and downloads them as `.rpgsave` (or zip bundle).
    * **Import Save:** File upload dialog that injects save data into storage and triggers a reload/refresh of the save index.
    * **Reset / Clear Storage:** Safe purge option for debugging or starting fresh.
* **Patching & Version Migration Invariant:**
  * When updated game builds are deployed (new maps, scripts, plugins), the origin URL / storage namespace must remain consistent so players do not lose their in-browser progress.
  * Game code updates must handle save schema migrations gracefully (e.g., handling missing variables/switches without crashing the engine).
  * Studio developers maintain forward/backward compatibility within RPG Maker MZ plugins.
* **Asset Protection & Encryption:**
  * In v1, all static game assets (graphics, audio, JSON data) will use encryption (RPG Maker MZ native encryption or third-party asset obfuscation).
  * Backend / edge layer authenticates every asset request against active session cookies, blocking direct hotlinking or unauthorized scraping.

## 4. Architecture, Tech Stack & Tooling Exploration Candidates
*Note: These are open candidate technologies to be evaluated in technical architecture brainstorming, not pre-locked choices.*

### A. Frontend Framework Candidates
* **Next.js (App Router):** Strong ecosystem, built-in API/route handlers, server components, seamless auth integration.
* **Astro (SSR mode):** Content-first performance, minimal client JavaScript payload for the landing page, excellent image optimization, framework-agnostic islands for game shell HUD.
* **SvelteKit:** Extremely lightweight runtime, fine-grained reactivity for HUD state (save export/import, session status), fast cold starts.

### B. Hosting, CDN & Edge Runtime Candidates
* **Cloudflare Serverless Stack:**
  * Cloudflare Pages / Workers for compute & OAuth route handlers.
  * Cloudflare R2 for zero-egress-fee encrypted game asset hosting.
  * Cloudflare KV or D1 (SQLite at edge) for fast patron token caching and session management.
* **Node.js / Container / VPS Stack:**
  * Fastify or Hono on a dedicated VPS/Docker host. Simple file-system based asset serving and standard session stores (Redis).
* **Vercel / Supabase Stack:**
  * Vercel for frontend hosting + Supabase for Auth / Postgres / Storage.

### C. Design & UI Tooling Candidates
* **Styling:** Tailwind CSS + Radix UI / Shadcn UI primitives for dark, atmospheric game-studio styling.
* **Motion / Transitions:** Framer Motion or Motion One for atmospheric hero animations and smooth modal transitions (age gate, login dialog).
* **Canvas Shell:** Custom HTML5 Canvas container with CSS aspect-ratio locks (16:9) and touch-friendly overlay controls for mobile viewports.

### D. Agentic Skills & MCP Integrations
* **BMad Design & UX Skills:** `bmad-ux` for interactive flow wireframing and design token alignment.
* **MCP Tools:** Context7 MCP for framework documentation lookup; GitHub MCP for repository/release automation.
* **Agent Collaboration:** `bmad-agent-architect` (Winston) and `bmad-agent-ux-designer` (Sally) for technical design review and wireframing.

## 5. Parked Roadmap (v2 - v5)
* **v2:** Cataloging / download hub for secondary projects (e.g. Godot downloadable releases).
* **v3 - v5:** Cloud save synchronization (syncing save slots to user profiles via backend database).
* **Future:** Community commenting/feedback board, tier-exclusive gallery/bonus content.
