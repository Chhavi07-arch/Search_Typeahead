// Central configuration. Reads from environment (.env) with safe defaults so the
// project runs out of the box. Keeping all tunables here makes them easy to explain.
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT) || 4000,

  // PostgreSQL — the `pg` driver also reads PG* env vars directly, but we pass
  // them explicitly so the values are obvious.
  db: {
    host: process.env.PGHOST || "localhost",
    port: Number(process.env.PGPORT) || 5432,
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "postgres",
    database: process.env.PGDATABASE || "typeahead",
  },

  // Redis connection URL (the cache store). Defaults to a local Redis server.
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",

  // Cache TTL — how long a cached suggestion list stays fresh (default 5 min).
  cacheTtlMs: Number(process.env.CACHE_TTL_MS) || 5 * 60 * 1000,

  // Batch flush cadence in seconds (default 30s).
  flushIntervalSeconds: Number(process.env.FLUSH_INTERVAL_SECONDS) || 30,

  // Maximum suggestions returned by /suggest.
  maxSuggestions: Number(process.env.MAX_SUGGESTIONS) || 10,

  // Trending / recency-aware ranking tunables.
  // recencyWeight (W): a freshly searched query is boosted up to (1 + W)x its count,
  //   decaying back to 1x (its raw count) as it ages.
  // trendingMinCount: a query must have at least this many searches to be eligible
  //   for the Trending list — this stops one-off searches from dominating.
  recencyWeight: Number(process.env.RECENCY_WEIGHT) || 3,
  trendingMinCount: Number(process.env.TRENDING_MIN_COUNT) || 5,

  // The three simulated cache nodes that sit on the consistent-hash ring.
  cacheNodes: ["cacheNode1", "cacheNode2", "cacheNode3"],

  // Absolute path to the Write-Ahead Log file.
  walPath: path.join(__dirname, "..", "wal", "search.log"),
};
