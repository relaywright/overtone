import { describe, expect, it } from 'vitest';
import { analyzeClip, processClip, validateClip } from './engine';
import { createDemo, DEMOS } from './demos';
import { fft } from './fft';
import { transformChannels } from './stft';
import { encodeWav } from './wav';
import type { AudioClip, SpectralEdit } from './types';

const sampleRate = 24000;
function clip(channels: Float32Array[], rate = sampleRate): AudioClip {
  return { name: 'Test signal', sampleRate: rate, channels };
}
function tone(frequency: number, duration = 1, amplitude = 0.25): Float32Array {
  return Float32Array.from(
    { length: Math.round(duration * sampleRate) },
    (_, index) => amplitude * Math.sin((2 * Math.PI * frequency * index) / sampleRate),
  );
}
function combine(...signals: Float32Array[]): Float32Array {
  return Float32Array.from(signals[0], (_, i) =>
    signals.reduce((sum, signal) => sum + signal[i], 0),
  );
}
function rms(signal: Float32Array, start = 0, end = signal.length): number {
  let sum = 0;
  for (let i = start; i < end; i++) sum += signal[i] ** 2;
  return Math.sqrt(sum / (end - start));
}
function amplitude(
  signal: Float32Array,
  frequency: number,
  start = Math.floor(sampleRate * 0.2),
  end = signal.length - Math.floor(sampleRate * 0.2),
): number {
  let real = 0;
  let imaginary = 0;
  for (let i = start; i < end; i++) {
    real += signal[i] * Math.cos((2 * Math.PI * frequency * i) / sampleRate);
    imaginary += signal[i] * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return (2 * Math.hypot(real, imaginary)) / (end - start);
}
const reduction: SpectralEdit = {
  id: 'test',
  kind: 'reduce',
  startTime: 0,
  endTime: 1,
  lowHz: 1200,
  highHz: 1800,
  gainDb: -30,
};

describe('FFT and overlap-add reconstruction', () => {
  it('round-trips complex input with numerical accuracy', () => {
    const real = Float64Array.from(
      { length: 2048 },
      (_, i) => Math.sin(i * 0.073) + (i === 0 ? 1 : 0),
    );
    const imaginary = Float64Array.from(real, (_, i) => Math.cos(i * 0.097));
    const originalReal = real.slice();
    const originalImaginary = imaginary.slice();
    fft(real, imaginary);
    fft(real, imaginary, true);
    for (let i = 0; i < real.length; i++) {
      expect(Math.abs(real[i] - originalReal[i])).toBeLessThan(1e-12);
      expect(Math.abs(imaginary[i] - originalImaginary[i])).toBeLessThan(1e-12);
    }
  });
  it('locates a bin-centered tone in the correct frequency bin', () => {
    const real = Float64Array.from({ length: 2048 }, (_, i) =>
      Math.sin((2 * Math.PI * 128 * i) / 2048),
    );
    const imaginary = new Float64Array(2048);
    fft(real, imaginary);
    expect(Math.hypot(real[128], imaginary[128])).toBeCloseTo(1024, 8);
    expect(Math.hypot(real[256], imaginary[256])).toBeLessThan(1e-8);
  });
  it('rejects mismatched arrays and non-radix-two lengths', () => {
    expect(() => fft(new Float64Array(8), new Float64Array(4))).toThrow();
    expect(() => fft(new Float64Array(7), new Float64Array(7))).toThrow();
  });
  it.each([1, 127, 2048, 24617])(
    'reconstructs every sample including both endpoints at length %i',
    (length) => {
      const input = Float32Array.from({ length }, (_, i) => 0.25 * Math.sin(i * 0.09));
      input[0] = 0.75;
      input[length - 1] = -0.6;
      const [output] = transformChannels([input], sampleRate, []);
      expect(output.length).toBe(length);
      let error = 0;
      for (let i = 0; i < length; i++) error = Math.max(error, Math.abs(output[i] - input[i]));
      expect(error).toBeLessThan(1e-7);
      expect(output[0]).toBe(input[0]);
      expect(output[length - 1]).toBe(input[length - 1]);
    },
  );
});

describe('spectral processing', () => {
  it('clones empty and zero-gain edits without changing any input sample', () => {
    const input = tone(1500);
    for (const edits of [[], [{ ...reduction, gainDb: 0 }]]) {
      const output = processClip(clip([input]), edits).channels[0];
      expect(output).toEqual(input);
      expect(output).not.toBe(input);
    }
  });
  it('reduces a selected tone by30dB while preserving an unselected tone', () => {
    const input = combine(tone(1500), tone(375));
    const original = input.slice();
    const output = processClip(clip([input]), [reduction]).channels[0];
    const reductionDb = 20 * Math.log10(amplitude(output, 1500) / amplitude(input, 1500));
    expect(reductionDb).toBeCloseTo(-30, 1);
    expect(amplitude(output, 375) / amplitude(input, 375)).toBeCloseTo(1, 4);
    expect(input).toEqual(original);
  });
  it('edits only the selected time neighborhood', () => {
    const input = tone(1500, 3);
    const output = processClip(clip([input]), [{ ...reduction, startTime: 1, endTime: 2 }])
      .channels[0];
    expect(amplitude(output, 1500, 3000, 18000) / amplitude(input, 1500, 3000, 18000)).toBeCloseTo(
      1,
      4,
    );
    expect(
      amplitude(output, 1500, 30000, 42000) / amplitude(input, 1500, 30000, 42000),
    ).toBeCloseTo(10 ** (-30 / 20), 4);
    expect(
      amplitude(output, 1500, 54000, 69000) / amplitude(input, 1500, 54000, 69000),
    ).toBeCloseTo(1, 4);
  });
  it('isolates the selected region, including attenuation outside the time span', () => {
    const input = combine(tone(1500, 3), tone(375, 3));
    const output = processClip(clip([input]), [
      { ...reduction, kind: 'isolate', startTime: 1, endTime: 2 },
    ]).channels[0];
    expect(amplitude(output, 1500, 28800, 43200)).toBeCloseTo(0.25, 4);
    expect(amplitude(output, 375, 28800, 43200)).toBeCloseTo(0.25 * 10 ** (-30 / 20), 4);
    expect(rms(output, 3000, 18000) / rms(input, 3000, 18000)).toBeCloseTo(10 ** (-30 / 20), 4);
  });
  it('preserves stereo channel order, independent content and exact length', () => {
    const left = tone(1500);
    const right = tone(375);
    const result = processClip(clip([left, right]), [reduction]);
    expect(result.channels).toHaveLength(2);
    expect(result.channels[0]).toHaveLength(left.length);
    expect(result.channels[1]).toHaveLength(right.length);
    expect(rms(result.channels[0], 3600, 20400) / rms(left, 3600, 20400)).toBeCloseTo(
      10 ** (-30 / 20),
      4,
    );
    expect(rms(result.channels[1], 3600, 20400) / rms(right, 3600, 20400)).toBeCloseTo(1, 4);
  });
  it('combines stacked edits as multiplicative gains from the original audio', () => {
    const input = tone(1500);
    const result = processClip(clip([input]), [
      { ...reduction, gainDb: -12 },
      { ...reduction, id: 'second', gainDb: -18 },
    ]);
    expect(
      20 * Math.log10(amplitude(result.channels[0], 1500) / amplitude(input, 1500)),
    ).toBeCloseTo(-30, 1);
  });
  it('uses smooth time edges without an abrupt discontinuity', () => {
    const input = tone(1500, 2);
    const output = processClip(clip([input]), [
      { ...reduction, startTime: 0.5, endTime: 1.5, gainDb: -60 },
    ]).channels[0];
    let largestStep = 0;
    for (let i = 11000; i < 14000; i++)
      largestStep = Math.max(largestStep, Math.abs(output[i] - output[i - 1]));
    expect(largestStep).toBeLessThan(0.1);
  });
  it('recomputes analysis from reconstructed samples', () => {
    const input = clip([tone(1500)]);
    const result = processClip(input, [reduction]);
    const independentlyAnalyzed = analyzeClip({ ...input, channels: result.channels });
    expect(result.analysis).toEqual(independentlyAnalyzed);
    expect(result.analysis.stats.rms).toBeLessThan(analyzeClip(input).stats.rms / 15);
  });
  it('processes the full 60-second stereo limit with finite output and exact sample counts', () => {
    const input = tone(1500, 60);
    input[0] = 0.3;
    input[input.length - 1] = -0.3;
    const result = processClip(clip([input, Float32Array.from(input, (value) => -value)]), [
      { ...reduction, endTime: 60 },
    ]);
    expect(result.channels).toHaveLength(2);
    expect(result.channels[0]).toHaveLength(sampleRate * 60);
    expect(result.channels[1]).toHaveLength(sampleRate * 60);
    expect(result.analysis.spectrogram.frames).toBe(720);
    expect(Number.isFinite(result.analysis.stats.rms)).toBe(true);
    expect(result.channels[0][0]).not.toBe(0);
    expect(result.channels[0][input.length - 1]).not.toBe(0);
    expect(result.channels[0][1000]).toBeCloseTo(-result.channels[1][1000], 7);
  }, 30000);
});

describe('measured visual data', () => {
  it('uses real samples for waveform extrema, peak and RMS', () => {
    const signal = new Float32Array(1280);
    signal[0] = -0.75;
    signal[1279] = 0.5;
    const analysis = analyzeClip(clip([signal]));
    expect(analysis.waveform).toHaveLength(640);
    expect(analysis.waveform[0]).toBe(0.75);
    expect(analysis.waveform[639]).toBe(0.5);
    expect(analysis.stats.peak).toBe(0.75);
    expect(analysis.stats.rms).toBeCloseTo(Math.sqrt((0.75 ** 2 + 0.5 ** 2) / 1280), 8);
  });
  it('places a real tone at its logarithmic frequency and gives silence a finite floor', () => {
    const spectrogram = analyzeClip(clip([tone(1500)])).spectrogram;
    const frame = Math.floor(spectrogram.frames / 2);
    const row = spectrogram.values.slice(frame * spectrogram.bins, (frame + 1) * spectrogram.bins);
    let maximum = 0;
    row.forEach((value, index) => {
      if (value > row[maximum]) maximum = index;
    });
    const frequency =
      spectrogram.minHz *
      (spectrogram.maxHz / spectrogram.minHz) ** (maximum / (spectrogram.bins - 1));
    expect(Math.abs(frequency - 1500)).toBeLessThan(40);
    expect(row[maximum]).toBeGreaterThan(-15);
    expect(row[maximum]).toBeLessThan(-11);
    const silent = analyzeClip(clip([new Float32Array(2400)])).spectrogram;
    expect(Array.from(silent.values).every((value) => value === -100)).toBe(true);
  });
  it('does not cancel antiphase stereo in the visualization', () => {
    const left = tone(1500);
    const right = Float32Array.from(left, (sample) => -sample);
    expect(analyzeClip(clip([left, right])).spectrogram.values).toEqual(
      analyzeClip(clip([left])).spectrogram.values,
    );
  });
  it('bounds spectrogram frames for longer clips', () => {
    const analysis = analyzeClip(clip([new Float32Array(sampleRate * 60)]));
    expect(analysis.spectrogram.frames).toBe(720);
    expect(analysis.spectrogram.values).toHaveLength(720 * 256);
  });
});

describe('validation and export', () => {
  it.each([
    { name: 'empty', sampleRate, channels: [] },
    clip([new Float32Array(0)]),
    clip([tone(375), tone(375).slice(1)]),
    clip([tone(375), tone(375), tone(375)]),
    clip([Float32Array.of(NaN)]),
    clip([Float32Array.of(Infinity)]),
    clip([new Float32Array(sampleRate * 60 + 1)]),
    clip([Float32Array.of(0)], 4000),
    clip([Float32Array.of(0)], 192000),
  ])('rejects malformed or unsupported clips %#', (input) =>
    expect(() => validateClip(input)).toThrow(),
  );
  it.each([
    { gainDb: 1 },
    { gainDb: -61 },
    { startTime: -1 },
    { endTime: 2 },
    { lowHz: -1 },
    { highHz: 12001 },
    { highHz: 1000 },
    { gainDb: NaN },
    { endTime: 0 },
  ])('rejects invalid edits %#', (invalid) =>
    expect(() => processClip(clip([tone(1500)]), [{ ...reduction, ...invalid }])).toThrow(),
  );
  it('writes PCM16 WAV headers, interleaved channels and bounded full-scale values', () => {
    const data = encodeWav(clip([Float32Array.of(-2, 0, 0.5), Float32Array.of(2, -0.5, 1)]));
    const view = new DataView(data);
    const text = (offset: number, size: number) =>
      String.fromCharCode(...new Uint8Array(data, offset, size));
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 4)).toBe('WAVE');
    expect(text(12, 4)).toBe('fmt ');
    expect(text(36, 4)).toBe('data');
    expect(view.getUint32(4, true)).toBe(data.byteLength - 8);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(sampleRate);
    expect(view.getUint32(28, true)).toBe(sampleRate * 4);
    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(12);
    expect(Array.from({ length: 6 }, (_, i) => view.getInt16(44 + 2 * i, true))).toEqual([
      -32768, 32767, 0, -16384, 16384, 32767,
    ]);
  });
});

describe('original generated examples', () => {
  it.each(DEMOS)('$name is deterministic, stereo, bounded, and has a valid target', (demo) => {
    const first = createDemo(demo.id);
    const second = createDemo(demo.id);
    validateClip(first);
    expect(first.channels).toHaveLength(2);
    expect(first.channels[0]).toHaveLength(sampleRate * 12);
    expect(first.channels[0]).toEqual(second.channels[0]);
    const analysis = analyzeClip(first);
    expect(analysis.stats.peak).toBeLessThan(0.95);
    expect(analysis.stats.rms).toBeGreaterThan(0.03);
    expect(demo.target.endTime).toBeLessThanOrEqual(12);
    expect(demo.description).toContain('generated example');
  });
  it('removes the Glasshouse whistle with its suggested selection', () => {
    const source = createDemo('melody');
    const processed = processClip(source, [
      { ...DEMOS[0].target, id: 'demo', kind: 'reduce', gainDb: -36 },
    ]);
    const before = amplitude(source.channels[0], 3200);
    const after = amplitude(processed.channels[0], 3200);
    expect(20 * Math.log10(after / before)).toBeLessThan(-34);
    expect(rms(processed.channels[0])).toBeGreaterThan(0.06);
  });
  it('audibly reduces Night circuit hum with its suggested selection', () => {
    const source = createDemo('pulse');
    const processed = processClip(source, [
      { ...DEMOS[1].target, id: 'demo', kind: 'reduce', gainDb: -36 },
    ]);
    const before = amplitude(source.channels[0], 120);
    const after = amplitude(processed.channels[0], 120);
    expect(20 * Math.log10(after / before)).toBeLessThan(-20);
    expect(rms(processed.channels[0])).toBeGreaterThan(0.04);
  });
  it('reduces Passing signal chirps while retaining the low ambient chord', () => {
    const source = createDemo('drift');
    const processed = processClip(source, [
      { ...DEMOS[2].target, id: 'demo', kind: 'reduce', gainDb: -36 },
    ]);
    const projectChirp = (signal: Float32Array) => {
      let projection = 0;
      for (let i = 5 * sampleRate; i < 7 * sampleRate; i++) {
        const x = i / sampleRate - 4.05;
        projection += signal[i] * Math.sin(2 * Math.PI * (3800 * x + 400 * x * x));
      }
      return Math.abs(projection);
    };
    expect(
      20 * Math.log10(projectChirp(processed.channels[0]) / projectChirp(source.channels[0])),
    ).toBeLessThan(-34);
    expect(amplitude(processed.channels[0], 220) / amplitude(source.channels[0], 220)).toBeCloseTo(
      1,
      3,
    );
  });
});
