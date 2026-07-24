/**
 * A minimal SQL boundary so the Postgres store works against both the Neon
 * serverless driver (production) and PGlite (in-process Postgres, tests) with no
 * behavioural difference. Transactions run real BEGIN/COMMIT/ROLLBACK.
 */

export interface Sql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
  tx<T>(fn: (sql: Sql) => Promise<T>): Promise<T>;
}

/** Production adapter over @neondatabase/serverless Pool. */
export function neonSql(connectionString: string): Sql {
  // Imported lazily so the pg driver never ends up in a client bundle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pool } = require("@neondatabase/serverless") as typeof import("@neondatabase/serverless");
  const pool = new Pool({ connectionString });

  const wrap = (exec: {
    query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>;
  }): Sql => ({
    async query<T>(text: string, params: unknown[] = []) {
      const r = await exec.query(text, params);
      return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 };
    },
    async tx<T>(fn: (sql: Sql) => Promise<T>) {
      // Nested tx reuses the same connection.
      return fn(wrap(exec));
    },
  });

  return {
    async query<T>(text: string, params: unknown[] = []) {
      const r = await pool.query(text, params);
      return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 };
    },
    async tx<T>(fn: (sql: Sql) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(wrap(client));
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
  };
}
