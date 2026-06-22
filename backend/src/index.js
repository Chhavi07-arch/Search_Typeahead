// Server entry point.
// Boot sequence:
//   1. Connect to PostgreSQL and ensure the schema exists.
//   2. Recover the WAL — replay any un-flushed searches into the batch buffer.
//   3. Start the 30s batch-flush scheduler.
//   4. Mount routes and listen.

import express from "express";
import cors from "cors";
import cron from "node-cron";

import { config } from "./config.js";
import { initSchema } from "./db.js";
import { connectRedis } from "./services/redisClient.js";
import * as latency from "./services/latency.js";
import * as wal from "./services/wal.js";
import * as batchBuffer from "./services/batchBuffer.js";

import suggestRoute from "./routes/suggest.js";
import searchRoute from "./routes/search.js";
import trendingRoute from "./routes/trending.js";
import cacheRoute from "./routes/cache.js";
import metricsRoute from "./routes/metrics.js";
import healthRoute from "./routes/health.js";

const app = express();
app.use(cors());
app.use(express.json());

// Measure /suggest latency (the latency-sensitive read path) for /metrics + reports.
app.use((req, res, next) => {
  if (req.path === "/suggest") {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      latency.record(ms);
    });
  }
  next();
});

// Mount all routes at the root.
app.use(suggestRoute);
app.use(searchRoute);
app.use(trendingRoute);
app.use(cacheRoute);
app.use(metricsRoute);
app.use(healthRoute);

async function start() {
  // 1. Schema.
  await initSchema();
  console.log("[startup] database schema ready");

  // 1b. Connect to Redis (the cache store). Non-fatal if unavailable.
  await connectRedis();

  // 2. WAL recovery — rebuild the buffer from any log left by a previous crash.
  const recovered = await wal.recover();
  if (recovered > 0) {
    console.log(`[startup] WAL recovery: replayed ${recovered} buffered search(es)`);
  } else {
    console.log("[startup] WAL recovery: nothing to recover");
  }

  // 3. Batch flush every N seconds. node-cron uses standard cron syntax; we build
  //    a "*/N * * * * *" (6-field, with seconds) expression from the configured interval.
  const interval = config.flushIntervalSeconds;
  cron.schedule(`*/${interval} * * * * *`, async () => {
    try {
      const { written } = await batchBuffer.flush();
      if (written > 0) {
        console.log(`[flush] wrote ${written} aggregated quer(ies) to PostgreSQL`);
      }
    } catch (err) {
      console.error("[flush] failed (will retry next cycle):", err.message);
    }
  });
  console.log(`[startup] batch flush scheduled every ${interval}s`);

  // 4. Listen.
  app.listen(config.port, () => {
    console.log(`[startup] backend listening on http://localhost:${config.port}`);
  });
}

start().catch((err) => {
  console.error("[startup] fatal:", err);
  process.exit(1);
});
