import { Pool, types, type PoolClient } from "pg";

/**
 * A small D1-style facade over Supabase Postgres, so the event store's
 * `prepare().bind().first/all/run` and `batch([...])` calls stay unchanged.
 *
 * The event store writes SQLite-flavoured SQL; two rewrites make it valid Postgres:
 * - `?` placeholders become `$1, $2, …`
 * - camelCase aliases (`AS teamId`) are quoted, because Postgres folds unquoted identifiers to lower case.
 * The SQL must not contain a literal `?` inside a string.
 *
 * node-postgres sends each parameterised query as one Parse/Bind/Execute/Sync write, which is what
 * Supabase's transaction pooler (port 6543) expects. (postgres.js with `prepare: false` describes first
 * and waits between writes, which the pooler can strand until the statement timeout.)
 */
export type QueryResult<T = Record<string, unknown>> = { results: T[]; meta: { changes: number } };

type Client = Pool | PoolClient;
type Param = string | number | null;

// COUNT(*) and SUM() return bigint; the event store expects plain numbers.
types.setTypeParser(20, Number);

function toPostgres(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`).replace(/\bAS\s+([a-z]\w*[A-Z]\w*)/g, 'AS "$1"');
}

async function execute<T>(client: Client, text: string, args: Param[]): Promise<QueryResult<T>> {
  const result = await client.query(text, args);
  return { results: result.rows as T[], meta: { changes: result.rowCount ?? 0 } };
}

export class PreparedStatement {
  constructor(private readonly pool: Pool, readonly text: string, readonly args: Param[] = []) {}

  bind(...args: unknown[]) {
    return new PreparedStatement(this.pool, this.text, args.map((arg) => (arg === undefined ? null : arg)) as Param[]);
  }

  /** Runs this statement on `client`, which is the pool or a transaction's connection. */
  runOn<T>(client: Client) {
    return execute<T>(client, this.text, this.args);
  }

  all<T = Record<string, unknown>>() {
    return this.runOn<T>(this.pool);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return (await this.all<T>()).results[0] ?? null;
  }

  run() {
    return this.all();
  }
}

export class Database {
  constructor(private readonly pool: Pool) {}

  prepare(text: string) {
    return new PreparedStatement(this.pool, toPostgres(text));
  }

  /** Runs every statement in one transaction, like D1's batch. */
  async batch(statements: PreparedStatement[]): Promise<QueryResult[]> {
    if (!statements.length) return [];
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const results: QueryResult[] = [];
      for (const statement of statements) results.push(await statement.runOn(client));
      await client.query("COMMIT");
      return results;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}

let shared: Database | null = null;

export function connect(): Database {
  if (shared) return shared;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Event storage is unavailable.");
  const pool = new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 20_000,
    // Supabase requires TLS; its pooler certificate is not in Node's default CA store.
    ssl: { rejectUnauthorized: false },
  });
  // An idle client dropped by the pooler must not crash the server.
  pool.on("error", () => {});
  shared = new Database(pool);
  return shared;
}
