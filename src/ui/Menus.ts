import { h } from './Hud';
import { codexById, codexList } from '../progression/Codex';
import { achievements } from '../progression/Achievements';
import type { Progression } from '../progression/Progression';
import type { Settings } from '../persistence/SaveSystem';
import type { AudioEngine } from '../audio/AudioEngine';
import { formatSolar, formatTime, formatBig } from '../utils/math';
import { stageDef } from '../progression/Stages';
import { briefing } from '../progression/Briefings';
import { levelFor } from '../gameplay/sandbox/Catalog';
import { getLang, setLang, tr, type Lang } from '../i18n/i18n';

export interface MenuCallbacks {
  onNewGame(): void;
  onContinue(): void;
  onSandbox(): void;
  onPomodoro(): void;
  onResume(): void;
  onQuitToTitle(): void;
  onSettings(s: Settings): void;
  onResetProgress(): void;
}

/** Title screen, pause, options, codex, achievements & science cards. */
export class Menus {
  title: HTMLElement;
  private screens = new Map<string, HTMLElement>();
  /** How each screen was built, so it can be rebuilt in another language. */
  private builders = new Map<string, { build: (panel: HTMLElement) => void; narrow: boolean }>();
  private stack: string[] = [];
  private continueBtn!: HTMLButtonElement;
  private continueSub!: HTMLElement;
  private sandboxBtn!: HTMLButtonElement;
  private sandboxSub!: HTMLElement;

  constructor(private parent: HTMLElement, private prog: Progression, private audio: AudioEngine, private cb: MenuCallbacks) {
    this.title = h('div', 'interactive');
    this.title.id = 'title';
    parent.appendChild(this.title);
    this.buildTitle();
  }

  private buildTitle() {
    const cb = this.cb;
    this.title.innerHTML = `
      <div class="kicker">${tr('UNA ODISEA GRAVITACIONAL', 'A GRAVITATIONAL ODYSSEY')}</div>
      <h1>Universe<br/>is Born</h1>
      <div class="sub">${tr(
        'Empiezas como un puñado de átomos en la oscuridad del universo joven y llegas a ser el corazón de una galaxia. Un viaje tranquilo para descubrir, a tu ritmo, cómo nacen las estrellas.',
        'You begin as a handful of atoms in the darkness of the young universe and grow into the heart of a galaxy. A gentle journey to discover, at your own pace, how stars are born.',
      )}</div>
      <div class="menu"></div>
      <div class="foot"><span>${tr('WebGL · Gráficos y sonido 100% procedurales', 'WebGL · 100% procedural graphics and sound')}</span><span class="stats-line"></span></div>`;
    this.title.appendChild(this.langSwitch());
    const menu = this.title.querySelector('.menu') as HTMLElement;
    this.continueBtn = this.button(menu, tr('Continuar', 'Continue'), '', () => cb.onContinue());
    this.continueSub = this.continueBtn.querySelector('small') as HTMLElement;
    this.button(menu, tr('Nueva partida', 'New game'), tr('Un universo nuevo, creado para ti', 'A brand-new universe, made just for you'), () => {
      if (this.prog.loadRun())
        this.confirm(
          tr('¿Empezar de nuevo?', 'Start over?'),
          tr('Tu viaje en curso se reemplazará por uno nuevo. Tus logros y tu códice se conservan.', 'Your current journey will be replaced by a new one. Your achievements and codex are kept.'),
          () => cb.onNewGame(),
        );
      else cb.onNewGame();
    });
    this.sandboxBtn = this.button(menu, tr('Modo libre', 'Free mode'), '', () => cb.onSandbox());
    this.sandboxSub = this.sandboxBtn.querySelector('small') as HTMLElement;
    this.button(menu, tr('Modo Pomodoro', 'Pomodoro mode'), tr('Para estudiar o relajarte: un viaje cósmico con temporizador', 'Study or unwind: a cosmic journey with a focus timer'), () => cb.onPomodoro());
    this.button(menu, tr('Códice', 'Codex'), tr('La ciencia detrás de cada etapa', 'The science behind every stage'), () => this.openCodex());
    this.button(menu, tr('Logros', 'Achievements'), tr('Tus hitos y estadísticas', 'Your milestones and stats'), () => this.openAchievements());
    this.button(menu, tr('Opciones', 'Options'), '', () => this.openOptions());
    this.refreshTitle();
  }

  /** Compact ES / EN switch for the title screen. */
  private langSwitch() {
    const wrap = h('div', 'lang-switch');
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', tr('Idioma', 'Language'));
    const opts: [Lang, string, string][] = [
      ['es', 'ES', 'Español'],
      ['en', 'EN', 'English'],
    ];
    for (const [l, short, full] of opts) {
      const b = h('button', getLang() === l ? 'on' : '', short) as HTMLButtonElement;
      b.title = full;
      b.addEventListener('click', () => {
        this.audio.init();
        this.audio.ui('click');
        setLang(l);
      });
      wrap.appendChild(b);
    }
    return wrap;
  }

  /** Rebuilds the title and every open screen in the current language. */
  refreshLanguage() {
    const hidden = this.title.classList.contains('hidden');
    this.buildTitle();
    this.title.classList.toggle('hidden', hidden);
    for (const id of this.stack) {
      const s = this.screens.get(id);
      const b = this.builders.get(id);
      if (!s || !b) continue;
      const scroll = (s.firstElementChild as HTMLElement | null)?.scrollTop ?? 0;
      s.innerHTML = '';
      const panel = h('div', b.narrow ? 'panel narrow' : 'panel');
      s.appendChild(panel);
      b.build(panel);
      panel.scrollTop = scroll;
    }
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
      this.continueSub.textContent = `${tr('Etapa', 'Stage')} ${st.n}: ${st.name}${m} · ${formatTime(run.time)}`;
    }
    const sb = this.prog.loadSandbox();
    const unlocked = this.prog.sandboxUnlocked;
    this.sandboxBtn.disabled = !unlocked;
    this.sandboxBtn.classList.toggle('locked', !unlocked);
    this.sandboxSub.textContent = sb
      ? `${tr('Tu galaxia · nivel', 'Your galaxy · level')} ${levelFor(sb.invested)} · ${formatBig(sb.dust)} ✦ · ${formatSolar(sb.mass)} M☉`
      : unlocked
        ? tr('Tu galaxia te espera: estrellas, nebulosas y calma', 'Your galaxy awaits: stars, nebulae and calm')
        : tr('🔒 Se abre al completar el viaje', '🔒 Unlocks when you finish the journey');
    const s = this.prog.meta.stats;
    const line = this.title.querySelector('.stats-line') as HTMLElement;
    line.textContent = s.maxMass > 0 ? `${tr('Récord', 'Record')}: ${formatSolar(s.maxMass)} M☉` : '';
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
    this.builders.set(id, { build, narrow });
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

  /** `sandboxLink`: offer a jump to free mode (story runs, once unlocked). */
  openPause(sandboxLink = false) {
    this.screen('pause', (p) => {
      p.appendChild(h('h2', '', tr('Pausa', 'Paused')));
      const m = h('div', 'menu');
      m.style.cssText = 'display:flex;flex-direction:column;gap:6px';
      this.button(m, tr('Continuar', 'Resume'), '', () => this.close());
      if (sandboxLink)
        this.button(m, tr('Ir al modo libre', 'Go to free mode'), tr('Tu viaje queda guardado', 'Your journey stays saved'), () => {
          this.closeAll();
          this.cb.onSandbox();
        });
      this.button(m, tr('Códice', 'Codex'), '', () => this.openCodex());
      this.button(m, tr('Logros', 'Achievements'), '', () => this.openAchievements());
      this.button(m, tr('Opciones', 'Options'), '', () => this.openOptions());
      this.button(m, tr('Guardar y volver al menú', 'Save and return to menu'), '', () => {
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
        [tr('Confirmar', 'Confirm'), () => {
          this.close();
          yes();
        }],
        [tr('Cancelar', 'Cancel'), () => this.close()],
      ]);
    }, true);
  }

  openOptions() {
    const s = { ...this.prog.meta.settings };
    const apply = () => this.cb.onSettings({ ...s });
    this.screen('options', (p) => {
      p.appendChild(h('h2', '', tr('Opciones', 'Options')));
      // Language
      const lr = h('div', 'row', `<span class="label">${tr('Idioma', 'Language')}</span>`);
      const lseg = h('div', 'seg');
      const langs: [Lang, string][] = [['es', 'Español'], ['en', 'English']];
      for (const [v, l] of langs) {
        const b = h('button', getLang() === v ? 'on' : '', l);
        b.addEventListener('click', () => {
          this.audio.ui('click');
          setLang(v);
        });
        lseg.appendChild(b);
      }
      lr.appendChild(lseg);
      p.appendChild(lr);
      // Quality
      const q = h('div', 'row', `<span class="label">${tr('Calidad gráfica', 'Graphics quality')}</span>`);
      const seg = h('div', 'seg');
      const opts: [Settings['quality'], string][] = [
        ['auto', tr('Auto', 'Auto')],
        ['low', tr('Baja', 'Low')],
        ['medium', tr('Media', 'Medium')],
        ['high', tr('Alta', 'High')],
      ];
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
      slider(tr('Música', 'Music'), 'music');
      slider(tr('Efectos de sonido', 'Sound effects'), 'sfx');
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
      toggle(tr('Modo educativo', 'Learning mode'), 'educational', tr('Te ofrece la explicación científica cada vez que descubres algo nuevo.', 'Offers the science behind each new discovery.'));
      toggle(tr('Movimiento de cámara', 'Camera shake'), 'shake', tr('Sacudidas suaves durante explosiones y colapsos.', 'Gentle shaking during explosions and collapses.'));
      const help = h(
        'div',
        'codex-body',
        `<div class="game">${tr(
          'Controles: el cursor guía tu movimiento (o <b>WASD</b>). <b>Clic izquierdo / Espacio</b>: habilidad principal. <b>Clic derecho / Shift / E</b>: habilidad secundaria. <b>Rueda</b>: zoom. <b>Esc</b>: pausa. En pantallas táctiles: arrastra el dedo por la izquierda para moverte y usa los botones.',
          'Controls: the cursor guides your movement (or <b>WASD</b>). <b>Left click / Space</b>: main ability. <b>Right click / Shift / E</b>: secondary ability. <b>Wheel</b>: zoom. <b>Esc</b>: pause. On touch screens: drag your finger on the left side to move and use the buttons.',
        )}</div>`,
      );
      p.appendChild(help);
      this.actions(p, [
        [tr('Volver', 'Back'), () => this.close()],
        [
          tr('Borrar todo el progreso', 'Erase all progress'),
          () =>
            this.confirm(
              tr('¿Borrar todo?', 'Erase everything?'),
              tr(
                'Se eliminarán tu viaje, tu galaxia del modo libre, los logros, el códice y las estadísticas. No se puede deshacer.',
                'Your journey, your free-mode galaxy, achievements, codex and stats will all be deleted. This cannot be undone.',
              ),
              () => this.cb.onResetProgress(),
            ),
        ],
      ]);
    });
  }

  openCodex(focus?: string) {
    this.screen('codex', (p) => {
      p.appendChild(h('h2', '', tr('Códice cósmico', 'Cosmic codex')));
      const list = codexList();
      const count = list.filter((c) => this.prog.meta.codex[c.id]).length;
      p.appendChild(h('div', 'label', `${count} / ${list.length} ${tr('descubrimientos', 'discoveries')}`));
      const grid = h('div', 'codex-grid');
      grid.style.marginTop = '14px';
      for (const c of list) {
        const unlocked = !!this.prog.meta.codex[c.id];
        const unread = unlocked && !this.prog.meta.codexRead[c.id];
        const el = h('div', `codex-item${unlocked ? '' : ' locked'}${unread ? ' unread' : ''}`, `<div class="t">${unlocked ? c.title : '???'}</div><div class="q">${unlocked ? c.question : tr('Sigue tu viaje para descubrirlo.', 'Keep exploring to discover it.')}</div>`);
        if (unlocked) el.addEventListener('click', () => this.openEntry(c.id));
        grid.appendChild(el);
      }
      p.appendChild(grid);
      this.actions(p, [[tr('Volver', 'Back'), () => this.close()]]);
    });
    if (focus) this.openEntry(focus);
  }

  /** Stage briefing: what to do now. The game stays paused until the player confirms. */
  openBriefing(stage: number, touch: boolean, onScience: () => void) {
    if (!briefing(stage, touch)) return false;
    this.screen(
      'briefing',
      (p) => {
        const b = briefing(stage, touch)!;
        const def = stageDef(stage);
        p.classList.add('briefing');
        p.appendChild(h('div', 'label', `${tr('ETAPA', 'STAGE')} ${String(stage).padStart(2, '0')} / 15`));
        p.appendChild(h('h2', '', def.name));
        p.appendChild(h('div', 'brief-feel', `“${def.feel}”`));
        p.appendChild(h('div', 'brief-goal', `<div class="label">${tr('Objetivo', 'Goal')}</div><div>${b.goal}</div>`));
        p.appendChild(h('div', 'label', tr('Cómo jugar', 'How to play')));
        p.appendChild(h('ul', 'brief-how', b.how.map((x) => `<li>${x}</li>`).join('')));
        this.actions(p, [
          [tr('¡Entendido!', 'Got it!'), () => this.close()],
          [tr('La ciencia detrás', 'The science behind it'), () => onScience()],
        ]);
        (p.querySelector('.actions .btn') as HTMLElement)?.focus();
      },
      true,
    );
    return true;
  }

  openEntry(id: string) {
    if (!codexById(id)) return;
    this.prog.markRead(id);
    this.screen('entry', (p) => {
      const c = codexById(id)!;
      p.appendChild(h('div', 'label', c.question));
      p.appendChild(h('h2', '', c.title));
      p.appendChild(h('div', 'codex-body', `${c.body}${c.game ? `<div class="game"><b>${tr('En el juego:', 'In the game:')}</b> ${c.game}</div>` : ''}`));
      this.actions(p, [[tr('Entendido', 'Got it'), () => this.close()]]);
    });
  }

  openAchievements() {
    const st = this.prog.meta.stats;
    this.screen('ach', (p) => {
      p.appendChild(h('h2', '', tr('Logros', 'Achievements')));
      const list = h('div', 'ach-list');
      for (const a of achievements()) {
        const done = !!this.prog.meta.achievements[a.id];
        list.appendChild(h('div', `ach${done ? ' done' : ''}`, `<div class="i">${a.icon}</div><div><div class="t">${a.title}</div><div class="d">${a.desc}</div></div>`));
      }
      p.appendChild(list);
      p.appendChild(h('h2', '', tr('Estadísticas', 'Statistics')));
      (p.lastElementChild as HTMLElement).style.marginTop = '26px';
      const stats = h('div', 'stats');
      const rows: [string, string][] = [
        [tr('Tiempo de juego', 'Time played'), formatTime(st.timePlayed)],
        [tr('Masa máxima', 'Highest mass'), formatSolar(st.maxMass) + ' M☉'],
        [tr('Partículas absorbidas', 'Particles absorbed'), formatBig(st.particles)],
        [tr('Estrellas absorbidas', 'Stars absorbed'), formatBig(st.starsDevoured)],
        [tr('Cuerpos capturados', 'Bodies captured'), formatBig(st.captures)],
        [tr('Fusiones de agujeros negros', 'Black hole mergers'), formatBig(st.bhMerged)],
        [tr('Supernovas', 'Supernovae'), formatBig(st.supernovae)],
        [tr('Fusiones perfectas', 'Perfect fusions'), formatBig(st.perfectHits)],
        [tr('Tiempo con chorros', 'Time with jets'), formatTime(st.jetSeconds)],
        [tr('Universos completados', 'Universes completed'), formatBig(st.runsCompleted)],
        [tr('Polvo estelar reunido', 'Stardust gathered'), formatBig(st.stardust)],
        [tr('Pomodoros completados', 'Pomodoros completed'), formatBig(st.pomodoros)],
        [tr('Minutos de foco', 'Focus minutes'), formatBig(st.focusMinutes)],
      ];
      stats.innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
      p.appendChild(stats);
      this.actions(p, [[tr('Volver', 'Back'), () => this.close()]]);
    });
  }

  openEnding(mass: number, time: number, reward: { created: boolean; bonus: number }, onSandbox: () => void, onTitle: () => void) {
    this.screen('ending', (p) => {
      const unlock = reward.created
        ? tr(
            '<b>Se abrió el modo libre.</b> Tu galaxia te espera para que la llenes de estrellas especiales y nebulosas. Puedes volver a ella cuando quieras desde el menú principal.',
            '<b>Free mode unlocked.</b> Your galaxy is waiting for you to fill it with special stars and nebulae. You can return to it anytime from the main menu.',
          )
        : tr(
            `Tu galaxia del modo libre recibe <b>+${formatBig(reward.bonus)} ✦</b> de polvo estelar por este nuevo universo.`,
            `Your free-mode galaxy receives <b>+${formatBig(reward.bonus)} ✦</b> stardust for this new universe.`,
          );
      p.appendChild(h('div', 'label', tr('Fin del viaje… por ahora', 'The end of the journey… for now')));
      p.appendChild(h('h2', '', tr('Eres el corazón de una galaxia', 'You are the heart of a galaxy')));
      p.appendChild(
        h(
          'div',
          'codex-body',
          tr(
            `Empezaste como un puñado de átomos flotando en la oscuridad. Hoy reúnes <b>${formatSolar(mass)}</b> masas solares, y decenas de miles de millones de estrellas giran a tu alrededor. Gracias por acompañar a este pequeño universo hasta aquí.<br/><br/>Duración del viaje: <b>${formatTime(time)}</b>.<div class="game">Y esta galaxia es solo una entre un billón, cada una con su propia historia.</div>`,
            `You began as a handful of atoms drifting in the dark. Today you hold <b>${formatSolar(mass)}</b> solar masses, and tens of billions of stars turn around you. Thank you for carrying this little universe all the way here.<br/><br/>Journey time: <b>${formatTime(time)}</b>.<div class="game">And this galaxy is just one among a trillion, each with its own story.</div>`,
          ) + `<div class="game">${unlock}</div>`,
        ),
      );
      this.actions(p, [
        [tr('Ir al modo libre', 'Go to free mode'), () => {
          this.close();
          onSandbox();
        }],
        [tr('Volver al menú', 'Back to menu'), () => {
          this.closeAll();
          onTitle();
        }],
      ]);
    });
  }

  /** Free-mode briefing: shown the first time and from the "?" button. */
  openSandboxBriefing(touch: boolean) {
    this.screen(
      'briefing',
      (p) => {
        const click = touch ? tr('TOCA una nube', 'TAP a cloud') : tr('CLIC en una nube, o ESPACIO', 'CLICK a cloud, or SPACE');
        const jets = touch ? tr('el botón 2', 'button 2') : tr('CLIC DERECHO', 'RIGHT CLICK');
        const shop = touch ? tr('el botón <b>✦ Tienda</b>', 'the <b>✦ Shop</b> button') : tr('<b>T</b> o el botón <b>✦ Tienda</b>', '<b>T</b> or the <b>✦ Shop</b> button');
        p.classList.add('briefing');
        p.appendChild(h('div', 'label', tr('MODO LIBRE', 'FREE MODE')));
        p.appendChild(h('h2', '', tr('Tu galaxia', 'Your galaxy')));
        p.appendChild(h('div', 'brief-feel', tr('“Ahora tengo todo el tiempo del mundo para cuidarla.”', '“Now I have all the time in the world to tend to it.”')));
        p.appendChild(
          h(
            'div',
            'brief-goal',
            tr(
              `<div class="label">Sin prisa, sin metas</div><div>Reúne <b>polvo estelar ✦</b> y úsalo en la tienda para llenar tu galaxia de estrellas especiales y nebulosas, y para cambiar su forma y sus colores.</div>`,
              `<div class="label">No rush, no goals</div><div>Gather <b>stardust ✦</b> and spend it in the shop to fill your galaxy with special stars and nebulae, and to change its shape and colors.</div>`,
            ),
          ),
        );
        p.appendChild(h('div', 'label', tr('Cómo funciona', 'How it works')));
        p.appendChild(
          h(
            'ul',
            'brief-how',
            [
              tr(
                '<b>Producción pasiva:</b> tu galaxia genera ✦ por sí sola, incluso mientras no juegas. Cada estrella especial aumenta la producción, y las nebulosas la multiplican.',
                "<b>Passive production:</b> your galaxy makes ✦ on its own, even while you're away. Every special star adds to production, and nebulae multiply it.",
              ),
              tr(
                `<b>Atrae nubes</b> (${click}): cada una te da ✦ al instante. Cuando el cuásar se cargue, libera su energía con los <b>chorros</b> (${jets}) y obtendrás todavía más.`,
                `<b>Draw in clouds</b> (${click}): each one gives you ✦ right away. When the quasar is charged, release its energy through the <b>jets</b> (${jets}) for even more.`,
              ),
              tr(
                `Los <b>cúmulos globulares</b> que caen hacia el centro también dan ✦: ${touch ? 'tócalos' : 'haz clic sobre ellos'} para acelerarlos.`,
                `<b>Globular clusters</b> drifting toward the center also give ✦: ${touch ? 'tap' : 'click'} them to speed them up.`,
              ),
              tr(
                '<b>Tu galaxia crece:</b> lo que inviertes en estrellas y nebulosas sube su <b>nivel</b>. Se vuelve más grande, con más estrellas y más zoom (aléjate con la rueda), y gana un +5% de producción por nivel.',
                '<b>Your galaxy grows:</b> what you invest in stars and nebulae raises its <b>level</b>. It gets bigger, with more stars and more zoom (scroll out with the wheel), and gains +5% production per level.',
              ),
              tr(
                `Abre la tienda con ${shop}. Un consejo: no consumas todo el gas; con la <b>formación estelar</b> alta, produces más.`,
                `Open the shop with ${shop}. A tip: don't use up all the gas; with high <b>star formation</b>, you produce more.`,
              ),
              tr(
                `<b>Observatorio</b> (${touch ? 'botón ◎' : 'tecla O'}): seis minijuegos que se desbloquean a medida que tu galaxia crece, con récords, estrellas ★ y mucho polvo estelar. Cada partida usa una carga de energía ◆, que se recarga sola.`,
                `<b>Observatory</b> (${touch ? '◎ button' : 'O key'}): six minigames that unlock as your galaxy grows, with records, ★ stars and plenty of stardust. Each game uses one ◆ energy charge, which refills on its own.`,
              ),
            ]
              .map((x) => `<li>${x}</li>`)
              .join(''),
          ),
        );
        this.actions(p, [[tr('¡A disfrutar!', 'Enjoy!'), () => this.close()]]);
        (p.querySelector('.actions .btn') as HTMLElement)?.focus({ preventScroll: true });
      },
      true,
    );
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
    this.pBtn = h('div', 'tb p interactive', tr('Pulso', 'Pulse'));
    this.sBtn = h('div', 'tb s interactive', tr('Chorros', 'Jets'));
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
