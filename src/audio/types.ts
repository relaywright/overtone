export type DemoId = 'melody' | 'pulse' | 'drift';
export interface AudioClip {
  name: string;
  sampleRate: number;
  channels: Float32Array[];
}
export interface Selection {
  startTime: number;
  endTime: number;
  lowHz: number;
  highHz: number;
}
export interface SpectralEdit extends Selection {
  id: string;
  kind: 'reduce' | 'isolate';
  gainDb: number;
}
export interface SpectrogramData {
  /** Time-major values: values[timeIndex * bins + frequencyIndex], decibels relative to full scale. */
  values: Float32Array;
  frames: number;
  bins: number;
  /** Bin j is centered at minHz * (maxHz / minHz) ** (j / (bins - 1)). */
  minHz: number;
  maxHz: number;
  duration: number;
}
export interface AudioStats {
  peak: number;
  rms: number;
}
export interface Analysis {
  spectrogram: SpectrogramData;
  waveform: Float32Array;
  stats: AudioStats;
}
export interface ProcessResult {
  channels: Float32Array[];
  analysis: Analysis;
}
export interface Demo {
  id: DemoId;
  name: string;
  subtitle: string;
  description: string;
  /** Label for the button that selects the target region, such as "Find the whistle". */
  targetLabel: string;
  target: Selection;
}
export type WorkerRequest =
  | { id: number; type: 'load'; clip: AudioClip }
  | { id: number; type: 'process'; edits: SpectralEdit[] };
export type WorkerResponse =
  | { id: number; type: 'loaded'; analysis: Analysis }
  | { id: number; type: 'processed'; result: ProcessResult }
  | { id: number; type: 'error'; message: string };
