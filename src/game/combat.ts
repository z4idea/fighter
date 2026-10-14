export interface Controls {
  move: number;
  run: boolean;
  guard: boolean;
  punch: boolean;
  kick: boolean;
  dash: boolean;
}
export type AttackKind = 'punch' | 'kick';
export type Motion = 'idle' | 'walk' | 'run' | 'dash' | 'guard' | 'hit' | 'down' | AttackKind;
export interface FighterState {
  x: number;
  hp: number;
  facing: 1 | -1;
  motion: Motion;
  guard: boolean;
  attack: { kind: AttackKind; elapsed: number; resolved: boolean; id: number } | null;
  stun: number;
  flash: number;
  velocity: number;
  dashTime: number;
  dashCooldown: number;
}
export interface HitEvent {
  attacker: number;
  target: number;
  x: number;
  kind: AttackKind;
  blocked: boolean;
  damage: number;
}
export const ATTACKS = {
  punch: { duration: 0.72, impact: 0.23, range: 1.15, damage: 8 },
  kick: { duration: 0.9, impact: 0.44, range: 1.65, damage: 14 },
} as const;
const NEUTRAL: Controls = { move: 0, run: false, guard: false, punch: false, kick: false, dash: false };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
function fighter(x: number, facing: 1 | -1): FighterState {
  return { x, facing, hp: 100, motion: 'idle', guard: false, attack: null, stun: 0, flash: 0, velocity: 0, dashTime: 0, dashCooldown: 0 };
}

export class Combat {
  mode: 'sparring' | 'dummy' = 'sparring';
  fighters: [FighterState, FighterState] = [fighter(-1.65, 1), fighter(1.65, -1)];
  phase: 'ready' | 'playing' | 'paused' | 'ended' = 'ready';
  remaining = 60;
  result: 'win' | 'lose' | 'draw' | null = null;
  events: HitEvent[] = [];
  hitstop = 0;
  frozen = false;
  landed = 0;
  private serial = 0;
  private aiTime = 0;
  private aiNext = 1.2;
  private aiAttacks = 0;

  start() {
    this.fighters = [fighter(-1.65, 1), fighter(1.65, -1)];
    this.phase = 'playing';
    this.remaining = 60;
    this.result = null;
    this.events = [];
    this.hitstop = this.landed = this.aiTime = this.aiAttacks = 0;
    this.aiNext = 1.2;
    this.frozen = false;
  }
  pause() { if (this.phase === 'playing') this.phase = 'paused'; }
  resume() { if (this.phase === 'paused') this.phase = 'playing'; }

  update(seconds: number, input: Controls) {
    this.events = [];
    this.frozen = this.phase === 'paused' || this.phase === 'ended';
    if (this.phase !== 'playing' || !Number.isFinite(seconds) || seconds <= 0) return;
    const dt = Math.min(seconds, 0.05);
    if (this.hitstop > 0) {
      this.hitstop = Math.max(0, this.hitstop - dt);
      this.frozen = true;
      return;
    }
    this.remaining = Math.max(0, this.remaining - dt);
    this.aiTime += dt;
    const enemyInput = this.aiInput();
    this.control(this.fighters[0], this.fighters[1], input, dt);
    if (this.mode === 'sparring') this.control(this.fighters[1], this.fighters[0], enemyInput, dt);
    else this.control(this.fighters[1], this.fighters[0], { ...NEUTRAL, guard: this.fighters[1].guard }, dt);

    // Collect both strikes before applying damage, so simultaneous hits can trade.
    for (let i = 0; i < 2; i++) {
      const attacker = this.fighters[i];
      const defender = this.fighters[1 - i];
      const attack = attacker.attack;
      if (!attack) continue;
      const spec = ATTACKS[attack.kind];
      const previous = attack.elapsed;
      attack.elapsed += dt;
      if (!attack.resolved && previous <= spec.impact && attack.elapsed >= spec.impact) {
        attack.resolved = true;
        const distance = defender.x - attacker.x;
        if (Math.abs(distance) <= spec.range && distance * attacker.facing > 0 && defender.hp > 0) {
          const blocked = defender.guard && defender.facing * distance < 0 && defender.stun <= 0;
          this.events.push({ attacker: i, target: 1 - i, x: defender.x, kind: attack.kind, blocked, damage: spec.damage * (blocked ? 0.2 : 1) });
        }
      }
      if (attack.elapsed >= spec.duration) attacker.attack = null;
    }
    for (const hit of this.events) {
      const target = this.fighters[hit.target];
      target.hp = Math.max(0, Math.round((target.hp - hit.damage) * 10) / 10);
      target.flash = hit.blocked ? 0.1 : 0.22;
      target.velocity = this.fighters[hit.attacker].facing * (hit.blocked ? 0.65 : hit.kind === 'kick' ? 3.3 : 1.9);
      if (!hit.blocked) {
        target.stun = hit.kind === 'kick' ? 0.38 : 0.26;
        target.attack = null;
        target.dashTime = 0;
        target.guard = false;
      }
      if (hit.attacker === 0 && !hit.blocked) this.landed++;
      this.hitstop = hit.blocked ? 0.035 : hit.kind === 'kick' ? 0.075 : 0.05;
    }
    this.separate();
    for (const state of this.fighters) state.motion = this.motion(state);
    if (this.remaining <= 0 || this.fighters.some(s => s.hp <= 0)) {
      const [a, b] = this.fighters;
      this.result = a.hp === b.hp ? 'draw' : a.hp > b.hp ? 'win' : 'lose';
      this.phase = 'ended';
      for (const s of this.fighters) { s.attack = null; s.guard = false; s.motion = s.hp <= 0 ? 'down' : 'idle'; }
    }
  }

  private aiInput(): Controls {
    if (this.mode === 'dummy') return NEUTRAL;
    const [player, enemy] = this.fighters;
    const distance = Math.abs(player.x - enemy.x);
    const intent = { ...NEUTRAL };
    if (distance > 1.05) intent.move = Math.sign(player.x - enemy.x);
    if (this.aiTime >= this.aiNext && distance < 1.6 && !enemy.attack && enemy.stun <= 0) {
      intent[this.aiAttacks++ % 3 === 2 ? 'kick' : 'punch'] = true;
      this.aiNext = this.aiTime + 1.35;
    }
    intent.guard = !!player.attack && this.aiAttacks % 3 === 1 && distance < 1.6;
    return intent;
  }

  private control(s: FighterState, other: FighterState, input: Controls, dt: number) {
    s.stun = Math.max(0, s.stun - dt);
    s.flash = Math.max(0, s.flash - dt);
    s.dashCooldown = Math.max(0, s.dashCooldown - dt);
    s.x += s.velocity * dt;
    s.velocity *= Math.exp(-10 * dt);
    if (!s.attack && s.stun <= 0) s.facing = other.x >= s.x ? 1 : -1;
    if (s.hp <= 0 || s.stun > 0) { s.guard = false; return; }
    s.guard = input.guard && !s.attack && s.dashTime <= 0;
    if (!s.attack && !s.guard && s.dashTime <= 0) {
      if (input.kick || input.punch) s.attack = { kind: input.kick ? 'kick' : 'punch', elapsed: 0, resolved: false, id: ++this.serial };
      else if (input.dash && s.dashCooldown <= 0) { s.dashTime = 0.16; s.dashCooldown = 0.9; }
    }
    if (s.dashTime > 0) {
      s.x += (input.move ? Math.sign(input.move) : s.facing) * 6 * dt;
      s.dashTime = Math.max(0, s.dashTime - dt);
      s.motion = 'dash';
    } else if (!s.attack && !s.guard) {
      s.x += clamp(input.move, -1, 1) * (input.run ? 3.1 : 1.85) * dt;
      s.motion = input.move ? input.run ? 'run' : 'walk' : 'idle';
    }
  }

  private motion(s: FighterState): Motion {
    if (s.hp <= 0) return 'down';
    if (s.stun > 0) return 'hit';
    if (s.attack) return s.attack.kind;
    if (s.guard) return 'guard';
    if (s.dashTime > 0) return 'dash';
    return s.motion === 'walk' || s.motion === 'run' ? s.motion : 'idle';
  }

  private separate() {
    const [a, b] = this.fighters;
    const left = a.x <= b.x ? a : b;
    const right = left === a ? b : a;
    if (right.x - left.x < 0.67) {
      const middle = (right.x + left.x) / 2;
      left.x = middle - 0.335;
      right.x = middle + 0.335;
    }
    left.x = clamp(left.x, -4.8, 4.13);
    right.x = clamp(right.x, left.x + 0.67, 4.8);
  }
}
