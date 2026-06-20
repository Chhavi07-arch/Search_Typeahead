// PostgreSQL connection pool + schema bootstrap.
import pg from "pg";
import { config } from "./config.js";

export const pool = new pg.Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
});

// Create the table and prefix index if they do not already exist. Called once at
// startup so a fresh database is ready without a separate migration step.
export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS search_queries (
      id            SERIAL PRIMARY KEY,
      query         TEXT UNIQUE NOT NULL,
      count         BIGINT NOT NULL DEFAULT 0,
      last_searched TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // text_pattern_ops lets a B-tree index accelerate prefix searches (LIKE 'iph%').
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_search_queries_query_prefix
    ON search_queries (query text_pattern_ops);
  `);
}

// Lightweight connectivity probe used by /health.
export async function isDbConnected() {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
