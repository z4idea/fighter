export class Sound {
  enabled = true;
  private context: AudioContext | null = null;

  unlock() {
    if (!this.context) this.context = new AudioContext();
    void this.context.resume().catch(() => {});
  }

  hit(blocked: boolean, heavy: boolean) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const ctx = this.context;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = blocked ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(blocked ? 620 : heavy ? 150 : 220, now);
    oscillator.frequency.exponentialRampToValueAtTime(blocked ? 160 : 42, now + 0.12);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.15);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
}
