// Thin API client. baseURL "/api" is proxied to the Express backend by Vite
// (see vite.config.js).
import axios from "axios";

const client = axios.create({ baseURL: "/api" });

export const api = {
  suggest: (q) => client.get("/suggest", { params: { q } }).then((r) => r.data),
  search: (query) => client.post("/search", { query }).then((r) => r.data),
  trending: () => client.get("/trending").then((r) => r.data),
  metrics: () => client.get("/metrics").then((r) => r.data),
  cacheDebug: (prefix) =>
    client.get("/cache/debug", { params: { prefix } }).then((r) => r.data),
  health: () => client.get("/health").then((r) => r.data),
};
