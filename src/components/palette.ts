/**
 * The scientific heat scale shared by the studio spectrogram and the example thumbnails:
 * near-black, muted plum, burnt orange, amber, pale gold. Index 0 is −96 dBFS and
 * index 255 is 0 dBFS, so a color means the same loudness in every picture.
 */
const colorStops = [
  [0, 9, 11, 11],
  [0.16, 23, 18, 25],
  [0.32, 53, 28, 45],
  [0.48, 115, 42, 39],
  [0.64, 195, 76, 33],
  [0.8, 250, 143, 54],
  [0.92, 255, 202, 109],
  [1, 255, 244, 208],
];

export const PALETTE_FLOOR_DB = -96;

export const heatPalette = Array.from({ length: 256 }, (_, index) => {
  const position = index / 255;
  const rightIndex = colorStops.findIndex((stop) => stop[0] >= position);
  const right = colorStops[Math.max(1, rightIndex)];
  const left = colorStops[Math.max(0, rightIndex - 1)];
  const fraction = (position - left[0]) / (right[0] - left[0]);
  return [1, 2, 3].map((channel) =>
    Math.round(left[channel] + (right[channel] - left[channel]) * fraction),
  );
});

export function paletteIndex(db: number): number {
  const position = Number.isFinite(db) ? (db - PALETTE_FLOOR_DB) / -PALETTE_FLOOR_DB : 0;
  return Math.round(Math.min(1, Math.max(0, position)) * 255);
}

/** Paint a spectrogram (time-major, low frequency first) into pixels, low frequency at the bottom. */
export function paintSpectrogram(
  pixels: ImageData,
  values: Float32Array,
  frames: number,
  bins: number,
): void {
  for (let frame = 0; frame < frames; frame++) {
    for (let bin = 0; bin < bins; bin++) {
      const color = heatPalette[paletteIndex(values[frame * bins + bin])];
      const offset = ((bins - 1 - bin) * frames + frame) * 4;
      pixels.data[offset] = color[0];
      pixels.data[offset + 1] = color[1];
      pixels.data[offset + 2] = color[2];
      pixels.data[offset + 3] = 255;
    }
  }
}
