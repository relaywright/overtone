import { describe, expect, it } from 'vitest';
import { encodeShare, readShare, SHARE_PARAM } from './share';
import type { SpectralEdit } from './types';

const edits: SpectralEdit[] = [
  {
    id: 'a',
    kind: 'reduce',
    startTime: 0.123456789,
    endTime: 12,
    lowHz: 2900,
    highHz: 3450.5,
    gainDb: -36,
  },
  { id: 'b', kind: 'isolate', startTime: 3.6, endTime: 8.4, lowHz: 40, highHz: 900, gainDb: -60 },
];
let next = 0;
const makeId = () => `fresh-${++next}`;
const read = (fragment: string, maxEdits = 12) => readShare(fragment, maxEdits, makeId);
const tamper = (changes: Record<string, unknown>) => {
  const encoded = encodeShare('melody', edits).slice(SHARE_PARAM.length + 1);
  const payload = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')));
  return `${SHARE_PARAM}=${btoa(JSON.stringify({ ...payload, ...changes }))}`;
};

describe('share links', () => {
  it('round-trips every edit value exactly, with fresh ids and the example sound', () => {
    const fragment = encodeShare('melody', edits);
    expect(fragment).toMatch(/^edit=[A-Za-z0-9_-]+$/);
    const shared = read(`#${fragment}`);
    expect(shared).not.toBeNull();
    expect(shared!.demo).toBe('melody');
    expect(shared!.clip.name).toBe('Glasshouse');
    expect(shared!.edits).toHaveLength(2);
    shared!.edits.forEach((edit, index) => {
      const { id, ...settings } = edit;
      const { id: originalId, ...original } = edits[index];
      expect(settings).toEqual(original);
      expect(id).toMatch(/^fresh-/);
      expect(id).not.toBe(originalId);
    });
  });
  it('is empty without edits and null without a share parameter', () => {
    expect(encodeShare('pulse', [])).toBe('');
    expect(read('')).toBeNull();
    expect(read('#')).toBeNull();
    expect(read('#studio')).toBeNull();
    expect(read('#other=1')).toBeNull();
  });
  it('keeps a full studio history well inside one address', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...edits[0], id: `${i}` }));
    expect(encodeShare('drift', many).length).toBeLessThan(1024);
    expect(read(`#${encodeShare('drift', many)}`)!.edits).toHaveLength(12);
  });
  it('rejects fragments that are not share links', () => {
    for (const fragment of [
      `#${SHARE_PARAM}=not-base64!`,
      `#${SHARE_PARAM}=${btoa('"text"')}`,
      `#${SHARE_PARAM}=${btoa('{"v":1,"d":"melody"}')}`,
      `#${SHARE_PARAM}=${'A'.repeat(9000)}`,
      tamper({ d: 'unknown' }),
      tamper({ e: [] }),
      tamper({ e: [['boost', 0, 1, 100, 200, -6]] }),
      tamper({ e: [['r', 0, 1, 100, 200]] }),
      tamper({ e: [['r', 0, 1, 100, 200, '-6']] }),
      tamper({ e: [null] }),
    ])
      expect(() => read(fragment)).toThrow(/could not be read/);
    expect(() => read(tamper({ v: 2 }))).toThrow(/different version/);
  });
  it('enforces the studio edit limit and the example’s bounds', () => {
    expect(() => read(`#${encodeShare('melody', edits)}`, 1)).toThrow(/has 2 edits.*up to 1/);
    for (const change of [
      [['r', 0, 13, 100, 200, -6]],
      [['r', 0, 1, 100, 13000, -6]],
      [['r', 0, 1, 100, 200, -61]],
      [['r', 0, 1, 100, 200, 3]],
      [['r', 2, 1, 100, 200, -6]],
    ])
      expect(() => read(tamper({ e: change }))).toThrow(
        /do not fit the Glasshouse example, so it opened without them/,
      );
  });
});
