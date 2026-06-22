// Converts the raw AOL search-query logs into our `query,count` dataset format.
//
//   node scripts/prepareAol.js [inputDirOrFile] [limit]
//
// Defaults: input = data/aol/ , limit = 150000 (top queries by frequency).
//
// The AOL dataset is a set of tab-separated log files with these columns:
//   AnonID   Query   QueryTime   ItemRank   ClickURL
// Each row is one search EVENT, so the same query appears many times. We aggregate
// by Query to derive a count (the brief explicitly allows deriving counts by
// aggregation), keep the top `limit` queries by count, and write them to
// data/dataset.csv — which `npm run import` then loads into PostgreSQL.
//
// Robust to: header row, missing "Query" column name (falls back to column index
// 1), blank queries (AOL uses "-"), tab OR comma delimited files.

import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const inputArg = process.argv[2] || path.join(__dirname, "..", "data", "aol");
const limit = Number(process.argv[3]) || 150000;
const outPath = path.join(__dirname, "..", "data", "dataset.csv");

// Collect the list of files to read (a single file, or every file in a directory).
function collectFiles(input) {
  if (!fs.existsSync(input)) {
    console.error(`Input not found: ${input}`);
    console.error(
      "Download the AOL dataset, unzip it into backend/data/aol/, then re-run."
    );
    process.exit(1);
  }
  const stat = fs.statSync(input);
  if (stat.isFile()) return [input];
  return fs
    .readdirSync(input)
    .filter((f) => /\.(txt|csv|tsv)$/i.test(f))
    .map((f) => path.join(input, f));
}

// Split a line on tab; if that yields a single field, fall back to comma.
function splitLine(line) {
  let parts = line.split("\t");
  if (parts.length === 1) parts = line.split(",");
  return parts;
}

async function readFileInto(file, counts) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file),
    crlfDelay: Infinity,
  });

  let queryCol = 1; // AOL default: AnonID(0), Query(1), ...
  let isFirst = true;

  for await (const line of rl) {
    if (!line) continue;
    const parts = splitLine(line);

    // Detect the Query column from a header row, if present.
    if (isFirst) {
      isFirst = false;
      const headerIdx = parts.findIndex((p) => p.trim().toLowerCase() === "query");
      if (headerIdx !== -1) {
        queryCol = headerIdx;
        continue; // skip the header line itself
      }
      // No header — fall through and treat this line as data.
    }

    const rawQuery = (parts[queryCol] ?? "").trim().toLowerCase();
    if (!rawQuery || rawQuery === "-") continue;
    if (rawQuery.length < 2 || rawQuery.length > 100) continue;

    counts.set(rawQuery, (counts.get(rawQuery) || 0) + 1);
  }
}

async function main() {
  const files = collectFiles(inputArg);
  if (files.length === 0) {
    console.error(`No .txt/.csv/.tsv files found in ${inputArg}`);
    process.exit(1);
  }

  console.log(`Reading ${files.length} file(s) from ${inputArg} ...`);
  const counts = new Map();
  for (const file of files) {
    console.log(`  parsing ${path.basename(file)} ...`);
    await readFileInto(file, counts);
  }
  console.log(`Aggregated ${counts.size.toLocaleString()} unique queries.`);

  // Keep the top `limit` queries by count (most useful for typeahead).
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  const out = fs.createWriteStream(outPath, { encoding: "utf8" });
  out.write("query,count\n");
  for (const [query, count] of top) {
    // Quote to be CSV-safe (AOL queries can contain commas).
    out.write(`"${query.replace(/"/g, '""')}",${count}\n`);
  }
  out.end(() => {
    console.log(`Wrote ${top.length.toLocaleString()} rows to ${outPath}`);
    if (top.length < 100000) {
      console.log(
        `Note: only ${top.length} unique queries available — that is below the ` +
          `100k target. Use more AOL files or lower the length filter.`
      );
    } else {
      console.log("Next: run  npm run import -- --reset   to load it into PostgreSQL.");
    }
  });
}

main().catch((err) => {
  console.error("prepareAol failed:", err);
  process.exit(1);
});
