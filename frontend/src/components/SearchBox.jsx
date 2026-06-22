// Search input with debounced typeahead, keyboard navigation, and a search button.
import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Suggestions from "./Suggestions.jsx";

const DEBOUNCE_MS = 300;

export default function SearchBox({ onSearched, onPrefixChange }) {
  const [value, setValue] = useState("");
  const [items, setItems] = useState([]);
  const [cached, setCached] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null); // last search result banner
  const [ranking, setRanking] = useState("count"); // "count" (basic) | "recency" (enhanced)

  const debounceRef = useRef(null);

  // Debounced suggestion fetching whenever the input or ranking mode changes.
  useEffect(() => {
    onPrefixChange?.(value.trim().toLowerCase());

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = value.trim();
    if (q.length === 0) {
      setItems([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await api.suggest(q, ranking);
        setItems(data.suggestions || []);
        setCached(!!data.cached);
        setOpen(true);
        setActiveIndex(-1);
        setError("");
      } catch {
        setError("Failed to fetch suggestions");
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(debounceRef.current);
  }, [value, ranking, onPrefixChange]);

  async function submitSearch(query) {
    const q = (query ?? value).trim();
    if (!q) return;
    try {
      await api.search(q);
      setStatus({ ok: true, text: `Searched “${q}”` });
      setValue(q);
      setOpen(false);
      onSearched?.(q);
    } catch {
      setStatus({ ok: false, text: "Search failed" });
    }
  }

  function onKeyDown(e) {
    if (!open || items.length === 0) {
      if (e.key === "Enter") submitSearch();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0) submitSearch(items[activeIndex]);
      else submitSearch();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <section className="rounded-2xl border border-ink-600 bg-ink-800 p-6 shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Search
        </h2>

        {/* Ranking toggle — demonstrates basic (count) vs enhanced (recency) ordering. */}
        <div className="flex items-center gap-1 rounded-lg border border-ink-600 bg-ink-900 p-1 text-xs">
          {[
            { id: "count", label: "By Count" },
            { id: "recency", label: "Trending (recency)" },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setRanking(opt.id)}
              className={`rounded-md px-3 py-1.5 transition ${
                ranking === opt.id
                  ? "bg-accent text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => items.length > 0 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            placeholder="Start typing… e.g. iph"
            className="w-full rounded-xl border border-ink-600 bg-ink-900 px-4 py-3 text-base text-white placeholder-slate-500 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40"
          />
          {open && (
            <Suggestions
              items={items}
              activeIndex={activeIndex}
              onPick={(s) => submitSearch(s)}
              loading={loading}
              cached={cached}
            />
          )}
        </div>

        <button
          onClick={() => submitSearch()}
          className="rounded-xl bg-accent px-6 py-3 font-medium text-white transition hover:bg-accent-hover active:scale-[0.98]"
        >
          Search
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

      {status && (
        <div
          className={`mt-4 rounded-lg border px-4 py-3 text-sm transition ${
            status.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-rose-500/30 bg-rose-500/10 text-rose-300"
          }`}
        >
          {status.text}
          {status.ok && (
            <span className="ml-2 text-slate-400">
              (recorded via WAL → batch buffer, flushed every 30s)
            </span>
          )}
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500">
        Tip: use ↑ / ↓ to navigate suggestions, Enter to search, Esc to close.
        Toggle ranking to compare all-time popularity vs recency-aware ordering.
      </p>
    </section>
  );
}
