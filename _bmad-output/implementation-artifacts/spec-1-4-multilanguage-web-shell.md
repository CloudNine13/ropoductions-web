---
title: 'Story 1.4: Multilanguage Web Shell & Accessible Language Selector'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** International visitors and players across various regions (Spain/Latin America, English-speaking regions, Russia, Poland, Japan, China) lack native language support on the Ropoductions web portal, making the 21+ age gate, game showcase lore, character blurbs, community hub, and web shell inaccessible in their preferred language.

**Approach:** Build an edge-compatible multilanguage web shell supporting core locales (Spanish, English, Russian, Poland/Polish, Japanese, Chinese) with an accessible language switcher dropdown in the header and footer (flag emojis, frosted glass dropdown, >=44x44px touch targets). Selecting a language updates all portal text instantly without page reload, persists the preference in a 365-day `ropoductions_lang` cookie, and gracefully falls back to English for any missing keys without rendering raw translation keys.

</frozen-after-approval>

## Implementation Notes

- Created 6 complete JSON localization dictionaries in `src/locales/`:
  - `en.json`: English (EN 🇬🇧) baseline dictionary.
  - `es.json`: Spanish (ES 🇪🇸) complete dictionary.
  - `ru.json`: Russian (RU 🇷🇺) complete dictionary.
  - `pl.json`: Poland / Polish (PL 🇵🇱) complete dictionary.
  - `ja.json`: Japanese (JA 🇯🇵) complete dictionary.
  - `zh.json`: Simplified Chinese (ZH 🇨🇳) complete dictionary.
- Created `src/lib/i18n.tsx`:
  - Defined supported locales (`es`, `en`, `ru`, `pl`, `ja`, `zh`) with Spain, English, Russian, and Poland as primary default languages per user directive.
  - Integrated `deepMerge` recursive fallback guaranteeing any missing keys in non-English dictionaries cleanly fall back to English values.
  - Configured `ropoductions_lang` cookie persistence with 365-day lifetime (`max-age=31536000; SameSite=Lax; Secure`).
  - Implemented `I18nProvider` wrapping `NextIntlClientProvider` with `timeZone="UTC"`, client-side cookie sync, and instant re-render state.
- Created `src/components/language-switcher.tsx`:
  - Trigger button displaying active country flag emoji (🇪🇸, 🇬🇧, 🇷🇺, 🇵🇱, 🇯🇵, 🇨🇳) and uppercase language code, with >=44x44px touch target.
  - Frosted-glass dropdown panel with `role="menu"`, `aria-label`, `role="group"`, and `role="menuitemradio"` with `aria-checked` state.
  - WAI-ARIA keyboard navigation supporting `Escape`, `ArrowDown`, `ArrowUp`, `Home`, and `End`.
  - Added `lang={locKey}` attribute to each native language name to comply with WCAG 3.1.2.
  - Configured `placement` prop: `"bottom"` for header and `"top"` for footer to prevent viewport clipping.
- Integrated language switcher and localized microcopy across all portal components:
  - `src/components/studio-header.tsx`: Header navigation links, Play Now button, and `<LanguageSwitcher placement="bottom" />`.
  - `src/components/studio-footer.tsx`: Studio subtitle, quick links, 21+ compliance notice, localized copyright, and `<LanguageSwitcher placement="top" />`.
  - `src/components/age-gate-dialog.tsx`: 21+ compliance title, mature description, legal warnings, enter/exit actions, and top-right language switcher.
  - `src/components/hero-section.tsx`: Studio badge, tagline, supported tiers note, and CTA buttons.
  - `src/components/project-showcase.tsx`: Game titles, badges, lore summaries, 4 companion profiles, 4 screenshot captions, Godot project teaser, and localized status banner.
  - `src/components/screenshot-lightbox.tsx`: Accessible lightbox dialog with localized counter (`t("counter")`), navigation labels, and zero-length defensive guard.
  - `src/components/social-hub.tsx`: Community cards for Patreon, Discord, and Twitter/X with localized descriptions and CTA buttons.
  - `src/app/layout.tsx`: Server-side `ropoductions_lang` cookie resolution for zero-flicker initial render and `suppressHydrationWarning`.
- Verified end-to-end via headless browser automation:
  - Instant text translation without page reload across English, Spanish, Russian, and Polish.
  - Correct `ropoductions_lang` cookie persistence across new browser sessions.
  - Zero horizontal overflow on 375px mobile viewports.
  - All interactive buttons and touch targets meet or exceed 44x44 CSS pixels.
  - Local dev server successfully running on `http://localhost:3000`.

## Review Triage Log

- medium: Localize hardcoded Godot project status string — patched with `godotStatusNote` across all 6 locale dictionaries.
- medium: Implement arrow key cycling for language dropdown keyboard navigation — patched with ArrowDown, ArrowUp, Home, End navigation.
- low: Restore zero-length guard in lightbox navigation callbacks — patched with `if (total === 0) return;`.
- low: Fix missing target element for dropdown aria-labelledby attribute — patched with `aria-label={t("select")}`.
- low: Use menuitemradio and aria-checked to expose active language state to screen readers — patched.
- low: Add presentation role to non-menu item wrapper elements inside role="menu" — patched with `role="presentation"` and `role="group"`.
- low: Add lang attribute to native language names for correct screen reader pronunciation — patched with `lang={locKey}`.
- low: Use localized lightbox.counter translation strings — patched with `t("counter", { current, total })`.
- low: Add suppressHydrationWarning to `<html>` tag — patched.
- user-directive: User requested country flag emojis over world icon — updated trigger and menu items to display flag emojis (🇪🇸, 🇬🇧, 🇷🇺, 🇵🇱, 🇯🇵, 🇨🇳).
- user-directive: User requested default languages to be Spanish, English, Russian, Poland — verified and configured `es`, `en`, `ru`, `pl` as primary default languages.
