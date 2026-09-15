---
title: 'Story 1.3: Responsive Studio Showcase, Project Media Cards & Social Hub'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Visitors arriving at the Ropoductions web portal lack an atmospheric, responsive studio landing page to discover the studio's retro anime RPGs, preview gameplay and cast lore, and connect with official community channels.

**Approach:** Build a responsive studio showcase on `/` featuring a hero banner with key art and "Play Now with Patreon" CTA, project media cards showcasing the flagship RPG Maker MZ title *Final Orginity* (lore, character profiles, status badge) and upcoming Godot project ("Coming Soon"), an accessible responsive screenshot lightbox modal (using Radix UI Dialog), and a social hub linking to verified Patreon, Discord, and Twitter/X channels with `rel="noopener noreferrer"`, >=44px mobile touch targets, and zero horizontal scroll.

</frozen-after-approval>

## Implementation Notes

- Created responsive studio landing components in `src/components/`:
  - `src/components/studio-header.tsx`: Sticky navigation header with brand emblem, desktop/mobile navigation links, and "Play Now" CTA.
  - `src/components/hero-section.tsx`: Atmospheric hero section with 1500x500 key art banner (3:1 aspect ratio, `.pixelated`, ambient green aura), studio tagline, supported tiers ($5–$50) badge, and "Play Now with Patreon" CTA.
  - `src/components/project-showcase.tsx`: Showcase for *Final Orginity* featuring RPG Maker MZ engine badges, lore teaser, 4 character companion cards (Lyra, Kael, Morgana, Goruk), and interactive screenshot gallery; plus preview card for upcoming Godot 4 standalone title *Project Orginity 2: The Fallen Citadel* with "COMING SOON" badge.
  - `src/components/screenshot-lightbox.tsx`: Accessible modal lightbox using `@radix-ui/react-dialog` with keyboard navigation (`ArrowLeft`, `ArrowRight`, `Escape`), image preview, title/caption, and counter.
  - `src/components/social-hub.tsx`: Verified community links to Patreon, Discord, and Twitter/X with `rel="noopener noreferrer"` and `target="_blank"`.
  - `src/components/studio-footer.tsx`: Studio brand mark, 21+ compliance notice, quick navigation, and copyright.
- Created 9 retro pixel-art SVG media assets in `public/media/`:
  - Screenshots: `fo-title.svg`, `fo-dungeon.svg`, `fo-battle.svg`, `fo-dialogue.svg`.
  - Characters: `char-lyra.svg`, `char-kael.svg`, `char-morgana.svg`, `char-goruk.svg`.
  - Projects: `godot-teaser.svg`.
- Verified end-to-end via headless browser: hero banner scaling, character blurbs, screenshot lightbox opening and cycling, external link security attributes, zero horizontal scroll on mobile viewports (375px), and touch targets measuring >= 44x44 CSS pixels.

## Review Triage Log

- medium: `overflow-x-hidden` on outer container in `src/app/(portal)/page.tsx` prevents descendant `position: sticky` headers from sticking — patched with `overflow-x-clip`.
- low: Invalid Tailwind breakpoint `hidden xs:inline` in `studio-header.tsx` — patched to `hidden sm:inline`.
- low: Redundant `aria-label` on `Dialog.Content` in `screenshot-lightbox.tsx` overrode dynamic `Dialog.Title` — patched by removing attribute to let `aria-labelledby` announce the active screenshot title.
- low: Unused icon imports (`Sword`, `Wand2`) and unused `archetype` property in `project-showcase.tsx` — patched by removing unused imports and displaying archetype subtitle.
- low: Unused `accentText` property in `social-hub.tsx` — patched to tint social handle labels.
- low: Anchor jumps lacked smooth scroll animation — patched by adding `scroll-smooth` to `html` in `src/app/layout.tsx`.
- false: Godot project card lacks a playable CTA button — rejected, as FR-4 explicitly requires non-playable catalog items to display "Coming Soon" or "Desktop Download" status badges without a playable client.
- false: High-resolution banner has pixelated rendering artifacts — rejected, as DESIGN.md §5 and §183 mandate `.pixelated` (`image-rendering: pixelated; image-rendering: crisp-edges`) to preserve retro 16-bit aesthetic.
