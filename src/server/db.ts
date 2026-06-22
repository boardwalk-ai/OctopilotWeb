import { Pool } from "pg";

/**
 * Direct Postgres access for Save Deck features. The Next.js app runs ON the VPS
 * alongside Postgres (127.0.0.1:5432), so it connects locally via DATABASE_URL —
 * set in the service environment on the server, never committed.
 *
 * A single pool is reused across hot reloads in dev via a global.
 */
const globalForPg = globalThis as unknown as { __octopilotPgPool?: Pool };

export function getPool(): Pool {
    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is not set — Save Deck DB access is unavailable.");
    }
    if (!globalForPg.__octopilotPgPool) {
        globalForPg.__octopilotPgPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            max: 5,
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 5_000,
        });
    }
    return globalForPg.__octopilotPgPool;
}

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
): Promise<T[]> {
    const res = await getPool().query(text, params);
    return res.rows as T[];
}

export async function withTransaction<T>(fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
    const client = await getPool().connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    } catch (e) {
        await client.query("ROLLBACK");
        throw e;
    } finally {
        client.release();
    }
}
