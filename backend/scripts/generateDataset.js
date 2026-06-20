// Generates a large, realistic CSV dataset (query,count) for the typeahead system.
//
//   node scripts/generateDataset.js [rowTarget]
//
// Default target is 100,000 rows. Queries are built by combining seed terms with
// brands/modifiers/suffixes so prefixes have plenty of matches. Counts decrease as
// queries get longer/rarer, which makes ranking and trending demos meaningful.
//
// The base combination space is finite, so once it is exhausted we keep producing
// plausible "<head> model <n>" style variants until the target is reached. This
// guarantees we always hit the requested row count.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "data", "dataset.csv");

const rowTarget = Number(process.argv[2]) || 100000;

const heads = [
  "iphone", "ipad", "macbook", "android", "samsung galaxy", "google pixel",
  "java", "javascript", "python", "react", "node js", "typescript", "golang",
  "rust", "kubernetes", "docker", "postgres", "mysql", "mongodb", "redis",
  "laptop", "headphones", "keyboard", "mouse", "monitor", "webcam", "router",
  "coffee", "tea", "pizza", "burger", "sushi", "pasta", "salad", "smoothie",
  "running shoes", "jeans", "t shirt", "jacket", "backpack", "watch", "sunglasses",
  "machine learning", "deep learning", "data science", "system design",
  "interview questions", "resume template", "online course", "tutorial",
];

const modifiers = [
  "", "pro", "max", "mini", "ultra", "plus", "lite", "2024", "2025",
  "review", "price", "vs", "near me", "for beginners", "advanced",
  "cheap", "best", "buy", "deals", "specs", "manual", "guide",
];

const suffixes = [
  "", "online", "free", "download", "comparison", "alternatives",
  "tips", "tricks", "examples", "cheat sheet", "course", "certification",
  "amazon", "discount", "warranty", "repair", "setup", "installation",
];

// Yields the base combination space first, then numbered variants forever.
function* queryGenerator() {
  for (const h of heads) {
    for (const m of modifiers) {
      for (const s of suffixes) {
        yield [h, m, s].filter(Boolean).join(" ");
      }
    }
  }
  // Fallback: numbered variants to fill any remaining rows up to the target.
  let n = 1;
  while (true) {
    for (const h of heads) yield `${h} model ${n}`;
    n++;
  }
}

function main() {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const out = fs.createWriteStream(outPath, { encoding: "utf8" });
  out.write("query,count\n");

  const seen = new Set();
  let written = 0;

  for (const query of queryGenerator()) {
    if (written >= rowTarget) break;
    if (seen.has(query)) continue;
    seen.add(query);

    // Popularity model: shorter/earlier queries are more popular. Deterministic.
    const lengthPenalty = query.split(" ").length;
    const base = Math.max(50, 200000 - written * 2);
    const count = Math.max(1, Math.floor(base / lengthPenalty));

    out.write(`"${query}",${count}\n`);
    written++;
  }

  out.end(() => console.log(`Wrote ${written} rows to ${outPath}`));
}

main();
