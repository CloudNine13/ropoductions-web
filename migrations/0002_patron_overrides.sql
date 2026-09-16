-- Cloudflare D1 Patron Overrides Database Schema
-- Storing administrative and complimentary access overrides bypassing external Patreon API checks.

CREATE TABLE IF NOT EXISTS patron_overrides (
  patron_id TEXT PRIMARY KEY NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'comp')),
  notes TEXT,
  granted_by TEXT NOT NULL,
  created_at_sec INTEGER NOT NULL,
  updated_at_sec INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_patron_overrides_role ON patron_overrides(role);
