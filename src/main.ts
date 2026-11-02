import './styles.css';

import { app } from './app';
import { audio } from './audio';
import { MODOS } from './core/difficulty';
import { Entrada } from './core/input';
import {
  AVISO_APAGADO, capacidad, colorMadre, COMBUSTIBLES, CONSTRUCCION, costeMejora, DURACION, MATERIALES, NIVEL_MAX_LUZ, protege, textoCoste, type IdMaterial,
} from './core/luces';
import { iniciarBucle } from './core/loop';
import { iniciarPantallaCompleta } from './fullscreen';
import { controlesVacios, Partida, type Resumen } from './game/logica';
import type { Render3D } from './game/render3d';
import { Rendimiento, tamanoSombras } from './rendimiento';
import { anotarNoche, limpiarNombre } from './storage';
import { panelConfiguracion } from './ui/configuracion';
import { boton, h, mostrarPanel } from './ui/dom';
import { pantallaTaller } from './ui/taller';

const hud = document.getElementById('lienzo') as HTMLCanvasElement;
const ctx = hud.getContext('2d')!;
const lienzo3d = document.createElement('canvas');
lienzo3d.id = 'lienzo3d';
hud.before(lienzo3d);
const controles = document.getElementById('controles')!;
// Teclado, mando y, en el móvil, joystick flotante a la izquierda y botones con iconos a la derecha.
const entrada = new Entrada(
  [
    { nombre: 'destello', teclas: ['Space'], mando: 0, etiqueta: '✨' },
    { nombre: 'avivar', teclas: ['KeyE', 'Enter'], mando: 2, etiqueta: '🔥' },
    { nombre: 'mejorar', teclas: ['KeyR'], mando: 3, etiqueta: '🔧' },
    { nombre: 'construir', teclas: ['KeyB'], mando: 1, etiqueta: '🏗️' },
    { nombre: 'cambiar', teclas: ['KeyQ', 'Tab'], mando: 5, etiqueta: '🔄' },
    { nombre: 'pausa', teclas: [], mando: 9, etiqueta: '⏸' },
  ],
  controles,
);
const tactil = matchMedia('(pointer: coarse)').matches || (import.meta.env.DEV && location.search.includes('tactil'));
if (tactil) document.body.classList.add('tactil');
addEventListener('keydown', (e) => e.code === 'Tab' && e.preventDefault());

let partida: Partida | null = null;
let render: Render3D | null = null;
let modulo3d: Promise<typeof import('./game/render3d')> | null = null;
const cargar3d = () => (modulo3d ??= import('./game/render3d'));

iniciarPantallaCompleta(() => app.g.config.pantallaCompleta, 'landscape');
app.aplicarConfig();

/* ---------- Tamaño ---------- */

const rend = new Rendimiento(() => app.g.config.calidad, () => app.g.config.limiteFps, () => ajustar());
let ancho = innerWidth;
let alto = innerHeight;
function ajustar() {
  ancho = innerWidth;
  alto = innerHeight;
  const dpr = Math.min(2, devicePixelRatio || 1);
  for (const c of [hud, lienzo3d]) {
    c.style.width = `${ancho}px`;
    c.style.height = `${alto}px`;
  }
  hud.width = Math.round(ancho * dpr);
  hud.height = Math.round(alto * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render?.ajustar(ancho, alto, rend.ratio);
}
addEventListener('resize', ajustar);
ajustar();

document.body.append(h('button', { type: 'button', class: 'boton-pausa', 'aria-label': 'Pausa', text: '⏸', onclick: () => pausar() }));

const vibrar = (ms: number) => app.g.config.vibracion && navigator.vibrate?.(ms);

/* ---------- Pantallas ---------- */

function jugando(si: boolean) {
  document.body.classList.toggle('jugando', si);
  if (!si) entrada.limpiar();
}

const AYUDA = tactil
  ? 'Arrastra en la mitad izquierda para moverte. Junto a una luz: 🔥 avivar con el combustible elegido (🔄 lo cambia) y 🔧 mejorarla. 🏗️ construye un soporte donde estés y ✨ lanza un destello que aturde a los monstruos. Dentro de la luz estás a salvo.'
  : 'WASD o flechas para moverte. Junto a una luz: E avivar con el combustible elegido (Q lo cambia) y R mejorarla. B construye un soporte donde estés y Espacio lanza un destello que aturde a los monstruos. Dentro de la luz estás a salvo.';

function bienvenida() {
  jugando(false);
  const campo = h('input', { type: 'text', maxlength: '20', placeholder: 'Tu nombre', 'aria-label': 'Tu nombre' }) as HTMLInputElement;
  const error = h('p', { class: 'error-campo', 'aria-live': 'polite' });
  const seguir = () => {
    const nombre = limpiarNombre(campo.value);
    if (!nombre) {
      error.textContent = 'Escribe tu nombre (hasta 20 caracteres).';
      return;
    }
    app.g.nombre = nombre;
    app.guardar();
    menu();
  };
  campo.addEventListener('keydown', (e) => e.key === 'Enter' && seguir());
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h1', { text: '🏮 McL Darklight' }),
      h('p', { class: 'texto-suave', text: 'Cuando cae la noche, los monstruos salen de la oscuridad. Enciende y aviva luces para que no te alcancen, busca materiales escondidos y aguanta hasta el amanecer.' }),
      campo,
      error,
      boton('Empezar', seguir, { variante: 'primario' }),
    ),
  );
  campo.focus();
}

function menu() {
  jugando(false);
  partida = null;
  const g = app.g;
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h1', { text: '🏮 McL Darklight' }),
      h('p', { class: 'texto-suave', text: `¡Hola, ${app.nombre()}! · Mejor: noche ${g.estadisticas.nocheMax} · 🔸 ${g.brasas} brasas` }),
      boton(`Jugar: noche ${g.nivel}`, empezar, { variante: 'primario', icono: '▶' }),
      boton(`Dificultad: ${MODOS[g.config.dificultad].nombre}`, () => configuracion(), { icono: '🎯' }),
      boton('Personaje', () => void import('./ui/personaje').then((m) => m.pantallaPersonaje(menu)), { icono: '👕' }),
      boton('Taller', () => pantallaTaller(menu), { icono: '🔨' }),
      boton('Récords', records, { icono: '🏆' }),
      boton('Configuración', () => configuracion(), { icono: '⚙️' }),
      h('p', { class: 'texto-suave ayuda-texto', text: AYUDA }),
    ),
  );
}

function configuracion(volver: () => void = menu, enJuego = false) {
  mostrarPanel(
    h('div', { class: 'tarjeta ancha' },
      h('div', { class: 'cabecera' }, boton('Volver', () => volver(), { icono: '←' }), h('h2', { text: '⚙️ Configuración' })),
      panelConfiguracion({ enJuego, alReiniciar: () => (app.g.nombre ? configuracion(volver, enJuego) : bienvenida()) }),
    ),
  );
}

function records() {
  const e = app.g.estadisticas;
  const dato = (t: string, v: string | number) => h('div', { class: 'fila-mejora' }, h('span', { text: t }), h('strong', { text: String(v) }));
  const filas = app.g.records.length
    ? app.g.records.map((r, i) => h('div', { class: 'fila-mejora' }, h('span', { text: `${i + 1}. ${r.nombre}` }), h('span', { text: `Noche ${r.noche} · 👹 ${r.abatidos}` })))
    : [h('p', { class: 'texto-suave', text: 'Aún no hay récords. ¡Aguanta tu primera noche!' })];
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h2', { text: '🏆 Récords' }),
      dato('Noche más alta', e.nocheMax),
      dato('Noches superadas', e.noches),
      dato('Salvados', e.salvados),
      dato('Monstruos abatidos', e.abatidos),
      dato('Materiales recogidos', e.recogidos),
      dato('Brasas ganadas', e.brasasTotal),
      dato('Caídas', e.caidas),
      h('h2', { text: 'Mejores noches' }),
      ...filas,
      boton('Volver', menu, { icono: '←' }),
    ),
  );
}

/* ---------- Noche ---------- */

let marcaDano = 0;
let faseMostrada = '';
let recordFinal = false;

async function empezar() {
  audio.iniciar();
  const mod = await cargar3d();
  const g = app.g;
  faseMostrada = '';
  recordFinal = false;
  const p: Partida = new Partida({
    nivel: g.nivel,
    semilla: g.semilla,
    modo: MODOS[g.config.dificultad],
    taller: g.taller,
    eventos: {
      recoger: (tipo) => audio.efecto('recoger', CONSTRUCCION.includes(tipo as never) ? 0.8 : 0.6),
      avivar: () => audio.efecto('nivel', 0.6),
      mejorar: () => {
        audio.efecto('nivel');
        vibrar(40);
      },
      construir: () => audio.efecto('golpe'),
      destello: (n) => audio.efecto(n ? 'explosion' : 'disparo', n ? 0.7 : 1),
      dano: () => {
        marcaDano = 0.6;
        audio.efecto('dano');
        vibrar(40);
      },
      abatido: () => audio.efecto('muerte', 0.7),
      apagada: () => audio.efecto('muerte', 0.4),
      estallido: () => audio.efecto('explosion', 0.5),
      fallo: () => audio.efecto('boton', 0.4),
      rescate: () => {
        audio.efecto('recoger');
        vibrar(30);
      },
      salvado: () => audio.efecto('nivel'),
      perdida: () => {
        audio.efecto('muerte', 0.8);
        vibrar(80);
      },
      fin: (r) => {
        audio.efecto(r.amanecer ? 'nivel' : 'muerte');
        recordFinal = anotarNoche(app.g, r, app.nombre());
        app.guardar();
      },
    },
  });
  partida = p;
  if (import.meta.env.DEV) (window as unknown as { __partida: Partida }).__partida = p;
  if (!render) render = new mod.Render3D(lienzo3d);
  render.calidadLuz(g.config.calidad === 'baja');
  ajustar();
  mostrarPanel(null);
  jugando(true);
}

function pausar() {
  const p = partida;
  if (!p || p.fase !== 'juego' || p.pausada) return;
  p.pausada = true;
  jugando(false);
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h2', { text: '⏸ Pausa' }),
      h('p', { class: 'texto-suave', text: `Noche ${p.nivel} · 🌅 en ${minutos(Math.max(0, Math.ceil(p.duracion - p.tiempo)))} · 👹 ${p.abatidos} · ❤️ ${Math.ceil(p.jugador.vida)}` }),
      boton('Continuar', continuar, { variante: 'primario', icono: '▶' }),
      boton('Configuración', () => configuracion(pausar2, true), { icono: '⚙️' }),
      boton('Salir', () => {
        if (!confirm('Perderás esta noche (tu Taller y tus noches superadas se guardan). ¿Seguro?')) return;
        menu();
      }, { icono: '🚪' }),
    ),
  );
}

function pausar2() {
  if (!partida) return menu();
  partida.pausada = false;
  pausar();
}

function continuar() {
  if (!partida) return;
  partida.pausada = false;
  mostrarPanel(null);
  jugando(true);
}

const minutos = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function pantallaFin(r: Resumen) {
  jugando(false);
  const datos = `🧍 ${r.salvados}/${r.objetivo} salvados · 👹 ${r.abatidos} abatidos · 🎒 ${r.recogidos} materiales`;
  if (r.amanecer) {
    mostrarPanel(
      h('div', { class: 'tarjeta' },
        h('h2', { text: `🌅 ¡Amanece! Noche ${r.nivel} superada` }),
        h('p', { class: 'texto-suave', text: `${datos} · 🔸 +${r.brasas} brasas` }),
        h('p', { class: 'texto-suave', text: recordFinal ? '🏆 ¡Nuevo récord!' : `La noche ${r.nivel + 1} será más larga, con más monstruos y más gente que salvar.` }),
        boton(`Noche ${app.g.nivel}`, empezar, { variante: 'primario', icono: '🌙' }),
        boton(`Taller (🔸 ${app.g.brasas})`, () => pantallaTaller(() => pantallaFin(r)), { icono: '🔨' }),
        boton('Menú', menu, { icono: '🏠' }),
      ),
    );
    return;
  }
  const caida = r.motivo === 'caida';
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h2', { text: caida ? '💀 La oscuridad te alcanzó' : '💔 No salvaste a suficientes' }),
      h('p', { class: 'texto-suave', text: `Noche ${r.nivel} · aguantaste ${minutos(r.tiempo)} · ${datos}` }),
      h('p', { text: `Llegaste a la noche ${r.nivel}. Todo empieza de nuevo: noche 1, sin brasas ni mejoras.` }),
      h('p', {
        class: 'texto-suave',
        text: caida
          ? 'Consejo: no te alejes sin fuego en la antorcha y mejora las luces para que quemen a los monstruos.'
          : 'Consejo: sigue la flecha 🆘, lleva a cada uno a la hoguera de su color y no dejes que su fuego quede en brasa.',
      }),
      boton('Empezar de nuevo (noche 1)', empezar, { variante: 'primario', icono: '↻' }),
      boton('Menú', menu, { icono: '🏠' }),
    ),
  );
}

addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' || e.code === 'Escape') pausar();
});
document.addEventListener('visibilitychange', () => document.hidden && pausar());

/* ---------- HUD ---------- */

/** Márgenes del área segura (muesca del móvil): un elemento oculto con padding env(safe-area-inset-*). */
const seguro = { izq: 0, arriba: 0, der: 0 };
const sonda = h('div', { style: 'position:fixed;visibility:hidden;pointer-events:none;padding-left:env(safe-area-inset-left);padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right)' });
document.body.append(sonda);
function medirSeguro() {
  const css = getComputedStyle(sonda);
  seguro.izq = parseFloat(css.paddingLeft) || 0;
  seguro.arriba = parseFloat(css.paddingTop) || 0;
  seguro.der = parseFloat(css.paddingRight) || 0;
}
medirSeguro();
addEventListener('resize', medirSeguro);

const sombra = (texto: string, x: number, y: number, color = '#fff') => {
  ctx.fillStyle = '#000c';
  ctx.fillText(texto, x + 1.5, y + 1.5);
  ctx.fillStyle = color;
  ctx.fillText(texto, x, y);
};

function barra(x: number, y: number, w: number, hh: number, valor: number, color: string, fondo = '#000a') {
  ctx.fillStyle = fondo;
  ctx.fillRect(x, y, w, hh);
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * Math.min(1, Math.max(0, valor))), hh - 2);
}

function recarga(x: number, y: number, icono: string, falta: number, total: number, tecla: string) {
  const listo = falta <= 0;
  ctx.fillStyle = '#000a';
  ctx.beginPath();
  ctx.arc(x, y, 17, 0, Math.PI * 2);
  ctx.fill();
  if (!listo && total > 0) {
    ctx.fillStyle = '#ffffff33';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - falta / total));
    ctx.fill();
  }
  ctx.strokeStyle = listo ? '#ffe7a0' : '#fff5';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 17, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = '16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.globalAlpha = listo ? 1 : 0.5;
  sombra(icono, x, y + 1);
  ctx.globalAlpha = 1;
  ctx.font = 'bold 10px system-ui, sans-serif';
  if (tecla) sombra(tecla, x + 13, y + 14, '#ddd');
}

/** Flecha en el borde de la pantalla hacia un punto del mundo. */
function flechaBorde(px: number, py: number, color: string, icono?: string) {
  const cx = ancho / 2;
  const cy = alto / 2;
  const ang = Math.atan2(py - cy, px - cx);
  const rx = ancho * 0.44;
  const ry = alto * 0.4;
  const ax = cx + Math.cos(ang) * rx;
  const ay = cy + Math.sin(ang) * ry;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(ax + Math.cos(ang) * 14, ay + Math.sin(ang) * 14);
  ctx.lineTo(ax + Math.cos(ang + 2.4) * 11, ay + Math.sin(ang + 2.4) * 11);
  ctx.lineTo(ax + Math.cos(ang - 2.4) * 11, ay + Math.sin(ang - 2.4) * 11);
  ctx.fill();
  if (icono) {
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    sombra(icono, ax - Math.cos(ang) * 16, ay - Math.sin(ang) * 16);
  }
}

const tecla = (t: string) => (tactil ? '' : ` (${t})`);

function dibujarHud(p: Partida, dt: number) {
  ctx.clearRect(0, 0, ancho, alto);
  ctx.textBaseline = 'middle';
  marcaDano = Math.max(0, marcaDano - dt);
  const j = p.jugador;
  const cx = ancho / 2;
  const r = render!;

  if (marcaDano > 0 || j.vida < j.vidaMax * 0.3) {
    const g = ctx.createRadialGradient(cx, alto / 2, Math.min(ancho, alto) * 0.3, cx, alto / 2, Math.max(ancho, alto) * 0.7);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(200,0,0,${Math.max(marcaDano * 0.6, j.vida < j.vidaMax * 0.3 ? 0.3 : 0)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, ancho, alto);
  }

  // Combustible de las luces cercanas y aviso de las que se apagan.
  ctx.textAlign = 'center';
  for (const l of p.luces) {
    const d = Math.hypot(l.x - j.x, l.z - j.z);
    const pt = r.proyectar(l.x, l.madre ? 1.6 : 2.4, l.z, ancho, alto);
    const apagandose = l.combustible > 0 && l.combustible < AVISO_APAGADO + 4 && !l.madre;
    if (!pt.visible) {
      if (app.g.config.avisoLuz && (apagandose || (l.madre && d > 12))) {
        const q = r.proyectar(l.x, 0, l.z, ancho, alto);
        flechaBorde(q.x, q.y, apagandose ? '#ff9a3c' : l.madre && p.madres.length > 1 ? colorMadre(l.indice).css : '#ffe7a0', l.madre ? '🔥' : '⏳');
      }
      continue;
    }
    if (d > 10 && !apagandose && l !== p.cercana) continue;
    const w = l.madre ? 60 : 44;
    const valor = l.combustible / capacidad(l.nivel);
    const color = l.combustible <= 0 ? '#555' : l.combustible < AVISO_APAGADO ? '#ff5a3a' : '#ffc83d';
    ctx.fillStyle = '#000c';
    ctx.fillRect(pt.x - w / 2 - 1, pt.y - 1, w + 2, 8);
    barra(pt.x - w / 2, pt.y, w, 6, valor, color, '#333c');
    ctx.font = 'bold 11px system-ui, sans-serif';
    const texto = l.combustible <= 0 ? (l.madre ? 'Brasa' : 'Apagada') : `${Math.ceil(l.combustible)} s`;
    sombra(`${'★'.repeat(l.nivel - 1)} ${texto}`.trim(), pt.x, pt.y - 9, l.combustible > 0 ? '#ffe7a0' : '#aaa');
  }

  // Vida de los monstruos heridos que se ven a la luz.
  for (const m of p.monstruos) {
    if (m.muerte >= 0 || m.vida >= m.vidaMax || p.brillo(m.x, m.z) < 0.25) continue;
    const pt = r.proyectar(m.x, 2, m.z, ancho, alto);
    if (!pt.visible) continue;
    barra(pt.x - 18, pt.y, 36, 5, m.vida / m.vidaMax, '#c060ff', '#000c');
  }

  // Personas y animalitos: «🆘» sobre los perdidos cercanos (del color de su madre) y vida de los heridos.
  ctx.textAlign = 'center';
  for (const per of p.personas) {
    if (per.estado === 'muerta') continue;
    const color = colorMadre(per.madre).css;
    if (per.estado === 'perdida') {
      if (Math.hypot(per.x - j.x, per.z - j.z) > 14) continue;
      const pt = r.proyectar(per.x, 1.7, per.z, ancho, alto);
      if (!pt.visible) continue;
      ctx.font = 'bold 18px system-ui, sans-serif';
      sombra('🆘', pt.x, pt.y - 4 + Math.sin(performance.now() / 200) * 3, color);
      continue;
    }
    if (per.vida >= per.vidaMax) continue;
    const pt = r.proyectar(per.x, 1.8, per.z, ancho, alto);
    if (!pt.visible) continue;
    barra(pt.x - 16, pt.y, 32, 5, per.vida / per.vidaMax, color, '#000c');
  }
  // Flecha de rescate: hacia la madre del primero de la fila o, si no llevas a nadie, al perdido más cercano.
  const guia = p.siguiendo[0];
  let destino: { x: number; z: number; color: string; icono: string } | null = null;
  if (guia) {
    const m = p.madres[guia.madre];
    destino = { x: m.x, z: m.z, color: colorMadre(guia.madre).css, icono: '🔥' };
  } else {
    let dm = Infinity;
    for (const per of p.personas) {
      if (per.estado !== 'perdida') continue;
      const d = Math.hypot(per.x - j.x, per.z - j.z);
      if (d < dm) {
        dm = d;
        destino = { x: per.x, z: per.z, color: colorMadre(per.madre).css, icono: '🆘' };
      }
    }
  }
  if (destino) {
    const q = r.proyectar(destino.x, 0, destino.z, ancho, alto);
    if (!q.visible) flechaBorde(q.x, q.y, destino.color, destino.icono);
  }

  // Vida, antorcha y destello (arriba a la izquierda).
  const bx = 12 + seguro.izq;
  const by = 10 + seguro.arriba;
  const bw = Math.min(tactil ? 220 : 260, ancho * 0.28);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(bx - 6, by - 6, bw + 12, 50);
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx - 6, by - 6, bw + 12, 50);
  ctx.textAlign = 'left';
  barra(bx, by, bw, 18, j.vida / j.vidaMax, j.vida > j.vidaMax * 0.3 ? '#5ad13c' : '#ff5a5a', '#401818');
  ctx.font = 'bold 12px system-ui, sans-serif';
  sombra(`❤️ ${Math.ceil(j.vida)}/${j.vidaMax}${j.enLuz ? '  ·  a salvo en la luz' : ''}`, bx + 6, by + 9);
  barra(bx, by + 22, bw, 16, j.antorcha / j.antorchaMax, j.antorcha > 0 ? '#d0702a' : '#555', '#2a1a10');
  sombra(j.antorcha > 0 ? `🔥 Antorcha ${Math.ceil(j.antorcha)} s` : '🔥 Apagada: enciéndela en una hoguera', bx + 6, by + 30, j.antorcha > 0 ? '#fff' : '#ffb070');
  recarga(bx + 18, by + 70, '✨', j.recargaDestello, p.recargaDestelloMax, tactil ? '' : 'Esp');

  // Noche y amanecer (arriba en el centro).
  ctx.textAlign = 'center';
  const nw = Math.min(360, ancho * 0.34);
  ctx.font = 'bold 15px system-ui, sans-serif';
  sombra(`🌙 Noche ${p.nivel} · amanece en ${minutos(Math.max(0, Math.ceil(p.duracion - p.tiempo)))}`, cx, 18 + seguro.arriba);
  barra(cx - nw / 2, 30 + seguro.arriba, nw, 8, p.progreso, '#ffb36b', '#1a1a2a');
  // Salvados y, con varias madres, el estado de cada una.
  ctx.font = 'bold 14px system-ui, sans-serif';
  const listos = p.salvados >= p.objetivo;
  const llevas = p.siguiendo.length ? `  ·  te siguen ${p.siguiendo.length}` : '';
  sombra(`🧍 Salvados ${p.salvados}/${p.objetivo}${llevas}`, cx, 52 + seguro.arriba, listos ? '#7dff6a' : '#fff');
  if (p.madres.length > 1) {
    const paso = 22;
    const x0 = cx - ((p.madres.length - 1) * paso) / 2;
    p.madres.forEach((m, i) => {
      const x = x0 + i * paso;
      ctx.fillStyle = colorMadre(i).css;
      ctx.globalAlpha = protege(m) ? 1 : 0.35;
      ctx.beginPath();
      ctx.arc(x, 72 + seguro.arriba, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.font = '10px system-ui, sans-serif';
      sombra(protege(m) ? '🔥' : '🔸', x, 72 + seguro.arriba);
    });
  }

  // Mochila (arriba a la derecha, junto a la pausa): combustibles y materiales de mejora.
  ctx.font = 'bold 13px system-ui, sans-serif';
  const celda = 44;
  const fx = ancho - 64 - seguro.der;
  const fila = (lista: readonly IdMaterial[], y: number) => {
    lista.forEach((id, i) => {
      const x = fx - (lista.length - i) * celda;
      const elegido = id === p.seleccionado;
      ctx.fillStyle = elegido ? 'rgba(255,200,61,0.25)' : 'rgba(0,0,0,0.6)';
      ctx.fillRect(x, y - 13, celda - 4, 26);
      ctx.strokeStyle = elegido ? '#ffc83d' : '#222';
      ctx.strokeRect(x, y - 13, celda - 4, 26);
      ctx.globalAlpha = p.inv[id] > 0 ? 1 : 0.4;
      ctx.textAlign = 'left';
      sombra(MATERIALES[id].icono, x + 3, y);
      ctx.textAlign = 'right';
      sombra(String(p.inv[id]), x + celda - 7, y);
      ctx.globalAlpha = 1;
    });
  };
  fila(COMBUSTIBLES, 24 + seguro.arriba);
  fila(CONSTRUCCION, 54 + seguro.arriba);

  // Ayuda contextual junto a una luz (abajo en el centro).
  ctx.textAlign = 'center';
  const yAyuda = alto - (tactil ? 26 : 30);
  if (p.cercana) {
    const l = p.cercana;
    const comb = p.combustibleParaAvivar();
    const partes = [comb ? `🔥 Avivar +${Math.round(DURACION[comb] * p.modo.combustible)} s con ${MATERIALES[comb].icono}${tecla('E')}` : '🔥 Sin combustible'];
    partes.push(l.nivel < NIVEL_MAX_LUZ ? `🔧 Mejorar: ${textoCoste(costeMejora(l.nivel))}${tecla('R')}` : '🔧 Nivel máximo');
    ctx.font = 'bold 14px system-ui, sans-serif';
    const texto = partes.join('   ·   ');
    const tw = ctx.measureText(texto).width + 24;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(cx - tw / 2, yAyuda - 15, tw, 30);
    sombra(texto, cx, yAyuda, '#ffe7a0');
  } else if (!j.enLuz && p.tiempo < 40) {
    ctx.font = '13px system-ui, sans-serif';
    sombra(`Busca materiales en la oscuridad y vuelve a la luz · 🏗️ Construir soporte${tecla('B')}`, cx, yAyuda, '#ccc');
  }

  if (p.mensajeT > 0) {
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.globalAlpha = Math.min(1, p.mensajeT * 2);
    sombra(p.mensaje, cx, alto * 0.26, '#ffd23f');
    ctx.globalAlpha = 1;
  }
  if (!j.enLuz && j.antorcha <= 0) {
    ctx.font = '12px system-ui, sans-serif';
    sombra('Sin antorcha los materiales no se ven: enciéndela en una hoguera', cx, alto * 0.26 + 26, '#ffb070');
  }
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
}

/* ---------- Bucle ---------- */

let fps = 60;
let ultimo = performance.now();
iniciarBucle(
  (dt) => rend.medir('logica', () => {
    entrada.actualizar();
    const p = partida;
    if (!p) return;
    if (p.fase !== 'juego') {
      if (faseMostrada !== p.fase && p.resumen) {
        faseMostrada = p.fase;
        // Se deja ver un instante el final de la noche antes del resumen.
        setTimeout(() => partida === p && pantallaFin(p.resumen!), 900);
      }
      return;
    }
    if (p.pausada) return;
    if (entrada.pulsado('pausa')) return pausar();
    const c = controlesVacios();
    c.x = entrada.x;
    c.z = entrada.y;
    c.destello = entrada.pulsado('destello');
    c.avivar = entrada.pulsado('avivar');
    c.mejorar = entrada.pulsado('mejorar');
    c.construir = entrada.pulsado('construir');
    c.cambiar = entrada.pulsado('cambiar');
    p.actualizar(dt, c);
    // Botones táctiles de luz: apagados si no hay una luz al alcance.
    controles.classList.toggle('sin-luz', !p.cercana);
  }),
  (alfa) => {
    const ahora = performance.now();
    const quieto = !partida || partida.pausada || partida.fase !== 'juego';
    if (!rend.debeDibujar(ahora, quieto)) return;
    const dt = Math.min(0.1, (ahora - ultimo) / 1000);
    fps = fps * 0.9 + (1 / Math.max(0.001, dt)) * 0.1;
    ultimo = ahora;
    if (partida && render) {
      render.sombras(tamanoSombras(app.g.config.calidad));
      rend.medir('render', () => render!.dibujar(partida!, app.g.look, { animaciones: !app.g.config.animacionesReducidas, brillo: app.g.config.brilloMateriales }, dt, quieto ? 1 : alfa));
      dibujarHud(partida, dt);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, ancho, alto);
    }
    if (app.g.config.mostrarFps) {
      ctx.fillStyle = '#9f9';
      ctx.font = '11px monospace';
      ctx.fillText(`${Math.round(fps)} FPS`, 8, alto - 8);
    }
    rend.actualizarMonitor(render?.renderer ?? null);
  },
);

if (import.meta.env.DEV && location.search.includes('demo')) {
  // Pruebas: ?demo&noche=8 empieza directamente en esa noche; &luces enciende todos los soportes y &x=..&z=.. mueve al jugador.
  const q = new URLSearchParams(location.search);
  const n = Number(q.get('noche'));
  if (n > 0) app.g.nivel = n;
  void empezar().then(() => {
    const p = partida!;
    if (q.has('luces')) p.luces.forEach((l, i) => (l.combustible = 30 + i * 6, l.nivel = 1 + (i % 4), l.tipo = (['ramas', 'carbon', 'aceite', 'cristal'] as const)[i % 4]));
    if (q.has('x')) p.jugador.x = p.jugador.px = Number(q.get('x'));
    if (q.has('z')) p.jugador.z = p.jugador.pz = Number(q.get('z'));
  });
} else if (app.g.nombre) menu();
else bienvenida();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}
addEventListener('load', () => setTimeout(() => void cargar3d(), 800));
