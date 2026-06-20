// GET /cache/debug?prefix=<prefix>
// Shows which simulated cache node owns a prefix and whether it is currently
// cached. Also returns the ring layout and a snapshot of every node's contents
// so the UI can visualise the distributed cache.

import { Router } from "express";
import * as cache from "../services/cache.js";
import { ringInfo } from "../services/consistentHash.js";

const router = Router();

router.get("/cache/debug", (req, res) => {
  const prefix = (req.query.prefix ?? "").toString().trim().toLowerCase();

  // The core answer the assignment asks for: prefix -> node + hit status.
  let lookup = null;
  if (prefix.length > 0) {
    const { node, cacheHit } = cache.peek(prefix);
    lookup = { prefix, node, cacheHit };
  }

  return res.json({
    ...(lookup || {}),
    ring: ringInfo(),
    contents: cache.inspect(),
  });
});

export default router;
