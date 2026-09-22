# Handoff — Story 7.1: Engine Boot Failure Classification & Localized Recovery Surface

Date: 2026-09-21
Source session: Epic 7 kickoff (interrupted, then resumed for planning only)
Status: **planning complete, no production code written yet**

## 1. Working locations

| What | Where |
| --- | --- |
| Main checkout | `/home/igor/Documents/Projects/ropoductions-web` (branch `develop`) |
| Story worktree | `.worktrees/feat-7-1-engine-boot-failure-classification` |
| Story branch | `feat/7-1-engine-boot-failure-classification` |
| Branch tip | `15b305d249418aac67b401e67703ed3a4f5aeeaa` — identical to `origin/develop` tip (zero unique commits) |
| Spec | `_bmad-output/implementation-artifacts/spec-7-1-engine-boot-failure-classification-localized-recovery-surface.md` |

Uncommitted files in the worktree (all planning artifacts, no source changes):

- `_bmad-output/implementation-artifacts/spec-7-1-...-recovery-surface.md` (new, `status: in-progress`, `baseline_commit: 15b305d…`)
- `_bmad-output/implementation-artifacts/epic-7-context.md` (new; compiled epic context, produced earlier by `compile-epic-context`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (edited: `epic-7` and `7-1-…` → `in-progress`, `last_updated: 09-21-2026 18:34`)

There are **no other changes** in the worktree. Verify with `git -C .worktrees/feat-7-1-engine-boot-failure-classification status --short`.

## 2. Already merged upstream (do not redo)

`origin/develop` contains commit `15b305d` ("docs(play): plan epic 7 cross-browser engine delivery and boot reliability"):

- `_bmad-output/planning-artifacts/briefs/brief-epic-7-2026-09-21/brief.md` — owner defect reports D1–D4, measurement evidence table, plan, OD-1/OD-2 open decisions, success criteria.
- `_bmad-output/specs/spec-ropoductions-web/engine-browser-compat.md` — the §1 failure taxonomy (classification contract), §2 delivery/caching, §3 boot-path resilience, §5 browser matrix, §6 verification contract.
- `_bmad-output/specs/spec-ropoductions-web/SPEC.md` — CAP-13 (this story), CAP-14 (7.2/7.3), plus the brief in `sources:`.
- `_bmad-output/planning-artifacts/epics.md` — Epic 7 with stories 7.1–7.5 (7.1 at lines ~553–574) and the epic preamble + sequencing.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — epic 7 tracker keys.
- `_bmad-output/implementation-artifacts/epic-7-context.md` — epic context (untracked in the worktree, needs committing with the story).

Note: `docs/7-0-epic-7-engine-browser-compat` and its PR are done/merged; the remote branch is deleted.

## 3. What remains

1. Implement Story 7.1 from the spec (it is the sole source of truth; its `context:` frontmatter lists the two files to load first).
2. BMAD build step 3: diff audit, task/AC tick-off, I/O-matrix test audit (every matrix row needs a covering test that actually ran).
3. BMAD build step 4: review (`bmad-code-review` / reviewer agent), then step 5 present.
4. Repository git workflow: commit with Conventional Commits (`feat(play): …`), `git status` + `git diff` review, push, open PR to `develop` **only**, and hand the user the full PR link. Only the user merges; ask explicit confirmation before any further branch work. Update `sprint-status.yaml` to `review` when implementation is complete.

## 4. Investigation already done (reuse; do not repeat)

### Classification contract
`engine-browser-compat.md` §1 maps every player-visible boot failure to exactly one of: `webgl_unavailable`, `browser_capability`, `boot_request_failed`, `asset_load_failed`, `renderer_init_failed` (rendered with `webgl_unavailable` copy). Raw MZ strings come from `js/rmmz_managers.js:1893-1903` (`SceneManager.checkBrowser`), `js/rmmz_core.js:294` (`Utils.canUseWebGL`), `js/main.js:91,114-117,155` (`Main.onWindowLoad` `testXhr` on `js/main.js`), `js/rmmz_managers.js:2042` (`Graphics.printError` load failures), and the upstream `js/plugins/MIF_MZ_PreventPictureCrash.js` alert.

### Engine shell / plugin pipeline
- Injection: `scripts/sync-game-release.ts:165-215` `injectWebBridge()` — `fs.copyFileSync` of `src/engine-plugins/Ropoductions_WebBridge.js` into shell `js/plugins/` plus an idempotent `$plugins` entry (`:183`) appended before the last `]` (`:185`), syntax-gated with `new Function` (`:208`). Workflow `.github/workflows/sync-game-release.yml` syncs the staged shell additively to R2 `engine/` prefix; no Git writes.
- Byte-identity assertion that must stay green: `tests/engine-bridge.test.ts:305-325` ("single-source verification…") comparing `src/lib/engine-mock.generated.ts` against `src/engine-plugins/Ropoductions_WebBridge.js` and `src/engine-plugins/mock-shell.html`. Regenerate with `npm run generate:mock` (also runs on `prebuild`); generator `scripts/generate-engine-mock.ts:8-12`.
- Mock harness `src/engine-plugins/mock-shell.html` (230 lines): inline canvas IIFE, then `StorageManager`/`DataManager` shims (`:175-227`), then the bridge plugin (`:228`). It emulates **no** MZ runtime — no `SceneManager`, no `Utils.canUseWebGL`, no `#errorPrinter`. Mock paths are only `index.html` and `js/plugins/Ropoductions_WebBridge.js` (`src/app/engine/[...path]/route.ts`, `MOCK_ENGINE_PATHS`).
- Bridge plugin `src/engine-plugins/Ropoductions_WebBridge.js` (309 lines): save protocol only — `isPlainObject` `:39`, `normalizeSlotKey` `:48`, `handleGetSaves` `:60`, `handleSetSaves` `:123`, `handleResetSaves` `:222`, `onMessage` `:254` (origin check `:255`, parent-source check `:259`), activity poster `:290`. No boot hooks exist today.
- Stale-mirror deferred item: `_bmad-output/implementation-artifacts/deferred-work.md:53-54` (the `public/engine/**` byte-identical mirror does not exist on `develop`; delivery is R2-served). Reopen trigger is "next engine-plugin touch" — this story is that touch, so resolve it (the current rule text in `AGENTS.md` is already R2-based; close the entry with evidence).

### Host conventions
- `src/lib/save-bridge.ts:10-18` message-type constants, `:88-177` `sendBridgeMessage` with sender/origin/plain-object/requestId checks; `src/components/save-hud-dock.tsx:169-199` listener pattern (origin + type check) and `SaveHudDockLabels` optional-props fallback (`:10-20`, `:62-73`); `src/types/save.ts:26-71` constants + discriminated unions.
- `src/components/game-viewport.tsx`: iframe at `:246` with `data-testid="game-engine-iframe"`, `sandbox`, `allow`; loading overlay `z-10`; current `handleRetryLoad` `:141-145` bumps `engineKey` which **remounts** the iframe — 7.1 replaces this with an in-place reload; `window.postMessage({type: HUD_ACTIVITY_MESSAGE_TYPE}, origin)` at `:126`.
- i18n: `game` namespace in `src/locales/{en,es,ja,pl,ru,zh}.json`; six-locale leaf-key parity enforced by `tests/i18n-locales.test.ts:57-86`. Existing engine keys: `engineLoading`, `engineLoadError`, `engineRetry`.
- Unit tests: native `node --test` with `--experimental-strip-types`; the `test:unit` script in `package.json` lists every suite and `tests/suite-manifest.test.ts:11-17` fails if a new `tests/*.test.ts` is not added. No vitest.
- E2E: Playwright, Chromium and Firefox projects (`playwright.config.ts`), `webServer` builds and serves the OpenNext worker on `127.0.0.1:3100`; session fixtures in `e2e/helpers/session.ts`; `/play` harness `e2e/save-hud.spec.ts`. Firefox project is Story 7.5's job.
- Design spine (from `DESIGN.md`/`EXPERIENCE.md`): compact panel = `rounded-xl` (`rounded-lg` banned), `card` surface, `z-50` overlays, focus ring `ring-2 ring-primary ring-offset-2 ring-offset-background`, `transition-colors duration-150` only (`transition-all` banned), `motion-reduce:transition-none`, Lucide icons only, 44x44px targets, WCAG AA, mono `tabular-nums` reserved for system metadata (the diagnostics block), `role="alert"` on the message text, dignified non-jargon copy (raw identifiers stay inside diagnostics).

## 5. Decisions already taken (in the spec — keep them)

1. **Retry never remounts.** Delete the `key={engineKey}` remount; retry reloads the existing frame in place (`iframeRef.current.contentWindow.location.reload()`), and sets `src` at most once for a frame that never loaded. One in-flight load guarded by a ref. (Contract `engine-browser-compat.md` §2 "retry … never remount the iframe" vs the AC "one additional engine load per activation" is resolved this way; if the owner wants the §2 wording amended, raise it, do not silently change it.)
2. **Host retry of `boot_request_failed` = one probe fetch** of the engine boot script, then the panel shows the URL and the probe outcome. It is not a document reload.
3. **Unknown raw strings** classify to `boot_request_failed` with the raw text carried in diagnostics — the taxonomy must cover every player-visible failure.
4. **Old shells must not false-alarm.** Readiness reports are used only to cancel the watchdog; the watchdog itself must not conclude a failure from silence. On timeout the host inspects the engine document (`contentDocument`, same origin) for MZ's `#errorPrinter` text and classifies it, or resolves the boot script from the document's own `script[src]` list and probes it: network error → `boot_request_failed`, status ≥400 → `asset_load_failed`, 2xx → no panel. Mock harness has no MZ script, so it never probes.
5. **Preflight before mount.** The parent runs the WebGL probe (canvas + `webglcontextcreationerror` listener, `WEBGL_lose_context` release, renderer/vendor via `WEBGL_debug_renderer_info`) and does not request the engine document when it refuses.
6. **One channel.** New report types ride the existing `ROPODUCTIONS_` postMessage channel with the save bridge's origin/source checks on both sides.
7. **Plugin side duplicates the taxonomy** in plain JS (same precedent as `getByteLength`, `Ropoductions_WebBridge.js:24-33` vs `src/lib/save-import.ts:69-71`): wraps `Utils.canUseWebGL` (probe before MZ's check), `SceneManager.checkBrowser`, `Graphics.printError` (classify + hide `#errorPrinter`), adds a capture-phase resource `error` listener, posts readiness when MZ's capability gate passes (or on document load when no MZ runtime is present). **Reporting is scoped to the boot window:** the plugin stops reporting boot failures once readiness is posted, and the host ignores failure reports received after ready, so a mid-game uncaught error hitting MZ's catch-all `Graphics.printError` never reports `boot_request_failed` and never replaces the running game with the boot panel.

## 6. Hazards

- **Branch upstream was misconfigured** to `origin/develop`; it has been unset. Never run a bare `git push` from that worktree — use the explicit refspec `git push -u origin feat/7-1-engine-boot-failure-classification`.
- **Main checkout has uncommitted `AGENTS.md` edits by the user** (plus untracked `public/branding/imagen*.png`, `logo-ropo-animado.gif`). A fast-forward of local `develop` to `origin/develop` is currently blocked by that file (`git merge --ff-only origin/develop` aborts). Leave the user's working tree alone; the story worktree is already at the `origin/develop` tip, so it does not need the pull.
- **Local `develop` is behind** `origin/develop` by the epic-7 planning commit; the worktree is current, so this is informational.
- Do not touch sibling worktrees under `.worktrees/`.
- After editing the plugin, regenerate `src/lib/engine-mock.generated.ts` and keep `tests/engine-bridge.test.ts:305-325` green, or the single-source contract breaks.
- Register every new `tests/*.test.ts` in the `test:unit` script (`tests/suite-manifest.test.ts` enforces it).
- Repo rules that bind this story: no story/ticket references in code comments, no emojis, Conventional Commits with an allowed scope (`play`), PR to `develop` only, no silent cutover (superseded assertions deleted, not re-pinned).

## 7. Recoverable research artifacts

The interrupted planning session's scout outputs are still on disk and were used for the spec:

`/home/igor/.omp/agent/sessions/-Documents-Projects-ropoductions-web/2026-09-21T14-52-46-648Z_01a0c474-88b8-766e-9828-62f835c8d699/`

- `DesignContractScout.md` / `.json` — design contract extraction (DESIGN/EXPERIENCE clauses, ACs verbatim, taxonomy, conflicts & tensions).
- `RepoHarnessScout.jsonl`, `UpstreamEngineScout.jsonl`, `CompileEpic7Context.jsonl` — harness and upstream engine findings.

## 8. Verification commands (run from the worktree)

```
npm run test:unit     # every suite, including tests/suite-manifest.test.ts
npm run lint          # eslint
npm run build         # OpenNext; prebuild regenerates the engine mock
npm run test:e2e      # Chromium e2e against the mock harness, must show no recovery surface
```
