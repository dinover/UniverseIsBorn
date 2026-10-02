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
- **Observatorio** (`O`): la cámara mira al cielo sobre tu galaxia, donde brillan tus constelaciones (solo se ven desde ahí). Seis minijuegos que se desbloquean al subir de nivel:
  - **Lluvia de supernovas**: atrapa cada supernova cuando el anillo la alcanza; combos, doradas que suman tiempo y estrellas estables trampa.
  - **Memoria estelar**: repite la melodía de las estrellas; cada nivel suma una nota y paga más (desde el 7 las estrellas giran).
  - **Constelaciones**: encuentra 12 figuras reales entre señuelos y únelas; cada una nueva da +2% de producción para siempre.
  - **Estrella explosiva**: la cámara vuela hasta una estrella; comprime su núcleo al ritmo de sus latidos de H a Fe hasta que estalle (sin fallos: hipernova).
  - **Galaxias enanas**: atrae tres galaxias enanas con tu marea pulsando en la zona verde del dial.
  - **Honda gravitatoria**: lanza cometas, curva su trayectoria con la gravedad y recoge orbes; rozar el agujero negro multiplica.
- Cada partida usa una carga de energía ◆ (5 máximo, +1 cada 8 minutos y al subir de nivel); sin energía se puede practicar al 20%. Las recompensas escalan con tu producción; hay récords, estrellas ★, logros y estilos exclusivos.

## Controles

| Acción | PC | Táctil |
| --- | --- | --- |
| Moverse | Cursor o WASD | Arrastrar a la izquierda |
| Habilidad principal | Clic izquierdo / Espacio | Botón principal |
| Habilidad secundaria | Clic derecho / Shift / E | Botón 2 |
| Zoom | Rueda del mouse | — |
| Pausa | Esc | Botón II |
| Tienda (modo libre) | T | Botón ✦ Tienda |
| Observatorio (modo libre) | O | Botón ◎ Observatorio |

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
