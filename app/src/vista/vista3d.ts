// Vista 3D (perspectiva) do modelo: girar com o botão esquerdo, mover com o direito, zoom na roda.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Modelo3D } from "../modelo/pecas3d";

export class Vista3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly cena = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.02, 5000);
  private controles: OrbitControls;
  private modelo: Modelo3D | null = null;
  private pendente = false;
  ativo = false;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x15191f);
    this.renderer.domElement.className = "v3d";
    host.appendChild(this.renderer.domElement);
    this.cena.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3027, 1.6));
    const sol = new THREE.DirectionalLight(0xffffff, 1.6);
    sol.position.set(8, 14, 6);
    this.cena.add(sol);
    this.controles = new OrbitControls(this.camera, this.renderer.domElement);
    this.controles.enableDamping = false;
    this.controles.addEventListener("change", () => this.agendar());
    new ResizeObserver(() => this.redimensionar()).observe(host);
    this.redimensionar();
  }

  definirModelo(m: Modelo3D) {
    if (this.modelo) {
      this.cena.remove(this.modelo.grupo);
      this.modelo.grupo.traverse((o: any) => o.geometry?.dispose?.());
    }
    this.modelo = m;
    this.cena.add(m.grupo);
    this.agendar();
  }

  get grupo() { return this.modelo?.grupo ?? null; }

  /** Vista isométrica enquadrando a tubulação. */
  enquadrar() {
    const c = this.modelo?.caixa;
    if (!c || c.isEmpty()) { this.camera.position.set(10, 10, 10); this.controles.target.set(0, 0, 0); this.controles.update(); return; }
    const centro = c.getCenter(new THREE.Vector3());
    const tam = c.getSize(new THREE.Vector3()).length() || 5;
    this.controles.target.copy(centro);
    this.camera.position.copy(centro).add(new THREE.Vector3(1, 0.9, 1).normalize().multiplyScalar(tam * 0.75));
    this.camera.near = tam / 500; this.camera.far = tam * 50;
    this.camera.updateProjectionMatrix();
    this.controles.update();
    this.agendar();
  }

  /** Olha para um ponto (coordenadas do Three) a uma distância dada. */
  olhar(alvo: THREE.Vector3, dist: number) {
    this.controles.target.copy(alvo);
    this.camera.position.copy(alvo).add(new THREE.Vector3(1, 0.8, 1).normalize().multiplyScalar(dist));
    this.controles.update();
    this.agendar();
  }

  mostrar(sim: boolean) {
    this.ativo = sim;
    this.renderer.domElement.style.display = sim ? "block" : "none";
    if (sim) { this.redimensionar(); this.agendar(); }
  }

  private redimensionar() {
    const r = this.host.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.agendar();
  }

  private agendar() {
    if (this.pendente || !this.ativo) return;
    this.pendente = true;
    requestAnimationFrame(() => { this.pendente = false; this.renderer.render(this.cena, this.camera); });
  }
}
