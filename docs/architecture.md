# Architecture

## High-Level Diagram

```
                         ┌───────────────────────────┐
                         │        React UI            │
                         │  (Vite + TailwindCSS)      │
                         │  Header · SearchBox ·      │
                         │  Suggestions · Trending ·  │
                         │  Metrics · CacheInfo       │
                         └─────────────┬─────────────┘
                                       │  HTTP (Axios, /api proxy)
                                       ▼
                         ┌───────────────────────────┐
                         │      Express Backend       │
                         │  /suggest /search /trending│
                         │  /cache/debug /metrics     │
                         │  /health                   │
                         └─────────────┬─────────────┘
                                       │
        ┌──────────────────┬──────────┴──────────┬──────────────────┐
        ▼                  ▼                     ▼                  ▼
┌───────────────┐  ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  Cache Ring   │  │  Batch Buffer │   │      WAL      │   │  PostgreSQL   │
│ 3 cache nodes │  │ in-memory map │   │ search.log    │   │ search_queries│
│ consistent    │  │ flush every   │   │ append-only,  │   │ (source of    │
│ hashing, TTL  │  │ 30s → DB      │   │ replay on boot│   │  truth)       │
└───────────────┘  └───────┬───────┘   └───────┬───────┘   └───────▲───────┘
                           │                   │                   │
                           └─────── flush (upsert) ────────────────┘
```

## Request Flows

### `GET /suggest?q=iph` (read path)

1. Normalize the prefix (`trim`, lowercase). Empty → return `[]`.
2. `consistentHash.getNode("iph")` picks the owning cache node (e.g. `cacheNode2`).
3. Look in that node's `Map`:
   - **Hit** (and not expired) → return cached suggestions, record a cache hit.
   - **Miss / expired** → record a cache miss, query PostgreSQL:
     `SELECT query FROM search_queries WHERE query LIKE 'iph%' ORDER BY count DESC LIMIT 10`,
     store the result in the owning node, and return it.

### `POST /search { "query": "iphone" }` (write path)

1. Normalize the query.
2. **WAL first**: append `iphone\n` to `wal/search.log` (synchronous = durable).
3. **Buffer**: increment the in-memory counter for `iphone`.
4. Increment the `searchRequests` metric and respond `{ "message": "Searched" }`.
5. No database write happens here.

### Batch flush (every 30s, node-cron)

1. Copy + clear the buffer (new searches land in a fresh buffer).
2. For each distinct query, upsert into `search_queries`
   (`INSERT … ON CONFLICT (query) DO UPDATE SET count = count + delta`).
3. On success: truncate the WAL and add `N` to the `dbWrites` metric.
4. On failure: roll back, merge the entries back into the buffer (WAL stays intact),
   retry next cycle.

### Startup / crash recovery

1. Ensure schema exists.
2. `wal.recover()` reads `search.log` and replays every line into the buffer, so
   searches that were buffered but not yet flushed before a crash are not lost.
3. Start the flush scheduler and begin serving.

## Why these components

- **Cache ring** keeps hot prefixes in memory and demonstrates consistent hashing —
  the same prefix always maps to the same node, and virtual nodes balance the load.
- **Batch buffer** collapses many searches of the same term into one DB write,
  which is the core write-load-reduction idea.
- **WAL** provides durability for the buffer without a full transactional log.
- **PostgreSQL** is the source of truth for suggestions and trending.
