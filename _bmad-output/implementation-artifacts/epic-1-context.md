# Epic 1 Context: Studio Presence, Multilanguage Web Shell & 21+ Age Compliance

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Establish the public web foundation, brand presence, and compliance infrastructure for Ropoductions. This epic delivers the Next.js runtime environment on Cloudflare Workers, enforces a legally mandatory 21+ age verification gate to protect mature gaming content, creates an atmospheric and responsive studio landing page showcasing game media and social channels, and integrates an accessible, edge-compatible multilanguage web shell to support international audiences across desktop and mobile devices.

## Stories

- Story 1.1: Project Scaffolding, OpenNext Runtime & Design System Tokens
- Story 1.2: Mandatory 21+ Age Gate Modal with Cookie Persistence
- Story 1.3: Responsive Studio Showcase, Project Media Cards & Social Hub
- Story 1.4: Multilanguage Web Shell & Accessible Language Selector

## Requirements & Constraints

- **Mandatory 21+ Age Verification Gate:** All visitors without an existing verified cookie must encounter a full-screen blocking modal immediately upon arrival. Access to underlying portal content, media, and interactive routes must remain blocked until the visitor self-attests they are 21 or older. Declining verification must immediately redirect the browser to a safe external site (such as Google).
- **Age Gate Persistence:** Confirmed age status must be stored in a client-side cookie (`ropoductions_age_verified=true`) with a 5-day lifetime (432,000 seconds, locked per project owner decision) so that returning visitors are not repeatedly prompted. Clearing browser storage resets the gate.
- **Responsive Studio Identity & Showcase:** The public home page (`/`) must showcase studio branding, key art banners, lore summaries, and prominent calls-to-action ("Play Now with Patreon" and "Enter Game"). The layout must adapt fluidly from mobile viewports (320px+) to desktop with zero horizontal overflow.
- **Project Media Cards & Lightbox:** Showcase the studio's primary RPG Maker MZ title with character blurbs, story teasers, and a screenshot gallery where clicking any image opens an accessible, responsive modal lightbox. Future or non-playable projects (such as upcoming Godot titles) must display clear status badges (e.g., "Coming Soon").
- **Community Hub Links:** Verified links to Patreon, Discord, and Twitter/X must open safely in a new browser tab with `rel="noopener noreferrer"` and `target="_blank"`.
- **Multilanguage Localization:** Provide an accessible language switcher in the header and footer supporting initial locales (`EN` default, `JA`, `ES`, `RU`, `ZH`). Switching languages must update all portal microcopy and notices instantly without requiring a full page refresh, persist the selection in a 365-day cookie (`ropoductions_lang`), and gracefully fall back to English for missing keys without rendering raw translation keys.
- **Performance:** Initial landing page Largest Contentful Paint (LCP) must remain under 1.8 seconds on standard broadband connections.
- **Accessibility & Contrast:** Touch targets across all mobile interactive elements (age gate buttons, language switcher, lightbox controls, navigation links) must measure at least 44x44 CSS pixels. Color contrast must satisfy WCAG AA (at least 4.5:1, targeting 7:1+ for body text on dark obsidian surfaces). System animations must respect `prefers-reduced-motion`.

## Technical Decisions

- **Framework & Runtime Architecture:** Next.js 15+ App Router compiled with `@opennextjs/cloudflare` targeting the Cloudflare Workers serverless runtime. All server routes and edge middleware must use standard Web Fetch API `Request` and `Response` objects; unsupported Node.js native runtime modules (`fs`, `net`, `child_process`) are prohibited.
- **Styling & Design System Tokens:** Tailwind CSS 4+ configured with custom studio design tokens:
  - Base background: `#090A0F` (obsidian canvas)
  - Secondary background: `#0F111A` (surface gradient underlay)
  - Card & modal surface: `#121522`
  - Structural borders: `#23283E`
  - Primary brand accent: `#E11D48` (crimson flame)
  - Secondary accent: `#F59E0B` (blood amber)
  - Patron tier gold: `#FBBF24`
  - Text primary: `#F8FAFC`, text secondary / muted: `#94A3B8`
- **Typography:**
  - Display & Headings: `Cinzel` serif for cinematic narrative weight, brand titles, and section headers.
  - Body & Microcopy: `Geist Sans` or `Inter` for clean, high-legibility UI microcopy, descriptions, and button labels.
  - Monospace: `Geist Mono` for version badges and technical metadata.
- **UI Primitives & Iconography:** Radix UI primitives (`@radix-ui/react-dialog`, dropdown menu) paired with Lucide React SVG icons. Bare emojis as UI icons are prohibited.
- **Localization Strategy:** Edge-compatible dictionary localization (`next-intl` or structured JSON dictionary files under `src/locales/[locale].json`) with automatic fallback to English.
- **State & Cookie Conventions:**
  - Age Verification: `ropoductions_age_verified` (valid 5 days / 432000s, `SameSite=Lax`, `Secure`, locked per owner decision).
  - Language Selection: `ropoductions_lang` (valid 365 days, `SameSite=Lax`).
- **File Organization:** Components, routes, and utilities use `kebab-case` naming (`age-gate-dialog.tsx`, `language-switcher.tsx`). Public studio pages reside within the route group `src/app/(portal)/`.

## UX & Interaction Patterns

- **First-Time Arrival Flow (21+ Gate):**
  - Visitors arriving without a valid age verification cookie see the entire background page set to `aria-hidden="true"` behind a dark blurred overlay (`bg-black/80 backdrop-blur-xl`).
  - Focus is trapped strictly within the modal dialog (`role="dialog"`, `aria-modal="true"`), auto-focusing the primary confirmation button ("I am 21 or older — Enter Studio").
  - Confirming triggers a smooth 200ms ease-out dissolution of the modal, sets the 5-day cookie, and restores user interaction with the page.
  - Declining triggers immediate window redirection to `https://google.com`.
- **Studio Showcase Exploration:**
  - Hero banner with subtle radial lighting behind character artwork, framing the studio tagline and primary action button.
  - Media gallery allows clicking screenshots to expand into an accessible lightbox overlay with keyboard navigation support (Escape to dismiss, Arrow keys to navigate).
  - Hover states on cards, buttons, and social triggers use smooth 150–200ms transitions and distinct focus rings (`ring-2 ring-primary ring-offset-2`).
- **Language Switcher Interaction:**
  - Compact trigger featuring a Lucide globe icon and active language code in the header and footer.
  - Clicking opens a frosted-glass dropdown menu (`bg-card/90 backdrop-blur-md border border-border`). Selecting a language re-renders page copy immediately, updates the active checkmark, and stores the preference.
- **Voice & Aesthetic Tone:**
  - Artistic prestige identity inspired by high-end gaming studios (such as Bungie or Annapurna Interactive), avoiding low-budget adult website cliches, intrusive popups, or neon advertisements.
  - Tone is confident, atmospheric, respectful, and direct. Microcopy avoids juvenile internet slang or clinical developer jargon.

## Cross-Story Dependencies

- **Story 1.1 precedes Stories 1.2, 1.3, and 1.4:** Project scaffolding, OpenNext compilation substrate, Tailwind design tokens, and font loaders must be operational before building components and layouts.
- **Story 1.2 and Story 1.4 wrap Story 1.3:** The age gate provider and language context envelop the public portal layout and studio landing page.
- **Downstream Epic Foundations:** Epic 1 establishes the root layout, design system, and public shell that subsequent epics build upon—specifically mounting Patreon authentication and the paywall card (Epic 2), the responsive game player container (Epic 3), and the floating save HUD dock (Epic 4).
