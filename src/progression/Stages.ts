export interface StageDef {
  n: number;
  name: string;
  feel: string; // the emotional line shown when entering
  codex: string;
}

export const STAGES: StageDef[] = [
  { n: 1, name: 'Materia primordial', feel: 'Soy polvo.', codex: 'primordial' },
  { n: 2, name: 'Nube molecular', feel: 'Ahora soy una nube.', codex: 'jeans' },
  { n: 3, name: 'Protoestrella', feel: 'Estoy formando una estrella.', codex: 'protostar' },
  { n: 4, name: 'Estrella masiva', feel: 'Soy una estrella.', codex: 'fusion' },
  { n: 5, name: 'Núcleo de hierro', feel: 'Estoy llegando al hierro.', codex: 'iron' },
  { n: 6, name: 'Supernova', feel: 'TODO COLAPSÓ.', codex: 'supernova' },
  { n: 7, name: 'Nacimiento del agujero negro', feel: 'Acabo de convertirme en un agujero negro.', codex: 'horizon' },
  { n: 8, name: 'Acreción', feel: 'Ahora estoy absorbiendo materia.', codex: 'orbits' },
  { n: 9, name: 'Disco de acreción', feel: 'Tengo un disco de acreción.', codex: 'disk' },
  { n: 10, name: 'Agujero negro activo', feel: 'TENGO JETS.', codex: 'jets' },
  { n: 11, name: 'Crecimiento', feel: 'Todo es alimento... si sé capturarlo.', codex: 'tde' },
  { n: 12, name: 'Fusiones', feel: 'No soy el único agujero negro.', codex: 'gw' },
  { n: 13, name: 'Agujero negro intermedio', feel: 'La cámara se alejó.', codex: 'imbh' },
  { n: 14, name: 'Supermasivo', feel: '¿ESO ES UNA GALAXIA?', codex: 'smbh' },
  { n: 15, name: 'Galaxia', feel: 'Ahora estoy en el centro.', codex: 'galaxy' },
];

export const stageDef = (n: number) => STAGES[Math.max(0, Math.min(STAGES.length - 1, n - 1))];
