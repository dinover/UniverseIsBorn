import { pick, type Bi } from '../i18n/i18n';

export interface AchievementDef {
  id: string;
  title: string;
  desc: string;
  icon: string;
}

interface AchievementText {
  id: string;
  title: Bi;
  desc: Bi;
  icon: string;
}

const LIST: AchievementText[] = [
  { id: 'first_light', icon: '✦', title: { es: 'Primera luz', en: 'First light' }, desc: { es: 'Enciende tu primera estrella.', en: 'Light up your first star.' } },
  { id: 'perfect_balance', icon: '⚖', title: { es: 'Equilibrio perfecto', en: 'Perfect balance' }, desc: { es: 'Enciende la estrella sin expansiones ni colapsos.', en: 'Ignite your star without a single expansion or collapse.' } },
  { id: 'rhythm', icon: '♫', title: { es: 'Ritmo estelar', en: 'Stellar rhythm' }, desc: { es: 'Encadena 10 fusiones perfectas.', en: 'Chain 10 perfect fusions.' } },
  { id: 'iron_will', icon: '⬢', title: { es: 'Corazón de hierro', en: 'Heart of iron' }, desc: { es: 'Resiste el colapso fallando como mucho una onda.', en: 'Hold back the collapse, missing at most one wave.' } },
  { id: 'direct_collapse', icon: '●', title: { es: 'De la luz a la sombra', en: 'From light to shadow' }, desc: { es: 'Forma un agujero negro directamente desde la supernova.', en: 'Form a black hole straight from the supernova.' } },
  { id: 'neutron_detour', icon: '◎', title: { es: 'Un desvío de neutrones', en: 'A neutron detour' }, desc: { es: 'Empieza como estrella de neutrones y llega, de todos modos, a ser un agujero negro.', en: 'Begin as a neutron star and still become a black hole.' } },
  { id: 'spaghetti', icon: '〰', title: { es: 'Espaguetificación', en: 'Spaghettification' }, desc: { es: 'Estira tu primera estrella con las fuerzas de marea.', en: 'Stretch your first star apart with tidal forces.' } },
  { id: 'glutton', icon: '★', title: { es: 'Gran apetito', en: 'Big appetite' }, desc: { es: 'Absorbe 25 estrellas.', en: 'Absorb 25 stars.' } },
  { id: 'orbital', icon: '◌', title: { es: 'Mecánica orbital', en: 'Orbital mechanics' }, desc: { es: 'Captura 40 cuerpos.', en: 'Capture 40 bodies.' } },
  { id: 'first_merge', icon: '∞', title: { es: 'Dos en uno', en: 'Two become one' }, desc: { es: 'Fusiónate con otro agujero negro.', en: 'Merge with another black hole.' } },
  { id: 'aligned', icon: '⇅', title: { es: 'Espines alineados', en: 'Aligned spins' }, desc: { es: 'Completa una fusión perfecta.', en: 'Complete a perfect merger.' } },
  { id: 'seeder', icon: '❋', title: { es: 'Sembrador de estrellas', en: 'Star sower' }, desc: { es: 'Haz nacer estrellas con tus chorros.', en: 'Spark new stars with your jets.' } },
  { id: 'pushback', icon: '⇶', title: { es: 'Retroceso', en: 'Pushback' }, desc: { es: 'Aleja con tus chorros a un agujero negro más grande.', en: 'Push a larger black hole away with your jets.' } },
  { id: 'million', icon: '⬤', title: { es: 'Supermasivo', en: 'Supermassive' }, desc: { es: 'Alcanza un millón de masas solares.', en: 'Reach a million solar masses.' } },
  { id: 'billion', icon: '✺', title: { es: 'Coloso cósmico', en: 'Cosmic colossus' }, desc: { es: 'Alcanza mil millones de masas solares.', en: 'Reach a billion solar masses.' } },
  { id: 'galaxy_merge', icon: '✴', title: { es: 'Dos galaxias, un corazón', en: 'Two galaxies, one heart' }, desc: { es: 'Completa la fusión galáctica.', en: 'Complete the galactic merger.' } },
  { id: 'scholar', icon: '❖', title: { es: 'Mente curiosa', en: 'Curious mind' }, desc: { es: 'Lee 8 entradas del códice.', en: 'Read 8 codex entries.' } },
  { id: 'sb_first', icon: '✧', title: { es: 'Primera semilla', en: 'First seed' }, desc: { es: 'Añade tu primer astro en el modo libre.', en: 'Add your first celestial body in free mode.' } },
  { id: 'sb_collector', icon: '❂', title: { es: 'Colección de astros', en: 'Star collection' }, desc: { es: 'Reúne 50 astros en tu galaxia.', en: 'Gather 50 celestial bodies in your galaxy.' } },
  { id: 'sb_nebulae', icon: '❀', title: { es: 'Jardín de nebulosas', en: 'Nebula garden' }, desc: { es: 'Ten una nebulosa de cada tipo.', en: 'Own one nebula of every kind.' } },
  { id: 'sb_level10', icon: '◉', title: { es: 'Galaxia monumental', en: 'Monumental galaxy' }, desc: { es: 'Lleva tu galaxia al nivel 10.', en: 'Bring your galaxy to level 10.' } },
  { id: 'sb_level20', icon: '✹', title: { es: 'Gigante del cosmos', en: 'Giant of the cosmos' }, desc: { es: 'Lleva tu galaxia al nivel 20.', en: 'Bring your galaxy to level 20.' } },
  { id: 'mg_first', icon: '◎', title: { es: 'Primera noche de observación', en: 'First night of stargazing' }, desc: { es: 'Juega tu primer minijuego en el Observatorio.', en: 'Play your first minigame in the Observatory.' } },
  { id: 'mg_supernova', icon: '✸', title: { es: 'Mirada atenta', en: 'Watchful eye' }, desc: { es: 'Consigue ★★★ en Lluvia de supernovas.', en: 'Earn ★★★ in Supernova Shower.' } },
  { id: 'mg_hypernova', icon: '✺', title: { es: 'Hipernova', en: 'Hypernova' }, desc: { es: 'Haz estallar una estrella sin perder ni un latido.', en: 'Make a star burst without missing a single beat.' } },
  { id: 'mg_memory10', icon: '♫', title: { es: 'Memoria cósmica', en: 'Cosmic memory' }, desc: { es: 'Llega al nivel 10 en Memoria estelar.', en: 'Reach level 10 in Star Memory.' } },
  { id: 'mg_constellations', icon: '✧', title: { es: 'Mapa del cielo', en: 'Map of the sky' }, desc: { es: 'Completa las 12 constelaciones.', en: 'Complete all 12 constellations.' } },
  { id: 'mg_dwarf3', icon: '◉', title: { es: 'Familia galáctica', en: 'Galactic family' }, desc: { es: 'Reúne a las tres galaxias enanas.', en: 'Bring all three dwarf galaxies home.' } },
  { id: 'pomo_first', icon: '◷', title: { es: 'Foco estelar', en: 'Stellar focus' }, desc: { es: 'Completa tu primer pomodoro.', en: 'Complete your first pomodoro.' } },
  { id: 'pomo_cycle', icon: '◴', title: { es: 'Órbita completa', en: 'Full orbit' }, desc: { es: 'Completa un ciclo de pomodoros hasta la pausa larga.', en: 'Complete a pomodoro cycle up to the long break.' } },
  { id: 'mg_slingshot', icon: '☄', title: { es: 'Asistencia gravitatoria', en: 'Gravity assist' }, desc: { es: 'Encadena dos asistencias con un mismo cometa.', en: 'Chain two gravity assists with the same comet.' } },
];

const resolve = (a: AchievementText): AchievementDef => ({ id: a.id, icon: a.icon, title: pick(a.title), desc: pick(a.desc) });

/** All achievements, in the current language. */
export const achievements = () => LIST.map(resolve);

export const achievementById = (id: string) => {
  const a = LIST.find((x) => x.id === id);
  return a ? resolve(a) : undefined;
};
