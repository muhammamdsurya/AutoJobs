// Shown inside the app shell while a page's data loads: the shape of a page header and a list.
export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-label="Memuat halaman">
      <div className="space-y-3">
        <div className="skeleton h-9 w-56" />
        <div className="skeleton h-4 w-full max-w-md" />
      </div>
      <div className="glass-dense divide-y divide-white/6 overflow-hidden rounded-card">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-start justify-between gap-6 px-4 py-4 sm:px-6">
            <div className="min-w-0 flex-1 space-y-2.5">
              <div className="skeleton h-4 w-2/3 max-w-72" />
              <div className="skeleton h-3 w-1/2 max-w-56" />
              <div className="flex gap-2"><div className="skeleton h-5 w-16" /><div className="skeleton h-5 w-24" /></div>
            </div>
            <div className="skeleton h-5 w-20 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
