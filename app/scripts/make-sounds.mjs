// Writes the game's sounds to assets/sounds as small mono WAVs, drawn from
// plain tones and noise so there's nothing to license. Rerun after a change:
//   node app/scripts/make-sounds.mjs

import { Buffer } from "node:buffer";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RATE = 22050;
const out = join(dirname(fileURLToPath(import.meta.url)), "../assets/sounds");

// A bell-ish note: a sine with a little of its octave and twelfth, struck and
// left to ring out.
function note(freq, start, length, gain = 1) {
  return { freq, start, length, gain };
}

function render(seconds, notes, extra = () => 0) {
  const samples = new Float64Array(Math.round(seconds * RATE));
  for (let i = 0; i < samples.length; i++) {
    const t = i / RATE;
    let v = extra(t);
    for (const n of notes) {
      const u = t - n.start;
      if (u < 0 || u > n.length) continue;
      const attack = Math.min(1, u / 0.005);
      const decay = Math.exp((-4 * u) / n.length);
      const w = 2 * Math.PI * n.freq * u;
      v +=
        n.gain *
        attack *
        decay *
        (Math.sin(w) + 0.3 * Math.sin(2 * w) + 0.1 * Math.sin(3 * w));
    }
    samples[i] = v;
  }
  return samples;
}

// Seeded noise, so the files come out the same every run.
function noise(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return (s / 2 ** 32) * 2 - 1;
  };
}

function wav(samples, peak = 0.7) {
  const max = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => {
    // A short fade at the end so nothing clicks.
    const tail = Math.min(1, (samples.length - i) / (RATE * 0.01));
    data.writeInt16LE(Math.round((v / max) * peak * tail * 32767), i * 2);
  });
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// A slip pulled from the hat: a soft papery swish that rises a little.
function slip() {
  const rand = noise(7);
  let low = 0;
  return render(0.22, [note(880, 0.04, 0.18, 0.15)], (t) => {
    // Noise run through a one-pole filter that opens up as the slip moves.
    const k = 0.15 + 0.5 * (t / 0.22);
    low += k * (rand() - low);
    const swell = Math.sin(Math.PI * Math.min(1, t / 0.22));
    return low * swell * 1.5;
  });
}

// A right guess: two quick rising notes.
function correct() {
  return render(0.6, [note(659.25, 0, 0.35), note(987.77, 0.09, 0.5)]);
}

// Time's up: two low notes falling, short enough not to nag.
function timeUp() {
  return render(0.6, [note(392, 0, 0.3), note(261.63, 0.16, 0.42)], (t) => {
    // A touch of square-ish edge on top, so it reads as a buzzer, not a bell.
    const f = t < 0.16 ? 392 : 261.63;
    return 0.12 * Math.sign(Math.sin(2 * Math.PI * f * t)) * Math.exp(-6 * t);
  });
}

// The winners: a little climb up a major chord, held at the top.
function winners() {
  return render(1.4, [
    note(523.25, 0, 0.3),
    note(659.25, 0.11, 0.3),
    note(783.99, 0.22, 0.3),
    note(1046.5, 0.33, 1.0),
    note(783.99, 0.33, 1.0, 0.5),
    note(659.25, 0.33, 1.0, 0.4),
  ]);
}

mkdirSync(out, { recursive: true });
for (const [name, samples, peak] of [
  ["slip", slip(), 0.5],
  ["correct", correct(), 0.7],
  ["time-up", timeUp(), 0.6],
  ["winners", winners(), 0.7],
]) {
  writeFileSync(join(out, `${name}.wav`), wav(samples, peak));
  console.log(`${name}.wav`);
}
