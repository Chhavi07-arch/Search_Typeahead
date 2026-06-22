// Cache layer — backed by Redis, partitioned with consistent hashing.
//
// Consistent hashing still decides which of the 3 logical cache nodes owns a
// prefix (great for the viva), but the data now lives in a real Redis server
// instead of in-memory Maps. The node name becomes part of the Redis key, e.g.
//   cacheNode2:iph -> { suggestions: [...], createdAt: 169... }
// Redis handles TTL natively via SET ... EX, so there is no manual expiry check.
//
// If Redis is down, every call degrades gracefully to a miss / no-op so the API
// keeps serving suggestions straight from PostgreSQL.

import { config } from "../config.js";
import { getNode } from "./consistentHash.js";
import { metrics } from "./metrics.js";
import { redis } from "./redisClient.js";

const ttlSeconds = Math.max(1, Math.floor(config.cacheTtlMs / 1000));

// Redis key = "<owningNode>:<prefix>" for the default (count) ranking, and
// "<owningNode>:<prefix>#recency" for the recency-aware ranking. The node is
// always chosen by the prefix alone, so consistent-hash ownership of a prefix is
// stable regardless of ranking — the ranking is just a separate cached variant.
// The node prefix is what makes the partitioning visible in /cache/debug.
function keyFor(prefix, ranking = "count") {
  const base = `${getNode(prefix)}:${prefix}`;
  return ranking === "recency" ? `${base}#recency` : base;
}

// Look up a prefix (for a given ranking). Records a hit/miss in metrics. Returns
// the suggestions array on hit, or null on miss (incl. when Redis is unavailable).
export async function get(prefix, ranking = "count") {
  if (!redis.isReady) {
    metrics.recordCacheMiss();
    return null;
  }
  try {
    const raw = await redis.get(keyFor(prefix, ranking));
    if (!raw) {
      metrics.recordCacheMiss();
      return null;
    }
    metrics.recordCacheHit();
    return JSON.parse(raw).suggestions;
  } catch {
    metrics.recordCacheMiss();
    return null;
  }
}

// Store suggestions for a prefix+ranking on its owning node, with a TTL.
export async function set(prefix, suggestions, ranking = "count") {
  if (!redis.isReady) return;
  try {
    const value = JSON.stringify({ suggestions, createdAt: Date.now() });
    await redis.set(keyFor(prefix, ranking), value, { EX: ttlSeconds });
  } catch {
    /* ignore cache write failures — DB is the source of truth */
  }
}

// Check presence without affecting metrics (used by /cache/debug).
export async function peek(prefix, ranking = "count") {
  const node = getNode(prefix);
  let cacheHit = false;
  if (redis.isReady) {
    try {
      cacheHit = (await redis.exists(keyFor(prefix, ranking))) === 1;
    } catch {
      cacheHit = false;
    }
  }
  return { node, cacheHit };
}

// SCAN all keys matching a pattern (cursor loop is version-stable across redis clients).
async function scanKeys(pattern) {
  const keys = [];
  let cursor = 0;
  do {
    const res = await redis.scan(cursor, { MATCH: pattern, COUNT: 100 });
    cursor = res.cursor;
    keys.push(...res.keys);
  } while (cursor !== 0);
  return keys;
}

// Snapshot of every node's cached prefixes for the debug endpoint / cache panel.
export async function inspect() {
  const nodes = {};
  for (const node of config.cacheNodes) nodes[node] = { size: 0, keys: [] };

  if (redis.isReady) {
    try {
      for (const node of config.cacheNodes) {
        const keys = await scanKeys(`${node}:*`);
        for (const key of keys) {
          const prefix = key.slice(node.length + 1);
          let ageMs = 0;
          try {
            const raw = await redis.get(key);
            if (raw) ageMs = Date.now() - JSON.parse(raw).createdAt;
          } catch {
            /* skip keys we can't read */
          }
          nodes[node].keys.push({ prefix, ageMs });
        }
        nodes[node].size = nodes[node].keys.length;
      }
    } catch {
      /* return whatever we have */
    }
  }

  return { ttlMs: config.cacheTtlMs, nodes };
}
