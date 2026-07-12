export class CodexSound {
  private context: AudioContext | null = null;
  private enabled = true;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private getContext(): AudioContext | null {
    if (!this.enabled) return null;
    this.context ??= new AudioContext();
    if (this.context.state === "suspended") void this.context.resume();
    return this.context;
  }

  tone(frequency: number, duration: number, type: OscillatorType = "square", gain = 0.035, slide = 0): void {
    const context = this.getContext();
    if (!context) return;
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    const now = context.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency + slide), now + duration);
    volume.gain.setValueAtTime(0.0001, now);
    volume.gain.exponentialRampToValueAtTime(gain, now + 0.008);
    volume.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(volume).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
  }

  attack(kind: "sword" | "spear" | "wand"): void {
    if (kind === "sword") this.tone(180, 0.09, "sawtooth", 0.025, 180);
    else if (kind === "spear") this.tone(130, 0.08, "square", 0.022, 90);
    else this.tone(520, 0.12, "sine", 0.035, 260);
  }

  hit(critical: boolean): void {
    this.tone(critical ? 105 : 145, critical ? 0.15 : 0.08, "square", critical ? 0.055 : 0.035, -45);
  }

  reward(): void {
    this.tone(520, 0.08, "square", 0.025, 120);
    window.setTimeout(() => this.tone(760, 0.12, "square", 0.025, 160), 60);
  }

  levelUp(): void {
    [440, 554, 659, 880].forEach((note, index) => {
      window.setTimeout(() => this.tone(note, 0.18, "square", 0.03, 30), index * 70);
    });
  }

  hurt(): void {
    this.tone(95, 0.16, "sawtooth", 0.045, -35);
  }
}
