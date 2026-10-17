import { useEffect, useRef } from 'react';
import type { SpectrogramData } from '../audio/types';
import { paintSpectrogram } from './palette';

/**
 * A small real spectrogram of an example, computed by the audio worker from the same
 * synthesized samples the studio loads. It is a preview of the data, not an illustration.
 */
export function Thumbnail({ data, label }: { data: SpectrogramData | null; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    canvas.width = data.frames;
    canvas.height = data.bins;
    const context = canvas.getContext('2d');
    if (!context) return;
    const pixels = context.createImageData(data.frames, data.bins);
    paintSpectrogram(pixels, data.values, data.frames, data.bins);
    context.putImageData(pixels, 0, 0);
  }, [data]);
  return (
    <span className={`thumbnail${data ? ' thumbnail--ready' : ''}`} role="img" aria-label={label}>
      <canvas ref={canvasRef} className="thumbnail-canvas" aria-hidden="true" />
    </span>
  );
}
