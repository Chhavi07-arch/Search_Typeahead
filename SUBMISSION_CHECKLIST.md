# Submission Checklist

A quick map of each assignment requirement to where it is implemented and how to show it.
Useful as a reference during the viva.

## Functional requirements

| Requirement | Status | Where / How to show |
|---|---|---|
| Typeahead suggestions | Done | `GET /suggest?q=goo` → real AOL queries (`backend/src/routes/suggest.js`) |
| Maximum 10 suggestions | Done | `LIMIT 10`; `q=a` returns exactly 10 |
| Suggestions start with prefix | Done | `WHERE query LIKE 'goo%'`; all results start with `goo` |
| Sorted by count (descending) | Done | `ORDER BY count DESC, query ASC` |
| Handle empty / missing / no-match / mixed case | Done | empty → `[]`, `GOO` == `goo` (input lowercased) |
| Debounced requests in UI | Done | 300 ms debounce in `frontend/src/components/SearchBox.jsx` |
| Search submission returns dummy response | Done | `POST /search` → `{ "message": "Searched" }` |
| Count increments / inserts | Done | upsert `count = count + delta` on flush |
| Updates go through batch writes (not direct) | Done | `backend/src/services/batchBuffer.js` |

## Caching and consistent hashing

| Requirement | Status | Where / How to show |
|---|---|---|
| Cache used before the database | Done | `/suggest` checks Redis first (`backend/src/services/cache.js`) |
| Cache stores suggestion results per prefix | Done | Redis key `node:prefix` → suggestions JSON |
| Cache expiry / TTL | Done | Redis `SET ... EX 300` (5 minutes) |
| Cache distributed across nodes | Done | 3 logical nodes (`cacheNode1/2/3`) |
| Consistent hashing decides ownership | Done | `backend/src/services/consistentHash.js` (FNV-1a ring, 50 vnodes/node) |
| Cache debug endpoint | Done | `GET /cache/debug?prefix=goo` → node + hit/miss |

## Trending

| Requirement | Status | Where / How to show |
|---|---|---|
| Recency-aware ranking | Done | `score = count * (1 + W/(hours+1))` (`backend/src/routes/trending.js`) |
| Recent queries get a boost | Done | fresh query boosted up to 4× |
| One-off searches don't dominate | Done | `count >= 5` eligibility filter |
| Same suggestion API supports enhanced ranking | Done | `GET /suggest?ranking=recency` + UI toggle |

## Batch writes and WAL

| Requirement | Status | Where / How to show |
|---|---|---|
| Searches buffered, not written one-by-one | Done | in-memory buffer in `batchBuffer.js` |
| Repeated queries aggregated | Done | one upsert per distinct query |
| Periodic flush | Done | `node-cron`, every 30 s (`backend/src/index.js`) |
| Write reduction shown | Done | `/metrics` → `writeReduction`; 100 searches → 1 write |
| WAL written before buffer | Done | `wal.append()` before `buffer.add()` in `routes/search.js` |
| Recovery after restart | Done | `wal.recover()` on startup; verified with `kill -9` |

## Metrics and performance

| Requirement | Status | Where / How to show |
|---|---|---|
| Cache hit rate | Done | `/metrics` → `cacheHitRate` |
| Latency including p95 | Done | `/metrics` → `suggestLatency.p95Ms` |
| DB reads / writes | Done | `/metrics` → `dbReads`, `dbWrites` |
| Performance report | Done | `PERFORMANCE.md`, reproduce with `npm run benchmark` |

## Dataset

| Requirement | Status | Where / How to show |
|---|---|---|
| 100,000+ queries | Done | 150,000 rows loaded |
| query + count format | Done | `query,count` CSV |
| Counts from aggregation if needed | Done | `prepare:aol` aggregates raw AOL events; `google` raw 32,396 == DB 32,396 |
| Import script provided | Done | `backend/scripts/importData.js` |

## UI

| Requirement | Status |
|---|---|
| Search input | Done |
| Suggestion dropdown updating as you type | Done |
| Submit on Enter or button | Done |
| Shows the search response | Done |
| Trending section | Done |
| Loading / error states | Done |
| Keyboard navigation | Done (↑/↓/Enter/Esc) |

## Documentation

| Item | File |
|---|---|
| README with setup | `README.md` |
| Architecture | `ARCHITECTURE.md` |
| Project report | `PROJECT_REPORT.md` |
| Performance report | `PERFORMANCE.md` |
| This checklist | `SUBMISSION_CHECKLIST.md` |

## Known limitations (be ready to mention these)

- The three cache nodes run inside one Redis instance (the hashing algorithm is real).
- A search arriving in the middle of a flush can lose its WAL line if the process then
  crashes (narrow window).
- Imported rows use a recent `last_searched` instead of the dataset's original timestamps.
- Trending favors queries that already have some count.
