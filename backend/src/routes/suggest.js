// GET /suggest?q=<prefix>&ranking=<count|recency>
//
// Returns up to N suggestions that start with the prefix. Two ranking modes:
//   - count   (default / basic):  ORDER BY all-time count DESC
//   - recency (enhanced):         ORDER BY the same balanced, recency-aware score
//        used by /trending:  count * (1 + W / (hours_since_last_search + 1))
// Recency reorders the prefix matches but never hides them (no min-count filter
// here — that eligibility rule applies only to the global Trending list).
// Both modes are cached per-prefix on the consistent-hash ring as separate
// variants, so switching modes can't serve stale cross-mode data.

import { Router } from "express";
import { pool } from "../db.js";
import { config } from "../config.js";
import * as cache from "../services/cache.js";
import { metrics } from "../services/metrics.js";

const router = Router();

// SQL fragment for the chosen ordering. W (recencyWeight) is numeric config, not
// user input, so it is safe to inline. The "query ASC" tie-breaker keeps the order
// stable when two rows have the same count/score.
const ORDER_BY = {
  count: "count DESC, query ASC",
  recency: `(count * (1 + ${config.recencyWeight} / (EXTRACT(EPOCH FROM (NOW() - last_searched)) / 3600.0 + 1))) DESC, query ASC`,
};

router.get("/suggest", async (req, res) => {
  const raw = (req.query.q ?? "").toString();
  const prefix = raw.trim().toLowerCase();

  // Ranking mode — anything other than "recency" falls back to the basic "count".
  const ranking = req.query.ranking === "recency" ? "recency" : "count";

  // Handle empty input — nothing to suggest.
  if (prefix.length === 0) {
    return res.json({ prefix: "", ranking, suggestions: [], cached: false });
  }

  // Try the cache first (per ranking variant).
  const cached = await cache.get(prefix, ranking);
  if (cached) {
    return res.json({ prefix, ranking, suggestions: cached, cached: true });
  }

  // Cache miss — read from PostgreSQL. text_pattern_ops index speeds the prefix scan.
  // Escape LIKE wildcards (% and _) so a literal % or _ typed by the user is matched
  // as a normal character instead of acting as a pattern.
  const likePattern = prefix.replace(/([\\%_])/g, "\\$1") + "%";
  try {
    metrics.recordDbRead();
    const { rows } = await pool.query(
      `SELECT query
       FROM search_queries
       WHERE query LIKE $1 ESCAPE '\\'
       ORDER BY ${ORDER_BY[ranking]}
       LIMIT $2`,
      [likePattern, config.maxSuggestions]
    );
    const suggestions = rows.map((r) => r.query);

    // Cache even empty results so repeated no-match prefixes don't hit the DB.
    await cache.set(prefix, suggestions, ranking);

    return res.json({ prefix, ranking, suggestions, cached: false });
  } catch (err) {
    console.error("/suggest error:", err.message);
    return res.status(500).json({ error: "Failed to fetch suggestions" });
  }
});

export default router;
