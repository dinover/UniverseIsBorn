import { h } from './Hud';
import { CODEX, codexById } from '../progression/Codex';
import { ACHIEVEMENTS } from '../progression/Achievements';
import type { Progression } from '../progression/Progression';
import type { Settings } from '../persistence/SaveSystem';
import type { AudioEngine } from '../audio/AudioEngine';
import { formatSolar, formatTime, formatBig } from '../utils/math';
import { stageDef } from '../progression/Stages';
import { briefing } from '../progression/Briefings';

export interface MenuCallbacks {
  onNewGame(): void;
  onContinue(): void;
  onResume(): void;
  onQuitToTitle(): void;
  onSettings(s: Settings): void;
  onResetProgress(): void;
}

/** Title screen, pause, options, codex, achievements & science cards. */
export class Menus {
  title: HTMLElement;
  private screens = new Map<string, HTMLElement>();
  private stack: string[] = [];
  private continueBtn!: HTMLButtonElement;
  private continueSub!: HTMLElement;

  constructor(private parent: HTMLElement, private prog: Progression, private audio: AudioEngine, private cb: MenuCallbacks) {
    this.title = h('div', 'interactive');
    this.title.id = 'title';
    this.title.innerHTML = `
      <div class="kicker">UNA ODISEA GRAVITACIONAL</div>
      <h1>Universe<br/>is Born</h1>
      <div class="sub">Empiezas como un puñado de átomos en un universo oscuro. Terminas en el corazón de una galaxia. Todo lo que hay en medio depende de ti.</div>
      <div class="menu"></div>
      <div class="foot"><span>WebGL · Gráficos y audio 100% procedurales</span><span class="stats-line"></span></div>`;
    parent.appendChild(this.title);
    const menu = this.title.querySelector('.menu') as HTMLElement;
    this.continueBtn = this.button(menu, 'Continuar', '', () => cb.onContinue());
    this.continueSub = this.continueBtn.querySelector('small') as HTMLElement;
    this.button(menu, 'Nueva partida', 'Un universo nuevo, generado para ti', () => {
      if (this.prog.loadRun()) this.confirm('¿Empezar de nuevo?', 'Se sobrescribirá tu partida en curso. Los logros y el códice se conservan.', () => cb.onNewGame());
      else cb.onNewGame();
    });
    this.button(menu, 'Códice', 'Ciencia detrás de cada etapa', () => this.openCodex());
    this.button(menu, 'Logros', 'Y estadísticas', () => this.openAchievements());
    this.button(menu, 'Opciones', '', () => this.openOptions());
    this.refreshTitle();
  }

  private button(parent: HTMLElement, label: string, sub: string, fn: () => void) {
    const b = h('button', 'btn', `${label}<small>${sub}</small>`) as HTMLButtonElement;
    b.addEventListener('mouseenter', () => this.audio.ui('hover'));
    b.addEventListener('click', () => {
      this.audio.init();
      this.audio.ui('click');
      fn();
    });
    parent.appendChild(b);
    return b;
  }

  refreshTitle() {
    const run = this.prog.loadRun();
    this.continueBtn.style.display = run ? '' : 'none';
    if (run) {
      const st = stageDef(run.carry.stage ?? 1);
      const m = run.carry.bhMass ? ` · ${formatSolar(run.carry.bhMass)} M☉` : '';
      this.continueSub.textContent = `Etapa ${st.n}: ${st.name}${m} · ${formatTime(run.time)}`;
    }
    const s = this.prog.meta.stats;
    const line = this.title.querySelector('.stats-line') as HTMLElement;
    line.textContent = s.maxMass > 0 ? `Récord: ${formatSolar(s.maxMass)} M☉` : '';
  }

  showTitle(v: boolean) {
    if (v) this.refreshTitle();
    this.title.classList.toggle('hidden', !v);
  }

  get anyOpen() {
    return this.stack.length > 0;
  }

  private screen(id: string, build: (panel: HTMLElement) => void, narrow = false) {
    let s = this.screens.get(id);
    if (!s) {
      s = h('div', 'screen interactive');
      s.addEventListener('pointerdown', (e) => {
        if (e.target === s) this.close();
      });
      this.parent.appendChild(s);
      this.screens.set(id, s);
    }
    s.innerHTML = '';
    const panel = h('div', narrow ? 'panel narrow' : 'panel');
    s.appendChild(panel);
    build(panel);
    void s.offsetWidth; // force style flush so the fade-in transition still plays
    s.classList.add('show');
    if (this.stack[this.stack.length - 1] !== id) this.stack.push(id);
    this.audio.ui('open');
  }

  close() {
    const id = this.stack.pop();
    if (!id) return;
    this.screens.get(id)?.classList.remove('show');
    this.audio.ui('back');
    if (id === 'pause') this.cb.onResume();
    if (this.stack.length === 0) this.onAllClosed?.();
  }

  closeAll() {
    while (this.stack.length) {
      const id = this.stack.pop()!;
      this.screens.get(id)?.classList.remove('show');
    }
  }

  onAllClosed: (() => void) | null = null;

  private actions(panel: HTMLElement, list: [string, () => void][]) {
    const a = h('div', 'actions');
    for (const [label, fn] of list) this.button(a, label, '', fn).classList.add('small');
    panel.appendChild(a);
  }

  openPause() {
    this.screen('pause', (p) => {
      p.appendChild(h('h2', '', 'Pausa'));
      const m = h('div', 'menu');
      m.style.cssText = 'display:flex;flex-direction:column;gap:6px';
      this.button(m, 'Continuar', '', () => this.close());
      this.button(m, 'Códice', '', () => this.openCodex());
      this.button(m, 'Logros', '', () => this.openAchievements());
      this.button(m, 'Opciones', '', () => this.openOptions());
      this.button(m, 'Guardar y salir al menú', '', () => {
        this.closeAll();
        this.cb.onQuitToTitle();
      });
      p.appendChild(m);
    }, true);
  }

  confirm(title: string, text: string, yes: () => void) {
    this.screen('confirm', (p) => {
      p.appendChild(h('h2', '', title));
      p.appendChild(h('div', 'codex-body', text));
      this.actions(p, [
        ['Confirmar', () => {
          this.close();
          yes();
        }],
        ['Cancelar', () => this.close()],
      ]);
    }, true);
  }

  openOptions() {
    const s = { ...this.prog.meta.settings };
    const apply = () => this.cb.onSettings({ ...s });
    this.screen('options', (p) => {
      p.appendChild(h('h2', '', 'Opciones'));
      // Quality
      const q = h('div', 'row', `<span class="label">Calidad gráfica</span>`);
      const seg = h('div', 'seg');
      const opts: [Settings['quality'], string][] = [['auto', 'Auto'], ['low', 'Baja'], ['medium', 'Media'], ['high', 'Alta']];
      for (const [v, l] of opts) {
        const b = h('button', s.quality === v ? 'on' : '', l);
        b.addEventListener('click', () => {
          s.quality = v;
          seg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          apply();
          this.audio.ui('click');
        });
        seg.appendChild(b);
      }
      q.appendChild(seg);
      p.appendChild(q);
      const slider = (label: string, key: 'music' | 'sfx') => {
        const r = h('div', 'row', `<span class="label">${label}</span>`);
        const i = h('input') as HTMLInputElement;
        i.type = 'range';
        i.min = '0';
        i.max = '1';
        i.step = '0.05';
        i.value = String(s[key]);
        i.addEventListener('input', () => {
          s[key] = parseFloat(i.value);
          apply();
        });
        r.appendChild(i);
        p.appendChild(r);
      };
      slider('Música', 'music');
      slider('Efectos', 'sfx');
      const toggle = (label: string, key: 'educational' | 'shake', desc: string) => {
        const r = h('div', 'row', `<div><div class="label">${label}</div><div style="font-size:12px;color:var(--dim);margin-top:4px">${desc}</div></div>`);
        const t = h('button', 'toggle' + (s[key] ? ' on' : ''));
        t.addEventListener('click', () => {
          s[key] = !s[key];
          t.classList.toggle('on', s[key]);
          apply();
          this.audio.ui('click');
        });
        r.appendChild(t);
        p.appendChild(r);
      };
      toggle('Modo educativo', 'educational', 'Muestra la explicación científica al descubrir algo nuevo.');
      toggle('Vibración de cámara', 'shake', 'Sacudidas durante explosiones y colapsos.');
      const help = h('div', 'codex-body', `<div class="game">Controles: el cursor guía tu movimiento (o <b>WASD</b>). <b>Clic izquierdo / Espacio</b>: habilidad principal. <b>Clic derecho / Shift / E</b>: habilidad secundaria. <b>Rueda</b>: zoom. <b>Esc</b>: pausa. En táctil: arrastra a la izquierda para moverte y usa los botones.</div>`);
      p.appendChild(help);
      this.actions(p, [
        ['Volver', () => this.close()],
        ['Borrar todo el progreso', () => this.confirm('¿Borrar todo?', 'Se eliminarán partida, logros, códice y estadísticas.', () => this.cb.onResetProgress())],
      ]);
    });
  }

  openCodex(focus?: string) {
    this.screen('codex', (p) => {
      p.appendChild(h('h2', '', 'Códice cósmico'));
      const count = CODEX.filter((c) => this.prog.meta.codex[c.id]).length;
      p.appendChild(h('div', 'label', `${count} / ${CODEX.length} descubrimientos`));
      const grid = h('div', 'codex-grid');
      grid.style.marginTop = '14px';
      for (const c of CODEX) {
        const unlocked = !!this.prog.meta.codex[c.id];
        const unread = unlocked && !this.prog.meta.codexRead[c.id];
        const el = h('div', `codex-item${unlocked ? '' : ' locked'}${unread ? ' unread' : ''}`, `<div class="t">${unlocked ? c.title : '???'}</div><div class="q">${unlocked ? c.question : 'Sigue evolucionando para descubrirlo.'}</div>`);
        if (unlocked) el.addEventListener('click', () => this.openEntry(c.id));
        grid.appendChild(el);
      }
      p.appendChild(grid);
      this.actions(p, [['Volver', () => this.close()]]);
    });
    if (focus) this.openEntry(focus);
  }

  /** Stage briefing: what to do now. The game stays paused until the player confirms. */
  openBriefing(stage: number, touch: boolean, onScience: () => void) {
    const b = briefing(stage, touch);
    const def = stageDef(stage);
    if (!b) return false;
    this.screen(
      'briefing',
      (p) => {
        p.classList.add('briefing');
        p.appendChild(h('div', 'label', `ETAPA ${String(stage).padStart(2, '0')} / 15`));
        p.appendChild(h('h2', '', def.name));
        p.appendChild(h('div', 'brief-feel', `“${def.feel}”`));
        p.appendChild(h('div', 'brief-goal', `<div class="label">Objetivo</div><div>${b.goal}</div>`));
        p.appendChild(h('div', 'label', 'Cómo jugar'));
        p.appendChild(h('ul', 'brief-how', b.how.map((x) => `<li>${x}</li>`).join('')));
        this.actions(p, [
          ['¡Entendido!', () => this.close()],
          ['¿Qué está pasando? (ciencia)', () => onScience()],
        ]);
        (p.querySelector('.actions .btn') as HTMLElement)?.focus();
      },
      true,
    );
    return true;
  }

  openEntry(id: string) {
    const c = codexById(id);
    if (!c) return;
    this.prog.markRead(id);
    this.screen('entry', (p) => {
      p.appendChild(h('div', 'label', c.question));
      p.appendChild(h('h2', '', c.title));
      p.appendChild(h('div', 'codex-body', `${c.body}${c.game ? `<div class="game"><b>En el juego:</b> ${c.game}</div>` : ''}`));
      this.actions(p, [['Entendido', () => this.close()]]);
    });
  }

  openAchievements() {
    const st = this.prog.meta.stats;
    this.screen('ach', (p) => {
      p.appendChild(h('h2', '', 'Logros'));
      const list = h('div', 'ach-list');
      for (const a of ACHIEVEMENTS) {
        const done = !!this.prog.meta.achievements[a.id];
        list.appendChild(h('div', `ach${done ? ' done' : ''}`, `<div class="i">${a.icon}</div><div><div class="t">${a.title}</div><div class="d">${a.desc}</div></div>`));
      }
      p.appendChild(list);
      p.appendChild(h('h2', '', 'Estadísticas'));
      (p.lastElementChild as HTMLElement).style.marginTop = '26px';
      const stats = h('div', 'stats');
      const rows: [string, string][] = [
        ['Tiempo jugado', formatTime(st.timePlayed)],
        ['Masa máxima', formatSolar(st.maxMass) + ' M☉'],
        ['Partículas absorbidas', formatBig(st.particles)],
        ['Estrellas devoradas', formatBig(st.starsDevoured)],
        ['Cuerpos capturados', formatBig(st.captures)],
        ['Fusiones de agujeros negros', formatBig(st.bhMerged)],
        ['Supernovas', formatBig(st.supernovae)],
        ['Fusiones perfectas', formatBig(st.perfectHits)],
        ['Tiempo con jets', formatTime(st.jetSeconds)],
        ['Universos completados', formatBig(st.runsCompleted)],
      ];
      stats.innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
      p.appendChild(stats);
      this.actions(p, [['Volver', () => this.close()]]);
    });
  }

  openEnding(mass: number, time: number, onSandbox: () => void, onTitle: () => void) {
    this.screen('ending', (p) => {
      p.appendChild(h('div', 'label', 'Fin del viaje... por ahora'));
      p.appendChild(h('h2', '', 'Eres el corazón de una galaxia'));
      p.appendChild(
        h(
          'div',
          'codex-body',
          `Empezaste como un puñado de átomos flotando en la oscuridad. Hoy tienes <b>${formatSolar(mass)}</b> masas solares y decenas de miles de millones de estrellas giran a tu alrededor.<br/><br/>Tiempo total: <b>${formatTime(time)}</b>.<div class="game">Y esta galaxia es solo una entre un billón.</div>`,
        ),
      );
      this.actions(p, [
        ['Seguir en modo libre', () => {
          this.close();
          onSandbox();
        }],
        ['Volver al menú', () => {
          this.closeAll();
          onTitle();
        }],
      ]);
    });
  }
}

/** On-screen touch buttons and joystick visual. */
export class TouchControls {
  root: HTMLElement;
  private pBtn: HTMLElement;
  private sBtn: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  constructor(parent: HTMLElement, onPrimary: (d: boolean) => void, onSecondary: (d: boolean) => void, onPause: () => void) {
    this.root = h('div', 'touch');
    this.stick = h('div', 'stick');
    this.knob = h('i');
    this.stick.appendChild(this.knob);
    this.pBtn = h('div', 'tb p interactive', 'Pulso');
    this.sBtn = h('div', 'tb s interactive', 'Jets');
    const pause = h('button', 'btn small pause interactive', 'II');
    pause.style.minWidth = '0';
    pause.addEventListener('click', onPause);
    const bind = (el: HTMLElement, fn: (d: boolean) => void) => {
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('down');
        fn(true);
      });
      const up = (e: Event) => {
        e.preventDefault();
        el.classList.remove('down');
        fn(false);
      };
      el.addEventListener('touchend', up);
      el.addEventListener('touchcancel', up);
    };
    bind(this.pBtn, onPrimary);
    bind(this.sBtn, onSecondary);
    this.root.append(this.stick, this.pBtn, this.sBtn, pause);
    parent.appendChild(this.root);
  }
  setEnabled(v: boolean) {
    this.root.classList.toggle('on', v);
  }
  setLabels(primary: string | null, secondary: string | null) {
    this.pBtn.textContent = primary ?? '';
    this.pBtn.classList.toggle('hidden', !primary);
    this.sBtn.textContent = secondary ?? '';
    this.sBtn.classList.toggle('hidden', !secondary);
  }
  updateStick(active: boolean, ox: number, oy: number, sx: number, sy: number) {
    this.stick.classList.toggle('on', active);
    if (!active) return;
    this.stick.style.left = `${ox}px`;
    this.stick.style.top = `${oy}px`;
    this.knob.style.transform = `translate(${sx * 35}px, ${sy * 35}px)`;
  }
}
