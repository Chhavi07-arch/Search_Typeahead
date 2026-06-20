// GET /trending
// Returns the top 10 queries by a recency-aware score:
//   score = count + (10000 / (hours_since_last_search + 1))
// A query searched recently gets a large recency boost; as it ages the boost
// decays toward zero and only the raw count remains.

import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

router.get("/trending", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         query,
         count,
         last_searched,
         EXTRACT(EPOCH FROM (NOW() - last_searched)) / 3600.0 AS hours_since,
         count + (10000.0 / (EXTRACT(EPOCH FROM (NOW() - last_searched)) / 3600.0 + 1)) AS score
       FROM search_queries
       ORDER BY score DESC
       LIMIT 10`
    );

    const trending = rows.map((r) => ({
      query: r.query,
      count: Number(r.count),
      lastSearched: r.last_searched,
      hoursSinceLastSearch: Number(Number(r.hours_since).toFixed(2)),
      score: Number(Number(r.score).toFixed(2)),
    }));

    return res.json({ trending });
  } catch (err) {
    console.error("/trending error:", err.message);
    return res.status(500).json({ error: "Failed to fetch trending searches" });
  }
});

export default router;
