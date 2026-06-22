// Redis client (the cache store).
//
// A single shared connection used by the cache service. If Redis is unavailable
// the app keeps working — the cache layer simply treats every lookup as a miss
// and falls back to PostgreSQL (see cache.js).

import { createClient } from "redis";
import { config } from "../config.js";

export const redis = createClient({ url: config.redisUrl });

// Log errors but don't crash the process if Redis goes away.
redis.on("error", (err) => {
  // Only log occasionally-meaningful errors to avoid spamming on reconnect loops.
  if (redis.isReady) console.error("[redis] error:", err.message);
});

// Connect once at startup. Returns true on success, false if Redis isn't running.
export async function connectRedis() {
  try {
    await redis.connect();
    console.log(`[startup] connected to Redis at ${config.redisUrl}`);
    return true;
  } catch (err) {
    console.error(
      `[startup] Redis not reachable (${err.message}) — cache disabled, serving from PostgreSQL`
    );
    return false;
  }
}
