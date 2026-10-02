export interface AchievementDef {
  id: string;
  title: string;
  desc: string;
  icon: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_light', title: 'Primera luz', desc: 'Enciende tu primera estrella.', icon: '✦' },
  { id: 'perfect_balance', title: 'Equilibrio perfecto', desc: 'Enciende la estrella sin expansiones ni colapsos.', icon: '⚖' },
  { id: 'rhythm', title: 'Ritmo estelar', desc: 'Encadena 10 fusiones perfectas.', icon: '♫' },
  { id: 'iron_will', title: 'Voluntad de hierro', desc: 'Resiste el colapso sin fallar más de una onda.', icon: '⬢' },
  { id: 'direct_collapse', title: 'Directo al abismo', desc: 'Forma un agujero negro directamente de la supernova.', icon: '●' },
  { id: 'neutron_detour', title: 'Desvío de neutrones', desc: 'Nace como estrella de neutrones y colapsa igualmente.', icon: '◎' },
  { id: 'spaghetti', title: 'Espaguetificación', desc: 'Destroza tu primera estrella por fuerzas de marea.', icon: '〰' },
  { id: 'glutton', title: 'Glotón estelar', desc: 'Devora 25 estrellas.', icon: '★' },
  { id: 'orbital', title: 'Mecánica orbital', desc: 'Captura 40 cuerpos.', icon: '◌' },
  { id: 'first_merge', title: 'Dos en uno', desc: 'Fusiónate con otro agujero negro.', icon: '∞' },
  { id: 'aligned', title: 'Espines alineados', desc: 'Completa una fusión perfecta.', icon: '⇅' },
  { id: 'seeder', title: 'Semillero', desc: 'Dispara formación estelar con tus jets.', icon: '❋' },
  { id: 'pushback', title: 'Retroceso', desc: 'Empuja con tus jets a un agujero negro más grande.', icon: '⇶' },
  { id: 'million', title: 'Supermasivo', desc: 'Alcanza un millón de masas solares.', icon: '⬤' },
  { id: 'billion', title: 'Monstruo cósmico', desc: 'Alcanza mil millones de masas solares.', icon: '✺' },
  { id: 'galaxy_merge', title: 'Dos galaxias, un corazón', desc: 'Completa la fusión galáctica.', icon: '✴' },
  { id: 'scholar', title: 'Mente curiosa', desc: 'Lee 8 entradas del códice.', icon: '❖' },
  { id: 'sb_first', title: 'Jardinero cósmico', desc: 'Compra tu primer astro en el modo libre.', icon: '✧' },
  { id: 'sb_collector', title: 'Coleccionista', desc: 'Reúne 50 astros en tu galaxia.', icon: '❂' },
  { id: 'sb_nebulae', title: 'Jardín de nebulosas', desc: 'Ten una nebulosa de cada tipo.', icon: '❀' },
  { id: 'sb_level10', title: 'Galaxia monumental', desc: 'Lleva tu galaxia al nivel 10.', icon: '◉' },
  { id: 'sb_level20', title: 'Gigante del cosmos', desc: 'Lleva tu galaxia al nivel 20.', icon: '✹' },
  { id: 'mg_first', title: 'Astrónomo aficionado', desc: 'Juega tu primer minijuego en el Observatorio.', icon: '◎' },
  { id: 'mg_supernova', title: 'Cazador de supernovas', desc: 'Consigue ★★★ en Lluvia de supernovas.', icon: '✸' },
  { id: 'mg_hypernova', title: 'Hipernova', desc: 'Haz estallar una estrella sin fallar ni un latido.', icon: '✺' },
  { id: 'mg_memory10', title: 'Memoria cósmica', desc: 'Llega al nivel 10 en Memoria estelar.', icon: '♫' },
  { id: 'mg_constellations', title: 'Cartógrafo del cielo', desc: 'Completa las 12 constelaciones.', icon: '✧' },
  { id: 'mg_dwarf3', title: 'Caníbal galáctico', desc: 'Absorbe las tres galaxias enanas.', icon: '◉' },
  { id: 'pomo_first', title: 'Foco estelar', desc: 'Completa tu primer pomodoro.', icon: '◷' },
  { id: 'pomo_cycle', title: 'Órbita completa', desc: 'Completa un ciclo de pomodoros hasta la pausa larga.', icon: '◴' },
  { id: 'mg_slingshot', title: 'Asistencia gravitatoria', desc: 'Encadena dos asistencias con un mismo cometa.', icon: '☄' },
];

export const achievementById = (id: string) => ACHIEVEMENTS.find((a) => a.id === id);
