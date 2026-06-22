// GET /metrics
// Cache + write metrics, plus the current batch-buffer contents so the dashboard
// can show pending (un-flushed) searches.

import { Router } from "express";
import { metrics } from "../services/metrics.js";
import * as latency from "../services/latency.js";
import * as batchBuffer from "../services/batchBuffer.js";
import { config } from "../config.js";

const router = Router();

router.get("/metrics", (_req, res) => {
  const buffered = batchBuffer.snapshot();
  return res.json({
    ...metrics.snapshot(),
    suggestLatency: latency.stats(), // { count, avgMs, p50Ms, p95Ms, p99Ms, maxMs }
    pendingWrites: Object.keys(buffered).length,
    buffer: buffered,
    flushIntervalSeconds: config.flushIntervalSeconds,
  });
});

export default router;
