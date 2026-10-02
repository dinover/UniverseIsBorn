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
];

export const achievementById = (id: string) => ACHIEVEMENTS.find((a) => a.id === id);
