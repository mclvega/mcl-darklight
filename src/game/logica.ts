import { escalaNoche, type Modo } from '../core/difficulty';
import {
  avivar, AVISO_APAGADO, COMBUSTIBLES, consumir, costeConstruir, costeMejora, inventarioVacio, MATERIALES_ORDEN, NIVEL_MAX_LUZ,
  pagar, protege, quema, radioLuz, textoCoste, type IdCombustible, type IdMaterial, type Inventario, type Luz, MATERIALES,
} from '../core/luces';
import { generarMapa, resolverChoques, semillaNoche, sortearMaterial, type Mapa } from '../core/mapa';
import { DRENAJE_APAGADOR, ESTALLIDO_POLILLA, MONSTRUOS, sortearTipo, type TipoMonstruo } from '../core/monstruos';
import { crearRng, type Rng } from '../core/rng';
import { efectosTaller, tallerVacio, type Taller } from '../core/taller';

/** Una noche: lógica pura (sin three.js ni DOM), testeable. */

export interface Controles {
  /** Dirección de movimiento en el plano (x a la derecha, z hacia abajo de la pantalla). */
  x: number;
  z: number;
  destello: boolean;
  avivar: boolean;
  mejorar: boolean;
  construir: boolean;
  /** Cambia el combustible elegido. */
  cambiar: boolean;
}

export const controlesVacios = (): Controles => ({ x: 0, z: 0, destello: false, avivar: false, mejorar: false, construir: false, cambiar: false });

export interface Resumen {
  nivel: number;
  /** true si se llegó al amanecer. */
  amanecer: boolean;
  tiempo: number;
  abatidos: number;
  recogidos: number;
  brasas: number;
}

export interface Eventos {
  recoger?: (tipo: IdMaterial) => void;
  avivar?: (l: Luz) => void;
  mejorar?: (l: Luz) => void;
  construir?: (l: Luz) => void;
  destello?: (alcanzados: number) => void;
  dano?: () => void;
  abatido?: (tipo: TipoMonstruo) => void;
  apagada?: (l: Luz) => void;
  estallido?: (l: Luz) => void;
  fallo?: (texto: string) => void;
  fin?: (r: Resumen) => void;
}

export interface Monstruo {
  id: number;
  tipo: TipoMonstruo;
  x: number;
  z: number;
  /** Posición del paso anterior (para interpolar el dibujo). */
  px: number;
  pz: number;
  vida: number;
  vidaMax: number;
  velocidad: number;
  dano: number;
  aturdido: number;
  recarga: number;
  yaw: number;
  /** Segundos desde que murió (se desvanece); -1 si vive. */
  muerte: number;
  /** Para que cada uno rodee los obstáculos hacia un lado distinto. */
  lado: number;
}

export interface Jugador {
  x: number;
  z: number;
  px: number;
  pz: number;
  yaw: number;
  vida: number;
  vidaMax: number;
  linterna: number;
  linternaMax: number;
  radioLinterna: number;
  moviendose: boolean;
  recargaDestello: number;
  invulnerable: number;
  enLuz: boolean;
}

export const VELOCIDAD_JUGADOR = 4.6;
export const RADIO_JUGADOR = 0.35;
/** Distancia para avivar o mejorar una luz. */
export const ALCANCE_LUZ = 2.2;
export const RADIO_DESTELLO = 4.5;
/** Radio de la linterna sin aceite (una brasa). */
export const RADIO_LINTERNA_APAGADA = 1.1;

export interface Opciones {
  nivel: number;
  semilla: number;
  modo: Modo;
  taller?: Taller;
  eventos?: Eventos;
}

export class Partida {
  readonly nivel: number;
  readonly modo: Modo;
  readonly mapa: Mapa;
  readonly duracion: number;
  readonly luces: Luz[] = [];
  monstruos: Monstruo[] = [];
  readonly jugador: Jugador;
  readonly inv: Inventario = inventarioVacio();
  seleccionado: IdCombustible = 'ramas';
  fase: 'juego' | 'amanecer' | 'fin' = 'juego';
  pausada = false;
  tiempo = 0;
  mensaje = '';
  mensajeT = 0;
  abatidos = 0;
  recogidos = 0;
  /** Destellos recientes (para dibujarlos): t va de 0 a 1. */
  destellos: Array<{ x: number; z: number; t: number }> = [];
  /** Luz al alcance para avivar o mejorar. */
  cercana: Luz | null = null;
  resumen: Resumen | null = null;
  private readonly rng: Rng;
  private readonly eventos: Eventos;
  private readonly efectos: ReturnType<typeof efectosTaller>;
  private readonly escala: ReturnType<typeof escalaNoche>;
  private siguienteId = 1;
  private relojAparicion = 0;
  private relojMaterial = 0;
  private readonly materialesIniciales: number;

  constructor(o: Opciones) {
    this.nivel = o.nivel;
    this.modo = o.modo;
    this.eventos = o.eventos ?? {};
    this.efectos = efectosTaller(o.taller ?? tallerVacio());
    this.escala = escalaNoche(o.nivel);
    this.duracion = Math.round(this.escala.duracion * o.modo.noche);
    const semilla = semillaNoche(o.semilla, o.nivel);
    this.rng = crearRng(semilla ^ 0x5bd1e995);
    this.mapa = generarMapa(semilla, o.nivel, o.modo.materiales);
    this.materialesIniciales = this.mapa.materiales.length;
    this.luces.push({ id: this.siguienteId++, x: 0, z: 0, nivel: 1, combustible: 45 * o.modo.combustible, madre: true, tipo: 'ramas', extra: this.efectos.radioMadre });
    for (const s of this.mapa.soportes) this.luces.push({ id: this.siguienteId++, x: s.x, z: s.z, nivel: 1, combustible: 0, madre: false, tipo: 'ramas', extra: 0 });
    this.jugador = {
      x: 0, z: 1.8, px: 0, pz: 1.8, yaw: 0, vida: 100, vidaMax: 100,
      linterna: this.efectos.aceiteLinterna, linternaMax: this.efectos.aceiteLinterna, radioLinterna: this.efectos.radioLinterna,
      moviendose: false, recargaDestello: 0, invulnerable: 0, enLuz: true,
    };
    this.inv.ramas = this.efectos.ramasIniciales;
    this.avisar(`Noche ${o.nivel}: aguanta hasta el amanecer`);
  }

  get progreso() {
    return Math.min(1, this.tiempo / this.duracion);
  }

  get recargaDestelloMax() {
    return this.efectos.recargaDestello;
  }

  /** Radio actual de la linterna (pequeño si se queda sin aceite). */
  get radioLinterna() {
    return this.jugador.linterna > 0 ? this.jugador.radioLinterna : RADIO_LINTERNA_APAGADA;
  }

  avisar(texto: string, segundos = 2.5) {
    this.mensaje = texto;
    this.mensajeT = segundos;
  }

  /** ¿Está el punto dentro de alguna luz fija que protege (la brasa no cuenta)? */
  enLuzFija(x: number, z: number, margen = 0): Luz | null {
    for (const l of this.luces) {
      if (!protege(l)) continue;
      const r = radioLuz(l);
      if (r > 0 && Math.hypot(l.x - x, l.z - z) < r + margen) return l;
    }
    return null;
  }

  /** Brillo de 0 a 1 en un punto: luces fijas y linterna (el render usa lo mismo para su mapa de luz). */
  brillo(x: number, z: number): number {
    let b = 0;
    for (const l of this.luces) {
      const r = radioLuz(l);
      if (r <= 0) continue;
      b = Math.max(b, caida(Math.hypot(l.x - x, l.z - z), r));
    }
    const j = this.jugador;
    return Math.max(b, caida(Math.hypot(j.x - x, j.z - z), this.radioLinterna) * 0.85);
  }

  actualizar(dt: number, c: Controles) {
    if (this.fase !== 'juego' || this.pausada) return;
    this.tiempo += dt;
    this.mensajeT = Math.max(0, this.mensajeT - dt);
    for (const d of this.destellos) d.t += dt * 2.5;
    this.destellos = this.destellos.filter((d) => d.t < 1);

    this.moverJugador(dt, c);
    this.actualizarLuces(dt);
    this.actualizarJugador(dt);
    this.recogerMateriales(dt);
    this.acciones(c);
    this.aparecerMonstruos(dt);
    this.moverMonstruos(dt);

    if (this.jugador.vida <= 0) return this.terminar(false);
    if (this.tiempo >= this.duracion) this.terminar(true);
  }

  private moverJugador(dt: number, c: Controles) {
    const j = this.jugador;
    j.px = j.x;
    j.pz = j.z;
    const l = Math.hypot(c.x, c.z);
    j.moviendose = l > 0.1;
    if (!j.moviendose) return;
    const f = Math.min(1, l);
    j.x += (c.x / l) * f * VELOCIDAD_JUGADOR * dt;
    j.z += (c.z / l) * f * VELOCIDAD_JUGADOR * dt;
    j.yaw = Math.atan2(c.x, c.z);
    resolverChoques(j, RADIO_JUGADOR, this.mapa);
  }

  private actualizarLuces(dt: number) {
    for (const l of this.luces) {
      const antes = l.combustible;
      consumir(l, dt);
      if (antes > 0 && l.combustible <= 0 && !l.madre) this.eventos.apagada?.(l);
      if (l.madre && antes > AVISO_APAGADO && l.combustible <= AVISO_APAGADO) this.avisar('La Hoguera madre se apaga: avívala 🔥');
      if (l.madre && antes > 0 && l.combustible <= 0) this.avisar('La Hoguera madre es solo brasa: ya no te protege 🔥', 3.5);
    }
  }

  private actualizarJugador(dt: number) {
    const j = this.jugador;
    j.invulnerable = Math.max(0, j.invulnerable - dt);
    j.recargaDestello = Math.max(0, j.recargaDestello - dt);
    const luz = this.enLuzFija(j.x, j.z);
    j.enLuz = !!luz;
    if (luz) {
      // Dentro de una luz se recupera la vida y la linterna se rellena.
      j.vida = Math.min(j.vidaMax, j.vida + 4 * dt);
      j.linterna = Math.min(j.linternaMax, j.linterna + 20 * dt);
    } else j.linterna = Math.max(0, j.linterna - dt);
    // Luz al alcance para avivar o mejorar.
    let mejor = ALCANCE_LUZ;
    this.cercana = null;
    for (const l of this.luces) {
      const d = Math.hypot(l.x - j.x, l.z - j.z);
      if (d < mejor) {
        mejor = d;
        this.cercana = l;
      }
    }
  }

  private recogerMateriales(dt: number) {
    const j = this.jugador;
    for (const m of this.mapa.materiales) {
      if (m.recogido || Math.abs(m.x - j.x) > 1 || Math.abs(m.z - j.z) > 1 || Math.hypot(m.x - j.x, m.z - j.z) > 0.95) continue;
      m.recogido = true;
      this.inv[m.tipo]++;
      this.recogidos++;
      this.eventos.recoger?.(m.tipo);
    }
    // Durante la noche reaparecen materiales en la oscuridad (para que la noche no se quede sin combustible).
    this.relojMaterial += dt * this.modo.materiales;
    if (this.relojMaterial >= 8) {
      this.relojMaterial = 0;
      const activos = this.mapa.materiales.filter((m) => !m.recogido).length;
      if (activos < this.materialesIniciales * 0.6) {
        const m = sortearMaterial(this.rng, this.mapa, this.siguienteId++, (x, z) => !!this.enLuzFija(x, z, 1) || Math.hypot(x - j.x, z - j.z) < 6);
        if (m) this.mapa.materiales.push(m);
      }
      this.mapa.materiales = this.mapa.materiales.filter((m) => !m.recogido);
    }
  }

  /** Combustible que se usará al avivar: el elegido o, si no queda, el primero que haya. */
  combustibleParaAvivar(): IdCombustible | null {
    if (this.inv[this.seleccionado] > 0) return this.seleccionado;
    return COMBUSTIBLES.find((t) => this.inv[t] > 0) ?? null;
  }

  private acciones(c: Controles) {
    const j = this.jugador;
    if (c.cambiar) {
      const i = COMBUSTIBLES.indexOf(this.seleccionado);
      const orden = [...COMBUSTIBLES.slice(i + 1), ...COMBUSTIBLES.slice(0, i + 1)];
      this.seleccionado = orden.find((t) => this.inv[t] > 0) ?? orden[0];
      this.avisar(`Combustible: ${MATERIALES[this.seleccionado].icono} ${MATERIALES[this.seleccionado].nombre} (${this.inv[this.seleccionado]})`, 1.4);
    }
    const l = this.cercana;
    if (c.avivar) {
      const tipo = this.combustibleParaAvivar();
      if (!l) this.fallo('Acércate a una luz para avivarla');
      else if (!tipo) this.fallo('No tienes combustible: búscalo en la oscuridad');
      else if (!avivar(l, tipo, this.modo.combustible)) this.fallo('Esta luz ya está llena');
      else {
        this.inv[tipo]--;
        this.eventos.avivar?.(l);
      }
    }
    if (c.mejorar) {
      if (!l) this.fallo('Acércate a una luz para mejorarla');
      else if (l.nivel >= NIVEL_MAX_LUZ) this.fallo('Esta luz ya está al máximo');
      else if (!pagar(this.inv, costeMejora(l.nivel))) this.fallo(`Para mejorarla necesitas ${textoCoste(costeMejora(l.nivel))}`);
      else {
        l.nivel++;
        this.avisar(`Luz mejorada a nivel ${l.nivel}${l.nivel === 3 ? ': ahora quema a los monstruos' : ''}`);
        this.eventos.mejorar?.(l);
      }
    }
    if (c.construir) {
      const coste = costeConstruir(this.efectos.descuento);
      const pegada = this.luces.some((o) => Math.hypot(o.x - j.x, o.z - j.z) < 3.5);
      if (pegada) this.fallo('Demasiado cerca de otra luz');
      else if (!pagar(this.inv, coste)) this.fallo(`Para construir un soporte necesitas ${textoCoste(coste)}`);
      else {
        const nueva: Luz = { id: this.siguienteId++, x: j.x, z: j.z, nivel: 1, combustible: 0, madre: false, tipo: 'ramas', extra: 0 };
        // Si llevas combustible, el soporte nuevo se enciende al momento.
        const tipo = this.combustibleParaAvivar();
        if (tipo && avivar(nueva, tipo, this.modo.combustible)) this.inv[tipo]--;
        this.luces.push(nueva);
        // El jugador queda junto al soporte, no dentro.
        j.z += 0.8;
        resolverChoques(j, RADIO_JUGADOR, this.mapa);
        this.eventos.construir?.(nueva);
      }
    }
    if (c.destello && j.recargaDestello <= 0) {
      j.recargaDestello = this.efectos.recargaDestello;
      this.destellos.push({ x: j.x, z: j.z, t: 0 });
      let alcanzados = 0;
      for (const m of this.monstruos) {
        if (m.muerte >= 0) continue;
        const d = Math.hypot(m.x - j.x, m.z - j.z);
        if (d > RADIO_DESTELLO + MONSTRUOS[m.tipo].radio) continue;
        alcanzados++;
        m.aturdido = 2;
        m.vida -= this.efectos.danoDestello;
        // Retroceden un poco.
        if (d > 0.01) {
          m.x += ((m.x - j.x) / d) * 1.5;
          m.z += ((m.z - j.z) / d) * 1.5;
        }
      }
      this.eventos.destello?.(alcanzados);
    }
  }

  private fallo(texto: string) {
    this.avisar(texto, 1.8);
    this.eventos.fallo?.(texto);
  }

  /** Monstruos a la vez: sube a lo largo de la noche. */
  get objetivoMonstruos() {
    const e = this.escala;
    return Math.max(1, Math.round((e.minimo + (e.maximo - e.minimo) * this.progreso) * this.modo.cantidad));
  }

  private aparecerMonstruos(dt: number) {
    this.relojAparicion -= dt;
    const vivos = this.monstruos.filter((m) => m.muerte < 0).length;
    if (this.relojAparicion > 0 || vivos >= this.objetivoMonstruos) return;
    this.relojAparicion = Math.max(0.4, 1.3 - this.nivel * 0.05);
    const j = this.jugador;
    for (let intento = 0; intento < 12; intento++) {
      const a = this.rng.rango(0, Math.PI * 2);
      const d = this.rng.rango(13, 22);
      const x = j.x + Math.cos(a) * d;
      const z = j.z + Math.sin(a) * d;
      const m = this.mapa.medio - 1;
      if (Math.abs(x) > m || Math.abs(z) > m) continue;
      if (this.enLuzFija(x, z, 1.5) || this.mapa.obstaculos.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.8)) continue;
      const tipo = sortearTipo(this.nivel, this.rng.siguiente());
      const def = MONSTRUOS[tipo];
      const vida = def.vida * this.escala.vida * this.modo.vida;
      this.monstruos.push({
        id: this.siguienteId++, tipo, x, z, px: x, pz: z, vida, vidaMax: vida,
        velocidad: def.velocidad * this.escala.velocidad * this.modo.velocidad, dano: def.dano * this.escala.dano * this.modo.dano,
        aturdido: 0, recarga: 0, yaw: 0, muerte: -1, lado: this.rng.siguiente() < 0.5 ? -1 : 1,
      });
      return;
    }
  }

  /** Luz con fuego vivo más cercana (sin la madre si `sinMadre`). */
  private luzMasCercana(x: number, z: number, sinMadre: boolean): Luz | null {
    let mejor: Luz | null = null;
    let dm = Infinity;
    for (const l of this.luces) {
      if (!protege(l) || (sinMadre && l.madre)) continue;
      const d = Math.hypot(l.x - x, l.z - z);
      if (d < dm) {
        dm = d;
        mejor = l;
      }
    }
    return mejor;
  }

  private moverMonstruos(dt: number) {
    const j = this.jugador;
    const jugadorSeguro = j.enLuz;
    for (const m of this.monstruos) {
      m.px = m.x;
      m.pz = m.z;
      if (m.muerte >= 0) {
        m.muerte += dt;
        continue;
      }
      const def = MONSTRUOS[m.tipo];
      m.recarga = Math.max(0, m.recarga - dt);
      if (m.vida <= 0) {
        this.morir(m);
        continue;
      }
      if (m.aturdido > 0) {
        m.aturdido -= dt;
        continue;
      }
      // Objetivo: el jugador, o una luz para los Apagadores y las Polillas.
      let tx = j.x;
      let tz = j.z;
      let luzObjetivo: Luz | null = null;
      if (m.tipo === 'apagador' || m.tipo === 'polilla') {
        luzObjetivo = this.luzMasCercana(m.x, m.z, m.tipo === 'apagador');
        if (luzObjetivo) {
          tx = luzObjetivo.x;
          tz = luzObjetivo.z;
        }
      }
      const dx = tx - m.x;
      const dz = tz - m.z;
      const d = Math.hypot(dx, dz) || 1;
      let v = m.velocidad;
      // La linterna frena a las Sombras.
      if (m.tipo === 'sombra' && Math.hypot(m.x - j.x, m.z - j.z) < this.radioLinterna) v *= 0.6;
      // Si el jugador está a salvo en la luz, los que lo cazan rondan el borde sin prisa.
      if (!luzObjetivo && jugadorSeguro) v *= 0.5;
      const alcance = def.radio + RADIO_JUGADOR + 0.25;
      if (luzObjetivo || d > alcance * 0.8) {
        m.x += (dx / d) * v * dt;
        m.z += (dz / d) * v * dt;
        m.yaw = Math.atan2(dx, dz);
      }
      // Rodea los obstáculos: si choca, se desliza hacia su lado.
      const antesX = m.x;
      const antesZ = m.z;
      resolverChoques(m, def.radio, this.mapa);
      if (Math.abs(antesX - m.x) + Math.abs(antesZ - m.z) > 1e-3) {
        m.x += (-dz / d) * m.lado * v * dt * 0.7;
        m.z += (dx / d) * m.lado * v * dt * 0.7;
      }

      if (m.tipo === 'polilla') {
        if (luzObjetivo && Math.hypot(luzObjetivo.x - m.x, luzObjetivo.z - m.z) < 0.8) {
          luzObjetivo.combustible = Math.max(0, luzObjetivo.combustible - ESTALLIDO_POLILLA);
          this.eventos.estallido?.(luzObjetivo);
          m.vida = 0;
          this.morir(m, false);
        }
        continue;
      }
      // Ninguno (salvo la Polilla) entra en una luz encendida: se queda en el borde y, si está mejorada, se quema. En la brasa sí entran.
      for (const l of this.luces) {
        if (!protege(l)) continue;
        const r = radioLuz(l);
        if (r <= 0) continue;
        const ldx = m.x - l.x;
        const ldz = m.z - l.z;
        const ld = Math.hypot(ldx, ldz);
        const borde = r + def.radio * 0.5;
        if (ld >= borde) continue;
        if (ld < 1e-3) m.x += borde;
        else {
          m.x = l.x + (ldx / ld) * borde;
          m.z = l.z + (ldz / ld) * borde;
        }
        m.vida -= quema(l.nivel) * dt;
        if (m.tipo === 'apagador' && l === luzObjetivo) l.combustible = Math.max(0, l.combustible - DRENAJE_APAGADOR * dt);
      }
      // Ataque al jugador si está fuera de la luz.
      const dj = Math.hypot(j.x - m.x, j.z - m.z);
      if (!jugadorSeguro && dj < alcance && m.recarga <= 0) {
        m.recarga = 1;
        if (j.invulnerable <= 0) {
          j.vida = Math.max(0, j.vida - m.dano);
          j.invulnerable = 0.35;
          this.eventos.dano?.();
        }
      }
    }
    // Separación entre monstruos para que no se amontonen en un punto.
    const vivos = this.monstruos.filter((m) => m.muerte < 0);
    for (let a = 0; a < vivos.length; a++) {
      for (let b = a + 1; b < vivos.length; b++) {
        const p = vivos[a];
        const q = vivos[b];
        const min = MONSTRUOS[p.tipo].radio + MONSTRUOS[q.tipo].radio;
        const dx = q.x - p.x;
        const dz = q.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d >= min || d < 1e-4) continue;
        const e = (min - d) / 2;
        p.x -= (dx / d) * e;
        p.z -= (dz / d) * e;
        q.x += (dx / d) * e;
        q.z += (dz / d) * e;
      }
    }
    this.monstruos = this.monstruos.filter((m) => m.muerte < 0.8);
  }

  private morir(m: Monstruo, cuenta = true) {
    m.muerte = 0;
    if (!cuenta) return;
    this.abatidos++;
    this.eventos.abatido?.(m.tipo);
    // A veces sueltan algo de combustible.
    if (this.rng.siguiente() < 0.3) {
      const tipo: IdMaterial = this.rng.siguiente() < 0.7 ? 'ramas' : 'carbon';
      this.mapa.materiales.push({ id: this.siguienteId++, tipo, x: m.x, z: m.z, recogido: false });
    }
  }

  /** Brasas para el Taller: por noche superada, monstruos y lo que sobra en la mochila. */
  brasas(amanecer: boolean): number {
    const sobra = MATERIALES_ORDEN.reduce((s, k) => s + this.inv[k], 0);
    const total = this.nivel * 3 + this.abatidos + Math.floor(sobra / 2);
    return amanecer ? total : Math.floor(total / 2);
  }

  private terminar(amanecer: boolean) {
    this.fase = amanecer ? 'amanecer' : 'fin';
    for (const m of this.monstruos) if (m.muerte < 0) m.muerte = 0;
    this.resumen = {
      nivel: this.nivel, amanecer, tiempo: Math.floor(this.tiempo), abatidos: this.abatidos, recogidos: this.recogidos, brasas: this.brasas(amanecer),
    };
    this.eventos.fin?.(this.resumen);
  }
}

/** Caída suave del brillo: pleno hasta el 60 % del radio y 0 en el borde. */
export function caida(d: number, r: number): number {
  if (r <= 0 || d >= r) return 0;
  const t = d / r;
  if (t <= 0.6) return 1;
  const u = (t - 0.6) / 0.4;
  return 1 - u * u * (3 - 2 * u);
}
