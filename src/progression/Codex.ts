import { getLang } from '../i18n/i18n';

/** Optional science notes. Simplifications made by the game are called out honestly. */
export interface CodexEntry {
  id: string;
  title: string;
  question: string;
  body: string;
  game?: string; // how the game simplifies it
}

type CodexText = Omit<CodexEntry, 'id'>;

const ENTRIES: { id: string; es: CodexText; en: CodexText }[] = [
  {
    id: 'primordial',
    es: {
      title: 'Materia primordial',
      question: '¿De qué estaba hecho el universo joven?',
      body: 'Unos cientos de millones de años después del Big Bang, el universo era un gas casi uniforme: alrededor de un 75% de hidrógeno y un 25% de helio en masa, con apenas una pizca de litio. Todavía no había estrellas; es la llamada «edad oscura» del cosmos. Pero el gas no era perfectamente liso: pequeñas diferencias de densidad, amplificadas con paciencia por la gravedad, fueron las semillas de todo lo que vendría después, incluidos nosotros.',
      game: 'Cada partícula representa una cantidad enorme de gas. El polvo (elementos pesados) en realidad aún no existía: aparece aquí para darle variedad al paisaje.',
    },
    en: {
      title: 'Primordial matter',
      question: 'What was the young universe made of?',
      body: "A few hundred million years after the Big Bang, the universe was an almost uniform gas: about 75% hydrogen and 25% helium by mass, with just a pinch of lithium. There were no stars yet; this is the cosmic “dark ages”. But the gas wasn't perfectly smooth: tiny differences in density, patiently amplified by gravity, became the seeds of everything that came after, including us.",
      game: "Each particle stands for an enormous amount of gas. Dust (heavy elements) didn't actually exist yet: it appears here to give the landscape some variety.",
    },
  },
  {
    id: 'darkmatter',
    es: {
      title: 'Pozos de materia oscura',
      question: '¿Qué son esas distorsiones invisibles?',
      body: 'Cerca del 85% de la materia del universo es materia oscura: no emite luz, pero sí tiene gravedad. Sus enormes halos formaron «pozos» donde el gas normal se fue reuniendo primero. Sin ellos, las galaxias habrían tardado muchísimo más en nacer.',
      game: 'Dentro de un pozo tu atracción se duplica. Encontrarlos es la clave de esta primera etapa.',
    },
    en: {
      title: 'Dark matter wells',
      question: 'What are those invisible ripples?',
      body: 'About 85% of the matter in the universe is dark matter: it gives off no light, but it does have gravity. Its vast halos formed “wells” where ordinary gas gathered first. Without them, galaxies would have taken far longer to be born.',
      game: 'Inside a well your pull doubles. Finding them is the key to this first stage.',
    },
  },
  {
    id: 'jeans',
    es: {
      title: 'Inestabilidad de Jeans',
      question: '¿Por qué colapsa una nube?',
      body: 'Una nube de gas vive en equilibrio entre dos fuerzas: su propia gravedad, que la junta, y la presión del calor, que la expande. Si su masa supera la «masa de Jeans» (que crece con la temperatura y disminuye con la densidad), la gravedad gana y la nube empieza a colapsar. Por eso las estrellas nacen en nubes frías y densas: las moléculas y el polvo irradian calor y ayudan a que el gas se enfríe.',
      game: 'Comprimir aumenta la densidad y la temperatura a la vez. El secreto está en alternar: comprimir con calma y dejar enfriar.',
    },
    en: {
      title: 'Jeans instability',
      question: 'Why does a cloud collapse?',
      body: "A gas cloud lives in balance between two forces: its own gravity, pulling it together, and the pressure of its heat, pushing it apart. If its mass exceeds the “Jeans mass” (which rises with temperature and falls with density), gravity wins and the cloud begins to collapse. That's why stars are born in cold, dense clouds: molecules and dust radiate heat away and help the gas cool down.",
      game: 'Compressing raises density and temperature at the same time. The secret is to alternate: compress gently, then let it cool.',
    },
  },
  {
    id: 'protostar',
    es: {
      title: 'Protoestrella',
      question: '¿Cómo se enciende una estrella?',
      body: 'Al contraerse, la nube transforma su energía gravitatoria en calor (es el mecanismo de Kelvin-Helmholtz). La protoestrella ya brilla, aunque todavía sin fusión, rodeada de un disco y lanzando chorros por sus polos que la ayudan a liberar momento angular. Cuando el núcleo alcanza unos 10 millones de grados empieza a fusionar hidrógeno: ha nacido una estrella. Si su masa no llega a unas 0,08 masas solares, ese momento nunca llega y queda como enana marrón.',
      game: 'El equilibrio entre presión y gravedad se simplifica en un único indicador.',
    },
    en: {
      title: 'Protostar',
      question: 'How does a star switch on?',
      body: 'As the cloud contracts, it turns gravitational energy into heat (the Kelvin-Helmholtz mechanism). The protostar already glows, though without fusion yet, wrapped in a disk and launching jets from its poles that help it shed angular momentum. When the core reaches about 10 million degrees, hydrogen fusion begins: a star is born. If its mass is below about 0.08 solar masses, that moment never comes, and it remains a brown dwarf.',
      game: 'The balance between pressure and gravity is simplified into a single gauge.',
    },
  },
  {
    id: 'fusion',
    es: {
      title: 'Fusión nuclear',
      question: '¿De dónde sale la energía de una estrella?',
      body: 'En el núcleo, los núcleos de hidrógeno se unen para formar helio. El helio resultante pesa un 0,7% menos que lo que lo formó, y esa pequeña diferencia se libera como energía (E = mc²). La presión de esa energía sostiene a la estrella contra su propia gravedad durante millones de años. La luz del Sol que te calienta hoy nació exactamente así.',
    },
    en: {
      title: 'Nuclear fusion',
      question: "Where does a star's energy come from?",
      body: 'In the core, hydrogen nuclei join together to form helium. The resulting helium weighs 0.7% less than what made it, and that tiny difference is released as energy (E = mc²). The pressure of that energy holds the star up against its own gravity for millions of years. The sunlight that warms you today was born in exactly this way.',
    },
  },
  {
    id: 'onion',
    es: {
      title: 'Estructura en capas de cebolla',
      question: '¿Por qué la estrella cambia tanto?',
      body: 'Cuando se agota el hidrógeno del núcleo, este se contrae, se calienta y empieza a fusionar helio en carbono; después vienen el neón, el oxígeno y el silicio. Cada etapa dura menos que la anterior: el hidrógeno alcanza para millones de años; el silicio, apenas para un día. La estrella queda formada por capas de elementos, como una cebolla, y se hincha hasta convertirse en una supergigante roja.',
      game: 'En la realidad el neón se fusiona antes que el oxígeno; el juego usa la cadena H → He → C → O → Ne → Si por sencillez y condensa en minutos escalas de tiempo enormes.',
    },
    en: {
      title: 'Onion-layer structure',
      question: 'Why does the star change so much?',
      body: 'When the hydrogen in the core runs out, the core contracts, heats up and starts fusing helium into carbon; then come neon, oxygen and silicon. Each stage is shorter than the last: hydrogen lasts for millions of years; silicon, barely a day. The star ends up built from layers of elements, like an onion, and swells into a red supergiant.',
      game: 'In reality neon fuses before oxygen; the game uses the chain H → He → C → O → Ne → Si for simplicity, and squeezes enormous timescales into minutes.',
    },
  },
  {
    id: 'iron',
    es: {
      title: '¿Por qué el hierro?',
      question: '¿Por qué colapsó esta estrella?',
      body: 'El hierro-56 es uno de los núcleos más estables que existen: fusionarlo no libera energía, sino que la consume. Así, el núcleo de hierro crece sin poder encenderse, sostenido solo por la presión de degeneración de los electrones. Cuando supera unas 1,4 masas solares (el límite de Chandrasekhar), esa presión ya no alcanza y el núcleo colapsa en menos de un segundo.',
    },
    en: {
      title: 'Why iron?',
      question: 'Why did this star collapse?',
      body: "Iron-56 is one of the most stable nuclei there is: fusing it doesn't release energy, it consumes it. So the iron core keeps growing without being able to burn, held up only by electron degeneracy pressure. Once it passes about 1.4 solar masses (the Chandrasekhar limit), that pressure is no longer enough, and the core collapses in less than a second.",
    },
  },
  {
    id: 'supernova',
    es: {
      title: 'Supernova de colapso de núcleo',
      question: '¿Qué acaba de pasar?',
      body: 'El núcleo cae hacia dentro a casi un cuarto de la velocidad de la luz, hasta que la materia nuclear rebota. Los neutrinos se llevan el 99% de la energía, y una onda de choque expulsa las capas externas de la estrella. Durante semanas, la supernova puede brillar más que toda su galaxia. Los elementos que esparce formarán nuevos planetas… y personas: el calcio de tus huesos y el hierro de tu sangre nacieron en estrellas como esta. Somos polvo de estrellas.',
    },
    en: {
      title: 'Core-collapse supernova',
      question: 'What just happened?',
      body: "The core falls inward at nearly a quarter of the speed of light, until nuclear matter bounces back. Neutrinos carry away 99% of the energy, and a shock wave blows off the star's outer layers. For weeks, a supernova can outshine its entire galaxy. The elements it scatters will become new planets… and people: the calcium in your bones and the iron in your blood were forged in stars like this one. We are made of stardust.",
    },
  },
  {
    id: 'neutronstar',
    es: {
      title: 'Estrella de neutrones',
      question: '¿Qué es este objeto?',
      body: 'Más de una masa solar comprimida en una esfera de unos 20 km, el tamaño de una ciudad. Una cucharadita de su materia pesaría miles de millones de toneladas. Muchas giran cientos de veces por segundo y emiten haces de luz como faros: son los púlsares. Si acumulan más de unas 2 o 2,5 masas solares (el límite de Tolman-Oppenheimer-Volkoff), colapsan en un agujero negro.',
    },
    en: {
      title: 'Neutron star',
      question: 'What is this object?',
      body: 'More than a solar mass squeezed into a sphere about 20 km across, the size of a city. A teaspoon of its matter would weigh billions of tonnes. Many spin hundreds of times per second and sweep beams of light like lighthouses: these are pulsars. If they gather more than about 2 to 2.5 solar masses (the Tolman-Oppenheimer-Volkoff limit), they collapse into a black hole.',
    },
  },
  {
    id: 'horizon',
    es: {
      title: 'Horizonte de sucesos',
      question: '¿Qué es el horizonte de sucesos?',
      body: 'Es la frontera de la que ni siquiera la luz puede volver. No es una superficie sólida: es una región del espacio-tiempo. Su radio (el radio de Schwarzschild) es 2GM/c², unos 3 km por cada masa solar. La sombra negra que ves es algo más grande que el horizonte, porque la luz se curva a su alrededor.',
    },
    en: {
      title: 'Event horizon',
      question: 'What is the event horizon?',
      body: "It's the boundary from which not even light can return. It isn't a solid surface: it's a region of spacetime. Its radius (the Schwarzschild radius) is 2GM/c², about 3 km for every solar mass. The black shadow you see is somewhat larger than the horizon, because light bends around it.",
    },
  },
  {
    id: 'lensing',
    es: {
      title: 'Lente gravitacional',
      question: '¿Por qué se ve el disco por arriba y por abajo?',
      body: 'La masa curva el espacio-tiempo, y la luz sigue esa curva. Por eso la parte del disco que queda detrás del agujero negro se ve doblada por encima y por debajo de la sombra. A 1,5 radios de Schwarzschild la luz puede incluso orbitar (es la esfera de fotones) y dibuja un anillo fino y brillante. Las estrellas del fondo se deforman en arcos y anillos de Einstein.',
      game: 'El juego calcula en tiempo real el recorrido de la luz para cada píxel cercano al agujero negro.',
    },
    en: {
      title: 'Gravitational lensing',
      question: 'Why can I see the disk above and below?',
      body: "Mass curves spacetime, and light follows that curve. That's why the part of the disk behind the black hole appears bent above and below the shadow. At 1.5 Schwarzschild radii light can even orbit (the photon sphere), drawing a thin, bright ring. Background stars stretch into arcs and Einstein rings.",
      game: 'The game traces the real path of light, in real time, for every pixel near the black hole.',
    },
  },
  {
    id: 'orbits',
    es: {
      title: 'Órbitas y momento angular',
      question: '¿Por qué no todo cae dentro?',
      body: 'Un objeto que se acerca con velocidad lateral tiene momento angular: en lugar de caer, orbita, o pasa de largo como lanzado por una honda. Para caer necesita perder ese momento angular, por fricción con el gas o por encuentros con otros objetos. Además, según la relatividad, no hay órbitas estables por debajo de 3 radios de Schwarzschild (la ISCO): lo que cruza ese límite cae en espiral.',
      game: 'Al mantener pulsado generas «arrastre», que le quita momento angular a lo que te rodea. Fíjate en la trayectoria prevista: dorada = captura, cian = órbita, roja = escapa.',
    },
    en: {
      title: 'Orbits and angular momentum',
      question: "Why doesn't everything fall in?",
      body: 'An object approaching with sideways speed has angular momentum: instead of falling in, it orbits, or swings past as if flung from a slingshot. To fall in, it has to lose that angular momentum, through friction with gas or encounters with other objects. And according to relativity, there are no stable orbits closer than 3 Schwarzschild radii (the ISCO): anything that crosses that line spirals in.',
      game: 'Holding down creates “drag”, which takes angular momentum away from whatever is around you. Watch the predicted path: gold = capture, cyan = orbit, red = escape.',
    },
  },
  {
    id: 'disk',
    es: {
      title: 'Disco de acreción',
      question: '¿Por qué brilla tanto si es un agujero negro?',
      body: 'La materia que cae forma un disco que gira más rápido cuanto más cerca está del centro. La fricción la calienta a millones de grados y la hace brillar en rayos X. La acreción convierte entre un 6% y un 40% de la masa en energía, muchísimo más que la fusión (0,7%). El lado del disco que se acerca a nosotros se ve más brillante por el efecto Doppler relativista.',
    },
    en: {
      title: 'Accretion disk',
      question: 'Why does a black hole shine so brightly?',
      body: 'Falling matter forms a disk that spins faster the closer it gets to the center. Friction heats it to millions of degrees and makes it glow in X-rays. Accretion turns between 6% and 40% of mass into energy, far more than fusion (0.7%). The side of the disk moving toward us looks brighter because of the relativistic Doppler effect.',
    },
  },
  {
    id: 'jets',
    es: {
      title: 'Chorros relativistas',
      question: '¿De dónde salen los chorros?',
      body: 'Los campos magnéticos del disco, retorcidos por la rotación del agujero negro, lanzan plasma a velocidades cercanas a la de la luz a lo largo de su eje de giro (es el mecanismo de Blandford-Znajek). Estos chorros, también llamados jets, pueden extenderse miles de años luz y calentar o comprimir el gas que encuentran a su paso.',
      game: 'Los chorros usan la energía del disco. Si alcanzan una nube de gas, pueden hacer nacer estrellas nuevas: más alimento para ti.',
    },
    en: {
      title: 'Relativistic jets',
      question: 'Where do the jets come from?',
      body: "The disk's magnetic fields, twisted by the black hole's spin, launch plasma at nearly the speed of light along its axis of rotation (the Blandford-Znajek mechanism). These jets can stretch for thousands of light-years and heat or compress the gas they meet along the way.",
      game: "Jets draw on the disk's energy. If they reach a gas cloud, they can spark new stars: more food for you.",
    },
  },
  {
    id: 'tde',
    es: {
      title: 'Disrupción de marea',
      question: '¿Qué le pasó a esa estrella?',
      body: 'Si una estrella se acerca demasiado, la gravedad tira con más fuerza de su lado cercano que del lejano y la estira hasta deshacerla (la llamada «espaguetificación»). Más o menos la mitad del material queda atrapado y cae produciendo un destello brillante; la otra mitad sale despedida al espacio.',
    },
    en: {
      title: 'Tidal disruption',
      question: 'What happened to that star?',
      body: 'If a star comes too close, gravity pulls harder on its near side than on its far side, stretching it until it comes apart (so-called “spaghettification”). Roughly half of the material stays bound and falls in, producing a bright flare; the other half is flung out into space.',
    },
  },
  {
    id: 'gw',
    es: {
      title: 'Ondas gravitacionales',
      question: '¿Qué son esas ondas?',
      body: 'Dos agujeros negros que orbitan juntos pierden energía emitiendo ondulaciones del propio espacio-tiempo. Su órbita se acelera hasta que se funden en uno solo. En 2015, LIGO detectó por primera vez una de estas señales, GW150914: dos agujeros de 36 y 29 masas solares se unieron en uno de 62; las 3 masas solares restantes viajaron por el universo convertidas en ondas gravitacionales.',
      game: 'Al fusionarte pierdes cerca del 5% de la masa combinada, igual que en la realidad.',
    },
    en: {
      title: 'Gravitational waves',
      question: 'What are those ripples?',
      body: 'Two black holes orbiting each other lose energy by sending out ripples in spacetime itself. Their orbit speeds up until they merge into one. In 2015, LIGO detected one of these signals for the first time, GW150914: black holes of 36 and 29 solar masses became one of 62; the remaining 3 solar masses traveled across the universe as gravitational waves.',
      game: 'When you merge, you lose about 5% of the combined mass, just like in reality.',
    },
  },
  {
    id: 'imbh',
    es: {
      title: 'Agujeros negros intermedios',
      question: '¿Existen agujeros negros de miles de masas solares?',
      body: 'Entre los agujeros negros estelares (decenas de masas solares) y los supermasivos (millones) están los intermedios. Son difíciles de detectar; podrían formarse en cúmulos densos, a fuerza de fusiones sucesivas. La señal GW190521 dejó como resultado uno de unas 142 masas solares.',
    },
    en: {
      title: 'Intermediate-mass black holes',
      question: 'Are there black holes of thousands of solar masses?',
      body: 'Between stellar black holes (tens of solar masses) and supermassive ones (millions) lie the intermediate-mass black holes. They are hard to detect; they may form in dense clusters through one merger after another. The GW190521 signal left behind one of about 142 solar masses.',
    },
  },
  {
    id: 'smbh',
    es: {
      title: 'Agujeros negros supermasivos',
      question: '¿Qué hay en el centro de las galaxias?',
      body: 'Casi todas las galaxias grandes tienen uno en su corazón. Sagitario A*, en el centro de nuestra Vía Láctea, tiene unos 4 millones de masas solares. M87* tiene unos 6.500 millones: en 2019 se convirtió en el primero en ser fotografiado, gracias al Event Horizon Telescope.',
    },
    en: {
      title: 'Supermassive black holes',
      question: 'What lies at the center of galaxies?',
      body: 'Almost every large galaxy has one at its heart. Sagittarius A*, at the center of our Milky Way, has about 4 million solar masses. M87* has about 6.5 billion: in 2019 it became the first one ever photographed, by the Event Horizon Telescope.',
    },
  },
  {
    id: 'galaxy',
    es: {
      title: 'Brazos espirales',
      question: '¿Por qué los brazos no se enrollan?',
      body: 'Los brazos espirales son ondas de densidad: las estrellas entran y salen de ellos como los vehículos en un embotellamiento. Al cruzarlos, el gas se comprime y forma estrellas nuevas; por eso los brazos brillan en tonos azules y rosados. Una galaxia como la nuestra tiene entre 100.000 y 400.000 millones de estrellas.',
    },
    en: {
      title: 'Spiral arms',
      question: "Why don't the arms wind up?",
      body: 'Spiral arms are density waves: stars drift in and out of them like cars through a traffic jam. As gas crosses them it gets compressed and forms new stars, which is why the arms glow in blues and pinks. A galaxy like ours holds between 100 and 400 billion stars.',
    },
  },
  {
    id: 'feedback',
    es: {
      title: 'Retroalimentación del cuásar',
      question: '¿Por qué importa cuánto me alimento?',
      body: 'Un agujero negro muy activo (un cuásar) libera tanta energía que puede calentar o expulsar el gas de su galaxia y frenar el nacimiento de estrellas. Por eso el agujero negro y su galaxia crecen de la mano: si uno se apresura, el otro lo siente.',
    },
    en: {
      title: 'Quasar feedback',
      question: 'Why does it matter how much I feed?',
      body: "A very active black hole (a quasar) releases so much energy that it can heat or blow away its galaxy's gas and slow down the birth of new stars. That's why a black hole and its galaxy grow hand in hand: if one rushes, the other feels it.",
    },
  },
  {
    id: 'merger',
    es: {
      title: 'Fusión de galaxias',
      question: '¿Qué pasa cuando chocan dos galaxias?',
      body: 'Las estrellas casi nunca chocan entre sí: entre ellas hay muchísimo espacio vacío. Pero las fuerzas de marea arrancan largas colas de estrellas, y el gas comprimido desata una ola de nacimientos estelares. Los agujeros negros centrales se hunden hacia el centro y terminan fusionándose. La Vía Láctea y Andrómeda podrían unirse dentro de unos 4.500 millones de años.',
    },
    en: {
      title: 'Galaxy mergers',
      question: 'What happens when two galaxies collide?',
      body: "Stars almost never collide: there's an enormous amount of empty space between them. But tidal forces pull out long tails of stars, and compressed gas sets off a wave of star births. The central black holes sink toward the middle and eventually merge. The Milky Way and Andromeda may come together in about 4.5 billion years.",
    },
  },
  {
    id: 'cosmicweb',
    es: {
      title: 'La red cósmica',
      question: '¿Dónde está mi galaxia?',
      body: 'A gran escala, las galaxias se ordenan en filamentos y paredes alrededor de enormes vacíos, siguiendo el andamiaje invisible de la materia oscura. El universo observable contiene alrededor de un billón de galaxias (un millón de millones), y cada una guarda su propia historia.',
    },
    en: {
      title: 'The cosmic web',
      question: 'Where is my galaxy?',
      body: 'On the largest scales, galaxies line up in filaments and walls around enormous voids, following the invisible scaffolding of dark matter. The observable universe holds around a trillion galaxies, and each one keeps its own story.',
    },
  },
];

const resolve = (e: (typeof ENTRIES)[number]): CodexEntry => ({ id: e.id, ...e[getLang()] });

/** Every codex entry, in the current language. */
export const codexList = () => ENTRIES.map(resolve);

export const codexById = (id: string) => {
  const e = ENTRIES.find((x) => x.id === id);
  return e ? resolve(e) : undefined;
};
