/** Tipos de monstruos de la oscuridad y cuáles aparecen en cada noche. */

export type TipoMonstruo = 'sombra' | 'acechador' | 'apagador' | 'polilla';

export interface DefMonstruo {
  nombre: string;
  vida: number;
  /** m/s. */
  velocidad: number;
  dano: number;
  /** Radio de choque. */
  radio: number;
  /** Desde qué noche aparece. */
  desde: number;
  /** Peso al sortear. */
  peso: number;
  /** Color de los ojos (lo único que se ve en la oscuridad). */
  ojos: number;
}

export const MONSTRUOS: Record<TipoMonstruo, DefMonstruo> = {
  sombra: { nombre: 'Sombra', vida: 30, velocidad: 3.9, dano: 10, radio: 0.4, desde: 1, peso: 6, ojos: 0xff3030 },
  acechador: { nombre: 'Acechador', vida: 90, velocidad: 2.5, dano: 22, radio: 0.7, desde: 2, peso: 2, ojos: 0xffb020 },
  apagador: { nombre: 'Apagador', vida: 55, velocidad: 3, dano: 12, radio: 0.5, desde: 3, peso: 2, ojos: 0xc060ff },
  polilla: { nombre: 'Polilla', vida: 18, velocidad: 4.4, dano: 6, radio: 0.35, desde: 5, peso: 2, ojos: 0xffffff },
};

export const TIPOS_MONSTRUO = Object.keys(MONSTRUOS) as TipoMonstruo[];

/** Combustible que quita un Apagador por segundo y una Polilla al estallar. */
export const DRENAJE_APAGADOR = 5;
export const ESTALLIDO_POLILLA = 20;

/** Sortea el tipo de un monstruo nuevo según la noche (con `azar` de 0 a 1). */
export function sortearTipo(nivel: number, azar: number): TipoMonstruo {
  const disponibles = TIPOS_MONSTRUO.filter((t) => MONSTRUOS[t].desde <= nivel);
  // Los tipos nuevos ganan peso con las noches.
  const pesos = disponibles.map((t) => MONSTRUOS[t].peso * (t === 'sombra' ? 1 : 1 + (nivel - MONSTRUOS[t].desde) * 0.1));
  const total = pesos.reduce((a, b) => a + b, 0);
  let r = azar * total;
  for (let i = 0; i < disponibles.length; i++) {
    r -= pesos[i];
    if (r < 0) return disponibles[i];
  }
  return disponibles[disponibles.length - 1];
}
