-- Cloudflare D1 Sessions Database Schema
-- Storing AES-256-GCM encrypted OAuth tokens; plaintext token persistence is strictly forbidden.

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  patron_id TEXT NOT NULL,
  email TEXT,
  role TEXT DEFAULT 'patron' NOT NULL CHECK(role IN ('admin', 'comp', 'patron')),
  tier_id TEXT NOT NULL,
  tier_name TEXT NOT NULL,
  pledge_cents INTEGER NOT NULL,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  token_expires_at_sec INTEGER NOT NULL,
  expires_at_sec INTEGER NOT NULL,
  revoked INTEGER DEFAULT 0 NOT NULL,
  created_at_sec INTEGER NOT NULL,
  last_verified_at_sec INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_patron_id ON sessions(patron_id);
CREATE INDEX IF NOT EXISTS idx_sessions_role ON sessions(role);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at_sec ON sessions(expires_at_sec);
CREATE INDEX IF NOT EXISTS idx_sessions_revoked ON sessions(revoked);
