import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { PatronOverrideRecord, SessionRecord } from "../src/types/database";
import {
  ADMIN_BACKGROUND_COLOR,
  ADMIN_CARD_SURFACE,
  ADMIN_BORDER_COLOR,
  ADMIN_BADGE_GOLD,
  ADMIN_ROLE_ADMIN_COLOR,
  ADMIN_ROLE_COMP_COLOR,
  ADMIN_CREATOR_TIER_LABEL,
  ADMIN_PANEL_TIER_LABEL,
  PATREON_ID_REGEX,
  validatePatreonId,
  isSealedCreatorAdmin,
} from "../src/lib/admin";
import { handleUpsertOverrideCore } from "../src/app/(admin)/admin/overrides/actions";

const worktreeDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (rel: string): string => readFileSync(join(worktreeDir, rel), "utf8");

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
            const existing = overrides.get(patronId);
            overrides.set(patronId, {
              patron_id: patronId,
              role,
              notes,
              granted_by: grantedBy,
              created_at_sec: existing ? existing.created_at_sec : createdAt,
              updated_at_sec: updatedAt,
            });
            return { success: true, meta: {} };
          }
          if (sql.includes("DELETE FROM patron_overrides WHERE patron_id = ?")) {
            const patronId = stmt.params[0] as string;
            overrides.delete(patronId);
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

  return { db, overrides, sessions };
}

describe("patron ID validation & regex contract (PATREON_ID_REGEX)", () => {
  it("accepts valid numeric Patreon IDs between 1 and 20 digits", () => {
    assert.equal(validatePatreonId("1"), true);
    assert.equal(validatePatreonId("12345678"), true);
    assert.equal(validatePatreonId("98765432101234567890"), true);
    assert.equal(PATREON_ID_REGEX.test("12345678"), true);
  });

  it("rejects non-digit strings, whitespace, symbols, and empty input", () => {
    assert.equal(validatePatreonId(""), false);
    assert.equal(validatePatreonId("   "), false);
    assert.equal(validatePatreonId("abc"), false);
    assert.equal(validatePatreonId("1234a"), false);
    assert.equal(validatePatreonId(" 12345678 "), false);
    assert.equal(validatePatreonId("-12345"), false);
    assert.equal(validatePatreonId("123.456"), false);
    assert.equal(validatePatreonId("123456789012345678901"), false); // 21 digits
  });
});

describe("two-tier admin model immutability (isSealedCreatorAdmin)", () => {
  it("identifies records with granted_by = 'creator_bootstrap' as sealed", () => {
    const record: PatronOverrideRecord = {
      patron_id: "88888888",
      role: "admin",
      notes: "Founder",
      granted_by: "creator_bootstrap",
      created_at_sec: 1700000000,
      updated_at_sec: 1700000000,
    };
    assert.equal(isSealedCreatorAdmin(record), true);
  });
  it("identifies records with granted_by = 'system_bootstrap' as sealed", () => {
    const record: PatronOverrideRecord = {
      patron_id: "77777777",
      role: "admin",
      notes: "System Seeded",
      granted_by: "system_bootstrap",
      created_at_sec: 1700000000,
      updated_at_sec: 1700000000,
    };
    assert.equal(isSealedCreatorAdmin(record), true);
  });


  it("identifies configured creator IDs as sealed regardless of record granted_by", () => {
    const record: PatronOverrideRecord = {
      patron_id: "99999999",
      role: "admin",
      notes: "Seeded",
      granted_by: "unknown",
      created_at_sec: 1700000000,
      updated_at_sec: 1700000000,
    };
    assert.equal(isSealedCreatorAdmin(record, "99999999,11111111"), true);
  });

  it("identifies panel-assigned runtime records as mutable", () => {
    const record: PatronOverrideRecord = {
      patron_id: "55555555",
      role: "comp",
      notes: "Playtester",
      granted_by: "12345678",
      created_at_sec: 1700000000,
      updated_at_sec: 1700000000,
    };
    assert.equal(isSealedCreatorAdmin(record, "99999999"), false);
  });
});

describe("override creation & update action core logic (handleUpsertOverrideCore)", () => {
  const adminSession: SessionRecord = {
    id: "session-admin-1",
    patron_id: "12345678",
    email: "admin@example.com",
    role: "admin",
    tier_id: "override_admin",
    tier_name: "Studio Admin",
    pledge_cents: 0,
    encrypted_access_token: "enc",
    encrypted_refresh_token: "ref",
    token_expires_at_sec: 2000000000,
    expires_at_sec: 2000000000,
    revoked: 0,
    created_at_sec: 1700000000,
    last_verified_at_sec: 1700000000,
  };

  it("rejects non-admin calling session with 403 / error", async () => {
    const { db } = createMockD1();
    const patronSession: SessionRecord = {
      ...adminSession,
      role: "patron",
    };

    const result = await handleUpsertOverrideCore({
      db,
      callingSession: patronSession,
      patronId: "22222222",
      role: "comp",
      notes: "Attempt",
      creatorAdminIds: "99999999",
    });

    assert.equal(result.success, false);
    assert.match(result.error ?? "", /unauthorized/i);
  });

  it("rejects invalid Patreon ID format", async () => {
    const { db } = createMockD1();
    const result = await handleUpsertOverrideCore({
      db,
      callingSession: adminSession,
      patronId: "abc-invalid",
      role: "admin",
      notes: null,
      creatorAdminIds: "99999999",
    });

    assert.equal(result.success, false);
    assert.match(result.error ?? "", /patreon id/i);
  });

  it("rejects invalid role selection", async () => {
    const { db } = createMockD1();
    const result = await handleUpsertOverrideCore({
      db,
      callingSession: adminSession,
      patronId: "22222222",
      role: "superadmin" as unknown as "admin",
      notes: null,
      creatorAdminIds: "99999999",
    });

    assert.equal(result.success, false);
    assert.match(result.error ?? "", /role/i);
  });

  it("strictly rejects any attempt to modify or reassign a sealed Creator Admin in D1", async () => {
    const { db, overrides } = createMockD1();
    overrides.set("99999999", {
      patron_id: "99999999",
      role: "admin",
      notes: "Original Creator",
      granted_by: "creator_bootstrap",
      created_at_sec: 1700000000,
      updated_at_sec: 1700000000,
    });

    const result = await handleUpsertOverrideCore({
      db,
      callingSession: adminSession,
      patronId: "99999999",
      role: "comp",
      notes: "Attempted downgrade",
      creatorAdminIds: "99999999",
    });

    assert.equal(result.success, false);
    assert.match(result.error ?? "", /creator admin.*sealed/i);

    // Verify D1 was NOT modified
    const untouched = overrides.get("99999999");
    assert.equal(untouched?.role, "admin");
    assert.equal(untouched?.granted_by, "creator_bootstrap");
  });

  it("strictly rejects any attempt to target a configured Creator Admin ID not yet in D1", async () => {
    const { db, overrides } = createMockD1();

    const result = await handleUpsertOverrideCore({
      db,
      callingSession: adminSession,
      patronId: "88888888",
      role: "comp",
      notes: "Targeting unseeded creator",
      creatorAdminIds: "88888888,99999999",
    });

    assert.equal(result.success, false);
    assert.match(result.error ?? "", /creator admin.*sealed/i);
    assert.equal(overrides.has("88888888"), false);
  });
  it("strictly rejects any attempt to modify an existing override with granted_by = 'system_bootstrap'", async () => {
    const { db, overrides } = createMockD1();
    overrides.set("77777777", {
      patron_id: "77777777",
      role: "admin",
      notes: "System bootstrapped",
      granted_by: "system_bootstrap",
      created_at_sec: 1700000000,
      updated_at_sec: 1700000000,
    });

    const result = await handleUpsertOverrideCore({
      db,
      callingSession: adminSession,
      patronId: "77777777",
      role: "comp",
      notes: "Attempted change",
    });

    assert.equal(result.success, false);
    assert.match(result.error ?? "", /creator admin.*sealed/i);
  });

  it("fails closed when database lookup throws during pre-mutation check", async () => {
    const { db } = createMockD1();
    const failingDb = {
      ...db,
      prepare(sql: string) {
        if (sql.includes("FROM patron_overrides WHERE patron_id = ?")) {
          throw new Error("D1 connection timeout");
        }
        return db.prepare(sql);
      },
    } as unknown as D1Database;

    const result = await handleUpsertOverrideCore({
      db: failingDb,
      callingSession: adminSession,
      patronId: "55555555",
      role: "comp",
      notes: "Fail test",
    });

    assert.equal(result.success, false);
    assert.match(result.error ?? "", /database operation failed/i);
  });


  it("creates a new panel-assigned override on valid input", async () => {
    const { db, overrides } = createMockD1();

    const result = await handleUpsertOverrideCore({
      db,
      callingSession: adminSession,
      patronId: "33333333",
      role: "comp",
      notes: "New playtester",
      creatorAdminIds: "99999999",
      nowSec: 1710000000,
    });

    assert.equal(result.success, true);
    assert.match(result.message ?? "", /successfully/i);

    const saved = overrides.get("33333333");
    assert.ok(saved);
    assert.equal(saved.patron_id, "33333333");
    assert.equal(saved.role, "comp");
    assert.equal(saved.notes, "New playtester");
    assert.equal(saved.granted_by, adminSession.patron_id); // session.patron_id
    assert.equal(saved.created_at_sec, 1710000000);
    assert.equal(saved.updated_at_sec, 1710000000);
  });

  it("updates an existing panel-assigned override preserving created_at_sec", async () => {
    const { db, overrides } = createMockD1();
    overrides.set("44444444", {
      patron_id: "44444444",
      role: "comp",
      notes: "Old note",
      granted_by: "previous_admin",
      created_at_sec: 1700000000,
      updated_at_sec: 1700000000,
    });

    const result = await handleUpsertOverrideCore({
      db,
      callingSession: adminSession,
      patronId: "44444444",
      role: "admin",
      notes: "Promoted to panel admin",
      creatorAdminIds: "99999999",
      nowSec: 1720000000,
    });

    assert.equal(result.success, true);

    const updated = overrides.get("44444444");
    assert.ok(updated);
    assert.equal(updated.role, "admin");
    assert.equal(updated.notes, "Promoted to panel admin");
    assert.equal(updated.granted_by, adminSession.patron_id);
    assert.equal(updated.created_at_sec, 1700000000); // Preserved
    assert.equal(updated.updated_at_sec, 1720000000); // Updated
  });
});

describe("admin overrides directory UI and design system tokens", () => {
  it("exports required design tokens for admin overrides directory", () => {
    assert.equal(ADMIN_BACKGROUND_COLOR, "#090A0F");
    assert.equal(ADMIN_CARD_SURFACE, "#121522");
    assert.equal(ADMIN_BORDER_COLOR, "#23283E");
    assert.equal(ADMIN_BADGE_GOLD, "#FBBF24");
    assert.equal(ADMIN_ROLE_ADMIN_COLOR, "#FBBF24");
    assert.equal(ADMIN_ROLE_COMP_COLOR, "#38BDF8");
    assert.equal(ADMIN_CREATOR_TIER_LABEL, "Creator Admin (Sealed)");
    assert.equal(ADMIN_PANEL_TIER_LABEL, "Panel Admin");
  });

  it("provisions OverrideForm component with touch targets, accessible status, and testids", () => {
    const formSrc = readSource("src/components/admin/override-form.tsx");
    assert.match(formSrc, /['"]use client['"]/);
    assert.match(formSrc, /useActionState/);
    assert.match(formSrc, /data-testid="override-input-patron-id"/);
    assert.match(formSrc, /data-testid="override-select-role"/);
    assert.match(formSrc, /data-testid="override-input-notes"/);
    assert.match(formSrc, /data-testid="override-submit-btn"/);
    assert.match(formSrc, /data-testid="override-form-status"/);
    assert.match(formSrc, /role="status"/);
    assert.match(formSrc, /aria-live="polite"/);
    assert.match(formSrc, /min-h-\[44px\]/);
    assert.match(formSrc, /state\.timestamp/);
  });

  it("provisions OverridesTable component with two-tier badges, sealed indicators, and table semantics", () => {
    const tableSrc = readSource("src/components/admin/overrides-table.tsx");
    assert.match(tableSrc, /<table/);
    assert.match(tableSrc, /scope="col"/);
    assert.match(tableSrc, /data-testid="override-row-patron-id"/);
    assert.match(tableSrc, /data-testid="override-badge-role"/);
    assert.match(tableSrc, /data-testid="override-tier-sealed"/);
    assert.match(tableSrc, /data-testid="override-tier-panel"/);
    assert.match(tableSrc, /data-testid="override-sealed-indicator"/);
    assert.match(tableSrc, /Creator Admin \(Sealed\)/);
    assert.match(tableSrc, /Panel Admin/);
  });

  it("wires Server Component page with requireAdminSession, listPatronOverrides, and design layout", () => {
    const pageSrc = readSource("src/app/(admin)/admin/overrides/page.tsx");
    assert.match(pageSrc, /requireAdminSession/);
    assert.match(pageSrc, /listPatronOverrides/);
    assert.match(pageSrc, /OverrideForm/);
    assert.match(pageSrc, /OverridesTable/);
    assert.match(pageSrc, /Back to Dashboard/);
    assert.match(pageSrc, /min-h-\[44px\]/);
  });

  it("wires Server Action file with 'use server', revalidatePath, and admin auth", () => {
    const actionSrc = readSource("src/app/(admin)/admin/overrides/actions.ts");
    assert.match(actionSrc, /['"]use server['"]/);
    assert.match(actionSrc, /revalidatePath/);
    assert.match(actionSrc, /requireAdminSession/);
    assert.match(actionSrc, /upsertOverrideAction/);
  });
});
