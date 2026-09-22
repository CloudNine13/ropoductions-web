import type {
  OverrideAuditRecord,
  PatronOverrideRecord,
  SessionRecord,
} from "../../src/types/database";

export interface MockD1Database extends D1Database {
  _overrides: Map<string, PatronOverrideRecord>;
  _sessions: Map<string, SessionRecord>;
  _audit: OverrideAuditRecord[];
}

export interface MockD1State {
  db: MockD1Database;
  overrides: Map<string, PatronOverrideRecord>;
  sessions: Map<string, SessionRecord>;
  audit: OverrideAuditRecord[];
}

/**
 * Shared in-memory D1 mock used by the admin override/revocation/guard suites.
 * Implements the prepared-statement surface those suites exercise:
 * - patron_overrides point lookup, admin count, list-all, INSERT upsert, DELETE
 * - sessions point lookup, INSERT/UPDATE upsert, revoke-by-id
 * - override_audit INSERT (via batch) and list
 */
export function createMockD1(): MockD1State {
  const overrides = new Map<string, PatronOverrideRecord>();
  const sessions = new Map<string, SessionRecord>();
  const audit: OverrideAuditRecord[] = [];

  /**
   * Emulates the two audit statements the DAL batches. `action`/`before_role` are
   * derived here from the pre-write override map, mirroring the SQL subquery: the
   * audit statement must stay batch[0] for this emulation (and the real statement)
   * to read pre-write state.
   */
  function insertAuditRow(params: unknown[], isRevoke: boolean): number {
    if (isRevoke) {
      const [actor, target, createdAt] = params as [string, string, number];
      const before = overrides.get(target);
      if (!before) {
        return 0;
      }
      audit.push({
        id: audit.length + 1,
        actor_patron_id: actor,
        target_patron_id: target,
        action: "revoke",
        before_role: before.role,
        after_role: null,
        created_at_sec: createdAt,
      });
      return 1;
    }

    const [actor, target, role, createdAt] = params as [string, string, "admin" | "comp", number];
    const before = overrides.get(target);
    audit.push({
      id: audit.length + 1,
      actor_patron_id: actor,
      target_patron_id: target,
      action: before ? "update" : "grant",
      before_role: before ? before.role : null,
      after_role: role,
      created_at_sec: createdAt,
    });
    return 1;
  }

  function runStatement(sql: string, params: unknown[]): {
    success: boolean;
    meta: Record<string, unknown>;
  } {
    // The audit SQL embeds `FROM patron_overrides WHERE patron_id = ?2` inside its
    // subquery, so this branch MUST precede every patron_overrides branch.
    if (sql.includes("INSERT INTO override_audit")) {
      return { success: true, meta: { changes: insertAuditRow(params, sql.includes("'revoke'")) } };
    }
    if (sql.includes("INSERT INTO patron_overrides")) {
      const [patronId, role, notes, grantedBy, createdAt, updatedAt] = params as [
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
      const patronId = params[0] as string;
      const target = overrides.get(patronId);
      if (!target) {
        return { success: true, meta: { changes: 0 } };
      }
      overrides.delete(patronId);
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.includes("UPDATE sessions SET revoked = 1")) {
      const sessionId = params[0] as string;
      const session = sessions.get(sessionId);
      if (session) {
        sessions.set(sessionId, { ...session, revoked: 1 });
      }
      return { success: true, meta: {} };
    }
    if (sql.includes("INSERT INTO sessions") || sql.includes("UPDATE sessions")) {
      const id = params[0] as string;
      const existing = sessions.get(id);
      if (existing) {
        sessions.set(id, {
          ...existing,
          role: params[3] as "admin" | "comp" | "patron",
          tier_id: params[4] as string,
          tier_name: params[5] as string,
          last_verified_at_sec: params[12] as number,
        });
      }
      return { success: true, meta: {} };
    }
    throw new Error(`Unhandled query in mock run(): ${sql}`);
  }

  const db = {
    _overrides: overrides,
    _sessions: sessions,
    _audit: audit,
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
          if (sql.includes("FROM override_audit")) {
            const [limit, offset] = stmt.params as [number, number];
            const results = [...audit]
              .sort((a, b) => b.created_at_sec - a.created_at_sec || b.id - a.id)
              .slice(offset, offset + limit);
            return { results: results as unknown as T[] };
          }
          if (sql.includes("FROM patron_overrides")) {
            return { results: Array.from(overrides.values()) as unknown as T[] };
          }
          throw new Error(`Unhandled query in mock all(): ${sql}`);
        },
        async run(): Promise<{ success: boolean; meta: Record<string, unknown> }> {
          return runStatement(sql, stmt.params);
        },
      };
      return stmt;
    },
    async batch(statements: { run: () => Promise<unknown> }[]) {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      return results;
    },
  } as unknown as MockD1Database;

  return { db, overrides, sessions, audit };
}
