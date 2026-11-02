# McL Darklight

Juego de supervivencia nocturna en 3D para el navegador. Cuando cae la noche, los monstruos salen de la oscuridad y solo la luz los detiene. Hay personas y animalitos perdidos en la oscuridad: rescátalos, llévalos hasta su Hoguera madre y mantén su fuego vivo hasta el amanecer. Cada noche es más larga, con un mapa más grande, más monstruos y más gente que salvar, y nada tiene tope.

- **🆘 Rescate**: cada noche pide un mínimo de salvados vivos al amanecer. Al tocar a alguien perdido te sigue en fila (los monstruos pueden atacarlo por el camino) y queda a salvo al entrar en la luz de su madre.
- **Hogueras madre de colores**: con las noches salen más (antes en Desafío). Cada perdido lleva el color de la suya y solo se salva allí. Si su madre queda en brasa, los salvados se congelan; y cuanta más gente calienta, más leña gasta.
- **Al perder, todo empieza de nuevo**: noche 1, mapa nuevo, sin brasas ni mejoras del Taller (se conservan los récords).
- **Hoguera madre**: nunca se apaga del todo, pero sin combustible queda en brasa y la brasa no protege.
- **Soportes** repartidos por el mapa y la opción de construir otros donde estés (🪵 + 🪨).
- **Combustibles** con duración distinta: 🪵 ramas 25 s, ⚫ carbón 50 s, 🛢️ aceite 90 s y 💎 cristal lunar 160 s. La luz se encoge y parpadea antes de apagarse.
- **Mejoras** de cada luz (nivel 1 a 5) con 🪨 piedra, ⚙️ hierro y ✨ polvo de estrella: más radio, menos consumo y, desde el nivel 3, la luz quema a los monstruos.
- **Antorcha** (25 s): ilumina poco a tu alrededor y arde sin parar; solo se vuelve a encender acercándola a una hoguera con fuego (la brasa de la madre no sirve). **✨ Destello**: aturde y daña a los monstruos cercanos.
- **Monstruos**: la Sombra (rápida), el Acechador (fuerte), el Apagador (desde la noche 2, se come el combustible de las luces) y la Polilla (desde la noche 4, se lanza contra las luces).
- **🔨 Taller**: mejoras permanentes con las brasas de cada noche (antorcha, bolsillos, constructor, destello y Hoguera madre).
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

`src/core/*` es la lógica pura (combustibles y luces, mapa por semilla, monstruos, taller y dificultad). `src/game/logica.ts` es la noche, y `src/game/render3d.ts` el dibujo con three.js. La oscuridad usa un mapa de luz de baja resolución (`DataTexture`, una ventana de 80 m que sigue a la cámara) que leen todos los materiales Lambert con un parche `onBeforeCompile`, en lugar de una `PointLight` por cada luz.
