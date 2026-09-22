---
title: 'Story 7.5: Firefox, Reload-Storm and Asset-Burst Verification'
type: 'feature'
created: '2026-09-22'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'a0266bc6459fdea475bbc9d47f9ad6afcd10c145'
context:
  - '_bmad-output/specs/spec-ropoductions-web/engine-browser-compat.md'
  - '_bmad-output/implementation-artifacts/epic-7-context.md'
  - '_bmad-output/planning-artifacts/briefs/brief-epic-7-2026-09-21/brief.md'
  - '_bmad-output/implementation-artifacts/spec-7-2-release-addressed-immutable-engine-shell-delivery.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** the browser behaviour Epic 7 fixes is asserted only where it is easiest to assert. `playwright.config.ts` runs one Chromium project, so the Firefox reload defects that started the epic (brief §Problem D1-D3) would ship unnoticed again; and the epic's delivery metrics — no shell revalidation burst, a 65+ request boot burst that costs one session validation, an honest WebGL refusal — were verified once by hand and are not reproducible from the repository.

**Approach:** close the epic with the verification it asks for, in the browsers it names. Firefox and Chromium run the same suite; a `firefox-webgl-disabled` project drives the honest-failure path in a profile that genuinely refuses WebGL contexts. The shell metrics are measured against the real routes: the boot request profile (70 requests, the shape measured in the brief) is replayed in both browsers against locally seeded shell objects, and its D1 cost is asserted where D1 is observable — the route handlers. `npm run profile:boot` reproduces the Epic 7 evidence table on demand.

## Boundaries & Constraints

**Always:** assert observable behaviour (statuses, cache headers, transferred bytes, player-visible panel), never source text; the boot profile that media and shell routes see must keep the measured shape (13 core scripts, ~45 plugins, css, icon, wasm, fonts, data JSONs); the mock harness keeps its `no-store` semantics (a published shell is the only thing that is immutable); fixture objects are named `ropoductions-e2e-fixture` so seeding can never overwrite a real game object in a developer's local bucket.

**Never:** change production serving behaviour to make a test possible; intercept page traffic with `page.route` in a cache measurement (`page.route` disables the HTTP cache, which would make the measurement meaningless); pin a browser-internal error string; treat a browser-only signal as the sole cache evidence; delete or re-pin assertions that merely described the Chromium-only harness — they are replaced by the real ones.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| `/play` boot | mock harness, patron session | ready report, canvas visible, no recovery surface, zero failure reports | n/a |
| Five reloads of `/play` | same session | one shell document request per load, ready each time, zero reports | n/a |
| Reload of an addressed shell | released document, addressed subresources | document revalidates (one conditional request), zero addressed subresource requests reach the network | n/a |
| Burst replay | the 70-request profile, patron session | every response 200 then 304, addressed shell `private, immutable`, unaddressed shell and media `private, max-age=86400` | 403/404/500 fail the assertion |
| Burst cost | same profile through both route handlers | one D1 session read, zero override reads, zero writes | any extra read fails the assertion |
| WebGL disabled profile | Firefox `webgl.disabled=true`, active locale `ru` | classified panel in `ru`, browser's own status message attached, engine document never requested | n/a |
| `profile:boot` against a mock target | no published shell | report marked `mock`, exit 1 unless `--allow-mock` | never silently measures the mock |
| `profile:boot` against a published target | `PROFILE_SESSION_COOKIE` | boot profile, WebGL contexts created/released, per-request statuses | missing cookie fails with the reason |

</frozen-after-approval>

## Design Decisions

**Cache evidence is server-side, not browser-side.** The 7.2 verification record claimed Playwright-driven Chromium does not serve immutable responses from the HTTP cache, which would have made a browser-level reload metric impossible. Measurement contradicts it: with a real server (not `page.route`), the second navigation produces `request.timing().responseStart === -1`, `transferSize === 0` and **no server-side request line**, in both Chromium and Firefox (calibration harnesses: a local static server for the first two signals, the wrangler preview request log for the third). The reload spec therefore asserts `transferSize === 0` for every addressed subresource after the first load and cross-checks with the preview's request log in this story's verification record. `page.route` is never used in that spec, because interception disables the cache.

**The boot profile is a fixture, the routes are production.** CI has no private bucket, so the harness seeds its own shell objects (`scripts/e2e/setup-e2e-env.ts`) under fixture-only keys and serves them through the real `/engine/[...path]` and `/api/game/[[...asset]]` handlers. The profile keeps the measured boot shape and count; the addresses (`?v=<64-hex>`), cache policies, session gate and D1 amortisation under test are the shipped ones. Rejected alternatives: baking a digest into the mock harness (breaks the generated-mirror byte-identity assertion and changes a production mock for test convenience) and seeding real shell paths (would overwrite real objects in a developer's shared local bucket).

**The validation-read bound lives at the route level.** D1 reads are not observable from a browser, and the memo is per isolate, so "one burst costs one validation read" is asserted by `tests/asset-burst.test.ts`, which drives both real GET handlers with a counting D1 over the same profile. The browser-level burst asserts what a browser can see: 200/304 for every request and the per-class cache policy.

## Code Map

- `playwright.config.ts` — `chromium` and `firefox` projects (both ignore the WebGL-disabled spec), `firefox-webgl-disabled` project (`launchOptions.firefoxUserPrefs: { "webgl.disabled": true }`, `testMatch` the same spec).
- `e2e/fixtures/engine-boot-profile.ts` — the pinned 70-request boot profile, the fixture release identifier, the fixture shell document and `seededShellFixture()`.
- `e2e/helpers/boot-reports.ts` — records `ROPODUCTIONS_ENGINE_READY`/`ROPODUCTIONS_ENGINE_BOOT_FAILURE` messages in every frame and reads `PerformanceResourceTiming` entries.
- `e2e/engine-boot.spec.ts` — boot reaches ready with no recovery surface and no failure report (both browsers).
- `e2e/reload-storm.spec.ts` — five `/play` reloads (reports, document requests) and the addressed-shell reload measurement.
- `e2e/asset-burst.spec.ts` — replays the profile through the live routes, asserting 200 then 304 and the cache policy per class.
- `e2e/webgl-unavailable.spec.ts` — the honest-failure path under `webgl.disabled=true`, active locale `ru`.
- `tests/asset-burst.test.ts` — the profile through both real handlers with a counting D1: one session read, zero override reads, zero writes; anonymous burst costs nothing.
- `scripts/engine-boot-profile.ts` + `npm run profile:boot` — the evidence-table harness (WebGL contexts created/released, request statuses, provenance, JSON sidecar).
- `scripts/e2e/setup-e2e-env.ts` — seeds the fixture shell and profile objects into local R2.
- `.github/workflows/e2e.yml` — installs Firefox and runs both browsers.
- `e2e/engine-boot-recovery.spec.ts` — the superseded Chromium-only boot case deleted (replaced by `e2e/engine-boot.spec.ts`); `e2e/save-hud.spec.ts` — the "in Chromium" title dropped; `_bmad-output/implementation-artifacts/handoff-story-7-1.md`, `AGENTS.md`, `sprint-status.yaml` — same-cutover documentation.

## Tasks & Acceptance

**Execution:**
- [x] `playwright.config.ts` — Firefox and WebGL-disabled projects.
- [x] `e2e/fixtures/engine-boot-profile.ts`, `e2e/helpers/boot-reports.ts` — profile and observation helpers.
- [x] `e2e/engine-boot.spec.ts`, `e2e/reload-storm.spec.ts`, `e2e/asset-burst.spec.ts`, `e2e/webgl-unavailable.spec.ts`.
- [x] `tests/asset-burst.test.ts` + `package.json` registration.
- [x] `scripts/e2e/setup-e2e-env.ts` fixture seeding.
- [x] `scripts/engine-boot-profile.ts` + `npm run profile:boot`.
- [x] `.github/workflows/e2e.yml` Firefox install and job naming.
- [x] Documentation: AGENTS.md, handoff, sprint-status, this spec.

**Acceptance Criteria:**
- Given `playwright.config.ts`, then a Firefox desktop project runs the e2e suite alongside Chromium and CI executes both.
- Given `/play` with the engine harness, then an engine-boot spec asserts the engine reaches ready with no recovery surface in both browsers, and a reload-storm spec performs five consecutive reloads asserting no recovery surface, no missing-asset report and no shell revalidation burst.
- Given the boot request profile, then an asset-burst spec replays it against the routes asserting every response is 200/304 with no more than one validation read.
- Given a WebGL-disabled browser profile, then it drives the honest-failure path and asserts the classified panel and the raw status message in the active locale.
- Given the harness that produced the Epic 7 evidence table, then a repository script boots the shell in Firefox and Chromium and prints the boot profile, per-boot WebGL context count and per-request statuses.
- Given the new test files, then they are registered in the suite manifests, and superseded source-text assertions are deleted rather than re-pinned.

## Verification Record (2026-09-22)

Baseline: `origin/develop` @ `a0266bc`; every command below ran in the story worktree after the last edit.

| Command | Result |
|---|---|
| `npm run test:unit` | 543 pass, 0 fail (96 suites), including the new `tests/asset-burst.test.ts` and `tests/suite-manifest.test.ts` registration |
| `npx tsc --noEmit` | clean |
| `npm run lint` | 0 errors, 4 pre-existing warnings (`src/components/error-reaction-icon.tsx`, `src/lib/engine-addressing.ts`, `tests/admin-layout.test.ts` x2); none in this story's files |
| `npm run test:e2e` (worker built by the suite's `webServer`) | 99 passed in 1.2m — 49 chromium, 49 firefox, 1 `firefox-webgl-disabled` |
| `npm run profile:boot -- --allow-mock` | chromium: ready in 490 ms, WebGL contexts created 1 / released 1, shell 2, media 0, non-200/304 0; firefox: 1134 ms, 1 / 1, same request shape; report sidecar written |

**Reload-storm ground truth (server side, both browsers).** The spec was driven against a debug-logged preview (`--log-level debug`, throwaway config in gitignored `tmp/`) so the metric could be read off the server rather than the client:

- Chromium — first load: `shell.html` 200, one css 200 and 58 script 200s (59 addressed shell subresources); then four reloads: exactly one `GET .../shell.html 304 Not Modified` per reload and **zero** request lines for any addressed subresource.
- Firefox — identical: first load 200s, then four `304 Not Modified` document lines and zero subresource lines.

This settles the contradiction with the 7.2 record's claim that Playwright-driven Chromium cannot observe HTTP-cache reuse: the earlier measurement must have been taken through `page.route` interception (which disables the cache) or from the `request` event list, which also lists cache-served requests. The reload spec therefore measures `transferSize === 0` per addressed subresource (calibrated in both browsers: cache-served responses report `transferSize` 0 and `timing().responseStart` -1 while the server sees no request) and never intercepts page traffic.

**WebGL-disabled non-vacuity.** Before the spec was written, the profile was probed directly: Playwright Firefox 155 with `webgl.disabled=true` returns `null` from `getContext("webgl")` and dispatches `webglcontextcreationerror` with `statusMessage = "WebGL is currently disabled."`; the same probe without the preference returns a context. The spec asserts the classified panel in `ru`, the untranslated status message, the localized "context refused" row, no engine document request and no iframe.

**Deleted rather than re-pinned.** The Chromium-only `/play` boot case in `e2e/engine-boot-recovery.spec.ts` (superseded by `e2e/engine-boot.spec.ts`, which also asserts the ready report and an empty failure-report stream); the "`... in Chromium`" title in `e2e/save-hud.spec.ts`; and the Chromium-only prose in `handoff-story-7-1.md`.

**Honest limits.**

- The private bucket is unreachable from CI: e2e seeds fixture-named objects, so the profile script's real-shell table needs `--target` on the deployed portal (with `PROFILE_SESSION_COOKIE`) or on a preview whose bucket holds a published shell (the staging flow the 7.2 record used). The plumbing was verified against the local target in both browsers, and a mock target is refused so the table can never be mistaken for production delivery.
- The per-boot WebGL context count cannot be produced in CI: the mock harness allocates none, so the number recorded above is the host's own preflight probe (created 1, released 1). The engine's real count needs the real shell.
- The upstream file names of the 65+ profile live only in the bucket; the pinned profile preserves the measured shape and count with fixture paths and a `represents` column naming the upstream path each stands in for.
- Sprint tracking was corrected in the same cutover: 7.1-7.4 are merged in `develop` and were still marked `review`.
