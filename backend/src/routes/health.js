// GET /health — basic liveness + DB connectivity probe.
import { Router } from "express";
import { isDbConnected } from "../db.js";

const router = Router();

router.get("/health", async (_req, res) => {
  const dbConnected = await isDbConnected();
  return res.json({
    status: dbConnected ? "ok" : "degraded",
    dbConnected,
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

export default router;
