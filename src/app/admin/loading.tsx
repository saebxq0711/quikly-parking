/** Esqueleto mientras carga una pantalla del SuperAdmin. */
export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-label="Cargando">
      <div className="mb-6 space-y-2.5">
        <div className="skeleton h-6 w-52" />
        <div className="skeleton h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        {[0, 1, 2, 3].map((tarjeta) => (
          <div
            key={tarjeta}
            className="rounded-xl bg-[var(--surface-raised)] p-5 ring-1 ring-[var(--line-subtle)]"
          >
            <div className="skeleton h-4 w-40" />
            <div className="skeleton mt-3 h-3 w-72 max-w-full" />
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="skeleton h-10" />
              <div className="skeleton h-10" />
              <div className="skeleton h-10" />
              <div className="skeleton h-10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
