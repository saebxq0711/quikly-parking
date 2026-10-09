/**
 * Contador por ventana de tiempo en la memoria del proceso.
 *
 * Por si solo no basta en Vercel (cada instancia cuenta aparte), pero es
 * instantaneo y no cuesta una consulta: lo usa el middleware como primera
 * barrera contra rafagas, y el limitador compartido como respaldo cuando la
 * base no responde. Lo que tiene que valer entre instancias va a `limiter.ts`.
 */

interface Ventana {
  count: number;
  resetAt: number;
}

export class MemoryWindow {
  private readonly ventanas = new Map<string, Ventana>();
  private ultimaLimpieza = Date.now();

  constructor(private readonly maxKeys = 50_000) {}

  /** Suma `weight` a la llave y devuelve el total de la ventana vigente. */
  hit(key: string, windowMs: number, weight = 1): { count: number; resetAt: number } {
    const ahora = Date.now();
    this.limpiar(ahora);

    const actual = this.ventanas.get(key);
    if (!actual || actual.resetAt <= ahora) {
      const nueva = { count: weight, resetAt: ahora + windowMs };
      this.ventanas.set(key, nueva);
      return nueva;
    }
    actual.count += weight;
    return actual;
  }

  reset(key: string): void {
    this.ventanas.delete(key);
  }

  /** Borra lo vencido; si aun asi hay demasiadas llaves (inundacion), vacia. */
  private limpiar(ahora: number): void {
    if (ahora - this.ultimaLimpieza < 30_000 && this.ventanas.size < this.maxKeys) return;
    this.ultimaLimpieza = ahora;
    for (const [key, ventana] of this.ventanas) {
      if (ventana.resetAt <= ahora) this.ventanas.delete(key);
    }
    // Miles de IPs distintas a la vez: mejor perder cuentas que la memoria.
    if (this.ventanas.size >= this.maxKeys) this.ventanas.clear();
  }
}
