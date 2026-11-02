import { describe, expect, it } from 'vitest';
import { DIFICULTADES, escalaNoche, MODOS } from '../src/core/difficulty';
import { PASO } from '../src/core/loop';
import {
  alcanza, AVISO_APAGADO, avivar, capacidad, consumir, costeConstruir, costeMejora, DURACION, inventarioVacio, pagar, quema, radioBase, radioLuz, type Luz,
} from '../src/core/luces';
import { generarMapa, resolverChoques } from '../src/core/mapa';
import { MONSTRUOS, sortearTipo, TIPOS_MONSTRUO } from '../src/core/monstruos';
import { costeTaller, efectosTaller, tallerVacio } from '../src/core/taller';
import { controlesVacios, Partida, type Controles } from '../src/game/logica';
import { configPorDefecto, normalizarConfig } from '../src/settings';
import { anotarNoche, guardadoNuevo, limpiarNombre, normalizarGuardado } from '../src/storage';

const normal = MODOS.normal;
const nueva = (nivel = 1, semilla = 7) => new Partida({ nivel, semilla, modo: normal });
const luz = (o: Partial<Luz> = {}): Luz => ({ id: 1, x: 0, z: 0, nivel: 1, combustible: 0, madre: false, tipo: 'ramas', extra: 0, ...o });

function simular(p: Partida, segundos: number, c: Partial<Controles> = {}) {
  for (let t = 0; t < segundos && p.fase === 'juego'; t += PASO) p.actualizar(PASO, { ...controlesVacios(), ...c });
}

describe('dificultad', () => {
  it('cuatro modos con nombre y la noche crece sin final', () => {
    expect(DIFICULTADES).toEqual(['muyFacil', 'facil', 'normal', 'desafio']);
    for (const d of DIFICULTADES) expect(MODOS[d].nombre).toBeTruthy();
    expect(MODOS.muyFacil.dano).toBeLessThan(MODOS.desafio.dano);
    expect(escalaNoche(10).duracion).toBeGreaterThan(escalaNoche(1).duracion);
    expect(escalaNoche(50).maximo).toBeGreaterThan(escalaNoche(1).maximo);
    expect(escalaNoche(1000).duracion).toBe(300);
  });
});

describe('luces', () => {
  it('cada combustible dura distinto y la luz se apaga al gastarlo', () => {
    expect(DURACION.ramas).toBeLessThan(DURACION.carbon);
    expect(DURACION.aceite).toBeLessThan(DURACION.cristal);
    const l = luz();
    expect(radioLuz(l)).toBe(0);
    expect(avivar(l, 'ramas')).toBe(true);
    expect(l.combustible).toBe(25);
    expect(radioLuz(l)).toBeCloseTo(radioBase(l));
    consumir(l, 20);
    expect(radioLuz(l)).toBeLessThan(radioBase(l));
    consumir(l, 10);
    expect(l.combustible).toBe(0);
    expect(radioLuz(l)).toBe(0);
  });

  it('la Hoguera madre queda en brasa y nunca se apaga del todo', () => {
    const m = luz({ madre: true });
    expect(radioLuz(m)).toBeGreaterThan(0);
  });

  it('no se pasa de la capacidad y las mejoras ahorran combustible', () => {
    const l = luz();
    for (let i = 0; i < 10; i++) avivar(l, 'cristal');
    expect(l.combustible).toBe(capacidad(1));
    expect(avivar(l, 'ramas')).toBe(false);
    const a = luz({ combustible: 100 });
    const b = luz({ combustible: 100, nivel: 4 });
    consumir(a, 10);
    consumir(b, 10);
    expect(b.combustible).toBeGreaterThan(a.combustible);
    expect(quema(2)).toBe(0);
    expect(quema(3)).toBeGreaterThan(0);
    expect(AVISO_APAGADO).toBeGreaterThan(0);
  });

  it('costes de mejora y de construir', () => {
    expect(costeMejora(1)).toEqual({ piedra: 2 });
    expect(costeMejora(4).estrella).toBe(1);
    const inv = inventarioVacio();
    inv.piedra = 1;
    expect(alcanza(inv, costeMejora(1))).toBe(false);
    inv.piedra = 2;
    expect(pagar(inv, costeMejora(1))).toBe(true);
    expect(inv.piedra).toBe(0);
    expect(costeConstruir(0)).toEqual({ ramas: 3, piedra: 1 });
    expect(costeConstruir(2)).toEqual({ ramas: 1 });
  });
});

describe('mapa', () => {
  it('es el mismo con la misma semilla y crece con la noche', () => {
    const a = generarMapa(123, 3);
    const b = generarMapa(123, 3);
    expect(a).toEqual(b);
    expect(generarMapa(124, 3)).not.toEqual(a);
    expect(generarMapa(1, 20).medio).toBeGreaterThan(generarMapa(1, 1).medio);
    expect(a.soportes.length).toBeGreaterThanOrEqual(5);
    expect(a.materiales.length).toBeGreaterThan(20);
    // El claro de la Hoguera madre queda libre.
    for (const o of a.obstaculos) expect(Math.hypot(o.x, o.z)).toBeGreaterThan(5);
  });

  it('más materiales en Muy fácil que en Desafío', () => {
    expect(generarMapa(9, 2, MODOS.muyFacil.materiales).materiales.length).toBeGreaterThan(generarMapa(9, 2, MODOS.desafio.materiales).materiales.length);
  });

  it('los choques sacan del obstáculo y del borde', () => {
    const mapa = generarMapa(5, 1);
    const o = mapa.obstaculos[0];
    const c = { x: o.x + 0.1, z: o.z };
    resolverChoques(c, 0.3, mapa);
    expect(Math.hypot(c.x - o.x, c.z - o.z)).toBeGreaterThanOrEqual(o.r + 0.3 - 1e-6);
    const fuera = { x: 999, z: 0 };
    resolverChoques(fuera, 0.3, mapa);
    expect(fuera.x).toBeLessThanOrEqual(mapa.medio);
  });
});

describe('monstruos', () => {
  it('los tipos nuevos aparecen con las noches', () => {
    expect(sortearTipo(1, 0.99)).toBe('sombra');
    const vistos = new Set(Array.from({ length: 50 }, (_, i) => sortearTipo(8, i / 50)));
    for (const t of TIPOS_MONSTRUO) expect(vistos.has(t)).toBe(true);
    for (const t of TIPOS_MONSTRUO) expect(MONSTRUOS[t].vida).toBeGreaterThan(0);
  });
});

describe('partida', () => {
  it('empieza con la Hoguera madre encendida y el jugador a salvo', () => {
    const p = nueva();
    const madre = p.luces.find((l) => l.madre)!;
    expect(radioLuz(madre)).toBeGreaterThan(5);
    simular(p, 0.1);
    expect(p.jugador.enLuz).toBe(true);
    expect(p.inv.ramas).toBe(3);
  });

  it('avivar la madre gasta un combustible', () => {
    const p = nueva();
    const antes = p.luces[0].combustible;
    simular(p, PASO, { avivar: true });
    expect(p.inv.ramas).toBe(2);
    expect(p.luces[0].combustible).toBeGreaterThan(antes);
  });

  it('los monstruos no entran en una luz encendida', () => {
    const p = nueva(3);
    // Mucho combustible en la madre para toda la prueba.
    p.luces[0].combustible = 200;
    simular(p, 30);
    const r = radioLuz(p.luces[0]);
    for (const m of p.monstruos) {
      if (m.muerte >= 0 || m.tipo === 'polilla') continue;
      expect(Math.hypot(m.x, m.z)).toBeGreaterThanOrEqual(r - 0.01);
    }
    // Quieto en la luz, el jugador no recibe daño.
    expect(p.jugador.vida).toBe(p.jugador.vidaMax);
  });

  it('se llega al amanecer quedándose en la luz', () => {
    const p = new Partida({ nivel: 1, semilla: 3, modo: MODOS.muyFacil });
    p.luces[0].combustible = 1000;
    p.luces[0].nivel = 5;
    simular(p, p.duracion + 1);
    expect(p.fase).toBe('amanecer');
    expect(p.resumen?.amanecer).toBe(true);
    expect(p.resumen!.brasas).toBeGreaterThan(0);
  });

  it('se recogen materiales al pasar por encima', () => {
    const p = nueva();
    const m = p.mapa.materiales[0];
    p.jugador.x = m.x;
    p.jugador.z = m.z;
    simular(p, PASO);
    expect(p.inv[m.tipo]).toBeGreaterThanOrEqual(m.tipo === 'ramas' ? 5 : 1);
  });

  it('construir un soporte cuesta materiales y lo enciende con el combustible que llevas', () => {
    const p = nueva();
    p.jugador.x = 15;
    p.jugador.z = 15;
    p.luces.splice(1);
    p.inv.piedra = 1;
    p.inv.ramas = 5;
    simular(p, PASO, { construir: true });
    expect(p.luces.length).toBe(2);
    expect(p.inv.piedra).toBe(0);
    expect(radioLuz(p.luces[1])).toBeGreaterThan(0);
  });

  it('el destello aturde y daña a los monstruos cercanos', () => {
    const p = nueva();
    simular(p, 0.1);
    p.monstruos.push({
      id: 999, tipo: 'sombra', x: p.jugador.x + 2, z: p.jugador.z, px: 0, pz: 0, vida: 100, vidaMax: 100, velocidad: 3, dano: 10,
      aturdido: 0, recarga: 0, yaw: 0, muerte: -1, lado: 1,
    });
    simular(p, PASO, { destello: true });
    const m = p.monstruos.find((x) => x.id === 999)!;
    expect(m.aturdido).toBeGreaterThan(0);
    expect(m.vida).toBeLessThan(100);
  });
});

describe('taller', () => {
  it('efectos y costes', () => {
    const t = tallerVacio();
    const base = efectosTaller(t);
    t.linterna = 2;
    t.bolsillos = 1;
    expect(efectosTaller(t).radioLinterna).toBeGreaterThan(base.radioLinterna);
    expect(efectosTaller(t).ramasIniciales).toBe(5);
    expect(costeTaller(1)).toBeGreaterThan(costeTaller(0));
  });
});

describe('guardado y configuración', () => {
  it('normaliza datos dañados', () => {
    const g = normalizarGuardado({ nombre: 'Ana', nivel: -3, brasas: 'x', taller: { linterna: 99 }, look: { shirt: 'rojo' }, config: { dificultad: 'imposible' } });
    expect(g.nombre).toBe('Ana');
    expect(g.nivel).toBe(1);
    expect(g.brasas).toBe(0);
    expect(g.taller.linterna).toBe(5);
    expect(g.config.dificultad).toBe('normal');
    expect(normalizarGuardado(null).nivel).toBe(1);
    expect(normalizarConfig({ avisoLuz: false }).avisoLuz).toBe(false);
    expect(configPorDefecto().pantallaCompleta).toBe(true);
    expect(limpiarNombre('  <b>  ')).toBeNull();
  });

  it('al amanecer se pasa de noche y queda el récord; al caer se repite', () => {
    const g = guardadoNuevo();
    expect(anotarNoche(g, { nivel: 1, amanecer: false, abatidos: 2, recogidos: 3, brasas: 4 }, 'Ana')).toBe(false);
    expect(g.nivel).toBe(1);
    expect(g.brasas).toBe(4);
    expect(anotarNoche(g, { nivel: 1, amanecer: true, abatidos: 5, recogidos: 3, brasas: 10 }, 'Ana')).toBe(true);
    expect(g.nivel).toBe(2);
    expect(g.records).toHaveLength(1);
    anotarNoche(g, { nivel: 2, amanecer: true, abatidos: 1, recogidos: 0, brasas: 1 }, 'Ana');
    expect(g.records).toHaveLength(1);
    expect(g.records[0].noche).toBe(2);
    expect(g.estadisticas.nocheMax).toBe(2);
  });
});
