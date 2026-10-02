# Universe is Born

De un puñado de átomos en el universo oscuro a un agujero negro supermasivo en el corazón de una galaxia. Un juego cósmico que corre en el navegador.

**15 etapas:** materia primordial → nube molecular → protoestrella → estrella masiva (H → He → C → O → Ne → Si) → núcleo de hierro → supernova → agujero negro → acreción → disco → jets → crecimiento → fusiones → agujero negro intermedio → supermasivo → galaxia.

## Características

- Agujero negro con **lente gravitacional real**: se integra la trayectoria de la luz por píxel (disco con efecto Doppler, anillo de fotones, anillos de Einstein).
- Galaxia espiral de hasta 220.000 estrellas animada en GPU (brazos por ondas de densidad).
- Gráficos y audio **100% procedurales** (shaders + WebAudio): sin assets externos ni licencias.
- Calidad gráfica Baja / Media / Alta / Automática, controles de teclado, mouse y táctiles.
- Códice científico opcional, logros, estadísticas y guardado local.

## Modo libre

Al terminar el viaje se desbloquea el **modo libre**, accesible desde el menú principal cuando quieras. Es tu galaxia, persistente e independiente de las partidas de historia:

- Genera **polvo estelar ✦** de forma pasiva (también mientras no juegas), canalizando nubes, liberando la energía del cuásar con los jets y atrapando cúmulos globulares.
- Gástalo en la **tienda** (`T`): estrellas especiales que orbitan en tu galaxia (gigantes rojas, púlsares, magnetares, estrellas de Población III…), nebulosas que multiplican tu producción, mejoras y estilos (número de brazos, enrollamiento, paleta, barra central, color de los jets).
- Lo invertido en estrellas y nebulosas sube el **nivel** de la galaxia: más grande, más estrellas, más zoom (al alejarte aparece la red cósmica) y +5% de producción por nivel.
- Terminar otra partida de historia recompensa tu galaxia con polvo estelar extra.

## Controles

| Acción | PC | Táctil |
| --- | --- | --- |
| Moverse | Cursor o WASD | Arrastrar a la izquierda |
| Habilidad principal | Clic izquierdo / Espacio | Botón principal |
| Habilidad secundaria | Clic derecho / Shift / E | Botón 2 |
| Zoom | Rueda del mouse | — |
| Pausa | Esc | Botón II |
| Tienda (modo libre) | T | Botón ✦ Tienda |

## Desarrollo

```bash
npm install
npm run dev      # servidor local en http://localhost:5173
npm run build    # build de producción en dist/
```

Modo debug: `?debug&phase=blackhole&mass=6` salta a una fase (`primordial`, `cloud`, `protostar`, `stellar`, `supernova`, `neutron`, `blackhole`, `galaxy`, `sandbox`). En debug, **N** salta la etapa y **M** suma masa (en el modo libre, ambas suman polvo estelar).

## Publicación

El workflow `.github/workflows/deploy.yml` compila y publica el juego en GitHub Pages en cada push a `main`. Activalo en **Settings → Pages → Source: GitHub Actions**.

Stack: Vite + TypeScript + Three.js.
