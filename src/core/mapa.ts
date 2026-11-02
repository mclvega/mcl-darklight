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

export interface Mapa {
  /** Medio lado: el mapa va de -medio a +medio en x y en z. */
  medio: number;
  obstaculos: Obstaculo[];
  /** Soportes apagados repartidos por el mapa (la Hoguera madre está en el origen). */
  soportes: Array<{ x: number; z: number }>;
  materiales: Material[];
}

/** Semilla de una noche a partir de la semilla de la partida. */
export const semillaNoche = (semilla: number, nivel: number) => (Math.imul(semilla ^ (nivel * 0x9e3779b1), 2654435761) >>> 0) || 1;

const RADIO_CLARO = 6;

function libre(x: number, z: number, r: number, obs: Obstaculo[], puntos: Array<{ x: number; z: number }>, sep: number) {
  if (Math.hypot(x, z) < RADIO_CLARO + r) return false;
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
    if (Math.abs(x) > m || Math.abs(z) > m || Math.hypot(x, z) < RADIO_CLARO + 1) continue;
    if (mapa.obstaculos.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.3)) continue;
    if (evitar?.(x, z)) continue;
    return { id, tipo: tipoMaterial(rng, Math.hypot(x, z), mapa.medio, cerca), x, z, recogido: false };
  }
  return null;
}

export function generarMapa(semilla: number, nivel: number, abundancia = 1): Mapa {
  const rng = crearRng(semilla);
  const lado = escalaNoche(nivel).lado;
  const medio = lado / 2;
  const area = lado * lado;
  const obstaculos: Obstaculo[] = [];
  const poner = (tipo: TipoObstaculo, cantidad: number, rMin: number, rMax: number, enGrupo = false) => {
    for (let i = 0, intentos = 0; i < cantidad && intentos < cantidad * 20; intentos++) {
      let x = rng.rango(-medio + 1.5, medio - 1.5);
      let z = rng.rango(-medio + 1.5, medio - 1.5);
      // Las ruinas salen en grupos (restos de un edificio).
      if (enGrupo && obstaculos.length && rng.siguiente() < 0.6) {
        const base = obstaculos.filter((o) => o.tipo === tipo);
        if (base.length) {
          const b = rng.elegir(base);
          x = b.x + rng.rango(-3, 3);
          z = b.z + rng.rango(-3, 3);
        }
      }
      const r = rng.rango(rMin, rMax);
      if (Math.abs(x) > medio - 1.5 || Math.abs(z) > medio - 1.5 || !libre(x, z, r, obstaculos, [], 0)) continue;
      obstaculos.push({ tipo, x, z, r, escala: rng.rango(0.8, 1.25), giro: rng.rango(0, Math.PI * 2) });
      i++;
    }
  };
  poner('arbol', Math.round(area / 55), 0.45, 0.75);
  poner('roca', Math.round(area / 160), 0.6, 1.3);
  poner('ruina', Math.round(area / 260), 0.4, 0.7, true);

  // Soportes: repartidos en anillos alrededor de la Hoguera madre.
  const soportes: Array<{ x: number; z: number }> = [];
  const cantidad = Math.min(12, 5 + Math.floor(nivel / 2));
  for (let intento = 0; soportes.length < cantidad && intento < 400; intento++) {
    const a = rng.rango(0, Math.PI * 2);
    const d = rng.rango(9, medio - 4);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (libre(x, z, 1, obstaculos, soportes, 9)) soportes.push({ x, z });
  }

  const mapa: Mapa = { medio, obstaculos, soportes, materiales: [] };
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

/** Saca un círculo (x, z, r) de los obstáculos y de los bordes del mapa. */
export function resolverChoques(c: { x: number; z: number }, r: number, mapa: Mapa): void {
  const m = mapa.medio - r;
  c.x = Math.max(-m, Math.min(m, c.x));
  c.z = Math.max(-m, Math.min(m, c.z));
  for (const o of mapa.obstaculos) {
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
