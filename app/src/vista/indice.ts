// Índice espacial (grade uniforme) das pontas de linha da planta de fundo, para o snap na arquitetura.
import type { Desenho } from "../dxf/carregar";

export class IndicePontas {
  private celulas = new Map<string, number[]>();   // [x, y, camada, x, y, camada, ...]
  private camadas: string[] = [];
  constructor(d: Desenho, private tam: number) {
    const vistos = new Set<string>();
    let ci = 0;
    for (const c of d.camadas.values()) {
      this.camadas.push(c.nome);
      const s = c.segmentos;
      for (let i = 0; i < s.length; i += 2) {
        const x = s[i], y = s[i + 1];
        const k = `${Math.round(x / tam * 1000)}|${Math.round(y / tam * 1000)}|${ci}`;
        if (vistos.has(k)) continue;   // segmentos de polilinha repetem os vértices
        vistos.add(k);
        const ck = `${Math.floor(x / tam)}|${Math.floor(y / tam)}`;
        let a = this.celulas.get(ck);
        if (!a) this.celulas.set(ck, (a = []));
        a.push(x, y, ci);
      }
      ci++;
    }
  }

  /** Ponta de linha mais próxima de (x, y) dentro de tol, só nas camadas visíveis. */
  maisProximo(x: number, y: number, tol: number, ocultas: Set<string>): [number, number] | null {
    if (tol > this.tam * 4) return null;     // muito afastado: o snap na planta não ajuda
    let melhor: [number, number] | null = null, dmin = tol;
    const r = Math.ceil(tol / this.tam);
    const cx = Math.floor(x / this.tam), cy = Math.floor(y / this.tam);
    for (let i = cx - r; i <= cx + r; i++) for (let j = cy - r; j <= cy + r; j++) {
      const a = this.celulas.get(`${i}|${j}`);
      if (!a) continue;
      for (let k = 0; k < a.length; k += 3) {
        const d = Math.hypot(a[k] - x, a[k + 1] - y);
        if (d < dmin && !ocultas.has(this.camadas[a[k + 2]])) { dmin = d; melhor = [a[k], a[k + 1]]; }
      }
    }
    return melhor;
  }
}
