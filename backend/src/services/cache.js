// Distributed cache simulation.
//
// Three independent caches (one per simulated node), each a plain JS Map. The
// consistent-hash ring decides which node owns a given prefix, so the same prefix
// always lands on the same node. Entries expire after a TTL (default 5 min).

import { config } from "../config.js";
import { getNode } from "./consistentHash.js";
import { metrics } from "./metrics.js";

// nodeName -> Map<prefix, { suggestions, createdAt }>
const stores = {};
for (const node of config.cacheNodes) stores[node] = new Map();

function isExpired(entry) {
  return Date.now() - entry.createdAt > config.cacheTtlMs;
}

// Look up a prefix. Records a hit/miss in metrics. Expired entries are treated as
// a miss and evicted. Returns the suggestions array on hit, or null on miss.
export function get(prefix) {
  const node = getNode(prefix);
  const store = stores[node];
  const entry = store.get(prefix);

  if (!entry) {
    metrics.recordCacheMiss();
    return null;
  }
  if (isExpired(entry)) {
    store.delete(prefix);
    metrics.recordCacheMiss();
    return null;
  }

  metrics.recordCacheHit();
  return entry.suggestions;
}

// Store suggestions for a prefix on its owning node.
export function set(prefix, suggestions) {
  const node = getNode(prefix);
  stores[node].set(prefix, { suggestions, createdAt: Date.now() });
}

// Check presence without affecting metrics (used by /cache/debug).
export function peek(prefix) {
  const node = getNode(prefix);
  const entry = stores[node].get(prefix);
  const cacheHit = !!entry && !isExpired(entry);
  return { node, cacheHit };
}

// Snapshot of every node's contents for the debug endpoint / cache panel.
export function inspect() {
  const nodes = {};
  for (const node of config.cacheNodes) {
    const store = stores[node];
    const keys = [];
    for (const [prefix, entry] of store.entries()) {
      if (!isExpired(entry)) {
        keys.push({ prefix, ageMs: Date.now() - entry.createdAt });
      }
    }
    nodes[node] = { size: keys.length, keys };
  }
  return { ttlMs: config.cacheTtlMs, nodes };
}
