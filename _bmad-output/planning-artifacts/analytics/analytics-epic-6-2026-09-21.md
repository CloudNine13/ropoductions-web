# Epic 6 Analytics: Admin Panel Entry, Fullscreen State Loss & Save HUD Default Visibility

- **Date:** 2026-09-21
- **Owner:** Igor (studio owner) — decisions recorded in the Decision Log below
- **Scope:** three owner-reported defects observed in manual testing of the deployed portal
- **Status:** analysis complete; decisions locked; downstream artifacts (brief, spec, docs, histories) derive from this document
- **Predecessors:** Epic 5 (Internal Studio Administration) `done`; PR #49 merged to `develop` at `014c472`

## 1. Method

Findings are grounded in read-only inspection of the `develop` tip, four parallel read-only scout reports (admin access, `/play` dock/fullscreen, engine plugin/shell, planning docs), a four-way design/architecture/code/security debate, and one decisive browser experiment. Every claim below carries a `path:line` source or a measured result. No code was modified while producing this analysis.

## 2. Defect D1 — No user-facing entry point to `/admin`

**Symptom (owner):** there is no button leading to the admin panel; the only path is typing the URL.

**Evidence.**
- Exhaustive grep for `/admin` references across `src/`: matches exist only inside `src/app/(admin)/**` (internal nav) and the literal `"Studio Admin"` tier name in `src/app/api/auth/callback/route.ts:231`. `StudioHeader`, the `/play` header, hero, footer, and every client component contain zero admin references.
- `src/proxy.ts:46-48` — `config.matcher = ["/play/:path*", "/api/game/:path*"]`; `/admin` is deliberately excluded so no middleware redirect ever discloses the route's existence.
- `src/lib/admin.ts:99-137` — `requireAdminSession` (React `cache()`) fails closed with `notFound()` for: missing session cookie, age cookie ≠ `true`, infrastructure failure, validation throw, and resolved non-admin.
- `src/lib/auth.ts:255` — `issueSessionResponse` hardcodes `headers.set("Location", "/play")`; `src/components/patreon-paywall-card.tsx` renders a bare `href="/api/auth/patreon"`; no `?return=`/`?next=` mechanism exists anywhere.
- `_bmad-output` docs specify only the *exit* affordance (`/admin` → `/play`) and the anti-enumeration 404; no document anywhere specifies an entry point.

**Root cause:** the entry point was never specified by any artifact, so none was built. The panel's *gating* is correct; its *discoverability* is absent.

**Secondary defect discovered during analysis (same code path).** `src/lib/auth.ts:146-148`: for a session whose stored role is `"patron"`, an authorized pledge returns `{ status: "authorized", session }` **before** `patron_overrides` is consulted — the override lookup only runs on the insufficient-pledge path (`:152-176`). Consequences: (a) `/play`'s role pill, gated on `session.role !== "patron"` (`src/app/(game)/play/page.tsx:70`), never renders for an admin who also holds an active pledge — i.e. for the owner; (b) any entry point gated on `session.role === "admin"` would be invisible to exactly that person. Admin identity for chrome must therefore be resolved from the override table, never from the session role.

## 3. Defect D2 — Fullscreen enter/exit restarts the game

**Symptom (owner):** using the dock's fullscreen button returns the game to the main menu, both on entering and on leaving fullscreen; progress is lost.

**Measured root cause.** `src/components/game-viewport.tsx` returns **two structurally different JSX trees**: `if (activeFullscreen) { return (…) }` at `:301` versus the windowed return at `:358`. The shared `engineFrame` element sits at a different nesting depth in each branch (`container > wrapper > inner > iframe` windowed vs `container > wrapper > iframe` fullscreen), so React unmounts the old subtree and mounts a new iframe. The browser then reloads `/engine/index.html` and RPG Maker MZ boots to the title screen. `key={engineKey}` is irrelevant to this.

Experiment (Chromium 153 / React 19.2.8, throwaway harness, iframe `load`-event counting plus node-identity and MutationObserver instrumentation):

| variant | engine `load` events across enter→exit | iframe node identity | DOM mutations on the iframe node |
|---|---|---|---|
| current two-branch JSX | 1 → 2 → 3 | changes on every toggle | 2 moves per toggle |
| single stable tree | 1 → 1 → 1 | identical | 0 |

Control experiment: promoting an ancestor element into the top layer with `requestFullscreen()` does **not** reload a child iframe (`loads` stayed 1 with an untouched DOM node). Browser behaviour is therefore excluded as the cause; the defect is entirely host-side React reconciliation.

**Secondary effect (same cause):** the dock wrapper element is also recreated on every toggle, so `SaveHudDock` remounts, resetting its idle-dim timer and any in-flight export state.

**Engine side is clean.** `src/engine-plugins/Ropoductions_WebBridge.js` and `src/engine-plugins/mock-shell.html` contain no fullscreen/resize/orientation/visibility handlers and never call `SceneManager.goto` or reload the engine. `src/app/engine/[...path]/route.ts` has no reboot logic.

## 4. Defect D3 — Dock buttons visible when they should be hidden

**Symptom (owner):** the dock buttons are shown by default and are shown when entering fullscreen; they should be hidden by default.

**Evidence.**
- `src/components/save-hud-dock.tsx`: `role="toolbar"` with four always-rendered buttons; idle behaviour is chrome-only dim after `DEFAULT_IDLE_TIMEOUT_MS = 4000` (`data-dimmed`, `bg-[#090A0F]/40 border-white/5`). Buttons never hide.
- `src/components/game-viewport.tsx:317-325` renders the dock inside `{!isHudCollapsed && …}` with a 44px `save-hud-collapse-fab`; `handleFullscreenChange` resets `isHudCollapsed(false)` on exit (`:67-70`), so the fullscreen dock always reopens.
- Documentation conflict: `DESIGN.md` §3 states "Fullscreen overlay defaults expanded; collapse is user-invoked only and resets on fullscreen exit", and a prior handoff explicitly rejected auto-collapse ("FR-14 wins: auto-collapse hides the primary Export action + breaks 2.4.3 order"). The owner's decision reverses this; a dated amendment is mandatory.

## 5. Decision Log

### 5.1 Settled before this analysis

| ID | Decision | Rationale recorded |
|---|---|---|
| Q1 | "Behind the paywall" means a Patreon **authentication** wall, never an active-pledge requirement | admins are identified by `patron_overrides` rows and `CREATOR_ADMIN_PATREON_IDS` env bootstrap; requiring a live pledge would self-lock-out the owner |
| Q2(i) | unauthenticated ⇒ auth wall; authenticated non-admin ⇒ 404 | superseded by Q9 below |
| Q3 | entry rendered server-side only for a confirmed admin; never a public locked button | avoids advertising an admin surface |
| Q5(b) | dock collapses to a persistent 44px handle | identical rule windowed + fullscreen; superseded by Q13 |
| Q6 | one new Epic 6, three stories, three PRs, docs-only PR first | the two `/play` defects are independently verifiable and must not ride along with an access change |
| Q7 | e2e regression asserting the engine boots exactly once across fullscreen enter→exit | a unit test cannot catch an iframe remount |
| Q11′ | no `returnTo` / return-target plumbing in v1 | `Location: /play` is a locked story 2-2 contract; a return target is new open-redirect surface for one click of convenience |

### 5.2 Owner decisions locked 2026-09-21 (this session)

| ID | Decision | Consequence |
|---|---|---|
| **Q9 = no wall** | `/admin` returns **404** for everyone except a valid admin session — logged out, stale, forged, and valid-but-non-admin alike. Admin login *is* the play login; there is no separate admin login path. | Zero auth-flow change. All four `e2e/admin.spec.ts` tests stay green. No amendment to SPEC CAP-10, PRD FR-20, or AD-10. No new enumeration oracle is introduced. |
| **Q10** | Admin entry lives in the `/play` header, gated by a shared override-table-based resolver; the portal header carries the same entry via a server-resolved prop. | Gating must never use `session.role` (§2 secondary defect). |
| **Q10b** | Delete the `/play` role pill (`session.role !== "patron"` block, `play/page.tsx:70-77`) and place the admin-panel button in that zone. Founder/creator-admin distinctions are **not** displayed in patron-facing chrome. | The admin panel's sealed/creator-admin display and the two-tier model are untouched. |
| **Q12** | Age gate precedes any gated surface (confirmed). | With Q9 there is no admin login path, so the only effect is the known consequence recorded in §6. |
| **Q13** | Dock collapse is **fullscreen-only**; the windowed dock keeps today's dim-only behaviour. | The DESIGN amendment narrows to the fullscreen overlay's default. |
| **Visibility rule** | Every admin flavor (creator + panel-assigned) sees the entry; `comp` sessions do not, since `comp` cannot reach `/admin` at all. | `resolveAdminAccess` returns `"admin" | "comp" | null`; only `"admin"` renders the entry. |

### 5.3 Rejected alternatives (recorded, not silently dropped)

| Option | Rejected because |
|---|---|
| **D1** — root-level `src/app/not-found.tsx` interstitial with a sign-in affordance keyed on visitor state | Does not implement the owner's Q2(i) interstitial; renders outside `(portal)/layout.tsx` so it either skips the age gate or re-implements it; changes the 404 body of every unmatched URL; Next docs warn that a check inside a streamed shell degrades to a 200 soft-404, which would make enumeration assertions false-pass. |
| **D2** — segment-scoped `(admin)/not-found.tsx` interstitial | Not implementable: a `notFound()` throw from a segment's own `layout.tsx` falls through to the **nearest parent** boundary (Next `not-found.mdx`, same nesting rule that stops `error.tsx` catching its own layout), and the guard lives in `(admin)/layout.tsx:13`. Implementing it would require moving the guard into each page, regressing the epic-5 layout-authority decision and breaking `tests/admin-layout.test.ts`. |
| **D3** — layout redirect to the landing auth wall, with a credential-presence ladder and a `{"/admin"}` return target carried in the signed OAuth verifier cookie | Rejected by owner decision Q9: it redirects a logged-out visitor instead of returning 404, which contradicts "if no admin go to /admin, the app should throw 404", and it exists solely to serve a wall the owner ruled out. Everything built on it (`hasEntryCredentials`, the ladder, the verifier-payload union, the CAP-10/FR-20/AD-10 amendments, the four-test rewrite) is dropped with it. Its reasoning is retained for a future revisit: a redirect target byte-identical to the proxy's `/play` gate would make anonymous `/admin` indistinguishable from anonymous `/play`. |
| **Gating the entry on `session.role === "admin"`** | Provably broken for a pledging admin (§2 secondary defect): the button would never render for the owner. |
| **Placing the entry inside the save dock** | Mixes navigation into save chrome governed by "never ship disabled toolbar actions", and after Q13 the dock is collapsed by default in fullscreen — the panel entry would be hidden behind a handle. |
| **Return-target plumbing (any form)** | Locked 2-2 contract plus open-redirect surface; the `/play` entry button covers the hop with one extra click. |

## 6. Known consequences accepted

1. An admin whose 30-day session or 14-hour age cookie has lapsed and who types `/admin` receives a 404. Recovery is the normal play path: `/play` → age gate → Patreon login → `/play` → admin entry button. This is accepted as the cost of the no-wall decision (Q9).
2. `comp` pass holders have no indicator of their role in the `/play` header after Q10b; their tier badge still renders `Complimentary Pass` from `session.tier_name`, so no information is lost.
3. The `public/engine/**` mirror of the engine plugin named in `AGENTS.md` does not exist on `develop` (only stale, gitignored copies inside `.worktrees/*`), consistent with PR #47 moving shell delivery to R2. The contract text is stale; recorded as a docs-reconciliation item, not Epic 6 scope.
4. `sprint-status.yaml` lags merged artifacts (5-4 `in-progress` while PR #45 is merged; retro item 9 `open` while FR-20/FR-21 are back-filled). Reconciled in this pass.

## 7. Amendment map (which documents change)

| Document | Change |
|---|---|
| `_bmad-output/planning-artifacts/briefs/brief-epic-6-2026-09-21/brief.md` | New epic-scoped brief (this chain's step 2) |
| `specs/spec-ropoductions-web/SPEC.md` | New capability for the admin entry point and for the engine-iframe lifecycle invariant |
| `specs/spec-ropoductions-web/save-and-runtime-contract.md` | Fullscreen continuity clause; dock visibility contract scoped to fullscreen |
| `prds/prd-ropoductions-web-2026-09-15/prd.md` | FR-22 (admin panel entry point), FR-23 (fullscreen state continuity); FR-12 consequence clarified |
| `architecture/…/ARCHITECTURE-SPINE.md` | AD-11 (single-tree viewport / iframe lifecycle) + admin-entry addendum to AD-10 |
| `ux-designs/…/DESIGN.md` | Layer 2 + §3 (fullscreen dock default) + §6 (admin entry), dated amendment |
| `ux-designs/…/EXPERIENCE.md` | Component 2 (dock states), IA row for `/admin`, admin entry flow, microcopy |
| `planning-artifacts/epics.md` | Epic 6 + stories 6.1/6.2/6.3 + dated amendments |
| `implementation-artifacts/spec-6-*.md` | Three story specs |
| `implementation-artifacts/sprint-status.yaml` | `epic-6` + story keys, priorities, status reconciliation |
| `implementation-artifacts/deferred-work.md` | Items recorded in §6 |

## 8. Verification plan

| Story | Proof required |
|---|---|
| 6.1 | Unit: override-table resolution returns `admin`/`comp`/`null` and never consults `session.role`; portal/`play` chrome renders the entry only for `admin`; a pledging admin session (cookie role `patron` + override row) renders the entry. e2e: admin session reaches `/admin`; **valid non-admin session gets 404 with no `Location`** (currently untested — the existing suite covers only anonymous and forged cookies); all four existing `e2e/admin.spec.ts` tests stay green. Locale parity across six locales. |
| 6.2 | e2e: engine boot count stays exactly 1 across fullscreen enter→exit, driven through the real `GameViewport` on `/play` with the mock harness (pre-fix the same test must show 2). Unit: single-return structure assertions replace the old branch assertions. |
| 6.3 | Unit: dock defaults to collapsed in fullscreen, never in windowed; entering fullscreen collapses; expansion only via explicit affordance; canvas/bridge activity never restores chrome; export-in-flight and open dialogs hold expansion. e2e: dock hidden on fullscreen entry. |
| All | `npm run test:unit` → `npx tsc --noEmit` → `npm test` → `npm run build`, plus zero conflicts against `origin/develop` before each PR. |

## 9. Assumptions

- The owner's answers Q9/Q10/Q10b/Q12/Q13 as transcribed in §5.2 are the state of record; Q10b is read as deleting the patron-facing role pill, not as flattening the two-tier admin model.
- The measured fullscreen remount mechanism transfers to the production engine shell served from R2, since the defect is host-side and the engine has no fullscreen handling.
