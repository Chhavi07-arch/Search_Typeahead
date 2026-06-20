// Top header bar with title and a live backend health indicator.
import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function Header() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    let active = true;
    const poll = () =>
      api
        .health()
        .then((h) => active && setHealth(h))
        .catch(() => active && setHealth({ status: "down", dbConnected: false }));
    poll();
    const id = setInterval(poll, 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const ok = health?.status === "ok";
  const dot = ok ? "bg-emerald-400" : health ? "bg-amber-400" : "bg-slate-500";
  const label = !health
    ? "connecting…"
    : ok
    ? "backend healthy"
    : health.status === "down"
    ? "backend down"
    : "db degraded";

  return (
    <header className="flex items-center justify-between border-b border-ink-600 pb-5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent/20 text-accent text-xl">
          ⌕
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white">
            Search Typeahead System
          </h1>
          <p className="text-sm text-slate-400">
            Typeahead · Consistent Hashing · Batch Writes · WAL · Trending
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-ink-600 bg-ink-800 px-3 py-1.5 text-sm">
        <span className={`h-2.5 w-2.5 rounded-full ${dot} animate-pulse`} />
        <span className="text-slate-300">{label}</span>
      </div>
    </header>
  );
}
