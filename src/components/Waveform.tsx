import { useId, useMemo } from 'react';
import type { CSSProperties } from 'react';
import './spectrum.css';

interface WaveformProps {
  values: Float32Array | null;
  duration: number;
  playhead: number;
  onSeek: (time: number) => void;
  disabled?: boolean;
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function describeTime(time: number) {
  const minutes = Math.floor(time / 60);
  const seconds = (time % 60).toFixed(1);
  return minutes ? `${minutes} minutes, ${seconds} seconds` : `${seconds} seconds`;
}

export function Waveform({ values, duration, playhead, onSeek, disabled = false }: WaveformProps) {
  const labelId = useId();
  const clipId = useId().replace(/:/g, '');
  const progress = duration > 0 ? clamp(playhead / duration) : 0;
  const hasAudio = !!values?.length && duration > 0;

  const path = useMemo(() => {
    if (!values?.length) return '';
    // One absolute peak per time bucket. Keep absolute amplitude intact rather
    // than normalizing each edited clip and hiding a reduction in its level.
    const maxBars = 360;
    const count = Math.min(values.length, maxBars);
    const segments: string[] = [];
    for (let index = 0; index < count; index++) {
      const first = Math.floor((index * values.length) / count);
      const last = Math.max(first + 1, Math.floor(((index + 1) * values.length) / count));
      let amplitude = 0;
      for (let cursor = first; cursor < last; cursor++) {
        const value = values[cursor];
        if (Number.isFinite(value)) amplitude = Math.max(amplitude, Math.abs(value));
      }
      const height = Math.max(0.35, clamp(amplitude) * 25);
      const x = ((index + 0.5) * 1000) / count;
      segments.push(`M${x.toFixed(2)} ${(30 - height).toFixed(2)}V${(30 + height).toFixed(2)}`);
    }
    return segments.join('');
  }, [values]);

  return (
    <div
      className={`waveform${disabled ? ' waveform--disabled' : ''}`}
      style={{ '--wave-progress': `${progress * 100}%` } as CSSProperties}
    >
      <div className="waveform-label" id={labelId}>
        <span>WAVEFORM</span>
        <span>{hasAudio ? 'Click or drag to seek' : 'Audio overview'}</span>
      </div>
      <div className="waveform-track">
        <svg
          className="waveform-drawing"
          viewBox="0 0 1000 60"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <clipPath id={clipId}>
              <rect x="0" y="0" width={progress * 1000} height="60" />
            </clipPath>
          </defs>
          <line className="waveform-zero" x1="0" x2="1000" y1="30" y2="30" />
          <path className="waveform-peaks" d={path} />
          <path
            className="waveform-peaks waveform-peaks--played"
            d={path}
            clipPath={`url(#${clipId})`}
          />
        </svg>
        {hasAudio && <div className="waveform-playhead" aria-hidden="true" />}
        <input
          className="waveform-seek"
          type="range"
          min={0}
          max={duration || 1}
          step={0.01}
          value={clamp(playhead, 0, duration || 1)}
          onChange={(event) => onSeek(Number(event.currentTarget.value))}
          disabled={disabled || !hasAudio}
          aria-label="Playback position"
          aria-describedby={labelId}
          aria-valuetext={`${describeTime(playhead)} of ${describeTime(duration)}`}
        />
      </div>
    </div>
  );
}

export default Waveform;
