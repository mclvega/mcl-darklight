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
  /** Noche desde la que empiezan a salir más Hogueras madre (una más cada 5 noches). */
  desde: number;
}

export const MODOS: Record<Dificultad, Modo> = {
  muyFacil: { nombre: 'Muy fácil', combustible: 1.6, materiales: 1.5, velocidad: 0.75, dano: 0.4, vida: 0.6, cantidad: 0.55, noche: 0.8, desde: 9 },
  facil: { nombre: 'Fácil', combustible: 1.25, materiales: 1.2, velocidad: 0.88, dano: 0.7, vida: 0.8, cantidad: 0.8, noche: 0.9, desde: 6 },
  normal: { nombre: 'Normal', combustible: 1, materiales: 1, velocidad: 1, dano: 1, vida: 1, cantidad: 1, noche: 1, desde: 4 },
  desafio: { nombre: 'Desafío', combustible: 0.8, materiales: 0.85, velocidad: 1.12, dano: 1.35, vida: 1.3, cantidad: 1.3, noche: 1.15, desde: 2 },
};

export const DIFICULTADES = Object.keys(MODOS) as Dificultad[];

/** Crece lineal hasta `tope` y, pasado ese punto, más despacio (raíz cuadrada), sin cortarse nunca. */
export const suave = (lineal: number, tope: number, k: number) => (lineal <= tope ? lineal : tope + k * Math.sqrt(lineal - tope));

/** Escala de cada noche: no hay final y nada tiene tope, aunque lo más pesado crece cada vez más despacio. */
export function escalaNoche(nivel: number) {
  const n = Math.max(0, nivel - 1);
  const objetivo = 1 + Math.floor(n / 2);
  return {
    /** Duración de la noche en segundos. */
    duracion: suave(120 + n * 10, 300, 6),
    /** Monstruos a la vez al empezar y al final de la noche. */
    minimo: Math.floor(suave(4 + n * 0.8, 16, 1)),
    maximo: Math.floor(suave(8 + n * 2, 40, 1.5)),
    vida: 1 + n * 0.16,
    dano: 1 + n * 0.1,
    velocidad: suave(1.05 + n * 0.025, 1.45, 0.1),
    /** Lado del mapa en metros. */
    lado: suave(100 + n * 6, 200, 6),
    /** Personas que hay que tener a salvo al amanecer. */
    objetivo,
    /** Personas perdidas en el mapa (con margen). */
    perdidos: objetivo + 2,
  };
}

/** Hogueras madre de una noche: una más cada 5 noches desde `desde`, sin tope. */
export const madresNoche = (nivel: number, desde: number) => 1 + Math.floor(Math.max(0, nivel - desde) / 5);
