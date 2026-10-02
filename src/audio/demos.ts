import type { AudioClip, Demo, DemoId } from './types';

const SAMPLE_RATE = 24000;
const DURATION = 12;
const TAU = 2 * Math.PI;

export const DEMOS: Demo[] = [
  {
    id: 'melody',
    name: 'Glasshouse',
    subtitle: 'A melody. An unwelcome whistle.',
    description:
      'Original generated example: a soft, stereo synth phrase with a 3.2 kHz whistle. Reduce the thin bright line to hear the melody underneath.',
    target: { startTime: 0, endTime: DURATION, lowHz: 2900, highHz: 3450 },
  },
  {
    id: 'pulse',
    name: 'Night circuit',
    subtitle: 'Find the hum below the rhythm.',
    description:
      'Original generated example: a drum-machine groove with a constant 120 Hz hum. Reduce the low band while leaving the percussion above it.',
    target: { startTime: 0, endTime: DURATION, lowHz: 92, highHz: 150 },
  },
  {
    id: 'drift',
    name: 'Passing signal',
    subtitle: 'A signal cuts through the atmosphere.',
    description:
      'Original generated example: a slow ambient chord interrupted by rising electronic chirps. Select the high-frequency sweep to soften it or isolate it.',
    target: { startTime: 3.6, endTime: 8.4, lowHz: 3500, highHz: 8500 },
  },
];

function fade(time: number): number {
  return Math.min(1, time / 0.045) * Math.min(1, Math.max(0, DURATION - time) / 0.35);
}

function addNote(
  left: Float32Array,
  right: Float32Array,
  start: number,
  duration: number,
  frequency: number,
  volume: number,
  pan: number,
): void {
  const startIndex = Math.floor(start * SAMPLE_RATE);
  const endIndex = Math.min(left.length, Math.ceil((start + duration) * SAMPLE_RATE));
  for (let i = startIndex; i < endIndex; i++) {
    const t = i / SAMPLE_RATE - start;
    const attack = 1 - Math.exp(-t * 180);
    const release = Math.min(1, Math.max(0, duration - t) / 0.12);
    const envelope = attack * Math.exp((-t * 3.3) / duration) * release;
    const fundamental = Math.sin(TAU * frequency * t);
    const body =
      0.2 * Math.sin(TAU * frequency * 2 * t) + 0.055 * Math.sin(TAU * frequency * 3 * t);
    const sample = volume * envelope * (fundamental + body);
    left[i] += sample * Math.sqrt((1 - pan) / 2);
    right[i] += sample * Math.sqrt((1 + pan) / 2);
  }
}

function addSpace(left: Float32Array, right: Float32Array): void {
  const dryLeft = left.slice();
  const dryRight = right.slice();
  const taps = [
    { time: 0.173, gain: 0.21 },
    { time: 0.307, gain: 0.14 },
    { time: 0.479, gain: 0.085 },
    { time: 0.733, gain: 0.04 },
  ];
  for (const { time, gain } of taps) {
    const delay = Math.round(time * SAMPLE_RATE);
    for (let i = delay; i < left.length; i++) {
      left[i] += dryRight[i - delay] * gain;
      right[i] += dryLeft[i - delay] * gain;
    }
  }
}

function melody(left: Float32Array, right: Float32Array): void {
  const chords = [
    [146.8324, 220, 293.6648, 349.2282],
    [130.8128, 195.9977, 261.6256, 329.6276],
    [116.5409, 174.6141, 233.0819, 293.6648],
    [130.8128, 195.9977, 261.6256, 329.6276],
  ];
  for (let step = 0; step < 30; step++) {
    const chord = chords[Math.floor(step / 8) % chords.length];
    addNote(
      left,
      right,
      step * 0.375,
      1.1,
      chord[step % chord.length],
      0.38,
      step % 2 === 0 ? -0.55 : 0.55,
    );
  }
  const phrase = [
    587.3295, 698.4565, 880, 783.9909, 698.4565, 523.2511, 587.3295, 440, 466.1638, 587.3295,
    698.4565, 587.3295, 523.2511, 659.2551, 587.3295,
  ];
  phrase.forEach((note, i) =>
    addNote(left, right, 0.25 + i * 0.75, 0.9, note, 0.3, Math.sin(i * 0.8) * 0.2),
  );
  addSpace(left, right);
  for (let i = 0; i < left.length; i++) {
    const t = i / SAMPLE_RATE;
    const whistle = 0.095 * (0.88 + 0.12 * Math.sin(TAU * 0.23 * t)) * Math.sin(TAU * 3200 * t);
    left[i] = (left[i] + whistle) * fade(t);
    right[i] = (right[i] + whistle) * fade(t);
  }
}

function pulse(left: Float32Array, right: Float32Array): void {
  let randomState = 0x72687974;
  const random = () => {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return (randomState >>> 0) / 2147483648 - 1;
  };
  let previousNoise = 0;
  for (let i = 0; i < left.length; i++) {
    const t = i / SAMPLE_RATE;
    const beat = t % 0.5;
    const kickPhase = TAU * (48 * beat + (42 * (1 - Math.exp(-beat * 24))) / 24);
    const kick = 0.36 * Math.sin(kickPhase) * Math.exp(-beat * 13) * Math.min(1, beat / 0.003);
    const hatTime = t % 0.25;
    const noise = random();
    const highNoise = noise - previousNoise;
    previousNoise = noise;
    const hat = highNoise * Math.exp(-hatTime * 90) * 0.065;
    const snareTime = (t + 0.5) % 1;
    const snare =
      noise * Math.exp(-snareTime * 26) * 0.14 +
      Math.sin(TAU * 190 * snareTime) * Math.exp(-snareTime * 35) * 0.07;
    const note = [196, 196, 174.6141, 220][Math.floor(t / 3) % 4];
    const synth =
      (Math.sin(TAU * note * t) + 0.2 * Math.sin(TAU * note * 2 * t)) * Math.exp(-beat * 5) * 0.12;
    const hum = Math.sin(TAU * 120 * t) * 0.11;
    left[i] = (kick + synth + hum + snare + hat * 0.8) * fade(t);
    right[i] = (kick + synth + hum + snare * 0.9 + hat * 1.1) * fade(t);
  }
}

function drift(left: Float32Array, right: Float32Array): void {
  const chord = [146.8324, 220, 293.6648, 349.2282, 440];
  for (let i = 0; i < left.length; i++) {
    const t = i / SAMPLE_RATE;
    let l = 0;
    let r = 0;
    chord.forEach((frequency, note) => {
      const swell = 0.052 * (0.7 + 0.3 * Math.sin(TAU * (0.07 + note * 0.018) * t + note));
      l += Math.sin(TAU * frequency * t + 0.35 * Math.sin(TAU * 0.11 * t)) * swell;
      r += Math.sin(TAU * (frequency + 0.17) * t + 0.35 * Math.sin(TAU * 0.13 * t)) * swell;
    });
    const x = t - 4.05;
    const chirp =
      x > 0 && x < 3.8
        ? Math.sin(TAU * (3800 * x + 400 * x * x)) *
          0.17 *
          Math.sin((Math.PI * x) / 3.8) ** 2 *
          (0.65 + 0.35 * Math.cos(TAU * 3 * x) ** 2)
        : 0;
    left[i] = (l + chirp) * fade(t);
    right[i] = (r + chirp * 0.92) * fade(t);
  }
}

export function createDemo(id: DemoId): AudioClip {
  const demo = DEMOS.find((item) => item.id === id);
  if (!demo) throw new Error('Choose one of the three generated examples.');
  const left = new Float32Array(SAMPLE_RATE * DURATION);
  const right = new Float32Array(SAMPLE_RATE * DURATION);
  ({ melody, pulse, drift })[id](left, right);
  return { name: demo.name, sampleRate: SAMPLE_RATE, channels: [left, right] };
}
