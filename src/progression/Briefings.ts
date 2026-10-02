import { tr } from '../i18n/i18n';

/**
 * Stage briefings: shown (and the game paused) whenever a new stage starts,
 * and on demand from the "?" button. Plain language: goal first, then how.
 */
export interface Briefing {
  goal: string;
  how: string[];
}

type Keys = { press: string; right: string; move: string; hold: string };

export function briefing(stage: number, touch: boolean): Briefing | null {
  const k: Keys = touch
    ? {
        press: tr('toca el botón principal', 'tap the main button'),
        right: tr('el botón 2', 'button 2'),
        move: tr('Arrastra el dedo por la parte izquierda de la pantalla', 'Drag your finger on the left side of the screen'),
        hold: tr('Mantén pulsado el botón principal', 'Hold the main button'),
      }
    : {
        press: tr('pulsa CLIC o ESPACIO', 'press CLICK or SPACE'),
        right: tr('CLIC DERECHO (o SHIFT)', 'RIGHT CLICK (or SHIFT)'),
        move: tr('Mueve el cursor (o usa WASD)', 'Move the cursor (or use WASD)'),
        hold: tr('Mantén pulsado CLIC (o ESPACIO)', 'Hold CLICK (or SPACE)'),
      };
  const B: Record<number, Briefing> = {
    1: {
      goal: tr('Reúne suficiente materia para formar una nube de gas.', 'Gather enough matter to form a cloud of gas.'),
      how: [
        tr(`<b>Para moverte:</b> ${k.move}. Tu gravedad atrae poco a poco el gas cercano.`, `<b>To move:</b> ${k.move}. Your gravity slowly draws in nearby gas.`),
        tr(`<b>Pulso gravitacional:</b> ${k.hold}. Llegas más lejos y atraes con más fuerza, aunque gastas energía.`, `<b>Gravity pulse:</b> ${k.hold}. You reach farther and pull harder, though it uses energy.`),
        tr(
          'Busca las zonas más densas y los <b>pozos de materia oscura</b> (círculos violetas y ondulaciones en el fondo): dentro de ellos, tu gravedad se duplica.',
          'Look for the densest areas and the <b>dark matter wells</b> (violet circles and ripples in the background): inside them, your gravity doubles.',
        ),
      ],
    },
    2: {
      goal: tr('Supera la masa de Jeans y mantenla durante 3 segundos para que la nube colapse.', 'Exceed the Jeans mass and hold it for 3 seconds so the cloud can collapse.'),
      how: [
        tr(`<b>Contraer:</b> ${k.hold}. La nube se vuelve más densa… y también más caliente.`, `<b>Contract:</b> ${k.hold}. The cloud grows denser… and warmer, too.`),
        tr(
          'Si la temperatura sale de la zona verde, el gas se <b>dispersa</b> y pierdes masa. Suelta un momento y deja que se enfríe.',
          'If the temperature leaves the green zone, the gas <b>disperses</b> and you lose mass. Let go for a moment and let it cool.',
        ),
        tr('Absorbe otras nubes para ganar masa. Las nubes oscuras de <b>polvo</b> te ayudan a enfriarte.', 'Absorb other clouds to gain mass. Dark clouds of <b>dust</b> help you cool down.'),
        tr('Si llega una <b>onda de choque</b> mientras contraes, te ayudará a comprimirte.', 'If a <b>shock wave</b> arrives while you contract, it will help squeeze you together.'),
      ],
    },
    3: {
      goal: tr('Calienta el núcleo hasta 10 millones de grados para encender la fusión.', 'Heat the core to 10 million degrees to ignite fusion.'),
      how: [
        tr(
          'Mantén la aguja del <b>equilibrio</b> en la zona verde: el núcleo solo se calienta ahí. La aguja tiene inercia, así que conviene anticiparse.',
          'Keep the <b>balance</b> needle in the green zone: the core only heats up there. The needle has inertia, so it helps to plan ahead.',
        ),
        tr(`<b>Contraer:</b> ${k.hold}. Calienta más rápido, pero te acerca al colapso.`, `<b>Contract:</b> ${k.hold}. It heats faster, but brings you closer to collapse.`),
        tr(`<b>Chorro bipolar:</b> ${k.right}. Libera presión cuando aparecen fulguraciones.`, `<b>Bipolar jet:</b> ${k.right}. Releases pressure when flares appear.`),
        tr(
          'Muévete para atrapar grumos de gas: con más masa, tu destino será más extraordinario. Cada expansión te hace perder masa, y por debajo de 8 M☉ la estrella no llegará a ser masiva.',
          'Move around to catch clumps of gas: the more mass you have, the more extraordinary your fate. Every expansion costs you mass, and below 8 M☉ the star won\'t become massive.',
        ),
      ],
    },
    4: {
      goal: tr('Fusiona elementos cada vez más pesados: H → He → C → O → Ne → Si.', 'Fuse heavier and heavier elements: H → He → C → O → Ne → Si.'),
      how: [
        tr(`<b>Fusionar:</b> ${k.press} justo cuando cada onda cruce el <b>anillo de fusión</b>.`, `<b>Fuse:</b> ${k.press} right as each wave crosses the <b>fusion ring</b>.`),
        tr('Los aciertos perfectos suman más; los fallos bajan la estabilidad.', 'Perfect hits are worth more; misses lower your stability.'),
        tr('Cada elemento tiene su propio ritmo: pulsos dorados que valen doble, velocidades que cambian, dos capas a la vez…', 'Each element has its own rhythm: golden pulses worth double, changing speeds, two layers at once…'),
        tr(`A partir del carbono, la <b>convección</b> (${k.right}) calma el ritmo durante unos segundos.`, `From carbon onward, <b>convection</b> (${k.right}) slows the rhythm for a few seconds.`),
      ],
    },
    5: {
      goal: tr('Resiste las 20 ondas de colapso del núcleo de hierro.', 'Hold out through the 20 collapse waves of the iron core.'),
      how: [
        tr(`Ahora las ondas vienen <b>hacia dentro</b>: ${k.press} cuando toquen el anillo del núcleo.`, `Now the waves move <b>inward</b>: ${k.press} when they touch the core ring.`),
        tr('Cada acierto hace el núcleo más masivo. Un núcleo muy masivo se convierte directamente en un <b>agujero negro</b>.', 'Each hit makes the core more massive. A very massive core turns straight into a <b>black hole</b>.'),
        tr('El ritmo se acelera. El colapso es inevitable, pero tú decides cómo será.', 'The rhythm speeds up. The collapse is inevitable, but you decide how it unfolds.'),
      ],
    },
    7: {
      goal: tr('Eres un agujero negro recién nacido. Captura tu primera materia.', 'You are a newborn black hole. Capture your first matter.'),
      how: [
        tr(`<b>Para moverte:</b> ${k.move}.`, `<b>To move:</b> ${k.move}.`),
        tr(
          'Las líneas muestran el camino de cada objeto: <b style="color:#ffd070">dorada</b> = caerá, <b style="color:#7fe0ff">cian</b> = orbitará, <b style="color:#ff6a5a">roja</b> = escapará.',
          'The lines show where each object is headed: <b style="color:#ffd070">gold</b> = it will fall in, <b style="color:#7fe0ff">cyan</b> = it will orbit, <b style="color:#ff6a5a">red</b> = it will escape.',
        ),
        tr(`<b>Arrastre:</b> ${k.hold}. Frena lo que orbita a tu alrededor para que caiga en espiral. Gasta energía.`, `<b>Drag:</b> ${k.hold}. It slows whatever orbits you so it spirals in. Uses energy.`),
      ],
    },
    8: {
      goal: tr('Aliméntate hasta reunir gas suficiente para formar un disco de acreción.', 'Feed until you have gathered enough gas to form an accretion disk.'),
      how: [
        tr('El gas cae hacia el disco y te hace crecer poco a poco.', 'Gas falls into the disk and helps you grow little by little.'),
        tr('Las <b>estrellas</b> se deshacen por las fuerzas de marea: aportan mucha masa, aunque la mitad sale despedida.', '<b>Stars</b> come apart under tidal forces: they bring a lot of mass, though half of it is flung away.'),
        tr('Usa el arrastre sobre lo que tiene trayectoria cian para que se vuelva dorada.', 'Use drag on anything with a cyan path to turn it gold.'),
      ],
    },
    9: {
      goal: tr('Crece hasta 35 masas solares.', 'Grow to 35 solar masses.'),
      how: [
        tr('Cuanta más materia cae, más brilla el disco y más <b>energía</b> recuperas.', 'The more matter falls in, the brighter the disk glows and the more <b>energy</b> you recover.'),
        tr('La barra de <b>acreción</b> indica cuánta materia recibes por segundo.', 'The <b>accretion</b> bar shows how much matter you take in each second.'),
      ],
    },
    10: {
      goal: tr('Usa tus chorros y crece hasta 150 masas solares.', 'Use your jets and grow to 150 solar masses.'),
      how: [
        tr(`<b>Chorros:</b> mantén ${k.right}. Apuntan hacia ${touch ? 'donde te mueves' : 'el cursor'} y gastan energía.`, `<b>Jets:</b> hold ${k.right}. They point toward ${touch ? 'where you move' : 'the cursor'} and use energy.`),
        tr('Empujan cualquier cuerpo. Si alcanzan una <b>nube de gas</b>, hacen nacer estrellas nuevas: más alimento.', 'They push any body. If they reach a <b>gas cloud</b>, new stars are born: more food for you.'),
      ],
    },
    11: {
      goal: tr('Crece hasta 600 masas solares.', 'Grow to 600 solar masses.'),
      how: [
        tr('Las <b>enanas blancas</b> y las <b>estrellas de neutrones</b> caen enteras, pero se mueven rápido.', '<b>White dwarfs</b> and <b>neutron stars</b> fall in whole, but they move fast.'),
        tr('El haz giratorio de los púlsares <b>agota tu energía</b> si te alcanza.', "A pulsar's sweeping beam <b>drains your energy</b> if it touches you."),
        tr('El <b>polvo</b> aporta poco y te frena.', '<b>Dust</b> adds little and slows you down.'),
      ],
    },
    12: {
      goal: tr('Fusiónate con otros agujeros negros y alcanza 8.000 masas solares.', 'Merge with other black holes and reach 8,000 solar masses.'),
      how: [
        tr('<b style="color:#7dffb2">Verdes</b> (más pequeños): acércate y comenzará una fusión.', '<b style="color:#7dffb2">Green</b> (smaller): get close and a merger will begin.'),
        tr(
          `Durante la fusión, ${k.press} cuando la aguja pase por la zona verde. Con 3 aciertos, la fusión es perfecta y sin retroceso.`,
          `During the merger, ${k.press} when the needle crosses the green zone. Three hits make a perfect merger, with no recoil.`,
        ),
        tr(
          '<b style="color:#ff4d5e">Rojos</b> (más grandes): mantén la distancia o apártalos con tus chorros. Si te alcanzan, pierdes el 35% de tu masa.',
          '<b style="color:#ff4d5e">Red</b> (larger): keep your distance or push them away with your jets. If they catch you, you lose 35% of your mass.',
        ),
      ],
    },
    13: {
      goal: tr('Sigue creciendo hasta alcanzar un millón de masas solares.', 'Keep growing until you reach a million solar masses.'),
      how: [
        tr('Los <b>cúmulos</b> se deshacen con tu marea: acércate y sus estrellas caerán una a una.', '<b>Clusters</b> unravel under your tide: get close and their stars will fall in one by one.'),
        tr('Las <b>nebulosas</b> te alimentan sin pausa mientras estés cerca.', '<b>Nebulae</b> feed you steadily while you stay close.'),
        tr('Sigue fusionándote con otros agujeros negros.', 'Keep merging with other black holes.'),
      ],
    },
    14: {
      goal: tr('Atrae 3 nubes de gas hacia el centro de tu galaxia.', 'Draw 3 gas clouds into the center of your galaxy.'),
      how: [
        tr(
          `Las nubes de gas están marcadas con <b>anillos</b>. ${touch ? 'Tócalas' : 'Haz CLIC cerca de una'} (o pulsa ${touch ? 'el botón principal' : 'ESPACIO'}) y caerá en espiral hacia ti.`,
          `Gas clouds are marked with <b>rings</b>. ${touch ? 'Tap one' : 'CLICK near one'} (or press ${touch ? 'the main button' : 'SPACE'}) and it will spiral toward you.`,
        ),
        tr(`<b>Chorros del cuásar:</b> mantén ${k.right}.`, `<b>Quasar jets:</b> hold ${k.right}.`),
        ...(touch ? [] : [tr('Usa la <b>rueda del mouse</b> para acercarte al agujero negro.', 'Use the <b>mouse wheel</b> to zoom in on the black hole.')]),
      ],
    },
    15: {
      goal: tr(
        'Haz crecer tu galaxia: 10 millones de M☉ → galaxia satélite → 150 millones de M☉ → encuentro galáctico.',
        'Grow your galaxy: 10 million M☉ → satellite galaxy → 150 million M☉ → galactic encounter.',
      ),
      how: [
        tr(
          `Sigue atrayendo nubes. Si la <b>actividad del cuásar</b> se acerca al máximo, mantén ${k.right} para liberarla por los chorros; si no, el cuásar expulsará tu gas.`,
          `Keep drawing in clouds. If <b>quasar activity</b> nears its peak, hold ${k.right} to release it through the jets; otherwise the quasar will blow your gas away.`,
        ),
        tr('Con la <b>formación estelar</b> alta, tu galaxia te alimenta sola. No consumas todo el gas de golpe.', 'With high <b>star formation</b>, your galaxy feeds you on its own. Don\'t use up all the gas at once.'),
        tr(`Cuando llegue la <b>galaxia satélite</b> (etiqueta verde), ${touch ? 'tócala' : 'haz CLIC sobre ella'}.`, `When the <b>satellite galaxy</b> arrives (green label), ${touch ? 'tap it' : 'CLICK on it'}.`),
        tr(`Durante el <b>encuentro</b>, pulsa ${touch ? 'el botón' : 'ESPACIO'} cuando la aguja pase por la zona verde.`, `During the <b>encounter</b>, press ${touch ? 'the button' : 'SPACE'} when the needle crosses the green zone.`),
      ],
    },
  };
  return B[stage] ?? null;
}
