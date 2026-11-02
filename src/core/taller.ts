/** Taller: mejoras permanentes pequeñas que se compran con brasas entre noches. */

export type IdTaller = 'linterna' | 'bolsillos' | 'constructor' | 'destello' | 'hoguera';

export interface DefTaller {
  nombre: string;
  icono: string;
  max: number;
  texto: string;
}

export const TALLER: Record<IdTaller, DefTaller> = {
  // El id sigue siendo «linterna» para no romper los guardados: ahora es la antorcha.
  linterna: { nombre: 'Antorcha', icono: '🔥', max: 5, texto: 'La antorcha ilumina más lejos y arde más tiempo.' },
  bolsillos: { nombre: 'Bolsillos', icono: '🎒', max: 5, texto: 'Empiezas cada noche con 2 ramas más.' },
  constructor: { nombre: 'Constructor', icono: '🏗️', max: 2, texto: 'Construir soportes cuesta menos.' },
  destello: { nombre: 'Destello', icono: '✨', max: 4, texto: 'El destello se recarga antes y daña más.' },
  hoguera: { nombre: 'Hoguera madre', icono: '🔥', max: 4, texto: 'La Hoguera madre ilumina más lejos.' },
};

export const IDS_TALLER = Object.keys(TALLER) as IdTaller[];

export type Taller = Record<IdTaller, number>;

export const tallerVacio = (): Taller => ({ linterna: 0, bolsillos: 0, constructor: 0, destello: 0, hoguera: 0 });

/** Brasas para subir una mejora del nivel `n` al siguiente. */
export const costeTaller = (n: number) => 10 + n * 10;

/** Valores de juego derivados del Taller. */
export function efectosTaller(t: Taller) {
  return {
    radioAntorcha: 2.4 + t.linterna * 0.3,
    duracionAntorcha: 60 + t.linterna * 15,
    ramasIniciales: 3 + t.bolsillos * 2,
    descuento: t.constructor,
    recargaDestello: 6 - t.destello * 0.6,
    danoDestello: 25 + t.destello * 6,
    radioMadre: t.hoguera * 0.5,
  };
}
