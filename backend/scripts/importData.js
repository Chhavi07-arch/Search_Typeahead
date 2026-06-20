// Imports a CSV (query,count) into PostgreSQL.
//
//   node scripts/importData.js [path/to/file.csv]
//
// Default file is data/dataset.csv (run generateDataset.js first), falling back to
// data/sample.csv if the generated file does not exist. Rows are upserted in
// batches for speed. last_searched is spread across the recent past so trending
// has variety to rank.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import csv from "csv-parser";
import { pool, initSchema } from "../src/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveInput() {
  const arg = process.argv[2];
  if (arg) return path.resolve(arg);
  const generated = path.join(__dirname, "..", "data", "dataset.csv");
  if (fs.existsSync(generated)) return generated;
  return path.join(__dirname, "..", "data", "sample.csv");
}

const inputPath = resolveInput();
const BATCH_SIZE = 1000;

// Upsert a batch of [query, count, lastSearched] rows in a single multi-row INSERT.
async function flushBatch(rows) {
  if (rows.length === 0) return;
  const values = [];
  const params = [];
  rows.forEach((r, i) => {
    const base = i * 3;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
    params.push(r.query, r.count, r.lastSearched);
  });

  await pool.query(
    `INSERT INTO search_queries (query, count, last_searched)
     VALUES ${values.join(", ")}
     ON CONFLICT (query)
     DO UPDATE SET count = EXCLUDED.count, last_searched = EXCLUDED.last_searched`,
    params
  );
}

async function main() {
  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    console.error("Run `npm run generate` first, or pass a CSV path.");
    process.exit(1);
  }

  await initSchema();
  console.log(`Importing from ${inputPath} ...`);

  const now = Date.now();
  let batch = [];
  let total = 0;

  const stream = fs.createReadStream(inputPath).pipe(csv());

  for await (const record of stream) {
    const query = (record.query ?? "").trim().toLowerCase();
    const count = parseInt(record.count, 10);
    if (!query || Number.isNaN(count)) continue;

    // Spread last_searched over the past ~30 days deterministically (by row index)
    // so trending scores differ across rows.
    const hoursAgo = total % (30 * 24);
    const lastSearched = new Date(now - hoursAgo * 3600 * 1000);

    batch.push({ query, count, lastSearched });
    total++;

    if (batch.length >= BATCH_SIZE) {
      await flushBatch(batch);
      batch = [];
      if (total % 10000 === 0) console.log(`  imported ${total} rows...`);
    }
  }

  await flushBatch(batch);
  console.log(`Done. Imported ${total} rows.`);
  await pool.end();
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
