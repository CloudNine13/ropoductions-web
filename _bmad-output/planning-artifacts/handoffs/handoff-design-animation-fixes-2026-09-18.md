# Handoff — DESIGN + motion review fixes (UI/UX + GSAP animation audits)

Date: 2026-09-18. From: design-review session (`docs/0-design-review-artifacts`, uncommitted). For: fixes session (fresh agent, full context below — start here, don't re-run the reviews).

## 1. Goal and non-goals

Implement the CODE fixes decided across two review sessions. DESIGN.md was already amended and is now normative — code yields to it everywhere except the 3 documented exceptions (HUD pill-in-pill, `rounded-2xl` large cards, logotype ALL-CAPS). Do NOT redesign, do NOT re-debate settled items (dissent log in §10), do NOT animate every element, do NOT install GSAP.

Out of scope (v1 prohibitions, do not build): cloud save sync, Godot web player, forums/comments, Stripe/PayPal/Subscribestar, merch store/admin panel, tier-differentiated perks/beta branches/cheat menus, `tailwindcss-animate`, GSAP install.

## 2. Git and policy (mandatory, from AGENTS.md)

- Current state: branch `docs/0-design-review-artifacts` holds ONLY review artifacts: `DESIGN.md` modified (+88/-26 across DESIGN+AGENTS+.gitignore), `.gitignore` + `AGENTS.md` + `skills-lock.json` touched/untracked. No code fixes applied yet.
- NEVER push to `develop`/`master`, NEVER commit on them, NEVER merge branches (only fast-forward your own branch over develop), NEVER work on `master`. ONLY the user merges PRs.
- Workflow: `git fetch origin` → `git checkout develop && git pull` → cut working branch FROM develop → commit → `git status` + `git diff` review → `git push -u origin <branch>` → open PR with base `develop` via `gh`. Then STOP and ask user to merge. Always give full PR link.
- Branch name: `<type>/<story-id>-<kebab-slug>`, types `feat|fix|chore|docs|refactor`. Suggested: `fix/4-2-design-motion-contract-fixes` (covers Epic 4 HUD + portal motion; if too big, split into `fix/portal-design-tokens-fixes` + `fix/play-hud-motion-fixes`).
- Commits/PR titles: Conventional Commits `<type>(<scope>): <imperative summary>`, scopes `portal|auth|play|save-hud|i18n|edge|db`. PR body MUST list story ID + FRs covered. Keep commits focused, one logical change each. Don't mention AI in messages.
- Worktree rule: create a separate worktree per session so parallel sessions don't collide (see prior handoff `handoff-review-fixes-2026-09-17.md` for the pattern; main dir may sit on a stale branch — verify with `git branch --show-current`).
- Secrets: never commit `.env*`, tokens, keys. Never log sensitive data. D1 via `db.prepare().bind()` only; migrations versioned in `migrations/`.

## 3. Where everything lives

- Normative DESIGN (already updated, base of all fixes): `_bmad-output/planning-artifacts/ux-designs/ux-ropoductions-web-2026-09-15/DESIGN.md` (251 lines; diff vs develop ≈ +88/-26 incl. AGENTS/.gitignore — see `git diff --stat`).
- Behavior twin (read, don't edit in this task): `.../ux-ropoductions-web-2026-09-15/EXPERIENCE.md` (has 5 known contradictions vs DESIGN — listed §8, fix only if trivially safe, else leave for docs session).
- Contracts: `_bmad-output/specs/spec-ropoductions-web/SPEC.md` (CAP-1..10), `save-and-runtime-contract.md`, `patron-tier-matrix.md` (v1 Uniformity Rule: all $5–$50 identical access), `_bmad-output/planning-artifacts/prds/prd-ropoductions-web-2026-09-15/prd.md` (FR-1..19, NFR-1..4, UJ-1 Alex / UJ-2 Marcus / UJ-3 Elena / UJ-4 Dave), `.../architecture/architecture-ropoductions-web-2026-09-15/ARCHITECTURE-SPINE.md` (AD-1..10; note AD-9 binds nonexistent CAP-11 — doc bug, don't fix here), `.../epics.md` (FR map, UX-DR1..7; has stale Cinzel/15+/bg-black refs — don't fix here).
- Sprint: `_bmad-output/implementation-artifacts/sprint-status.yaml` (epic-4 in-progress: 4-1 done, 4-2 review, 4-3/4-4 backlog; epic-5 backlog; 2 retro items open: callback dedupe, cookie-pattern doc).
- Prior handoff (context, not gospel): `_bmad-output/planning-artifacts/handoffs/handoff-review-fixes-2026-09-17.md`.
- Code under fix: `src/components/hero-section.tsx`, `project-showcase.tsx`, `patreon-paywall-card.tsx`, `save-hud-dock.tsx`, `game-viewport.tsx`, `age-gate-dialog.tsx`, `paywall-modal.tsx`, `language-switcher.tsx`, `screenshot-lightbox.tsx`, `social-hub.tsx`, `studio-header.tsx`, `auth-error-toast.tsx`, `src/app/(game)/play/page.tsx`, `src/app/globals.css`, `tailwind.config.ts`, `src/locales/{en,ja,es,ru,zh,pl}.json`.

## 4. What the review sessions already decided (don't relitigate)

DESIGN.md deltas now in the branch (code must conform):
- Frontmatter: `destructive #EF4444 → #E11D48` (sole red; `#EF4444` retired), added `comp-blue #38BDF8` (/admin ONLY), added `rounded 2xl:16px`.
- Colors table: `accent` = decor + Godot coming-soon ONLY, never patron status; `tier-gold` = ALL tier/lock/price/patron signals; new `comp-blue` row; `destructive` row.
- Typography: Chakra Petch canonical (+ `cinzel` compat ban), sentence-case + ≤12-char micro-badge rule, SOLE exception logotype `ROPODUCTIONS` in hero H1 + header brand only, mono = metadata only (`tabular-nums`), contrast AA 4.5:1 floor + 7:1 aspiration, no <12px except mono, muted never <100% alpha on card.
- Elevation: Layer 0 = 1 scrim div + 1 aura ≤0.15 over 1 eager image (separate top-blend divs banned); Layer 1 token shadow, header blur sole exception; Layer 2 chrome-only dim (NEVER `opacity-*` on toolbar); Layer 3 0ms reduced-motion; Z-scale `game z-40 / dialogs z-50 / destructive z-60`.
- Shapes: `sm 4 / md 8 / lg 12 (=Tailwind xl) / 2xl 16 (=Tailwind 2xl) / full`; small surfaces `lg`, large elevated cards `2xl` standard; HUD pill-in-pill exception; kicker budget 1/viewport + showcase badge row max 2; no `scale-*` on `.pixelated` ever; reduced-motion 0ms; `transition-all` banned; dead `animate-in` must be removed.
- Components: §0 locked Icon Map; HUD (static sibling standard / overlay+44px FAB fullscreen-expanded-default / never disabled actions / Export label always visible); language trigger `Globe` + code canonical, flags progressive-enhancement; gallery `<article>` pattern; new §6 Admin, §7 Auth toast, §8 Save dialogs (no typed RESET per FR-16).
- Motion Contract (binding, 10 points): CSS+GSAP kill-switches, ambient ban (sole pulse = /play loading), no-JS SSR-visible + `from/immediateRender:false`, focus/SR/i18n/contrast rules, approved budget KEEP 3 + foundations (§6), GSAP re-entry gate (no install v1).

## 5. Fix ledger A — UI/UX contract (code yields to DESIGN)

P0 (ship-blockers):
1. `patreon-paywall-card.tsx:33-36,61` + `play/page.tsx:67` — `accent → tier-gold` for lock well, badge, all 5 prices, session tier pill. Keep glow hue if bound to token. Cites DESIGN Colors, FR-7/8, Uniformity Rule.
2. `patreon-paywall-card.tsx:79,87` — pill CTAs → `rounded-md`. Only HUD may be pill.
3. `globals.css:14,48` + `tailwind.config.ts:28` — `destructive #EF4444 → #E11D48` in `@theme`, `:root`, tailwind extend. `save-hud-dock` already `#E11D48` — unifies split reds.
4. `auth-error-toast.tsx:49-59` — `rose-500/400/200 → destructive` family (`border-destructive/50 bg-card/95 text-destructive`); `role="alert"` KEEP, drop `aria-live="polite"` (implicit assertive; conflict double-announces). Close already 44px — keep.
5. `hero-section.tsx:40-75` — collapse 4 scrims → 2 (merge tint+radial into ONE div, delete `bg-gradient-to-b`, keep aura clamped `0.16 → 0.15`); delete `BACKDROP_SLIDES[1]` + 5s interval + 2000ms crossfade (cap 600ms); remove `.pixelated` from BOTH hero Images (keep on `studio-logo.webp:87` only); delete `animate-pulse` + glow dot `:95` (flat `h-2 w-2 bg-primary`); tier pill demoted under Play CTA (`order-last`, `max-w-full truncate`); H1 keeps literal but add `break-words max-w-full leading-[1.1]`.
6. `save-hud-dock.tsx:170-172,189,207,224,249` — delete `opacity-25/100` toggle → chrome-only dim (`bg-[#090A0F]/40 border-white/5` when dimmed, labels/icons/rings always 100%); Export label always visible (icon+short label, dock `max-w-[calc(100dvw-2rem)] overflow-x-auto`, labels `whitespace-nowrap`); delete `isExportDisabled/isImportDisabled/isResetDisabled` + `disabled` + `(Coming soon)` titles — wire real handlers in `play/page.tsx:81` via save-bridge/JSZip (FR-14/15/16 mandatory; EXPERIENCE Flow 2 says Export immediately works); if a handler truly can't ship, omit the button.
7. `game-viewport.tsx:173,189` — `z-50 → z-40`; standard layout renders dock as STATIC SIBLING below canvas (not `absolute` inside); `absolute` overlay + collapse FAB only when `activeFullscreen`; viewport Escape handler no-ops while any `role=dialog[data-state=open]`; add `isHudCollapsed` state (44px FAB, `aria-expanded`, `aria-controls`, resets on fullscreen exit; default expanded); dock container `pointer-events-none`, pill `pointer-events-auto`.

P1 (a11y floor):
8. `paywall-modal.tsx:56` close `h-9 w-9 → h-11 w-11` (44px).
9. `globals.css:74-130` — add `@media (prefers-reduced-motion: reduce){ .age-gate-overlay,.age-gate-content{animation-duration:.01ms !important} }` + global kill-switch from Motion Contract §1.
10. Missing focus rings — add `focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none` to `hero-section.tsx:120,128`, `project-showcase.tsx:155`, `social-hub.tsx:102`, `studio-header.tsx:81` (age-gate + HUD already correct — copy that pattern).
11. `age-gate-dialog.tsx:102` disclaimer `text-[11px]/70% → text-xs text-muted-foreground` (+ `text-balance`).
12. `project-showcase.tsx:234` hardcoded English aria-label → `aria-label={`${t("expandScreenshot")}: ${shot.title}`}` (key already in all 6 locales); add focus-return on lightbox close (`triggerRefs` + `requestAnimationFrame focus`, test it).
13. `language-switcher.tsx:118,126-130,148,183` — trigger `aria-label` includes current locale (`${t("select")}: ${activeLocaleInfo.nativeName}`); prepend `Globe aria-hidden`; remove `role=group` wrapper (menuitemradio direct children of menu); `aria-hidden` on Chevron + Check; add `saveHudExportComingSoon`-style locale keys if keeping any disabled state (prefer deleting disabled state per #6).
14. `social-hub.tsx:87` handles `font-mono → text-sm font-semibold` (keep accent color); version/copyright row stays mono.
15. `project-showcase.tsx:190` char badges `text-tier-gold → text-primary` (gold is reserved patron signal; lore is not patronage). Godot `:288/:309` accent coming-soon stays (non-patron roadmap = legit accent).

P2 (shape/semantics/rhythm):
16. `project-showcase.tsx:187,242,281` — delete both `group-hover:scale-105` (keep `transition-colors`/border shift); remove `.pixelated` from `.svg` shots/portraits/teaser (vectors never pixelated; if any ARE true pixel rasters served as svg, re-serve as raster instead — ask user).
17. Radii normalization per tie-break (ZERO churn on large cards): large `rounded-2xl` stays (paywall:30, modal:51, showcase:118,273, social:70); REMOVE `backdrop-blur` where opacity ≥90% + `shadow-2xl → token shadow`; `rounded-full` → `rounded-sm` on micro pills (hero badge:94, paywall badge:36, prestige kicker, char badge:190); language trigger keeps `rounded-lg`, dropdown `rounded-xl → rounded-lg`.
18. `project-showcase.tsx:229-266` gallery cards — restructure `<button><h5><p>` (invalid + outline-breaking) → `<article>` + inner expand `<button className="absolute inset-0">` + `<span>` title + `<p>` caption (pattern in DESIGN §5). Keep `aria-label` from #12.
19. `patreon-paywall-card.tsx:49-55` — delete `idx===4 ? sm:col-span-2` (crowns $50, violates Uniformity); uniform `grid-cols-1 sm:grid-cols-2`, hover `border-tier-gold/40`; rewrite all 5 descs to uniform access copy (see §7) — names/prices stay per CAP-3/FR-7.
20. Icons (DESIGN §0): social-hub `Heart→Lock` (Patreon), `MessageSquare→MessagesSquare` (Discord), `Sparkles→AtSign` (X); showcase screenshots header `Maximize2→Images` (keep Maximize2 only in hover-expand chip); `play/page.tsx:68` `Sparkles→Lock`, pill `accent→tier-gold`, add `max-w-[38vw] truncate` + `title={tier_name}`; `social-hub.tsx:64` grid `md:→lg:` breakpoint (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`).
21. Kicker budget: keep hero `studioBadge`, showcase `prestigeBadge`, paywall `badge`; DEMOTE showcase row to 2 (`badgeRpgMaker` + `badgePatronAccess`; `badgeHtml5`/`badgeActiveChapter` → caption text), social `officialChannels` → section `aria-label` + plain caption.

## 6. Fix ledger B — motion (CSS-only v1; GSAP REJECTED)

KEEP 3 (only these animate beyond foundations):
- K1 loading: `/play` determinate bar (`scaleX`, origin left, 150ms linear rAF ticks, `aria-valuenow`) + sanctioned emblem pulse (opacity 1→0.6, scale 1→1.04, 1600ms in-out infinite, stops on interactive; static + instant bar jumps under reduced-motion). Implement the skeleton EXPERIENCE:91 specifies (`game-viewport`/`play/page` currently render iframe only — no skeleton/progress/onError/403 fallback).
- K2 toast/banner: `translateY ±8px` + opacity, 200–250ms `ease-out cubic-bezier(0.16,1,0.3,1)` on mount (query-param banners + `auth-error-toast`); 0ms reduced-motion; dismiss clears `?auth_error` via history-replace (already does — keep).
- K3 HUD swap: fixed 44px box, 700ms linear spinner during JSZip build → 150ms check, 2s hold, revert; reduced-motion static icon + "Exporting…" text.
Foundations (keep, add guards): age-gate dissolve opacity 200ms; overlay/drawer/menu/lightbox fade-only ≤150ms (scale ≤0.02 if any); surfaces `transition-colors 150ms`; HUD chrome-only dim 300ms; hero decode crossfade ≤600ms image-only. Every animated class gets `motion-reduce:transition-none motion-reduce:animate-none motion-reduce:duration-0`; age-gate keyframes get the reduce block (#9).
KILLED (do not implement): hero entrances, scroll reveals (neither GSAP batch nor IO — anti-slop wins; page is ~300vh but no FR requires reveals), SplitText, parallax/pin/scrub, Flip, Smoother, magnetic, marquee, wiggle, tilt, shimmer, scramble, bounce. Delete dead `animate-in*` classes in `screenshot-lightbox:69,71`, `language-switcher:139`, `studio-header:92` (no plugin — no-ops misleading readers). `transition-all → transition-colors` on cards (`showcase:179,233`, `social:70,102`).

## 7. Copy + locale tasks (`src/locales/*.json` × 6: en,ja,es,ru,zh,pl)

- Tier descs uniform (FR-8 names+prices listed, benefit line identical): all `tier1..5Desc` → `Full web game access — identical across all $5–$50 tiers` (translate, don't leave English in non-EN files). Fixes implied-perk violation (`Early Chapter Updates`, `Exclusive Discord Role`, `VIP Studio Lounge`).
- Add keys: `saveHudExportComingSoon` (only if #6 keeps a disabled state — prefer not), trigger current-locale name (see #13), keep `expandScreenshot` (already present — wire it per #12).
- Sentence-case debt (out of scope for code PR unless trivial): `en.json` section titles (`PROJECT SHOWCASE`, `COMMUNITY & SOCIAL HUB`, etc.) violate DESIGN sentence-case — track, don't bulk-edit locales here (needs translator pass for 6 files).
- Char/screenshot `badge` strings: keep, but they render `text-primary` after #15 (no copy change).

## 8. Known doc contradictions (read-only; fix code to DESIGN, leave docs except where noted)

- `EXPERIENCE.md:79` (pixelated hero + aura 0.12) yields to DESIGN (natural JPEG + 0.15). `:73` flag-emoji vs `:111` zero-emoji — DESIGN exception wins; amend ONLY if touching the file anyway (one line per debate). `:91` pulsing emblem vs flat-dot — scope split already in DESIGN (loading exception). `:67` RESET typing yields to FR-16 (explicit confirm only — already in DESIGN §8). `:60-62` HUD 25% invariant yields to chrome-only dim. `epics.md:58,63,141` Cinzel, `:52,132` Next 15+, `:65,336` `bg-black/75`, ARCH-SPINE `:113` CAP-11 — stale, separate docs session. `tailwind.config.ts` radii/tokens + `destructive` — FIX here (§5.3), it's code.

## 9. Verify (read package.json + configs FIRST per AGENTS.md — commands below are from the manifest, re-check before running)

- `npx tsc --noEmit`
- `npm run test:unit` (node --test suite; last known 98–200 pass depending on epic — re-baseline)
- `npm test` (needs `npx wrangler d1 migrations apply DB --local` first; runs verify-d1-schema + verify-patreon-oauth)
- `npm run build:next` (webpack prod build, 0 errors/warnings gate)
- `npm run test:e2e` (Playwright; needs `npm run start -p 3100` or configured baseURL — check `playwright.config.ts`; stale next-servers on 3000/3100/3101 were a recurring confusion — kill + `curl` to confirm live code)
- Manual: 375px + 768px + 1440px; `prefers-reduced-motion` emulate; RU locale (expansion) + JA/ZH (breaks); keyboard-only tab through age-gate/HUD/lightbox; SR spot-check lightbox focus return + locale names; LCP sanity (one eager banner, no 2s fade).
- Scanner: `node .agents/skills/kill-ai-slop/scripts/scan.mjs src --json` — confirm gradient/pulse/pill/scale groups drop; keep pinned `deslop-ignore 06` legibility exception.

## 10. Debate log (why winners won — cite in PR if challenged)

- Radii `2xl` (B wins): 16px proportional on 672px p-6..p-10 cards; 6-file churn across merged Epics 1/2 for zero user gain loses; radius ≠ LCP. Mapping fixed: DESIGN `lg`=12px=Tailwind `xl`, `2xl`=16px standard for large cards.
- HUD pill-in-pill (ergonomics wins): `rounded-md` rects inside 64px pill break fill continuity + 44px bleed; UX-DR4 never specified inner radius → carved exception, not discipline breach.
- `comp-blue` (add wins): comp sessions carry `pledge_cents=0` — gold on them is a signal lie worse than a new hue; isolated `(admin)` layout, 8.5:1 contrast, AD-10/FR-20-21 require the distinction.
- Wordmark ALL-CAPS (exception wins): 12 chars + banner/Header already Latin `ROPODUCTIONS` in all 6 locales; sentence-case rule stays for prose.
- Dimming chrome-only (AA wins): whole-toolbar opacity mathematically cannot hold 4.5:1 (`white/90 @25%` ≈ 2:1) + dims focus rings (2.4.7); NFR-4 non-negotiable.
- Fullscreen FAB expanded-default (FR-14 wins): auto-collapse hides the primary Export action + breaks 2.4.3 order; DESIGN:171 affordance is user-invoked only.
- Standard HUD sibling (docs win): absolute-inside-canvas overlays MZ touch buttons; DESIGN + Don't already forbid.
- Age-gate Escape-prevent (legal wins): dismissable dialog = bypass; `Exit→google.com` is the hatch; add regression test, don't remove.
- Disabled toolbar (forbid wins): 3/4 dead buttons + SR-invisible `title` tooltips violate FR-14/15/16 + Flow 2 + 4.1.2; wire or omit.
- Paywall uniform (Uniformity wins over FR-8 "benefits" reading): names+prices satisfy identifiability; benefit line uniform; `col-span-2` crowns $50.
- GSAP reject (bundle wins): 40-45kB gzip + 90-180ms parse on LCP route for 2 patterns CSS does at 0kB; re-entry only for scrub/pin/containerAnimation/seek. Scroll reveals killed even in CSS (generic second voice; no FR).

## 11. Suggested work order (strict; one focused commit each)

1. Tokens: `globals.css` + `tailwind.config.ts` destructive/radii/comp-blue (#3 + radii part of #17).
2. Hero collapse (#5) — biggest LCP/aura win; verify LCP + reduced-motion.
3. Paywall gold + shape + uniform copy (#1,#2,#19 + §7 tier descs).
4. HUD dim/labels/handlers + viewport sibling/FAB/z-scale (#6,#7).
5. Toast tokens + live-region (#4).
6. A11y batch: modal close, disclaimer, focus rings, lightbox label+return, language naming (#8–#13).
7. Showcase/social semantics + icons + kickers + badges (#14–#21).
8. Motion cleanup: kill-switch, dead classes, `transition-all`, guards (ledger B).
9. Locales × 6 + `tsc` + unit + `npm test` + `build:next` + e2e + slop scan (§9).
10. PR to `develop` (story 4-2 + FR-8/9/10/14/15/16, NFR-1/4 in body) → stop, user merges.

## 12. Quick-start for the fixes agent (first 15 minutes)

1. `git fetch origin && git status && git branch --show-current && git log --oneline -5` — confirm where you are; cut the `fix/...` branch from `develop`.
2. Read DESIGN.md §§ Colors→Motion Contract→Components §§0-8 + Do's/Don'ts (normative), then this handoff §5 in file order.
3. `rg -n "accent|#EF4444|rounded-full|animate-pulse|scale-105|animate-in|transition-all|opacity-25" src` — reproduces the hit-list; triage against §5 before editing.
4. Start with ledger item #3 (tokens) — everything else keys off it. Run `npx tsc --noEmit` after each commit.
5. If blocked (e.g. `.svg` pixel-raster question in #16, import/reset dialog location for §4-§8 — `save-hud-dock` delegates to props, no dialog component found under `src/components/save-*`), park it as a follow-up commit, don't guess. Ask the user rather than weakening DESIGN.
