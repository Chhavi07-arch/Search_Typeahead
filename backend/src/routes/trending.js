// GET /trending
// Returns the top 10 queries by a balanced, recency-aware score:
//
//   score = count * (1 + W / (hours_since_last_search + 1))      // W = recencyWeight
//
// Recency MULTIPLIES popularity rather than replacing it: a freshly searched query
// is boosted up to (1 + W)x its count, decaying back to 1x (its raw count) as it
// ages. This keeps genuinely popular/rising queries on top while still letting a
// recently active query climb.
//
// Eligibility: a query must have count >= trendingMinCount to appear, so a one-off
// search (count = 1) cannot dominate the list.

import { Router } from "express";
import { pool } from "../db.js";
import { config } from "../config.js";

const router = Router();

// recencyWeight / trendingMinCount come from config (numeric, not user input).
const W = config.recencyWeight;
const MIN = config.trendingMinCount;

router.get("/trending", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         query,
         count,
         last_searched,
         EXTRACT(EPOCH FROM (NOW() - last_searched)) / 3600.0 AS hours_since,
         count * (1 + ${W} / (EXTRACT(EPOCH FROM (NOW() - last_searched)) / 3600.0 + 1)) AS score
       FROM search_queries
       WHERE count >= $1
       ORDER BY score DESC, query ASC
       LIMIT 10`,
      [MIN]
    );

    const trending = rows.map((r) => ({
      query: r.query,
      count: Number(r.count),
      lastSearched: r.last_searched,
      hoursSinceLastSearch: Number(Number(r.hours_since).toFixed(2)),
      score: Number(Number(r.score).toFixed(2)),
    }));

    return res.json({ trending, minCount: MIN, recencyWeight: W });
  } catch (err) {
    console.error("/trending error:", err.message);
    return res.status(500).json({ error: "Failed to fetch trending searches" });
  }
});

export default router;
