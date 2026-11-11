/** Instant feedback while a signed-in page streams in (shown on every tab tap). */
export default function Loading() {
  return (
    <div className="mx-auto grid max-w-5xl gap-5" role="status" aria-label="Loading">
      <div className="flex items-center gap-3">
        <div className="skeleton size-12 !rounded-full" />
        <div className="grid gap-2"><div className="skeleton h-3.5 w-24" /><div className="skeleton h-6 w-44" /></div>
      </div>
      <div className="card grid gap-3 p-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton size-11 !rounded-full" />
            <div className="grid flex-1 gap-2"><div className="skeleton h-3.5 w-1/3" /><div className="skeleton h-3 w-2/3" /></div>
          </div>
        ))}
      </div>
      <div className="card h-40 p-5"><div className="skeleton h-full w-full" /></div>
    </div>
  );
}
