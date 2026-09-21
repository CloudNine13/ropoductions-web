---
title: 'Story 7.3: Burst-Safe Session Validation for Engine and Asset Requests'
type: 'feature'
created: '2026-09-22'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '58e577da455ca3e42fb82cd636a4cc553b8f66d'
context:
  - '_bmad-output/specs/spec-ropoductions-web/engine-browser-compat.md'
  - '_bmad-output/implementation-artifacts/epic-7-context.md'
  - '_bmad-output/specs/spec-ropoductions-web/save-and-runtime-contract.md'
  - '_bmad-output/specs/spec-ropoductions-web/patron-tier-matrix.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** One engine boot issues 65+ gated requests (`/engine/*` and `/api/game/*`), and each one runs its own `validateSessionAccess` against D1 (`src/app/engine/[...path]/route.ts:189`, `src/app/api/game/[[...asset]]/route.ts:75`). Session validation therefore scales linearly with the boot burst, which is the measured correlation with the owner-reported Firefox reload failures (epic-7 brief defects D1/D3).

**Approach:** A bounded-TTL memo of a *successfully validated* session sits in front of `validateSessionAccess` for the two asset routes only. One boot burst inside one isolate costs one validation pass; concurrent requests for the same session share a single in-flight validation, and each sharer re-checks the window against its own clock. Nothing else changes: D1 stays the authority, every non-authorized outcome and every validation error is re-validated per request and answered `403`/`5xx`, and `/play` keeps strict per-request validation, which is the only path that mounts the engine.

## Boundaries & Constraints

**Always:** only an `authorized` verdict is memoised, and only its bounds — the window deadline and the session's own expiry — are retained; the key is the full 32-byte SHA-256 digest (base64url, 43 characters, never truncated) of `sessionSecret` bound to the session cookie, so a rotated secret misses every entry; the window deadline is measured on a monotonic clock and every hit additionally requires the current wall clock to be before the verdict's `expires_at_sec`, so amortisation can never be more permissive than a fresh validation reading the same instant; concurrent misses for one key share one in-flight validation, and every sharer re-checks the window at its own clock before the verdict is returned; the retained store is per-isolate and bounded (default 256 settled entries, in-flight validations excluded from the cap and always removed when they settle); anonymous requests short-circuit before the memo and cost zero D1 reads; `/play` and the admin surfaces keep strict per-request validation.

**Never:** cache a non-authorized verdict (`not_found`, `invalid_signature`, `revoked`, `override_deleted`, `lapsed`, `unauthorized`); create or extend an entry from a failing request; authorise implicitly on a validation error (the error propagates and the route still answers `500`); keep a per-request fallback path behind the memo; share one entry across distinct sessions; retain the session record, its id, the cookie, or any credential in the memo; add a D1 table, a telemetry endpoint, or env-driven per-deployment configuration; touch `/play`'s deferred double-validation, session issuance, tier gating or the paywall mapping.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Boot burst, authorized patron | 65+ `/engine/*` + `/api/game/*` requests, same cookie, inside one isolate and one window | first request runs the validation pass, the rest are served from the memo: 1 session read for the burst, every response authorized | none |
| Concurrent burst (parallel requests, cold memo) | N requests reach the memo before the first validation settles | all N await one in-flight validation: 1 session read, no duplicate write side effects | none |
| A sharer whose own clock is already past the session expiry | validation in flight while `expires_at_sec` passes | that sharer is answered `lapsed`, not the leader's verdict | contract test pins it |
| Anonymous / no session cookie | request without `ropoductions_session` | immediate `not_found`, no D1 read, no memo entry | engine route keeps the existing mock/404 short-circuit; `/api/game` returns its `403` envelope |
| Forged cookie flood | hundreds of distinct malformed cookies | each is answered `invalid_signature` with no D1 read and leaves no entry; a legitimate burst is still served from the memo | forged keys never become entries |
| Revoked, lapsed, unknown session | verdict is not `authorized` | verdict returned per request, never stored; every subsequent request re-validates and stays rejected | `403` envelope unchanged |
| Session revoked while a window entry is live | valid entry, then the D1 row is revoked | access ends no later than the window after the next request; the entry is never extended | contract test pins the bound |
| Session expiry inside the window | `expires_at_sec` is 5s away, window 60s | entry expires with the session (5s), not with the window: access never outlives the verdict's `expires_at_sec` | contract test pins the cap; after that instant the verdict is `lapsed` |
| Override-elevated session | patron below the pledge floor with a comp/admin override | one validation pass per window; the verdict's expiry is the elevated value `validateSessionAccess` writes (`auth.ts:167`), so the window — not a row expiry — is the effective bound | contract test pins that the entry does not outlive the window |
| Admin/comp session burst | session with an override row | one validation pass per window; that pass costs its normal 2 reads (session + override) once, not per request | unchanged `403`/`500` paths |
| Override deleted mid-flight | admin session whose override row is gone | `override_deleted`, the session is revoked in D1, nothing is memoised, the next request re-validates | unchanged `403` path |
| Wall clock steps forward while an entry is live | host clock jumps past `expires_at_sec` | the wall check fails on the next hit, so the request re-validates | verdict follows the fresh validation |
| Wall clock steps backwards while an entry is live | host clock adjustment during the window | the monotonic deadline still ends the window in elapsed time; the entry cannot be extended | no extension beyond the window |
| Secret rotated while an entry is live | `SESSION_SECRET` changes | the key no longer matches, so the request re-validates and fails signature verification | unchanged `403` |
| D1 failure during validation | `getSessionById` throws | error propagates to the route's existing `catch`, which answers `500`; no entry is created | pending entry removed so the next request retries |
| Entry cap reached | more distinct authorized sessions than `maxEntries` | oldest settled entries evicted; the retained store never grows past the cap | a later request for an evicted session simply revalidates |
| Navigation while a window entry is live | `/play` request after revocation | strict per-request validation at navigation, which is the only path that mounts the engine, so a new game start is always checked at the door | unchanged from today |

</frozen-after-approval>

## Code Map

- `src/lib/session-validation-memo.ts` (new) — `SESSION_VALIDATION_TTL_SEC` (60), `SESSION_VALIDATION_MAX_ENTRIES` (256), `createSessionValidationMemo({ ttlSec, maxEntries, nowMs, nowSec })`, `resolveSessionValidation(request)` over a shared instance, `resetSessionValidationMemo()`, and the entry store (pending single-flight resolutions, settled bounds, eviction).
- `src/lib/crypto.ts` — `hashValue(value)` exported and reused by `generatePkceChallenge` (`crypto.ts:44-54`), full-length SHA-256 base64url digest.
- `src/app/engine/[...path]/route.ts` — the `/engine/*` gate resolves through the memo instead of calling `validateSessionAccess` directly.
- `src/app/api/game/[[...asset]]/route.ts` — same substitution for `/api/game/*`.
- `AGENTS.md` — session-validation clauses (`:41`, `:152`) and the asset-request phrase of the revocation pitfall (`:54`) amended to the amortised fail-closed semantics (OD-1).
- `_bmad-output/specs/spec-ropoductions-web/save-and-runtime-contract.md` §7 (new), `engine-browser-compat.md` §4 (keying clarified), `patron-tier-matrix.md` §2 (re-verification clause) — amended in the same cutover.
- `tests/session-validation-memo.test.ts` (new, registered in `test:unit`) — D1-read-counting suite over the real `validateSessionAccess` path.
- `tests/game-assets.test.ts` — the per-request read assertion (`tests/game-assets.test.ts:458-490`) replaced by the amortised contract; `resetSessionValidationMemo()` wired to the D1 fixture swap.
- `tests/engine-route.test.ts` — burst case added; same reset alongside its D1 fixture swap.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/crypto.ts` — export `hashValue`, reuse it from `generatePkceChallenge`.
- [x] `src/lib/session-validation-memo.ts` — memo factory, shared instance, secret-bound key, single-flight, monotonic deadline plus wall re-check, settled-only eviction, reset seam.
- [x] `src/app/engine/[...path]/route.ts`, `src/app/api/game/[[...asset]]/route.ts` — resolve through the memo.
- [x] `AGENTS.md` (`:41`, `:54`, `:152`), `save-and-runtime-contract.md` §7, `engine-browser-compat.md` §4, `patron-tier-matrix.md` §2 — OD-1 amendment in the same cutover.
- [x] `tests/session-validation-memo.test.ts` + `package.json` — suite registered in `test:unit`.
- [x] `tests/game-assets.test.ts`, `tests/engine-route.test.ts` — superseded per-request expectation replaced; memo reset wired to the fixture swap.

**Acceptance Criteria:**
- Given an authorized patron session inside one isolate, when the boot burst (65+ `/engine/*` and `/api/game/*` requests) is served, then the burst costs one validation pass — one D1 session read for a plain patron session — and every response in the burst is authorized consistently.
- Given a parallel burst on a cold memo, when the requests overlap, then they share one in-flight validation and cost one D1 session read, and each sharer is judged against its own clock.
- Given a validation error, an expired/revoked/unknown session, or a cache miss that cannot validate, when the route answers, then the response is `403`/`5xx` and never implicit authorisation, and the failing request neither created nor extended a window entry.
- Given a live window entry, when the session is revoked or expires, then access ends no later than the window after the next request, and never later than the validated verdict's `expires_at_sec`, with a contract test pinning both bounds.
- Given an anonymous request, when it reaches either route, then it costs zero D1 reads.
- Given the amortisation state, when it is inspected, then it is per-isolate, keyed by a full-length secret-bound digest of the session cookie, retains no session record, id, cookie or credential, and is never shared across distinct sessions.
- Given a route handler that serves an asset, when it resolves a session, then it does so through the memo — no code path keeps the old per-request behaviour as a fallback.
- Given OD-1 is approved, when this cutover lands, then `AGENTS.md`, `save-and-runtime-contract.md`, `engine-browser-compat.md` and `patron-tier-matrix.md` carry the amortised fail-closed semantics.

## Implementation Notes

- The memo is a drop-in at the two asset call sites: both previously called `validateSessionAccess({ db, sessionCookie, sessionSecret: authEnv.sessionSecret, initialAdminIds: authEnv.initialAdminPatreonIds })` and branch only on `validation.status !== "authorized"`, so the resolver returns a bare `{ status }` verdict and no session record crosses the boundary.
- The bound is per isolate, and that is the honest statement of it: Cloudflare may run a burst across isolates and may recycle one at any time, so the guarantee is "one validation pass per isolate per window", not a global one.
- The key is `hashValue(secret + ":" + cookie)`, never `signValue(cookie, secret)`: `signValue` returns `<value>.<signature>` (`crypto.ts:90-103`) and would retain the cookie verbatim in the key. Binding the secret into the digest makes a rotation miss every entry instead of serving a stale authorization for the rest of the window.
- Deadlines are monotonic (`performance.now()`). The wall clock is re-read on every hit and on every joiner, so a forward step invalidates immediately and a backward step cannot extend the elapsed-time window; both checks are needed because the verdict's expiry is a wall-clock value.
- Only settled entries are counted against `maxEntries`, and eviction only removes settled entries: in-flight single-flight is never broken, a flood of cold misses or forged cookies cannot displace a live verdict, and a fresh verdict re-inserts itself as most-recently-validated before trimming, so a wave of concurrent settles cannot leave the store above the cap.
- The wall-clock read that feeds validation is taken before the key is registered, so a synchronous throw cannot park a rejected promise under a key; a key's pending entry is only ever replaced or removed by its own settle, so no identity check is needed there.
- `validateSessionAccess` is not read-only (it revokes on `override_deleted` and elevates via `upsertSession`). Both side effects are suppressed while a live verdict is held, so they run on the first request that validates after the window rather than on every request; no consumer depends on the delayed write, because `/play` and the admin surfaces call the validator directly and the admin resolver re-reads the override itself. An authorized verdict is memoised even when the elevation *write* failed (`auth.ts:171-178` returns authorized by design) — the authorization decision depends on the read path only.
- A validation that never settles pins its key until it does: pending entries are deliberately never counted or evicted. The bound is the runtime's in-flight request concurrency and request lifetime, and only a validly-signed cookie reaches a D1 read at all, so this is accepted rather than given a deadline mechanism.
- The D1 cost of the single pass is path-dependent: 1 session read for a plain patron, 2 reads (session + override) for an admin/comp or overridden session. The guarantee is one pass per burst, not one statement per burst.
- `/play` (`src/app/(game)/play/page.tsx:40`) is the only path that mounts the engine and the admin surfaces (`src/lib/admin.ts:55,176`) keep calling `validateSessionAccess` directly: navigation-time freshness is what makes revocation effective at the door.
- The boot document (`/engine/index.html`) is amortised like every other shell path, because contract §4 covers all of `/engine/*`. Consequence, stated rather than implied: a revoked patron's already-open boot — or a direct asset fetch — can continue for up to the window, and only the next `/play` navigation is strictly checked. A future tightening (keeping `index.html` strict, costing one extra read per boot) would need the contract reopened.

## Spec Change Log

- 2026-09-22 — OD-1 approved by the project owner during Story 7.3 kickoff: bounded-TTL amortisation with the default 60s window and the same-cutover amendment of `AGENTS.md` and `save-and-runtime-contract.md`. Story scope, sequencing (7.2 and 7.3 are independent; the judge-routed order put 7.3 first on blast-radius grounds) and the strict `/play` boundary were confirmed in the same exchange.
- 2026-09-22 — `engine-browser-compat.md` §4 already carries the amortised contract; the amendment set was widened to `save-and-runtime-contract.md` §7, the §4 keying clause and `patron-tier-matrix.md` §2 after review found the session policy still promising per-call re-verification on restricted API calls.
- 2026-09-22 — Pre-implementation roundtable (five independent lenses) corrected three claims in the frozen block: the burst bound is per isolate rather than global; the guarantee is one *validation pass* per burst rather than one D1 statement, because admin/comp and overridden sessions read an override row as well; and the key is a secret-bound digest because `signValue` retains its input verbatim. The window cap was strengthened to a monotonic deadline plus a wall-clock re-check on every hit, and the memo now retains bounds instead of the validation result.

## Review Triage Log

Roundtable 2026-09-22 (WinstonArchitect, AmeliaDev, MaryAnalyst, EdgeCaseHunter, SecurityLens). Every finding adjudicated:

| Finding | Disposition |
|---|---|
| Per-isolate memo cannot prove a global one-read bound (Winston 1) | Accepted — bound reworded to per isolate and stated in Implementation Notes. |
| Cookie-only key ignores secret rotation (Winston 2, EdgeCase 4, SEC-73-07) | Accepted — key is `hashValue(secret + ":" + cookie)`; a rotated secret misses every entry, pinned by a case. |
| FIFO cap evicts in-flight entries (Winston 3, EdgeCase 1, SEC-73-03) | Accepted — the cap counts settled entries only and eviction only removes settled entries, so single-flight survives and forged-cookie floods cannot evict a legitimate entry; pinned by a 300-cookie flood case. |
| Rejection cleanup could leave a rejected pending entry (Winston 4) | Accepted — the pending entry is deleted in the resolver's own error path; the promise stored is the one returned to callers, so no derived rejection exists. |
| A validation settling after session expiry could still be stored (Winston 5) | Accepted — the deadline is recomputed at settle time and a session already past its expiry is not stored. |
| Settle-time wall-clock rollback could violate the expiry cap (Winston residuals) | Accepted — hits re-check the wall clock against the verdict's `expires_at_sec`, so a step forward invalidates immediately and a step backwards cannot outlive the monotonic window; both directions pinned. |
| Memo retains the session record / its id (Winston 6, SEC-73-02) | Accepted — the resolver returns a bare `{ status }` verdict and the memo stores bounds only; a case asserts no session record or credential is retained or returned. |
| "one D1 read" wording false for admin/comp/elevation paths (Winston 7) | Accepted — wording changed to one validation pass with the path-dependent read cost documented. |
| `tests/game-assets.test.ts` pins five reads (Winston 8, Amelia 1) | Accepted — superseded assertion replaced with the amortised expectation in the same PR. |
| Module-level memo leaks across route tests that swap the D1 fixture (Amelia 2) | Accepted — `resetSessionValidationMemo()` wired into both route suites. |
| Clock injection semantics undefined (Amelia 3) | Accepted — injectable `nowMs` (monotonic) and `nowSec` (wall) on the factory, and the memo forwards its wall clock into validation so verdict and bounds share one instant. |
| No read-counting seam in the shared D1 helper (Amelia 4) | Accepted — the new suite owns a counting D1 double instead of adding test-only API to the shared helper. |
| `AGENTS.md` amendment target plural (Mary 3) | Accepted — all three clauses amended (`:41`, `:152`, `:54`). |
| Expiry bound, parallel single-flight, cap eviction, keying hygiene unpinned (Mary 1, 2, 5, 6) | Accepted — each is now an explicit case. |
| Route cutover could be silently missed (Mary 4) | Accepted — `tests/engine-route.test.ts` and `tests/game-assets.test.ts` each assert a real burst through the route handler costs one session read. |
| Elevated session's synthetic 30-day expiry is not the row's expiry (SEC-73-01) | Accepted — the claim is corrected rather than the code: an override-elevated verdict carries the expiry `validateSessionAccess` writes, so the window is the effective bound there; pinned by a case proving the entry does not outlive the window. |
| The engine boot document is itself amortised, so "stopped at the door" overstates (SEC-73-04) | Accepted as a documentation fix — contract §4 covers all of `/engine/*` and `/play` is the only mount path, so the claim was replaced with the accurate one and the tightening option is recorded in Implementation Notes. |
| Joiners receive the leader's verdict without their own clock check (SEC-73-05) | Accepted — every sharer re-checks the window at its own clock; pinned by a gated in-flight case. |
| Key derivation under-pinned (SEC-73-06) | Accepted — full 32-byte digest, base64url, 43 characters, never truncated; pinned by a length and collision case. |
| Amendment set omits the session-policy document (SEC-73-08) | Accepted — `patron-tier-matrix.md` §2 amended in the same cutover. |
| Revoke-during-validate race can resurrect a revoked row (EdgeCase 2) | Rejected as out of scope — pre-existing `upsertSession` behaviour independent of this memo, and the memo makes the write rarer; recorded in `deferred-work.md` with a reopen trigger. |
| Stale role/tier inside a memoised result (EdgeCase 5) | Rejected — the asset routes branch on `status` only, and no record is retained at all. |
| Elevation write failure still yields a memoised authorized verdict (EdgeCase 2b) | Rejected — `auth.ts:171-178` returns authorized by design when only the background elevation write fails; the read path is the authority. |

Post-implementation review 2026-09-22 (Review73Code, Review73Security) over the shipped diff. Every finding adjudicated:

| Finding | Disposition |
|---|---|
| Concurrent settles leave the store above `maxEntries` (Review73Code P1, SEC-73-POST-01) | Accepted — the cap now counts settled verdicts only and eviction runs again on every settle, so a wave of concurrent validations cannot exceed it; a concurrent-settle regression pins it, and the flood case now runs concurrently so "a flood cannot displace a live verdict" is actually proven. |
| A synchronous throw before the first `await` parks a rejected pending promise (SEC-73-POST-02) | Accepted — the wall-clock read was hoisted above key registration, which removes the only synchronous throw site; a key's pending entry can only be replaced by its own settle, so identity-checked deletion would add nothing. |
| Pending entries have no cap or settle deadline (SEC-73-POST-03, informational) | Accepted as a documented residual — only a validly-signed cookie reaches a D1 read, and the bound is the runtime's in-flight concurrency and request lifetime; no deadline mechanism was added. |
| Joiner test did not prove independent per-sharer clocks (Review73Code P2) | Accepted — the case now passes per-request `nowSec` (leader authorized, joiner lapsed) with the D1 read held open, so a shared-verdict regression fails. |
| No mixed-route proof that both handlers share one memo (Review73Code P2) | Accepted — a case drives `/engine/index.html` and `/api/game` through the real handlers with one counting D1 and asserts a single session read. |
| The implementation note overstated the `override_deleted` side effect (SEC-73-POST-04) | Accepted — the note now states that both validator side effects are suppressed for the duration of a live window and run on the first validating request after it. |

## Design Notes

The memo is deliberately not a general session cache: it exists to stop *bursts* from scaling validation, so it is asymmetric — cheap for the success path, transparent for every failure path, and bounded so a long-lived isolate cannot accumulate sessions.

## Verification

**Commands:**
- `node --experimental-strip-types --import ./tests/helpers/register-loader.mjs --test tests/session-validation-memo.test.ts` — expected cases: the 65-request burst costs exactly 1 session read; a 20-way concurrent burst costs exactly 1; a sharer past the session expiry is answered `lapsed` while the leader is authorized; anonymous and secret-less callers cost 0 reads and leave no entry; 300 forged cookies cost 0 reads and leave no entry while a legitimate burst still costs 1, and 50 concurrent forged cookies cannot displace a live verdict; revoked/lapsed/unknown verdicts re-validate on every call; a thrown D1 error rejects, is not memoised, and the next request retries; the revocation bound and the `expires_at_sec` cap are pinned with injected clocks; a forward wall step invalidates and a backward one cannot extend; an override-elevated session does not outlive the window; rotation misses the entry; distinct sessions stay distinct; the store respects `maxEntries` even when concurrent validations settle together, and an evicted session revalidates; keys are 43-character digests that never embed the cookie; the verdict is a bare `{ status }`; an admin session whose override vanished is revoked and never memoised; and a mixed `/engine` + `/api/game` burst through the real handlers costs one session read.
- `npm run test:unit` — expected: all suites pass, including `tests/suite-manifest.test.ts`, `tests/auth.test.ts`, and the updated `tests/engine-route.test.ts` / `tests/game-assets.test.ts`.
- `npx tsc --noEmit` — expected: no type errors.
- `npm run lint` — expected: no errors.
- `npm run build` — expected: OpenNext build succeeds.
- `npm run test:e2e` — expected: Chromium specs pass; `e2e/edge-gating.spec.ts` is unaffected because non-authorized verdicts are never memoised.
