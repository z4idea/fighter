import './style.css';
import { Arena } from './game/arena';
import { Combat, type HitEvent } from './game/combat';
import { loadCharacter } from './game/fighter';
import { Sound } from './game/sound';
import { Input } from './input';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <canvas id="arena" aria-label="三维格斗训练场"></canvas>
  <header class="masthead">
    <a class="brand" href="#" aria-label="蓝色先锋训练场"><span class="brand-mark">V</span><span>BLUE VANGUARD<small>蓝色先锋 / 训练场 01</small></span></a>
    <div class="utilities"><span class="live"><i></i>本地训练场</span><button id="sound" aria-pressed="true">声音 开</button><button id="pause" disabled>暂停 <kbd>P</kbd></button></div>
  </header>
  <section class="scoreboard" aria-label="对战状态">
    <div class="fighter-hud player"><div class="fighter-label"><span><b>01</b> 蓝色先锋</span><small>玩家 · YOU</small></div><div class="health-track"><div id="player-health" class="health-fill"></div></div><div class="health-meta"><span id="player-action">准备就绪</span><span id="player-hp">100 / 100</span></div></div>
    <div class="round"><small>ROUND 01</small><strong id="timer">60</strong><span id="round-label">自由对练</span></div>
    <div class="fighter-hud opponent"><div class="fighter-label"><span><b>02</b> 镜像对手</span><small>训练 AI · CPU</small></div><div class="health-track"><div id="opponent-health" class="health-fill"></div></div><div class="health-meta"><span id="opponent-hp">100 / 100</span><span id="opponent-action">准备就绪</span></div></div>
  </section>
  <div class="arena-caption"><span>ROOFTOP / 17:42</span><span>落日训练平台</span></div>
  <div id="hit-message" class="hit-message" aria-live="polite"></div>
  <section id="intro" class="intro panel-visible" aria-label="开始训练">
    <div class="intro-copy"><span class="eyebrow">你的第一个回合</span><h1>准备好，<em>出手。</em></h1><p>靠近对手，找到距离。<br>从一记直拳开始。</p></div>
    <div class="start-controls"><div class="mode-switch" aria-label="训练模式"><button data-mode="sparring" class="selected" aria-pressed="true">自由对练</button><button data-mode="dummy" aria-pressed="false">木桩练习</button></div><button id="start" class="primary" disabled>角色载入中 <span>↗</span></button><small>原创角色 · 实时 3D · 本地素材</small></div>
  </section>
  <section id="pause-panel" class="center-panel" hidden><span class="eyebrow">TAKE A BREATH</span><h2>训练已暂停</h2><p>按 P 或点击按钮继续</p><button id="resume" class="primary">继续训练 <span>→</span></button></section>
  <section id="result-panel" class="center-panel" hidden><span class="eyebrow">ROUND COMPLETE</span><h2 id="result-title">回合结束</h2><p id="result-detail"></p><button id="again" class="primary">再练一局 <span>↗</span></button><button id="back" class="text-button">返回训练选择</button></section>
  <div id="loading" class="loading"><div class="loading-mark">V</div><span id="loading-text">正在载入角色素材</span><div class="load-track"><i id="load-fill"></i></div><small>本地模型 / 骨骼 / 5 个动作</small></div>
  <div id="error" class="center-panel error-panel" hidden><span class="eyebrow">载入未完成</span><h2>训练场暂时无法打开</h2><p id="error-detail"></p><button id="retry" class="primary">重新载入 <span>↗</span></button></div>
  <footer class="bottom-bar"><div class="key-guide"><span><kbd>A</kbd><kbd>D</kbd> 移动</span><span><kbd>Shift</kbd> 跑步</span><span><kbd>J</kbd> 出拳</span><span><kbd>K</kbd> 踢腿</span><span><kbd>L</kbd> 防御</span><span><kbd>Space</kbd> 冲刺</span></div><button id="restart" class="text-button" disabled>重开 <kbd>R</kbd> <span>↺</span></button></footer>
  <div class="touch-controls" aria-label="触屏操作"><div><button data-key="KeyA" aria-label="向左移动">←</button><button data-key="KeyD" aria-label="向右移动">→</button><button data-key="Space">冲刺</button></div><div><button data-key="KeyL">防御</button><button data-key="KeyJ">出拳</button><button data-key="KeyK">踢腿</button></div></div>
`;
const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const game = new Combat();
const sound = new Sound();
let arena: Arena | null = null;
let ready = false;
let lastPhase = game.phase;
let hitMessageTime = 0;
const motions = { idle: '保持距离', walk: '移动', run: '跑步', dash: '冲刺', guard: '防御', hit: '受击', down: '倒地', punch: '右直拳', kick: '右直踢' };

function begin() {
  if (!ready || !arena) return;
  input.clear();
  game.start();
  arena.reset();
  sound.unlock();
  element('intro').hidden = true;
  element('pause-panel').hidden = true;
  element('result-panel').hidden = true;
  element('hit-message').textContent = '';
  hitMessageTime = 0;
  element<HTMLButtonElement>('pause').disabled = false;
  element<HTMLButtonElement>('restart').disabled = false;
  updatePhase();
  (document.activeElement as HTMLElement | null)?.blur();
}
function togglePause() {
  if (game.phase === 'playing') game.pause();
  else if (game.phase === 'paused') game.resume();
  input.clear();
  updatePhase();
}
const input = new Input(command => command === 'pause' ? togglePause() : begin());
element('start').addEventListener('click', begin);
element('again').addEventListener('click', begin);
element('restart').addEventListener('click', begin);
element('pause').addEventListener('click', togglePause);
element('resume').addEventListener('click', togglePause);
element('sound').addEventListener('click', () => {
  sound.enabled = !sound.enabled;
  if (sound.enabled) sound.unlock();
  element('sound').textContent = `声音 ${sound.enabled ? '开' : '关'}`;
  element('sound').setAttribute('aria-pressed', String(sound.enabled));
});
element('back').addEventListener('click', () => {
  game.start();
  game.phase = 'ready';
  input.clear();
  arena?.reset();
  element('result-panel').hidden = true;
  element('intro').hidden = false;
  element<HTMLButtonElement>('pause').disabled = true;
  element<HTMLButtonElement>('restart').disabled = true;
  element('hit-message').textContent = '';
});
element('retry').addEventListener('click', () => window.location.reload());
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => {
  button.addEventListener('click', () => {
    game.mode = button.dataset.mode as typeof game.mode;
    document.querySelectorAll('[data-mode]').forEach(b => { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', String(b === button)); });
    element('round-label').textContent = game.mode === 'dummy' ? '木桩练习' : '自由对练';
    document.querySelector('.opponent .fighter-label small')!.textContent = game.mode === 'dummy' ? '静止木桩 · DUMMY' : '训练 AI · CPU';
  });
});
window.addEventListener('blur', () => { game.pause(); updatePhase(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { game.pause(); input.clear(); updatePhase(); } });
window.addEventListener('resize', () => arena?.resize());

function updatePhase() {
  element('pause-panel').hidden = game.phase !== 'paused';
  element('pause').innerHTML = `${game.phase === 'paused' ? '继续' : '暂停'} <kbd>P</kbd>`;
  if (game.phase === 'ended') {
    element('result-panel').hidden = false;
    element('result-title').textContent = game.result === 'win' ? '漂亮的一局。' : game.result === 'lose' ? '再来，找到节奏。' : '势均力敌。';
    element('result-detail').textContent = `${game.result === 'win' ? '你赢得了本回合' : game.result === 'lose' ? '对手赢得了本回合' : '本回合平局'} · 有效命中 ${game.landed} 次`;
    element<HTMLButtonElement>('pause').disabled = true;
    input.clear();
  }
  lastPhase = game.phase;
}

function updateHud(dt: number) {
  const [player, opponent] = game.fighters;
  element('player-health').style.width = `${player.hp}%`;
  element('opponent-health').style.width = `${opponent.hp}%`;
  element('player-hp').textContent = `${Math.ceil(player.hp)} / 100`;
  element('opponent-hp').textContent = `${Math.ceil(opponent.hp)} / 100`;
  element('player-action').textContent = motions[player.motion];
  element('opponent-action').textContent = motions[opponent.motion];
  element('timer').textContent = String(Math.ceil(game.remaining)).padStart(2, '0');
  element('timer').classList.toggle('urgent', game.remaining < 10);
  for (const hit of game.events) {
    sound.hit(hit.blocked, hit.kind === 'kick');
    element('hit-message').textContent = hit.blocked ? '格挡' : `${hit.attacker === 0 ? '命中' : '受击'} / ${hit.kind === 'kick' ? '右直踢' : '右直拳'} −${hit.damage}`;
    element('hit-message').classList.toggle('enemy-hit', hit.attacker !== 0);
    hitMessageTime = 0.9;
  }
  hitMessageTime = Math.max(0, hitMessageTime - dt);
  element('hit-message').classList.toggle('visible', hitMessageTime > 0);
  if (lastPhase !== game.phase) updatePhase();
}

async function init() {
  try {
    const gltf = await loadCharacter(percent => {
      element('load-fill').style.width = `${percent}%`;
      element('loading-text').textContent = `正在载入角色素材 · ${percent}%`;
    });
    element('loading-text').textContent = '正在准备训练场';
    arena = new Arena(element<HTMLCanvasElement>('arena'), gltf);
    ready = true;
    element('loading').hidden = true;
    element<HTMLButtonElement>('start').disabled = false;
    element('start').innerHTML = '开始训练 <span>↗</span>';
    element<HTMLCanvasElement>('arena').addEventListener('webglcontextlost', event => {
      event.preventDefault();
      game.pause();
      showError('图形设备连接中断。请重新载入训练场。');
    });
    let previous = performance.now();
    const frame = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.2);
      previous = now;
      const controls = input.sample();
      const hits: HitEvent[] = [];
      let simulationTime = dt;
      let animationTime = 0;
      let first = true;
      // Substeps preserve strike windows on slower devices without repeating presses.
      while (simulationTime > 0.00001) {
        const step = Math.min(simulationTime, 1 / 60);
        game.update(step, first ? controls : { ...controls, punch: false, kick: false, dash: false });
        hits.push(...game.events);
        if (!game.frozen) animationTime += step;
        simulationTime -= step;
        first = false;
      }
      game.events = hits;
      arena!.update(dt, game, animationTime);
      updateHud(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  } catch (error) {
    console.error(error);
    showError('请使用 npm run dev 启动项目，并确认浏览器支持 WebGL。角色文件需要通过本地服务器读取。');
  }
}
function showError(message: string) {
  ready = false;
  element('loading').hidden = true;
  element('intro').hidden = true;
  element('error').hidden = false;
  element('error-detail').textContent = message;
}
void init();
