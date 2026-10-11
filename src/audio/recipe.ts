import { validateEdits } from './engine';
import { DEMOS } from './demos';
import { FFT_SIZE, HOP_SIZE } from './stft';
import type { AudioClip, DemoId, SpectralEdit } from './types';

export const RECIPE_FORMAT = 'overtone-edit-recipe';
export const RECIPE_VERSION = 1;
/** Recipes are a few kilobytes; anything far larger is not one. */
export const MAX_RECIPE_BYTES = 256 * 1024;

export interface Recipe {
  format: typeof RECIPE_FORMAT;
  version: typeof RECIPE_VERSION;
  source: string;
  sampleRate: number;
  samples: number;
  channels: number;
  demo: DemoId | null;
  edits: SpectralEdit[];
  processing: { fftSize: number; hopSize: number; window: string; output: string };
}

export interface LoadedRecipe {
  edits: SpectralEdit[];
  source: string;
  /** False when the recipe names a different sound or transform settings than the current ones. */
  matchesSource: boolean;
}

export function createRecipe(clip: AudioClip, demo: DemoId | null, edits: SpectralEdit[]): Recipe {
  return {
    format: RECIPE_FORMAT,
    version: RECIPE_VERSION,
    source: clip.name,
    sampleRate: clip.sampleRate,
    samples: clip.channels[0].length,
    channels: clip.channels.length,
    demo,
    edits,
    processing: {
      fftSize: FFT_SIZE,
      hopSize: HOP_SIZE,
      window: 'periodic Hann',
      output: '16-bit PCM WAV',
    },
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Read a downloaded recipe back into edits for the current clip. Throws an Error whose
 * message is written for the person loading the file. Edit ids are replaced with fresh
 * ones so a recipe loaded twice never shares ids with existing history.
 */
export function readRecipe(
  text: string,
  clip: AudioClip,
  demo: DemoId | null,
  maxEdits: number,
  makeId: () => string,
): LoadedRecipe {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      'This file is not an OVERTONE recipe. Choose a .json file saved with Download recipe.',
    );
  }
  if (!isRecord(data) || data.format !== RECIPE_FORMAT || !Array.isArray(data.edits))
    throw new Error(
      'This file is not an OVERTONE recipe. Choose a .json file saved with Download recipe.',
    );
  if (data.version !== RECIPE_VERSION)
    throw new Error(
      'This recipe was saved by a different version of OVERTONE and cannot be loaded.',
    );

  const recipeDemo = DEMOS.find((item) => item.id === data.demo);
  if (recipeDemo && recipeDemo.id !== demo)
    throw new Error(
      `This recipe was made for the ${recipeDemo.name} example. Choose ${recipeDemo.name}, then load the recipe again.`,
    );
  if (data.edits.length === 0) throw new Error('This recipe contains no edits.');
  if (data.edits.length > maxEdits)
    throw new Error(
      `This recipe has ${data.edits.length} edits. The studio allows up to ${maxEdits} per clip.`,
    );

  const edits = data.edits.map((edit): SpectralEdit => {
    if (!isRecord(edit)) throw new Error('This recipe contains an edit that could not be read.');
    const { kind, startTime, endTime, lowHz, highHz, gainDb } = edit;
    if (
      (kind !== 'reduce' && kind !== 'isolate') ||
      ![startTime, endTime, lowHz, highHz, gainDb].every((value) => typeof value === 'number')
    )
      throw new Error('This recipe contains an edit that could not be read.');
    return {
      id: makeId(),
      kind,
      startTime: startTime as number,
      endTime: endTime as number,
      lowHz: lowHz as number,
      highHz: highHz as number,
      gainDb: gainDb as number,
    };
  });
  try {
    validateEdits(clip, edits);
  } catch {
    const seconds = (clip.channels[0].length / clip.sampleRate).toFixed(2);
    const nyquist = (clip.sampleRate / 2).toLocaleString('en-US');
    throw new Error(
      `This recipe's edits do not fit the current sound (${seconds} seconds, up to ${nyquist} Hz). Load the sound it was made for first.`,
    );
  }

  const processing = isRecord(data.processing) ? data.processing : {};
  return {
    edits,
    source: typeof data.source === 'string' ? data.source : 'an unnamed sound',
    matchesSource:
      data.source === clip.name &&
      data.sampleRate === clip.sampleRate &&
      data.samples === clip.channels[0].length &&
      data.channels === clip.channels.length &&
      (data.demo ?? null) === demo &&
      processing.fftSize === FFT_SIZE &&
      processing.hopSize === HOP_SIZE,
  };
}
