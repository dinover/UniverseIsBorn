/** Simplified stick figures of real constellations (x right, y down, both 0..1). */
export interface ConstellationDef {
  id: string;
  name: string;
  fact: string;
  pts: [number, number][];
  edges: [number, number][];
}

/** In discovery order: from the simplest figure to the most intricate. */
export const CONSTELLATIONS: ConstellationDef[] = [
  { id: 'cruz', name: 'Cruz del Sur', fact: 'La más pequeña de las 88 constelaciones: su brazo largo señala el polo sur celeste.', pts: [[0.5, 0], [0.5, 1], [0.12, 0.42], [0.85, 0.55]], edges: [[0, 1], [2, 3]] },
  { id: 'casiopea', name: 'Casiopea', fact: 'La reina vanidosa del mito: su W gira cada noche alrededor de la estrella polar.', pts: [[0, 0.25], [0.25, 0.75], [0.5, 0.4], [0.75, 0.85], [1, 0.2]], edges: [[0, 1], [1, 2], [2, 3], [3, 4]] },
  { id: 'lira', name: 'Lira', fact: 'Vega, su estrella más brillante, será la estrella polar dentro de unos 12.000 años.', pts: [[0.5, 0], [0.4, 0.32], [0.65, 0.34], [0.33, 0.95], [0.6, 1]], edges: [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 4]] },
  { id: 'geminis', name: 'Géminis', fact: 'Cástor y Pólux, los gemelos. Cástor es en realidad un sistema de seis estrellas.', pts: [[0.22, 0.04], [0.5, 0], [0.17, 0.42], [0.08, 0.92], [0.52, 0.4], [0.62, 0.95]], edges: [[0, 1], [0, 2], [2, 3], [1, 4], [4, 5], [2, 4]] },
  { id: 'tauro', name: 'Tauro', fact: 'Aldebarán es el ojo rojo del toro; sobre su lomo viajan las Pléyades.', pts: [[0.5, 0.72], [0.36, 0.5], [0.63, 0.52], [0.1, 0.08], [0.82, 0.1], [0.6, 0.98]], edges: [[0, 1], [0, 2], [1, 3], [2, 4], [0, 5]] },
  { id: 'osamayor', name: 'Osa Mayor', fact: 'Prolonga las dos estrellas del borde del carro y encontrarás la estrella polar.', pts: [[0, 0.22], [0.18, 0.1], [0.34, 0.2], [0.5, 0.34], [0.53, 0.68], [0.88, 0.74], [0.93, 0.36]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]] },
  { id: 'cisne', name: 'Cisne', fact: 'Vuela a lo largo de la Vía Láctea; Deneb, su cola, es una supergigante a 2.600 años luz.', pts: [[0.5, 0], [0.5, 0.38], [0.5, 0.68], [0.5, 1], [0.28, 0.32], [0.05, 0.2], [0.72, 0.45], [0.95, 0.6]], edges: [[0, 1], [1, 2], [2, 3], [1, 4], [4, 5], [1, 6], [6, 7]] },
  { id: 'orion', name: 'Orión', fact: 'Betelgeuse, su hombro rojo, es una supergigante que algún día estallará en supernova.', pts: [[0.2, 0.12], [0.75, 0.18], [0.38, 0.5], [0.5, 0.48], [0.62, 0.46], [0.3, 0.92], [0.82, 0.86], [0.48, 0]], edges: [[0, 7], [7, 1], [0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6]] },
  { id: 'pegaso', name: 'Pegaso', fact: 'Su Gran Cuadrado sirve de mapa para encontrar la galaxia de Andrómeda.', pts: [[0.3, 0.3], [0.68, 0.3], [0.7, 0.7], [0.3, 0.72], [0.88, 0.88], [1, 0.74], [0.86, 0.12], [1, 0.24]], edges: [[0, 1], [1, 2], [2, 3], [3, 0], [2, 4], [4, 5], [1, 6], [6, 7]] },
  { id: 'andromeda', name: 'Andrómeda', fact: 'Junto a ella se ve a simple vista otra galaxia, a 2,5 millones de años luz.', pts: [[0, 0.55], [0.3, 0.48], [0.58, 0.38], [0.95, 0.22], [0.5, 0.15], [0.44, 0], [0.32, 0.75], [0.62, 0.68]], edges: [[0, 1], [1, 2], [2, 3], [2, 4], [4, 5], [1, 6], [2, 7]] },
  { id: 'leo', name: 'Leo', fact: 'La hoz dibuja la melena del león; Régulo, su corazón, gira tan rápido que está achatada.', pts: [[0.3, 0.75], [0.28, 0.5], [0.36, 0.3], [0.26, 0.1], [0.12, 0.13], [0.08, 0.3], [0.7, 0.4], [0.96, 0.6], [0.72, 0.74]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [2, 6], [6, 7], [7, 8], [8, 0]] },
  { id: 'escorpio', name: 'Escorpio', fact: 'Antares, su corazón rojo, es tan grande que se tragaría la órbita de Marte.', pts: [[0, 0.05], [0.1, 0.2], [0.04, 0.38], [0.26, 0.3], [0.36, 0.42], [0.45, 0.57], [0.5, 0.74], [0.62, 0.9], [0.8, 0.97], [0.95, 0.84], [0.9, 0.68]], edges: [[1, 0], [1, 2], [1, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10]] },
];

export const constellationById = (id: string) => CONSTELLATIONS.find((c) => c.id === id);

/** Points of a figure placed on screen: centred on (cx, cy), `size` px wide, rotated `rot`. */
export function placeFigure(def: ConstellationDef, cx: number, cy: number, size: number, rot: number): [number, number][] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return def.pts.map(([x, y]) => {
    const dx = (x - 0.5) * size;
    const dy = (y - 0.5) * size;
    return [cx + dx * c - dy * s, cy + dx * s + dy * c];
  });
}

/** A glowing star dot on a 2D canvas. */
export function drawStar(g: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number, color = '255,250,235') {
  const grd = g.createRadialGradient(x, y, 0, x, y, r * 5);
  grd.addColorStop(0, `rgba(${color},${alpha})`);
  grd.addColorStop(0.25, `rgba(${color},${alpha * 0.45})`);
  grd.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = grd;
  g.beginPath();
  g.arc(x, y, r * 5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = `rgba(255,255,255,${alpha})`;
  g.beginPath();
  g.arc(x, y, r * 0.7, 0, Math.PI * 2);
  g.fill();
}

/** A finished constellation: lines, stars and (optionally) its name. */
export function drawFigure(g: CanvasRenderingContext2D, def: ConstellationDef, pts: [number, number][], alpha: number, label: boolean, time = 0) {
  g.save();
  g.lineCap = 'round';
  g.strokeStyle = `rgba(255, 214, 140, ${0.55 * alpha})`;
  g.lineWidth = 1.6;
  g.shadowColor = 'rgba(255, 190, 90, 0.9)';
  g.shadowBlur = 8;
  g.beginPath();
  for (const [a, b] of def.edges) {
    g.moveTo(pts[a][0], pts[a][1]);
    g.lineTo(pts[b][0], pts[b][1]);
  }
  g.stroke();
  g.restore();
  pts.forEach(([x, y], i) => drawStar(g, x, y, 2.4, alpha * (0.75 + 0.25 * Math.sin(time * 2 + i * 1.7))));
  if (label) {
    let cx = 0;
    let maxY = -Infinity;
    for (const [x, y] of pts) {
      cx += x / pts.length;
      maxY = Math.max(maxY, y);
    }
    g.save();
    g.font = '500 12px "Chakra Petch", sans-serif';
    g.textAlign = 'center';
    g.fillStyle = `rgba(255, 226, 170, ${0.85 * alpha})`;
    g.shadowColor = 'rgba(0,0,0,0.9)';
    g.shadowBlur = 6;
    g.fillText(def.name.toUpperCase(), cx, maxY + 22);
    g.restore();
  }
}
