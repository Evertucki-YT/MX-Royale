// Motor de audio sintetizado con Web Audio API (sin archivos externos)
export class Sound {
  ctx: AudioContext | null = null;
  master!: GainNode;
  musicGain!: GainNode;
  sfxGain!: GainNode;
  noiseBuf!: AudioBuffer;
  muted = false;
  bpm = 140;
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private mode: "off" | "menu" | "combat" = "off";
  private lastStorm = 0;

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = c.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(c.destination);
    this.musicGain = c.createGain();
    this.musicGain.gain.value = 0.32;
    this.musicGain.connect(this.master);
    this.sfxGain = c.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);
    const len = c.sampleRate * 1;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  // ---------- helpers ----------
  private osc(type: OscillatorType, f0: number, f1: number, t: number, dur: number, vol: number, dest: AudioNode) {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(t: number, dur: number, vol: number, dest: AudioNode, ftype: BiquadFilterType, freq: number, q = 1) {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = ftype;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  // ---------- SFX ----------
  shot(kind: string, vol = 1) {
    if (!this.ctx || vol < 0.02) return;
    const t = this.ctx.currentTime;
    const d = this.sfxGain;
    const v = vol * 0.8;
    switch (kind) {
      case "shotgun":
        this.noise(t, 0.35, v, d, "lowpass", 1800);
        this.osc("sine", 160, 40, t, 0.3, v, d);
        break;
      case "sniper":
        this.noise(t, 0.6, v, d, "lowpass", 3000);
        this.osc("sine", 220, 30, t, 0.6, v * 1.2, d);
        this.osc("sawtooth", 900, 100, t, 0.15, v * 0.3, d);
        break;
      case "smg":
        this.noise(t, 0.07, v * 0.8, d, "bandpass", 2600, 0.8);
        this.osc("square", 300, 90, t, 0.06, v * 0.25, d);
        break;
      case "pistol":
        this.noise(t, 0.12, v * 0.9, d, "bandpass", 1800, 0.8);
        this.osc("square", 400, 80, t, 0.1, v * 0.3, d);
        break;
      default:
        this.noise(t, 0.12, v, d, "bandpass", 1500, 0.7);
        this.osc("sawtooth", 260, 60, t, 0.1, v * 0.35, d);
    }
  }
  chest() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.osc("triangle", f, f, t + i * 0.07, 0.35, 0.25, this.sfxGain));
    this.noise(t, 0.2, 0.2, this.sfxGain, "highpass", 4000);
  }
  drink() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) this.osc("sine", 300 + i * 40, 500 + i * 60, t + i * 0.3, 0.2, 0.15, this.sfxGain);
  }
  drinkDone() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [600, 900, 1200].forEach((f, i) => this.osc("sine", f, f * 1.2, t + i * 0.08, 0.3, 0.25, this.sfxGain));
  }
  hitmarker(kill = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.osc("square", kill ? 700 : 1500, kill ? 300 : 900, t, 0.08, 0.25, this.sfxGain);
    if (kill) this.osc("sawtooth", 200, 80, t, 0.25, 0.3, this.sfxGain);
  }
  hurt() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.osc("sawtooth", 180, 60, t, 0.18, 0.3, this.sfxGain);
  }
  pickup() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.osc("triangle", 700, 1400, t, 0.12, 0.25, this.sfxGain);
  }
  build() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.15, 0.4, this.sfxGain, "lowpass", 600);
    this.osc("square", 120, 60, t, 0.12, 0.3, this.sfxGain);
  }
  reload() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.osc("square", 800, 500, t, 0.05, 0.15, this.sfxGain);
    this.osc("square", 500, 900, t + 0.4, 0.06, 0.15, this.sfxGain);
  }
  stormTick() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastStorm < 0.9) return;
    this.lastStorm = now;
    this.osc("sawtooth", 90, 60, now, 0.5, 0.25, this.sfxGain);
    this.osc("sawtooth", 95, 62, now, 0.5, 0.25, this.sfxGain);
  }
  stormWarn() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      this.osc("square", 880, 880, t + i * 0.25, 0.15, 0.2, this.sfxGain);
      this.osc("square", 660, 660, t + i * 0.25 + 0.12, 0.12, 0.2, this.sfxGain);
    }
  }
  jingle(win: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = win ? [523, 659, 784, 1047, 784, 1047, 1319] : [440, 392, 330, 262];
    notes.forEach((f, i) => this.osc(win ? "square" : "triangle", f, f, t + i * 0.14, 0.3, 0.22, this.sfxGain));
  }

  // ---------- MÚSICA ----------
  startMusic(mode: "menu" | "combat") {
    if (!this.ctx) return;
    this.mode = mode;
    this.bpm = mode === "menu" ? 112 : 142;
    if (this.timer !== null) return;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 40);
  }
  stopMusic() {
    this.mode = "off";
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
  setIntensity(level: number) {
    // 0 normal, 1 pocos jugadores, 2 círculo final
    if (this.mode === "combat") this.bpm = 142 + level * 14;
  }

  private schedule() {
    const c = this.ctx;
    if (!c || this.mode === "off") return;
    const stepDur = 60 / this.bpm / 4;
    while (this.nextTime < c.currentTime + 0.15) {
      this.playStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(s: number, t: number, sd: number) {
    const m = this.musicGain;
    const bar = Math.floor(s / 16) % 4;
    const st = s % 16;
    const roots = [220, 174.61, 261.63, 196]; // Am F C G
    const chords = [
      [0, 3, 7, 12],
      [0, 4, 7, 12],
      [0, 4, 7, 12],
      [0, 4, 7, 11],
    ];
    const root = roots[bar];
    const f = (semi: number, oct = 1) => root * Math.pow(2, semi / 12) * oct;
    const combat = this.mode === "combat";
    // Bombo
    if (st % 4 === 0 || (combat && st === 14)) {
      this.osc("sine", 150, 40, t, 0.18, 0.9, m);
    }
    // Snare
    if (st === 4 || st === 12) {
      this.noise(t, 0.12, 0.45, m, "bandpass", 1900, 0.6);
      this.osc("triangle", 220, 120, t, 0.08, 0.3, m);
    }
    // Hi-hat
    if (st % 2 === 0 || combat) this.noise(t, 0.03, st % 4 === 2 ? 0.28 : 0.14, m, "highpass", 7500);
    // Bajo (octava abajo)
    if (st % 2 === 0 || (combat && st % 4 === 3)) {
      const semi = st % 8 === 6 ? 7 : st % 8 === 4 ? 12 : 0;
      this.osc("sawtooth", f(semi, 0.5), f(semi, 0.5), t, sd * 1.8, 0.28, m);
    }
    // Arpegio
    const arp = chords[bar];
    const idx = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 1, 2][st];
    if (combat || st % 2 === 0) this.osc("square", f(arp[idx], 2), f(arp[idx], 2), t, sd * 0.9, 0.09, m);
    // Lead en combate
    if (combat && (bar % 2 === 1 || bar === 2) && [0, 3, 6, 8, 11, 14].includes(st)) {
      const semi = [12, 15, 14, 12, 10, 7][[0, 3, 6, 8, 11, 14].indexOf(st)];
      this.osc("sawtooth", f(semi, 2), f(semi, 2), t, sd * 2, 0.07, m);
    }
  }
}

export const sound = new Sound();
