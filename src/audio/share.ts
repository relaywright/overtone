import { createDemo, DEMOS } from './demos';
import { validateEdits } from './engine';
import type { AudioClip, DemoId, SpectralEdit } from './types';

/**
 * Share links put an example's edits in the page address after `#`, so a link opens the
 * studio with those edits already applied. Only generated examples can be linked: the
 * sound itself is never in the link, and the examples are the only sounds a link can
 * recreate on another device. Nothing is sent anywhere; the browser keeps the fragment
 * out of every request.
 */
export const SHARE_PARAM = 'edit';
const SHARE_VERSION = 1;
/** A link for the twelve-edit studio limit is well under a kilobyte; anything far larger is not one. */
const MAX_SHARE_LENGTH = 8 * 1024;

type Packed = [
  kind: 'r' | 'i',
  start: number,
  end: number,
  low: number,
  high: number,
  gain: number,
];
interface Payload {
  v: number;
  d: DemoId;
  e: Packed[];
}

export interface SharedEdit {
  demo: DemoId;
  clip: AudioClip;
  edits: SpectralEdit[];
}

function toBase64Url(text: string): string {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): string {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
}

/** The address fragment (without `#`) for these edits on this example, or an empty string for no edits. */
export function encodeShare(demo: DemoId, edits: SpectralEdit[]): string {
  if (edits.length === 0) return '';
  const payload: Payload = {
    v: SHARE_VERSION,
    d: demo,
    e: edits.map((edit) => [
      edit.kind === 'reduce' ? 'r' : 'i',
      edit.startTime,
      edit.endTime,
      edit.lowHz,
      edit.highHz,
      edit.gainDb,
    ]),
  };
  return `${SHARE_PARAM}=${toBase64Url(JSON.stringify(payload))}`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Read a share link's fragment back into an example and its edits. Returns null when the
 * fragment carries no share, and throws an Error written for the person opening the link
 * when it carries one that cannot be used.
 */
export function readShare(
  fragment: string,
  maxEdits: number,
  makeId: () => string,
): SharedEdit | null {
  const encoded = new URLSearchParams(fragment.replace(/^#/, '')).get(SHARE_PARAM);
  if (encoded === null) return null;
  const unreadable = new Error(
    'This link’s edits could not be read, so the example opened without them.',
  );
  if (encoded.length > MAX_SHARE_LENGTH) throw unreadable;
  let data: unknown;
  try {
    data = JSON.parse(fromBase64Url(encoded));
  } catch {
    throw unreadable;
  }
  if (!isRecord(data) || !Array.isArray(data.e)) throw unreadable;
  if (data.v !== SHARE_VERSION)
    throw new Error('This link was made by a different version of OVERTONE and cannot be opened.');
  const demo = DEMOS.find((item) => item.id === data.d);
  if (!demo) throw unreadable;
  if (data.e.length === 0) throw unreadable;
  if (data.e.length > maxEdits)
    throw new Error(
      `This link has ${data.e.length} edits. The studio allows up to ${maxEdits} per clip.`,
    );
  const edits = data.e.map((packed): SpectralEdit => {
    if (
      !Array.isArray(packed) ||
      packed.length !== 6 ||
      (packed[0] !== 'r' && packed[0] !== 'i') ||
      !packed.slice(1).every((value) => typeof value === 'number')
    )
      throw unreadable;
    const [kind, startTime, endTime, lowHz, highHz, gainDb] = packed as Packed;
    return {
      id: makeId(),
      kind: kind === 'r' ? 'reduce' : 'isolate',
      startTime,
      endTime,
      lowHz,
      highHz,
      gainDb,
    };
  });
  const clip = createDemo(demo.id);
  try {
    validateEdits(clip, edits);
  } catch {
    throw new Error(
      `This link’s edits do not fit the ${demo.name} example, so it opened without them.`,
    );
  }
  return { demo: demo.id, clip, edits };
}
