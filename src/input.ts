import type { Controls } from './game/combat';

const GAME_KEYS = new Set(['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'KeyJ', 'KeyK', 'KeyL', 'Space', 'ShiftLeft', 'ShiftRight']);
export class Input {
  private held = new Set<string>();
  private pressed = new Set<string>();
  private pointers = new Map<number, string>();

  constructor(onCommand: (command: 'pause' | 'restart') => void) {
    window.addEventListener('keydown', event => {
      if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement) return;
      if (GAME_KEYS.has(event.code)) event.preventDefault();
      if (!event.repeat) {
        this.pressed.add(event.code);
        if (event.code === 'KeyP' || event.code === 'Escape') onCommand('pause');
        if (event.code === 'KeyR') onCommand('restart');
      }
      this.held.add(event.code);
    });
    window.addEventListener('keyup', event => this.held.delete(event.code));
    window.addEventListener('blur', () => this.clear());
    document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(button => {
      button.addEventListener('pointerdown', event => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        const key = button.dataset.key!;
        this.pointers.set(event.pointerId, key);
        this.pressed.add(key);
        this.held.add(key);
        button.classList.add('held');
      });
      const release = (event: PointerEvent) => {
        const key = this.pointers.get(event.pointerId);
        this.pointers.delete(event.pointerId);
        if (key && ![...this.pointers.values()].includes(key)) this.held.delete(key);
        button.classList.remove('held');
      };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    });
  }

  sample(): Controls {
    const controls: Controls = {
      move: Number(this.held.has('KeyD') || this.held.has('ArrowRight')) - Number(this.held.has('KeyA') || this.held.has('ArrowLeft')),
      run: this.held.has('ShiftLeft') || this.held.has('ShiftRight'),
      guard: this.held.has('KeyL'),
      punch: this.pressed.has('KeyJ'),
      kick: this.pressed.has('KeyK'),
      dash: this.pressed.has('Space'),
    };
    this.pressed.clear();
    return controls;
  }

  clear() {
    this.held.clear();
    this.pressed.clear();
    this.pointers.clear();
    document.querySelectorAll('.held').forEach(element => element.classList.remove('held'));
  }
}
