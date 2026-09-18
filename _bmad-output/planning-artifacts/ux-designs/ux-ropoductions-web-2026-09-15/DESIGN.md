---
name: Ropoductions Studio
description: Atmospheric dark retro aesthetic for adult indie game studio Ropoductions. shadcn/ui on Next.js + Tailwind CSS with custom obsidian, studio emerald, arcade sunset, and gold brand tokens.
status: final
sources:
  - ../../planning-artifacts/prds/prd-ropoductions-web-2026-09-15/prd.md
colors:
  # Base surfaces (Obsidian / Cosmic Black)
  background: '#090A0F'
  background-secondary: '#0F111A'
  foreground: '#F8FAFC'
  muted: '#1A1D2B'
  muted-foreground: '#94A3B8'
  card: '#121522'
  card-foreground: '#F1F5F9'
  border: '#23283E'
  input: '#1A1E2F'
  ring: '#22C55E'
  destructive: '#E11D48'

  # Studio Accents
  primary: '#22C55E'             # Studio Emerald / Leaf Glow
  primary-foreground: '#090A0F'
  primary-hover: '#16A34A'
  accent: '#F59E0B'              # Sunset Amber
  accent-foreground: '#090A0F'
  tier-gold: '#FBBF24'           # Patron Tier Badge Gold
  tier-gold-foreground: '#181204'
  comp-blue: '#38BDF8'           # Admin/Comp distinction, /admin/* ONLY

typography:
  display:
    fontFamily: 'Chakra Petch, sans-serif'
    fontSize: 44px
    fontWeight: '700'
    lineHeight: '1.15'
    letterSpacing: '0.04em'
  display-sm:
    fontFamily: 'Chakra Petch, sans-serif'
    fontSize: 28px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: '0.02em'
  body:
    fontFamily: 'Geist Sans, Inter, sans-serif'
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-sm:
    fontFamily: 'Geist Sans, Inter, sans-serif'
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  mono:
    fontFamily: 'Geist Mono, monospace'
    fontSize: 13px
    fontWeight: '500'
rounded:
  sm: 4px
  md: 8px
  lg: 12px
  2xl: 16px
  full: 9999px
spacing:
  touch-target: 44px
  hud-dock: 64px
components:
  button-primary:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    radius: '{rounded.md}'
    border: '1px solid #4ADE80'
  button-patreon:
    background: '#FF424D'
    foreground: '#FFFFFF'
    radius: '{rounded.md}'
  age-gate-dialog:
    background: '{colors.card}'
    border: '1px solid {colors.border}'
    radius: '{rounded.lg}'
    backdropBlur: '24px'
  hud-dock:
    background: 'rgba(9, 10, 15, 0.75)'
    backdropBlur: '16px'
    border: '1px solid rgba(255, 255, 255, 0.1)'
    radius: '{rounded.full}'
---

# Ropoductions Studio — Design Spine

## Brand & Style

Ropoductions is an independent adult game studio crafting nostalgic, cheeky, and narrative-driven retro anime RPGs, headlined by *Final Orginity*. The visual identity blends 90s/00s 16-bit pixel art charm, arcade sunset chromes, and glowing emerald studio branding with a sleek, dark adult web portal.

The aesthetic balances retro doujin gaming soul with high-usability web execution:
* **The Atmosphere:** Cosmic black (`#090A0F`) and deep obsidian card surfaces let colorful pixel character art and game viewports pop with maximum contrast.
* **The Studio Emblem:** A vibrant, glowing pixel-art emerald crystal leaf (`#22C55E` / `#7BF53A`) symbolizing the studio's organic roots and creative spark.
* **The Accent:** Studio Emerald Green highlights key interactive triggers, balanced by warm Patron Gold for supporter ranks, and sunset gradient chrome for retro game titles.
---

## Colors

| Token | Hex | Role | Usage |
|---|---|---|---|
| `background` | `#090A0F` | Canvas Base | Primary portal background, deep dark canvas. |
| `background-secondary` | `#0F111A` | Surface | Secondary page sections, hero gradient underlays. |
| `card` | `#121522` | Surface Raised | Game cards, paywall tier boxes, modal dialogs. |
| `border` | `#23283E` | Structural Edge | Card borders, dividers, HUD outer strokes. |
| `primary` | `#22C55E` | Studio Emerald | Primary CTAs ("Play Now"), active buttons, emerald brand accents. |
| `accent` | `#F59E0B` | Sunset Amber | Sunset/arcade decoration and non-patron roadmap flags (e.g. Godot coming-soon) only. MUST NEVER signal patron status. |
| `tier-gold` | `#FBBF24` | Patron Honor | Tier status badges, supporter recognition elements. ALL tier, lock, pledge-price, and patron-status affordances MUST use `tier-gold`. |
| `comp-blue` | `#38BDF8` | Admin/Comp Distinction | Admin-override surfaces ONLY (`/admin/*`): comp role badges, panel-assigned grants. NEVER on patron-facing tiers, locks, prices, or CTAs. |
| `crimson` | `#E11D48` | Alert / Crimson Flame | Destructive confirmations (reset, revoke), age gate top glow. |
| `destructive` | `#E11D48` | Destructive | Sole destructive/red token for error banners and reset/revoke actions. Alias of `crimson`; `#EF4444` is retired. |
| `foreground` | `#F8FAFC` | Text Primary | Headlines, active navigation links, modal body text. |
| `muted-foreground` | `#94A3B8` | Text Secondary | Captions, metadata, changelogs, footer copyright. |

---

## Typography

* **Display (`Chakra Petch` — canonical):** Bold, futuristic gaming display typography for studio brand headlines, banner accents, and modal titles. Conveys retro gaming energy while maintaining clean screen legibility. `Cinzel` references in ARCH-7 / UX-DR2 / Story 1.1 are superseded; `export const cinzel = chakraPetch;` in `src/lib/fonts.ts` is compat-only and MUST NOT be imported in new code. Titles use sentence-case; ALL-CAPS is reserved for micro-badges of 12 characters or fewer with tracking. Sole display exception: the studio logotype `ROPODUCTIONS` (12 chars) may render ALL-CAPS in exactly two slots — hero H1 and header brand — with `break-words max-w-full` and responsive `text-4xl → text-7xl` ramp (44px token is the base step, not a cap).
* **Body (`Geist Sans` / `Inter`):** Clean, neutral, high-legibility geometric sans-serif for UI labels, descriptive blurbs, HUD buttons, and system notices.
* **Mono (`Geist Mono`, `tabular-nums`):** Reserved for system metadata — version badges (`v1.2.0`), save file timestamps, locale codes (`EN`), prices, tier/role identifiers inside badges/pills, and storage diagnostics. All human-readable titles and prose stay in Display/Body sentence-case.
* **Contrast floor:** WCAG AA 4.5:1 is binding for all text and controls (NFR-4 governs). 7:1+ body on OLED is the standing aspiration (ARCH-7, met at full strength by current tokens); dimmed/idle states and 10px overlay micro-badges are exempt from the aspiration but MUST NEVER drop interactive labels or focus rings below AA. No text below 12px except mono metadata; muted text never below 100% alpha on `card`.

---

## Layout & Spacing

* **Container Width:** Standard content capped at `1280px` (`max-w-7xl`) centered with responsive gutter padding (`px-4` on mobile, `px-8` on desktop).
* **Game Canvas Viewport:**
  * Strict `16:9` aspect ratio container.
  * Mobile viewports: Container fills `100dvw` and up to `100dvh` without page scrolling.
  * Desktop viewports: Centered player card with ambient dark backdrop.
* **Touch Targets:** All interactive elements on mobile (age confirmation buttons, save HUD icons, nav links) maintain a strict minimum bounding box of `44px x 44px`.

---

## Elevation & Depth

* **Layer 0 (Base Canvas):** Background `#090A0F` with a single overlay stack of at most two composited gradients — one legibility scrim plus one emerald aura clamped to `rgba(34, 197, 94, 0.15)` — over one eager banner image (`fetchpriority=high`, LCP budget under 1.8s). One legibility scrim means one div (flat tint + radial falloff composited in one `background` stack); separate top-blend `bg-gradient-to-b` divs are banned. No additional scrim divs. Pinned `deslop-ignore 06` as an intentional legibility exception.
* **Layer 1 (Cards & Showcases):** Card surface `#121522` with 1px border `#23283E` and token shadow (`box-shadow: 0 10px 30px -10px rgba(0,0,0,0.8)`). No `shadow-2xl` ghost cards; no `backdrop-blur` on surfaces at 90% opacity or above. Sticky `studio-header` blur (`bg-background/90 backdrop-blur-md`) is the sole sanctioned header exception.
* **Layer 2 (Floating Save HUD Dock):** Frosted glass (`rgba(9, 10, 15, 0.75)` with `backdrop-filter: blur(16px)`), elevated with 1px white/10 edge stroke. This dock is the sole sanctioned glass surface. After 4s idle dim chrome only — container to `bg-[#090A0F]/40 border-white/5` — labels, icons, and focus rings stay at 100% opacity and AA contrast; restore full chrome on hover/tap/`focus-within`. NEVER apply `opacity-*` to the toolbar element. Touch (`hover: none`) uses the same chrome-only dim, never whole-element opacity.
* **Layer 3 (Modals & Age Gate):** High elevation with dark vignette underlay (`bg-black/80 backdrop-blur-xl`), trapping focus completely. All overlay/content enter/exit collapses to 0ms under `prefers-reduced-motion` (see Motion Contract). Exit keeps `pointer-events:none` on `[data-state="closed"]`.
* **Z-scale (never tie):** Game fullscreen/pseudo container `z-40`; header `z-40` (sibling context, viewport overlays it when fixed); all Dialog overlays/content, lightbox, and toasts `z-50`; destructive confirms `z-[60]`.

---

## Shapes & Radii

* **Micro Elements (Tags, Badges, Tooltips):** token `sm` (4px, `rounded-sm`). Tiny overlay tags (`text-[10px]`) are `rounded-sm`, never blurred.
* **Interactive Buttons & Input Fields:** token `md` (8px). Patreon CTAs use `rounded-md` per `button-patreon`, never pill.
* **Small Cards, Inner Panels & Compact Dialogs (top-level width ≤max-w-lg or p≤6, e.g. age-gate, nested showcase/screenshot cards, dropdowns, toasts, viewport frame):** token `lg` (12px, Tailwind `rounded-xl`). `rounded-lg` (Tailwind-default 8px) is banned for surfaces.
* **Large Elevated Cards, Modals & Lightboxes (top-level width >max-w-lg or p-6..p-10, e.g. paywall card, paywall modal, showcase sections, social-hub cards):** token `2xl` (16px, Tailwind `rounded-2xl`) — standard, not exception.
* **Floating Web HUD Dock:** `rounded-full` (pill shape) for organic, unobtrusive floating ergonomics. This dock alone may combine pill radius with frosted glass. Inner dock controls are `rounded-full` as a dock-contained exception (pill-in-pill hit continuity at 44px targets); the `rounded-md` button rule applies everywhere outside the dock.
* **Kicker budget:** At most one eyebrow/kicker pill per section viewport (hero, showcase header, social header, paywall card). Showcase title badge row caps at two badges: engine + access; demoted badges fold into caption prose or die. Play-header session pills are system status metadata, exempt.
* **Motion on surfaces:** `transition-colors 150ms` with border/surface shifts only. Never scale pixel-art images on hover; `.pixelated` crisp edges MUST be preserved. No `scale-*` transform on `.pixelated` ever, hover or otherwise. Text reveals are opacity + `y:8–12px` only; height/`line-clamp`/clip tweens are banned (see Motion Contract). `transition-all` is banned; dead `animate-in` classes (no plugin installed) MUST be removed, never backfilled with `tailwindcss-animate`.
* **Reduced-motion:** All overlay/drawer/menu/modal/lightbox transitions and animations collapse to 0ms under `prefers-reduced-motion` (see Motion Contract — global kill-switch + `motion-reduce:transition-none motion-reduce:animate-none` on every animated class + `gsap.matchMedia()` reduce branch with final state). No exceptions.

## Motion Contract (WCAG 2.3.3 / 2.2.2 / 1.4.3 binding — overrides all patterns below)

1. **Kill-switch (CSS).** Global guard in `globals.css` alongside any keyframes: `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0ms !important; scroll-behavior: auto !important; } }` Every animated class MUST carry `motion-reduce:transition-none motion-reduce:animate-none`.
2. **Kill-switch (GSAP).** Every timeline/batch MUST be wrapped in `gsap.matchMedia()`; reduce branch renders the final state with duration 0 via `gsap.set`. Unwrapped tweens fail review.
3. **Ambient ban.** No auto-playing/looping motion: no slideshow loops, no pulse without a real live state + determinate progress + auto-stop, no parallax scrub, no marquee, no crossfade over 600ms, no infinite iteration. Sole pulse exception: `/play` game-loading emblem, stops on load, off under reduced-motion.
4. **No-JS/SSR fallback.** SSR ships fully visible; never ship `opacity-0`/translate-hidden initials in markup. Initial states are JS-only; entrances use `gsap.from` with `immediateRender: false`.
5. **Focus.** Never tween `opacity`/`transform`/`filter` on `:focus-visible` or its ancestors without `clearProps`. Rings stay 100% opacity at AA during and after motion. Timelines never call `.focus()`.
6. **Screen readers.** Revealed content is in-DOM and readable without JS/scroll. Never set `aria-hidden` during stagger. SplitText only as `type: "words,lines"` with `aria: "auto"`.
7. **i18n-safe offsets.** Text tweens: `y` 8–12px max, `opacity` only, `overflow:visible`, `duration ≤300ms`, `stagger ≤0.08s`. Height/`line-clamp`/clip-path text animation banned. Verify RU expansion and JA/ZH breaks mid-tween.
8. **Contrast during motion.** Text and focus rings never drop below AA at any frame; dimming applies to chrome containers only, never labels/icons/rings.
9. **Approved motion budget (v1, CSS-only, max 3 + foundations).** KEEP: (a) game-loading determinate bar (`scaleX`, origin left, 150ms linear ticks) + sanctioned emblem pulse (1600ms, stops on interactive); (b) toast/banner slide (`translateY ±8px` + opacity, 200–250ms `ease-out`); (c) HUD export spinner→checkmark (700ms spin during zip, 150ms check, 2s hold, fixed 44px box). Foundations (not counted): age-gate dissolve (opacity 200ms), overlay/menu/lightbox fade-only ≤150ms, `transition-colors` 150ms surfaces, HUD chrome-only dim 300ms, hero decode crossfade ≤600ms. Everything else — hero entrances, scroll reveals, SplitText chars, parallax/pin/scrub, Flip routes, ScrollSmoother, magnetic, marquee, wiggle, tilt, shimmer, scramble, bounce — is KILLED for v1.
10. **GSAP re-entry gate.** No `gsap` install for v1 (0kB, LCP<1.8s, edge cold-start). Install only if a future story requires scrub/pin/`containerAnimation`/seek control CSS cannot do, behind route-scoped client-only import with `matchMedia` guards and unchanged LCP/auth budgets. Stagger/batching alone never re-opens the gate.

---

## Components

### 0. Icon Map (locked, Lucide-only)
* Patron access / lock / pledge / price: `Lock`, `tier-gold` only. Never `accent`, never `Heart`.
* Discord / community chat: `MessagesSquare`.
* X / social broadcast: `AtSign` (handle semantics). Never `Sparkles`.
* Screenshots gallery header: `Images`. `Maximize2`/`Minimize2` are reserved for the expand-preview affordance and the HUD fullscreen action only.
* Prestige eyebrow kicker: `Sparkles`, sole sanctioned decorative use (showcase header only).
* Role / status / verification: `Shield`, `ShieldCheck`.

### 1. Age Gate Dialog (21+)
* Full-screen blocking modal overlay (`z-50`).
* Dark obsidian card (`#121522`) with subtle emerald glowing top border (`border-t-primary`).
* Title in `display-sm`: *"21+ Age Verification Required"*.
* High-visibility Primary CTA: *"I am 21 or older — Enter Studio"* (`bg-primary`).
* Secondary Exit Button: *"Exit"* (`text-muted-foreground hover:text-white`).

### 2. Patreon Paywall Card
* Leads with a single access banner: one $5+ pass unlocks everything in v1, with identical access across all five tiers ($5/$10/$15/$25/$50). No tier-differentiated perk boxes, grids, or beta branches.
* Collapsible tier matrix listing the 5 supporter ranks with `tier-gold` lock accent, satisfying FR-8 without implying differentiated perks.
* Clear lock icon in `tier-gold`, never `accent`.
* High-prominence *"Login with Patreon"* button (`rounded-md`) featuring official Patreon brand red (`#FF424D`).

### 3. Floating Save HUD Dock
* Positioned bottom-center of the `/play` route, outside the canvas touch zone in standard layout (static sibling below canvas; fullscreen overlay only with safe-area offset and an explicit 44px collapse FAB). Never blocks gameplay controls. Fullscreen overlay defaults expanded; collapse is user-invoked only and resets on fullscreen exit.
* Sole sanctioned pill + frosted-glass surface. Subtle icon + label layout using Lucide icons only:
  * **Export (.zip)**: `Download` primary action with download arrow. Label stays visible at all viewport sizes.
  * **Import**: `Upload` opens file picker dialog.
  * **Fullscreen**: `Maximize2` / `Minimize2` expands canvas to native device display.
  * **Reset**: `RotateCcw` small utility triggering wipe confirmation.
* Auto-dimming: After 4s inactivity dim chrome only per Layer 2. Export label and focus ring never dim, never drop below AA (WCAG 1.4.3).
* Constraint: Never ship disabled toolbar actions. Every rendered dock button is enabled and wired (Export→FR-14, Import→FR-15, Reset→FR-16 destructive confirm, Fullscreen toggle). If a handler cannot be provided, omit the button — do not render disabled or `(Coming soon)` title tooltips.
* Status dots are flat 8px `bg-primary` solids with no pulse or glow unless bound to a real live state. Exception: the `/play` game-loading state (EXPERIENCE State Patterns) is a real live state and may pulse the emblem behind a determinate progress bar.

### 4. Language Switcher
* Trigger is canonical `Globe` Lucide icon + mono locale code (`EN`); the flag-emoji glyph is the sole owner-approved exception (Story 1.4) and renders as progressive enhancement (`aria-hidden`, supplemental to — never replacing — the code). Windows letter-pair fallback is accepted.
* Dropdown menu with frosted-glass panel (`bg-card/90 backdrop-blur-md border border-border`).
* Hover states with 150ms smooth transition, showing active locale checkmark.
* Touch target 44x44px for mobile header/footer placement.

### 5. Studio Hero Banner & Pixel Art Assets
* **Studio Emblem (`studio-logo.webp`):** 64x64 pixel-art crystal leaf mark. Scaled crisp using `image-rendering: pixelated` and `image-rendering: crisp-edges`. Used in header brand slot, favicon, and loading screens.
* **Hero Banner (`studio-banner.jpeg`):** 1500x500 key art banner featuring the *Final Orginity* anime pixel cast, arcade sunset chrome logo, and `ROPODUCTIONS©` wordmark. Displayed as one eager image (`fetchpriority=high`, 3:1 aspect ratio) with responsive framing, subtle dark ambient glow (`box-shadow: 0 0 50px rgba(34, 197, 94, 0.15)`), and crossfade capped at 600ms. Hero copy leads with the cast and arcade chrome; tier messaging is demoted to a caption under the primary Play CTA.
* **Pixel Asset Preservation:** True pixel raster assets MUST avoid bilinear smoothing by applying utility `.pixelated` (`image-rendering: pixelated; image-rendering: crisp-edges;`). Never apply `.pixelated` to photographic JPEGs or vectors, and never scale pixel art on hover.
* **Media Gallery Card:** Card root is `<article>`; the expand affordance is an inner `<button>` covering the media region with `aria-label="Open full screenshot preview: {title}"`. Card title is a styled `<span>`, never a heading; caption is `<p>`. Never nest headings or paragraphs inside `<button>`.

### 6. Admin Surfaces (Epic 5, internal only)
* Restricted `(admin)` group; non-admin visits return HTTP 404 (anti-enumeration guard, no redirect that leaks existence).
* Creator Admin: `tier-gold` Sealed lock badge; no edit/delete affordances rendered and mutation endpoints reject with 403. Panel Admin/Comp: `comp-blue` badge (internal-only token, never on public surfaces).
* Revoke is destructive: explicit confirm dialog (`destructive`), plus sole-admin lockout guard — the last remaining admin cannot be revoked; attempting it surfaces an inline error.

### 7. Auth-Error Toast
* Fixed `role="alert"` toast (bottom-right desktop, top inset mobile), `destructive` treatment, dismiss clears the `?auth_error` param via history replace. No auto-navigation.

### 8. Save Dialogs (`/play` HUD)
* Import: Radix dialog, drag-drop + file picker (`.zip`/`.rpgsave`), progress spinner, invalid-format error copy per FR-15.
* Reset: two-step destructive confirm with copy "Are you sure? This will delete all local browser save data for this game. Consider exporting a backup first." Explicit confirm button only — no typed RESET (FR-16).

---

## Do's and Don'ts

| Do | Don't |
|---|---|
| Use rich blacks, subtle vignette shadows, and generous negative space. | Don't use harsh pure white backgrounds or high-saturation rainbow colors. |
| Present the studio with the dignity of an indie art house. | Don't use flashing banners, abrasive popups, or intrusive clickbait ads. |
| Keep the Save HUD docked and unobtrusive during gameplay. | Don't overlap save controls directly over in-game action or movement buttons. |
| Use clear, unambiguous microcopy for save export and import. | Don't use vague labels like "Sync" when action is a local file download. |
| Sequence showcases as title → party → screenshots → Godot footer with one primary Play CTA. | Don't stack badges, lore, characters, screenshots, and cross-promos into one undifferentiated wall. |
| Use `tier-gold` for every tier, lock, price, and patron-status signal. | Don't use `accent` to signal patron status. |
| Reserve mono for system metadata with `tabular-nums`. | Don't set prose, titles, or handles in mono. |
| Keep status dots flat and pulseless without a live state. | Don't add pulse or glow shadows to static badges. |
| Keep HUD labels, icons, and focus rings at 100% opacity; dim chrome only. | Don't apply `opacity-*` to the toolbar element or ship disabled `(Coming soon)` actions. |
| Keep one kicker pill per section and two badges max on showcase titles. | Don't crown the $50 tier with full-width spans or differentiating perk copy in v1. |
| Reserve `comp-blue` for `/admin/*` comp badges. | Don't use `comp-blue` on patron-facing surfaces. |
