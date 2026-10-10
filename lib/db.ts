import { createClient, type Client, type InArgs, type InStatement, type ResultSet } from "@libsql/client";

/**
 * A small D1-compatible facade over Turso/libSQL, so the event store's existing
 * `prepare().bind().first/all/run` and `batch([...])` calls run unchanged on Vercel.
 */
export type QueryResult<T = Record<string, unknown>> = { results: T[]; meta: { changes: number } };

export class PreparedStatement {
  constructor(private readonly client: Client, readonly sql: string, readonly args: InArgs = []) {}

  bind(...args: unknown[]) {
    return new PreparedStatement(this.client, this.sql, args as InArgs);
  }

  toStatement(): InStatement {
    return { sql: this.sql, args: this.args };
  }

  async all<T = Record<string, unknown>>(): Promise<QueryResult<T>> {
    return toResult<T>(await this.client.execute(this.toStatement()));
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return (await this.all<T>()).results[0] ?? null;
  }

  async run() {
    return this.all();
  }
}

export class Database {
  constructor(private readonly client: Client) {}

  prepare(sql: string) {
    return new PreparedStatement(this.client, sql);
  }

  /** Runs every statement in one write transaction, like D1's batch. */
  async batch(statements: PreparedStatement[]) {
    if (!statements.length) return [];
    const results = await this.client.batch(statements.map((statement) => statement.toStatement()), "write");
    return results.map((result) => toResult(result));
  }
}

function toResult<T>(result: ResultSet): QueryResult<T> {
  // libSQL rows are array-like; copy named columns into plain objects so `AS camelCase` aliases work as before.
  const results = result.rows.map((row) => Object.fromEntries(result.columns.map((column) => [column, row[column]])) as T);
  return { results, meta: { changes: result.rowsAffected } };
}

let shared: Database | null = null;

export function connect(): Database {
  if (shared) return shared;
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("Event storage is unavailable.");
  shared = new Database(createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN, intMode: "number" }));
  return shared;
}
