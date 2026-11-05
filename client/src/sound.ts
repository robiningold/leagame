// Alle Sounds werden mit der Web Audio API erzeugt, keine Audiodateien nötig.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function audioReady() {
  return !!ctx && ctx.state === 'running';
}

/** Muss einmal durch einen Klick ausgelöst werden (Browser-Regel). */
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, slideTo?: number) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(start: number, dur: number, vol = 0.2, filterFreq = 2000) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + start;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

const notes = (seq: [number, number, number][], type: OscillatorType = 'triangle', vol = 0.25) => seq.forEach(([f, s, d]) => tone(f, s, d, type, vol));

export const sfx = {
  tick: () => tone(1200, 0, 0.06, 'square', 0.12),
  tickHigh: () => tone(1600, 0, 0.08, 'square', 0.18),
  gong: () => {
    [110, 220, 331, 442].forEach((f, i) => tone(f, 0, 1.6 - i * 0.2, 'sine', 0.35 / (i + 1)));
  },
  plop: () => tone(500, 0, 0.12, 'sine', 0.35, 1100),
  join: () => notes([[660, 0, 0.1], [990, 0.08, 0.15]], 'sine', 0.2),
  whoosh: () => noise(0, 0.45, 0.35, 900),
  start: () => notes([[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.25]]),
  double: () => {
    notes([[392, 0, 0.15], [523, 0.12, 0.15], [659, 0.24, 0.15], [784, 0.36, 0.15], [1047, 0.48, 0.6]], 'square', 0.15);
    noise(0.48, 0.5, 0.2, 4000);
  },
  stage: () => {
    tone(300, 0, 0.35, 'sawtooth', 0.12, 900);
    noise(0, 0.3, 0.15, 3000);
  },
  success: () => notes([[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.12], [1047, 0.3, 0.5]], 'triangle', 0.3),
  fail: () => notes([[392, 0, 0.25], [370, 0.22, 0.25], [349, 0.44, 0.25], [330, 0.66, 0.6]], 'sawtooth', 0.12),
  buzzer: () => {
    tone(140, 0, 0.6, 'sawtooth', 0.35);
    tone(147, 0, 0.6, 'square', 0.2);
  },
  steal: () => notes([[880, 0, 0.1], [660, 0.1, 0.1], [880, 0.2, 0.1], [660, 0.3, 0.2]], 'square', 0.12),
  victory: () => {
    const m: [number, number, number][] = [
      [523, 0, 0.18], [523, 0.2, 0.18], [523, 0.4, 0.18], [523, 0.6, 0.5],
      [415, 1.1, 0.45], [466, 1.55, 0.45], [523, 2.0, 0.3], [466, 2.3, 0.15], [523, 2.45, 1.0],
    ];
    notes(m, 'square', 0.12);
    notes(m.map(([f, s, d]) => [f / 2, s, d] as [number, number, number]), 'triangle', 0.18);
  },
  click: () => tone(800, 0, 0.04, 'sine', 0.15),
};
