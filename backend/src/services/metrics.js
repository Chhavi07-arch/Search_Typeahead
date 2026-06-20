// Simple in-memory metrics counters. All endpoints/services update these and
// /metrics reads them. Derived percentages are computed on read.

const counters = {
  cacheHits: 0,
  cacheMisses: 0,
  searchRequests: 0, // every POST /search
  dbWrites: 0,       // one per query row actually written during a flush
};

export const metrics = {
  recordCacheHit() {
    counters.cacheHits += 1;
  },
  recordCacheMiss() {
    counters.cacheMisses += 1;
  },
  recordSearchRequest() {
    counters.searchRequests += 1;
  },
  // Called by the batch buffer after a flush with the number of rows written.
  recordDbWrites(n) {
    counters.dbWrites += n;
  },

  snapshot() {
    const lookups = counters.cacheHits + counters.cacheMisses;
    const cacheHitRate = lookups === 0 ? 0 : (counters.cacheHits / lookups) * 100;

    // Write reduction = how many search requests we avoided turning into individual
    // DB writes thanks to batching. 0 requests -> 0% reduction.
    const writeReduction =
      counters.searchRequests === 0
        ? 0
        : ((counters.searchRequests - counters.dbWrites) / counters.searchRequests) * 100;

    return {
      cacheHits: counters.cacheHits,
      cacheMisses: counters.cacheMisses,
      cacheHitRate: Number(cacheHitRate.toFixed(2)),
      searchRequests: counters.searchRequests,
      dbWrites: counters.dbWrites,
      writeReduction: Number(Math.max(0, writeReduction).toFixed(2)),
    };
  },
};
