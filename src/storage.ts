import { IDS_TALLER, TALLER, tallerVacio, type Taller } from './core/taller';
import { DEFAULT_LOOK, LOOK_OPTIONS, type Look } from './game/look';
import { configPorDefecto, normalizarConfig, type Configuracion } from './settings';

/** Mejor noche de cada jugador (una fila por nombre). */
export interface Record_ {
  nombre: string;
  /** Noche más alta superada (llegó al amanecer). */
  noche: number;
  abatidos: number;
  fecha: string;
}

export interface Estadisticas {
  /** Noches superadas en total. */
  noches: number;
  nocheMax: number;
  abatidos: number;
  recogidos: number;
  caidas: number;
  brasasTotal: number;
  /** Personas y animalitos puestos a salvo. */
  salvados: number;
}

const estadisticasNuevas = (): Estadisticas => ({ noches: 0, nocheMax: 0, abatidos: 0, recogidos: 0, caidas: 0, brasasTotal: 0, salvados: 0 });

export interface Guardado {
  v: 1;
  nombre: string | null;
  /** Noche que toca jugar (la siguiente a la última superada). */
  nivel: number;
  /** Semilla de la partida: cada noche genera su mapa a partir de ella. */
  semilla: number;
  /** Brasas para gastar en el Taller. */
  brasas: number;
  taller: Taller;
  records: Record_[];
  estadisticas: Estadisticas;
  /** Apariencia del farolero (mismo sistema de personajes que el Arcade). */
  look: Look;
  config: Configuracion;
}

export const CLAVE_GUARDADO = 'mcl-darklight:v1';
const MAX_RECORDS = 10;

export const lookPorDefecto = (): Look => ({ ...DEFAULT_LOOK, shirt: 0x5d4037, hat: 'beanie', hatColor: 0x37474f, bottomColor: 0x37474f, accessory: 'scarf' });

export const guardadoNuevo = (ahora = Date.now()): Guardado => ({
  v: 1, nombre: null, nivel: 1, semilla: (ahora * 2654435761) >>> 0, brasas: 0, taller: tallerVacio(), records: [],
  estadisticas: estadisticasNuevas(), look: lookPorDefecto(), config: configPorDefecto(),
});

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const entero = (v: unknown, min: number, max: number, porDefecto: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : porDefecto;

function normalizarRecord(v: unknown): Record_ | null {
  if (!esObjeto(v) || typeof v.nombre !== 'string' || typeof v.fecha !== 'string') return null;
  return { nombre: v.nombre.slice(0, 20), noche: entero(v.noche, 1, 1e6, 1), abatidos: entero(v.abatidos, 0, 1e7, 0), fecha: v.fecha };
}

/** Orden de la tabla: más noches y, a igualdad, más monstruos abatidos. */
const comparar = (a: Record_, b: Record_) => b.noche - a.noche || b.abatidos - a.abatidos;

function normalizarEstadisticas(v: unknown): Estadisticas {
  const e = estadisticasNuevas();
  if (!esObjeto(v)) return e;
  for (const k of Object.keys(e) as Array<keyof Estadisticas>) e[k] = entero(v[k], 0, 1e9, 0);
  return e;
}

export function normalizarTaller(v: unknown): Taller {
  const t = tallerVacio();
  if (!esObjeto(v)) return t;
  for (const id of IDS_TALLER) t[id] = entero(v[id], 0, TALLER[id].max, 0);
  return t;
}

/** Cada rasgo debe ser una de las opciones conocidas; si no, se usa el de por defecto. */
export function normalizarLook(entrada: unknown, porDefecto: Look): Look {
  if (!esObjeto(entrada)) return { ...porDefecto };
  const look = { ...porDefecto } as Record<string, unknown>;
  for (const [clave, opciones] of Object.entries(LOOK_OPTIONS)) {
    const valor = entrada[clave];
    const validos = (opciones as readonly unknown[]).map((o) => (typeof o === 'object' && o ? (o as { id: string }).id : o));
    if (validos.includes(valor)) look[clave] = valor;
  }
  return look as unknown as Look;
}

/** Valida datos guardados: cualquier campo dañado vuelve a su valor por defecto. */
export function normalizarGuardado(entrada: unknown): Guardado {
  const base = guardadoNuevo();
  if (!esObjeto(entrada)) return base;
  const records = Array.isArray(entrada.records)
    ? entrada.records.map(normalizarRecord).filter((r): r is Record_ => r !== null).sort(comparar).slice(0, MAX_RECORDS)
    : [];
  return {
    v: 1,
    nombre: typeof entrada.nombre === 'string' ? limpiarNombre(entrada.nombre) : null,
    nivel: entero(entrada.nivel, 1, 1e6, 1),
    semilla: entero(entrada.semilla, 1, 0xffffffff, base.semilla),
    brasas: entero(entrada.brasas, 0, 1e9, 0),
    taller: normalizarTaller(entrada.taller),
    records,
    estadisticas: normalizarEstadisticas(entrada.estadisticas),
    look: normalizarLook(entrada.look, base.look),
    config: normalizarConfig(entrada.config),
  };
}

/**
 * Anota el final de una noche. Al llegar al amanecer se pasa a la siguiente; al perder, todo empieza de nuevo
 * (noche 1, mapa nuevo, sin brasas ni Taller), pero se conservan los récords y las estadísticas.
 * Devuelve true si la noche entra en la tabla de récords.
 */
export function anotarNoche(
  g: Guardado, r: { nivel: number; amanecer: boolean; abatidos: number; recogidos: number; brasas: number; salvados?: number }, nombre: string, ahora = Date.now(),
): boolean {
  const e = g.estadisticas;
  e.abatidos += r.abatidos;
  e.recogidos += r.recogidos;
  e.salvados += r.salvados ?? 0;
  e.brasasTotal += r.brasas;
  g.brasas += r.brasas;
  if (!r.amanecer) {
    e.caidas++;
    g.nivel = 1;
    g.semilla = guardadoNuevo(ahora).semilla;
    g.brasas = 0;
    g.taller = tallerVacio();
    return false;
  }
  e.noches++;
  e.nocheMax = Math.max(e.nocheMax, r.nivel);
  g.nivel = Math.max(g.nivel, r.nivel + 1);
  const previa = g.records.find((x) => x.nombre === nombre);
  if (previa && comparar(previa, { nombre, noche: r.nivel, abatidos: r.abatidos, fecha: '' }) <= 0) return false;
  const fila: Record_ = { nombre, noche: r.nivel, abatidos: r.abatidos, fecha: new Date().toISOString().slice(0, 10) };
  g.records = g.records.filter((x) => x.nombre !== nombre);
  g.records.push(fila);
  g.records.sort(comparar);
  g.records = g.records.slice(0, MAX_RECORDS);
  return g.records.includes(fila);
}

/** Nombre del jugador: 1 a 20 caracteres; letras, espacios, punto, apóstrofo y guion. */
export function limpiarNombre(texto: string): string | null {
  const limpio = texto.replace(/\s+/g, ' ').trim().slice(0, 20);
  return /^[\p{L}\p{M}\d .'-]{1,20}$/u.test(limpio) ? limpio : null;
}

function almacenSeguro(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function cargar(almacen: Pick<Storage, 'getItem'> | null = almacenSeguro()): Guardado {
  try {
    const texto = almacen?.getItem(CLAVE_GUARDADO);
    return texto ? normalizarGuardado(JSON.parse(texto)) : guardadoNuevo();
  } catch {
    return guardadoNuevo();
  }
}

export function guardar(g: Guardado, almacen: Pick<Storage, 'setItem'> | null = almacenSeguro()): void {
  try {
    almacen?.setItem(CLAVE_GUARDADO, JSON.stringify(g));
  } catch {
    // Sin almacenamiento (ventana privada o bloqueado): el juego sigue en memoria.
  }
}
