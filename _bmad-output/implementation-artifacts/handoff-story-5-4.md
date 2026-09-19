# Handoff — Story 5.4: Override Integrity Hardening (ready-for-dev)

Executor: a separate dev session via `bmad-build`. This document is the complete context bundle; do not re-litigate the decisions below — they were made with evidence and owner sign-off on 2026-09-19.

## Read first (in this order)

1. `_bmad-output/implementation-artifacts/epic-5-retro-2026-09-19.md` — findings F1-F15 with file:line sources, Team Discussion (party verdicts), the 12 action items, and the **owner decisions block in Action Items** (binding).
2. `_bmad-output/planning-artifacts/sprint-change-proposal-2026-09-19.md` — approved change proposal; Story 5.4 ACs are final.
3. `_bmad-output/planning-artifacts/epics.md` — Story 5.4/5.5 sections + **Amendment A-2026-09-19-01** (reinterprets 5.3's sole-admin clause; read before touching any lockout logic).
4. `AGENTS.md` policy + conventions (branch format, PR flow, D1 rules, no task-referencing comments, no secrets client-side).

## The owner's security model (overrides any contrary instinct)

- **Only founder access is sacred.** Founders = owner + 2 collaborators, maintained via `CREATOR_ADMIN_PATREON_IDS`; their `/admin` reach must be provable **with zero DB rows** (env bootstrap path).
- **Added admins get full self-service, including self-destruction.** Do NOT add a sole-admin guard to `upsertPatronOverride`. The party's original F2 "P0 lockout" was corrected by the owner to this shape.
- Sealed founder records remain absolutely immutable (delete + update, UI + server). Badges/labels on founder rows: explicitly not a concern.

## Work items (retro item → concrete change)

| Retro item | Change | Primary sources |
|---|---|---|
| item 1 | Relax `deletePatronOverrideGuarded` so self-revoke of the last *added* admin succeeds (invariant = founder env access, not row count); add founder-preservation regression test: session with ID in `creatorAdminIds`, empty `patron_overrides` → `requireAdminSession` resolves, no `notFound()` | `src/lib/db.ts:278-301`, `src/lib/admin.ts` (validate/require), `tests/admin-revocation.test.ts` |
| item 2 | Remove `granted_by` from the DO UPDATE SET clause (INSERT-only); **red-first**: flip `tests/admin-overrides.test.ts:379` to assert the original grantor survives an update; code comment (WHY-only) noting historical clobbered rows are unrecoverable | `src/lib/db.ts:198-203`, `src/app/(admin)/admin/overrides/actions.ts:97`, test:379 |
| item 3 | `handleUpsertOverrideCore` re-reads caller's override at mutation time, mirroring revoke (`actions.ts:151-166`); raise upsert to revoke rigor — never weaken revoke | `actions.ts` upsert/revoke cores |
| item 4 | Delete the dead `/admin` branch in `src/proxy.ts:40-45` (matcher `config.matcher` at `:57-59` never routes `/admin`; layout is the authority) OR extend matcher + document; pin exported matcher in `tests/proxy.test.ts`; fix `spec-5-1` "middleware AND layout" wording | `src/proxy.ts`, `tests/proxy.test.ts:98-109` |
| item 5 | One sealing source: kill read-time env OR-branching; sealing decided from stored state materialized at bootstrap; resolve writerless `creator_bootstrap` branch (deferred-work item 1 covers the sentinel normalization) | `src/lib/admin.ts:26-39`, `src/lib/patreon.ts:423,441` |
| item 6 | Tests that *run* the boundary: `e2e/admin.spec.ts` (no/forged session → 404 page, no `location` header leak; seeded admin → dashboard+table) per `e2e/save-hud.spec.ts` precedent; wrapper-level action tests with real FormData where shims permit — if `tests/helpers/next-cache-shim.mjs` fights you, the e2e spec is the accepted substitute (Amelia's caveat, retro OQ5) | `e2e/`, `tests/helpers/` |
| item 7 | `/^[1-9]\d{0,19}$/` as ONE exported constant consumed by server action AND `override-form.tsx` `pattern` + copy; code-point-safe notes truncation (`Array.from` or `String.prototype.isWellFormed`-aware slice) replacing `.slice(0, 500)` | `admin.ts:20`, `actions.ts:90`, `override-form.tsx:57` |
| item 8 | Delete zero-caller `deletePatronOverride` (`db.ts:224`); dead `admin.ts` token exports → wire components to them or drop (verify = caller grep, not a test); lift `createMockD1` (~110 lines × 3 copies in `tests/admin-*.test.ts`) into `tests/helpers/`; swap `play/page.tsx:16-17` inline regex for `unquoteCookieValue` (closes epic-2 item-4 remainder, F12) | cited files |
| item 11 | Full admin localization: extract every user-facing string in `src/components/admin/*`, `src/app/(admin)/**` and `lib/admin.ts` tier labels into next-intl keys; populate ALL six locales (`en es ja pl ru zh`); follow `src/lib/i18n` + dictionary-fallback conventions (see how `game`/`portal` namespaces are structured) | `src/locales/*.json`, `src/lib/i18n*` |

Follow-on, NOT yours here: item 9/10 (PM docs + Story 5.5), item 12 (CI chore PR), dialog-shell extraction, timezone label, pagination (all in `deferred-work.md`).

## Environment gotchas (verified 2026-09-19)

- Worktree: branch from `develop` per policy (`feat/5-4-override-integrity-hardening`); create under `.worktrees/` (repo MUST-rules; sibling worktrees exist — don't collide).
- `npm test` (contract suite) needs local D1 state: `npx wrangler d1 migrations apply DB --local` first, else `verify-d1-schema.ts` fails "Table 'sessions' must exist" — environment, not code.
- `tests/` run via `node --experimental-strip-types` + loader shims (`tests/helpers/register-loader.mjs`); server actions ARE importable in unit tests — the *Core* functions are already tested that way; wrappers need FormData + shimmed cookies (`admin-layout.test.ts` mock cookie store pattern).
- `revalidatePath` is a no-op in tests via `next-cache-shim.mjs` — don't claim revalidation is test-covered at unit level.
- Suite baseline at handoff time: `npm run test:unit` 389/389 pass; `npm run build:next` clean.

## Definition of done

All nine items above with tests written red-first where behavior changes (items 1-3, 7), the two suites and build green, retro `action_items` statuses flipped in `sprint-status.yaml` ONLY via entries whose verify command passed (item 12's discipline applies immediately: each PR description line cites the verify command run — e.g. `grep -n 'replace(/\^"' src/app/\(game\)/play/page.tsx` must return nothing for F12). Then code-review → epic retro-style reconciliation of `5-4` status happens in the normal loop, PR to `develop` only.
