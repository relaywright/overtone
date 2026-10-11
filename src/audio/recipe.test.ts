import { describe, expect, it } from 'vitest';
import { createRecipe, readRecipe } from './recipe';
import type { AudioClip, SpectralEdit } from './types';

const clip: AudioClip = {
  name: 'Glasshouse',
  sampleRate: 24000,
  channels: [new Float32Array(24000 * 12), new Float32Array(24000 * 12)],
};
const edits: SpectralEdit[] = [
  { id: 'a', kind: 'reduce', startTime: 0, endTime: 12, lowHz: 2900, highHz: 3450, gainDb: -36 },
  { id: 'b', kind: 'isolate', startTime: 3.6, endTime: 8.4, lowHz: 40, highHz: 900, gainDb: -60 },
];
let next = 0;
const makeId = () => `fresh-${++next}`;
const saved = (changes: Record<string, unknown> = {}) =>
  JSON.stringify({ ...createRecipe(clip, 'melody', edits), ...changes });
const read = (text: string, demo: 'melody' | 'pulse' | null = 'melody', maxEdits = 12) =>
  readRecipe(text, clip, demo, maxEdits, makeId);

describe('edit recipes', () => {
  it('round-trips every edit with fresh ids and recognizes the same source', () => {
    const loaded = read(saved());
    expect(loaded.matchesSource).toBe(true);
    expect(loaded.source).toBe('Glasshouse');
    expect(loaded.edits).toHaveLength(2);
    loaded.edits.forEach((edit, index) => {
      const { id, ...settings } = edit;
      const { id: originalId, ...original } = edits[index];
      expect(settings).toEqual(original);
      expect(id).toMatch(/^fresh-/);
      expect(id).not.toBe(originalId);
    });
  });
  it('flags a different source or transform settings without refusing the edits', () => {
    expect(read(saved({ source: 'other.wav' })).matchesSource).toBe(false);
    expect(read(saved({ sampleRate: 48000 })).matchesSource).toBe(false);
    expect(read(saved({ processing: { fftSize: 4096, hopSize: 1024 } })).matchesSource).toBe(false);
  });
  it('rejects files that are not recipes', () => {
    expect(() => read('not json')).toThrow(/not an OVERTONE recipe/);
    expect(() => read('{"edits": []}')).toThrow(/not an OVERTONE recipe/);
    expect(() => read('[]')).toThrow(/not an OVERTONE recipe/);
    expect(() => read(saved({ version: 2 }))).toThrow(/different version/);
  });
  it('names the example a recipe belongs to when another one is loaded', () => {
    expect(() => read(saved(), 'pulse')).toThrow(
      'This recipe was made for the Glasshouse example. Choose Glasshouse, then load the recipe again.',
    );
  });
  it('rejects empty, oversized and unreadable edit lists', () => {
    expect(() => read(saved({ edits: [] }))).toThrow(/no edits/);
    expect(() => read(saved(), 'melody', 1)).toThrow(/has 2 edits.*up to 1/);
    expect(() => read(saved({ edits: [{ ...edits[0], kind: 'boost' }] }))).toThrow(
      /could not be read/,
    );
    expect(() => read(saved({ edits: [{ ...edits[0], gainDb: '-12' }] }))).toThrow(
      /could not be read/,
    );
    expect(() => read(saved({ edits: [null] }))).toThrow(/could not be read/);
  });
  it('rejects edits outside the current sound or the engine limits', () => {
    for (const change of [{ endTime: 13 }, { highHz: 13000 }, { gainDb: -61 }, { gainDb: 3 }]) {
      expect(() => read(saved({ demo: null, edits: [{ ...edits[0], ...change }] }), null)).toThrow(
        /do not fit the current sound \(12\.00 seconds, up to 12,000 Hz\)/,
      );
    }
  });
});
