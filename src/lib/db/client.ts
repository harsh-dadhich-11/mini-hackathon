import "server-only";
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

/** A dropped or timed-out connection (e.g. a Vercel instance thawing with a stale socket), not a SQL error. */
function isConnectionError(error: unknown) {
  const code = (error as { code?: string } | null)?.code ?? "";
  const message = error instanceof Error ? error.message : "";
  return ["ECONNRESET", "EPIPE", "ETIMEDOUT", "ECONNREFUSED", "57P01"].includes(code)
    || /Connection terminated|connection error|timeout exceeded|Query read timeout|socket hang up/i.test(message);
}

/** Plain reads can safely run twice; anything that writes or locks never retries. */
const READ_ONLY = /^\s*SELECT\b(?![\s\S]*\bFOR\s+(UPDATE|SHARE)\b)/i;

export class PreparedStatement {
  constructor(private readonly pool: Pool, readonly text: string, readonly args: Param[] = []) {}

  bind(...args: unknown[]) {
    return new PreparedStatement(this.pool, this.text, args.map((arg) => (arg === undefined ? null : arg)) as Param[]);
  }

  /** Runs this statement on `client`, which is the pool or a transaction's connection. */
  runOn<T>(client: Client) {
    return execute<T>(client, this.text, this.args);
  }

  async all<T = Record<string, unknown>>() {
    try {
      return await this.runOn<T>(this.pool);
    } catch (error) {
      // One retry for a read that hit a dead pooled connection; the pool hands out a fresh one.
      if (!READ_ONLY.test(this.text) || !isConnectionError(error)) throw error;
      return this.runOn<T>(this.pool);
    }
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
    return this.transaction(async (tx) => {
      const results: QueryResult[] = [];
      for (const statement of statements) results.push(await tx.run(statement));
      return results;
    });
  }

  /**
   * Runs `work` in one transaction on one connection, for read-then-write steps that must not interleave
   * with another request (lock rows with `SELECT … FOR UPDATE` or `pg_advisory_xact_lock`).
   */
  async transaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    // A checked-out client has no pool error listener: without this, a socket dropping mid-transaction would
    // crash the whole server instance.
    const onError = () => {};
    client.on("error", onError);
    let broken: Error | undefined;
    try {
      await client.query("BEGIN");
      const result = await work(new Transaction(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch((rollbackError: Error) => { broken = rollbackError; });
      if (isConnectionError(error)) broken = error as Error;
      throw error;
    } finally {
      client.off("error", onError);
      // A broken connection is destroyed instead of going back into the pool.
      client.release(broken);
    }
  }
}

export class Transaction {
  constructor(private readonly client: PoolClient) {}

  run<T = Record<string, unknown>>(statement: PreparedStatement) {
    return statement.runOn<T>(this.client);
  }

  async first<T = Record<string, unknown>>(statement: PreparedStatement): Promise<T | null> {
    return (await this.run<T>(statement)).results[0] ?? null;
  }
}

let shared: Database | null = null;

/** The shared database for this server instance. */
export function database(): Database {
  if (shared) return shared;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Event storage is unavailable.");
  // Supabase requires TLS. With DATABASE_CA_CERT (Supabase → Database → SSL certificate) the server's certificate
  // is verified; without it the connection is still encrypted, but not checked against Supabase's CA.
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");
  const pool = new Pool({
    connectionString: url,
    max: 8,
    idleTimeoutMillis: 10_000,
    // Nothing waits for ever: a stalled pooler fails fast and the next poll tries again.
    connectionTimeoutMillis: 4_000,
    query_timeout: 8_000,
    ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
  });
  // An idle client dropped by the pooler must not crash the server.
  pool.on("error", () => {});
  shared = new Database(pool);
  return shared;
}
