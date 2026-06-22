// Write-Ahead Log (deliberately minimal — no LSNs, checkpoints, or undo logs).
//
// Every search is appended to wal/search.log BEFORE it touches the in-memory
// batch buffer. If the process crashes with un-flushed searches still in the
// buffer, recover() replays the log on startup so nothing is lost. After a
// successful flush the log is truncated.

import fs from "fs";
import path from "path";
import { config } from "../config.js";

const walPath = config.walPath;

// Make sure the wal/ directory exists.
function ensureDir() {
  fs.mkdirSync(path.dirname(walPath), { recursive: true });
}

// Append one search query as a single line. The write is synchronous so the line
// is written to the log file before we acknowledge the search, which protects
// against a process crash. (It is a plain append, not fsync'd, so a full OS/power
// loss could still lose the very last lines — acceptable for this assignment.)
export function append(query) {
  ensureDir();
  fs.appendFileSync(walPath, query + "\n", "utf8");
}

// Read every logged query (used during recovery). Returns [] if no log yet.
export function readAll() {
  if (!fs.existsSync(walPath)) return [];
  const raw = fs.readFileSync(walPath, "utf8");
  return raw.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
}

// Empty the log. Called after a flush has safely persisted the buffer.
export function truncate() {
  ensureDir();
  fs.writeFileSync(walPath, "", "utf8");
}

// On startup, replay the log back into the batch buffer. We import the buffer
// lazily to avoid a circular import at module load time.
export async function recover() {
  const queries = readAll();
  if (queries.length === 0) return 0;

  const { addRecovered } = await import("./batchBuffer.js");
  for (const q of queries) addRecovered(q);
  return queries.length;
}
