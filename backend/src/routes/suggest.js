// GET /suggest?q=<prefix>
// Returns up to N suggestions that start with the prefix, ordered by popularity.
// Results are cached per-prefix on the consistent-hash ring.

import { Router } from "express";
import { pool } from "../db.js";
import { config } from "../config.js";
import * as cache from "../services/cache.js";

const router = Router();

router.get("/suggest", async (req, res) => {
  const raw = (req.query.q ?? "").toString();
  const prefix = raw.trim().toLowerCase();

  // Handle empty input — nothing to suggest.
  if (prefix.length === 0) {
    return res.json({ prefix: "", suggestions: [], cached: false });
  }

  // Try the cache first.
  const cached = cache.get(prefix);
  if (cached) {
    return res.json({ prefix, suggestions: cached, cached: true });
  }

  // Cache miss — query PostgreSQL. text_pattern_ops index makes this prefix scan fast.
  try {
    const { rows } = await pool.query(
      `SELECT query
       FROM search_queries
       WHERE query LIKE $1
       ORDER BY count DESC
       LIMIT $2`,
      [prefix + "%", config.maxSuggestions]
    );
    const suggestions = rows.map((r) => r.query);

    // Cache even empty results so repeated no-match prefixes don't hit the DB.
    cache.set(prefix, suggestions);

    return res.json({ prefix, suggestions, cached: false });
  } catch (err) {
    console.error("/suggest error:", err.message);
    return res.status(500).json({ error: "Failed to fetch suggestions" });
  }
});

export default router;
