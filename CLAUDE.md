# Search Typeahead System - Project Specification

## Project Overview

Build a Search Typeahead System similar to Google Search autocomplete.

Users should receive query suggestions while typing, submit searches, view trending searches, and experience low-latency responses through caching.

This project is an HLD (High Level Design) assignment and should prioritize simplicity, correctness, explainability, and adherence to assignment requirements over production-grade complexity.

---

# Tech Stack

## Frontend

* React
* Vite
* TailwindCSS
* Axios

## Backend

* Node.js
* Express.js

## Database

* PostgreSQL

## Other Libraries

* node-cron (batch flush scheduler)
* csv-parser (dataset loading)
* pg (PostgreSQL driver)

---

# Important Constraints

DO NOT introduce:

* Kafka
* RabbitMQ
* Redis
* Elasticsearch
* Microservices
* Docker orchestration
* Kubernetes
* Event sourcing
* CQRS
* Complex distributed systems

The project should remain easy to explain during a viva.

---

# Assignment Requirements

## 1. Typeahead Suggestions

When a user types a prefix:

Example:

"iph"

The system should return:

* iphone
* iphone 15
* iphone charger

Requirements:

* Return maximum 10 suggestions
* Suggestions must start with the prefix
* Suggestions sorted by ranking score
* Handle empty input
* Handle no-match input
* Frontend should debounce requests

API:

GET /suggest?q=<prefix>

---

## 2. Search Submission

When a user searches:

POST /search

Response:

{
"message": "Searched"
}

The search count should be updated.

If query exists:

increment count

If query does not exist:

insert query with count = 1

Updates should NOT immediately hit the database.

Updates must go through batch writes.

---

## 3. Batch Writes

Implement a write buffer.

Example:

{
"iphone": 5,
"java tutorial": 3
}

Search requests should update the buffer.

Every 30 seconds:

Flush aggregated updates to PostgreSQL.

Goal:

Reduce database write load.

Maintain metrics:

* total searches
* total DB writes
* write reduction percentage

---

## 4. WAL (Write Ahead Log)

Implement a simple WAL.

Before updating the in-memory buffer:

Append search event to:

/wal/search.log

Example:

iphone
iphone
java tutorial

Purpose:

Prevent loss of buffered updates if server crashes.

Recovery:

On startup:

* Read WAL
* Rebuild buffer
* Continue processing

Keep implementation simple.

No LSNs.
No checkpoints.
No undo logs.

---

## 5. Distributed Cache Simulation

The assignment requires consistent hashing.

Implement simulated cache nodes:

cacheNode1
cacheNode2
cacheNode3

Each cache node is a JavaScript Map.

Use consistent hashing to determine ownership of prefixes.

Example:

prefix "iph"
→ cacheNode2

prefix "jav"
→ cacheNode1

The cache stores suggestion responses.

Cache entry:

{
suggestions: [...],
createdAt: timestamp
}

TTL:

5 minutes

---

## 6. Cache Debug Endpoint

API:

GET /cache/debug?prefix=<prefix>

Response:

{
"prefix": "iph",
"node": "cacheNode2",
"cacheHit": true
}

Used for assignment demonstration.

---

## 7. Trending Searches

Support recency-aware ranking.

Each query stores:

* count
* last_searched

Ranking formula:

score =
count +
(10000 / (hours_since_last_search + 1))

Students should clearly demonstrate:

* historical popularity
* recent popularity
* ranking changes

Trending API:

GET /trending

Return top 10 searches.

---

# Database Schema

Table:

search_queries

Columns:

id SERIAL PRIMARY KEY

query TEXT UNIQUE

count BIGINT NOT NULL

last_searched TIMESTAMP NOT NULL

---

# Dataset

Dataset size target:

100,000+ rows

CSV format:

query,count

Example:

iphone,100000
iphone 15,85000
iphone charger,60000
java tutorial,40000

Provide script to import CSV into PostgreSQL.

---

# API Endpoints

GET /suggest?q=<prefix>

POST /search

Body:

{
"query": "iphone"
}

GET /trending

GET /cache/debug?prefix=<prefix>

GET /metrics

GET /health

---

# Metrics Endpoint

Return:

{
"cacheHits": number,
"cacheMisses": number,
"cacheHitRate": percentage,
"searchRequests": number,
"dbWrites": number,
"writeReduction": percentage
}

---

# Frontend Requirements

Create a modern dark-themed UI.

Style inspiration:

Google Search + modern dashboard.

Sections:

1. Search Header
2. Search Input
3. Suggestions Dropdown
4. Search Button
5. Search Result Status
6. Trending Searches
7. Metrics Dashboard
8. Cache Statistics

Use:

* Responsive design
* Loading states
* Error states
* Smooth transitions
* Keyboard navigation for suggestions

---

# Architecture Diagram

React UI

↓

Express Backend

↓

---

| Cache Ring | Batch Buffer |
| WAL | PostgreSQL |
--------------------

---

# Documentation Requirements

Generate:

README.md

Include:

* setup instructions
* architecture explanation
* API documentation
* consistent hashing explanation
* batch write explanation
* WAL explanation
* tradeoffs

---

# Success Criteria

The final project must:

* Run locally
* Have a polished UI
* Have a functioning backend
* Demonstrate cache usage
* Demonstrate consistent hashing
* Demonstrate batch writes
* Demonstrate WAL recovery
* Demonstrate trending searches
* Be easy to explain during viva
* Closely follow assignment requirements
