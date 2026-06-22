// Latency tracker for the /suggest endpoint.
//
// Keeps the most recent N response times in a ring buffer and computes summary
// statistics (average, p50, p95, p99) on demand. This powers the latency numbers
// in /metrics and the performance report. Bounded memory — only the last N
// samples are retained.

const MAX_SAMPLES = 1000;
const samples = [];

// Record one latency measurement in milliseconds.
export function record(ms) {
  samples.push(ms);
  if (samples.length > MAX_SAMPLES) samples.shift();
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

// Summary over the retained samples. All values in milliseconds, rounded.
export function stats() {
  if (samples.length === 0) {
    return { count: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count: sorted.length,
    avgMs: Number((sum / sorted.length).toFixed(2)),
    p50Ms: Number(percentile(sorted, 50).toFixed(2)),
    p95Ms: Number(percentile(sorted, 95).toFixed(2)),
    p99Ms: Number(percentile(sorted, 99).toFixed(2)),
    maxMs: Number(sorted[sorted.length - 1].toFixed(2)),
  };
}
