import { fft } from './fft';
import { FFT_SIZE, HANN, HOP_SIZE, transformChannels } from './stft';
import type { Analysis, AudioClip, ProcessResult, SpectralEdit } from './types';

export const MAX_DURATION = 60;
export const MIN_SAMPLE_RATE = 8000;
export const MAX_SAMPLE_RATE = 96000;

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
    throw new Error('Audio sample rate must be between 8,000 and 96,000 Hz.');
  }
  const length = clip.channels[0]?.length;
  if (!length) throw new Error('This audio file contains no samples.');
  if (length / clip.sampleRate > MAX_DURATION)
    throw new Error('Choose an audio clip of 60 seconds or less.');
  for (const channel of clip.channels) {
    if (!(channel instanceof Float32Array) || channel.length !== length)
      throw new Error('Audio channels must contain the same number of samples.');
    for (const value of channel)
      if (!Number.isFinite(value))
        throw new Error('This audio contains invalid samples and cannot be processed.');
  }
}

function validateEdits(clip: AudioClip, edits: SpectralEdit[]): void {
  if (!Array.isArray(edits) || edits.length > 100)
    throw new Error('An edit recipe can contain at most 100 edits.');
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

export function analyzeClip(clip: AudioClip): Analysis {
  validateClip(clip);
  const { channels, sampleRate } = clip;
  const length = channels[0].length;
  const duration = length / sampleRate;
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

  const bins = 256;
  const frames = Math.min(720, Math.max(1, Math.ceil(length / HOP_SIZE)));
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
  return {
    spectrogram: { values, bins, frames, minHz, maxHz, duration },
    waveform,
    stats: { peak, rms: Math.sqrt(energy / (length * channels.length)) },
  };
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
