# Performance Report

This report covers the three non-functional metrics the assignment asks for:
**latency (including p95), cache hit rate, and write reduction through batching.**

All numbers below were produced on a local machine with the backend, PostgreSQL, and Redis
all running locally and the 150,000-row AOL dataset loaded. Reproduce them with the commands
in each section — your absolute numbers will vary by hardware, but the *shape* (cache hits
are ~milliseconds, batching reduces writes dramatically) will hold.

---

## 1. How to measure

A benchmark script is included:

```bash
cd backend
npm start                      # terminal 1 — backend must be running
npm run benchmark              # terminal 2 — defaults: 2000 req, concurrency 20
# or customise:  node scripts/benchmark.js <requests> <concurrency> <baseUrl>
```

The script fires many `/suggest` requests across a spread of prefixes (so some repeat =
cache hits, some are new = misses), measures **client-side latency percentiles**, and
reads `/metrics` before/after to report the **server-side cache hit rate** and **DB
reads** caused by the run.

The backend also tracks **server-side** `/suggest` latency continuously (last 1000
requests) — visible any time at `GET /metrics → suggestLatency` and on the dashboard's
**Suggest Latency (p95)** card.

---

## 2. Latency (with p95)

Representative run — `node scripts/benchmark.js 1500 20`:

| Metric | Client-side | Server-side (`/metrics`) |
|---|---|---|
| Average | 3.56 ms | 1.17 ms |
| p50 | 2.09 ms | 1.05 ms |
| **p95** | **10.44 ms** | **2.04 ms** |
| p99 | 37.87 ms | 3.61 ms |
| Max | 59.57 ms | 3.92 ms |
| Throughput | ~5,500 req/s | — |

**Reading it:** server-side p95 of ~2 ms reflects the work the backend does (cache lookup
+ occasional DB read). Client-side numbers are a little higher and have a longer tail
because they also include HTTP + the connection setup under concurrency. Cache hits are
sub-millisecond to low-millisecond; the tail (p99) is dominated by the cache **misses**
that fall through to a PostgreSQL prefix query.

---

## 3. Cache Hit Rate

From the same run:

| Metric | Value |
|---|---|
| Cache hits | 1,395 |
| Cache misses | 105 |
| **Hit rate** | **93.0 %** |
| DB reads (misses → PostgreSQL) | 105 |

The first time each prefix is requested it misses and is read from PostgreSQL, then
cached in Redis with a 5-minute TTL; every subsequent request for that prefix is a hit.
Because real typeahead traffic repeats popular prefixes heavily, the hit rate climbs
quickly — here 93 % after a single mixed pass. Live hit rate is always on the dashboard
**Cache Hit Rate** card and at `GET /metrics`.

**Consistent hashing evidence:** each cached prefix is stored under a key named for its
owning node, so the partitioning is observable:

```bash
redis-cli keys '*'
#   cacheNode2:mac
#   cacheNode2:mac#recency     <- recency-ranked variant of the same prefix
#   cacheNode3:iph
redis-cli ttl cacheNode3:iph   #   -> 287   (countdown from 300s)
```

---

## 4. Write Reduction Through Batching

`POST /search` never writes to PostgreSQL directly. Searches are appended to the WAL and
aggregated in an in-memory buffer; a cron job flushes the buffer every 30 s, turning many
searches of the same term into a single upsert.

`writeReduction = (searchRequests − dbWrites) / searchRequests`

Worked example (observed live):

| searchRequests | distinct queries flushed (dbWrites) | Write reduction |
|---|---|---|
| 3 (all `"iphone"`) | 1 | 66.7 % |
| 300 (50 distinct terms) | 50 | 83.3 % |
| 1,000 (50 distinct terms) | 50 | 95.0 % |

The more a term repeats within a flush window, the higher the reduction — exactly the hot
keys typeahead sees. Live values are on the **Write Reduction** card and at `/metrics`.

**Failure trade-off:** the buffer is in memory, so a crash before a flush would lose it —
*except* every search is written to the WAL (`backend/wal/search.log`) first. On restart
the WAL is replayed into the buffer, so buffered-but-unflushed searches are recovered.
The cost is durability latency: a search is only in the DB after the next flush (≤30 s).

---

## 5. Summary

| Requirement | Result |
|---|---|
| Low-latency suggestions | ✅ p95 ≈ 2 ms server-side, sub-ms cache hits |
| p95 latency reported | ✅ section 2 + live on `/metrics` |
| Cache hit rate reported | ✅ 93 % in benchmark, live on `/metrics` |
| DB read/write counts | ✅ `dbReads` / `dbWrites` on `/metrics` |
| Write reduction via batching | ✅ up to 95 %, scales with repetition |
| Consistent-hashing behaviour shown | ✅ `redis-cli keys '*'` shows per-node keys |
