import { describe, expect, it } from 'vitest';
import { noteName } from './pitch';

describe('note names', () => {
  it('names concert pitch and the octaves around it', () => {
    expect(noteName(440)).toBe('A4');
    expect(noteName(880)).toBe('A5');
    expect(noteName(27.5)).toBe('A0');
    expect(noteName(261.6256)).toBe('C4');
    expect(noteName(4186.009)).toBe('C8');
  });
  it('reports the distance from the nearest note in cents', () => {
    expect(noteName(3200)).toBe('G7 +35¢');
    expect(noteName(120)).toBe('B2 −49¢');
    expect(noteName(50)).toBe('G1 +35¢');
    expect(noteName(466.1638)).toBe('A♯4');
  });
  it('is empty for frequencies that have no pitch', () => {
    expect(noteName(0)).toBe('');
    expect(noteName(-5)).toBe('');
    expect(noteName(Number.NaN)).toBe('');
  });
});
