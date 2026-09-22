-- Append-only audit trail for patron override mutations.
-- Every row is written in the same D1 transaction as the mutation it records, so a
-- grant, change, or revocation can never exist without its trail entry, and the trail
-- can never be edited or deleted (enforced by the triggers below).

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

CREATE TRIGGER IF NOT EXISTS trg_override_audit_no_update
BEFORE UPDATE ON override_audit
BEGIN
  SELECT RAISE(ABORT, 'override_audit is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_override_audit_no_delete
BEFORE DELETE ON override_audit
BEGIN
  SELECT RAISE(ABORT, 'override_audit is append-only');
END;
