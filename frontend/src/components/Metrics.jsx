// Metrics dashboard cards.
function Card({ label, value, sub, accent }) {
  return (
    <div className="rounded-2xl border border-ink-600 bg-ink-800 p-5 shadow-lg">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${accent || "text-white"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default function Metrics({ data }) {
  const m = data || {};
  return (
    <section>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Metrics
      </h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card
          label="Cache Hit Rate"
          value={`${(m.cacheHitRate ?? 0).toFixed(1)}%`}
          sub={`${m.cacheHits ?? 0} hits / ${m.cacheMisses ?? 0} misses`}
          accent="text-emerald-400"
        />
        <Card
          label="Search Requests"
          value={(m.searchRequests ?? 0).toLocaleString()}
          sub={`${m.pendingWrites ?? 0} pending in buffer`}
        />
        <Card
          label="DB Writes"
          value={(m.dbWrites ?? 0).toLocaleString()}
          sub={`flush every ${m.flushIntervalSeconds ?? 30}s`}
        />
        <Card
          label="Write Reduction"
          value={`${(m.writeReduction ?? 0).toFixed(1)}%`}
          sub="searches avoided as direct writes"
          accent="text-accent"
        />
      </div>
    </section>
  );
}
