/** Esqueleto del panel mientras llegan los datos del parqueadero por el tunel. */
export default function PanelLoading() {
  return (
    <div aria-busy="true" aria-label="Cargando">
      <div className="mb-6 space-y-2.5">
        <div className="skeleton h-6 w-48" />
        <div className="skeleton h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((cifra) => (
          <div
            key={cifra}
            className="rounded-xl bg-[var(--surface-raised)] p-5 ring-1 ring-[var(--line-subtle)]"
          >
            <div className="skeleton h-3 w-24" />
            <div className="skeleton mt-3 h-8 w-20" />
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-xl bg-[var(--surface-raised)] ring-1 ring-[var(--line-subtle)]">
        <div className="border-b border-[var(--line-subtle)] px-5 py-4">
          <div className="skeleton h-4 w-40" />
        </div>
        <div className="space-y-3 p-5">
          {[0, 1, 2, 3, 4, 5].map((fila) => (
            <div key={fila} className="skeleton h-9" />
          ))}
        </div>
      </div>
    </div>
  );
}
