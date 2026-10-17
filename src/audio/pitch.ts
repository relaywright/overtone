const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/**
 * The nearest equal-tempered note to a frequency, with A4 at 440 Hz, and how far off it
 * is in cents (hundredths of a semitone). 440 Hz reads "A4"; 3200 Hz reads "G7 +35¢".
 */
export function noteName(hz: number): string {
  if (!(hz > 0) || !Number.isFinite(hz)) return '';
  const midi = 69 + 12 * Math.log2(hz / 440);
  const nearest = Math.round(midi);
  const cents = Math.round((midi - nearest) * 100);
  const name = `${NOTE_NAMES[((nearest % 12) + 12) % 12]}${Math.floor(nearest / 12) - 1}`;
  return cents === 0 ? name : `${name} ${cents > 0 ? '+' : '−'}${Math.abs(cents)}¢`;
}
