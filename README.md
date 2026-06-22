# Search Typeahead System

A search autocomplete system, similar to what you see on Google or an e-commerce site.
As you type, it suggests popular queries. You can submit a search, see what's trending, and
the whole thing uses a cache so suggestions come back quickly.

This was built as a backend systems project, so most of the interesting work is on the
server side: how query counts are stored, how suggestions are served fast with a cache,
how the cache is split across nodes, and how write load on the database is kept low.

## Features

- **Typeahead suggestions** – type a prefix, get up to 10 matching queries sorted by popularity.
- **Trending searches** – a separate ranking that takes recent activity into account, not just all-time count.
- **Batch writes** – searches are collected in memory and written to the database in batches instead of one write per search.
- **WAL recovery** – every search is written to a log file first, so buffered searches survive a restart.
- **Distributed cache simulation** – three logical cache nodes backed by Redis.
- **Consistent hashing** – decides which cache node owns each prefix.
- **Metrics dashboard** – cache hit rate, latency (including p95), DB reads/writes, and write reduction.

## Architecture

```
React UI  ->  Express backend  ->  Redis cache (3 logical nodes, consistent hashing)
                     |
                     +--> in-memory batch buffer --(flush every 30s)--> PostgreSQL
                     |
                     +--> WAL file (replayed on startup)
```

- **Frontend** – React + Vite + Tailwind. Calls the backend with Axios.
- **Backend** – Node.js + Express. All the logic lives here.
- **Database** – PostgreSQL. One table, `search_queries(query, count, last_searched)`, with a prefix index.
- **Cache** – Redis. Stores suggestion results per prefix with a 5-minute TTL.
- **WAL** – an append-only log file (`backend/wal/search.log`) used to recover buffered searches.
- **Batch buffer** – an in-memory map that aggregates search counts before writing.

There is more detail, including diagrams, in [ARCHITECTURE.md](ARCHITECTURE.md).

## Dataset

**Source:** the [AOL search query dataset](https://www.kaggle.com/datasets/dineshydv/aol-user-search-data)
(real anonymized search logs).

**Why this one:** the project is about *search* queries, so a real set of search queries
fits better than product names or page titles. It's large, it has lots of shared prefixes
(good for testing autocomplete), and the counts can be derived from the data.

**How it's loaded:** the raw AOL files are one row per search *event* (they don't come with
counts), so `prepare:aol` aggregates them — it counts how many times each query appears and
keeps the top 150,000 by frequency. That produces a `query,count` CSV, which `import` loads
into PostgreSQL.

```bash
cd backend
npm run prepare:aol -- data/user-ct-test-collection-02.txt   # raw logs -> data/dataset.csv
npm run import -- --reset                                     # load into PostgreSQL
```

If you don't want to download the AOL files, there's also `npm run generate` which builds a
synthetic 100k-row CSV in the same format.

## APIs

Base URL: `http://localhost:4000`

### GET /suggest?q=&lt;prefix&gt;&ranking=&lt;count|recency&gt;

Up to 10 suggestions starting with the prefix. `ranking=count` (default) sorts by all-time
count; `ranking=recency` sorts by the recency-aware score.

```bash
curl "http://localhost:4000/suggest?q=goo"
```
```json
{ "prefix": "goo", "ranking": "count",
  "suggestions": ["google", "google.com", "google earth"], "cached": false }
```

### POST /search

Records a search. Returns a dummy response; the count is updated through the batch buffer,
not written immediately.

```bash
curl -X POST http://localhost:4000/search -H "Content-Type: application/json" -d '{"query":"google"}'
```
```json
{ "message": "Searched" }
```

### GET /trending

Top 10 queries by the recency-aware score, excluding queries that haven't been searched
enough times yet.

```json
{ "minCount": 5, "recencyWeight": 3,
  "trending": [ { "query": "google", "count": 32396, "hoursSinceLastSearch": 0.5, "score": 97188.0 } ] }
```

### GET /cache/debug?prefix=&lt;prefix&gt;

Shows which cache node owns a prefix and whether it's currently cached.

```json
{ "prefix": "goo", "node": "cacheNode3", "cacheHit": true,
  "ring": { "nodes": ["cacheNode1","cacheNode2","cacheNode3"], "virtualNodesPerNode": 50, "totalPoints": 150 },
  "contents": { "ttlMs": 300000, "nodes": { "cacheNode1": { "size": 0, "keys": [] } } } }
```

### GET /metrics

```json
{ "cacheHits": 12, "cacheMisses": 4, "cacheHitRate": 75.0,
  "searchRequests": 40, "dbWrites": 6, "dbReads": 4, "writeReduction": 85.0,
  "suggestLatency": { "count": 1000, "avgMs": 1.17, "p50Ms": 1.05, "p95Ms": 2.04 },
  "pendingWrites": 2, "flushIntervalSeconds": 30 }
```

### GET /health

```json
{ "status": "ok", "dbConnected": true, "uptimeSeconds": 123 }
```

## Running Locally

### Requirements
- Node.js 18+
- PostgreSQL 13+
- Redis 6+

### 1. Start PostgreSQL and Redis
```bash
# macOS (Homebrew)
brew services start postgresql@15
brew services start redis
createdb typeahead
```

### 2. Backend
```bash
cd backend
cp .env.example .env        # edit if your Postgres/Redis settings differ
npm install
```

### 3. Load the dataset
```bash
# real AOL data (see the Dataset section for the download)
npm run prepare:aol -- data/user-ct-test-collection-02.txt
npm run import -- --reset
# or, without downloading anything:
# npm run generate && npm run import -- --reset
```

### 4. Run
```bash
# terminal 1
cd backend && npm start
# terminal 2
cd frontend && npm install && npm run dev
```

Open http://localhost:5173. Vite proxies API calls to the backend, so there's nothing else
to configure.

## Design Choices

**Why a cache.** Most typeahead traffic is repeated prefixes. Serving those from Redis
instead of hitting PostgreSQL every time keeps suggestions fast and takes load off the
database. A 5-minute TTL keeps cached results from going stale forever.

**Why consistent hashing.** With three cache nodes, the naive approach is `hash(key) % 3`,
but that remaps almost every key if a node is added or removed. A hash ring only remaps the
keys near the change. Virtual nodes (50 per node) spread each node around the ring so the
load is more even. The owning node becomes part of the Redis key, so you can actually see
the partitioning.

**Why batch writes.** Searches are frequent and the same query repeats a lot. Writing to
the database on every search is wasteful. Collecting counts in memory and flushing every 30
seconds turns many searches into a single upsert per query.

**Why a WAL.** The batch buffer lives in memory, so a crash would lose it. Writing each
search to a log file first means the buffer can be rebuilt on the next startup.

## Trade-offs

- The cache and batch buffer are simple and fast, but the buffer is in memory — the WAL is
  what makes it safe across restarts.
- Batching delays durability: a search isn't in the database until the next flush (up to 30
  seconds later). The WAL bounds the loss, but counts lag by one cycle.
- The three cache nodes run inside one Redis instance (the node name is a key prefix). The
  hashing algorithm is real; using three separate Redis servers would be the production
  version.
- Trending uses a recency multiplier on top of count, so it favors queries that already
  have some popularity. A brand-new query needs a few searches before it can trend, which is
  intentional (it stops one-off searches from dominating).

## Performance

Measured locally with the 150k-row dataset (see [PERFORMANCE.md](PERFORMANCE.md) for the
full report and how to reproduce it with `npm run benchmark`):

- Suggest latency: server-side **p95 ≈ 2 ms**, average ≈ 1 ms (cache hits).
- Cache hit rate: **~93%** in a mixed benchmark run.
- Batch writes: **100 searches for the same query → 1 database write**.

## Future Improvements

- Run the cache nodes as separate Redis instances instead of one.
- Make the WAL flush race-free (handle searches that arrive during a flush).
- Use the real query timestamps from the dataset instead of spreading `last_searched` on import.
- Add a small set of automated tests.
