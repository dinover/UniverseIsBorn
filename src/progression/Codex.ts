/** Optional science notes. Simplifications made by the game are called out honestly. */
export interface CodexEntry {
  id: string;
  title: string;
  question: string;
  body: string;
  game?: string; // how the game simplifies it
}

export const CODEX: CodexEntry[] = [
  {
    id: 'primordial',
    title: 'Materia primordial',
    question: '¿De qué estaba hecho el universo temprano?',
    body: 'Unos cientos de millones de años después del Big Bang el universo era un gas casi uniforme: ~75% hidrógeno y ~25% helio en masa, con trazas de litio. No había estrellas: es la "edad oscura" cósmica. Pequeñas fluctuaciones de densidad, amplificadas por la gravedad, fueron las semillas de todo lo que vino después.',
    game: 'Las partículas representan enormes cantidades de gas. El polvo (elementos pesados) en realidad no existía todavía: aparece aquí para dar variedad.',
  },
  {
    id: 'darkmatter',
    title: 'Pozos de materia oscura',
    question: '¿Qué son esas distorsiones invisibles?',
    body: 'Cerca del 85% de la materia del universo es materia oscura: no emite luz, pero sí gravita. Sus halos formaron "pozos" donde el gas normal se acumuló primero. Sin ellos, las galaxias habrían tardado muchísimo más en formarse.',
    game: 'Dentro de un pozo tu atracción se duplica. Posicionarte bien es la clave de la primera etapa.',
  },
  {
    id: 'jeans',
    title: 'Inestabilidad de Jeans',
    question: '¿Por qué colapsa una nube?',
    body: 'Una nube de gas está en equilibrio entre su propia gravedad, que la comprime, y la presión térmica, que la expande. Si su masa supera la "masa de Jeans" —que aumenta con la temperatura y disminuye con la densidad— la gravedad gana y la nube colapsa. Por eso las nubes frías y densas forman estrellas: las moléculas y el polvo irradian calor y permiten que se enfríen.',
    game: 'Comprimir aumenta densidad y temperatura a la vez. Hay que comprimir y dejar enfriar.',
  },
  {
    id: 'protostar',
    title: 'Protoestrella',
    question: '¿Qué está pasando?',
    body: 'Al contraerse, la nube convierte energía gravitatoria en calor (mecanismo de Kelvin-Helmholtz). La protoestrella brilla sin fusión todavía, rodeada de un disco y expulsando chorros bipolares que liberan momento angular. Cuando el núcleo alcanza ~10 millones de kelvin comienza la fusión del hidrógeno. Si la masa es menor a ~0,08 masas solares nunca llega: queda como enana marrón.',
    game: 'El equilibrio entre presión y gravedad está simplificado en un único indicador.',
  },
  {
    id: 'fusion',
    title: 'Fusión nuclear',
    question: '¿De dónde sale la energía de una estrella?',
    body: 'En el núcleo, núcleos de hidrógeno se fusionan en helio. La masa del helio resultante es ~0,7% menor: esa diferencia se libera como energía (E = mc²). La presión de esa energía sostiene a la estrella contra su propia gravedad durante millones de años.',
  },
  {
    id: 'onion',
    title: 'Estructura en capas de cebolla',
    question: '¿Por qué la estrella cambia tanto?',
    body: 'Cuando se agota el hidrógeno del núcleo, este se contrae, se calienta y empieza a fusionar helio en carbono; luego carbono, neón, oxígeno y silicio. Cada etapa es más corta: el hidrógeno dura millones de años; el silicio, apenas un día. La estrella queda formada por capas concéntricas de elementos y se hincha como supergigante roja.',
    game: 'El orden real incluye neón antes que oxígeno en algunas fases; la cadena del juego sigue el orden pedido por la narrativa y comprime escalas de tiempo enormes.',
  },
  {
    id: 'iron',
    title: '¿Por qué el hierro?',
    question: '¿Por qué esta estrella colapsó?',
    body: 'El hierro-56 está cerca del máximo de energía de enlace por nucleón: fusionarlo no libera energía, la consume. El núcleo de hierro inerte crece y solo lo sostiene la presión de degeneración de los electrones. Al superar ~1,4 masas solares (límite de Chandrasekhar) esa presión cede y el núcleo colapsa en menos de un segundo.',
  },
  {
    id: 'supernova',
    title: 'Supernova de colapso de núcleo',
    question: '¿Qué acaba de pasar?',
    body: 'El núcleo cae a casi un cuarto de la velocidad de la luz hasta que la materia nuclear rebota. Los neutrinos se llevan el 99% de la energía y una onda de choque expulsa las capas externas. Durante semanas la supernova puede brillar más que toda su galaxia. Los elementos pesados que dispersa forman planetas… y personas: somos polvo de estrellas.',
  },
  {
    id: 'neutronstar',
    title: 'Estrella de neutrones',
    question: '¿Qué es este objeto?',
    body: 'Más de una masa solar comprimida en una esfera de ~20 km. Una cucharadita pesaría miles de millones de toneladas. Muchas giran cientos de veces por segundo y emiten haces como faros: son los púlsares. Si acumulan más de ~2-2,5 masas solares (límite de Tolman-Oppenheimer-Volkoff) colapsan en un agujero negro.',
  },
  {
    id: 'horizon',
    title: 'Horizonte de sucesos',
    question: '¿Qué es el horizonte de sucesos?',
    body: 'Es la frontera a partir de la cual ni la luz puede escapar. No es una superficie física: es una región del espacio-tiempo. Su radio (radio de Schwarzschild) es 2GM/c²: unos 3 km por cada masa solar. La sombra negra que ves es algo más grande que el horizonte por la curvatura de la luz.',
  },
  {
    id: 'lensing',
    title: 'Lente gravitacional',
    question: '¿Por qué se ve el disco por arriba y por abajo?',
    body: 'La masa curva el espacio-tiempo y la luz sigue esa curvatura. La parte del disco que está detrás del agujero negro se ve doblada por encima y por debajo de la sombra. A 1,5 radios de Schwarzschild la luz puede orbitar (esfera de fotones), formando un anillo fino y brillante. Las estrellas del fondo se deforman en arcos y anillos de Einstein.',
    game: 'El juego integra la trayectoria real de cada rayo de luz en tiempo real para cada píxel cercano al agujero negro.',
  },
  {
    id: 'orbits',
    title: 'Órbitas y momento angular',
    question: '¿Por qué no todo cae dentro?',
    body: 'Un objeto que se acerca con velocidad lateral tiene momento angular: en vez de caer, orbita o pasa de largo como una honda. Para caer necesita perder ese momento angular, por fricción con gas o interacciones. Además, en relatividad no hay órbitas estables por debajo de 3 radios de Schwarzschild (la ISCO): lo que cruza ese límite cae en espiral.',
    game: 'Mantener pulsado genera "arrastre" que roba momento angular a lo que te rodea. Mira la trayectoria prevista: dorada = captura, cian = órbita, roja = escapa.',
  },
  {
    id: 'disk',
    title: 'Disco de acreción',
    question: '¿Por qué brilla tanto si es un agujero negro?',
    body: 'La materia que cae forma un disco que gira más rápido cuanto más cerca está. La fricción la calienta a millones de grados y emite rayos X. La acreción convierte entre 6% y 40% de la masa en energía, muchísimo más que la fusión (0,7%). El lado que se acerca a nosotros se ve más brillante por el efecto Doppler relativista.',
  },
  {
    id: 'jets',
    title: 'Jets relativistas',
    question: '¿De dónde salen los jets?',
    body: 'Los campos magnéticos del disco, retorcidos por la rotación del agujero negro, lanzan plasma a velocidades cercanas a la de la luz a lo largo del eje de giro (mecanismo de Blandford-Znajek). Los jets pueden extenderse miles de años luz y calentar o comprimir el gas que encuentran.',
    game: 'Los jets gastan energía del disco. Al impactar nubes de gas pueden disparar formación estelar: nuevo alimento.',
  },
  {
    id: 'tde',
    title: 'Disrupción de marea',
    question: '¿Qué le pasó a esa estrella?',
    body: 'Si una estrella se acerca demasiado, la diferencia de gravedad entre su lado cercano y el lejano la estira hasta destrozarla ("espaguetificación"). Aproximadamente la mitad del material queda ligado y cae formando un destello brillante; la otra mitad sale despedida.',
  },
  {
    id: 'gw',
    title: 'Ondas gravitacionales',
    question: '¿Qué son esas ondas?',
    body: 'Dos agujeros negros en órbita pierden energía emitiendo ondulaciones del espacio-tiempo. La órbita se acelera hasta la fusión. En 2015 LIGO detectó GW150914: agujeros de 36 y 29 masas solares se fusionaron en uno de 62; las 3 masas solares restantes se convirtieron en ondas gravitacionales.',
    game: 'Al fusionarte pierdes ~5% de la masa combinada, como en la realidad.',
  },
  {
    id: 'imbh',
    title: 'Agujeros negros intermedios',
    question: '¿Existen agujeros negros de miles de masas solares?',
    body: 'Entre los estelares (decenas de masas solares) y los supermasivos (millones) están los intermedios. Son difíciles de detectar; podrían formarse en cúmulos densos por fusiones sucesivas. GW190521 produjo uno de ~142 masas solares.',
  },
  {
    id: 'smbh',
    title: 'Agujeros negros supermasivos',
    question: '¿Qué hay en el centro de las galaxias?',
    body: 'Casi todas las galaxias grandes tienen uno. Sagitario A*, en el centro de la Vía Láctea, tiene ~4 millones de masas solares. M87* tiene ~6.500 millones: fue el primero fotografiado, en 2019, por el Event Horizon Telescope.',
  },
  {
    id: 'galaxy',
    title: 'Brazos espirales',
    question: '¿Por qué los brazos no se enrollan?',
    body: 'Los brazos espirales son ondas de densidad: las estrellas entran y salen de ellos como autos en un embotellamiento. El gas se comprime al cruzarlos y forma estrellas nuevas, por eso los brazos brillan en azul y rosa. Una galaxia como la nuestra tiene entre 100.000 y 400.000 millones de estrellas.',
  },
  {
    id: 'feedback',
    title: 'Retroalimentación AGN',
    question: '¿Por qué importa cuánto como?',
    body: 'Un agujero negro muy activo (cuásar) libera tanta energía que puede calentar o expulsar el gas de su galaxia y frenar la formación de estrellas. El crecimiento del agujero negro y el de su galaxia están acoplados.',
  },
  {
    id: 'merger',
    title: 'Fusión de galaxias',
    question: '¿Qué pasa cuando chocan galaxias?',
    body: 'Las estrellas casi nunca chocan entre sí: hay demasiado espacio vacío. Pero las fuerzas de marea arrancan colas de estrellas y el gas comprimido forma estrellas en masa. Los agujeros negros centrales se hunden hacia el centro y terminan fusionándose. La Vía Láctea y Andrómeda podrían fusionarse dentro de unos 4.500 millones de años.',
  },
  {
    id: 'cosmicweb',
    title: 'La red cósmica',
    question: '¿Dónde está mi galaxia?',
    body: 'A gran escala, las galaxias se ordenan en filamentos y muros alrededor de enormes vacíos, siguiendo el andamiaje de la materia oscura. El universo observable contiene del orden de un billón de galaxias.',
  },
];

export const codexById = (id: string) => CODEX.find((c) => c.id === id);
