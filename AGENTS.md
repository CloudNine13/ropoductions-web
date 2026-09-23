<!-- bmad:context -->
<!-- Verified 2026-09-15 against empty tree (master, no commits yet). Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## ropoductions-web

Ropoductions Web Portal and patron-gated RPG Maker MZ browser client (v1). Stack is Next.js 15+ App Router on Cloudflare Workers via @opennextjs/cloudflare, React 19, TypeScript, Tailwind, Radix Dialog, next-intl, JSZip, D1 sessions, private R2 asset bucket. Planning source of truth lives in `_bmad-output/` (SPEC, PRD, ARCHITECTURE-SPINE, DESIGN, EXPERIENCE, epics, sprint-status).

## Policy

- NEVER push to `develop` or `master`, and NEVER commit directly on them; NEVER do work on `master`. NEVER merge branches (you may only merge to update the branch over the develop), ONLY the user can do it. ONLY prepare a PR and ask user explicitly to continue after he merges. Always pass the full link to PR.
- Agent pushes ONLY to a working branch cut from `develop`, then opens a PR with base `develop` ONLY.
- You MUST use GitHub MCP interacting with Git. GitHub workflow is mandatory in this order: `git fetch origin`, check `git branch -a` and status of `develop`, `git checkout develop && git pull`, create working branch from `develop`, commit work on that branch, `git status` plus `git diff` review, `git push -u origin <branch>`, open PR to `develop`.
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
- Future code entry points (post Story 1.1): `src/app/(portal)/page.tsx`, `src/app/(game)/play/page.tsx`, `src/components/age-gate-dialog.tsx`, `src/components/save-hud-dock.tsx`, `src/app/api/auth/*`, `src/app/api/game/[...asset]/route.ts`, `src/app/engine/[...path]/route.ts`, `src/engine-plugins/` (mock-shell.html + Ropoductions_WebBridge.js), `migrations/0001_initial_sessions.sql`, `wrangler.toml`

## Running and verifying

- TODO (no code or package manager files exist yet; verify on first refresh after Story 1.1 scaffold): expected `npm run build` for OpenNext Cloudflare build, `wrangler dev` for local edge run, `wrangler d1 migrations apply DB` for session schema.
- Do not state build, lint, or test commands as fact until their manifest or script is read; read `package.json`, `wrangler.toml`, and CI config first.
- `npm run test:e2e` runs the Playwright suite on the built worker in Chromium and Firefox, plus a `firefox-webgl-disabled` project for the honest-failure spec; CI installs both browsers. `npm run profile:boot -- --target <url>` prints the boot-profile table (per-boot WebGL contexts, per-request statuses); a target serving a published shell needs `PROFILE_SESSION_COOKIE`, and a mock-harness target is refused unless `--allow-mock`.
- Required versions (from architecture spine): Node >=20.18.0 / 24.x, Next.js 16.3.5, React 19.2.8, @opennextjs/cloudflare 1.20.6, Wrangler 4.131.2, TypeScript 5.8.0, Tailwind 4.0.0, next-intl 4.14.5, JSZip 3.10.1.

## Conventions that differ from defaults

- Server code MUST use Web Fetch `Request`/`Response`; never import `fs`, `net`, or `child_process`.
- Host the MZ engine ONLY in a same-origin iframe at `/engine/index.html` on the identical origin; never use subdomains or versioned domains.
- Sessions: client gets only opaque UUIDv4 cookie `ropoductions_session` with HTTP-only, SameSite=Lax, Secure; validate it against D1 on `/play`, and on `/api/game/*` and `/engine/*` through the bounded-TTL amortised validation (per-isolate memo keyed by a full-length digest of the cookie bound to the current `SESSION_SECRET`, 60s window, fail-closed) defined in `engine-browser-compat.md` §4.
- postMessage actions MUST use `ROPODUCTIONS_` prefix and check `event.origin === window.location.origin`; validate save payloads before calling `StorageManager`.
- Serve game assets ONLY through `/api/game/[...asset]` from private R2 bucket `GAME_ASSETS` (zero public access) with `Cache-Control: private, max-age=86400`; return 403 JSON envelope `{ error: { code, message } }` without a session.
- Media (`/engine/{data,img,audio,effects,movies}/*`) rewrites to `/api/game/*`; the MZ shell is uploaded to R2 `engine/` prefix by the sync action and streamed same-origin via `/engine/[...path]` (gated like `/api/game`; anonymous requests get the open mock harness from `src/engine-plugins/`). The sync action NEVER writes to any branch (`permissions: contents: read`).
- D1 access MUST use `db.prepare().bind()`; string-concatenated SQL is forbidden; schema changes go as versioned files in `migrations/`.
- Files are `kebab-case` (`age-gate-dialog.tsx`); API routes are lowercase plural (`/api/auth/patreon`, `/api/auth/callback`, `/api/game/[...asset]`); D1 tables and columns are `snake_case` with unit suffixes (`pledge_cents`, `created_at`, `expires_at_sec`); env vars are `UPPER_SNAKE_CASE`.
- Locales live in `src/locales/[locale].json` with fallback to `en`; supported codes are EN, JA, ES, RU, ZH, PL; persist in `ropoductions_lang` cookie for 365 days.
- Age gate uses cookie `ropoductions_age_verified` for 14 hours (50400s; strictly 14 hours per owner decision); Exit redirects to `https://google.com`.
- Save HUD export MUST bundle slots `file1.rpgsave` through `file20.rpgsave` plus `global.rpgsave` and `config.rpgsave` via JSZip into `ropoductions_saves_{YYYY-MM-DD}.zip`; import accepts `.zip` or `.rpgsave` and shows invalid-format error, reset requires explicit destructive confirmation.
- Use design tokens `#090A0F` background, `#121522` card, `#22C55E` Studio Emerald primary (with `#E11D48` crimson accents), `#FBBF24` tier gold; display type Chakra Petch (with Cinzel alias), body Geist Sans/Inter, mono for versions/timestamps; minimum 44x44px touch targets; Lucide SVGs only, no emojis as icons.

## Known pitfalls
- Changing origin or serving the game from a subdomain partitions IndexedDB `rmmz_save` and hides saves; keep one stable origin across patches.
- Never re-verify patron status by background polling that kills gameplay; check on navigation, `/play` entry, and asset requests (asset paths amortised within the validated-session window per `engine-browser-compat.md` §4), let the active session finish, redirect with renewal banner on next navigation.
- MZ patch saves MUST resolve missing variables with fallback defaults; do not assume new-engine saves load cleanly without plugin guards.
- Keep the 16:9 canvas bounded by `100dvh`/`100dvw` with `touch-action: manipulation`; expanding Save HUD over gameplay controls breaks mobile input.
- Asset auth MUST NOT add more than 300ms to initial bundle load; landing LCP target is under 1.8s, title interactive under 5s on 25Mbps.

<!-- /bmad:context -->

## Owner decisions (durable — kept outside the managed block so a context refresh cannot drop them)

- `/admin` denial is an ordinary 404 and that IS the whole anti-enumeration contract (owner decision 2026-09-21): no redirect, no auth prompt, no distinct status for anonymous, forged, stale, or valid-non-admin callers. The response is deliberately NOT byte-identical to an unknown-path 404 — route-matched denials render Next's `__next_error__` document and name the route segments in the flight payload (measured: 7216 B vs 8476 B for a same-length unknown path). Do not re-file this as a leak, and do not add a differential test for it.
- DELETE and MODIFY must never be applied to a founder admin's override row. Local dev/e2e D1 state is one shared file (`.wrangler/state/v3`) used by `npm run dev`, `npm test` and the e2e harness, so any cleanup that clears override rows by role (`tests/verify-d1-schema.ts:457` does `DELETE FROM patron_overrides WHERE role = 'admin'`) or by an id read from `CREATOR_ADMIN_PATREON_IDS` can destroy a developer's own bootstrapped founder row. Fixtures must use a dedicated disposable key (`E2E_FOUNDER_PATRON_ID`), never a real creator id.
- **Worktree and branch isolation.** The repository carries dozens of long-lived local worktrees under `.worktrees/` — one per story, often on branches that are not yours, sometimes dirty with unfinished work. While working on a story you may READ any worktree (to understand or continue someone else's work) but you MUST NOT modify it: never edit, format, rename, delete, `git checkout`, `git switch`, `git reset`, `git stash`, `git clean`, commit or install dependencies inside another worktree, and never modify or commit on `develop` or `master`. Your edits belong in exactly one place: the worktree of the branch you are working on. Before reporting, verify with `git worktree list` and `git status --short` per worktree that only your own worktree carries changes and that the main checkout is clean.
- **Harness pitfall that caused that violation:** in some agent harnesses relative paths in file tools resolve against the main checkout instead of the worktree the shell `cd`-ed into. Address your worktree with absolute paths, and if a tool wrote outside it, copy the change into your worktree FIRST, verify it, then restore the other checkout (`git checkout -- <paths>` there).
- **Engine shell release addressing is a publish-pipeline concern (owner decision 2026-09-22).** *"The web should not ask if there is a release or no. The web should not know there is a release."* The sync pipeline (`scripts/sync-game-release.ts` + `.github/workflows/sync-game-release.yml`) computes the release id as a sha256 content digest over the staged shell plus `ADDRESSING_REVISION`, bakes `?v=<releaseId>` into every shell subresource reference it can reach (document `src`/`href` attributes, the `main.js` boot-script loop, the Effekseer wasm URL, `PluginManager.makeUrl`, `FontManager.makeUrl`), and replaces the previously published shell in R2 with an additive sync; the run FAILS and publishes nothing when a URL-builder site is not the one the rules were written for. The runtime is release-agnostic: `/engine/[...path]` never resolves, reads, compares or memoises a release, never refuses a request because an identifier changed, and serves the shell document `private, no-cache`, an addressed shell file `private, immutable, max-age=31536000`, and an unaddressed shell file `private, max-age=86400` so a missed reference degrades instead of breaking a boot. Media (`img/`, `audio/`, `effects/`, `movies/`, `data/`) keeps `private, max-age=86400` and is never addressed — the upstream sync is additive and reuses file names. `build-metadata.json` is published nowhere (not in R2, not servable at `/engine/build-metadata.json`). Do not re-introduce a pointer object, a release memo, a versioned R2 prefix, a `/play` release lookup, or a current-release refusal: that is exactly the runtime release awareness the owner forbade, and it breaks the same-origin/IndexedDB invariant as soon as it becomes a versioned path. The shell is published in two phases — every shell object except `index.html` first, then `index.html` last — so a client can never read a new document while a subresource still holds the previous release's bytes.

## Platform constraints (durable — outside the managed block)

### Server Components never mutate cookies; clearing bounces through a Route Handler

- Next.js App Router forbids cookie mutation (`cookies().delete()` / `cookies().set()`) during a Server Component render; under `next start` and on the worker it throws `Cookies can only be modified in a Server Action or Route Handler`. The failure is invisible under `next dev` and is caught by the e2e suite, not by unit tests.
- Invalidating `ropoductions_session` therefore belongs to the Route Handler `GET /api/auth/session`: it expires the cookie (`Max-Age: 0; Path=/; HttpOnly; SameSite=Lax; Secure`) and answers `302` to an allowlisted `/?paywall=<revoked|lapsed|required>` target with `Cache-Control: no-store`. An unknown `paywall` value falls back to `required`.
- A Server Component that finds an unusable session `redirect()`s to that bounce through `sessionClearHref(type)` (`src/lib/paywall.ts`) instead of clearing the cookie itself; `/play` is the current call site, and the pattern is the contract for every future invalidation (logout, renewal, admin sign-out).
- A redirect that must KEEP the cookie — a retryable infrastructure failure, the missing age cookie — is a plain `/?paywall=<type>` / `/?auth_required=true` target (`mapSessionStatusToPlayRedirect`), never the clearing route.
- **No tracking tooling (owner decision 2026-09-23).** No CI check derives story status from merge events, no verify-command discipline on retro action items, no tests or tools for sprint docs and specs. `sprint-status.yaml` is updated by hand; `epic-5-retro-item-12` and `epic-7-retro-item-28` are removed and must not be re-filed.

---

## 1. BMAD Phase Role Routing

Agents must route work strictly through configured built-in roles:

1. **Architecture & System Planning (`role: plan`)** — architectural planning, system boundaries, schema design, dependency mapping; token-dense outputs.
2. **Specification & Contract Authoring (`role: advisor`)** — turning architecture and epics into atomic stories and PRDs: TypeScript interfaces, database contracts, Given-When-Then acceptance criteria. Also acts as the independent reviewer validating story viability before implementation.
3. **Mechanical Code Implementation (`role: default`)** — writing code strictly against the specs from step 2, including multi-file edits and refactors. Background subagents dispatched via `omp task` use **`role: task`** and stay strictly scoped to their assigned files.
4. **Testing, Verification & Triage (`role: smol`)** — behavior-driven tests covering the acceptance criteria, running the test runner, parsing trace logs, applying targeted fixes.
5. **Git & Housekeeping (`role: commit`)** — Conventional Commits, diff review, Git operations.
6. **Visual Inspection (`role: vision`)** — screenshot layout verification, UI alignment checks, design token compliance.

---

## 2. Mandatory Rules (Invariants)

- **Await Pending Work:** You MUST wait for tools and subagents to finish before moving forward with the task or thought process. Never assume a pending result, and never keep reasoning on unfinished output.
- **No Direct Environment Reads:** NEVER read environment variable values directly. Exercise the variable and verify the outcome from the observable answer instead of printing the value.
- **Advisor Critical Debate:** You MUST critically debate every recommendation given by the advisor model. Accept and implement its advice ONLY if you independently verify that the solution is relevant, technically sound, and secure.
- **Strict Verbosity Control:** You MUST be concise. Output ONLY essential decisions, code changes, and encountered blockers. Think through all exploratory reasoning and chain-of-thought in silence; do not output verbose step-by-step narration.
- **Git Worktree Isolation:** When working with git, you MUST create and operate within a distinct `git worktree` (via the `using-git-worktrees` skill) so that parallel agent sessions and the user's workspace do not overlap or corrupt state.
- **Repository Scope & Permissions:**
  - The ONLY repository you are permitted to modify is the local project repository: `https://github.com/CloudNine13/ropoductions-web`.
  - When accessing or querying any external GitHub repository, you operate in strict **READ-ONLY** mode. Writing to, creating issues in, or modifying external repos is strictly prohibited.
- **Tool Invariant (`context7-mcp`):** Always use `context7-mcp` when reading the codebase, inspecting system context, or invoking technical tools.
- **No Emojis:** Never use emojis in code, documentation, pull requests, or commit messages. Never use icons unless they are official Lucide SVG components.
- **Zero Hallucinated Roles:** Do not invent or route to custom roles (`spec`, `test`, `architect`). Work strictly within configured built-in roles (`default`, `plan`, `advisor`, `task`, `smol`, `commit`, `vision`).

---

## 3. Git & GitHub MCP Workflow

All Git interactions MUST go through GitHub MCP in this exact sequence:

1. `git fetch origin`
2. Inspect `git branch -a` and check the status of `develop`.
3. `git checkout develop && git pull`
4. Create a dedicated worktree and cut a new branch from `develop`:
   * Branch naming format is mandatory: `<type>/<story-id>-<kebab-slug>` (e.g., `feat/1-2-age-gate-modal`).
   * Permitted types: `feat`, `fix`, `chore`, `docs`, `refactor`.
5. Implement work and commit using `role: commit`.
6. Review changes thoroughly via `git status` and `git diff`.
7. Check for merge conflicts against the latest `develop` branch before opening a PR.
8. `git push -u origin <branch>`
9. Open a Pull Request targeting base `develop` ONLY using `gh pr create`:
   ```
   gh pr create --base develop --title "<type>(<scope>): <summary>" --body-file <path-to-body-file>
   ```
   NEVER pass `--project` to `gh pr create`; the projects-classic GraphQL API is sunset and that flag triggers a fatal deprecation error.
   * PR Title format: `<type>(<scope>): <imperative summary>` (Scopes: `portal`, `auth`, `play`, `save-hud`, `i18n`, `edge`, `db`).
   * PR Body MUST explicitly list the Story ID and all Functional Requirements (FRs) covered.
   * Provide the user with the full URL to the created PR.
10. **Handoff:** Do NOT wait for GitHub CI to pass (that is the user's responsibility). Request explicit user confirmation before proceeding with any subsequent branch work.
11. **Safety Restrictions:**
    * NEVER push to `develop` or `master`.
    * NEVER commit directly on `develop` or `master`.
    * NEVER merge branches into `develop` or `master` (only the user may merge PRs).
    * NEVER execute `git reset --hard` if it risks wiping out uncommitted changes in active worktrees or concurrent sessions.

**Commit hygiene:** Conventional Commits `<type>(<scope>): <imperative summary>`; permitted types are `feat`, `fix`, `refactor`, `test`, `docs`, `chore`; keep each commit focused on one logical change; never mention AI, Claude, or "generated" in commit messages.

### Known gh CLI deprecations (gh v2.46.0, verified 2026-09-23)

`gh pr view`, `gh pr edit`, `gh issue view` and `gh issue edit` request the projects-classic GraphQL field `projectCards(first:100){nodes{project{name}column{name}},totalCount}`. Projects (classic) was sunset in May 2024, so these commands abort and write nothing:

```
GraphQL: Projects (classic) is being deprecated in favor of the new Projects experience, see: https://github.blog/changelog/2024-05-23-sunset-notice-projects-classic/. (repository.pullRequest.projectCards)
```

An edit made this way fails without touching the PR; never assume it landed. Use the REST API through `gh api` instead.

| Need | Deprecated command | REST replacement |
|---|---|---|
| Read a PR | `gh pr view <N>` | `gh api repos/{owner}/{repo}/pulls/<N>` |
| Edit PR title | `gh pr edit <N> --title "..."` | `gh api --method PATCH repos/{owner}/{repo}/pulls/<N> -f title="..."` |
| Edit PR body | `gh pr edit <N> --body "..."` | `gh api --method PATCH repos/{owner}/{repo}/pulls/<N> -f body="..."` |
| Edit PR body from file | `gh pr edit <N> --body-file <file>` | `gh api --method PATCH repos/{owner}/{repo}/pulls/<N> -F body=@<file>` |
| Read an issue | `gh issue view <N>` | `gh api repos/{owner}/{repo}/issues/<N>` |
| Edit an issue | `gh issue edit <N> ...` | `gh api --method PATCH repos/{owner}/{repo}/issues/<N> ...` |
| Create a PR | `gh pr create --project ...` | drop `--project`; plain `gh pr create` is unaffected |
| Put an item on a project | `--add-project` / `--remove-project` | unavailable; projects-classic is gone |

`gh api` notes:
- `-f key=value` sends a string field; `-F key=@file` reads the value from a file (use it for multi-line bodies).
- Adding any field switches the method to POST, so pass `--method PATCH` explicitly for edits.
- `{owner}` and `{repo}` are substituted automatically when the command runs inside a checkout of this repo (`CloudNine13/ropoductions-web`).
- Confirm an edit landed by reading it back: `gh api repos/{owner}/{repo}/pulls/<N> --jq '.title'`.

Verified working (their queries do not request `projectCards`): `gh pr create` (without `--project`), `gh pr list`, `gh pr status`, `gh pr checks`, `gh pr diff`, `gh pr comment`, `gh pr close`, `gh pr ready`, `gh pr review`.

---

## 4. Code Style & Comments

- **Default to Silence:** Write no comments by default. Code must be self-explanatory.
- **Strict WHY Rule:** Add comments ONLY when the architectural or business reasoning (WHY) is non-obvious.
- **Forbidden:** Never comment WHAT the code does. The implementation already demonstrates the action.
- **Clean History:** Never reference tickets, task numbers, story IDs, fixes, or AI attribution within code comments.

---

## 5. Testing & Verification

- Always utilize the `testing-guidelines` skill.
- Test pure business logic, edge functions, and API endpoints. Test visible behavior and contract compliance rather than internal implementation details.
- **No False Greens:** Write rigorous assertions. Never write tautological tests (testing your own mocks) or shallow checks that pass without exercising actual runtime logic.
- **Do Not Mock What You Do Not Own:** Prefer lightweight integrations or in-memory fixtures (e.g., D1 / SQLite test binders) over synthetic mocks.
- **Circuit Breaker:** Run test execution on `role: smol`. If a test fails more than twice due to interface or structural contract ambiguities, stop testing loops immediately and escalate to `role: default` or `role: plan`.

---

## 6. Security & Secret Management

- Never commit `.env` files, production tokens, API keys, private keys, or credentials.
- Never put personal, account-level, or machine-local information in this repository, its commits, branches, PR titles, PR descriptions, or comments: no subscription plans or tiers, no pricing, quota or rate-limit figures, no vendor or provider billing details, no model or plan names from your own tooling account, no personal paths, and no account identifiers beyond the public project ones named above.
- Never expose Patreon access or refresh tokens to client-side code; store them strictly in server-side D1 instances.
- Never log sensitive user payloads, session IDs, or OAuth authorization codes.
- Never place secrets in test fixtures or comments. Use placeholder environment variables for testing.
- Validate all incoming session cookies (`ropoductions_session`) against D1 inside `/play`; `/api/game/*` and `/engine/*` validate through the bounded-TTL amortised memo (`engine-browser-compat.md` §4), so a cookie inside a live window is not re-read from D1 — that is the only permitted exception, and it stays fail-closed.

---

## 7. Error Handling & System Boundaries

- Do not introduce defensive error handling for invariants that are structurally impossible.
- Trust internal function contracts; validate strictly at external system boundaries:
  - User input and query params.
  - Third-party API responses (Patreon OAuth).
  - External file reads and JSZip unpack operations.
  - Client postMessage payloads (verify `event.origin === window.location.origin` and validate schema before calling `StorageManager`).
- Do not wrap internal routines in generic `try/catch` blocks unless the underlying call can throw an unhandled exception.
