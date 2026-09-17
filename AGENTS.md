<!-- bmad:context -->
<!-- Verified 2026-09-15 against empty tree (master, no commits yet). Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## ropoductions-web

Ropoductions Web Portal and patron-gated RPG Maker MZ browser client (v1). Stack is Next.js 15+ App Router on Cloudflare Workers via @opennextjs/cloudflare, React 19, TypeScript, Tailwind, Radix Dialog, next-intl, JSZip, D1 sessions, private R2 asset bucket. Planning source of truth lives in `_bmad-output/` (SPEC, PRD, ARCHITECTURE-SPINE, DESIGN, EXPERIENCE, epics, sprint-status).

## Policy

- NEVER push to `develop` or `master`, and NEVER commit directly on them; NEVER do work on `master`. NEVER merge branches (you may only merge to update the branch over the develop), ONLY the user can do it. ONLY prepare a PR and ask user explicitly to continue after he merges. Always pass the full link to PR.
- Agent pushes ONLY to a working branch cut from `develop`, then opens a PR with base `develop` ONLY.
- GitHub workflow is mandatory in this order: `git fetch origin`, check `git branch -a` and status of `develop`, `git checkout develop && git pull`, create working branch from `develop`, commit work on that branch, `git status` plus `git diff` review, `git push -u origin <branch>`, open PR to `develop` with `gh`.
- Branch name format is mandatory: `<type>/<story-id>-<kebab-slug>` (example: `feat/1-2-age-gate-modal`); types allowed are `feat`, `fix`, `chore`, `docs`, `refactor`.
- Commit and PR title format is mandatory Conventional Commits: `<type>(<scope>): <imperative summary>` (example: `feat(auth): add Patreon OAuth callback`); scopes are `portal`, `auth`, `play`, `save-hud`, `i18n`, `edge`, `db`; PR body MUST list story ID and FRs covered.
- Never expose Patreon access or refresh tokens to client JavaScript; store them server-side in D1 only.
- v1 gives identical game access to all active $5-$50 tiers; do not build tier-differentiated perks, beta branches, or cheat menus.
- Out of scope for v1, do not build: cloud save sync, Godot web player, forums/comments, Stripe/PayPal/Subscribestar, merch store/admin panel.

## Where things are

- Contract SPEC: `_bmad-output/specs/spec-ropoductions-web/SPEC.md`
- Save and runtime contract: `_bmad-output/specs/spec-ropoductions-web/save-and-runtime-contract.md`
- Tier matrix and session policy: `_bmad-output/specs/spec-ropoductions-web/patron-tier-matrix.md`
- PRD: `_bmad-output/planning-artifacts/prds/prd-ropoductions-web-2026-09-15/prd.md`
- Architecture spine (AD-1 through AD-8): `_bmad-output/planning-artifacts/architecture/architecture-ropoductions-web-2026-09-15/ARCHITECTURE-SPINE.md`
- Design tokens and components: `_bmad-output/planning-artifacts/ux-designs/ux-ropoductions-web-2026-09-15/DESIGN.md`
- Routes, states, microcopy, flows: `_bmad-output/planning-artifacts/ux-designs/ux-ropoductions-web-2026-09-15/EXPERIENCE.md`
- Epics and stories: `_bmad-output/planning-artifacts/epics.md`; execution state: `_bmad-output/implementation-artifacts/sprint-status.yaml`
- Future code entry points (post Story 1.1): `src/app/(portal)/page.tsx`, `src/app/(game)/play/page.tsx`, `src/components/age-gate-dialog.tsx`, `src/components/save-hud-dock.tsx`, `src/app/api/auth/*`, `src/app/api/game/[...asset]/route.ts`, `public/engine/index.html`, `migrations/0001_initial_sessions.sql`, `wrangler.toml`

## Running and verifying

- TODO (no code or package manager files exist yet; verify on first refresh after Story 1.1 scaffold): expected `npm run build` for OpenNext Cloudflare build, `wrangler dev` for local edge run, `wrangler d1 migrations apply DB` for session schema.
- Do not state build, lint, or test commands as fact until their manifest or script is read; read `package.json`, `wrangler.toml`, and CI config first.
- Required versions (from architecture spine): Node >=20.18.0 / 24.x, Next.js 16.3.5, React 19.2.8, @opennextjs/cloudflare 1.20.6, Wrangler 4.131.2, TypeScript 5.8.0, Tailwind 4.0.0, next-intl 4.14.5, JSZip 3.10.1.

## Conventions that differ from defaults

- Server code MUST use Web Fetch `Request`/`Response`; never import `fs`, `net`, or `child_process`.
- Host the MZ engine ONLY in a same-origin iframe at `/engine/index.html` on the identical origin; never use subdomains or versioned domains.
- Sessions: client gets only opaque UUIDv4 cookie `ropoductions_session` with HTTP-only, SameSite=Lax, Secure; validate it against D1 on `/play` and `/api/game/*`.
- postMessage actions MUST use `ROPODUCTIONS_` prefix and check `event.origin === window.location.origin`; validate save payloads before calling `StorageManager`.
- Serve game assets ONLY through `/api/game/[...asset]` from private R2 bucket `GAME_ASSETS` (zero public access) with `Cache-Control: private, max-age=86400`; return 403 JSON envelope `{ error: { code, message } }` without a session.
- D1 access MUST use `db.prepare().bind()`; string-concatenated SQL is forbidden; schema changes go as versioned files in `migrations/`.
- Files are `kebab-case` (`age-gate-dialog.tsx`); API routes are lowercase plural (`/api/auth/patreon`, `/api/auth/callback`, `/api/game/[...asset]`); D1 tables and columns are `snake_case` with unit suffixes (`pledge_cents`, `created_at`, `expires_at_sec`); env vars are `UPPER_SNAKE_CASE`.
- Locales live in `src/locales/[locale].json` with fallback to `en`; supported codes are EN, JA, ES, RU, ZH; persist in `ropoductions_lang` cookie for 365 days.
- Age gate uses cookie `ropoductions_age_verified` for 30 days; Exit redirects to `https://google.com`.
- Save HUD export MUST bundle slots `file1.rpgsave` through `file20.rpgsave` plus `global.rpgsave` and `config.rpgsave` via JSZip into `ropoductions_saves_{YYYY-MM-DD}.zip`; import accepts `.zip` or `.rpgsave` and shows invalid-format error, reset requires explicit destructive confirmation.
- Use design tokens `#090A0F` background, `#121522` card, `#E11D48` primary, `#FBBF24` tier gold; display type Cinzel, body Geist Sans/Inter, mono for versions/timestamps; minimum 44x44px touch targets; Lucide SVGs only, no emojis as icons.

## Known pitfalls

- Changing origin or serving the game from a subdomain partitions IndexedDB `rmmz_save` and hides saves; keep one stable origin across patches.
- Never re-verify patron status by background polling that kills gameplay; check on navigation, `/play` entry, and asset requests, let the active session finish, redirect with renewal banner on next navigation.
- MZ patch saves MUST resolve missing variables with fallback defaults; do not assume new-engine saves load cleanly without plugin guards.
- Keep the 16:9 canvas bounded by `100dvh`/`100dvw` with `touch-action: manipulation`; expanding Save HUD over gameplay controls breaks mobile input.
- Asset auth MUST NOT add more than 300ms to initial bundle load; landing LCP target is under 1.8s, title interactive under 5s on 25Mbps.

<!-- /bmad:context -->

## Comments

Default to writing no comments.
Only add a comment when the WHY is non-obvious.
Never comment WHAT the code does. The code already says what it does.
Never reference the current task, ticket, or fix in a comment.

## Testing

Always use testing-guidelines skill.
Write tests for business logic and API endpoints.
Don't test implementation details - test behavior.
Don't mock what you don't own.

## Git

Use conventional commit format: type(scope): description
Types: feat, fix, refactor, test, docs, chore
Keep commits focused on one change.
Don't mention AI, Claude, or "generated" in commit messages.

## Security

Never commit .env files, API keys, tokens, private keys, or credentials.
Never log sensitive data.
Never put secrets in comments or test fixtures.
If you need a secret for testing, use environment variables with placeholder values.

## Error Handling

Don't add error handling for scenarios that can't happen.
Trust internal function contracts.
Only validate at system boundaries: user input, API responses, file reads.
Don't wrap internal function calls in try/catch unless they actually throw.

## MUST rules

- NEVER do git reset hard. You may do reset ONLY if it won't wipe out the work of others worktrees and agentic sessions.
- Before preparing a PR you MUST check if there is merge conflicts.
- Always use context7-mcp working with code base or tech tools.
- When working with github repos not related to the project's one, you are operating in READ-ONLY mode. You are PROHIBITED to write in the repos, not related to the project. The only repo you can write is the local project's repo: https://github.com/CloudNine13/ropoductions-web
- Never use emojis, never use useless/WHAT comments, keep only hard WHY ones. 
- When working, you must create a separate working tree, so the other sessions could work and don't overlap you. 
- Always test your code. Make sure you are making thoughtful tests and not a bunch of false greens.