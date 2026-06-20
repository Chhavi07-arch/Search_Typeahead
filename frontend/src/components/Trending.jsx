// Trending searches list (top 10 by recency-aware score).
export default function Trending({ items, onPick }) {
  return (
    <section className="rounded-2xl border border-ink-600 bg-ink-800 p-6 shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Trending
        </h2>
        <span className="text-xs text-slate-500">count + 10000/(hrs+1)</span>
      </div>

      {(!items || items.length === 0) && (
        <p className="text-sm text-slate-500">No trending data yet.</p>
      )}

      <ol className="space-y-2">
        {items?.map((t, i) => (
          <li key={t.query}>
            <button
              onClick={() => onPick?.(t.query)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-ink-700"
            >
              <span className="w-5 text-sm font-semibold text-accent">{i + 1}</span>
              <span className="flex-1 truncate text-sm text-slate-200">{t.query}</span>
              <span className="rounded bg-ink-600 px-2 py-0.5 text-xs text-slate-300">
                {t.count.toLocaleString()}
              </span>
              <span className="w-16 text-right text-xs text-emerald-400">
                {t.score.toLocaleString()}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
