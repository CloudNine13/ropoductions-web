import type { PatronOverrideRecord, SessionRecord } from "../../src/types/database";

export interface MockD1Database extends D1Database {
  _overrides: Map<string, PatronOverrideRecord>;
  _sessions: Map<string, SessionRecord>;
}

export interface MockD1State {
  db: MockD1Database;
  overrides: Map<string, PatronOverrideRecord>;
  sessions: Map<string, SessionRecord>;
}

/**
 * Shared in-memory D1 mock used by the admin override/revocation/guard suites.
 * Implements the prepared-statement surface those suites exercise:
 * - patron_overrides point lookup, admin count, list-all, INSERT upsert, DELETE
 * - sessions point lookup, INSERT/UPDATE upsert, revoke-by-id
 */
export function createMockD1(): MockD1State {
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
          if (sql.includes("SELECT COUNT(*)") && sql.includes("FROM patron_overrides")) {
            const role = stmt.params[0] as string;
            const count = Array.from(overrides.values()).filter((o) => o.role === role).length;
            return { count } as T;
          }
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
            // granted_by is immutable: set on INSERT only, preserved on update.
            overrides.set(patronId, {
              patron_id: patronId,
              role,
              notes: notes ?? null,
              granted_by: existing ? existing.granted_by : grantedBy,
              created_at_sec: existing ? existing.created_at_sec : createdAt,
              updated_at_sec: updatedAt,
            });
            return { success: true, meta: {} };
          }
          if (sql.includes("DELETE FROM patron_overrides")) {
            const patronId = stmt.params[0] as string;
            const target = overrides.get(patronId);
            if (!target) {
              return { success: true, meta: { changes: 0 } };
            }
            overrides.delete(patronId);
            return { success: true, meta: { changes: 1 } };
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
  } as unknown as MockD1Database;

  return { db, overrides, sessions };
}