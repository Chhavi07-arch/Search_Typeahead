// POST /search  { "query": "iphone" }
// Records a search. Goes through the WAL + batch buffer — it does NOT hit the
// database directly. The 30s flush persists the aggregated counts.

import { Router } from "express";
import * as wal from "../services/wal.js";
import * as batchBuffer from "../services/batchBuffer.js";
import { metrics } from "../services/metrics.js";

const router = Router();

router.post("/search", (req, res) => {
  const raw = (req.body?.query ?? "").toString();
  const query = raw.trim().toLowerCase();

  if (query.length === 0) {
    return res.status(400).json({ error: "query is required" });
  }

  // 1) Durability first: append to the WAL before touching the buffer.
  wal.append(query);

  // 2) Aggregate in memory (flushed to DB every 30s).
  batchBuffer.add(query);

  // 3) Metrics.
  metrics.recordSearchRequest();

  return res.json({ message: "Searched" });
});

export default router;
