# McL Darklight

Juego de supervivencia nocturna en 3D para el navegador. Cuando cae la noche, los monstruos salen de la oscuridad y solo la luz los detiene. Enciendes y avivas puntos de luz, buscas materiales escondidos en la oscuridad y mejoras tus luces para aguantar hasta el amanecer. Cada noche es más larga, con un mapa más grande y más monstruos, y no hay final.

- **Hoguera madre** en el centro: nunca se apaga del todo, pero sin combustible queda en brasa.
- **Soportes** repartidos por el mapa y la opción de construir otros donde estés (🪵 + 🪨).
- **Combustibles** con duración distinta: 🪵 ramas 25 s, ⚫ carbón 50 s, 🛢️ aceite 90 s y 💎 cristal lunar 160 s. La luz se encoge y parpadea antes de apagarse.
- **Mejoras** de cada luz (nivel 1 a 5) con 🪨 piedra, ⚙️ hierro y ✨ polvo de estrella: más radio, menos consumo y, desde el nivel 3, la luz quema a los monstruos.
- **Linterna**: ilumina poco a tu alrededor, gasta aceite fuera de la luz y se rellena dentro. **✨ Destello**: aturde y daña a los monstruos cercanos.
- **Monstruos**: la Sombra (rápida), el Acechador (fuerte), el Apagador (desde la noche 3, se come el combustible de las luces) y la Polilla (desde la noche 5, se lanza contra las luces).
- **🔨 Taller**: mejoras permanentes con las brasas de cada noche (linterna, bolsillos, constructor, destello y Hoguera madre).
- **👕 Personaje** con el mismo sistema que el Arcade.
- Teclado (WASD, E avivar, Q combustible, R mejorar, B construir, Espacio destello), mando y controles táctiles.
- Funciona sin conexión (PWA) y el progreso queda en el navegador.

Publicado en https://mcl-darklight.netlify.app

## Desarrollo

```sh
npm install
npm run dev      # ?demo empieza una noche; &noche=6 en esa noche; &luces enciende los soportes; &x=..&z=.. mueve al jugador
npm test
npm run build
```

`src/core/*` es la lógica pura (combustibles y luces, mapa por semilla, monstruos, taller y dificultad). `src/game/logica.ts` es la noche, y `src/game/render3d.ts` el dibujo con three.js. La oscuridad usa un mapa de luz de baja resolución (`DataTexture`) que leen todos los materiales Lambert con un parche `onBeforeCompile`, en lugar de una `PointLight` por cada luz.
