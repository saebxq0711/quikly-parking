/** Cada pantalla del SuperAdmin entra con un movimiento corto, en vez de aparecer de golpe. */
export default function AdminTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
