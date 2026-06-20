// Dashboard layout. Polls metrics/trending/cache so the UI stays live, and wires
// the search box to refresh everything after a search.
import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import Header from "./components/Header.jsx";
import SearchBox from "./components/SearchBox.jsx";
import Trending from "./components/Trending.jsx";
import Metrics from "./components/Metrics.jsx";
import CacheInfo from "./components/CacheInfo.jsx";

export default function App() {
  const [metrics, setMetrics] = useState(null);
  const [trending, setTrending] = useState([]);
  const [cacheDebug, setCacheDebug] = useState(null);
  const [prefix, setPrefix] = useState("");

  const refreshMetrics = useCallback(() => {
    api.metrics().then(setMetrics).catch(() => {});
  }, []);

  const refreshTrending = useCallback(() => {
    api.trending().then((d) => setTrending(d.trending || [])).catch(() => {});
  }, []);

  const refreshCache = useCallback((p) => {
    api.cacheDebug(p || "").then(setCacheDebug).catch(() => {});
  }, []);

  // Initial load + periodic polling so flushes and cache changes appear live.
  useEffect(() => {
    refreshMetrics();
    refreshTrending();
    refreshCache("");
    const id = setInterval(() => {
      refreshMetrics();
      refreshTrending();
    }, 4000);
    return () => clearInterval(id);
  }, [refreshMetrics, refreshTrending, refreshCache]);

  // When the typed prefix changes, refresh cache ownership info for it.
  useEffect(() => {
    refreshCache(prefix);
  }, [prefix, refreshCache, metrics]);

  const onSearched = () => {
    refreshMetrics();
    refreshTrending();
    refreshCache(prefix);
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <Header />

      <main className="mt-8 space-y-8">
        {/* Search + Trending side by side on large screens. */}
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SearchBox onSearched={onSearched} onPrefixChange={setPrefix} />
          </div>
          <Trending
            items={trending}
            onPick={(q) => {
              api.search(q).then(onSearched);
            }}
          />
        </div>

        <Metrics data={metrics} />

        <CacheInfo debug={cacheDebug} currentPrefix={prefix} />
      </main>

      <footer className="mt-10 border-t border-ink-600 pt-5 text-center text-xs text-slate-600">
        Search Typeahead System · HLD Assignment · React + Express + PostgreSQL
      </footer>
    </div>
  );
}
