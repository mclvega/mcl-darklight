import { escalaNoche } from './difficulty';
import { CONSTRUCCION, type IdMaterial } from './luces';
import { crearRng, type Rng } from './rng';

/** Generación del mapa de cada noche con semilla: la misma noche da siempre el mismo mapa. */

export type TipoObstaculo = 'arbol' | 'roca' | 'ruina';

export interface Obstaculo {
  tipo: TipoObstaculo;
  x: number;
  z: number;
  /** Radio de choque. */
  r: number;
  /** Escala y giro del modelo (solo dibujo). */
  escala: number;
  giro: number;
}

export interface Material {
  id: number;
  tipo: IdMaterial;
  x: number;
  z: number;
  recogido: boolean;
}

export type Especie = 'persona' | 'perro' | 'gato' | 'conejo';
export const ANIMALES: readonly Especie[] = ['perro', 'gato', 'conejo'];

export interface Punto {
  x: number;
  z: number;
}

export interface Mapa {
  /** Medio lado: el mapa va de -medio a +medio en x y en z. */
  medio: number;
  obstaculos: Obstaculo[];
  /** Hogueras madre: la primera está en el origen (donde empieza el jugador). */
  madres: Punto[];
  /** Soportes apagados repartidos por el mapa. */
  soportes: Punto[];
  /** Personas y animalitos perdidos en la oscuridad, y la madre a la que deben llegar. */
  perdidos: Array<Punto & { madre: number; especie: Especie }>;
  materiales: Material[];
  /** Obstáculos por celda (para los choques): clave «cx,cz». */
  rejilla: Map<string, Obstaculo[]>;
}

/** Semilla de una noche a partir de la semilla de la partida. */
export const semillaNoche = (semilla: number, nivel: number) => (Math.imul(semilla ^ (nivel * 0x9e3779b1), 2654435761) >>> 0) || 1;

const RADIO_CLARO = 6;
/** Distancia mínima entre una persona perdida y cualquier Hoguera madre. */
export const DISTANCIA_PERDIDO = 14;
const CELDA = 8;

const cercaDeMadre = (x: number, z: number, madres: Punto[], r: number) => madres.some((m) => Math.hypot(m.x - x, m.z - z) < r);

function libre(x: number, z: number, r: number, madres: Punto[], obs: Obstaculo[], puntos: Punto[], sep: number) {
  if (cercaDeMadre(x, z, madres, RADIO_CLARO + r)) return false;
  for (const o of obs) if (Math.hypot(o.x - x, o.z - z) < o.r + r + 0.4) return false;
  for (const p of puntos) if (Math.hypot(p.x - x, p.z - z) < sep) return false;
  return true;
}

/** Elige el tipo de material según lo que hay cerca y la distancia al centro. */
function tipoMaterial(rng: Rng, dist: number, medio: number, cerca: TipoObstaculo | null): IdMaterial {
  const lejos = dist / medio;
  const t = rng.siguiente();
  if (lejos > 0.55 && t < 0.1) return 'cristal';
  if (lejos > 0.5 && t < 0.16) return 'estrella';
  if (cerca === 'ruina') return t < 0.45 ? 'aceite' : t < 0.8 ? 'hierro' : 'ramas';
  if (cerca === 'roca') return t < 0.5 ? 'carbon' : t < 0.85 ? 'piedra' : 'hierro';
  if (cerca === 'arbol') return t < 0.75 ? 'ramas' : 'piedra';
  return t < 0.5 ? 'ramas' : t < 0.8 ? 'piedra' : 'carbon';
}

/** Coloca un material nuevo en un sitio libre (también se usa para los que reaparecen durante la noche). */
export function sortearMaterial(rng: Rng, mapa: Mapa, id: number, evitar?: (x: number, z: number) => boolean): Material | null {
  const m = mapa.medio - 2;
  for (let intento = 0; intento < 30; intento++) {
    // Muchos materiales junto a un obstáculo (escondidos); el resto, sueltos.
    let x: number;
    let z: number;
    let cerca: TipoObstaculo | null = null;
    if (mapa.obstaculos.length && rng.siguiente() < 0.65) {
      const o = rng.elegir(mapa.obstaculos);
      const a = rng.rango(0, Math.PI * 2);
      x = o.x + Math.cos(a) * (o.r + 0.7);
      z = o.z + Math.sin(a) * (o.r + 0.7);
      cerca = o.tipo;
    } else {
      x = rng.rango(-m, m);
      z = rng.rango(-m, m);
    }
    if (Math.abs(x) > m || Math.abs(z) > m || cercaDeMadre(x, z, mapa.madres, RADIO_CLARO + 1)) continue;
    if (obstaculosCerca(mapa, x, z).some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.3)) continue;
    if (evitar?.(x, z)) continue;
    return { id, tipo: tipoMaterial(rng, Math.hypot(x, z), mapa.medio, cerca), x, z, recogido: false };
  }
  return null;
}

/** Hogueras madre: la primera en el origen y el resto repartidas y separadas entre sí. */
function colocarMadres(rng: Rng, medio: number, cantidad: number): Punto[] {
  const madres: Punto[] = [{ x: 0, z: 0 }];
  let sep = Math.max(22, medio * 0.5);
  for (let intento = 0; madres.length < cantidad && intento < cantidad * 400; intento++) {
    // Si el mapa se llena, se admite menos separación.
    if (intento > 0 && intento % 200 === 0) sep = Math.max(14, sep * 0.85);
    const x = rng.rango(-medio + 8, medio - 8);
    const z = rng.rango(-medio + 8, medio - 8);
    if (!cercaDeMadre(x, z, madres, sep)) madres.push({ x, z });
  }
  return madres;
}

export function generarMapa(semilla: number, nivel: number, abundancia = 1, cantidadMadres = 1): Mapa {
  const rng = crearRng(semilla);
  const escala = escalaNoche(nivel);
  const lado = escala.lado;
  const medio = lado / 2;
  const area = lado * lado;
  const madres = colocarMadres(rng, medio, cantidadMadres);
  const obstaculos: Obstaculo[] = [];
  const poner = (tipo: TipoObstaculo, cantidad: number, rMin: number, rMax: number, enGrupo = false) => {
    const base: Obstaculo[] = [];
    for (let i = 0, intentos = 0; i < cantidad && intentos < cantidad * 20; intentos++) {
      let x = rng.rango(-medio + 1.5, medio - 1.5);
      let z = rng.rango(-medio + 1.5, medio - 1.5);
      // Las ruinas salen en grupos (restos de un edificio).
      if (enGrupo && base.length && rng.siguiente() < 0.6) {
        const b = rng.elegir(base);
        x = b.x + rng.rango(-3, 3);
        z = b.z + rng.rango(-3, 3);
      }
      const r = rng.rango(rMin, rMax);
      if (Math.abs(x) > medio - 1.5 || Math.abs(z) > medio - 1.5 || !libreRapido(x, z, r)) continue;
      const o: Obstaculo = { tipo, x, z, r, escala: rng.rango(0.8, 1.25), giro: rng.rango(0, Math.PI * 2) };
      obstaculos.push(o);
      base.push(o);
      meter(rejilla, o);
      i++;
    }
  };
  // Mientras se colocan, los choques entre obstáculos usan la rejilla (el mapa puede ser enorme).
  const rejilla = new Map<string, Obstaculo[]>();
  const libreRapido = (x: number, z: number, r: number) =>
    !cercaDeMadre(x, z, madres, RADIO_CLARO + r) && !vecinos(rejilla, x, z).some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 0.4);
  poner('arbol', Math.round(area / 55), 0.45, 0.75);
  poner('roca', Math.round(area / 160), 0.6, 1.3);
  poner('ruina', Math.round(area / 260), 0.4, 0.7, true);

  // Soportes: repartidos por todo el mapa, lejos de las madres y entre sí.
  const soportes: Punto[] = [];
  const cantidad = 8 + Math.floor(lado / 15);
  for (let intento = 0; soportes.length < cantidad && intento < cantidad * 40; intento++) {
    const x = rng.rango(-medio + 4, medio - 4);
    const z = rng.rango(-medio + 4, medio - 4);
    if (cercaDeMadre(x, z, madres, 9)) continue;
    if (libre(x, z, 1, madres, vecinos(rejilla, x, z), soportes, 9)) soportes.push({ x, z });
  }

  // Personas perdidas: cada una cerca (pero no demasiado) de su madre, siempre en la oscuridad.
  const perdidos: Mapa['perdidos'] = [];
  for (let i = 0; i < escala.perdidos; i++) {
    const madre = i % madres.length;
    // Más o menos uno de cada tres es un animalito.
    const especie: Especie = rng.siguiente() < 0.35 ? rng.elegir(ANIMALES) : 'persona';
    const c = madres[madre];
    for (let intento = 0; intento < 200; intento++) {
      const a = rng.rango(0, Math.PI * 2);
      const d = rng.rango(DISTANCIA_PERDIDO + 2, DISTANCIA_PERDIDO + 2 + medio * 0.5);
      const x = c.x + Math.cos(a) * d;
      const z = c.z + Math.sin(a) * d;
      if (Math.abs(x) > medio - 3 || Math.abs(z) > medio - 3 || cercaDeMadre(x, z, madres, DISTANCIA_PERDIDO)) continue;
      if (vecinos(rejilla, x, z).some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.8)) continue;
      if (perdidos.some((p) => Math.hypot(p.x - x, p.z - z) < 4)) continue;
      perdidos.push({ x, z, madre, especie });
      break;
    }
  }

  const mapa: Mapa = { medio, obstaculos, madres, soportes, perdidos, materiales: [], rejilla };
  const total = Math.round((area / 70) * abundancia);
  for (let i = 0; i < total; i++) {
    const m = sortearMaterial(rng, mapa, i + 1);
    if (m) mapa.materiales.push(m);
  }
  // Siempre algo de piedra para la primera mejora.
  if (!mapa.materiales.some((m) => CONSTRUCCION.includes(m.tipo as never))) {
    const m = sortearMaterial(rng, mapa, total + 1);
    if (m) mapa.materiales.push({ ...m, tipo: 'piedra' });
  }
  return mapa;
}

const claveCelda = (cx: number, cz: number) => `${cx},${cz}`;

function meter(rejilla: Map<string, Obstaculo[]>, o: Obstaculo) {
  const k = claveCelda(Math.floor(o.x / CELDA), Math.floor(o.z / CELDA));
  const lista = rejilla.get(k);
  if (lista) lista.push(o);
  else rejilla.set(k, [o]);
}

/** Obstáculos de la celda del punto y de las 8 vecinas (ningún choque llega más lejos que una celda). */
function vecinos(rejilla: Map<string, Obstaculo[]>, x: number, z: number): Obstaculo[] {
  const cx = Math.floor(x / CELDA);
  const cz = Math.floor(z / CELDA);
  const res: Obstaculo[] = [];
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const lista = rejilla.get(claveCelda(cx + i, cz + j));
      if (lista) for (const o of lista) res.push(o);
    }
  }
  return res;
}

/** Obstáculos cerca de un punto. */
export const obstaculosCerca = (mapa: Mapa, x: number, z: number) => vecinos(mapa.rejilla, x, z);

/** Saca un círculo (x, z, r) de los obstáculos y de los bordes del mapa. */
export function resolverChoques(c: { x: number; z: number }, r: number, mapa: Mapa): void {
  const m = mapa.medio - r;
  c.x = Math.max(-m, Math.min(m, c.x));
  c.z = Math.max(-m, Math.min(m, c.z));
  for (const o of vecinos(mapa.rejilla, c.x, c.z)) {
    const dx = c.x - o.x;
    const dz = c.z - o.z;
    const min = o.r + r;
    if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
    const d = Math.hypot(dx, dz);
    if (d >= min) continue;
    if (d < 1e-4) {
      c.x += min;
      continue;
    }
    c.x = o.x + (dx / d) * min;
    c.z = o.z + (dz / d) * min;
  }
}
