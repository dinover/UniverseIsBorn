/**
 * Stage briefings: shown (and the game paused) whenever a new stage starts,
 * and on demand from the "?" button. Plain language: goal first, then how.
 */
export interface Briefing {
  goal: string;
  how: string[];
}

type Keys = { click: string; right: string; move: string; hold: string };

export function briefing(stage: number, touch: boolean): Briefing | null {
  const k: Keys = touch
    ? { click: 'TOCA', right: 'el botón 2', move: 'Arrastra en la parte izquierda de la pantalla', hold: 'Mantén el botón principal' }
    : { click: 'CLIC', right: 'CLIC DERECHO (o SHIFT)', move: 'Mueve el cursor (o WASD)', hold: 'Mantén CLIC (o ESPACIO)' };
  const B: Record<number, Briefing> = {
    1: {
      goal: 'Acumula masa suficiente para formar una nube de gas.',
      how: [
        `<b>Moverte:</b> ${k.move}. Tu gravedad atrae el gas cercano.`,
        `<b>Pulso gravitacional:</b> ${k.hold}. Más alcance y fuerza; consume energía.`,
        'Busca las zonas más densas y los <b>pozos de materia oscura</b> (círculos violetas y distorsiones del fondo): dentro, tu gravedad se duplica.',
      ],
    },
    2: {
      goal: 'Supera la masa de Jeans y mantenla 3 segundos para que la nube colapse.',
      how: [
        `<b>Contraer:</b> ${k.hold}. Aumenta la densidad… y la temperatura.`,
        'Si la temperatura sale de la zona verde, el gas se <b>dispersa</b> y pierdes masa: suelta y deja enfriar.',
        'Absorbe otras nubes para ganar masa. Las nubes oscuras de <b>polvo</b> te ayudan a enfriarte.',
        'Si llega una <b>onda de choque</b> mientras contraes, te comprime a tu favor.',
      ],
    },
    3: {
      goal: 'Calienta el núcleo hasta 10 millones de grados para encender la fusión.',
      how: [
        'Mantén la aguja del <b>equilibrio</b> en la zona verde: el núcleo solo se calienta ahí. La aguja tiene inercia: anticípate.',
        `<b>Contraer:</b> ${k.hold}. Calienta más rápido, pero empuja hacia el colapso.`,
        `<b>Chorro bipolar:</b> ${k.right}. Alivia la presión cuando hay fulguraciones.`,
        'Muévete para atrapar grumos de gas: más masa = destino más oscuro. Cada expansión te hace perder masa; por debajo de 8 M☉ fracasas.',
      ],
    },
    4: {
      goal: 'Fusiona elementos cada vez más pesados: H → He → C → O → Ne → Si.',
      how: [
        `<b>Fusionar:</b> pulsa ${k.click} o ESPACIO justo cuando cada onda cruza el <b>anillo de fusión</b>.`,
        'Los aciertos perfectos suman más; los fallos bajan la estabilidad.',
        'Cada elemento cambia el ritmo: pulsos dorados que valen doble, velocidades alternas, dos capas…',
        `Desde el carbono: <b>convección</b> con ${k.right} ralentiza el ritmo por unos segundos.`,
      ],
    },
    5: {
      goal: 'Resiste las 20 ondas de colapso del núcleo de hierro.',
      how: [
        `Las ondas ahora vienen <b>hacia dentro</b>: pulsa ${k.click} o ESPACIO cuando tocan el anillo del núcleo.`,
        'Cada acierto hace el núcleo más masivo. Un núcleo masivo termina directamente en <b>agujero negro</b>.',
        'El ritmo se acelera. Es imposible evitar el colapso… solo puedes decidir cómo será.',
      ],
    },
    7: {
      goal: 'Eres un agujero negro. Captura tu primera materia.',
      how: [
        `<b>Moverte:</b> ${k.move}.`,
        'Las líneas muestran el futuro de cada objeto: <b style="color:#ffd070">dorada</b> = caerá, <b style="color:#7fe0ff">cian</b> = orbitará, <b style="color:#ff6a5a">roja</b> = escapará.',
        `<b>Arrastre:</b> ${k.hold}. Frena lo que orbita a tu alrededor para que caiga en espiral. Gasta energía.`,
      ],
    },
    8: {
      goal: 'Aliméntate hasta tener suficiente gas para formar un disco de acreción.',
      how: [
        'El gas cae al disco y te hace crecer poco a poco.',
        'Las <b>estrellas</b> se destrozan por fuerzas de marea: dan mucha masa, pero la mitad sale despedida.',
        'Usa el arrastre sobre lo que tiene trayectoria cian para convertirla en dorada.',
      ],
    },
    9: {
      goal: 'Crece hasta 35 masas solares.',
      how: ['Cuanta más materia cae, más brilla el disco y más <b>energía</b> recuperas.', 'La barra <b>Acreción</b> indica cuánto estás comiendo por segundo.'],
    },
    10: {
      goal: 'Usa tus jets y crece hasta 150 masas solares.',
      how: [
        `<b>Jets:</b> mantén ${k.right}. Disparan hacia ${touch ? 'donde te mueves' : 'el cursor'} y gastan energía.`,
        'Empujan cualquier cuerpo. Si golpean una <b>nube de gas</b>, forman estrellas nuevas: más alimento.',
      ],
    },
    11: {
      goal: 'Crece hasta 600 masas solares.',
      how: [
        '<b>Enanas blancas</b> y <b>estrellas de neutrones</b> caen enteras, pero son rápidas.',
        'El haz giratorio de los púlsares <b>drena tu energía</b> si te toca.',
        'El <b>polvo</b> vale poco y te frena.',
      ],
    },
    12: {
      goal: 'Fusiónate con otros agujeros negros y alcanza 8.000 masas solares.',
      how: [
        '<b style="color:#7dffb2">Verdes</b> (más pequeños): acércate y empezará una fusión.',
        `Durante la fusión, pulsa ${k.click} o ESPACIO cuando la aguja pase por la zona verde. 3 aciertos = fusión perfecta, sin retroceso.`,
        '<b style="color:#ff4d5e">Rojos</b> (más grandes): huye o empújalos con tus jets. Si te atrapan pierdes el 35% de tu masa.',
      ],
    },
    13: {
      goal: 'Domina tu entorno hasta llegar al millón de masas solares.',
      how: ['Los <b>cúmulos</b> se desarman con tu marea: acércate y sus estrellas caerán una a una.', 'Las <b>nebulosas</b> te alimentan de forma continua mientras estés cerca.', 'Sigue fusionándote con otros agujeros negros.'],
    },
    14: {
      goal: 'Canaliza 3 nubes de gas hacia el centro de tu galaxia.',
      how: [
        `Las nubes de gas están marcadas con <b>anillos</b>. ${touch ? 'Tócalas' : 'Haz CLIC cerca de una'} (o pulsa ${touch ? 'el botón principal' : 'ESPACIO'}) y caerá en espiral hacia ti.`,
        `<b>Jets del cuásar:</b> mantén ${k.right}.`,
        ...(touch ? [] : ['Usa la <b>rueda del mouse</b> para acercarte hasta el agujero negro.']),
      ],
    },
    15: {
      goal: 'Haz crecer tu galaxia: 10 millones M☉ → galaxia satélite → 150 millones M☉ → colisión galáctica.',
      how: [
        `Sigue canalizando nubes. Si la <b>Actividad del cuásar</b> se acerca al máximo, mantén ${k.right} para liberarla por los jets; si no, expulsará tu gas.`,
        'Con la <b>Formación estelar</b> alta, tu galaxia te alimenta sola. No te comas todo el gas de golpe.',
        `Cuando llegue la <b>galaxia satélite</b> (etiqueta verde), ${touch ? 'tócala' : 'haz CLIC sobre ella'}.`,
        `En la <b>colisión</b>, pulsa ${touch ? 'el botón' : 'ESPACIO'} cuando la aguja pase por la zona verde.`,
      ],
    },
  };
  return B[stage] ?? null;
}
