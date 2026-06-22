// Latency + cache-hit benchmark for the /suggest endpoint.
//
//   node scripts/benchmark.js [requests] [concurrency] [baseUrl]
//
// Defaults: 2000 requests, concurrency 20, http://localhost:4000
//
// Fires many /suggest requests across a set of prefixes and reports client-side
// latency percentiles (p50/p95/p99). It also reads /metrics before and after to
// show the server-side cache hit rate and DB read count produced by the run.
// Requires the backend to be running. Uses the global fetch (Node 18+).

const totalRequests = Number(process.argv[2]) || 2000;
const concurrency = Number(process.argv[3]) || 20;
const baseUrl = process.argv[4] || "http://localhost:4000";

// A spread of prefixes so some repeat (cache hits) and some are new (misses).
const prefixes = [
  "a", "ab", "ap", "b", "ba", "c", "ca", "co", "d", "de", "do",
  "e", "f", "fa", "g", "go", "h", "i", "in", "ip", "j", "ja", "jo",
  "k", "l", "la", "lo", "m", "ma", "mo", "n", "o", "p", "pa", "po",
  "q", "r", "re", "s", "sa", "se", "so", "t", "te", "to", "u", "v",
  "w", "wh", "x", "y", "z",
];

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function getMetrics() {
  try {
    const r = await fetch(`${baseUrl}/metrics`);
    return await r.json();
  } catch {
    return null;
  }
}

async function main() {
  // Confirm the server is up.
  const before = await getMetrics();
  if (!before) {
    console.error(`Cannot reach backend at ${baseUrl}. Start it with: npm start`);
    process.exit(1);
  }

  console.log(
    `Benchmarking ${totalRequests} requests, concurrency ${concurrency}, against ${baseUrl}/suggest\n`
  );

  const latencies = [];
  let done = 0;
  let next = 0;

  async function worker() {
    while (next < totalRequests) {
      const i = next++;
      const prefix = prefixes[i % prefixes.length];
      const ranking = i % 5 === 0 ? "recency" : "count"; // exercise both paths
      const start = performance.now();
      try {
        await fetch(`${baseUrl}/suggest?q=${encodeURIComponent(prefix)}&ranking=${ranking}`);
      } catch {
        /* count network errors as a sample so they don't vanish */
      }
      latencies.push(performance.now() - start);
      done++;
    }
  }

  const startWall = performance.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const wallMs = performance.now() - startWall;

  const after = await getMetrics();
  const sorted = latencies.sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  const hits = (after.cacheHits ?? 0) - (before.cacheHits ?? 0);
  const misses = (after.cacheMisses ?? 0) - (before.cacheMisses ?? 0);
  const dbReads = (after.dbReads ?? 0) - (before.dbReads ?? 0);
  const lookups = hits + misses;
  const hitRate = lookups === 0 ? 0 : (hits / lookups) * 100;

  console.log("=== Client-side latency (ms) ===");
  console.log(`  requests : ${done}`);
  console.log(`  avg      : ${(sum / sorted.length).toFixed(2)}`);
  console.log(`  p50      : ${percentile(sorted, 50).toFixed(2)}`);
  console.log(`  p95      : ${percentile(sorted, 95).toFixed(2)}`);
  console.log(`  p99      : ${percentile(sorted, 99).toFixed(2)}`);
  console.log(`  max      : ${sorted[sorted.length - 1].toFixed(2)}`);
  console.log(`  throughput: ${(done / (wallMs / 1000)).toFixed(0)} req/s\n`);

  console.log("=== Cache behaviour during this run ===");
  console.log(`  cache hits   : ${hits}`);
  console.log(`  cache misses : ${misses}`);
  console.log(`  hit rate     : ${hitRate.toFixed(2)}%`);
  console.log(`  DB reads     : ${dbReads}`);
  console.log("\n(Server-side p95 is also visible at GET /metrics -> suggestLatency.)");
}

main();
