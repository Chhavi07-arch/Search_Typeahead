# Search Typeahead System

A Google-autocomplete–style **search typeahead** system built for an HLD (High Level
Design) assignment. It demonstrates low-latency suggestions, a simulated distributed
cache with **consistent hashing**, **batch writes**, a simple **Write-Ahead Log (WAL)**
with crash recovery, and **recency-aware trending** — all kept deliberately simple so it
is easy to explain in a viva.

- **Frontend:** React + Vite + TailwindCSS + Axios (dark dashboard UI)
- **Backend:** Node.js + Express
- **Database:** PostgreSQL
- **Helpers:** `node-cron` (batch flush), `csv-parser` (dataset import), `pg` (driver)

> No Kafka, Redis, Elasticsearch, microservices, Docker orchestration, CQRS, or event
> sourcing — by design.

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Prerequisites](#prerequisites)
3. [Setup](#setup)
4. [Running](#running)
5. [API Documentation](#api-documentation)
6. [How It Works](#how-it-works)
   - [Consistent Hashing](#consistent-hashing)
   - [Batch Writes](#batch-writes)
   - [WAL (Write-Ahead Log)](#wal-write-ahead-log)
   - [Trending](#trending)
   - [Caching & TTL](#caching--ttl)
7. [Tradeoffs](#tradeoffs)
8. [Demo Script (for viva)](#demo-script-for-viva)

---

## Project Structure

```
SearchTypeahead/
├── README.md
├── docs/architecture.md          # diagram + request-flow walkthroughs
├── backend/
│   ├── .env.example
│   ├── data/sample.csv           # small ready-to-use dataset
│   ├── scripts/
│   │   ├── generateDataset.js    # builds a 100k-row CSV
│   │   └── importData.js         # imports a CSV into PostgreSQL
│   ├── wal/                      # search.log lives here at runtime
│   └── src/
│       ├── index.js              # server entry (recovery + cron + routes)
│       ├── config.js  db.js
│       ├── services/             # consistentHash, cache, wal, batchBuffer, metrics
│       └── routes/               # suggest, search, trending, cache, metrics, health
└── frontend/
    └── src/
        ├── App.jsx  api.js
        └── components/           # Header, SearchBox, Suggestions, Trending, Metrics, CacheInfo
```

---

## Prerequisites

- **Node.js 18+** (uses ES modules and `node --watch`)
- **PostgreSQL 13+** running locally

---

## Setup

### 1. Create the database

```bash
createdb typeahead
# or, inside psql:  CREATE DATABASE typeahead;
```

### 2. Configure the backend

```bash
cd backend
cp .env.example .env          # edit credentials if your Postgres differs
npm install
```

### 3. Load a dataset

Either use the bundled sample, or generate a large one.

```bash
# Option A — quick start with the bundled sample (~37 rows)
npm run import -- data/sample.csv

# Option B — generate 100,000 rows, then import them
npm run generate              # writes backend/data/dataset.csv
npm run import                # imports dataset.csv (falls back to sample.csv)
```

The schema (`search_queries` table + prefix index) is created automatically on first
import and on server start.

### 4. Install the frontend

```bash
cd ../frontend
npm install
```

---

## Running

Open two terminals.

**Backend** (port 4000):

```bash
cd backend
npm start          # or: npm run dev   (auto-restart on change)
```

**Frontend** (port 5173):

```bash
cd frontend
npm run dev
```

Visit **http://localhost:5173**. The Vite dev server proxies `/api/*` to the backend,
so no CORS configuration is needed.

---

## API Documentation

Base URL: `http://localhost:4000`

### `GET /suggest?q=<prefix>`

Returns up to 10 suggestions that start with the prefix, ordered by popularity.
Cached per prefix on the consistent-hash ring.

```bash
curl "http://localhost:4000/suggest?q=iph"
```

```json
{
  "prefix": "iph",
  "suggestions": ["iphone", "iphone 15", "iphone charger", "iphone case"],
  "cached": false
}
```

Empty/whitespace input returns `{ "prefix": "", "suggestions": [], "cached": false }`.

### `POST /search`

Records a search. Goes through the WAL and batch buffer — it does **not** write to the
DB directly.

```bash
curl -X POST http://localhost:4000/search \
  -H "Content-Type: application/json" \
  -d '{"query":"iphone"}'
```

```json
{ "message": "Searched" }
```

### `GET /trending`

Top 10 queries by recency-aware score (see [Trending](#trending)).

```json
{
  "trending": [
    {
      "query": "iphone",
      "count": 100000,
      "lastSearched": "2026-06-20T10:00:00.000Z",
      "hoursSinceLastSearch": 0.5,
      "score": 106666.67
    }
  ]
}
```

### `GET /cache/debug?prefix=<prefix>`

Shows which cache node owns a prefix, whether it is currently cached, the ring layout,
and a snapshot of every node's contents.

```json
{
  "prefix": "iph",
  "node": "cacheNode2",
  "cacheHit": true,
  "ring": { "nodes": ["cacheNode1","cacheNode2","cacheNode3"], "virtualNodesPerNode": 50, "totalPoints": 150, "pointsPerNode": { "cacheNode1": 50, "cacheNode2": 50, "cacheNode3": 50 } },
  "contents": { "ttlMs": 300000, "nodes": { "cacheNode1": { "size": 0, "keys": [] }, "...": {} } }
}
```

### `GET /metrics`

```json
{
  "cacheHits": 12,
  "cacheMisses": 4,
  "cacheHitRate": 75.0,
  "searchRequests": 40,
  "dbWrites": 6,
  "writeReduction": 85.0,
  "pendingWrites": 2,
  "buffer": { "iphone": 2 },
  "flushIntervalSeconds": 30
}
```

### `GET /health`

```json
{ "status": "ok", "dbConnected": true, "uptimeSeconds": 123 }
```

---

## How It Works

### Consistent Hashing

File: `backend/src/services/consistentHash.js`

Three simulated cache nodes (`cacheNode1`, `cacheNode2`, `cacheNode3`) are placed on a
numeric ring. Each node is placed at **50 virtual points** computed with a deterministic
FNV-1a string hash. To find the owner of a prefix, we hash the prefix to a point on the
ring and walk clockwise to the first node point we meet.

- **Why a ring?** Adding/removing a node only remaps the keys near that node, not all
  keys (unlike `hash(key) % N`).
- **Why virtual nodes?** They spread each physical node around the ring so keys are
  distributed evenly instead of clumping.

The same prefix therefore always maps to the same node — visible in `/cache/debug` and
the **Cache** panel of the UI.

### Batch Writes

Files: `backend/src/services/batchBuffer.js`, scheduled in `backend/src/index.js`

`POST /search` increments an in-memory counter, e.g. `{ "iphone": 5, "java tutorial": 3 }`.
Every **30 seconds** a `node-cron` job flushes the buffer: each distinct query becomes a
single upsert `INSERT … ON CONFLICT (query) DO UPDATE SET count = count + delta`.

This turns *N* searches of the same term into **one** DB write. The
`/metrics` endpoint reports `searchRequests`, `dbWrites`, and the derived
`writeReduction = (searchRequests − dbWrites) / searchRequests`.

### WAL (Write-Ahead Log)

File: `backend/src/services/wal.js`

Before a search touches the in-memory buffer it is appended to `backend/wal/search.log`
(one query per line, synchronous write). The buffer lives only in memory, so if the
process crashes before the next flush those increments would be lost — the WAL prevents
that:

- **On startup**, `recover()` reads `search.log` and replays each line back into the
  buffer.
- **After a successful flush**, the log is truncated (those writes are now durable in
  PostgreSQL).

Intentionally minimal: no LSNs, no checkpoints, no undo logs.

### Trending

File: `backend/src/routes/trending.js`

Each row stores `count` and `last_searched`. Trending uses:

```
score = count + (10000 / (hours_since_last_search + 1))
```

- A query searched **just now** gets a large recency boost (`+10000` at 0 hours).
- As it ages, the boost decays toward 0 and only raw `count` remains.

This lets a recently-searched niche query temporarily out-rank an old popular one,
which is exactly what you demonstrate in the viva.

### Caching & TTL

File: `backend/src/services/cache.js`

Each cache node is a JS `Map` of `prefix → { suggestions, createdAt }`. Entries expire
after **5 minutes** (`CACHE_TTL_MS`). Expired entries are treated as a miss and evicted
on access. Hits/misses feed the metrics.

---

## Tradeoffs

- **In-memory cache & buffer** are simple and fast but live in a single process; a crash
  loses cache (fine — it rebuilds) and would lose the buffer (mitigated by the WAL).
- **Batching adds latency to durability**: a search isn't in the DB until the next flush
  (≤30s). The WAL bounds data loss to "nothing", but trending/counts lag by one cycle.
- **Simulated cache nodes** run in one process — this shows the *algorithm* (consistent
  hashing) without the operational complexity of real distributed caches (Redis, etc.),
  which the assignment explicitly excludes.
- **`LIKE 'prefix%'`** with a `text_pattern_ops` index is simple and fast for prefix
  matches; a dedicated search engine would scale further but is out of scope.
- **Single writer** for flushes keeps the buffer logic trivial and avoids lock
  contention, at the cost of horizontal write scaling.

---

## Demo Script (for viva)

1. **Typeahead + cache:** type `iph` in the UI. First request is a **cache miss** (from
   DB); type it again (or check `/cache/debug?prefix=iph`) and it's a **cache hit**.
2. **Consistent hashing:** the Cache panel highlights which node owns `iph`. Try other
   prefixes and see them land on different nodes deterministically.
3. **Batch writes:** search the same term several times; `pendingWrites` in Metrics goes
   up while `dbWrites` stays flat. After ~30s a flush runs, `dbWrites` ticks up by the
   number of distinct queries, and `writeReduction` rises.
4. **WAL recovery:** search a few terms, then **stop the backend before** a flush. Inspect
   `backend/wal/search.log` — your searches are there. Restart: the log says
   `WAL recovery: replayed N buffered search(es)`, and after the next flush they reach
   the DB.
5. **Trending:** search a niche query repeatedly and watch it climb the Trending list via
   the recency boost, then decay over time.
