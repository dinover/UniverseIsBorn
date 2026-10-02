import { pick, type Bi } from '../i18n/i18n';

interface StageText {
  n: number;
  name: Bi;
  feel: Bi; // the emotional line shown when entering
  codex: string;
}

export interface StageDef {
  n: number;
  name: string;
  feel: string;
  codex: string;
}

export const STAGES: StageText[] = [
  { n: 1, name: { es: 'Materia primordial', en: 'Primordial matter' }, feel: { es: 'Soy apenas polvo, flotando en la oscuridad.', en: 'I am only dust, drifting in the dark.' }, codex: 'primordial' },
  { n: 2, name: { es: 'Nube molecular', en: 'Molecular cloud' }, feel: { es: 'Poco a poco, me convierto en una nube.', en: 'Little by little, I am becoming a cloud.' }, codex: 'jeans' },
  { n: 3, name: { es: 'Protoestrella', en: 'Protostar' }, feel: { es: 'Algo empieza a brillar dentro de mí.', en: 'Something is beginning to glow inside me.' }, codex: 'protostar' },
  { n: 4, name: { es: 'Estrella masiva', en: 'Massive star' }, feel: { es: 'Por fin soy una estrella, y mi luz llega lejos.', en: 'At last I am a star, and my light reaches far.' }, codex: 'fusion' },
  { n: 5, name: { es: 'Núcleo de hierro', en: 'Iron core' }, feel: { es: 'Mi fuego se apaga, pero mi historia no termina aquí.', en: "My fire is fading, but my story doesn't end here." }, codex: 'iron' },
  { n: 6, name: { es: 'Supernova', en: 'Supernova' }, feel: { es: 'Estallo en luz, y mis restos sembrarán nuevos mundos.', en: 'I burst into light, and what I leave behind will seed new worlds.' }, codex: 'supernova' },
  { n: 7, name: { es: 'Nacimiento del agujero negro', en: 'Birth of a black hole' }, feel: { es: 'Ahora soy una sombra tan profunda que ni la luz escapa.', en: 'Now I am a shadow so deep that not even light escapes.' }, codex: 'horizon' },
  { n: 8, name: { es: 'Acreción', en: 'Accretion' }, feel: { es: 'La materia empieza a girar a mi alrededor.', en: 'Matter begins to swirl around me.' }, codex: 'orbits' },
  { n: 9, name: { es: 'Disco de acreción', en: 'Accretion disk' }, feel: { es: 'Un anillo de luz me abraza.', en: 'A ring of light embraces me.' }, codex: 'disk' },
  { n: 10, name: { es: 'Agujero negro activo', en: 'Active black hole' }, feel: { es: 'Dos haces de luz brotan de mí y cruzan el espacio.', en: 'Two beams of light pour out of me and cross the cosmos.' }, codex: 'jets' },
  { n: 11, name: { es: 'Crecimiento', en: 'Growth' }, feel: { es: 'Todo lo que pasa cerca puede quedarse conmigo, si sé atraerlo.', en: 'Everything that passes near can stay with me, if I know how to draw it in.' }, codex: 'tde' },
  { n: 12, name: { es: 'Fusiones', en: 'Mergers' }, feel: { es: 'Hay otros como yo en la oscuridad.', en: 'There are others like me in the dark.' }, codex: 'gw' },
  { n: 13, name: { es: 'Agujero negro intermedio', en: 'Intermediate black hole' }, feel: { es: 'Mi mundo se hace más grande, y yo con él.', en: 'My world grows larger, and I grow with it.' }, codex: 'imbh' },
  { n: 14, name: { es: 'Supermasivo', en: 'Supermassive' }, feel: { es: 'Esas luces a lo lejos… ¿son una galaxia?', en: 'Those lights in the distance… are they a galaxy?' }, codex: 'smbh' },
  { n: 15, name: { es: 'Galaxia', en: 'Galaxy' }, feel: { es: 'Ahora soy el corazón de una galaxia.', en: 'Now I am the heart of a galaxy.' }, codex: 'galaxy' },
];

export const stageDef = (n: number): StageDef => {
  const s = STAGES[Math.max(0, Math.min(STAGES.length - 1, n - 1))];
  return { n: s.n, name: pick(s.name), feel: pick(s.feel), codex: s.codex };
};
