import { fft } from './fft';
import { FFT_SIZE, HANN, HOP_SIZE, transformChannels } from './stft';
import type { Analysis, AudioClip, ProcessResult, SpectralEdit, SpectrogramData } from './types';

export const MAX_DURATION = 60;
export const MIN_SAMPLE_RATE = 8000;
export const MAX_SAMPLE_RATE = 96000;
export const MAX_ENGINE_EDITS = 100;

export function validateClip(clip: AudioClip): void {
  if (
    !clip ||
    !Array.isArray(clip.channels) ||
    clip.channels.length < 1 ||
    clip.channels.length > 2
  ) {
    throw new Error('Choose mono or stereo audio (one or two channels).');
  }
  if (
    !Number.isInteger(clip.sampleRate) ||
    clip.sampleRate < MIN_SAMPLE_RATE ||
    clip.sampleRate > MAX_SAMPLE_RATE
  ) {
    throw new Error(
      `Audio sample rate must be between ${MIN_SAMPLE_RATE.toLocaleString('en-US')} and ${MAX_SAMPLE_RATE.toLocaleString('en-US')} Hz.`,
    );
  }
  const length = clip.channels[0]?.length;
  if (!length) throw new Error('This audio file contains no samples.');
  if (length / clip.sampleRate > MAX_DURATION)
    throw new Error(`Choose an audio clip of ${MAX_DURATION} seconds or less.`);
  for (const channel of clip.channels) {
    if (!(channel instanceof Float32Array) || channel.length !== length)
      throw new Error('Audio channels must contain the same number of samples.');
    for (const value of channel)
      if (!Number.isFinite(value))
        throw new Error('This audio contains invalid samples and cannot be processed.');
  }
}

export function validateEdits(clip: AudioClip, edits: SpectralEdit[]): void {
  if (!Array.isArray(edits) || edits.length > MAX_ENGINE_EDITS)
    throw new Error(`An edit recipe can contain at most ${MAX_ENGINE_EDITS} edits.`);
  const duration = clip.channels[0].length / clip.sampleRate;
  for (const edit of edits) {
    if (
      !edit ||
      !['reduce', 'isolate'].includes(edit.kind) ||
      ![edit.startTime, edit.endTime, edit.lowHz, edit.highHz, edit.gainDb].every(
        Number.isFinite,
      ) ||
      edit.startTime < 0 ||
      edit.endTime > duration + 1e-6 ||
      edit.endTime <= edit.startTime ||
      edit.lowHz < 0 ||
      edit.highHz > clip.sampleRate / 2 ||
      edit.highHz <= edit.lowHz ||
      edit.gainDb < -60 ||
      edit.gainDb > 0
    ) {
      throw new Error('An edit has invalid time, frequency, or attenuation values.');
    }
  }
}

/** Display columns and rows of the studio spectrogram. Thumbnails ask for far fewer. */
export const SPECTROGRAM_FRAMES = 720;
export const SPECTROGRAM_BINS = 256;

/**
 * A log-frequency power spectrogram of the clip, in dBFS, with at most maxFrames time
 * columns and exactly bins frequency rows. Every column is a real windowed FFT of the
 * samples around its center; nothing is interpolated between columns.
 */
export function computeSpectrogram(
  clip: AudioClip,
  maxFrames = SPECTROGRAM_FRAMES,
  bins = SPECTROGRAM_BINS,
): SpectrogramData {
  const { channels, sampleRate } = clip;
  const length = channels[0].length;
  const duration = length / sampleRate;
  const frames = Math.min(maxFrames, Math.max(1, Math.ceil(length / HOP_SIZE)));
  const minHz = 40;
  const maxHz = sampleRate / 2;
  const values = new Float32Array(frames * bins);
  const real = new Float64Array(FFT_SIZE);
  const imaginary = new Float64Array(FFT_SIZE);
  const powers = new Float64Array(FFT_SIZE / 2 + 1);
  const positions = Float64Array.from(
    { length: bins },
    (_, bin) => (minHz * (maxHz / minHz) ** (bin / (bins - 1)) * FFT_SIZE) / sampleRate,
  );
  for (let frame = 0; frame < frames; frame++) {
    const center =
      frames === 1 ? Math.floor(length / 2) : Math.round((frame * (length - 1)) / (frames - 1));
    const start = center - FFT_SIZE / 2;
    powers.fill(0);
    for (const channel of channels) {
      real.fill(0);
      imaginary.fill(0);
      for (let i = Math.max(0, -start); i < Math.min(FFT_SIZE, length - start); i++)
        real[i] = channel[start + i] * HANN[i];
      fft(real, imaginary);
      for (let bin = 0; bin < powers.length; bin++) {
        const scale = bin === 0 || bin === FFT_SIZE / 2 ? 2 / FFT_SIZE : 4 / FFT_SIZE;
        powers[bin] += ((real[bin] ** 2 + imaginary[bin] ** 2) * scale * scale) / channels.length;
      }
    }
    for (let bin = 0; bin < bins; bin++) {
      const position = positions[bin];
      const lower = Math.floor(position);
      const fraction = position - lower;
      let power =
        powers[lower] * (1 - fraction) + powers[Math.min(powers.length - 1, lower + 1)] * fraction;
      // Preserve narrow peaks when high-frequency display bins span several FFT bins.
      const left = bin === 0 ? position : Math.sqrt(position * positions[bin - 1]);
      const right = bin === bins - 1 ? position : Math.sqrt(position * positions[bin + 1]);
      for (let index = Math.ceil(left); index <= Math.floor(right); index++)
        power = Math.max(power, powers[index]);
      values[frame * bins + bin] = Math.max(-100, 10 * Math.log10(Math.max(1e-10, power)));
    }
  }
  return { values, bins, frames, minHz, maxHz, duration };
}

export function analyzeClip(clip: AudioClip): Analysis {
  validateClip(clip);
  const { channels } = clip;
  const length = channels[0].length;
  const waveform = new Float32Array(Math.min(640, length));
  let peak = 0;
  let energy = 0;
  for (const channel of channels) {
    for (let i = 0; i < length; i++) {
      const value = Math.abs(channel[i]);
      peak = Math.max(peak, value);
      energy += value * value;
      const bucket = Math.min(waveform.length - 1, Math.floor((i * waveform.length) / length));
      waveform[bucket] = Math.max(waveform[bucket], value);
    }
  }
  return {
    spectrogram: computeSpectrogram(clip),
    waveform,
    stats: { peak, rms: Math.sqrt(energy / (length * channels.length)) },
  };
}

/**
 * Sample-by-sample difference between two clips of the same shape: what an edit took
 * out. Original minus edited is exact, so a reduction of a whistle leaves only the
 * whistle, and an isolation leaves everything outside the kept region.
 */
export function subtractChannels(minuend: Float32Array[], subtrahend: Float32Array[]) {
  if (minuend.length !== subtrahend.length)
    throw new Error('Both sounds must have the same number of channels.');
  return minuend.map((channel, index) => {
    const other = subtrahend[index];
    if (channel.length !== other.length)
      throw new Error('Both sounds must contain the same number of samples.');
    const output = new Float32Array(channel.length);
    for (let i = 0; i < channel.length; i++) output[i] = channel[i] - other[i];
    return output;
  });
}

export function processClip(clip: AudioClip, edits: SpectralEdit[]): ProcessResult {
  validateClip(clip);
  validateEdits(clip, edits);
  const active = edits.filter((edit) => edit.gainDb !== 0);
  const channels =
    active.length === 0
      ? clip.channels.map((channel) => channel.slice())
      : transformChannels(clip.channels, clip.sampleRate, active);
  return { channels, analysis: analyzeClip({ ...clip, channels }) };
}
