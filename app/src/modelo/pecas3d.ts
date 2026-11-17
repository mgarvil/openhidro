// Peças 3D paramétricas (Three.js): tubos, conexões, registros e reservatórios gerados a partir da
// rede montada e dos diâmetros. As dimensões são aproximadas pelo DN (diâmetro externo do tubo
// soldável); não reproduzem modelos de fabricante. Sistema de coordenadas do Three: Y para cima,
// em metros, com origem deslocada para o centro do projeto (precisão em float32).
import * as THREE from "three";
import type { Desenho } from "../dxf/carregar";
import { ehSegmento, type Elemento } from "./elementos";
import type { RedeMontada } from "./rede";
import type { Pavimento } from "../projeto";

export interface Entrada3D {
  elementos: Elemento[];
  pavimentos: Pavimento[];
  escala: number;                                   // m por unidade do desenho
  redes: { montada: Pick<RedeMontada, "grafo">; dn: Map<string, number> | null; esgoto?: boolean }[];
  desenhos: Map<string, Desenho>;
}

const MAT = {
  tubo: new THREE.MeshStandardMaterial({ color: 0x9b5a34, roughness: 0.55, metalness: 0.05 }),
  conexao: new THREE.MeshStandardMaterial({ color: 0x7d4426, roughness: 0.5, metalness: 0.05 }),
  azul: new THREE.MeshStandardMaterial({ color: 0x2d62d6, roughness: 0.45, metalness: 0.1 }),
  latao: new THREE.MeshStandardMaterial({ color: 0xc9a23a, roughness: 0.3, metalness: 0.8 }),
  cromo: new THREE.MeshStandardMaterial({ color: 0xd9dde3, roughness: 0.15, metalness: 0.9 }),
  caixa: new THREE.MeshStandardMaterial({ color: 0x1d4fa3, roughness: 0.5, metalness: 0.05 }),
  solto: new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.6 }),
  esgoto: new THREE.MeshStandardMaterial({ color: 0xe4e1d6, roughness: 0.5, metalness: 0.02 }),
  esgotoConexao: new THREE.MeshStandardMaterial({ color: 0xcfcabb, roughness: 0.5 }),
};
const Y = new THREE.Vector3(0, 1, 0);

export interface Modelo3D { grupo: THREE.Group; origem: { x: number; y: number }; caixa: THREE.Box3 }

export function construir3D(e: Entrada3D): Modelo3D {
  const g = new THREE.Group();
  g.name = "OpenHidro";
  const cota = new Map(e.pavimentos.map((p) => [p.id, p.cota]));
  // origem: centro dos elementos
  const xs: number[] = [], ys: number[] = [];
  for (const el of e.elementos) {
    if (ehSegmento(el)) { xs.push(el.x1, el.x2); ys.push(el.y1, el.y2); } else { xs.push(el.x); ys.push(el.y); }
  }
  const ox = xs.length ? ((Math.min(...xs) + Math.max(...xs)) / 2) * e.escala : 0;
  const oy = ys.length ? ((Math.min(...ys) + Math.max(...ys)) / 2) * e.escala : 0;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x - ox, z, -(y - oy));   // metros -> Three
  const porEl = new Map(e.elementos.map((x) => [x.id, x]));
  const usados = new Set<string>();

  for (const { montada, dn, esgoto } of e.redes) {
    const matTubo = esgoto ? MAT.esgoto : MAT.tubo, matCon = esgoto ? MAT.esgotoConexao : MAT.conexao;
    const G = montada.grafo;
    const dnAresta = (a: { trecho: string; el?: string }) => {
      const t = a.el ? porEl.get(a.el) : null;
      return dn?.get(a.trecho) ?? (t && ehSegmento(t) && t.dn ? t.dn : esgoto ? 100 : 25);
    };
    const inc = new Map<number, { o: number; dn: number }[]>();
    for (const a of G.arestas) {
      if (a.el) usados.add(a.el);
      const d = dnAresta(a);
      const p = G.nos[a.a], q = G.nos[a.b];
      g.add(tubo(V(p.x, p.y, p.z), V(q.x, q.y, q.z), d, matTubo, `Tubo ${esgoto ? "esgoto " : ""}ø${d}`));
      (inc.get(a.a) ?? inc.set(a.a, []).get(a.a)!).push({ o: a.b, dn: d });
      (inc.get(a.b) ?? inc.set(a.b, []).get(a.b)!).push({ o: a.a, dn: d });
    }
    for (const n of G.nos) {
      const es = inc.get(n.i) ?? [];
      const c = V(n.x, n.y, n.z);
      const dirs = es.map((x) => V(G.nos[x.o].x, G.nos[x.o].y, G.nos[x.o].z).sub(c).normalize());
      const reta = es.length === 2 && dirs[0].dot(dirs[1]) < -0.98;
      if (n.res) {
        const el = porEl.get(n.res);
        if (el?.tipo === "reservatorio") { g.add(reservatorio(c, el.rotulo ?? "Reservatório")); continue; }
        if (el?.tipo === "caixa_esgoto") {
          const lado = el.modelo === "inspecao" || el.modelo === "gordura" ? 0.6 : el.modelo === "ralo" ? 0.1 : 0.15;
          const cx = new THREE.Mesh(new THREE.BoxGeometry(lado, lado * 1.2, lado), el.modelo === "inspecao" || el.modelo === "gordura" ? MAT.solto : MAT.esgotoConexao);
          cx.position.set(c.x, c.y + lado * 0.3, c.z); cx.name = el.modelo === "sifonada" ? "Caixa sifonada" : el.modelo === "ralo" ? "Ralo" : "Caixa";
          g.add(cx);
          continue;
        }
        if (el?.tipo === "saida_esgoto") continue;
      }
      if (n.reg && es.length) {
        const el = porEl.get(n.reg);
        g.add(registro(c, dirs[0], Math.max(...es.map((x) => x.dn)), el?.tipo === "registro" ? el.modelo : "gaveta"));
        if (reta) continue;
      }
      if (!es.length || (reta && es[0].dn === es[1].dn)) continue;
      const mat = n.ap && !esgoto ? MAT.azul : matCon;
      g.add(conexao(c, dirs, es.map((x) => x.dn), mat, n.ap ? "Conexão com bucha de latão" : nomeConexao(es.length, reta)));
      if (n.ap && !esgoto) {
        // saída roscada do ponto: horizontal, no sentido em que o ramal chegava
        let h = new THREE.Vector3(1, 0, 0);
        let k = G.pai[n.i];
        for (let i = 0; i < 3 && k !== undefined; i++) {
          const pk = G.pai[k];
          if (pk === undefined) break;
          const v = V(G.nos[k].x, G.nos[k].y, G.nos[k].z).sub(V(G.nos[pk].x, G.nos[pk].y, G.nos[pk].z));
          v.y = 0;
          if (v.lengthSq() > 1e-8) { h = v.normalize(); break; }
          k = pk;
        }
        const r = es[0].dn / 2000;
        g.add(cilindro(c.clone(), c.clone().addScaledVector(h, r * 3.2), r * 0.9, MAT.latao, "Bucha de latão"));
      }
    }
  }
  // tubos que não pertencem a nenhuma rede calculável (sem reservatório etc.)
  for (const el of e.elementos) {
    if (!ehSegmento(el) || usados.has(el.id) || !cota.has(el.pavimentoId)) continue;
    const z = (cota.get(el.pavimentoId) ?? 0) + el.altura;
    g.add(tubo(V(el.x1 * e.escala, el.y1 * e.escala, z), V(el.x2 * e.escala, el.y2 * e.escala, z), el.dn ?? (el.tipo === "tubo" ? 25 : 100), MAT.solto, "Tubo sem rede"));
  }

  const caixa = new THREE.Box3().setFromObject(g);
  // plantas de fundo de cada pavimento, recortadas ao redor da tubulação
  if (!caixa.isEmpty()) {
    const m = 4;
    const bx0 = caixa.min.x + ox - m, bx1 = caixa.max.x + ox + m, by0 = -caixa.max.z + oy - m, by1 = -caixa.min.z + oy + m;
    for (const p of e.pavimentos) {
      const d = e.desenhos.get(p.id);
      if (!d) continue;
      const ocultas = new Set(p.fundo?.camadasOcultas ?? []);
      const pos: number[] = [];
      for (const c of d.camadas.values()) {
        if (ocultas.has(c.nome)) continue;
        const s = c.segmentos;
        for (let i = 0; i < s.length && pos.length < 600000; i += 4) {
          const xa = s[i] * e.escala, ya = s[i + 1] * e.escala, xb = s[i + 2] * e.escala, yb = s[i + 3] * e.escala;
          if (Math.max(xa, xb) < bx0 || Math.min(xa, xb) > bx1 || Math.max(ya, yb) < by0 || Math.min(ya, yb) > by1) continue;
          pos.push(xa - ox, p.cota, -(ya - oy), xb - ox, p.cota, -(yb - oy));
        }
      }
      if (!pos.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      const linhas = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x5c6573, transparent: true, opacity: 0.7 }));
      linhas.name = `Planta ${p.nome}`;
      linhas.userData.fundo = true;
      g.add(linhas);
    }
  }
  return { grupo: g, origem: { x: ox, y: oy }, caixa };
}

const nomeConexao = (n: number, reta: boolean) => (n >= 3 ? "Tê" : reta ? "Bucha de redução" : n === 2 ? "Joelho" : "Cap");

function cilindro(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, nome: string, seg = 20): THREE.Mesh {
  const L = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(L, 1e-4), seg), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  if (L > 1e-6) m.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize());
  m.name = nome;
  return m;
}

function tubo(a: THREE.Vector3, b: THREE.Vector3, dn: number, mat: THREE.Material, nome: string) {
  return cilindro(a, b, dn / 2000, mat, nome);
}

/** Conexão: uma bolsa em cada saída + núcleo esférico. */
function conexao(c: THREE.Vector3, dirs: THREE.Vector3[], dns: number[], mat: THREE.Material, nome: string) {
  const g = new THREE.Group();
  g.name = nome;
  const rmax = Math.max(...dns) / 2000;
  const nucleo = new THREE.Mesh(new THREE.SphereGeometry(rmax * 1.28, 20, 14), mat);
  nucleo.position.copy(c);
  g.add(nucleo);
  dirs.forEach((d, i) => {
    const r = dns[i] / 2000;
    g.add(cilindro(c, c.clone().addScaledVector(d, Math.max(r * 2.6, 0.022)), r * 1.28, mat, "Bolsa"));
  });
  return g;
}

function registro(c: THREE.Vector3, eixo: THREE.Vector3, dn: number, modelo: string) {
  const g = new THREE.Group();
  g.name = modelo === "pressao" ? "Registro de pressão" : modelo === "esfera" ? "Registro de esfera" : "Registro de gaveta";
  const r = dn / 2000;
  g.add(cilindro(c.clone().addScaledVector(eixo, -r * 2.2), c.clone().addScaledVector(eixo, r * 2.2), r * 1.45, modelo === "esfera" ? MAT.conexao : MAT.latao, "Corpo"));
  // haste perpendicular ao tubo (para cima se o tubo é horizontal; senão, para fora)
  const perp = Math.abs(eixo.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const topo = c.clone().addScaledVector(perp, r * 4.2);
  g.add(cilindro(c, topo, r * 0.45, MAT.latao, "Haste"));
  const volante = new THREE.Mesh(new THREE.CylinderGeometry(r * 2.2, r * 2.2, r * 0.6, 24), modelo === "esfera" ? MAT.azul : MAT.cromo);
  volante.position.copy(topo);
  volante.quaternion.setFromUnitVectors(Y, perp);
  g.add(volante);
  return g;
}

/** Caixa d'água cilíndrica genérica (1000 L) apoiada com a saída no fundo. */
function reservatorio(c: THREE.Vector3, nome: string) {
  const g = new THREE.Group();
  g.name = nome;
  const R = 0.62, H = 0.78;
  const corpo = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.86, H, 40), MAT.caixa);
  corpo.position.set(c.x, c.y + H / 2, c.z);
  const tampa = new THREE.Mesh(new THREE.ConeGeometry(R * 1.04, 0.22, 40), MAT.caixa);
  tampa.position.set(c.x, c.y + H + 0.11, c.z);
  g.add(corpo, tampa);
  return g;
}
