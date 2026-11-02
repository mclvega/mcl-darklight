import * as THREE from 'three';
import { AVISO_APAGADO, COLOR_LUZ, MATERIALES, MATERIALES_ORDEN, radioLuz, type IdMaterial, type Luz } from '../core/luces';
import { MONSTRUOS, type TipoMonstruo } from '../core/monstruos';
import { animateWalk, createAvatar, type Look } from './characters';
import { caida, RADIO_DESTELLO, type Monstruo, type Partida } from './logica';

/*
 * Dibujo de la noche con three.js.
 * La oscuridad no usa una PointLight por cada luz (cada una encarece todos los materiales):
 * la simulación pinta un mapa de luz de baja resolución (DataTexture) y todos los materiales Lambert
 * del mundo lo leen por su posición XZ con un parche `onBeforeCompile`. Las llamas y los ojos de los
 * monstruos usan MeshBasicMaterial y se ven siempre.
 */

const U = {
  uLuz: { value: null as THREE.Texture | null },
  uOrigen: { value: new THREE.Vector2() },
  uTam: { value: 1 },
  /** Luz de luna mínima (azulada) para intuir siluetas. */
  uAmb: { value: new THREE.Vector3(0.025, 0.032, 0.065) },
  /** 0 fuera de la partida (p. ej. la vista previa del personaje comparte materiales). */
  uActivo: { value: 0 },
};

/** Hace que un material Lambert se oscurezca según el mapa de luz. */
function oscurecer(m: THREE.Material) {
  if (m.userData.oscuro || !(m as THREE.MeshLambertMaterial).isMeshLambertMaterial) return;
  m.userData.oscuro = true;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec2 vMundoXZ;\n' + sh.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      {
        vec4 pm = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          pm = instanceMatrix * pm;
        #endif
        vMundoXZ = (modelMatrix * pm).xz;
      }`,
    );
    sh.fragmentShader = 'uniform sampler2D uLuz;\nuniform vec2 uOrigen;\nuniform float uTam;\nuniform vec3 uAmb;\nuniform float uActivo;\nvarying vec2 vMundoXZ;\n' + sh.fragmentShader.replace(
      '#include <opaque_fragment>',
      `#include <opaque_fragment>
      if (uActivo > 0.5) gl_FragColor.rgb *= max(uAmb, texture2D(uLuz, (vMundoXZ - uOrigen) / uTam).rgb);`,
    );
  };
  m.customProgramCacheKey = () => 'oscuro';
  m.needsUpdate = true;
}

function oscurecerTodo(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (Array.isArray(m)) m.forEach(oscurecer);
    else if (m) oscurecer(m);
  });
}

const cacheLambert = new Map<number, THREE.MeshLambertMaterial>();
function lambert(color: number) {
  let m = cacheLambert.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    oscurecer(m);
    cacheLambert.set(color, m);
  }
  return m;
}
const cacheBasico = new Map<string, THREE.MeshBasicMaterial>();
function basico(color: number, opacidad = 1, aditivo = false) {
  const k = `${color}-${opacidad}-${aditivo}`;
  let m = cacheBasico.get(k);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: opacidad < 1 || aditivo, opacity: opacidad, depthWrite: !aditivo, blending: aditivo ? THREE.AdditiveBlending : THREE.NormalBlending });
    cacheBasico.set(k, m);
  }
  return m;
}

const malla = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const me = new THREE.Mesh(g, m);
  me.position.set(x, y, z);
  return me;
};

// Geometrías compartidas (no se liberan nunca).
const G = {
  tronco: new THREE.CylinderGeometry(0.16, 0.24, 1.4, 6).translate(0, 0.7, 0),
  copa: new THREE.ConeGeometry(1.15, 2.4, 7).translate(0, 2.4, 0),
  copa2: new THREE.ConeGeometry(0.85, 1.7, 7).translate(0, 3.3, 0),
  roca: new THREE.DodecahedronGeometry(1, 0),
  pilar: new THREE.BoxGeometry(0.7, 1, 0.7).translate(0, 0.5, 0),
  base: new THREE.CylinderGeometry(0.42, 0.55, 0.3, 8).translate(0, 0.15, 0),
  poste: new THREE.CylinderGeometry(0.07, 0.09, 1, 6).translate(0, 0.8, 0),
  cuenco: new THREE.CylinderGeometry(0.34, 0.18, 0.22, 8).translate(0, 1.38, 0),
  piedraMadre: new THREE.DodecahedronGeometry(0.28, 0),
  lena: new THREE.CylinderGeometry(0.08, 0.08, 1, 5).rotateZ(Math.PI / 2),
  nivel: new THREE.BoxGeometry(0.12, 0.12, 0.12),
  llama: new THREE.ConeGeometry(0.24, 0.7, 7).translate(0, 0.35, 0),
  nucleo: new THREE.ConeGeometry(0.12, 0.4, 6).translate(0, 0.2, 0),
  chispa: new THREE.OctahedronGeometry(0.05, 0),
  anillo: new THREE.RingGeometry(0.92, 1, 40).rotateX(-Math.PI / 2),
  ojo: new THREE.SphereGeometry(0.07, 6, 4),
  palo: new THREE.CylinderGeometry(0.035, 0.045, 0.5, 6).translate(0, 0.1, 0),
  fuegoAntorcha: new THREE.ConeGeometry(0.1, 0.3, 6).translate(0, 0.15, 0),
};

const GEO_MATERIAL: Record<IdMaterial, THREE.BufferGeometry> = {
  ramas: new THREE.BoxGeometry(0.7, 0.1, 0.12),
  carbon: new THREE.DodecahedronGeometry(0.2, 0),
  aceite: new THREE.CylinderGeometry(0.16, 0.16, 0.36, 8).translate(0, 0.1, 0),
  cristal: new THREE.OctahedronGeometry(0.24, 0).scale(1, 1.6, 1),
  piedra: new THREE.DodecahedronGeometry(0.24, 0),
  hierro: new THREE.BoxGeometry(0.34, 0.14, 0.22),
  estrella: new THREE.OctahedronGeometry(0.18, 0),
};

const MAX_MATERIALES = 400;
let matAla: THREE.MeshLambertMaterial | undefined;
const MAX_CHISPAS = 120;

interface Luz3D {
  grupo: THREE.Group;
  llama: THREE.Mesh;
  nucleo: THREE.Mesh;
  niveles: THREE.Group;
  nivel: number;
  tipo: string;
}

interface Monstruo3D {
  grupo: THREE.Group;
  cuerpo: THREE.Group;
  ojos: THREE.Mesh[];
  alas: THREE.Mesh[];
}

/** Proyección de un punto del mundo a la pantalla. */
export interface PuntoPantalla {
  x: number;
  y: number;
  visible: boolean;
}

export class Render3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly escena = new THREE.Scene();
  readonly camara = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  private readonly luna: THREE.DirectionalLight;
  private datos = new Uint8Array(4);
  private acum = new Float32Array(3);
  private lado = 1;
  private tex: THREE.DataTexture | null = null;
  private partida: Partida | null = null;
  private mundo = new THREE.Group();
  private instancias: THREE.InstancedMesh[] = [];
  /** Geometrías propias de cada noche (se liberan al montar la siguiente). */
  private desechables: THREE.BufferGeometry[] = [];
  private luces3d = new Map<number, Luz3D>();
  private monstruos3d = new Map<number, Monstruo3D>();
  private materiales3d = new Map<IdMaterial, THREE.InstancedMesh>();
  private brillos: THREE.InstancedMesh;
  private chispas: THREE.InstancedMesh;
  private destellos: THREE.Mesh[] = [];
  private jugador: THREE.Group | null = null;
  private cuerpoJugador: THREE.Group | null = null;
  private fuegoAntorcha: THREE.Mesh | null = null;
  private lookActual = '';
  private t = 0;
  private camX = 0;
  private camZ = 0;
  private readonly aux = new THREE.Object3D();
  private readonly vec = new THREE.Vector3();
  private resolucion = 128;

  constructor(lienzo: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.escena.background = new THREE.Color(0x000000);
    this.escena.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3020, 1.5));
    this.luna = new THREE.DirectionalLight(0xc8d8ff, 1.3);
    this.luna.position.set(-8, 20, 6);
    this.luna.shadow.camera.left = this.luna.shadow.camera.bottom = -22;
    this.luna.shadow.camera.right = this.luna.shadow.camera.top = 22;
    this.luna.shadow.camera.near = 1;
    this.luna.shadow.camera.far = 60;
    this.escena.add(this.luna, this.luna.target);
    this.escena.add(this.mundo);

    this.brillos = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.12, 0), basico(0xfff3b0, 0.9, true), MAX_MATERIALES);
    this.brillos.frustumCulled = false;
    this.brillos.count = 0;
    this.chispas = new THREE.InstancedMesh(G.chispa, basico(0xffb050, 1, true), MAX_CHISPAS);
    this.chispas.frustumCulled = false;
    this.chispas.count = 0;
    this.escena.add(this.brillos, this.chispas);
    for (const tipo of MATERIALES_ORDEN) {
      const im = new THREE.InstancedMesh(GEO_MATERIAL[tipo], lambert(MATERIALES[tipo].color), MAX_MATERIALES);
      im.frustumCulled = false;
      im.count = 0;
      im.castShadow = true;
      this.materiales3d.set(tipo, im);
      this.escena.add(im);
    }
  }

  ajustar(ancho: number, alto: number, ratio: number) {
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(ancho, alto, false);
    this.camara.aspect = ancho / Math.max(1, alto);
    // En pantallas estrechas se aleja la cámara para ver lo mismo a los lados.
    this.camara.fov = this.camara.aspect < 1.3 ? 55 : 45;
    this.camara.updateProjectionMatrix();
  }

  sombras(tamano: number) {
    const activas = tamano > 0;
    if (this.renderer.shadowMap.enabled !== activas) {
      this.renderer.shadowMap.enabled = activas;
      this.luna.castShadow = activas;
      this.escena.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m) m.needsUpdate = true;
      });
    }
    if (activas && this.luna.shadow.mapSize.x !== tamano) {
      this.luna.shadow.mapSize.set(tamano, tamano);
      this.luna.shadow.map?.dispose();
      this.luna.shadow.map = null;
    }
  }

  /** Resolución del mapa de luz (más baja en calidad Baja). */
  calidadLuz(baja: boolean) {
    this.resolucion = baja ? 96 : 160;
  }

  proyectar(x: number, y: number, z: number, ancho: number, alto: number): PuntoPantalla {
    this.vec.set(x, y, z).project(this.camara);
    return { x: (this.vec.x * 0.5 + 0.5) * ancho, y: (-this.vec.y * 0.5 + 0.5) * alto, visible: this.vec.z < 1 && Math.abs(this.vec.x) < 1.05 && Math.abs(this.vec.y) < 1.05 };
  }

  /* ---------- Construcción del mundo de cada noche ---------- */

  private montar(p: Partida) {
    this.partida = p;
    for (const im of this.instancias) im.dispose();
    this.instancias = [];
    for (const g of this.desechables) g.dispose();
    this.desechables = [];
    this.mundo.clear();
    for (const l of this.luces3d.values()) this.escena.remove(l.grupo);
    this.luces3d.clear();
    for (const m of this.monstruos3d.values()) this.escena.remove(m.grupo);
    this.monstruos3d.clear();

    const medio = p.mapa.medio;
    const suelo = malla(new THREE.PlaneGeometry(medio * 2 + 60, medio * 2 + 60).rotateX(-Math.PI / 2), lambert(0x34442c));
    suelo.receiveShadow = true;
    this.desechables.push(suelo.geometry);
    this.mundo.add(suelo);
    // Camino de tierra alrededor de la Hoguera madre.
    const claro = malla(new THREE.CircleGeometry(5.5, 24).rotateX(-Math.PI / 2), lambert(0x5a4a36), 0, 0.01, 0);
    claro.receiveShadow = true;
    this.desechables.push(claro.geometry);
    this.mundo.add(claro);

    // Árboles del mapa y un anillo de bosque cerrado fuera del borde.
    const arboles = p.mapa.obstaculos.filter((o) => o.tipo === 'arbol').map((o) => ({ x: o.x, z: o.z, s: o.escala * (o.r / 0.6), g: o.giro }));
    for (let i = 0, n = Math.round(medio * 1.6); i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      for (const extra of [2.5, 5.5]) {
        const d = medio + extra + ((i * 7) % 3);
        const x = Math.max(-medio - 7, Math.min(medio + 7, Math.cos(a) * d * 1.42));
        const z = Math.max(-medio - 7, Math.min(medio + 7, Math.sin(a) * d * 1.42));
        if (Math.abs(x) < medio + 1.5 && Math.abs(z) < medio + 1.5) continue;
        arboles.push({ x, z, s: 1.1 + ((i * 13) % 5) * 0.1, g: i });
      }
    }
    this.instanciar(G.tronco, lambert(0x5a3d26), arboles.map((a) => ({ x: a.x, z: a.z, s: a.s, g: a.g })));
    this.instanciar(G.copa, lambert(0x1f4a2b), arboles.map((a) => ({ x: a.x, z: a.z, s: a.s, g: a.g })));
    this.instanciar(G.copa2, lambert(0x2a5c35), arboles.map((a) => ({ x: a.x, z: a.z, s: a.s, g: a.g })));
    const rocas = p.mapa.obstaculos.filter((o) => o.tipo === 'roca');
    this.instanciar(G.roca, lambert(0x6c6c74), rocas.map((o) => ({ x: o.x, z: o.z, s: o.r, sy: o.r * 0.7, g: o.giro, y: o.r * 0.25 })));
    const ruinas = p.mapa.obstaculos.filter((o) => o.tipo === 'ruina');
    this.instanciar(G.pilar, lambert(0x8a8070), ruinas.map((o) => ({ x: o.x, z: o.z, s: o.r * 1.4, sy: 0.6 + o.escala * 1.6, g: o.giro })));
    oscurecerTodo(this.mundo);

    // Mapa de luz.
    this.lado = medio * 2 + 8;
    const n = this.resolucion;
    this.datos = new Uint8Array(n * n * 4);
    this.acum = new Float32Array(n * n * 3);
    this.tex?.dispose();
    this.tex = new THREE.DataTexture(this.datos, n, n, THREE.RGBAFormat);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.needsUpdate = true;
    U.uLuz.value = this.tex;
    U.uOrigen.value.set(-this.lado / 2, -this.lado / 2);
    U.uTam.value = this.lado;
  }

  private instanciar(geo: THREE.BufferGeometry, mat: THREE.Material, lista: Array<{ x: number; z: number; s: number; sy?: number; g: number; y?: number }>) {
    if (!lista.length) return;
    const im = new THREE.InstancedMesh(geo, mat, lista.length);
    lista.forEach((e, i) => {
      this.aux.position.set(e.x, e.y ?? 0, e.z);
      this.aux.rotation.set(0, e.g, 0);
      this.aux.scale.set(e.s, e.sy ?? e.s, e.s);
      this.aux.updateMatrix();
      im.setMatrixAt(i, this.aux.matrix);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    this.instancias.push(im);
    this.mundo.add(im);
  }

  private crearLuz(l: Luz): Luz3D {
    const grupo = new THREE.Group();
    grupo.position.set(l.x, 0, l.z);
    const piedra = lambert(0x77736c);
    if (l.madre) {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const s = malla(G.piedraMadre, piedra, Math.cos(a) * 0.85, 0.15, Math.sin(a) * 0.85);
        s.rotation.set(i, i * 2, 0);
        grupo.add(s);
      }
      for (let i = 0; i < 3; i++) {
        const lena = malla(G.lena, lambert(0x6d4c32), 0, 0.15, 0);
        lena.rotation.y = (i / 3) * Math.PI;
        grupo.add(lena);
      }
    } else {
      grupo.add(malla(G.base, piedra), malla(G.poste, lambert(0x4a3a2c)), malla(G.cuenco, lambert(0x50555c)));
    }
    const altura = l.madre ? 0.2 : 1.45;
    const llama = malla(G.llama, basico(0xff9a3c, 0.85, true), 0, altura, 0);
    const nucleo = malla(G.nucleo, basico(0xfff0b0, 1, true), 0, altura, 0);
    if (l.madre) {
      llama.scale.setScalar(2);
      nucleo.scale.setScalar(2);
    }
    const niveles = new THREE.Group();
    grupo.add(llama, nucleo, niveles);
    grupo.traverse((o) => (o.castShadow = (o as THREE.Mesh).material !== llama.material && o !== nucleo));
    this.escena.add(grupo);
    return { grupo, llama, nucleo, niveles, nivel: 0, tipo: '' };
  }

  private crearMonstruo(m: Monstruo): Monstruo3D {
    const def = MONSTRUOS[m.tipo];
    const grupo = new THREE.Group();
    const cuerpo = new THREE.Group();
    grupo.add(cuerpo);
    const piel = lambert(0x16141c);
    const piel2 = lambert(0x24202c);
    const ojos: THREE.Mesh[] = [];
    const alas: THREE.Mesh[] = [];
    const ojo = (x: number, y: number, z: number, s = 1) => {
      const o = malla(G.ojo, basico(def.ojos), x, y, z);
      o.scale.setScalar(s);
      ojos.push(o);
      cuerpo.add(o);
    };
    switch (m.tipo) {
      case 'sombra': {
        const b = malla(new THREE.IcosahedronGeometry(0.42, 0), piel, 0, 0.45, 0);
        b.scale.set(0.9, 0.75, 1.3);
        cuerpo.add(b);
        for (let i = 0; i < 4; i++) {
          const pua = malla(new THREE.ConeGeometry(0.08, 0.35, 4), piel2, 0, 0.75, -0.3 + i * 0.18);
          pua.rotation.x = -0.6;
          cuerpo.add(pua);
        }
        ojo(-0.13, 0.55, 0.45);
        ojo(0.13, 0.55, 0.45);
        break;
      }
      case 'acechador': {
        const b = malla(new THREE.DodecahedronGeometry(0.75, 0), piel, 0, 0.95, 0);
        b.scale.set(1, 1.1, 0.9);
        cuerpo.add(b);
        cuerpo.add(malla(new THREE.DodecahedronGeometry(0.38, 0), piel2, 0, 1.65, 0.35));
        for (const x of [-0.75, 0.75]) {
          const brazo = malla(new THREE.BoxGeometry(0.22, 1.2, 0.22), piel2, x, 0.6, 0.2);
          brazo.rotation.x = 0.3;
          cuerpo.add(brazo);
        }
        ojo(-0.14, 1.72, 0.66, 1.1);
        ojo(0.14, 1.72, 0.66, 1.1);
        ojo(0, 1.86, 0.62, 0.8);
        break;
      }
      case 'apagador': {
        cuerpo.add(malla(new THREE.CylinderGeometry(0.18, 0.32, 1.6, 6).translate(0, 0.8, 0), piel));
        cuerpo.add(malla(new THREE.SphereGeometry(0.26, 8, 6), piel2, 0, 1.8, 0));
        for (const x of [-0.32, 0.32]) {
          const brazo = malla(new THREE.BoxGeometry(0.08, 1.3, 0.08).translate(0, -0.6, 0), piel2, x, 1.5, 0.05);
          brazo.rotation.x = -0.5;
          cuerpo.add(brazo);
        }
        ojo(-0.1, 1.84, 0.22);
        ojo(0.1, 1.84, 0.22);
        break;
      }
      case 'polilla': {
        cuerpo.add(malla(new THREE.CapsuleGeometry(0.13, 0.35, 3, 6).rotateX(Math.PI / 2), piel2, 0, 0, 0));
        matAla ??= new THREE.MeshLambertMaterial({ color: 0x8d8478, side: THREE.DoubleSide });
        oscurecer(matAla);
        for (const lado of [-1, 1]) {
          const ala = malla(new THREE.PlaneGeometry(0.6, 0.45).translate(0.3, 0, 0).rotateX(-Math.PI / 2), matAla);
          ala.scale.x = lado;
          alas.push(ala);
          cuerpo.add(ala);
        }
        ojo(-0.07, 0.04, 0.26, 0.8);
        ojo(0.07, 0.04, 0.26, 0.8);
        cuerpo.position.y = 1.2;
        break;
      }
    }
    cuerpo.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !ojos.includes(o as THREE.Mesh)) o.castShadow = true;
    });
    this.escena.add(grupo);
    return { grupo, cuerpo, ojos, alas };
  }

  private montarJugador(look: Look) {
    const clave = JSON.stringify(look);
    if (this.jugador && clave === this.lookActual) return;
    if (this.jugador) this.escena.remove(this.jugador);
    this.lookActual = clave;
    const av = createAvatar(look);
    oscurecerTodo(av.group);
    // Antorcha en la mano: palo de madera y llama (se oculta si está apagada).
    const antorcha = new THREE.Group();
    this.fuegoAntorcha = malla(G.fuegoAntorcha, basico(0xff9a3c, 0.9, true), 0, 0.35, 0);
    antorcha.add(malla(G.palo, lambert(0x6b4423)), this.fuegoAntorcha);
    antorcha.position.set(0.34, 0.5, 0.18);
    av.body.add(antorcha);
    this.jugador = av.group;
    this.cuerpoJugador = av.body;
    this.escena.add(av.group);
  }

  /* ---------- Mapa de luz ---------- */

  private pintarLuz(x: number, z: number, r: number, color: readonly number[], intensidad: number) {
    if (r <= 0 || intensidad <= 0) return;
    const n = this.resolucion;
    const paso = this.lado / n;
    const o = -this.lado / 2;
    const i0 = Math.max(0, Math.floor((x - r - o) / paso));
    const i1 = Math.min(n - 1, Math.ceil((x + r - o) / paso));
    const j0 = Math.max(0, Math.floor((z - r - o) / paso));
    const j1 = Math.min(n - 1, Math.ceil((z + r - o) / paso));
    const a = this.acum;
    for (let j = j0; j <= j1; j++) {
      const wz = o + (j + 0.5) * paso;
      for (let i = i0; i <= i1; i++) {
        const b = caida(Math.hypot(o + (i + 0.5) * paso - x, wz - z), r) * intensidad;
        if (b <= 0) continue;
        const k = (j * n + i) * 3;
        // Las luces se suman (con tope) para que dos luces juntas iluminen más.
        a[k] += b * color[0];
        a[k + 1] += b * color[1];
        a[k + 2] += b * color[2];
      }
    }
  }

  private actualizarMapaLuz(p: Partida, jx: number, jz: number, animaciones: boolean) {
    this.acum.fill(0);
    for (const l of p.luces) {
      let r = radioLuz(l);
      if (r <= 0) continue;
      let intensidad = 1.15;
      if (animaciones) r *= 1 + Math.sin(this.t * 9 + l.id * 1.7) * 0.025;
      if (l.combustible < AVISO_APAGADO) intensidad *= l.madre && l.combustible <= 0 ? 0.7 : 0.7 + 0.3 * Math.abs(Math.sin(this.t * 10));
      this.pintarLuz(l.x, l.z, r, l.madre && l.combustible <= 0 ? [1, 0.45, 0.25] : COLOR_LUZ[l.tipo], intensidad);
    }
    // Antorcha: luz cálida que parpadea un poco.
    const parpadeo = animaciones ? 1 + Math.sin(this.t * 13) * 0.03 + Math.sin(this.t * 7.3) * 0.02 : 1;
    this.pintarLuz(jx, jz, p.radioAntorcha * parpadeo, COLOR_LUZ.ramas, p.jugador.antorcha > 0 ? 0.95 : 0.5);
    for (const d of p.destellos) this.pintarLuz(d.x, d.z, RADIO_DESTELLO * (0.4 + d.t * 0.8), [0.9, 0.95, 1], 1.6 * (1 - d.t));
    const a = this.acum;
    const datos = this.datos;
    for (let k = 0, q = 0; k < a.length; k += 3, q += 4) {
      datos[q] = Math.min(255, a[k] * 255);
      datos[q + 1] = Math.min(255, a[k + 1] * 255);
      datos[q + 2] = Math.min(255, a[k + 2] * 255);
      datos[q + 3] = 255;
    }
    this.tex!.needsUpdate = true;
  }

  /* ---------- Dibujo ---------- */

  dibujar(p: Partida, look: Look, opciones: { animaciones: boolean; brillo: boolean }, dt: number, alfa: number) {
    this.t += dt;
    if (p !== this.partida || this.datos.length !== this.resolucion * this.resolucion * 4) this.montar(p);
    this.montarJugador(look);
    const j = p.jugador;
    const jx = j.px + (j.x - j.px) * alfa;
    const jz = j.pz + (j.z - j.pz) * alfa;

    // Jugador.
    this.jugador!.position.set(jx, 0, jz);
    const giro = this.jugador!.rotation.y;
    let dif = j.yaw - giro;
    dif = Math.atan2(Math.sin(dif), Math.cos(dif));
    this.jugador!.rotation.y = giro + dif * Math.min(1, dt * 14);
    animateWalk(this.cuerpoJugador!, this.t, j.moviendose && p.fase === 'juego');
    // Parpadeo al recibir un golpe.
    this.jugador!.visible = j.invulnerable <= 0 || Math.floor(this.t * 20) % 2 === 0;
    // Llama de la antorcha.
    const fuego = this.fuegoAntorcha!;
    fuego.visible = j.antorcha > 0;
    if (fuego.visible && opciones.animaciones) fuego.scale.set(1, 0.85 + Math.abs(Math.sin(this.t * 12)) * 0.3, 1);

    // Cámara cenital inclinada que sigue al jugador con suavidad.
    const k = Math.min(1, dt * 6);
    this.camX += (jx - this.camX) * k;
    this.camZ += (jz - this.camZ) * k;
    if (Math.hypot(jx - this.camX, jz - this.camZ) > 8) {
      this.camX = jx;
      this.camZ = jz;
    }
    this.camara.position.set(this.camX, 15, this.camZ + 9.5);
    this.camara.lookAt(this.camX, 0, this.camZ - 0.5);
    this.luna.position.set(this.camX - 8, 20, this.camZ + 6);
    this.luna.target.position.set(this.camX, 0, this.camZ);

    this.dibujarLuces(p, opciones.animaciones);
    this.dibujarMateriales(p, opciones.brillo);
    this.dibujarMonstruos(p, alfa, dt);
    this.dibujarDestellos(p);
    this.actualizarMapaLuz(p, jx, jz, opciones.animaciones);
    U.uActivo.value = 1;
    this.renderer.render(this.escena, this.camara);
    U.uActivo.value = 0;
  }

  private dibujarLuces(p: Partida, animaciones: boolean) {
    let chispas = 0;
    for (const l of p.luces) {
      let v = this.luces3d.get(l.id);
      if (!v) {
        v = this.crearLuz(l);
        this.luces3d.set(l.id, v);
      }
      const r = radioLuz(l);
      const viva = l.combustible > 0;
      v.llama.visible = v.nucleo.visible = r > 0;
      if (r > 0) {
        const brasa = l.madre && !viva;
        const base = (l.madre ? 2 : 1) * (brasa ? 0.45 : 0.75 + 0.25 * Math.min(1, l.combustible / 60));
        const parpadeo = animaciones ? 1 + Math.sin(this.t * 17 + l.id) * 0.08 + Math.sin(this.t * 31 + l.id * 3) * 0.05 : 1;
        const aviso = l.combustible < AVISO_APAGADO && !brasa ? 0.6 + 0.4 * Math.abs(Math.sin(this.t * 10)) : 1;
        v.llama.scale.set(base, base * parpadeo * aviso, base);
        v.nucleo.scale.set(base, base * parpadeo * aviso, base);
        const tipo = brasa ? 'brasa' : l.tipo;
        if (v.tipo !== tipo) {
          v.tipo = tipo;
          const [cr, cg, cb] = brasa ? [1, 0.35, 0.15] : COLOR_LUZ[l.tipo];
          v.llama.material = basico(new THREE.Color(cr, cg * 0.7, cb * 0.5).getHex(), 0.85, true);
        }
        // Chispas que suben de la llama.
        if (animaciones && viva) {
          for (let i = 0; i < 3 && chispas < MAX_CHISPAS; i++) {
            const f = (this.t * 0.7 + i / 3 + l.id * 0.37) % 1;
            this.aux.position.set(l.x + Math.sin(f * 9 + i * 2 + l.id) * 0.25, (l.madre ? 0.6 : 1.8) + f * 1.6, l.z + Math.cos(f * 7 + i) * 0.25);
            this.aux.rotation.set(0, 0, 0);
            this.aux.scale.setScalar(1 - f);
            this.aux.updateMatrix();
            this.chispas.setMatrixAt(chispas++, this.aux.matrix);
          }
        }
      }
      if (v.nivel !== l.nivel) {
        v.nivel = l.nivel;
        v.niveles.clear();
        // Un cubo dorado por cada nivel de mejora alrededor de la base.
        for (let i = 0; i < l.nivel - 1; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          const rr = l.madre ? 1.25 : 0.62;
          v.niveles.add(malla(G.nivel, lambert(0xffc83d), Math.cos(a) * rr, 0.08, Math.sin(a) * rr));
        }
      }
    }
    this.chispas.count = chispas;
    this.chispas.instanceMatrix.needsUpdate = true;
  }

  private dibujarMateriales(p: Partida, brillo: boolean) {
    const cuentas = new Map<IdMaterial, number>();
    let brillos = 0;
    const lejos = this.camara.position;
    for (const m of p.mapa.materiales) {
      if (m.recogido) continue;
      // Solo los cercanos a la cámara (el resto no se ve).
      if (Math.abs(m.x - lejos.x) > 26 || Math.abs(m.z - (lejos.z - 9.5)) > 20) continue;
      const im = this.materiales3d.get(m.tipo)!;
      const n = cuentas.get(m.tipo) ?? 0;
      if (n >= MAX_MATERIALES) continue;
      const fase = m.id * 1.3;
      this.aux.position.set(m.x, 0.12 + Math.sin(this.t * 2 + fase) * 0.04, m.z);
      this.aux.rotation.set(0, this.t * 0.6 + fase, m.tipo === 'ramas' ? 0.1 : 0);
      this.aux.scale.setScalar(1);
      this.aux.updateMatrix();
      im.setMatrixAt(n, this.aux.matrix);
      cuentas.set(m.tipo, n + 1);
      // Ayuda: destello débil sobre los que siguen a oscuras.
      if (brillo && brillos < MAX_MATERIALES && p.brillo(m.x, m.z) < 0.3) {
        const pulso = 0.5 + 0.5 * Math.sin(this.t * 3 + fase);
        this.aux.position.set(m.x, 0.6 + pulso * 0.1, m.z);
        this.aux.rotation.set(0, this.t * 2, 0);
        this.aux.scale.setScalar(0.4 + pulso * 0.6);
        this.aux.updateMatrix();
        this.brillos.setMatrixAt(brillos++, this.aux.matrix);
      }
    }
    for (const [tipo, im] of this.materiales3d) {
      im.count = cuentas.get(tipo) ?? 0;
      im.instanceMatrix.needsUpdate = true;
    }
    this.brillos.count = brillos;
    this.brillos.instanceMatrix.needsUpdate = true;
  }

  private dibujarMonstruos(p: Partida, alfa: number, dt: number) {
    const vistos = new Set<number>();
    for (const m of p.monstruos) {
      vistos.add(m.id);
      let v = this.monstruos3d.get(m.id);
      if (!v) {
        v = this.crearMonstruo(m);
        this.monstruos3d.set(m.id, v);
      }
      const x = m.px + (m.x - m.px) * alfa;
      const z = m.pz + (m.z - m.pz) * alfa;
      v.grupo.position.set(x, 0, z);
      let dif = m.yaw - v.grupo.rotation.y;
      dif = Math.atan2(Math.sin(dif), Math.cos(dif));
      v.grupo.rotation.y += dif * Math.min(1, dt * 8);
      const fase = this.t * 8 + m.id;
      const muerto = m.muerte >= 0;
      const s = muerto ? Math.max(0.01, 1 - m.muerte / 0.8) : 1;
      v.grupo.scale.setScalar(s);
      switch (m.tipo as TipoMonstruo) {
        case 'sombra':
          v.cuerpo.position.y = Math.abs(Math.sin(fase)) * 0.12;
          break;
        case 'acechador':
          v.cuerpo.rotation.z = Math.sin(fase * 0.4) * 0.08;
          break;
        case 'apagador':
          v.cuerpo.rotation.x = 0.15 + Math.sin(fase * 0.5) * 0.05;
          break;
        case 'polilla':
          v.cuerpo.position.y = 1.1 + Math.sin(fase * 0.7) * 0.2;
          for (const [i, ala] of v.alas.entries()) ala.rotation.z = (i ? -1 : 1) * Math.sin(this.t * 30 + m.id) * 0.7;
          break;
      }
      // Aturdidos: los ojos parpadean.
      const verOjos = !muerto && (m.aturdido <= 0 || Math.floor(this.t * 12) % 2 === 0);
      for (const o of v.ojos) o.visible = verOjos;
    }
    for (const [id, v] of this.monstruos3d) {
      if (vistos.has(id)) continue;
      this.escena.remove(v.grupo);
      v.grupo.traverse((o) => {
        const g = (o as THREE.Mesh).geometry;
        if (g && !(Object.values(G) as THREE.BufferGeometry[]).includes(g)) g.dispose();
      });
      this.monstruos3d.delete(id);
    }
  }

  private dibujarDestellos(p: Partida) {
    while (this.destellos.length < p.destellos.length) {
      const anillo = malla(G.anillo, new THREE.MeshBasicMaterial({ color: 0xe8f4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.destellos.push(anillo);
      this.escena.add(anillo);
    }
    this.destellos.forEach((a, i) => {
      const d = p.destellos[i];
      a.visible = !!d;
      if (!d) return;
      a.position.set(d.x, 0.15, d.z);
      a.scale.setScalar(RADIO_DESTELLO * (0.3 + d.t * 0.75));
      (a.material as THREE.MeshBasicMaterial).opacity = 1 - d.t;
    });
  }
}
