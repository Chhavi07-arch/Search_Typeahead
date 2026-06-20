// Cache statistics: which node owns the current prefix + per-node contents.
export default function CacheInfo({ debug, currentPrefix }) {
  const nodes = debug?.contents?.nodes || {};
  const ring = debug?.ring;
  const nodeNames = ring?.nodes || Object.keys(nodes);

  return (
    <section className="rounded-2xl border border-ink-600 bg-ink-800 p-6 shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Cache (Consistent Hashing)
        </h2>
        {ring && (
          <span className="text-xs text-slate-500">
            {ring.totalPoints} ring points · {ring.virtualNodesPerNode} vnodes/node
          </span>
        )}
      </div>

      {/* Current prefix ownership */}
      <div className="mb-5 rounded-xl border border-ink-700 bg-ink-900 p-4">
        {currentPrefix ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-slate-500">prefix:</span>{" "}
              <span className="font-mono text-white">“{currentPrefix}”</span>
            </div>
            <div>
              <span className="text-slate-500">owner:</span>{" "}
              <span className="font-mono text-accent">{debug?.node ?? "—"}</span>
            </div>
            <div>
              <span className="text-slate-500">status:</span>{" "}
              <span className={debug?.cacheHit ? "text-emerald-400" : "text-amber-400"}>
                {debug?.cacheHit ? "cache hit" : "cache miss"}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Type a prefix to see which cache node owns it.
          </p>
        )}
      </div>

      {/* Per-node contents */}
      <div className="grid gap-4 sm:grid-cols-3">
        {nodeNames.map((name) => {
          const node = nodes[name] || { size: 0, keys: [] };
          const owns = debug?.node === name && currentPrefix;
          return (
            <div
              key={name}
              className={`rounded-xl border p-4 ${
                owns ? "border-accent bg-accent/10" : "border-ink-700 bg-ink-900"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-slate-200">{name}</span>
                <span className="rounded bg-ink-600 px-2 py-0.5 text-xs text-slate-300">
                  {node.size}
                </span>
              </div>
              <ul className="mt-2 space-y-1">
                {node.keys.slice(0, 6).map((k) => (
                  <li key={k.prefix} className="truncate font-mono text-xs text-slate-400">
                    {k.prefix}
                  </li>
                ))}
                {node.keys.length === 0 && (
                  <li className="text-xs text-slate-600">empty</li>
                )}
                {node.keys.length > 6 && (
                  <li className="text-xs text-slate-600">
                    +{node.keys.length - 6} more
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
