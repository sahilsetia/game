// All game sounds are synthesized with the Web Audio API — no audio files needed.

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.12, when = 0) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + when;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** short white-noise burst — the "cracker" */
function crack(when = 0, dur = 0.22, gain = 0.25) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + when;
  const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(g).connect(c.destination);
  src.start(t0);
}

/** one tick per movement step */
export function playStep() {
  tone(760, 0.055, 'square', 0.045);
}

/** dice thrown */
export function playDice() {
  crack(0, 0.08, 0.08);
  tone(320, 0.07, 'triangle', 0.1, 0.02);
  tone(430, 0.07, 'triangle', 0.09, 0.09);
}

/** property bought — cracker burst 🎉 */
export function playBuy() {
  crack(0, 0.25, 0.3);
  crack(0.12, 0.18, 0.2);
  tone(880, 0.12, 'sawtooth', 0.09, 0.05);
  tone(1174, 0.14, 'sawtooth', 0.08, 0.16);
  tone(1568, 0.18, 'sine', 0.1, 0.26);
}

/** house / hotel built — rising hammer chime */
export function playBuild() {
  tone(523, 0.09, 'square', 0.1, 0);
  tone(659, 0.09, 'square', 0.1, 0.1);
  tone(784, 0.14, 'square', 0.12, 0.2);
}

/** 3 of a color completed — fanfare */
export function playSet() {
  crack(0, 0.3, 0.32);
  crack(0.18, 0.25, 0.22);
  [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.22, 'triangle', 0.14, i * 0.11));
  tone(1568, 0.4, 'triangle', 0.16, 0.55);
}

/** landed in jail */
export function playJail() {
  tone(220, 0.25, 'sawtooth', 0.12, 0);
  tone(174, 0.35, 'sawtooth', 0.12, 0.2);
}

/** property sold back to the bank — descending tone */
export function playSell() {
  tone(660, 0.12, 'triangle', 0.12, 0);
  tone(494, 0.14, 'triangle', 0.12, 0.12);
  tone(392, 0.2, 'triangle', 0.12, 0.26);
}

/** money received (START bonus, prizes) */
export function playCoin() {
  tone(988, 0.08, 'sine', 0.12, 0);
  tone(1319, 0.16, 'sine', 0.12, 0.07);
}
