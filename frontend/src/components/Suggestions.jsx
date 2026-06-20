// Suggestions dropdown. Highlights the active item for keyboard navigation.
export default function Suggestions({ items, activeIndex, onPick, loading, cached }) {
  if (loading) {
    return (
      <div className="absolute z-10 mt-2 w-full rounded-xl border border-ink-600 bg-ink-800 p-4 text-sm text-slate-400 shadow-xl">
        Loading suggestions…
      </div>
    );
  }

  if (!items || items.length === 0) return null;

  return (
    <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-xl border border-ink-600 bg-ink-800 shadow-xl">
      <div className="flex items-center justify-between border-b border-ink-700 px-4 py-2 text-xs uppercase tracking-wide text-slate-500">
        <span>{items.length} suggestions</span>
        <span className={cached ? "text-emerald-400" : "text-amber-400"}>
          {cached ? "cache hit" : "from db"}
        </span>
      </div>
      <ul>
        {items.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault() /* keep input focus */}
              onClick={() => onPick(s)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                i === activeIndex
                  ? "bg-accent/20 text-white"
                  : "text-slate-300 hover:bg-ink-700"
              }`}
            >
              <span className="text-slate-500">⌕</span>
              <span>{s}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
