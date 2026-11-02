import { app } from '../app';
import { audio } from '../audio';
import { costeTaller, IDS_TALLER, TALLER } from '../core/taller';
import { boton, h, mostrarPanel } from './dom';

/** Taller: mejoras permanentes que se compran con las brasas de cada noche. */
export function pantallaTaller(alVolver: () => void) {
  const g = app.g;
  const filas = IDS_TALLER.map((id) => {
    const d = TALLER[id];
    const n = g.taller[id];
    const max = n >= d.max;
    const coste = costeTaller(n);
    const b = boton(max ? 'Máximo' : `🔸 ${coste}`, () => {
      if (max || g.brasas < coste) return;
      g.brasas -= coste;
      g.taller[id]++;
      app.guardar();
      audio.efecto('nivel');
      pantallaTaller(alVolver);
    }, { variante: max ? 'suave' : 'secundario' });
    b.disabled = max || g.brasas < coste;
    return h('div', { class: 'mejora-taller' },
      h('div', {},
        h('strong', { text: `${d.icono} ${d.nombre} · ${n}/${d.max}` }),
        h('small', { text: d.texto }),
      ),
      b,
    );
  });
  mostrarPanel(
    h('div', { class: 'tarjeta ancha' },
      h('div', { class: 'cabecera' }, boton('Volver', alVolver, { icono: '←' }), h('h2', { text: '🔨 Taller' })),
      h('p', { class: 'texto-suave', text: `Tienes 🔸 ${g.brasas} brasas. Se ganan al terminar cada noche (más si llegas al amanecer).` }),
      ...filas,
    ),
  );
}
