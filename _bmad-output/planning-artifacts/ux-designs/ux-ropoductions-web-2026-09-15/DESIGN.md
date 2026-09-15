---
name: Ropoductions Studio
description: Atmospheric, prestige dark aesthetic for adult indie game studio Ropoductions. shadcn/ui on Next.js + Tailwind CSS with custom obsidian, crimson, and gold brand tokens.
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
  ring: '#E11D48'
  destructive: '#EF4444'

  # Studio Accents
  primary: '#E11D48'             # Crimson Flame
  primary-foreground: '#FFFFFF'
  primary-hover: '#BE123C'
  accent: '#F59E0B'              # Blood Amber
  accent-foreground: '#090A0F'
  tier-gold: '#FBBF24'           # Patron Tier Badge Gold
  tier-gold-foreground: '#181204'

typography:
  display:
    fontFamily: 'Cinzel, serif'
    fontSize: 44px
    fontWeight: '700'
    lineHeight: '1.15'
    letterSpacing: '0.04em'
  display-sm:
    fontFamily: 'Cinzel, serif'
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
  full: 9999px
spacing:
  touch-target: 44px
  hud-dock: 64px
components:
  button-primary:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    radius: '{rounded.md}'
    border: '1px solid #F43F5E'
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

Ropoductions is an independent adult game studio crafting immersive, narrative-driven experiences. The visual identity breaks firmly away from the low-budget, noisy cliches of conventional adult web portals. Drawing inspiration from prestige creative studios like **Bungie**, **Annapurna Interactive**, and **Riot Games**, the aesthetic is mature, art-forward, and atmospheric.

The experience feels like walking through a private, dimly lit digital exhibition:
* **The Atmosphere:** Cosmic black and deep obsidian surfaces let character concept art and game visuals take center stage.
* **The Voice:** Confident, polished, and direct. The studio takes its craft seriously.
* **The Accent:** Crimson flame highlights convey passion, danger, and mature intensity, balanced by warm amber and gold accents reserved for patron supporters.

---

## Colors

| Token | Hex | Role | Usage |
|---|---|---|---|
| `background` | `#090A0F` | Canvas Base | Primary portal background, deep dark canvas. |
| `background-secondary` | `#0F111A` | Surface | Secondary page sections, hero gradient underlays. |
| `card` | `#121522` | Surface Raised | Game cards, paywall tier boxes, modal dialogs. |
| `border` | `#23283E` | Structural Edge | Card borders, dividers, HUD outer strokes. |
| `primary` | `#E11D48` | Crimson Brand | Primary CTAs ("Play Now"), key interactive triggers. |
| `accent` | `#F59E0B` | Blood Amber | Highlight banners, secondary action indicators. |
| `tier-gold` | `#FBBF24` | Patron Honor | Tier status badges, supporter recognition elements. |
| `foreground` | `#F8FAFC` | Text Primary | Headlines, active navigation links, modal body text. |
| `muted-foreground` | `#94A3B8` | Text Secondary | Captions, metadata, changelogs, footer copyright. |

---

## Typography

* **Display (`Cinzel`):** Classical cinematic serif used for studio brand marks, section headlines, and modal titles. Conveys timeless fantasy, narrative gravitas, and luxury.
* **Body (`Geist Sans` / `Inter`):** Clean, neutral, high-legibility geometric sans-serif for UI labels, descriptive blurbs, HUD buttons, and system notices.
* **Mono (`Geist Mono`):** Used strictly for version badges (`v1.2.0`), save file timestamps, and technical storage diagnostics.

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

* **Layer 0 (Base Canvas):** Background `#090A0F` with subtle radial gradient glow behind the hero character.
* **Layer 1 (Cards & Showcases):** Card surface `#121522` with 1px border `#23283E` and subtle drop shadow (`box-shadow: 0 10px 30px -10px rgba(0,0,0,0.8)`).
* **Layer 2 (Floating Save HUD Dock):** Frosted glass (`rgba(9, 10, 15, 0.75)` with `backdrop-filter: blur(16px)`), elevated with 1px white/10 edge stroke.
* **Layer 3 (Modals & Age Gate):** High elevation with dark vignette underlay (`bg-black/80 backdrop-blur-xl`), trapping focus completely.

---

## Shapes & Radii

* **Micro Elements (Tags, Badges, Tooltips):** `rounded-sm` (4px).
* **Interactive Buttons & Input Fields:** `rounded-md` (8px).
* **Cards, Modals & Lightboxes:** `rounded-lg` (12px).
* **Floating Web HUD Dock:** `rounded-full` (pill shape) for organic, unobtrusive floating ergonomics.

---

## Components

### 1. Age Gate Dialog (21+)
* Full-screen blocking modal overlay (`z-50`).
* Dark obsidian card (`#121522`) with subtle red glowing top border.
* Title in `display-sm`: *"21+ Age Verification Required"*.
* High-visibility Primary CTA: *"I am 21 or older — Enter Studio"* (`bg-primary`).
* Secondary Exit Button: *"Exit"* (`text-muted-foreground hover:text-white`).

### 2. Patreon Paywall Card
* Visual tier matrix showing the 5 supporter ranks.
* Clear lock icon with gold accent glow.
* High-prominence *"Login with Patreon"* pill button featuring official Patreon brand red (`#FF424D`).

### 3. Floating Save HUD Dock
* Positioned bottom-center of the `/play` route.
* Subtle pill shape with icon + label layout:
  * 💾 **Export (.zip)**: Primary action with download arrow.
  * 📥 **Import**: Opens file picker dialog.
  * ⛶ **Fullscreen**: Expands canvas to native device display.
  * ⚙️ **Reset**: Small utility gear triggering wipe confirmation.
* Auto-dimming: After 4 seconds of mouse/touch inactivity, the dock opacity gently lowers to 30%, returning to 100% on hover/tap.

### 4. Language Switcher
* Compact select trigger with globe SVG icon (from Lucide).
* Dropdown menu with frosted-glass panel (`bg-card/90 backdrop-blur-md border border-border`).
* Hover states with 150ms smooth transition, showing active locale checkmark.
* Touch target 44x44px for mobile header/footer placement.

---

## Do's and Don'ts

| Do | Don't |
|---|---|
| Use rich blacks, subtle vignette shadows, and generous negative space. | Don't use harsh pure white backgrounds or high-saturation rainbow colors. |
| Present the studio with the dignity of an indie art house. | Don't use flashing banners, abrasive popups, or intrusive clickbait ads. |
| Keep the Save HUD docked and unobtrusive during gameplay. | Don't overlap save controls directly over in-game action or movement buttons. |
| Use clear, unambiguous microcopy for save export and import. | Don't use vague labels like "Sync" when action is a local file download. |
