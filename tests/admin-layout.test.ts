import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { SessionRecord, PatronOverrideRecord } from "../src/types/database";
import {
  validateAdminSession,
  requireAdminSession,
  ADMIN_BACKGROUND_COLOR,
  ADMIN_CARD_SURFACE,
  ADMIN_BORDER_COLOR,
  ADMIN_BADGE_GOLD,
} from "../src/lib/admin";
import { signValue } from "../src/lib/crypto";
import { AGE_VERIFIED_COOKIE_NAME, SESSION_COOKIE_NAME } from "../src/lib/cookies";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (rel: string): string => readFileSync(join(rootDir, rel), "utf8");

const TEST_SECRET = "0123456789abcdef0123456789abcdef";

function createMockD1() {
  const overrides = new Map<string, PatronOverrideRecord>();
  const sessions = new Map<string, SessionRecord>();

  const db = {
    _overrides: overrides,
    _sessions: sessions,
    prepare(sql: string) {
      const stmt = {
        params: [] as unknown[],
        bind(...params: unknown[]) {
          stmt.params = params;
          return stmt;
        },
        async first<T>(): Promise<T | null> {
          if (sql.includes("FROM patron_overrides WHERE patron_id = ?")) {
            const patronId = stmt.params[0] as string;
            return (overrides.get(patronId) as T | undefined) ?? null;
          }
          if (sql.includes("FROM sessions WHERE id = ?")) {
            const sessionId = stmt.params[0] as string;
            return (sessions.get(sessionId) as T | undefined) ?? null;
          }
          throw new Error(`Unhandled query in mock first(): ${sql}`);
        },
        async all<T>(): Promise<{ results: T[] }> {
          if (sql.includes("FROM patron_overrides")) {
            return { results: Array.from(overrides.values()) as unknown as T[] };
          }
          throw new Error(`Unhandled query in mock all(): ${sql}`);
        },
        async run(): Promise<{ success: boolean; meta: Record<string, unknown> }> {
          if (sql.includes("INSERT INTO patron_overrides")) {
            const [patronId, role, notes, grantedBy, createdAt, updatedAt] = stmt.params as [
              string,
              "admin" | "comp",
              string | null,
              string,
              number,
              number,
            ];
            overrides.set(patronId, {
              patron_id: patronId,
              role,
              notes: notes ?? null,
              granted_by: grantedBy,
              created_at_sec: createdAt,
              updated_at_sec: updatedAt,
            });
            return { success: true, meta: {} };
          }
          if (sql.includes("UPDATE sessions SET revoked = 1")) {
            const sessionId = stmt.params[0] as string;
            const session = sessions.get(sessionId);
            if (session) {
              sessions.set(sessionId, { ...session, revoked: 1 });
            }
            return { success: true, meta: {} };
          }
          if (sql.includes("INSERT INTO sessions") || sql.includes("UPDATE sessions")) {
            const id = stmt.params[0] as string;
            const existing = sessions.get(id);
            if (existing) {
              sessions.set(id, {
                ...existing,
                role: stmt.params[3] as "admin" | "comp" | "patron",
                tier_id: stmt.params[4] as string,
                tier_name: stmt.params[5] as string,
                last_verified_at_sec: stmt.params[12] as number,
              });
            }
            return { success: true, meta: {} };
          }
          throw new Error(`Unhandled query in mock run(): ${sql}`);
        },
      };
      return stmt;
    },
  } as unknown as D1Database & {
    _overrides: Map<string, PatronOverrideRecord>;
    _sessions: Map<string, SessionRecord>;
  };

  return db;
}

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: "session-uuid-1",
    patron_id: "patron-100",
    email: "admin@ropoductions.test",
    role: "admin",
    tier_id: "override_admin",
    tier_name: "Studio Admin",
    pledge_cents: 0,
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

describe("admin session validation policy (validateAdminSession)", () => {
  it("returns null when session cookie or secret is missing", async () => {
    const db = createMockD1();
    assert.equal(
      await validateAdminSession({
        db,
        sessionCookie: null,
        ageCookie: "true",
        sessionSecret: TEST_SECRET,
      }),
      null
    );

    assert.equal(
      await validateAdminSession({
        db,
        sessionCookie: "some-cookie",
        ageCookie: "true",
        sessionSecret: undefined,
      }),
      null
    );
  });

  it("returns null when age verification is missing or false", async () => {
    const db = createMockD1();
    const cookie = await signValue("session-uuid-1", TEST_SECRET);

    assert.equal(
      await validateAdminSession({
        db,
        sessionCookie: cookie,
        ageCookie: null,
        sessionSecret: TEST_SECRET,
      }),
      null
    );

    assert.equal(
      await validateAdminSession({
        db,
        sessionCookie: cookie,
        ageCookie: "false",
        sessionSecret: TEST_SECRET,
      }),
      null
    );
  });

  it("returns null when cookie signature is forged or tampered", async () => {
    const db = createMockD1();
    const forged = "session-uuid-1.forged_signature_hex";

    assert.equal(
      await validateAdminSession({
        db,
        sessionCookie: forged,
        ageCookie: "true",
        sessionSecret: TEST_SECRET,
      }),
      null
    );
  });

  it("returns null when session is not found in database", async () => {
    const db = createMockD1();
    const cookie = await signValue("unknown-uuid", TEST_SECRET);

    assert.equal(
      await validateAdminSession({
        db,
        sessionCookie: cookie,
        ageCookie: "true",
        sessionSecret: TEST_SECRET,
      }),
      null
    );
  });

  it("returns null when session is expired or revoked", async () => {
    const db = createMockD1();
    const now = Math.floor(Date.now() / 1000);

    const expiredSession = makeSession({ id: "expired-id", expires_at_sec: now - 10 });
    db._sessions.set("expired-id", expiredSession);
    db._overrides.set(expiredSession.patron_id, {
      patron_id: expiredSession.patron_id,
      role: "admin",
      notes: null,
      granted_by: "creator_bootstrap",
      created_at_sec: now,
      updated_at_sec: now,
    });
    const expiredCookie = await signValue("expired-id", TEST_SECRET);

    assert.equal(
      await validateAdminSession({
        db,
        sessionCookie: expiredCookie,
        ageCookie: "true",
        sessionSecret: TEST_SECRET,
        nowSec: now,
      }),
      null
    );

    const revokedSession = makeSession({ id: "revoked-id", revoked: 1 });
    db._sessions.set("revoked-id", revokedSession);
    db._overrides.set(revokedSession.patron_id, {
      patron_id: revokedSession.patron_id,
      role: "admin",
      notes: null,
      granted_by: "creator_bootstrap",
      created_at_sec: now,
      updated_at_sec: now,
    });
    const revokedCookie = await signValue("revoked-id", TEST_SECRET);

    assert.equal(
      await validateAdminSession({
        db,
        sessionCookie: revokedCookie,
        ageCookie: "true",
        sessionSecret: TEST_SECRET,
        nowSec: now,
      }),
      null
    );
  });

  it("returns null when session role is regular patron (even top $50 tier)", async () => {
    const db = createMockD1();
    const patronSession = makeSession({
      id: "patron-session",
      patron_id: "patron-regular",
      role: "patron",
      tier_id: "tier-avatar",
      tier_name: "Mind Fucker Avatar",
      pledge_cents: 5000,
    });
    db._sessions.set("patron-session", patronSession);
    const cookie = await signValue("patron-session", TEST_SECRET);

    assert.equal(
      await validateAdminSession({
        db,
        sessionCookie: cookie,
        ageCookie: "true",
        sessionSecret: TEST_SECRET,
      }),
      null
    );
  });

  it("returns null when session role is complimentary playtester ('comp')", async () => {
    const db = createMockD1();
    const now = Math.floor(Date.now() / 1000);
    const compSession = makeSession({
      id: "comp-session",
      patron_id: "patron-comp",
      role: "comp",
      tier_id: "override_comp",
      tier_name: "Complimentary Pass",
    });
    db._sessions.set("comp-session", compSession);
    db._overrides.set("patron-comp", {
      patron_id: "patron-comp",
      role: "comp",
      notes: "Playtester",
      granted_by: "100",
      created_at_sec: now,
      updated_at_sec: now,
    });
    const cookie = await signValue("comp-session", TEST_SECRET);

    assert.equal(
      await validateAdminSession({
        db,
        sessionCookie: cookie,
        ageCookie: "true",
        sessionSecret: TEST_SECRET,
      }),
      null
    );
  });

  it("returns the session record when user is an active admin with override", async () => {
    const db = createMockD1();
    const now = Math.floor(Date.now() / 1000);
    const adminSession = makeSession({
      id: "admin-session",
      patron_id: "admin-1",
      role: "admin",
    });
    db._sessions.set("admin-session", adminSession);
    db._overrides.set("admin-1", {
      patron_id: "admin-1",
      role: "admin",
      notes: "Founder",
      granted_by: "creator_bootstrap",
      created_at_sec: now,
      updated_at_sec: now,
    });
    const cookie = await signValue("admin-session", TEST_SECRET);

    const validated = await validateAdminSession({
      db,
      sessionCookie: cookie,
      ageCookie: "true",
      sessionSecret: TEST_SECRET,
    });

    assert.notEqual(validated, null);
    assert.equal(validated?.role, "admin");
    assert.equal(validated?.patron_id, "admin-1");
  });

  it("elevates and authorizes initial admin when patron_id is in initialAdminIds", async () => {
    const db = createMockD1();
    const patronSession = makeSession({
      id: "bootstrap-session",
      patron_id: "99999",
      role: "patron",
      pledge_cents: 0,
    });
    db._sessions.set("bootstrap-session", patronSession);
    const cookie = await signValue("bootstrap-session", TEST_SECRET);

    const validated = await validateAdminSession({
      db,
      sessionCookie: cookie,
      ageCookie: "true",
      sessionSecret: TEST_SECRET,
      initialAdminIds: "99999,12345",
    });

    assert.notEqual(validated, null);
    assert.equal(validated?.role, "admin");
    assert.equal(validated?.patron_id, "99999");
  });
  it("elevates paying patron ($50) when granted an admin override in patron_overrides", async () => {
    const db = createMockD1();
    const now = Math.floor(Date.now() / 1000);
    const payingPatronSession = makeSession({
      id: "paying-patron-session",
      patron_id: "patron-top-tier",
      role: "patron",
      tier_id: "tier-avatar",
      tier_name: "Mind Fucker Avatar",
      pledge_cents: 5000,
    });
    db._sessions.set("paying-patron-session", payingPatronSession);
    db._overrides.set("patron-top-tier", {
      patron_id: "patron-top-tier",
      role: "admin",
      notes: "Promoted patron",
      granted_by: "creator_bootstrap",
      created_at_sec: now,
      updated_at_sec: now,
    });
    const cookie = await signValue("paying-patron-session", TEST_SECRET);

    const validated = await validateAdminSession({
      db,
      sessionCookie: cookie,
      ageCookie: "true",
      sessionSecret: TEST_SECRET,
    });

    assert.notEqual(validated, null);
    assert.equal(validated?.role, "admin");
    assert.equal(validated?.patron_id, "patron-top-tier");
  });

  it("rejects demoted admin when patron_overrides was changed to comp", async () => {
    const db = createMockD1();
    const now = Math.floor(Date.now() / 1000);
    const formerAdminSession = makeSession({
      id: "former-admin-session",
      patron_id: "former-admin",
      role: "admin",
    });
    db._sessions.set("former-admin-session", formerAdminSession);
    db._overrides.set("former-admin", {
      patron_id: "former-admin",
      role: "comp",
      notes: "Demoted to comp playtester",
      granted_by: "creator_bootstrap",
      created_at_sec: now,
      updated_at_sec: now,
    });
    const cookie = await signValue("former-admin-session", TEST_SECRET);

    const validated = await validateAdminSession({
      db,
      sessionCookie: cookie,
      ageCookie: "true",
      sessionSecret: TEST_SECRET,
    });

    assert.equal(validated, null);
  });
});

describe("admin guard requireAdminSession and anti-enumeration 404", () => {
  it("invokes notFound() when session cookie is missing", async () => {
    const cookies = {
      get: (name: string) =>
        name === AGE_VERIFIED_COOKIE_NAME ? { value: "true" } : undefined,
    };

    await assert.rejects(
      async () => {
        await requireAdminSession(cookies);
      },
      (err: unknown) => {
        const error = err as Error & { digest?: string };
        return error.digest?.includes("404") || error.message?.includes("NEXT_HTTP_ERROR_FALLBACK");
      }
    );
  });

  it("invokes notFound() when age verification is missing or false", async () => {
    const cookies = {
      get: (name: string) =>
        name === SESSION_COOKIE_NAME ? { value: "some-session" } : undefined,
    };

    await assert.rejects(
      async () => {
        await requireAdminSession(cookies);
      },
      (err: unknown) => {
        const error = err as Error & { digest?: string };
        return error.digest?.includes("404") || error.message?.includes("NEXT_HTTP_ERROR_FALLBACK");
      }
    );
  });

  it("invokes notFound() when session role is not admin", async () => {
    const originalSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = TEST_SECRET;

    const previousD1 = globalThis.__D1_TEST_DB__;
    try {
      const db = createMockD1();
      globalThis.__D1_TEST_DB__ = db;
      const patronSession = makeSession({
        id: "patron-non-admin",
        patron_id: "patron-404",
        role: "patron",
        pledge_cents: 5000,
      });
      db._sessions.set("patron-non-admin", patronSession);
      const cookie = await signValue("patron-non-admin", TEST_SECRET);

      const cookies = {
        get: (name: string) => {
          if (name === AGE_VERIFIED_COOKIE_NAME) return { value: "true" };
          if (name === SESSION_COOKIE_NAME) return { value: cookie };
          return undefined;
        },
      };

      await assert.rejects(
        async () => {
          await requireAdminSession(cookies);
        },
        (err: unknown) => {
          const error = err as Error & { digest?: string };
          return (
            error.digest?.includes("404") ||
            error.message?.includes("NEXT_HTTP_ERROR_FALLBACK")
          );
        }
      );
    } finally {
      globalThis.__D1_TEST_DB__ = previousD1;
      if (originalSecret) {
        process.env.SESSION_SECRET = originalSecret;
      } else {
        delete process.env.SESSION_SECRET;
      }
    }
  });

  it("returns active admin session on happy path", async () => {
    const originalSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = TEST_SECRET;
    const previousD1 = globalThis.__D1_TEST_DB__;

    try {
      const db = createMockD1();
      globalThis.__D1_TEST_DB__ = db;
      const now = Math.floor(Date.now() / 1000);
      const adminSession = makeSession({
        id: "verified-admin-session",
        patron_id: "admin-legit",
        role: "admin",
      });
      db._sessions.set("verified-admin-session", adminSession);
      db._overrides.set("admin-legit", {
        patron_id: "admin-legit",
        role: "admin",
        notes: "Authorized",
        granted_by: "creator_bootstrap",
        created_at_sec: now,
        updated_at_sec: now,
      });
      const cookie = await signValue("verified-admin-session", TEST_SECRET);

      const cookies = {
        get: (name: string) => {
          if (name === AGE_VERIFIED_COOKIE_NAME) return { value: "true" };
          if (name === SESSION_COOKIE_NAME) return { value: cookie };
          return undefined;
        },
      };

      const result = await requireAdminSession(cookies);
      assert.equal(result.role, "admin");
      assert.equal(result.patron_id, "admin-legit");
    } finally {
      globalThis.__D1_TEST_DB__ = previousD1;
      if (originalSecret) {
        process.env.SESSION_SECRET = originalSecret;
      } else {
        delete process.env.SESSION_SECRET;
      }
    }
  });
});

describe("admin layout and dashboard design contract", () => {
  it("exports designated studio design tokens for admin surfaces", () => {
    assert.equal(ADMIN_BACKGROUND_COLOR, "#090A0F");
    assert.equal(ADMIN_CARD_SURFACE, "#121522");
    assert.equal(ADMIN_BORDER_COLOR, "#23283E");
    assert.equal(ADMIN_BADGE_GOLD, "#FBBF24");
  });

  it("provisions AdminLayout with gold status badge, dark studio tokens, and /play link", () => {
    const layoutPath = "src/app/(admin)/layout.tsx";
    assert.ok(existsSync(join(rootDir, layoutPath)), "src/app/(admin)/layout.tsx must exist");

    const src = readSource(layoutPath);
    assert.ok(src.includes("export default async function AdminLayout("), "Must export default async AdminLayout component");
    assert.ok(src.includes("requireAdminSession"), "Admin layout must enforce session via requireAdminSession");
    assert.ok(src.includes("bg-[#090A0F]"), "Admin layout must use #090A0F background token");
    assert.ok(src.includes("bg-[#121522]"), "Admin header must use #121522 card surface token");
    assert.ok(src.includes("z-40"), "Admin header must declare z-40 per design system z-scale");
    assert.ok(src.includes("border-[#23283E]"), "Admin header must use #23283E border token");
    assert.ok(src.includes('data-testid="admin-status-badge"'), "Must include admin-status-badge testid");
    assert.ok(src.includes("text-tier-gold"), "Status badge must use tier-gold token");
    assert.ok(src.includes("Studio Admin"), "Status badge must display Studio Admin text");
    assert.ok(src.includes('data-testid="admin-nav-play"'), "Must include admin-nav-play testid");
    assert.ok(src.includes('href="/play"'), "Play navigation link must point to /play");
    assert.ok(src.includes("min-h-[44px]"), "Interactive triggers must enforce 44x44px minimum touch target size");
    assert.ok(src.includes('href="/admin/overrides"'), "Must provide navigation to /admin/overrides");
    assert.ok(src.includes('dynamic = "force-dynamic"'), "Must force dynamic rendering for session evaluation");
  });

  it("provisions AdminDashboardPage with patron identity and overrides navigation", () => {
    const pagePath = "src/app/(admin)/admin/page.tsx";
    assert.ok(existsSync(join(rootDir, pagePath)), "src/app/(admin)/admin/page.tsx must exist");

    const src = readSource(pagePath);
    assert.ok(src.includes("export default async function AdminDashboardPage("), "Must export default async AdminDashboardPage");
    assert.ok(src.includes("requireAdminSession"), "Admin dashboard must enforce session via requireAdminSession");
    assert.ok(src.includes("Studio Administration Dashboard"), "Must display studio administration title");
    assert.ok(src.includes("session.patron_id"), "Must display authenticated admin patron ID");
    assert.ok(src.includes("session.role"), "Must display admin role");
    assert.ok(src.includes('href="/admin/overrides"'), "Must link to patron overrides directory");
    assert.ok(src.includes('href="/play"'), "Must link to web player");
    assert.ok(src.includes("min-h-[44px]"), "Action cards must adhere to 44px minimum touch targets");
    assert.ok(src.includes('dynamic = "force-dynamic"'), "Must force dynamic rendering");
  });

  it("provisions AdminOverridesPage placeholder with protected admin guard", () => {
    const overridesPath = "src/app/(admin)/admin/overrides/page.tsx";
    assert.ok(existsSync(join(rootDir, overridesPath)), "src/app/(admin)/admin/overrides/page.tsx must exist");

    const src = readSource(overridesPath);
    assert.ok(src.includes("export default async function AdminOverridesPage("), "Must export default async AdminOverridesPage");
    assert.ok(src.includes("requireAdminSession"), "Admin overrides must enforce session via requireAdminSession");
    assert.ok(src.includes("Patron Overrides Directory"), "Must display patron overrides title");
    assert.ok(src.includes('href="/admin"'), "Must provide back link to /admin");
  });
});
