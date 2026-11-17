// Leitura de DXF para desenho de fundo.
// Converte todas as entidades (inclusive dentro de blocos) em segmentos de reta agrupados por
// camada — o formato mais rápido para desenhar na GPU — e coleta os textos à parte.
import DxfParser from "dxf-parser";

export interface Texto {
  x: number;
  y: number;
  altura: number;
  rotacao: number; // radianos
  texto: string;
  camada: string;
}

export interface CamadaDesenho {
  nome: string;
  cor: number; // RGB 0xRRGGBB
  segmentos: number[]; // x1,y1,x2,y2,...
  textos: Texto[];
  entidades: number;
}

export interface Desenho {
  nome: string;
  unidade: string;
  camadas: Map<string, CamadaDesenho>;
  extensao: { xmin: number; ymin: number; xmax: number; ymax: number };
  extensaoPrincipal: { xmin: number; ymin: number; xmax: number; ymax: number };
  totalSegmentos: number;
  avisos: string[];
}

type M = [number, number, number, number, number, number]; // matriz afim 2D [a b c d e f]
const ID: M = [1, 0, 0, 1, 0, 0];
const mul = (p: M, q: M): M => [
  p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5],
];
const ap = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

// Cores ACI básicas (as mais usadas); demais índices caem em cinza.
const ACI: Record<number, number> = {
  1: 0xff0000, 2: 0xffff00, 3: 0x00ff00, 4: 0x00ffff, 5: 0x0000ff, 6: 0xff00ff, 7: 0xffffff,
  8: 0x808080, 9: 0xc0c0c0, 250: 0x333333, 251: 0x505050, 252: 0x696969, 253: 0x828282, 254: 0xbebebe, 255: 0xffffff,
};

const UNIDADES: Record<number, string> = { 0: "sem unidade", 1: "pol", 2: "pés", 4: "mm", 5: "cm", 6: "m" };

export function decodificarDxf(bytes: Uint8Array): string {
  // DXF até 2004 (AC1018) usa a página de código do cabeçalho (no Brasil, quase sempre ANSI_1252);
  // a partir de 2007 (AC1021) o arquivo é UTF-8.
  const cab = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 20000)));
  const ver = /\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*(AC\d+)/.exec(cab)?.[1] ?? "AC1032";
  const novo = parseInt(ver.slice(2), 10) >= 1021;
  return new TextDecoder(novo ? "utf-8" : "windows-1252").decode(bytes);
}

export function carregarDxf(texto: string, nome: string): Desenho {
  const parser = new DxfParser();
  const dxf: any = parser.parseSync(texto);
  if (!dxf) throw new Error("Arquivo DXF inválido");
  const avisos: string[] = [];
  const naoSuportadas = new Map<string, number>();
  const camadasTab: Record<string, any> = dxf.tables?.layer?.layers ?? {};
  const camadas = new Map<string, CamadaDesenho>();

  const camada = (nomeC: string): CamadaDesenho => {
    let c = camadas.get(nomeC);
    if (!c) {
      const t = camadasTab[nomeC];
      let cor = typeof t?.color === "number" ? t.color : ACI[t?.colorIndex] ?? 0xc0c0c0;
      if (cor === 0x000000) cor = 0xffffff;
      c = { nome: nomeC, cor, segmentos: [], textos: [], entidades: 0 };
      camadas.set(nomeC, c);
    }
    return c;
  };

  const linha = (c: CamadaDesenho, m: M, x1: number, y1: number, x2: number, y2: number) => {
    const a = ap(m, x1, y1), b = ap(m, x2, y2);
    if (!isFinite(a[0] + a[1] + b[0] + b[1])) return;
    c.segmentos.push(a[0], a[1], b[0], b[1]);
  };

  const arco = (c: CamadaDesenho, m: M, cx: number, cy: number, r: number, a0: number, a1: number) => {
    while (a1 <= a0) a1 += Math.PI * 2;
    const n = Math.max(8, Math.min(96, Math.ceil(((a1 - a0) / (Math.PI * 2)) * 64)));
    let px = cx + r * Math.cos(a0), py = cy + r * Math.sin(a0);
    for (let i = 1; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      linha(c, m, px, py, x, y);
      px = x; py = y;
    }
  };

  const poli = (c: CamadaDesenho, m: M, vs: any[], fechada: boolean) => {
    const n = vs.length;
    const lim = fechada ? n : n - 1;
    for (let i = 0; i < lim; i++) {
      const p = vs[i], q = vs[(i + 1) % n];
      const b = p.bulge ?? 0;
      if (Math.abs(b) < 1e-9) {
        linha(c, m, p.x, p.y, q.x, q.y);
      } else {
        // segmento em arco (bulge = tan(θ/4))
        const th = 4 * Math.atan(b);
        const dx = q.x - p.x, dy = q.y - p.y, corda = Math.hypot(dx, dy);
        const r = corda / (2 * Math.sin(Math.abs(th) / 2));
        const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
        const h = r * Math.cos(th / 2) * Math.sign(b);
        const cx = mx - (h * dy) / corda, cy = my + (h * dx) / corda;
        let a0 = Math.atan2(p.y - cy, p.x - cx), a1 = Math.atan2(q.y - cy, q.x - cx);
        if (b < 0) [a0, a1] = [a1, a0];
        arco(c, m, cx, cy, Math.abs(r), a0, a1);
      }
    }
  };

  const desenhar = (ents: any[], m: M, camadaPai: string | null, prof: number) => {
    if (prof > 12) return;
    for (const e of ents) {
      if (e.inPaperSpace) continue;
      const nomeC = e.layer === "0" && camadaPai ? camadaPai : e.layer ?? "0";
      const c = camada(nomeC);
      c.entidades++;
      try {
        switch (e.type) {
          case "LINE":
            linha(c, m, e.vertices[0].x, e.vertices[0].y, e.vertices[1].x, e.vertices[1].y);
            break;
          case "LWPOLYLINE":
          case "POLYLINE":
            if (e.vertices?.length > 1) poli(c, m, e.vertices, !!e.shape);
            break;
          case "CIRCLE":
            arco(c, m, e.center.x, e.center.y, e.radius, 0, Math.PI * 2);
            break;
          case "ARC":
            arco(c, m, e.center.x, e.center.y, e.radius, e.startAngle, e.endAngle);
            break;
          case "ELLIPSE": {
            const ax = e.majorAxisEndPoint.x, ay = e.majorAxisEndPoint.y;
            const ra = Math.hypot(ax, ay), rb = ra * e.axisRatio, rot = Math.atan2(ay, ax);
            let t0 = e.startAngle ?? 0, t1 = e.endAngle ?? Math.PI * 2;
            while (t1 <= t0) t1 += Math.PI * 2;
            const n = 48;
            const pt = (t: number): [number, number] => {
              const x = ra * Math.cos(t), y = rb * Math.sin(t);
              return [e.center.x + x * Math.cos(rot) - y * Math.sin(rot), e.center.y + x * Math.sin(rot) + y * Math.cos(rot)];
            };
            let [px, py] = pt(t0);
            for (let i = 1; i <= n; i++) {
              const [x, y] = pt(t0 + ((t1 - t0) * i) / n);
              linha(c, m, px, py, x, y);
              px = x; py = y;
            }
            break;
          }
          case "SPLINE": {
            const pts = e.fitPoints?.length ? e.fitPoints : e.controlPoints ?? [];
            for (let i = 0; i < pts.length - 1; i++) linha(c, m, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
            break;
          }
          case "SOLID":
          case "3DFACE": {
            const p = e.points ?? e.vertices ?? [];
            if (p.length >= 3) {
              const ord = e.type === "SOLID" && p.length === 4 ? [p[0], p[1], p[3], p[2]] : p;
              for (let i = 0; i < ord.length; i++) linha(c, m, ord[i].x, ord[i].y, ord[(i + 1) % ord.length].x, ord[(i + 1) % ord.length].y);
            }
            break;
          }
          case "TEXT":
          case "MTEXT":
          case "ATTDEF": {
            if (e.type === "ATTDEF") break; // definição de atributo não aparece no desenho
            const p = e.type === "TEXT" ? (e.halign || e.valign ? e.endPoint ?? e.startPoint : e.startPoint) : e.position;
            if (!p) break;
            const [x, y] = ap(m, p.x, p.y);
            const escala = Math.hypot(m[0], m[1]);
            const rotM = Math.atan2(m[1], m[0]);
            let rot = (e.rotation ?? 0) * (Math.PI / 180);
            if (e.type === "MTEXT" && e.directionVector) rot = Math.atan2(e.directionVector.y, e.directionVector.x);
            const t = limparMtext(String(e.text ?? ""));
            if (t) c.textos.push({ x, y, altura: (e.textHeight ?? e.height ?? 1) * escala, rotacao: rot + rotM, texto: t, camada: nomeC });
            break;
          }
          case "INSERT":
          case "DIMENSION": {
            const nb = e.type === "INSERT" ? e.name : e.block;
            const b = dxf.blocks?.[nb];
            if (!b?.entities?.length) break;
            let mb: M = ID;
            if (e.type === "INSERT") {
              const r = ((e.rotation ?? 0) * Math.PI) / 180;
              const sx = e.xScale ?? 1, sy = e.yScale ?? 1;
              const cs = Math.cos(r), sn = Math.sin(r);
              const bp = b.position ?? { x: 0, y: 0 };
              mb = mul([cs, sn, -sn, cs, e.position.x, e.position.y], mul([sx, 0, 0, sy, 0, 0], [1, 0, 0, 1, -bp.x, -bp.y]));
            }
            desenhar(b.entities, mul(m, mb), nomeC, prof + 1);
            break;
          }
          case "POINT":
          case "VERTEX":
            break;
          default:
            naoSuportadas.set(e.type, (naoSuportadas.get(e.type) ?? 0) + 1);
        }
      } catch {
        naoSuportadas.set(e.type + " (erro)", (naoSuportadas.get(e.type + " (erro)") ?? 0) + 1);
      }
    }
  };

  desenhar(dxf.entities ?? [], ID, null, 0);

  for (const [t, n] of naoSuportadas) avisos.push(`${n} entidade(s) ${t} não exibida(s)`);
  for (const [k, c] of camadas) if (!c.segmentos.length && !c.textos.length) camadas.delete(k);

  // extensão total e extensão "principal" (ignora pontos isolados muito distantes)
  const xs: number[] = [], ys: number[] = [];
  let total = 0;
  for (const c of camadas.values()) {
    total += c.segmentos.length / 4;
    const passo = Math.max(2, Math.floor(c.segmentos.length / 20000) * 2);
    for (let i = 0; i < c.segmentos.length; i += passo) { xs.push(c.segmentos[i]); ys.push(c.segmentos[i + 1]); }
    for (const t of c.textos) { xs.push(t.x); ys.push(t.y); }
  }
  if (!xs.length) throw new Error("O DXF não tem entidades desenháveis no espaço do modelo");
  const ord = (a: number[]) => a.slice().sort((p, q) => p - q);
  const sx = ord(xs), sy = ord(ys);
  const q = (a: number[], f: number) => a[Math.min(a.length - 1, Math.max(0, Math.floor(f * (a.length - 1))))];
  const extensao = { xmin: sx[0], ymin: sy[0], xmax: sx[sx.length - 1], ymax: sy[sy.length - 1] };
  const extensaoPrincipal = { xmin: q(sx, 0.005), ymin: q(sy, 0.005), xmax: q(sx, 0.995), ymax: q(sy, 0.995) };
  const unidade = UNIDADES[Number(dxf.header?.$INSUNITS ?? 0)] ?? "sem unidade";

  return { nome, unidade, camadas, extensao, extensaoPrincipal, totalSegmentos: total, avisos };
}

function limparMtext(s: string): string {
  return s
    .replace(/\\P/g, " ")
    .replace(/\\[A-Za-z][^;\\]*;/g, "")
    .replace(/[{}]/g, "")
    .replace(/%%[cC]/g, "Ø").replace(/%%[dD]/g, "°").replace(/%%[pP]/g, "±")
    .trim();
}
