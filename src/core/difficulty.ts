export type Dificultad = 'muyFacil' | 'facil' | 'normal' | 'desafio';

export interface Modo {
  nombre: string;
  /** Multiplicador de lo que dura cada combustible. */
  combustible: number;
  /** Multiplicador de la cantidad de materiales del mapa. */
  materiales: number;
  /** Multiplicador de la velocidad de los monstruos. */
  velocidad: number;
  /** Multiplicador del daño de los monstruos. */
  dano: number;
  /** Multiplicador de la vida de los monstruos. */
  vida: number;
  /** Multiplicador de cuántos monstruos hay a la vez. */
  cantidad: number;
  /** Multiplicador de la duración de la noche. */
  noche: number;
}

export const MODOS: Record<Dificultad, Modo> = {
  muyFacil: { nombre: 'Muy fácil', combustible: 1.6, materiales: 1.5, velocidad: 0.75, dano: 0.4, vida: 0.6, cantidad: 0.55, noche: 0.8 },
  facil: { nombre: 'Fácil', combustible: 1.25, materiales: 1.2, velocidad: 0.88, dano: 0.7, vida: 0.8, cantidad: 0.8, noche: 0.9 },
  normal: { nombre: 'Normal', combustible: 1, materiales: 1, velocidad: 1, dano: 1, vida: 1, cantidad: 1, noche: 1 },
  desafio: { nombre: 'Desafío', combustible: 0.8, materiales: 0.85, velocidad: 1.12, dano: 1.35, vida: 1.3, cantidad: 1.3, noche: 1.15 },
};

export const DIFICULTADES = Object.keys(MODOS) as Dificultad[];

/** Escala de cada noche (no hay final: crece sin límite, con topes en lo que haría el juego injugable). */
export function escalaNoche(nivel: number) {
  const n = Math.max(0, nivel - 1);
  return {
    /** Duración de la noche en segundos. */
    duracion: Math.min(300, 120 + n * 10),
    /** Monstruos a la vez al empezar y al final de la noche. */
    minimo: Math.min(16, 4 + Math.floor(n * 0.8)),
    maximo: Math.min(40, 8 + Math.floor(n * 2)),
    vida: 1 + n * 0.16,
    dano: 1 + n * 0.1,
    velocidad: Math.min(1.45, 1.05 + n * 0.025),
    /** Lado del mapa en metros. */
    lado: Math.min(110, 56 + n * 4),
  };
}
