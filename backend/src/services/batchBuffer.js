// In-memory write buffer + periodic flush.
//
// POST /search does NOT write to PostgreSQL directly. Instead it bumps a counter
// in this buffer (e.g. { "iphone": 5, "java tutorial": 3 }). Every 30 seconds the
// buffer is flushed: each distinct query becomes a single upsert, dramatically
// reducing write load when the same query is searched many times.

import { pool } from "../db.js";
import { metrics } from "./metrics.js";
import * as wal from "./wal.js";

// query -> { delta, lastSearched }
const buffer = new Map();

// Normal path: a live search. WAL is appended by the route before calling this.
export function add(query) {
  bump(query);
}

// Recovery path: replay a query from the WAL without re-appending it.
export function addRecovered(query) {
  bump(query);
}

function bump(query) {
  const existing = buffer.get(query);
  if (existing) {
    existing.delta += 1;
    existing.lastSearched = new Date();
  } else {
    buffer.set(query, { delta: 1, lastSearched: new Date() });
  }
}

// Snapshot of the buffer for debugging / display.
export function snapshot() {
  const out = {};
  for (const [query, v] of buffer.entries()) out[query] = v.delta;
  return out;
}

// Flush the buffer to PostgreSQL. One upsert per distinct query. On success the
// buffer is cleared and the WAL is truncated (those writes are now durable in DB).
export async function flush() {
  if (buffer.size === 0) return { written: 0 };

  // Copy then clear so searches arriving mid-flush land in a fresh buffer.
  const entries = [...buffer.entries()];
  buffer.clear();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const [query, { delta, lastSearched }] of entries) {
      await client.query(
        `INSERT INTO search_queries (query, count, last_searched)
         VALUES ($1, $2, $3)
         ON CONFLICT (query)
         DO UPDATE SET count = search_queries.count + EXCLUDED.count,
                       last_searched = EXCLUDED.last_searched`,
        [query, delta, lastSearched]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    // Put the entries back so the next flush retries them. WAL is untouched, so
    // they are still recoverable on crash too.
    for (const [query, v] of entries) {
      const cur = buffer.get(query);
      if (cur) cur.delta += v.delta;
      else buffer.set(query, v);
    }
    throw err;
  } finally {
    client.release();
  }

  // These writes are now safely in the database, so the WAL can be reset.
  wal.truncate();
  metrics.recordDbWrites(entries.length);
  return { written: entries.length };
}
