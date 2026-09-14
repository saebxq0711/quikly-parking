/** Cada pantalla del panel entra con un movimiento corto, en vez de aparecer de golpe. */
export default function PanelTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
