---
name: Ropoductions Studio
status: final
sources:
  - ../../planning-artifacts/prds/prd-ropoductions-web-2026-09-15/prd.md
  - DESIGN.md
updated: 2026-09-21
---

# Ropoductions Studio — Experience Spine

## Foundation

Responsive web application built on **Next.js 15+ (App Router)** with **Tailwind CSS** and **shadcn/ui** primitives (Radix UI). `DESIGN.md` governs all visual tokens, colors, typography, and component styling; this document governs information architecture, state machines, microcopy, user journeys, and interaction behavior.

The application serves two distinct modes:
1. **Public Studio Portal:** Responsive marketing and community landing page showcasing Ropoductions' releases, lore, and patron tiers.
2. **Secured Web Player Environment:** A dedicated `/play` route wrapping the compiled RPG Maker MZ canvas in an origin-stable iframe with client-side save management controls.

---

## Information Architecture

| Surface | Route | Access Level | Purpose |
|---|---|---|---|
| **Age Gate Modal** | Global Overlay | Public (Unverified) | Mandatory 21+ self-attestation modal blocking all underlying interactions until confirmed. |
| **Studio Landing** | `/` | Public (21+ Verified) | Hero banner, active game showcase, screenshots lightbox, lore blurbs, social links, v2 merch teaser. |
| **Patreon OAuth Gateway** | `/api/auth/patreon` | Public (21+ Verified) | Initiates Patreon OAuth 2.0 PKCE redirect to `patreon.com`. |
| **OAuth Callback Handler** | `/api/auth/callback` | System / Redirect | Exchanges auth code for session tokens, writes to Cloudflare D1, sets secure session cookie. |
| **Web Player** | `/play` | Restricted (Patrons $5+) | Aspect-ratio locked RPG Maker MZ canvas + floating frosted-glass Save HUD dock. |
| **Studio Admin Panel** | `/admin` | Restricted (valid admin session only; 404 otherwise) | Internal studio dashboard: patron tier overrides, admin grants, audit trail. Logged-out, stale, forged, and valid-but-non-admin visits all receive HTTP 404 (anti-enumeration). The entry link is server-rendered in the portal and `/play` headers for confirmed admins only. |
| **Paywall Interstitial** | `/play` (Fallback) | Public / Unpledged | Rendered when an unpledged or lapsed user navigates to `/play`. Explains tier access with direct pledge link. |
| **Language Switcher** | Header & Footer | Public | Accessible locale picker dynamically translating microcopy and persisting `ropoductions_lang` cookie. |

---

## Voice and Tone

Microcopy guidelines. Atmospheric, dignified, respectful, and direct. Avoid juvenile internet slang or clinical developer jargon.

| Do | Don't |
|---|---|
| "Confirm your age to enter the studio." | "Hey! Are you 18+? Click here! 🔞" |
| "Active Patreon subscription required ($5+)." | "Access Denied: 403 Forbidden. Pay up." |
| "Your saves have been exported to a .zip archive." | "Download complete: rmmz_save_dump.bin" |
| "Your pledge is currently paused. Renew on Patreon to resume playing." | "Error: Session terminated. Invalid pledge status." |
| "Restoring save slots from backup..." | "Injecting binary payload into IndexedDB..." |
| Admin entry copy is a locale key — `header.navAdmin` (portal) / `game.adminPanel` (`/play`) — six-locale coverage, neutral functional register with the `Shield` icon. | "Secret Studio Controls", "God Mode", or a hardcoded English string in header components. |
| Non-admins reaching `/admin` get a silent HTTP 404 — no copy at all. | "Admins only — sign in for access" or any prompt that discloses the panel exists. |

---

## Component Patterns

### 1. 21+ Age Gate Modal
* **Behavior:** Appears immediately on first visit if `ropoductions_age_verified` cookie is missing.
* **Focus Trap:** Background page content is set to `aria-hidden="true"` and blurred with CSS `backdrop-blur-xl`. Focus is locked to the primary confirmation button.
* **Confirmation Action:** Clicking *"I am 21 or older"* sets a 14-hour cookie (with explicit cookie disclosure) and smoothly dissolves the modal (200ms ease-out).
* **Decline Action:** Clicking *"Exit"* immediately redirects the browser window to `https://google.com`.

### 2. Save HUD Dock (Bottom Floating Bar)
* **Docking Position:** Centered at the bottom of the `/play` route, floating 24px above the bottom viewport edge. Windowed, the dock is a static sibling below the canvas; in fullscreen it is an overlay with safe-area offset and an explicit 44px collapse FAB (DESIGN.md §3).
* **States (amended 2026-09-21 — Epic 6, owner decision Q13):**
  * **Windowed:** always visible below the canvas; decay is dim-only per DESIGN.md Layer 2; the windowed dock never collapses.
  * **Fullscreen:** collapsed by default behind the 44px affordance (accessible name `game.saveHudToggleControls`); entering fullscreen collapses. Expansion is user-invoked via the affordance only, and the dock re-collapses when idle. Canvas or bridge activity NEVER restores chrome; an export in flight or an open save dialog holds the dock expanded.
  * **Reveal/decay (expanded fullscreen dock):** hover, tap, or `focus-within` restores full chrome instantly; after 4s idle the chrome dims per DESIGN.md Layer 2; continued idle collapses the dock back behind the affordance.
  * **Keyboard / screen reader (WCAG 2.4.3):** the collapsed toolbar leaves the tab order, so the affordance is the sole keyboard route to Export/Import/Fullscreen/Reset — it MUST stay reachable, focus-visible, and announced.
* **Auto-Dimming Invariant:**
  * FLAGGED (2026-09-21): the two bullets below predate the DESIGN.md Layer 2 chrome-only dim ruling and conflict with it. Whole-element `opacity` dimming of the toolbar is prohibited — labels, icons, and focus rings stay at 100% opacity and AA contrast; only the container dims (`bg-[#090A0F]/40 border-white/5`). Retained verbatim as the historical description; authoritative behaviour is the States rule above. Pending copy-audit rewrite.
  * During active gameplay (mouse/keyboard/touch events inside the game canvas), the HUD dock smoothly fades to `opacity: 0.25` after 4 seconds of idle time.
  * Hovering or tapping anywhere near the bottom dock restores `opacity: 1.0` instantly.
* **Actions:**
  * **Export:** Immediately sends `POST_MESSAGE` to the game iframe, triggers `jszip` compression across all active save slots, and launches a file download (`ropoductions_saves_{date}.zip`).
  * **Import:** Opens a clean Radix Dialog allowing drag-and-drop or browsing for `.zip` or `.rpgsave` files. Shows a progress spinner during injection, then reloads the game canvas.
  * **Fullscreen:** Triggers browser `requestFullscreen()` on the outer game container. Icon toggles to an "Exit Fullscreen" symbol. The toggle must never reload the game: the viewport is a single stable DOM tree with only class names switching (engine-iframe lifecycle invariant, Epic 6 Story 6.2).
  * **Reset Storage:** Prompts a destructive confirmation dialog requiring the user to type "RESET" or click an explicit red confirmation button to purge local storage.

### 3. Patreon Paywall Card
* **Layout:** Centered elevated card displaying the studio emblem, a lock badge with gold glow, a summary of the 5 accessible tiers ($5 to $50), and a high-contrast primary CTA: *"Pledge on Patreon to Play"*.

### 4. Language Switcher
* **Trigger:** Accessible button with flag emoji icon showing active language code (`EN`, `JA`, `ES`, `RU`, `ZH`, `PL`).
* **Interaction:** Opens Radix Dropdown menu. Selecting a language re-renders the web shell microcopy instantly without page reload.
* **Persistence:** Writes selected locale code to `ropoductions_lang` cookie (valid 365 days).

### 5. Studio Hero Banner & Brand Mark
* **Brand Header Mark:** Displays the official pixel-art emerald leaf logo (`64x64`) next to the studio name in `font-display` (`Chakra Petch`).
* **Hero Visual:** Centers the official 1500x500 banner with *Final Orginity* character art and sunset title, rendered with `image-rendering: pixelated` and an ambient green aura (`rgba(34, 197, 94, 0.12)`).
* **Responsive Framing:** Preserves the 3:1 aspect ratio across viewports with subtle border radius and dark obsidian border stroke (`#23283E`).

---

## State Patterns

| State | Surface | Visual & Behavioral Treatment |
|---|---|---|
| **First-Time Arrival** | Global | Full-page dark blur with 21+ Age Gate Modal active. |
| **Logged Out Visitor** | Landing (`/`) | Header displays *"Login with Patreon"*. Hero CTA points to Patreon OAuth. |
| **Active Patron Logged In** | Landing (`/`) | Header displays Patron name + Tier badge (e.g., *"Elf Sybarite"* in `{colors.tier-gold}`). Hero CTA says *"Enter Game"*. |
| **Game Loading** | Web Player (`/play`) | Black screen with centered pulsing studio emblem and progress bar while initial 5-30MB encrypted bundle streams from R2. |
| **Save Exporting** | Save HUD | Export button displays spinning loader for ~500ms while zip builds, then displays checkmark icon: *"Downloaded!"* |
| **Invalid Save Upload** | Save Import Modal | Red error banner inside the dialog: *"The uploaded file does not contain valid RPG Maker MZ save data. Please select a valid .zip or .rpgsave file."* |
| **Lapsed Subscription** | Route Navigation | User is smoothly redirected from `/play` to `/` with a dismissible banner at the top: *"Your Patreon pledge has expired. Renew to unlock the latest chapter."* |

---

## Interaction Primitives

* **Aspect-Ratio Lock:** The game canvas container enforces a strict `16:9` ratio using CSS `aspect-ratio: 16 / 9` constrained by `max-height: 100dvh` and `max-width: 100dvw`.
* **Mobile Touch Parity:** On touch devices, taps on the canvas pass through directly to RPG Maker MZ touch coordinate listeners without double-tap zoom delay (`touch-action: manipulation`).
* **Keyboard Navigation:** `Tab` moves between age gate buttons and Save HUD controls with a high-visibility `{colors.ring}` outline. In fullscreen the collapse affordance is the tab entry point to the save controls (WCAG 2.4.3; see Component 2).

---

## Accessibility Floor

* **Contrast:** Minimum 4.5:1 text-to-background contrast ratio (WCAG AA) across all typography and UI buttons.

### Pre-Delivery UX Quality Checklist (from ui-ux-pro-max)
* **Iconography:** Zero emojis used as icons; all icons are clean SVG primitives from Lucide React.
* **Affordance:** `cursor-pointer` applied consistently to all clickable buttons, cards, and toggles.
* **Transitions:** Smooth hover and focus transitions (150–300ms) avoiding instantaneous state flips.
* **Contrast:** Text-to-background contrast ratio exceeds 7:1 for body and 4.5:1 for muted text on OLED deep-black surfaces.
* **Keyboard Navigation:** Visible focus rings (`ring-2 ring-primary ring-offset-2 ring-offset-background`) on tab navigation.
* **Motion:** `prefers-reduced-motion` media queries respected; auto-dimming and modals cross-fade with 0ms transition when reduced motion is requested.
* **Responsive Breakpoints:** Explicitly tested across 375px (iPhone), 768px (iPad mini), 1024px (iPad Pro/Laptop), and 1440px (Desktop).
* **Touch Targets:** Minimum dimensions of 44x44 CSS pixels for all interactive mobile buttons (Age gate, HUD triggers, modal close icons).
* **Screen Reader Accessibility:** Modals use standard WAI-ARIA dialog attributes (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`).

---

## Key Flows

### Flow 1: New Patron Accesses the Game
1. User lands on `ropoductions.com`.
2. Confirms 21+ modal.
3. Clicks *"Login with Patreon"* on the header.
4. Completes Patreon authorization and lands on `/play`.
5. Canvas streams assets from R2; title screen appears within 15 seconds.
6. User clicks *"New Game"* and begins playing.

### Flow 2: Player Exports Save Backup
1. After completing Chapter 1, player moves cursor to the bottom HUD dock.
2. Dock illuminates to full opacity. *(FLAGGED 2026-09-21: historical wording — per DESIGN.md Layer 2 the chrome-only rule, reveal restores container chrome, not whole-element opacity; see the Component 2 flag.)*
3. Player clicks *"Export Saves (.zip)"*.
4. Web Shell gathers all populated slots from browser storage and downloads `ropoductions_saves_2026-09-15.zip`.
5. HUD shows a brief green confirmation checkmark.

### Flow 3: Patch Continuity Verification
1. Studio deploys Version 1.2 to the edge.
2. Player reopens `/play` on the same browser.
3. Game loads under the identical origin.
4. Player clicks *"Continue"*; all Chapter 1 save slots appear intact with timestamps and party levels.

### Flow 4: Admin Reaches the Panel (portal and `/play` entry)
1. The admin follows the ordinary play path: portal → age gate → *"Login with Patreon"* → authenticated `/play`. There is no separate admin login and no return-target plumbing.
2. Admin identity is resolved from the patron override table, never the session role — so an admin who also holds an active pledge still sees the entry. Labels come from the locale keys `header.navAdmin` (portal header) and `game.adminPanel` (`/play` header), rendered with the `Shield` icon and neutral treatment (DESIGN.md §6).
3. The admin clicks the entry and lands on `/admin`.
4. `comp` holders and every other non-admin see no entry anywhere; anyone typing `/admin` without a valid admin session — including an admin whose session or age cookie lapsed — receives HTTP 404 with no redirect, and recovers via the step-1 path.
