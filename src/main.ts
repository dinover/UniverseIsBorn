import './ui/styles.css';
import { Game } from './core/Game';
import { TitlePhase } from './gameplay/phases/TitlePhase';
import { PrimordialPhase } from './gameplay/phases/PrimordialPhase';
import { CloudPhase } from './gameplay/phases/CloudPhase';
import { ProtostarPhase } from './gameplay/phases/ProtostarPhase';
import { StellarPhase } from './gameplay/phases/StellarPhase';
import { SupernovaPhase } from './gameplay/phases/SupernovaPhase';
import { NeutronPhase } from './gameplay/phases/NeutronPhase';
import { BlackHolePhase } from './gameplay/phases/BlackHolePhase';
import { GalaxyPhase } from './gameplay/phases/GalaxyPhase';
import { PomodoroPhase } from './gameplay/phases/PomodoroPhase';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function boot() {
  const bootEl = document.getElementById('boot')!;
  if (!webglAvailable()) {
    bootEl.innerHTML = '<div style="max-width:420px;text-align:center;letter-spacing:0.1em;line-height:1.8">Tu navegador no soporta WebGL.<br/>Prueba con una versión reciente de Chrome, Edge, Firefox o Safari.</div>';
    return;
  }
  const game = new Game(document.getElementById('game')!, document.getElementById('ui')!);
  game.register('title', (g, c) => new TitlePhase(g, c));
  game.register('primordial', (g, c) => new PrimordialPhase(g, c));
  game.register('cloud', (g, c) => new CloudPhase(g, c));
  game.register('protostar', (g, c) => new ProtostarPhase(g, c));
  game.register('stellar', (g, c) => new StellarPhase(g, c));
  game.register('supernova', (g, c) => new SupernovaPhase(g, c));
  game.register('neutron', (g, c) => new NeutronPhase(g, c));
  game.register('blackhole', (g, c) => new BlackHolePhase(g, c));
  game.register('galaxy', (g, c) => new GalaxyPhase(g, c));
  game.register('sandbox', (g, c) => new GalaxyPhase(g, c, true));
  game.register('pomodoro', (g, c) => new PomodoroPhase(g, c));
  game.start();
  setTimeout(() => bootEl.classList.add('hide'), 400);
}

boot();
