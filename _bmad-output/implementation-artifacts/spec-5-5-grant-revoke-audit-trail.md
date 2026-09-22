---
title: 'Story 5.5: Grant/Revoke Audit Trail'
type: 'feature'
created: '2026-09-23'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-ropoductions-web-2026-09-15/ARCHITECTURE-SPINE.md'
  - '_bmad-output/planning-artifacts/epics.md'
  - '_bmad-output/planning-artifacts/prds/prd-ropoductions-web-2026-09-15/prd.md'
  - '_bmad-output/implementation-artifacts/deferred-work.md'
  - '_bmad-output/implementation-artifacts/epic-5-retro-2026-09-19.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The epic title promised "audit logs", no story ever carried them, and the drop was unrecorded (retro finding F9). As-built the only attribution is `patron_overrides.granted_by` — a single current-value column whose pre-5.4 history was destroyed by the F3 grantor-rewrite bug and which says nothing about role changes, revocations, or their ordering. A panel admin could mint or drop `admin` passes with no observable record, which is also the missing substrate for any future second-person approval.

**Approach:**

1. `migrations/0003_override_audit.sql` — append-only `override_audit` table (actor, target, action, before/after role, timestamp) with CHECK constraints, two indexes, and `BEFORE UPDATE`/`BEFORE DELETE` triggers that abort.
2. The audit row is written **inside the DAL mutation functions**, in one atomic `db.batch([auditStatement, mutationStatement])`, so a mutation and its trail row commit or roll back together. The audit statement is `batch[0]` and derives `action`/`before_role` from the pre-write row by correlated subquery, so no caller can pass a stale "before" and no caller can omit attribution (`actorPatronId` is a required argument).
3. `listOverrideAudit` + an `admin.audit.*` localized trail section on `/admin/overrides`, newest first, bounded pagination via `?auditPage=N`.
4. Record the AC's operational definitions and the adversarial-review dispositions in this spec, refresh the 4-eyes non-goal entry in `deferred-work.md`, and append the newly identified residual risks there.

## Acceptance Criteria

- **Given** the epic title's promised "audit logs" dropped without record (retro finding F9)
- **When** this story completes
- **Then** an append-only `override_audit` table exists (migration `0003`) with actor, target, action, before/after role, and timestamp
- **And** every upsert, update, and revoke (including sealed-bootstrap events) writes exactly one trail row within the same D1 interaction (AD-8 parameterized)
- **And** `/admin/overrides` renders the trail (newest first, bounded pagination)
- **And** 4-eyes (second-person approval of admin grants) is recorded as a formal v1 non-goal in deferred-work.md with the reopen trigger "more than a handful of operators hold keys"

### Operational definitions (the AC's own terms, pinned — see Spec Change Log)

- **"same D1 interaction"** = one `db.batch([...])` call. Measured: D1 executes batch statements sequentially in one implicit transaction and rolls the whole sequence back when any statement fails, so neither an unaudited mutation nor an orphan trail row can exist.
- **"every upsert, update, and revoke ... exactly one trail row"** = one row per successful `upsertPatronOverride` call (`grant` when the row did not exist, `update` otherwise, derived in SQL from the pre-write state) and one row per `deletePatronOverrideGuarded` call that removed a row (`revoke`). A revoke that removes nothing appends nothing; a creator-admin re-materialization appends a row because it really rewrites `updated_at_sec`. Denied/rejected attempts never reach the DAL and are not logged.
- **"append-only"** = enforced by `RAISE(ABORT)` triggers on UPDATE and DELETE, not merely by convention. Nothing can ever delete a trail row — including tests and future hygiene scripts.
- **Actor** = the acting administrator's Patreon ID, or the `system_bootstrap` sentinel for writes no human performed (creator-admin materialization, the dev-only seed CLI, the e2e harness). Column CHECK: `actor_patron_id = 'system_bootstrap' OR actor_patron_id GLOB '[1-9][0-9]*'`, which also prevents an env-list value from being persisted as an actor.
- **4-eyes** = already recorded (`deferred-work.md`, epic-5-retro entry, reopen trigger "more than a handful of operators hold admin keys"); this story verifies and refreshes it instead of adding a second entry.

</frozen-after-approval>

## Files

- `migrations/0003_override_audit.sql` — new table, indexes, append-only triggers.
- `src/types/database.ts` — `OverrideAuditAction`, `OverrideAuditRecord`.
- `src/lib/db.ts` — `SYSTEM_BOOTSTRAP_ACTOR`; audit write inside `upsertPatronOverride` / `deletePatronOverrideGuarded`; new `listOverrideAudit`. Both mutation functions gain a required `actorPatronId` argument.
- `src/lib/patreon.ts` — `bootstrapInitialAdminIfEligible` / `syncInitialAdminOverrides` pass the sentinel.
- `src/app/(admin)/admin/overrides/actions.ts` — both cores pass `callingSession.patron_id`.
- `src/app/(admin)/admin/overrides/page.tsx` — parses `?auditPage`, fetches `AUDIT_PAGE_SIZE + 1` rows, renders the trail.
- `src/components/admin/override-audit-table.tsx` — trail table, action badges, pager, `AUDIT_PAGE_SIZE = 25`.
- `src/locales/{en,es,ja,ru,zh,pl}.json` — `admin.audit.*` (19 keys per locale).
- `scripts/e2e/setup-e2e-env.ts` — fixture seeding passes the sentinel.
- `tests/helpers/mock-d1.ts` + the inline mocks on the write paths, `tests/admin-audit.test.ts` (new), `tests/verify-d1-schema.ts`, `tests/verify-patreon-oauth.ts`, `tests/db.test.ts`, `tests/admin-revocation.test.ts`, `package.json` (test:unit manifest), `e2e/admin.spec.ts`.

## Contracts

```ts
export const SYSTEM_BOOTSTRAP_ACTOR = "system_bootstrap";

export async function upsertPatronOverride(
  db: D1Database,
  override: UpsertPatronOverrideInput,
  actorPatronId: string
): Promise<void>;

export async function deletePatronOverrideGuarded(
  db: D1Database,
  patronId: string,
  actorPatronId: string
): Promise<number>; // rows deleted; 0 also means "no trail row was appended"

export async function listOverrideAudit(
  db: D1Database,
  limit?: number, // default 25
  offset?: number  // default 0
): Promise<OverrideAuditRecord[]>;
```

Audit statement (upsert path, `batch[0]`, runs before the mutation so the subquery reads pre-write state; `?NNN` numbered parameters so the target id binds once and is referenced three times):

```sql
INSERT INTO override_audit (actor_patron_id, target_patron_id, action, before_role, after_role, created_at_sec)
SELECT ?1, ?2,
       CASE WHEN (SELECT role FROM patron_overrides WHERE patron_id = ?2) IS NULL THEN 'grant' ELSE 'update' END,
       (SELECT role FROM patron_overrides WHERE patron_id = ?2),
       ?3, ?4
```

Revoke audit statement (appends only when the row still exists at write time):

```sql
INSERT INTO override_audit (actor_patron_id, target_patron_id, action, before_role, after_role, created_at_sec)
SELECT ?1, ?2, 'revoke', prev.role, NULL, ?3
FROM (SELECT (SELECT role FROM patron_overrides WHERE patron_id = ?2) AS role) AS prev
WHERE prev.role IS NOT NULL
```

Table + enforcement:

```sql
CREATE TABLE IF NOT EXISTS override_audit (
  id INTEGER PRIMARY KEY,
  actor_patron_id TEXT NOT NULL CHECK (actor_patron_id = 'system_bootstrap' OR actor_patron_id GLOB '[1-9][0-9]*'),
  target_patron_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('grant', 'update', 'revoke')),
  before_role TEXT CHECK(before_role IN ('admin', 'comp')),
  after_role TEXT CHECK(after_role IN ('admin', 'comp')),
  created_at_sec INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_override_audit_created_at ON override_audit(created_at_sec, id);
CREATE INDEX IF NOT EXISTS idx_override_audit_target ON override_audit(target_patron_id);
CREATE TRIGGER IF NOT EXISTS trg_override_audit_no_update BEFORE UPDATE ON override_audit
BEGIN SELECT RAISE(ABORT, 'override_audit is append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_override_audit_no_delete BEFORE DELETE ON override_audit
BEGIN SELECT RAISE(ABORT, 'override_audit is append-only'); END;
```

Invariants:

- `override_audit` is display-only. Nothing may read it to make an authorization decision; admin authority stays `patron_overrides` (+ env bootstrap) and sealing stays `patron_overrides.granted_by`.
- The audit statement must stay `batch[0]`; reordering it silently records post-write state.
- New writers of `patron_overrides` outside the DAL must be added to the exemption list pinned by the source-scan test, or the test fails.

## Tests

- `tests/admin-audit.test.ts` (new, unit, mocks) — one trail row per grant/update/revoke; append-only growth; revoke-of-absent appends nothing; atomicity (a failing `batch` leaves both the override map and the audit array unchanged); per-caller attribution; the display-only guard (`src/lib/auth.ts` / `src/lib/admin.ts` never mention `override_audit`); the raw-DML exemption guard for `patron_overrides`. Semantic `action`/`before_role` assertions are deliberately excluded here — the mocks would be re-implementing the SQL.
- `tests/verify-d1-schema.ts` (real D1) — read-only schema assertions on the shared database (table/columns/indexes/triggers); then an isolated temp-dir database applied through the real `wrangler d1 migrations apply` path for the behavioural proofs the mocks cannot give: grant/update/revoke row contents, revoke-absent appends nothing, batch rollback atomicity, trigger aborts, CHECK rejections, newest-first LIMIT/OFFSET stability. Isolation is mandatory: trial rows can never be deleted, so writing them into the shared `.wrangler/state/v3` would pollute the developer's own trail permanently.
- `e2e/admin.spec.ts` (built worker) — the trail renders on `/admin/overrides` for a seeded admin and contains a row for the mutation the seeder performed (content-based, never count-based, because every `e2e:setup` re-run appends rows).
- `tests/admin-bootstrap.test.ts`, `tests/db.test.ts`, `tests/admin-revocation.test.ts`, `tests/admin-action-wrappers.test.ts`, `tests/verify-patreon-oauth.ts` — cutover only (mock `batch()` + audit branch + required actor argument). No existing assertion changes intent; the founder-callback scenario gains an audit-row assertion because its write failure is swallowed by the callback's best-effort catch and would otherwise stay green while writing nothing.

## Out of scope

- No backfill of pre-5.5 history: the F3 grantor rewrite destroyed it and no event log existed, so the trail begins empty.
- No logging of denied/rejected attempts, no logging of no-op revokes, no logging of session/pledge changes, no logging of `CREATOR_ADMIN_PATREON_IDS` edits (the mechanism that actually confers founder access).
- No 4-eyes workflow, no tamper-evidence (hash chain / out-of-band sink), no retention or rollup, no purge tooling.
- No pagination or overflow label for the override directory itself (the AC bounds the trail only).
- No refactor of the `"use server"` core exports, and no consolidation of the duplicated inline test mocks.

## Verification

| Command | Result |
|---|---|
| `npm run test:unit` | PASS — 572 tests / 102 suites, 0 failures, including the new `tests/admin-audit.test.ts` and the suite manifest |
| `npx tsc --noEmit` | clean |
| `npm run lint` | 0 errors (4 pre-existing warnings in files this story does not touch) |
| `npm test` (`test:d1` + Patreon contract) | PASS — every new Step 9/Step 10 assertion printed PASS, including the isolated-database proofs (grant/update/revoke row shape, database-derived `before_role`, revoke-of-absent appends nothing, trigger aborts, CHECK rejections, newest-first LIMIT/OFFSET, batch rollback atomicity) and the assertion that no audit fixture leaked into the shared database |
| `npm run build` (OpenNext) | PASS — `Worker saved in .open-next/worker.js`, after giving the worktree a real `node_modules` (initial failure was the documented worktree pitfall: with `node_modules` symlinked to the main checkout, OpenNext's tracer copied 5 of the 173 files in `next/dist/server`, so esbuild could not resolve `./node-environment` and friends; no app-code involvement — `npm run build:next` passed even with the symlink) |
| `npm run test:e2e` | PASS — 125/125 across the chromium, firefox and firefox-webgl-disabled projects on the built worker (`npx playwright test`), including the new trail assertion in `e2e/admin.spec.ts` (16/16 for that spec alone) |

Deployment note (owner action): no workflow applies migrations remotely (every CI apply is `--local`) and the deploy is the manual `npx opennextjs-cloudflare deploy` (this repository ships a single `wrangler.toml`), so `npx wrangler d1 migrations apply DB --remote` must run against the production environment **before** the deploy that ships this change. The audit write shares the mutation's batch and is fail-closed: without the table, panel grants/revokes surface `db_error` and every creator-admin bootstrap throws inside its swallowing `try/catch`, silently stopping admin materialization.

## Spec Change Log

1. AC interpretation pinned rather than renegotiated — see "Operational definitions"; the story text is unchanged, the ambiguity is resolved in this artifact (dated amendment `A-2026-09-23-01` in `epics.md` records the same definitions).
2. `db.batch` chosen over two sequential statements and over a SQL trigger on `patron_overrides`: only a batch makes the audit row and the mutation one all-or-nothing interaction, and a trigger cannot know the actor (`granted_by` is INSERT-only by design, so an UPDATE trigger would re-create the F3 defect inside the trail).
3. `before_role`/`action` derived in SQL from the pre-write row instead of passed by the caller (the caller's earlier read is a separate await point and goes stale under concurrency).
4. No-op suppression rejected: the literal AC reads "every upsert", and the re-materialization genuinely rewrites `updated_at_sec`, so a row is honest. The noise cost is recorded in `deferred-work.md`.
5. Append-only triggers kept in the migration: "append-only" is the AC's word, and the application layer cannot enforce it against a bypassing writer (`wrangler d1 execute`, the D1 console, a future script).
6. `AUTOINCREMENT` dropped (plain `INTEGER PRIMARY KEY`): with DELETE impossible, rowids are already monotonic and never reused; the repo's migrations use no AUTOINCREMENT.
7. Pagination uses `limit + 1` next-page detection instead of a second count query, and no shared pager component (one consumer).
8. Director-facing decision for the owner: the override directory's own overflow signal (`deferred-work.md`) deliberately did NOT ride along — the AC requires bounded pagination on the trail only, and that entry's reopen trigger ("first page overflow") has not fired. The entry is reworded with this dated decision rather than left silently dropped.

## Review Triage Log

Six independent adversarial reviews of this design before implementation (architecture/AD-8, D1/SQLite correctness, test blast radius, scope skeptic, docs consistency, security), plus a probe of the real D1 engine.

| Finding | Disposition |
|---|---|
| Mutations can bypass the trail (raw SQL in `scripts/e2e/setup-e2e-env.ts`, `tests/verify-d1-schema.ts`, ad-hoc console SQL) | Accepted and scoped: the AC's guarantee is "every mutation through the DAL". Fixture/ops writers are explicit exemptions pinned by the source-scan test, and the limitation is recorded in `deferred-work.md`. |
| Actor is a caller-supplied string, so the trail proves attribution was passed, not that it is true | Partially rejected: the actor is derived from the cookie-derived session in `requireAdminSession` and the DAL requires it (no silent default). The `"use server"` core-export hazard is pre-existing and recorded, not fixed here. |
| DB triggers are not tamper-evident against a D1-credential compromise | Accepted as documented: triggers stop accidental/app-level/console mutation; hash-chain tamper-evidence recorded as a deferred item with a reopen trigger. |
| Bootstrap re-materialization appends identical rows and can never be purged | Accepted deliberately (see Spec Change Log item 4); suppression lever recorded as a follow-up. `auth.ts:152` re-materializes once per session until the elevation persists, not per request. |
| Audit rows written by the contract suite would be permanent residue in the shared local D1 | Accepted and fixed: all behavioural probes run against an isolated temporary database applied through the real migration path; the shared database gets read-only assertions only. |
| `db.exec()` cannot apply the migrations (line-oriented splitter), and `persist: { path }` needs the `v3` segment | Verified and encoded in the contract-suite step; recorded here so the next author does not rediscover it. |
| Unit mocks would silently swallow the audit statement (the audit SQL contains `FROM patron_overrides WHERE patron_id = ?2`) | Accepted and fixed: audit branches are dispatched before the generic `patron_overrides` branches in every mock, and semantic assertions moved to the real-D1 step. |
| Directory overflow signal "rides Story 5.5" per `deferred-work.md` | Rejected as scope: AC requires trail pagination only; the entry is reworded with the dated decision and the owner can reverse it. |
| Unit test consolidation of three near-duplicate inline mocks | Deferred: test-infrastructure refactor outside the story, recorded with a reopen trigger. |
| Pre-existing: `tests/verify-patreon-oauth.ts` "bootstrap failure does not block authentication" scenario never reaches the bootstrap branch it claims to test | Recorded as a pre-existing verification gap, not fixed in this story. |

## Design Notes (measured)

Probed against the real local D1 engine (`getPlatformProxy`) before implementation:

- `db.batch` is atomic: a mutation violating `patron_overrides`' role CHECK rolled back the whole batch — audit count unchanged, override count unchanged, no orphan row.
- The grant statement appends exactly one row with `action = 'grant'`, `before_role = null`, `after_role = 'admin'`.
- The update statement appends `action = 'update'` with `before_role` = the pre-write role (`admin` → `comp` observed), proving the derivation happens in the database, not in the caller.
- The revoke statement appends `action = 'revoke'`, `before_role = 'comp'`, `after_role = null`, and appends **nothing** when the target is absent (`changes: 0` for both statements).
- `?1..?N` parameters with a repeated reference bind correctly through `.bind(...)`.
- The triggers abort UPDATE and DELETE with `override_audit is append-only` once a row exists (an empty-table DELETE never fires the trigger, which is why the contract suite seeds a row first).
- `wrangler d1 migrations apply --local --persist-to <dir>` applies migration `0003` including both triggers through the shipped path, and `getPlatformProxy({ persist: { path: join(dir, "v3") } })` observes that database.
