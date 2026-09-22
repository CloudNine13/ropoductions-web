---
title: 'Story 7.2: Release-Addressed Immutable Engine Shell Delivery'
type: 'feature'
created: '2026-09-22'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '8c0be722ecd72549ded764f7bc8c4eafc05f598b'
context:
  - '_bmad-output/specs/spec-ropoductions-web/engine-browser-compat.md'
  - '_bmad-output/implementation-artifacts/epic-7-context.md'
  - '_bmad-output/specs/spec-ropoductions-web/save-and-runtime-contract.md'
  - '_bmad-output/planning-artifacts/briefs/brief-epic-7-2026-09-21/brief.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** the engine shell is streamed from R2 with `Cache-Control: private, max-age=86400` and no release addressing, so a reload of `/play` revalidates every shell file (65+ gated requests per boot, measured in the Epic 7 brief). On Firefox that revalidation burst correlates with the owner-reported missing sprites/cursor and boot failures.

**Owner decision (2026-09-22) — the core architecture of this story, verbatim intent:** *"The web should not ask if there is a release or no. The web should not know there is a release. In GitHub Actions of the game repository there is an action that starts the action in this repo pulling the game from GitHub. The game devs will use it only when they have a prepared release, so the web should not know about release, shouldn't ask, neither invalidate the files. Instead the scripts to publish should replace the previous version with the pulled one; the web only must show the pulled files."*

**Therefore the boundary of responsibility is:**

1. **The publish pipeline owns game versioning.** `scripts/sync-game-release.ts` + `.github/workflows/sync-game-release.yml` are the only components that know a game revision exists. They compute a release identifier, bake it into the shell content they publish, and replace the previously published shell with the pulled one. There is no manifest/pointer object for the runtime to read, no release registry, no version comparison anywhere in `src/`.
2. **The web runtime is release-agnostic.** `/play` and the `/engine/[...path]` route serve whatever object the pipeline placed in R2. They never resolve, compare, or validate a "current release", never read release metadata, and never refuse a request because a release changed. The only version-shaped input the runtime sees is a cache-addressing query on a URL that the pipeline itself generated.
3. **Versioning exists only to make the browser cache immutable.** The pipeline gives every shell subresource URL a content-addressed query (`?v=<releaseId>`), so a reload is served from the browser cache with zero requests, and a changed shell is a different URL set. Media (`img/`, `audio/`, `effects/`, `movies/`, `data/`) is never addressed and keeps its existing `private, max-age=86400`, because the upstream sync is additive and reuses file names.

**Consequences accepted by the owner in the same exchange:** the release identifier is a content digest of the published shell (not an upstream commit sha, which is not a content identity); media URLs stay stable so no release forces a media re-download; the shell document stays at `/engine/index.html` (no versioned path), keeping the same-origin/IndexedDB invariant and the architecture-spine rule intact.

## Boundaries & Constraints

**Always:** the pipeline computes the release id as a sha256 over the staged shell tree plus the addressing revision, and validates every URL-building site it patches before publishing; the pipeline publishes tree-first and never introduces a runtime-readable pointer or manifest; the shell document (`index.html`) is served `private, no-cache` so a browser always discovers the newly published shell (a conditional request, at most one per `/play` load); addressed shell responses are `private, immutable, max-age=31536000`; unaddressed shell responses (a reference the pipeline did not address, e.g. a plugin-built URL) keep `private, max-age=86400` so a gap degrades to a revalidation instead of breaking the boot; media responses are untouched at `private, max-age=86400`; the patron gate, `Vary: Cookie`, `Cross-Origin-Resource-Policy`, ETag/304, Range/206, HEAD and every 4xx/5xx envelope keep their current semantics; the mock harness keeps `no-store` and stays reachable while R2 holds no published shell.

**Never:** resolve, read, compare, memoise, or document a "current release" in `src/` (no pointer object, no `engine-release.ts` memo, no `/play` server-side release lookup, no versioned R2 prefix that the runtime must interpret); refuse a shell request because its identifier differs from something the runtime knows; rewrite media URL builders; touch `next.config.ts` rewrites, `src/proxy.ts`, the iframe lifecycle, the save bridge, or the edge cache posture; let an unaddressed shell response be cached immutably; cache the shell document immutably.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Reload of `/play`, no new release | browser holds the addressed shell in cache | one conditional document request (304), zero shell subresource requests | none |
| First load after a release | document revalidates, references a new `?v=<releaseId>` set | every shell file is a new URL set: one cold shell fetch, no mixed versions | none |
| Rollback (pipeline re-publishes older content) | identical bytes ⇒ identical digest | identical URLs, so cached entries are already correct; changed bytes ⇒ different URLs | none |
| Shell reference the pipeline did not address (plugin-built URL) | shell path without `?v=` | served `private, max-age=86400` (revalidating), the boot is unaffected | none |
| Addressing validation fails at publish | upstream changed a URL-builder expression | the sync run FAILS with the unmatched site named; nothing is published | fail-closed in the workflow |
| Metadata file | `build-metadata.json` in the staging tree | excluded from the R2 sync; the runtime never reads it; not servable at `/engine/build-metadata.json` | 404 (path not allowlisted) |
| Anonymous shell request | no patron cookies | unchanged: mock for the two mock paths, 404 otherwise, no R2/D1 read | unchanged |
| Media request | `data/`, `img/`, `audio/`, `effects/`, `movies/` | unchanged: `/api/game/*`, `private, max-age=86400`, release-agnostic | unchanged |
| Release lands mid-boot | a parsed document requests the previous id set while the pipeline replaces objects | window is sub-second; a file already cached is unaffected; a file fetched in the window can mix for that one boot | documented residual |
</frozen-after-approval>

## Architecture Decision (recorded so later sessions cannot silently re-add release awareness)

**Decision:** game version/release identity is a *publish-pipeline* concern, never a *web runtime* concern. The runtime is a patron-gated file server over R2.

**Why:** the game repository triggers the sync action only when a release is prepared, so the web has nothing to decide: there is exactly one published shell at a time. Adding runtime release awareness (a pointer object, a release registry, a version comparison, a `/play` lookup) adds a distributed-consistency problem (per-isolate caches, cross-colo staleness, atomicity between pointer and tree) that buys nothing, and it breaks the documented same-origin/IndexedDB invariant as soon as it turns into a versioned path or subdomain.

**How immutability is achieved without runtime awareness:** the pipeline bakes a content-addressed query into the shell *content* (`?v=<sha256 of the staged shell + addressing revision>`), so the browser's cache key changes with the bytes and nothing else. The pipeline is the only writer of both the content and the identifier, and it validates the mapping before publishing.

**Non-negotiables that follow:** no runtime release resolution; no refusal based on identifier freshness; media never addressed; the document always revalidates; unaddressed shell paths degrade to the moderate cache.

## Code Map

- `src/lib/engine-addressing.ts` (new) — the single source of truth for the identifier format (`ENGINE_RELEASE_PARAM`, `ENGINE_RELEASE_ID_PATTERN`, `ADDRESSING_REVISION`), the pure digest (`computeReleaseId`), the pure reference rewriter with per-site validation (`addressShellReferences`), and the pure cache policy (`resolveShellCacheControl`).
- `scripts/sync-game-release.ts` — computes the release id over the staged shell, addresses the staged references, records `releaseId`/`addressingRevision` in `build-metadata.json`, prints the identifier.
- `.github/workflows/sync-game-release.yml` — keeps the additive, release-agnostic `aws s3 sync` into the `engine/` prefix, excludes `build-metadata.json` from the upload, logs the release id.
- `src/app/engine/[...path]/route.ts` — release-agnostic cache policy only: document `no-cache`, addressed shell `immutable`, unaddressed shell `86400`, mock unchanged; `build-metadata.json` dropped from the shell allowlist.
- `_bmad-output/specs/spec-ropoductions-web/engine-browser-compat.md` §2/§6, `save-and-runtime-contract.md` §5/§6/§7, `ARCHITECTURE-SPINE.md` AD-5/AD-9 (+ new decision note), `patron-tier-matrix.md` §2, `AGENTS.md`, `epic-7-context.md`, `epics.md` (dated amendment), `sprint-status.yaml` — same-cutover amendments.
- `tests/engine-addressing.test.ts` (new), `tests/engine-route.test.ts`, `tests/game-sync.test.ts`, `tests/workflow-manifest.test.ts`, `package.json` (`test:unit` registration).

## Tasks & Acceptance

**Execution:**
- [ ] `src/lib/engine-addressing.ts` — identifier constants/pattern, digest, rewriter + validation, cache policy.
- [ ] `scripts/sync-game-release.ts` — digest + addressing pass + metadata fields + log.
- [ ] `.github/workflows/sync-game-release.yml` — exclude metadata from R2, log the id.
- [ ] `src/app/engine/[...path]/route.ts` — policy matrix, allowlist cleanup.
- [ ] tests — new addressing suite, route cache matrix, sync/workflow assertions, suite registration.
- [ ] docs amendment set.

**Acceptance Criteria:**
- Given a published shell, when the document is served, then every shell subresource URL the document or the engine builds carries `?v=<releaseId>`; when a shell response is addressed, then it is `private, immutable, max-age=31536000`; when it is unaddressed, then it is `private, max-age=86400`; when it is the document, then it is `private, no-cache`.
- Given a reload of `/play` with no new release, then the shell document is revalidated at most once and zero shell subresource requests occur.
- Given a newer published shell, then every shell URL changes with the identifier, and re-publishing identical content produces identical URLs (rollback safe).
- Given media (`img/`, `audio/`, `effects/`, `movies/`, `data/`), then its URLs and its `private, max-age=86400` cache are unchanged.
- Given the runtime, when its sources are inspected, then no code path resolves, reads, compares or memoises a release/version, and no release metadata object exists in R2.
- Given the publish pipeline, when a URL-builder expression it must patch is missing, then the run fails loudly and publishes nothing.

## Verification

**Commands:**
- `npm run test:unit` — all suites pass (baseline 518).
- `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- `npm run test:e2e` — the mock-harness path is unchanged (no versioned path, no `/play` change).
- Seeded real-shell proof (opt-in, isolated persist root, never `.wrangler/state`): stage the real shell from a sparse read-only clone of the upstream game repo, publish it locally, and assert with a passive server log + browser listeners that (a) every shell subresource request carries `?v=<releaseId>`, (b) addressed responses carry `private, immutable, max-age=31536000`, (c) the document revalidates once and a second load issues zero shell subresource requests, (d) media stays unversioned.

</frozen-after-approval>

## Amendments & Adjudication (2026-09-22)

Recorded here so no later session has to reconstruct what was decided after the frozen intent was written.

**OD-2 approval and its amended form (OD-2b).** The owner gates in `epic-7-context.md` ("OD-2 blocks 7.2") are satisfied: the owner approved shell cache addressing on 2026-09-22, and in the same exchange redefined it — *"The web should not ask if there is a release or no. The web should not know there is a release. … the scripts to publish should replace the previous version with the pulled one, the web only must show the pulled files."* The frozen intent in this file is the amended form: a content digest baked by the pipeline, no runtime release resolution, no refusal, unaddressed shell files degrading to `private, max-age=86400`. Full record: `briefs/brief-epic-7-2026-09-21/brief.md` §OD-2b (five numbered clauses incl. the metric definition), `epics.md` amendment A-2026-09-22-01 (restated acceptance criteria), `AGENTS.md` durable decision, `ARCHITECTURE-SPINE.md` AD-9 addendum.

**Roundtable record.** Six independent lenses reviewed the design; the accepted and rejected-with-reasons lists (including why existence/current-release acceptance rules, a versioned R2 prefix with a pointer object, a media redirect, and content-rewriting the `main.js` arrays were rejected) are in `handoff-story-7-2.md` §"Adjudicated roundtable record". Do not re-file those without new evidence.

**Residuals.** The four recorded residuals (mid-publish mixed-bytes window, media/`data/` never pinned, pre-existing pipeline hygiene, and the shell route's `head`+`get` pair) are filed in `deferred-work.md` against this spec. The CI-wired seeded harness stays 7.5's, as the Verification section above records.

**Correction to the frozen I/O matrix.** The "Metadata file" row predicts a 404 for `/engine/build-metadata.json`. The route answers **400 `BAD_REQUEST`** with `no-store`: a non-allowlisted top-level segment is rejected by `sanitizeAssetPath` before any R2 access, which is the stronger outcome (the object is not even looked up). `tests/engine-route.test.ts` "never serves the ingest pipeline's release metadata" pins the 400; the dated epics amendment A-2026-09-22-01 records the corrected wording.

## Verification Record (2026-09-22, successor session)

Baseline: `origin/develop` @ `22d4359` (this story's implementation and artifact set, merged through PR #58). Everything below was measured in the story worktree against that tip; no source file changed.

**Suite runs**

| Command | Result |
|---|---|
| `npm run test:unit` | 541 pass, 0 fail (95 suites) |
| `npx tsc --noEmit` | clean |
| `npm run lint` | 0 errors, 4 pre-existing warnings (`tests/admin-layout.test.ts`) |
| `npm run build` (OpenNext, run by the e2e server command) | success |
| `npm run test:e2e` (Chromium, mock harness) | 46 passed |

**Seeded real-shell proof** — opt-in, local miniflare, isolated persist root (`/tmp/release-proof/state`, never the shared `.wrangler/state`), real Chrome 153 driven over raw CDP with the HTTP cache enabled. Passive observation only (`Network.*` events plus the wrangler stdout request log as ground truth); no `page.route`. Playwright-driven Chromium cannot run this measurement: it does not serve these responses from the HTTP cache (control: a static server answering the same `private, immutable, max-age=31536000` re-fetched on the second navigation under Playwright, and cache-served the same request under raw CDP).

1. **Staging.** Sparse read-only clone of `salamin888/Final Orginity` (shell plus `Final Orginity/package.json` and `Final Orginity/data/System.json`, as the ingestion engine validates both) → `npx tsx scripts/sync-game-release.ts` staged 78 shell files, addressed them, and logged `Engine release id: 1a75b419…eb8be (addressing revision 1)`. Addresses per source: `index.html` 4, `js/main.js` 2, `js/rmmz_managers.js` 2; the bridge is registered in `js/plugins.js`.
2. **Seeding.** 78 shell objects under the `engine/` prefix (8,469,507 B) plus `data/`, `img/system/`, `img/titles1/` media (309 objects, 35,682,076 B) written through `env.GAME_ASSETS.put`, and the e2e session fixtures into the isolated D1.
3. **Cold load of `/play`.** 51 shell `200`s: 1 document, 16 boot scripts, 30 plugin scripts (including `Ropoductions_WebBridge.js`), 1 font file. Every `js/`, `css/`, `icon/` and font-file reference carried `?v=<releaseId>` — zero unaddressed pipeline sources; addressed responses carried exactly `private, immutable, max-age=31536000`; the document carried `private, no-cache`; 31 media responses (`data/*.json`, `img/system/*.png`) stayed unaddressed at `private, max-age=86400`.
4. **Reload of `/play`.** 51 non-document shell requests, **50 served from the browser cache** (45 memory-cache, 5 disk-cache), **0 non-document `304`s**, **0 shell URLs re-fetched with a network `200`**. The server access log confirms it independently: one `/engine/index.html 304 Not Modified` per reload, no `/engine/js/**` request at all.
5. **Conditional document.** A direct conditional request against the live route (`If-None-Match` = the object's ETag) answers `304` with `Cache-Control: private, no-cache`.
6. **Excluded by URL**, as the story records: `/engine/cordova.js` (upstream dangling reference; `400`).
7. **Observed residual, already inside the frozen matrix.** `/engine/fonts/Minicode.json` is a plugin-authored literal (`CC_FontTexture`), so the pipeline never addressed it: it is served `private, max-age=86400` — a revalidation, never a broken boot. It is the only shell-namespace request that escapes addressing on the real shell.

Harness state: the seeding driver, the CDP proof driver and the raw report (`authoritative-report.json`) are throwaway and live outside the repository (worktree `tmp/proof/`, `/tmp/release-proof/`). The CI-wired seeded harness remains Story 7.5's.
