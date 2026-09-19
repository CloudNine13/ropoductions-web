# Sprint Change Proposal — 2026-09-19 — Epic 5 Hardening & Scope Paper Trails

Classification: **Moderate** (backlog reorganization; no epic reopened, no rollback, MVP unchanged)
Trigger: Epic 5 retrospective (`_bmad-output/implementation-artifacts/epic-5-retro-2026-09-19.md`) — findings F2, F3, F6, F9 with merge evidence, unanimously dispositioned by the review party.
Mode: batch (single owner approval gate).

## 1. Issue Summary

Epic 5 merged complete against its declared ACs, but the retrospective surfaced:

- **Asymmetric self-service between mutation paths (F2), corrected by owner 2026-09-19:** the party found the upsert lets the last added admin self-demote (`src/lib/db.ts:198-203`) while the DELETE path blocks self-revocation, and rated it a P0 lockout. The owner's threat model: only FOUNDER access is protected, and founders bootstrap from `CREATOR_ADMIN_PATREON_IDS` independent of DB rows — so the resolution inverts: relax the shipped block (last added admin may self-revoke), pin founder-preservation with a regression test, amend the 5.3 AC with a dated note.
- **A destroyed audit trail by enshrined contract (F3):** every row update rewrites `granted_by` to the editing admin (`db.ts:203`), asserted as intended behavior at `tests/admin-overrides.test.ts:379`.
- **A silently dropped promise (F9):** the epic title carries "audit logs"; no story ever held them and no cut was recorded — second consecutive epic where an unamended promise vanished without paper (epic-2 item-5 still open).

## 2. Impact Analysis

- **Epic Impact:** Epic 5 closes as `accepted-with-open-items`. Remediation does not reopen it (delivered stories met their ACs; reopening is theater). The fix work and the promised audit capability enter as new stories under the Epic 5 umbrella.
- **Story Impact:** add `5.4 Override Integrity Hardening` and `5.5 Grant/Revoke Audit Trail` (drafts in section 4). No existing story files change; spec-5-1's "middleware AND layout" wording is reconciled inside retro item 4.
- **Artifact Conflicts:**
  - PRD (`prds/prd-ropoductions-web-2026-09-15/prd.md`): add FR-20/FR-21 with as-built wording — epics.md:122 already cites them; today they are dangling references.
  - epics.md: dated amendment note recording (a) the FR additions, (b) the 4-eyes formal v1 non-goal with reopen trigger, (c) the audit-log delivery as 5.5, (d) the 5.3 sole-admin clause reinterpreted as founder-preservation (owner decision 2026-09-19).
  - ARCHITECTURE-SPINE: AD-8 gets one paragraph — single sealing source + "every privilege-changing write passes the same row-write-boundary guard" as the convention. The still-open epic-2 cookie-pattern documentation rides along or stays open honestly.
  - DESIGN/EXPERIENCE: revoking/demoting your own row while only sealed founders remain becomes an explicit, informed step — informational warning copy on the own-row control, not a block (owner model: founders are the permanent door).
- **Technical Impact:** changes concentrate in `src/lib/db.ts`, `(admin)/admin/overrides/actions.ts`, `src/lib/admin.ts`, three test files, `e2e/`, `src/locales/*` (safety keys only), and one CI workflow (status-lag check). No schema change for 5.4; 5.5 adds one append-only table (migration `0003`).

## 3. Recommended Approach

**Option 1 — Direct Adjustment** (new stories within the existing epic structure; action items carry the process lessons).

- Effort: 5.4 Low-Medium (guard is one statement, reuses the proven DELETE pattern); 5.5 Medium (table + action writes + minimal read view).
- Risk: 5.4 Low (additive guards, red tests first); 5.5 Low-Medium (new write paths in actions).
- Rejected alternatives: rollback (nothing to revert — the fix is additive); MVP reduction (v1 scope unaffected; 4-eyes was never v1).
- **Sequencing constraint (party-unanimous, owner-adjusted): 5.4 lands before any new epic work** — it carries the grantor-attribution fixes plus the founder-preservation regression the owner's model makes load-bearing. No implementation happens in this retro/proposal PR; execution is handed off (see Implementation Handoff + `handoff-story-5-4.md`).

## 4. Detailed Change Proposals

### Story 5.4: Override Integrity Hardening (ready-for-dev)

> As a studio owner and as added admins, privilege changes are attributable, caller-fresh, and the founders' access is provably permanent — while added admins retain full self-service by design.

ACs:
- Founder-preservation as the single protected invariant (owner decision 2026-09-19): regression coverage proving a founder session reaches `/admin` with zero override rows and zero other admins (env bootstrap path); `deletePatronOverrideGuarded`'s sole-admin block relaxes so the last added admin may self-revoke; dated amendment records founder-preservation (not mutable-pool preservation) in epics.md 5.3; NO sole-admin guard added to `upsertPatronOverride`.
- Updates to an existing row preserve the original `granted_by` (set on INSERT only); `admin-overrides.test.ts:379` assertion flipped to preserved-grantor (red first); historical clobbered values documented as unrecoverable.
- Upsert re-verifies the caller's admin override at mutation time, symmetric with revoke (raise upsert; never lower revoke).
- Leading-zero patron IDs rejected (`/^[1-9]\d{0,19}$/` shared server+client); notes truncated code-point-safely.
- Dead `/admin` proxy branch removed (or matcher extended); matcher pinned by test; dead `deletePatronOverride`, dead token exports, duplicated `createMockD1`, and `play/page.tsx` inline quote-strip (epic-2 item-4 remainder) removed; sealing collapses to one stored source.
- Full admin panel UI (form, table, badges, dialogs, warnings) localized across all six locales — owner decision 2026-09-19, superseding the room's safety-copy-only line.
- Regression gates: `/admin` e2e (404 no-leak + seeded render) and wrapper-execution tests per retro item 6.

### Story 5.5: Grant/Revoke Audit Trail (backlog; closes the F9 contract break)

> As a studio owner, I can see who granted, changed, or revoked which pass and when, so that admin-tier self-amplification (one session minting unlimited admins) is at least observable, and any future 4-eyes control has a substrate.

ACs: append-only `override_audit` table (migration `0003`); every upsert/update/revoke writes actor, target, before/after role, timestamp; readable list on `/admin/overrides`; sealed-bootstrap events included. 4-eyes approval explicitly out of scope, recorded as v1 non-goal with reopen trigger in deferred-work.md.

### Artifact edits (text-level)

- PRD: append FR-20 (two-tier override management) and FR-21 (self-lockout safeguards) mirroring `epics.md:389-423` as-built, with a dated note they were back-filled from the epic retro.
- epics.md: story sections 5.4/5.5; amendment block dated 2026-09-19 citing the retro doc as evidence.
- deferred-work.md: entries for 4-eyes (trigger: more than a handful of operators holding keys), dialog-shell extraction (third duplication), 100-row pagination (trigger: first page overflow).
- sprint-status.yaml: 5-2/5-3/epic-5 reconciliation to `done` (this retro), retro key → `done`, 12 action items appended, 5-4 (`ready-for-dev`) + 5-5 (`backlog`) story keys, priorities re-ranked: P0 5.4, P1 5.5 + epic-2-item-5, P2/P3 hygiene per retro table.

## 5. Implementation Handoff

- **Product Manager:** PRD FR additions + epics.md amendment block (retro items 9-10).
- **Developer:** Story 5.4 via the normal build loop when greenlit (retro items 1-8, 11); CI status-lag check as a separate chore PR (item 12).
- **Architect:** AD-8 convention paragraph; sealing-source design review on the 5.4 cutover.
- **Owner (Igor):** decisions recorded 2026-09-19 — verdict override `accepted-with-open-items`; proposal approved; full admin localization; F2 resolved as founder-preservation (not mutable-pool guarding). Explicit instruction: this PR plans only; all code fixes execute in a separate session via the handoff.

Success criteria: Epic 5 tracking matches merge reality at develop tip; founder access to `/admin` proven by regression test under worst-case row states; grantor attribution stable going forward; every dropped or deferred scope has a dated record with a reopen trigger.
