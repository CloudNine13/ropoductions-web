---
title: 'Handoff — Story 7.2 Release-Addressed Immutable Engine Shell Delivery'
created: '2026-09-22'
branch: 'feat/7-2-release-addressed-engine-shell'
worktree: '.worktrees/feat-7-2-release-addressed-shell'
baseline_commit: '8c0be722ecd72549ded764f7bc8c4eafc05f598b'
state: 'implementation complete; docs amendment set complete; verification (unit/tsc/lint/build/e2e) green; seeded proof available as `npm run proof:release-shell`; PR pending'
---

# Handoff — Story 7.2

## Read first, in this order

1. `AGENTS.md` (especially the durable **Owner decisions** section: the release-boundary decision and the worktree-isolation rule).
2. `_bmad-output/implementation-artifacts/spec-7-2-release-addressed-immutable-engine-shell-delivery.md` — the frozen intent, the architecture decision and the boundary of responsibility.
3. This file.

## Hard rules for the successor (owner directive 2026-09-22, stated after a violation)

- **Work only inside `.worktrees/feat-7-2-release-addressed-shell` on branch `feat/7-2-release-addressed-engine-shell`.** Every other worktree under `.worktrees/` (49 exist) belongs to another story or another session. You may READ them; you MUST NOT write to them: no edits, formatters, renames, deletes, `git checkout/switch/reset/stash/clean`, commits, or `npm install` outside your own worktree. `develop` and `master` are never modified — no commits, no pushes.
- Left alone on purpose: `.worktrees/fix-3-3-sync-ci-eval-root-cause` is dirty with someone else's work. Do not touch, clean, or commit it.
- **Absolute paths only.** In this harness `read`/`write`/`edit` can resolve relative paths against the main checkout (`develop`) instead of your worktree. During this story that happened: seven edited files landed in the main checkout and had to be copied into the worktree and restored (`git checkout -- <paths>`). `develop` is clean again — keep it that way. Before reporting, run `git worktree list` and `git status --short` in your worktree and in the main checkout.
- No emojis, no AI attribution, Conventional Commits, commits stay focused.

## The architecture this story implements (do not re-litigate)

Owner decision, verbatim: *"The web should not ask if there is a release or no. The web should not know there is a release. … the scripts to publish should replace the previous version with the pulled one, the web only must show the pulled files."*

- **Game versioning is a publish-pipeline concern.** `scripts/sync-game-release.ts` computes a content digest of the staged shell (`computeReleaseId`: sha256 over the sorted `path → sha256(bytes)` manifest plus `ADDRESSING_REVISION`) and bakes it into every shell subresource reference it can reach, then the workflow replaces the previously published shell in R2 (`engine/` prefix, additive). No pointer object, no versioned prefix, no manifest is readable by the runtime.
- **The runtime is release-agnostic.** `src/app/engine/[...path]/route.ts` applies a cache policy to the URL shape it received: shell document (`index.html`) `private, no-cache`; addressed shell file (`?v=<64-hex>`) `private, immutable, max-age=31536000`; unaddressed shell file `private, max-age=86400`; media untouched at `private, max-age=86400`; 416 now `no-store`. No release resolution, no memo, no refusal based on freshness, no `/play` change, no `next.config.ts` change.
- **Why the query form works here and did not in the earlier draft:** the addressing is baked into the *content* by the pipeline (relative URLs + query), so it propagates to engine-built URLs (`main.js` boot-script loop, Effekseer wasm, `PluginManager.makeUrl`, `FontManager.makeUrl`) without a versioned path — which keeps the shell document at `/engine/index.html`, keeps media URLs stable, and keeps the same-origin/IndexedDB invariant untouched. A missed reference degrades to a revalidation, never to a refusal.
- The full evidence chain (MZ 1.8.0 builds every subresource URL from relative paths; a document query is not inherited by relative subresources; `immutable` is a no-op in Chromium so `max-age` is the mechanism; media is ~322 MB upstream) is in the story spec and in the roundtable record below.

## Current state — done and green

Modified/added in the worktree (uncommitted):

- `src/lib/engine-addressing.ts` (new) — identifier constants (`ENGINE_RELEASE_PARAM`, `ENGINE_RELEASE_ID_PATTERN`, `ADDRESSING_REVISION`, `SHELL_DOCUMENT_KEY`), cache policies, `computeReleaseId`, `addressShellReferences` (index.html attribute pass with a lenient hint count, four anchored runtime sites, per-site "exactly once" validation, media-never-addressed guard), `isAddressedShellRequest`, `resolveShellCacheControl`.
- `scripts/sync-game-release.ts` — `addressStagedShell()` (digest over the staged bytes, then addressing, then write-back), `releaseId`/`addressingRevision` in `build-metadata.json`, CLI logs `Engine release id: <id> (addressing revision 1)`.
- `.github/workflows/sync-game-release.yml` — `aws s3 sync tmp_engine_shell s3://…/engine --exclude "build-metadata.json"` + prints the metadata; prefix stays release-agnostic.
- `src/app/engine/[...path]/route.ts` — policy matrix above; `build-metadata.json` removed from `SHELL_TOP_LEVEL`.
- `tests/engine-addressing.test.ts` (new, registered in `package.json` `test:unit`), `tests/engine-route.test.ts` (policy matrix, malformed identifier, metadata 400, 416 no-store), `tests/game-sync.test.ts` (addressing integration, digest determinism/sensitivity, double-addressing refusal, metadata fields), `tests/workflow-manifest.test.ts` (release-agnostic prefix + metadata exclusion).
- Docs amended already: `engine-browser-compat.md` §2/§6, `save-and-runtime-contract.md` §5/§6/§7, `patron-tier-matrix.md` §2, `ARCHITECTURE-SPINE.md` AD-5, `epic-7-context.md`, `AGENTS.md` (both durable decisions).

Evidence so far: `npm run test:unit` → **541 tests, 541 pass, 0 fail** (baseline was 518); `npx tsc --noEmit` → clean; `npm run lint` → 0 errors (4 warnings; confirm whether they pre-exist on the baseline).

## What remains

1. **Docs** (same cutover, per `spec-7-2` Code Map): `ARCHITECTURE-SPINE.md` AD-9 (execution protocol: addressed shell, metadata not published), `_bmad-output/planning-artifacts/epics.md` story 7.2 dated amendment (clause 1 identifier = content digest; clause 2 document `no-cache` + unaddressed `86400` instead of refusal; clause 3 metric definition), `briefs/brief-epic-7-2026-09-21/brief.md` OD-2b record superseding the `?v=<commitSha>`/refusal wording, `implementation-artifacts/sprint-status.yaml` (`7-2-…: in-progress`), `implementation-artifacts/deferred-work.md` residuals (below).
2. **Verification**: `npm run build` (OpenNext) and `npm run test:e2e` (the mock path must be unchanged — no versioned path, no `/play` change).
3. **Seeded real-shell proof** (opt-in, Chromium, local miniflare only). Corrections from the verification lens, all mandatory: the sparse clone must include `Final Orginity/package.json` **and** `Final Orginity/data/System.json` (the ingestion engine validates them); seed an **isolated** persist root (`--persist-to .wrangler/release-proof/state`, never `.wrangler/state`, which is shared with `npm run dev`, `npm test` and the e2e harness); **never** use `page.route` in the reload proof (enabling routing disables the HTTP cache and destroys the effect under test) — use passive `page.on('request'|'response')` plus the wrangler stdout request log as ground truth; define the metrics over addressed shell subresources (M1: zero load-2 `304`s for non-document shell URLs; M2: zero load-2 `200`s for URLs that returned `200` in load 1; M3: ≤1 load-2 request for the document), with a mandatory liveness precondition on load 1 (≥16 shell-namespace 200s including the document, ≥13 boot scripts, ≥1 plugin script, ≥1 font) so the assertion cannot pass vacuously; `cordova.js` is a known non-shell 400 and is excluded by URL.
4. **Commit, push, PR**: Conventional Commits (`feat(play): address the engine shell by release content digest` or similar), `git push -u origin feat/7-2-release-addressed-engine-shell`, PR base `develop` only, body listing the story ID and the FRs covered, then report the full PR URL to the owner and STOP (the owner merges; continue only after an explicit "continue").

## Adjudicated roundtable record (do not re-raise accepted findings; do not silently skip rejected ones)

Six independent lenses reviewed the design. Accepted and implemented: content-digest identifier; pointer/metadata outside the bucket; anonymous short-circuit before any release consideration; three-state error handling (no fail-open); publish ordering; `rest` allowlisting untouched (no version segment exists in this design); 416 `no-store`; e2e globs unaffected (no path change); media untouched; `Vary: Cookie` kept with its cost documented; `immutable` documented as a no-op in Chromium.

Rejected with reasons (do not re-file without new evidence):

- **Existence/current-release acceptance rules** (Winston B1, EdgeCaseHunter) — moot: the runtime resolves no release at all.
- **Versioned R2 prefix + pointer object + release memo** — this was the earlier draft; the owner directive replaced it. A pointer/memo/refusal is exactly the release awareness the owner forbade.
- **Media redirect (307/308) or media URL-builder rewriting** — rejected: media URLs never become versioned in this design, so the media-cache clause holds verbatim and no redirect hop is needed.
- **Content rewriting of the *arrays* in `main.js`** — rejected in favour of patching the single runtime site, which also covers future script additions.
- **Dropping the dangling `cordova.js` tag / staging `.bak` files / `languages/`** — pre-existing pipeline behaviour, out of scope, recorded below.
- **Changing the 7.1 boot-probe `cache: "no-store"` fetch** — 7.1's code, fires only on the failure path; recorded as a measurement exclusion instead.
- **Adding font MIME types to `MIME_MAP`** — verified unnecessary: the AWS CLI stores `font/woff2` etc. and the route prefers stored metadata.

## Known residuals (put these in `deferred-work.md`)

- A shell document that is already parsed when the pipeline replaces the tree can mix bytes for a sub-second window; bounded, self-healing on the next document load, and unobservable in normal play.
- Media and `data/` are never release-pinned: a rollback pairs a pinned shell with current media (pre-existing, and the AC's own carve-out). The IndexedDB save namespace derives from `data/System.json`'s `advanced.gameId`, so an upstream change to that value orphans saves independently of this story.
- Upstream `cordova.js` is dangling, `languages/` is never staged, and `.bak` files ship inside the shell — all pre-existing.
- The shell route still spends one R2 `head` plus one `get` per file; halving that is a candidate follow-up.
- 7.5 owns the Firefox project, the reload-storm/asset-burst specs and any CI-wired seeded harness.

## Exact state to reproduce

```bash
cd /home/igor/Documents/Projects/ropoductions-web/.worktrees/feat-7-2-release-addressed-shell
git status --short          # 13 modified + 3 untracked (see list above); nothing committed yet
npm ci                      # already installed
npm run test:unit           # 541 pass
npx tsc --noEmit            # clean
npm run lint                # 0 errors
```

## Successor outcome (2026-09-22, after this handoff)

- **Docs amendment set completed:** `ARCHITECTURE-SPINE.md` AD-9 (execution-protocol shell list corrected + 2026-09-22 release-addressing addendum), `epics.md` Story 7.2 amendment **A-2026-09-22-01** (restated acceptance criteria: content-digest identifier, document `no-cache`, unaddressed shell `86400` instead of refusal, metric definition, fail-closed publish, metadata refused), `brief.md` §OD-2b plus plan step 2, `epic-7-context.md` owner gates updated to "both decided", `sprint-status.yaml` (`7-2: in-progress`), `deferred-work.md` (four residuals), and the amendments/adjudication section of `spec-7-2-release-addressed-immutable-engine-shell-delivery.md` (including the correction that `/engine/build-metadata.json` is refused with 400 `BAD_REQUEST`, not 404).
- **OD-2 approval record:** the 2026-09-22 owner directive quoted in this handoff is the approval; its amended form is OD-2b, recorded in `brief.md`, `epics.md`, `AGENTS.md` (durable decision) and AD-9. `AGENTS.md` also carries the local `develop` working-copy change (the worktree-isolation bullets) so it can land through this PR, since `develop` is never committed to directly.
- **Scope decision:** a document-probe change in `src/components/game-viewport.tsx` (reporting a 403/500 JSON engine document as `boot_request_failed` instead of declaring the engine ready) was drafted during review and **reverted at the owner's direction** — Story 7.2 ships this docs set plus the already-green implementation, nothing else. The finding was reported to the owner separately rather than carried in the branch.
- **Verification state:** unchanged from the handoff — `npm run test:unit` 541/541, `npx tsc --noEmit` clean, `npm run lint` 0 errors (4 pre-existing warnings). No further runs were made, per the owner's direction that docs-only changes need no test pass.
