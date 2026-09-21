import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { PatronOverrideRecord, SessionRecord } from "../src/types/database";
import { resolveAdminAccess, type CookieReader } from "../src/lib/admin";
import { signValue } from "../src/lib/crypto";
import { hasServerModalState } from "../src/lib/paywall";
import { AGE_VERIFIED_COOKIE_NAME, SESSION_COOKIE_NAME } from "../src/lib/cookies";
import { createMockD1, type MockD1Database } from "./helpers/mock-d1";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (rel: string): string => readFileSync(join(rootDir, rel), "utf8");

const TEST_SECRET = "0123456789abcdef0123456789abcdef";


function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: "session-uuid-1",
    patron_id: "patron-100",
    email: "patron@ropoductions.test",
    role: "patron",
    tier_id: "tier-ork",
    tier_name: "Ork Patron",
    pledge_cents: 500,
    encrypted_access_token: "enc-access",
    encrypted_refresh_token: "enc-refresh",
    token_expires_at_sec: now + 3600,
    expires_at_sec: now + 86400 * 30,
    revoked: 0,
    created_at_sec: now,
    last_verified_at_sec: now,
    ...overrides,
  };
}

interface Harness {
  db: MockD1Database;
  d1QueryCount: () => number;
  restore: () => void;
}

function createHarness(): Harness {
  const mock = createMockD1();
  let queries = 0;
  const originalPrepare = mock.db.prepare.bind(mock.db);
  mock.db.prepare = ((sql: string) => {
    queries += 1;
    return originalPrepare(sql);
  }) as MockD1Database["prepare"];

  const previousDb = globalThis.__D1_TEST_DB__;
  const previousSecret = process.env.SESSION_SECRET;
  const previousCreators = process.env.CREATOR_ADMIN_PATREON_IDS;
  const previousInitialAdmins = process.env.INITIAL_ADMIN_PATREON_IDS;

  globalThis.__D1_TEST_DB__ = mock.db;
  process.env.SESSION_SECRET = TEST_SECRET;
  delete process.env.CREATOR_ADMIN_PATREON_IDS;
  delete process.env.INITIAL_ADMIN_PATREON_IDS;

  return {
    db: mock.db,
    d1QueryCount: () => queries,
    restore: () => {
      globalThis.__D1_TEST_DB__ = previousDb;
      if (previousSecret === undefined) {
        delete process.env.SESSION_SECRET;
      } else {
        process.env.SESSION_SECRET = previousSecret;
      }
      if (previousCreators === undefined) {
        delete process.env.CREATOR_ADMIN_PATREON_IDS;
      } else {
        process.env.CREATOR_ADMIN_PATREON_IDS = previousCreators;
      }
      if (previousInitialAdmins === undefined) {
        delete process.env.INITIAL_ADMIN_PATREON_IDS;
      } else {
        process.env.INITIAL_ADMIN_PATREON_IDS = previousInitialAdmins;
      }
    },
  };
}

function cookieReader(entries: Partial<Record<string, string>>): CookieReader {
  return {
    get: (name: string) => {
      const value = entries[name];
      return value === undefined ? undefined : { value };
    },
  };
}

async function seedSession(
  db: MockD1Database,
  session: SessionRecord,
  secret: string = TEST_SECRET
): Promise<string> {
  db._sessions.set(session.id, session);
  return await signValue(session.id, secret);
}

describe("admin access resolver (resolveAdminAccess)", () => {
  it("returns null with zero D1 queries when the session cookie is absent", async () => {
    const harness = createHarness();
    try {
      const access = await resolveAdminAccess(
        cookieReader({ [AGE_VERIFIED_COOKIE_NAME]: "true" })
      );

      assert.equal(access, null);
      assert.equal(harness.d1QueryCount(), 0);
    } finally {
      harness.restore();
    }
  });

  it("returns null with zero D1 queries when the age cookie is not verified", async () => {
    const harness = createHarness();
    try {
      const session = makeSession({ id: "session-no-age", role: "admin" });
      harness.db._sessions.set(session.id, session);
      const cookie = await signValue(session.id, TEST_SECRET);

      for (const entries of [
        { [SESSION_COOKIE_NAME]: cookie },
        { [SESSION_COOKIE_NAME]: cookie, [AGE_VERIFIED_COOKIE_NAME]: "false" },
      ]) {
        assert.equal(await resolveAdminAccess(cookieReader(entries)), null);
      }
      assert.equal(harness.d1QueryCount(), 0);
    } finally {
      harness.restore();
    }
  });

  it("returns admin for a session holding an admin override row", async () => {
    const harness = createHarness();
    try {
      const now = Math.floor(Date.now() / 1000);
      const session = makeSession({
        id: "session-panel-admin",
        patron_id: "admin-panel",
        role: "admin",
        tier_id: "override_admin",
        tier_name: "Studio Admin",
        pledge_cents: 0,
      });
      harness.db._sessions.set(session.id, session);
      harness.db._overrides.set("admin-panel", {
        patron_id: "admin-panel",
        role: "admin",
        notes: "Panel admin",
        granted_by: "founder-grantor",
        created_at_sec: now,
        updated_at_sec: now,
      });
      const cookie = await signValue(session.id, TEST_SECRET);

      const access = await resolveAdminAccess(
        cookieReader({ [SESSION_COOKIE_NAME]: cookie, [AGE_VERIFIED_COOKIE_NAME]: "true" })
      );

      assert.equal(access, "admin");
    } finally {
      harness.restore();
    }
  });

  it("returns comp for a session holding a comp override row", async () => {
    const harness = createHarness();
    try {
      const now = Math.floor(Date.now() / 1000);
      const session = makeSession({
        id: "session-comp",
        patron_id: "comp-holder",
        role: "comp",
        tier_id: "override_comp",
        tier_name: "Complimentary Pass",
        pledge_cents: 0,
      });
      harness.db._sessions.set(session.id, session);
      harness.db._overrides.set("comp-holder", {
        patron_id: "comp-holder",
        role: "comp",
        notes: "Playtester",
        granted_by: "founder-grantor",
        created_at_sec: now,
        updated_at_sec: now,
      });
      const cookie = await signValue(session.id, TEST_SECRET);

      const access = await resolveAdminAccess(
        cookieReader({ [SESSION_COOKIE_NAME]: cookie, [AGE_VERIFIED_COOKIE_NAME]: "true" })
      );

      assert.equal(access, "comp");
    } finally {
      harness.restore();
    }
  });

  it("returns null when no override row exists and bootstrap is ineligible", async () => {
    const harness = createHarness();
    try {
      process.env.CREATOR_ADMIN_PATREON_IDS = "11111,22222";
      const session = makeSession({ id: "session-plain-patron", patron_id: "33333" });
      const cookie = await seedSession(harness.db, session);

      const access = await resolveAdminAccess(
        cookieReader({ [SESSION_COOKIE_NAME]: cookie, [AGE_VERIFIED_COOKIE_NAME]: "true" })
      );

      assert.equal(access, null);
    } finally {
      harness.restore();
    }
  });

  it("returns admin for a pledging patron whose stored session role is patron", async () => {
    const harness = createHarness();
    try {
      const now = Math.floor(Date.now() / 1000);
      const session = makeSession({
        id: "session-pledging-admin",
        patron_id: "admin-who-pledges",
        role: "patron",
        pledge_cents: 500,
      });
      harness.db._overrides.set("admin-who-pledges", {
        patron_id: "admin-who-pledges",
        role: "admin",
        notes: "Owner",
        granted_by: "system_bootstrap",
        created_at_sec: now,
        updated_at_sec: now,
      });
      const cookie = await seedSession(harness.db, session);

      const access = await resolveAdminAccess(
        cookieReader({ [SESSION_COOKIE_NAME]: cookie, [AGE_VERIFIED_COOKIE_NAME]: "true" })
      );

      assert.equal(access, "admin");
    } finally {
      harness.restore();
    }
  });

  it("returns admin for a pledging founder with zero override rows via env bootstrap", async () => {
    const harness = createHarness();
    try {
      process.env.CREATOR_ADMIN_PATREON_IDS = "99999,88888";
      const session = makeSession({
        id: "session-pledging-founder",
        patron_id: "99999",
        role: "patron",
        pledge_cents: 500,
      });
      const cookie = await seedSession(harness.db, session);
      assert.equal(harness.db._overrides.size, 0);

      const access = await resolveAdminAccess(
        cookieReader({ [SESSION_COOKIE_NAME]: cookie, [AGE_VERIFIED_COOKIE_NAME]: "true" })
      );

      assert.equal(access, "admin");
    } finally {
      harness.restore();
    }
  });

  it("returns null and never throws when the override lookup fails", async () => {
    const harness = createHarness();
    try {
      const session = makeSession({ id: "session-d1-broken", patron_id: "broken-db" });
      const cookie = await seedSession(harness.db, session);
      const failingDb = {
        prepare(sql: string) {
          if (sql.includes("FROM patron_overrides")) {
            throw new Error("D1 unavailable");
          }
          return harness.db.prepare(sql);
        },
      } as unknown as D1Database;
      globalThis.__D1_TEST_DB__ = failingDb;

      const access = await resolveAdminAccess(
        cookieReader({ [SESSION_COOKIE_NAME]: cookie, [AGE_VERIFIED_COOKIE_NAME]: "true" })
      );

      assert.equal(access, null);
    } finally {
      harness.restore();
    }
  });

  it("returns null and never throws when the session lookup fails", async () => {
    const harness = createHarness();
    try {
      const session = makeSession({ id: "session-broken-sessions-read" });
      const cookie = await seedSession(harness.db, session);
      const failingDb = {
        prepare(sql: string) {
          if (sql.includes("FROM sessions")) {
            throw new Error("D1 read failed");
          }
          return harness.db.prepare(sql);
        },
      } as unknown as D1Database;
      globalThis.__D1_TEST_DB__ = failingDb;

      const access = await resolveAdminAccess(
        cookieReader({ [SESSION_COOKIE_NAME]: cookie, [AGE_VERIFIED_COOKIE_NAME]: "true" })
      );

      assert.equal(access, null);
    } finally {
      harness.restore();
    }
  });

  it("returns null and never throws when the database binding is unavailable", async () => {
    const harness = createHarness();
    try {
      const cookie = await signValue("session-no-binding", TEST_SECRET);
      globalThis.__D1_TEST_DB__ = undefined;

      const access = await resolveAdminAccess(
        cookieReader({ [SESSION_COOKIE_NAME]: cookie, [AGE_VERIFIED_COOKIE_NAME]: "true" })
      );

      assert.equal(access, null);
    } finally {
      harness.restore();
    }
  });

  it("returns null for an override role outside the admin/comp contract", async () => {
    const harness = createHarness();
    try {
      const now = Math.floor(Date.now() / 1000);
      const session = makeSession({ id: "session-odd-role", patron_id: "odd-role-patron" });
      const cookie = await seedSession(harness.db, session);
      harness.db._overrides.set("odd-role-patron", {
        patron_id: "odd-role-patron",
        role: "moderator" as PatronOverrideRecord["role"],
        notes: null,
        granted_by: "e2e-seed",
        created_at_sec: now,
        updated_at_sec: now,
      });

      const access = await resolveAdminAccess(
        cookieReader({ [SESSION_COOKIE_NAME]: cookie, [AGE_VERIFIED_COOKIE_NAME]: "true" })
      );

      assert.equal(access, null);
    } finally {
      harness.restore();
    }
  });

  it("returns null for a revoked or unknown session", async () => {
    const harness = createHarness();
    try {
      const revoked = makeSession({ id: "session-revoked", revoked: 1 });
      const revokedCookie = await seedSession(harness.db, revoked);
      assert.equal(
        await resolveAdminAccess(
          cookieReader({
            [SESSION_COOKIE_NAME]: revokedCookie,
            [AGE_VERIFIED_COOKIE_NAME]: "true",
          })
        ),
        null
      );

      const unknownCookie = await signValue("session-does-not-exist", TEST_SECRET);
      assert.equal(
        await resolveAdminAccess(
          cookieReader({
            [SESSION_COOKIE_NAME]: unknownCookie,
            [AGE_VERIFIED_COOKIE_NAME]: "true",
          })
        ),
        null
      );
    } finally {
      harness.restore();
    }
  });
});

describe("admin entry surfaces", () => {
  it("resolves admin access server-side on the portal landing page", () => {
    const src = readSource("src/app/(portal)/page.tsx");
    assert.ok(src.includes("resolveAdminAccess"), "Portal page must resolve admin access");
    assert.ok(src.includes("isAdmin="), "Portal page must pass the resolved verdict to the header");
  });

  it("renders the portal entry in both the desktop cluster and the mobile drawer", () => {
    const src = readSource("src/components/studio-header.tsx");
    assert.ok(src.includes("isAdmin"), "StudioHeader must accept the resolved admin verdict");
    assert.ok(
      src.includes('data-testid="portal-admin-entry"'),
      "StudioHeader must render the desktop admin entry"
    );
    assert.ok(
      src.includes('data-testid="portal-admin-entry-drawer"'),
      "StudioHeader must render the drawer admin entry with mobile parity"
    );
    assert.ok(src.includes('t("navAdmin")'), "Admin entry must use the localized label");
    assert.ok(!src.includes("transition-all"), "Motion contract forbids transition-all");
    assert.ok(src.includes("focus-visible:ring-"), "Admin entry must declare a visible focus ring");
  });

  it("renders one status badge and the admin entry on the play header", () => {
    const src = readSource("src/app/(game)/play/page.tsx");
    assert.ok(src.includes("resolveAdminAccess"), "Play page must resolve admin access");
    assert.ok(
      src.includes('data-testid="play-admin-entry"'),
      "Play page must render the admin panel entry"
    );
    assert.ok(src.includes('t("adminPanel")'), "Entry must use the localized admin panel label");
    assert.ok(src.includes('t("adminBadge")'), "Admin sessions must label the badge locally");
    assert.ok(!src.includes('session.role !== "patron"'), "Role pill must be deleted, not hidden");
    assert.ok(src.includes("Shield"), "Entry keeps the Shield icon from the locked icon map");
    assert.equal(
      (src.match(/data-testid="play-status-badge"/g) ?? []).length,
      1,
      "Exactly one status badge element may exist per session"
    );
  });

  it("refreshes the server tree after the age gate is confirmed", () => {
    const src = readSource("src/components/age-gate-dialog.tsx");
    assert.ok(
      src.includes("router.refresh()"),
      "Age gate confirmation must re-render the server tree so the entry appears without a reload"
    );
    assert.ok(
      src.includes("hasServerModalState("),
      "The refresh must be skipped while server-derived modal state sits in the URL"
    );
  });

  it("skips the age-gate refresh only for URLs carrying server-derived modal state", () => {
    for (const search of [
      "?paywall=required",
      "?paywall=revoked",
      "?auth_required=true",
      "?auth_error=server_configuration_error",
      "?utm=x&paywall=lapsed",
    ]) {
      assert.equal(hasServerModalState(search), true, `${search} must block the refresh`);
    }

    for (const search of ["", "?", "?lang=ja", "?paywall_like=x", "?foo=paywall"]) {
      assert.equal(hasServerModalState(search), false, `${search} must allow the refresh`);
    }
  });

  it("ships the entry labels in all six locale dictionaries", () => {
    for (const locale of ["en", "es", "ja", "pl", "ru", "zh"]) {
      const dict = JSON.parse(readSource(`src/locales/${locale}.json`)) as {
        header: Record<string, string>;
        game: Record<string, string>;
      };
      for (const key of ["navAdmin"] as const) {
        assert.equal(typeof dict.header[key], "string", `${locale}.header.${key}`);
        assert.ok(dict.header[key].length > 0, `${locale}.header.${key} is blank`);
      }
      for (const key of ["adminPanel", "adminBadge"] as const) {
        assert.equal(typeof dict.game[key], "string", `${locale}.game.${key}`);
        assert.ok(dict.game[key].length > 0, `${locale}.game.${key} is blank`);
      }
    }
  });
});

describe("admin entry surface guard", () => {
  it("keeps the admin guard contracts byte-identical", () => {
    const src = readSource("src/lib/admin.ts");
    assert.ok(src.includes("export const requireAdminSession = cache("));
    assert.ok(src.includes("export async function validateAdminSession("));
    assert.ok(src.includes("export function isSealedCreatorAdmin("));
  });

  it("does not gate the resolver on the session role", () => {
    const src = readSource("src/lib/admin.ts");
    const resolverBody = src.slice(src.indexOf("export const resolveAdminAccess"));
    assert.ok(resolverBody.length > 0, "resolveAdminAccess must exist");
    assert.ok(
      !resolverBody.includes("session.role"),
      "Admin access must never be derived from the session role"
    );
  });
});
