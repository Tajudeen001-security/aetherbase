import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL || "postgresql://kotah:kotah_secret@localhost:5432/kotahbase";

export const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  console.error("[DB] Unexpected pool error:", err.message);
});

export async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}


/**
 * Run customer SQL only inside that customer's dedicated schema.
 * The schema name is derived from the immutable project UUID, never user input.
 * No public-schema fallback is allowed, preventing cross-project table access.
 */
export async function queryProject(projectId: string, sql: string, params?: any[]) {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) throw new Error("Invalid project id");
  const schema = `kb_${projectId.replace(/-/g, "").toLowerCase()}`;
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO "${schema}"`);
    return await client.query(sql, params);
  } finally {
    try { await client.query("RESET search_path"); } catch {}
    client.release();
  }
}
