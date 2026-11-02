/** Materiales, combustibles y reglas de los puntos de luz (lógica pura, sin three.js). */

export type IdCombustible = 'ramas' | 'carbon' | 'aceite' | 'cristal';
export type IdConstruccion = 'piedra' | 'hierro' | 'estrella';
export type IdMaterial = IdCombustible | IdConstruccion;

export interface DefMaterial {
  nombre: string;
  icono: string;
  /** Color del objeto en el mapa y de la llama que da. */
  color: number;
}

export const COMBUSTIBLES: readonly IdCombustible[] = ['ramas', 'carbon', 'aceite', 'cristal'];
export const CONSTRUCCION: readonly IdConstruccion[] = ['piedra', 'hierro', 'estrella'];
export const MATERIALES_ORDEN: readonly IdMaterial[] = [...COMBUSTIBLES, ...CONSTRUCCION];

export const MATERIALES: Record<IdMaterial, DefMaterial> = {
  ramas: { nombre: 'Ramas', icono: '🪵', color: 0xc8843c },
  carbon: { nombre: 'Carbón', icono: '⚫', color: 0x55505a },
  aceite: { nombre: 'Aceite', icono: '🛢️', color: 0xe0b030 },
  cristal: { nombre: 'Cristal lunar', icono: '💎', color: 0x8fe3ff },
  piedra: { nombre: 'Piedra', icono: '🪨', color: 0x9a9a9a },
  hierro: { nombre: 'Hierro', icono: '⚙️', color: 0x8fa2b8 },
  estrella: { nombre: 'Polvo de estrella', icono: '✨', color: 0xfff27a },
};

/** Segundos que da cada combustible al avivar una luz. */
export const DURACION: Record<IdCombustible, number> = { ramas: 25, carbon: 50, aceite: 90, cristal: 160 };

/** Color de la luz que da cada combustible (r, g, b de 0 a 1). */
export const COLOR_LUZ: Record<IdCombustible, [number, number, number]> = {
  ramas: [1, 0.72, 0.4],
  carbon: [1, 0.55, 0.32],
  aceite: [1, 0.86, 0.5],
  cristal: [0.6, 0.85, 1],
};

export type Inventario = Record<IdMaterial, number>;

export const inventarioVacio = (): Inventario => ({ ramas: 0, carbon: 0, aceite: 0, cristal: 0, piedra: 0, hierro: 0, estrella: 0 });

export const NIVEL_MAX_LUZ = 5;

export interface Luz {
  id: number;
  x: number;
  z: number;
  /** 1 a 5. */
  nivel: number;
  /** Segundos de combustible que le quedan. */
  combustible: number;
  /** La Hoguera madre nunca se apaga del todo (queda en brasa, pero la brasa no protege). */
  madre: boolean;
  /** Índice de la Hoguera madre (su color); -1 en los soportes. */
  indice: number;
  /** Último combustible usado: da el color de la llama. */
  tipo: IdCombustible;
  /** Radio extra de la Hoguera madre (Taller). */
  extra: number;
}

/** Segundos que se empiezan a notar antes de apagarse (la luz se encoge y parpadea). */
export const AVISO_APAGADO = 8;

/** Radio de la madre cuando se queda sin combustible. */
export const RADIO_BRASA_MADRE = 3;

export function radioBase(l: Pick<Luz, 'nivel' | 'madre' | 'extra'>): number {
  return (l.madre ? 7 : 4.2) + (l.nivel - 1) * 0.8 + l.extra;
}

/** Radio de luz actual: se encoge en los últimos segundos y se apaga (salvo la madre, que queda en brasa). */
export function radioLuz(l: Luz): number {
  const base = radioBase(l);
  if (l.combustible <= 0) return l.madre ? RADIO_BRASA_MADRE : 0;
  const r = l.combustible >= AVISO_APAGADO ? base : base * (0.55 + 0.45 * (l.combustible / AVISO_APAGADO));
  return l.madre ? Math.max(RADIO_BRASA_MADRE, r) : r;
}

export const encendida = (l: Luz) => radioLuz(l) > 0;

/** Solo una luz con fuego vivo protege: la brasa de la madre se ve, pero no frena a los monstruos. */
export const protege = (l: Luz) => l.combustible > 0;

/** Segundos de combustible que se gastan por segundo: las mejoras ahorran. */
export const consumo = (nivel: number) => 1 - (nivel - 1) * 0.12;

/** Combustible máximo que se puede guardar en una luz. */
export const capacidad = (nivel: number) => 120 + (nivel - 1) * 60;

/** Daño por segundo a los monstruos que tocan el borde (desde el nivel 3). */
export const quema = (nivel: number) => (nivel >= 3 ? (nivel - 2) * 8 : 0);

/** Echa combustible a una luz. Devuelve false si ya estaba llena. */
export function avivar(l: Luz, tipo: IdCombustible, multiplicador = 1): boolean {
  const cap = capacidad(l.nivel);
  if (l.combustible >= cap - 1) return false;
  l.combustible = Math.min(cap, Math.max(0, l.combustible) + DURACION[tipo] * multiplicador);
  l.tipo = tipo;
  return true;
}

/** Quema combustible con el paso del tiempo (`factor` > 1 si calienta a más gente). */
export function consumir(l: Luz, dt: number, factor = 1): void {
  if (l.combustible > 0) l.combustible = Math.max(0, l.combustible - dt * consumo(l.nivel) * factor);
}

/** Color de cada Hoguera madre: las personas perdidas llevan el de la suya. */
export const COLORES_MADRE = [
  { nombre: 'roja', color: 0xe53935, css: '#ff5a50' },
  { nombre: 'azul', color: 0x1e88e5, css: '#4aa8ff' },
  { nombre: 'verde', color: 0x43a047, css: '#5ad15a' },
  { nombre: 'morada', color: 0x8e24aa, css: '#c070ff' },
  { nombre: 'amarilla', color: 0xfdd835, css: '#ffe04a' },
] as const;

export const colorMadre = (i: number) => COLORES_MADRE[((i % COLORES_MADRE.length) + COLORES_MADRE.length) % COLORES_MADRE.length];

/** «Hoguera roja», «Hoguera azul 2»… (con una sola madre, «Hoguera madre»). */
export function nombreMadre(i: number, total: number): string {
  if (total <= 1) return 'Hoguera madre';
  const vuelta = Math.floor(i / COLORES_MADRE.length);
  return `Hoguera ${colorMadre(i).nombre}${vuelta > 0 ? ` ${vuelta + 1}` : ''}`;
}

export type Coste = Partial<Record<IdMaterial, number>>;

/** Materiales para subir una luz del nivel `nivel` al siguiente. */
export function costeMejora(nivel: number): Coste {
  const c: Coste = { piedra: 2 * nivel };
  if (nivel >= 2) c.hierro = nivel - 1;
  if (nivel >= 4) c.estrella = nivel - 3;
  return c;
}

/** Coste de construir un soporte nuevo, con el descuento del Taller (0 a 2). */
export function costeConstruir(descuento: number): Coste {
  const c: Coste = { ramas: Math.max(1, 3 - descuento) };
  if (descuento < 2) c.piedra = 1;
  return c;
}

export const alcanza = (inv: Inventario, c: Coste) => (Object.keys(c) as IdMaterial[]).every((k) => inv[k] >= (c[k] ?? 0));

export function pagar(inv: Inventario, c: Coste): boolean {
  if (!alcanza(inv, c)) return false;
  for (const k of Object.keys(c) as IdMaterial[]) inv[k] -= c[k] ?? 0;
  return true;
}

export const textoCoste = (c: Coste) =>
  (Object.keys(c) as IdMaterial[]).filter((k) => (c[k] ?? 0) > 0).map((k) => `${MATERIALES[k].icono}${c[k]}`).join(' ');
