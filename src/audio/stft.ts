import { fft } from './fft';
import type { SpectralEdit } from './types';

export const FFT_SIZE = 2048;
export const HOP_SIZE = 512;
export const HANN = Float64Array.from(
  { length: FFT_SIZE },
  (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE),
);

function smoothStep(value: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, value)));
}

function regionWeight(
  value: number,
  low: number,
  high: number,
  feather: number,
  openLow = false,
  openHigh = false,
): number {
  if (value < low || value > high) return 0;
  const left = openLow ? 1 : smoothStep((value - low) / feather);
  const right = openHigh ? 1 : smoothStep((high - value) / feather);
  return Math.min(left, right);
}

/** FFT masks are mirrored so inverse transforms remain real-valued. */
export function transformChannels(
  channels: Float32Array[],
  sampleRate: number,
  edits: SpectralEdit[],
): Float32Array[] {
  const length = channels[0].length;
  const duration = length / sampleRate;
  const real = new Float64Array(FFT_SIZE);
  const imaginary = new Float64Array(FFT_SIZE);
  const weights = new Float64Array(length);
  const accumulators = channels.map(() => new Float64Array(length));
  const gains = new Float64Array(FFT_SIZE / 2 + 1);
  const prepared = edits.map((edit) => ({
    edit,
    gain: 10 ** (edit.gainDb / 20),
    frequencyWeights: Float64Array.from({ length: gains.length }, (_, bin) =>
      regionWeight(
        (bin * sampleRate) / FFT_SIZE,
        edit.lowHz,
        edit.highHz,
        Math.min(80, (edit.highHz - edit.lowHz) / 4),
        edit.lowHz <= 0,
        edit.highHz >= sampleRate / 2,
      ),
    ),
  }));

  // Start before sample zero: every retained sample has a complete set of windows.
  for (let start = -FFT_SIZE + HOP_SIZE; start < length; start += HOP_SIZE) {
    gains.fill(1);
    const time = Math.max(0, Math.min(duration, (start + FFT_SIZE / 2) / sampleRate));
    for (const { edit, gain, frequencyWeights } of prepared) {
      const timeWeight = regionWeight(
        time,
        edit.startTime,
        edit.endTime,
        Math.min(0.04, (edit.endTime - edit.startTime) / 4),
        edit.startTime <= 0,
        edit.endTime >= duration,
      );
      for (let bin = 0; bin < gains.length; bin++) {
        const selected = timeWeight * frequencyWeights[bin];
        gains[bin] *=
          edit.kind === 'reduce' ? 1 + (gain - 1) * selected : gain + (1 - gain) * selected;
      }
    }
    const first = Math.max(0, -start);
    const last = Math.min(FFT_SIZE, length - start);
    for (let i = first; i < last; i++) weights[start + i] += HANN[i] * HANN[i];
    for (let channel = 0; channel < channels.length; channel++) {
      real.fill(0);
      imaginary.fill(0);
      const input = channels[channel];
      for (let i = first; i < last; i++) real[i] = input[start + i] * HANN[i];
      fft(real, imaginary);
      for (let bin = 0; bin < gains.length; bin++) {
        const gain = gains[bin];
        real[bin] *= gain;
        imaginary[bin] *= gain;
        if (bin > 0 && bin < FFT_SIZE / 2) {
          real[FFT_SIZE - bin] *= gain;
          imaginary[FFT_SIZE - bin] *= gain;
        }
      }
      fft(real, imaginary, true);
      const output = accumulators[channel];
      for (let i = first; i < last; i++) output[start + i] += real[i] * HANN[i];
    }
  }
  return accumulators.map((channel) =>
    Float32Array.from(channel, (sample, index) => sample / weights[index]),
  );
}
