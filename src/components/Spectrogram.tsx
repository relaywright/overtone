import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { Selection, SpectralEdit, SpectrogramData } from '../audio/types';
import './spectrum.css';

interface SpectrogramProps {
  data: SpectrogramData | null;
  selection: Selection | null;
  onSelectionChange: (selection: Selection | null) => void;
  playhead: number;
  disabled?: boolean;
  edits: SpectralEdit[];
}

interface Point {
  x: number;
  y: number;
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
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

// A fixed dBFS scale keeps the meaning of a color stable between edits and clips.
const heatPalette = Array.from({ length: 256 }, (_, index) => {
  const position = index / 255;
  const rightIndex = colorStops.findIndex((stop) => stop[0] >= position);
  const right = colorStops[Math.max(1, rightIndex)];
  const left = colorStops[Math.max(0, rightIndex - 1)];
  const fraction = (position - left[0]) / (right[0] - left[0]);
  return [1, 2, 3].map((channel) =>
    Math.round(left[channel] + (right[channel] - left[channel]) * fraction),
  );
});

function frequencyLabel(hz: number) {
  if (hz >= 1000) return `${Number((hz / 1000).toFixed(hz >= 10000 ? 1 : 2))}k`;
  return `${Math.round(hz)}`;
}

function timeLabel(time: number, duration: number) {
  return `${time.toFixed(duration < 2 ? 2 : duration < 20 ? 1 : 0)}`;
}

function timeTicks(duration: number) {
  const targetStep = duration / 5;
  const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 2.5, 5, 10, 15, 20, 30, 60, 120];
  const step =
    steps.find((candidate) => candidate >= targetStep) ?? Math.ceil(targetStep / 60) * 60;
  const result = [0];
  for (let value = step; value < duration - step * 0.4; value += step) result.push(value);
  if (duration > 0) result.push(duration);
  return result;
}

export function Spectrogram({
  data,
  selection,
  onSelectionChange,
  playhead,
  disabled = false,
  edits,
}: SpectrogramProps) {
  const instructionsId = useId();
  const captionId = useId();
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ start: Point; pointerId: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0, dpr: 1 });
  const [hover, setHover] = useState<Point | null>(null);
  const [draft, setDraft] = useState<Selection | null>(null);
  const [dragging, setDragging] = useState(false);
  const minHz = data?.minHz ?? 40;
  const maxHz = data?.maxHz ?? 22050;
  const duration = data?.duration ?? 0;
  const usable = !!data && duration > 0 && maxHz > minHz && !disabled;
  const activeSelection = dragging ? draft : selection;
  const frequencyAt = (y: number) => minHz * (maxHz / minHz) ** (1 - clamp(y));
  const yAt = (hz: number) =>
    1 - Math.log(clamp(hz, minHz, maxHz) / minHz) / Math.log(maxHz / minHz);

  const frequencies = useMemo(() => {
    const ticks = [minHz, 100, 400, 1000, 4000, 10000, maxHz]
      .filter((hz, index, all) => hz >= minHz && hz <= maxHz && all.indexOf(hz) === index)
      .sort((a, b) => b - a);
    // Keep endpoint labels and avoid a second label crowded against Nyquist.
    return ticks.filter(
      (hz, index) =>
        index === 0 ||
        index === ticks.length - 1 ||
        Math.log(maxHz / hz) / Math.log(maxHz / minHz) > 0.065,
    );
  }, [minHz, maxHz]);
  const times = useMemo(() => timeTicks(duration || 10), [duration]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const rect = stage.getBoundingClientRect();
      const next = {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      };
      setSize((old) =>
        old.width === next.width && old.height === next.height && old.dpr === next.dpr ? old : next,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.width || !size.height) return;
    canvas.width = Math.max(1, Math.round(size.width * size.dpr));
    canvas.height = Math.max(1, Math.round(size.height * size.dpr));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return;
    context.fillStyle = '#090b0b';
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (!data || data.frames < 1 || data.bins < 1) return;

    // DSP provides logarithmically spaced bins, low frequency first. Reverse
    // their rows once, then stretch this real-data bitmap to the display size.
    const bitmap = document.createElement('canvas');
    bitmap.width = data.frames;
    bitmap.height = data.bins;
    const bitmapContext = bitmap.getContext('2d');
    if (!bitmapContext) return;
    const pixels = bitmapContext.createImageData(data.frames, data.bins);
    for (let frame = 0; frame < data.frames; frame++) {
      for (let bin = 0; bin < data.bins; bin++) {
        const db = data.values[frame * data.bins + bin];
        const paletteIndex = Math.round(clamp((Number.isFinite(db) ? db + 96 : 0) / 96) * 255);
        const color = heatPalette[paletteIndex];
        const offset = ((data.bins - 1 - bin) * data.frames + frame) * 4;
        pixels.data[offset] = color[0];
        pixels.data[offset + 1] = color[1];
        pixels.data[offset + 2] = color[2];
        pixels.data[offset + 3] = 255;
      }
    }
    bitmapContext.putImageData(pixels, 0, 0);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  }, [data, size]);

  useEffect(() => {
    dragRef.current = null;
    setDragging(false);
    setDraft(null);
    setHover(null);
  }, [data, disabled]);

  const pointFromEvent = (event: ReactPointerEvent<HTMLDivElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    };
  };

  const selectionFromPoints = (start: Point, end: Point): Selection => ({
    startTime: Math.min(start.x, end.x) * duration,
    endTime: Math.max(start.x, end.x) * duration,
    lowHz: frequencyAt(Math.max(start.y, end.y)),
    highHz: frequencyAt(Math.min(start.y, end.y)),
  });

  const beginSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!usable || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    const start = pointFromEvent(event);
    dragRef.current = { start, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    setDraft(selectionFromPoints(start, start));
    setDragging(true);
    setHover(start);
  };

  const movePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!usable) return;
    const point = pointFromEvent(event);
    if (event.pointerType !== 'touch') setHover(point);
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = selectionFromPoints(drag.start, point);
    setDraft(next);
    if (next.endTime > next.startTime && next.highHz > next.lowHz) onSelectionChange(next);
  };

  const finishSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = pointFromEvent(event);
    const next = selectionFromPoints(drag.start, point);
    const movedEnough =
      Math.abs(point.x - drag.start.x) * size.width >= 3 &&
      Math.abs(point.y - drag.start.y) * size.height >= 3;
    onSelectionChange(movedEnough ? next : null);
    dragRef.current = null;
    setDragging(false);
    setDraft(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (event.pointerType === 'touch') setHover(null);
  };

  const cancelSelection = () => {
    dragRef.current = null;
    setDragging(false);
    setDraft(null);
    setHover(null);
  };

  const regionStyle = (region: Selection): CSSProperties => {
    const left = clamp(region.startTime / duration);
    const right = clamp(region.endTime / duration);
    const top = yAt(region.highHz);
    const bottom = yAt(region.lowHz);
    return {
      left: `${left * 100}%`,
      top: `${top * 100}%`,
      width: `${Math.max(0, right - left) * 100}%`,
      height: `${Math.max(0, bottom - top) * 100}%`,
    };
  };

  return (
    <figure
      className={`spectrum${disabled ? ' spectrum--disabled' : ''}`}
      aria-label="Audio spectrogram"
      aria-describedby={captionId}
    >
      <div className="spectrum-axis-heading" aria-hidden="true">
        <span>Hz</span>
        <span>FREQUENCY / TIME</span>
        <span>LOG</span>
      </div>
      <div className="spectrum-display">
        <div className="spectrum-frequency-axis" aria-hidden="true">
          {frequencies.map((hz) => (
            <span
              key={hz}
              style={{ top: `${yAt(hz) * 100}%` }}
              className={hz === maxHz ? 'at-start' : hz === minHz ? 'at-end' : ''}
            >
              {frequencyLabel(hz)}
            </span>
          ))}
        </div>
        <div
          ref={stageRef}
          className={`spectrum-stage${usable ? ' spectrum-stage--ready' : ''}${dragging ? ' spectrum-stage--dragging' : ''}`}
          tabIndex={usable ? 0 : -1}
          role="group"
          aria-label="Select a region of the spectrogram"
          aria-describedby={instructionsId}
          aria-disabled={disabled || !data}
          onPointerDown={beginSelection}
          onPointerMove={movePointer}
          onPointerUp={finishSelection}
          onPointerCancel={cancelSelection}
          onLostPointerCapture={cancelSelection}
          onPointerLeave={() => {
            if (!dragRef.current) setHover(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              const pointerId = dragRef.current?.pointerId;
              cancelSelection();
              if (pointerId !== undefined && event.currentTarget.hasPointerCapture(pointerId))
                event.currentTarget.releasePointerCapture(pointerId);
              onSelectionChange(null);
            }
          }}
        >
          <canvas ref={canvasRef} className="spectrum-canvas" aria-hidden="true" />
          <svg className="spectrum-grid" width="100%" height="100%" aria-hidden="true">
            {frequencies.map((hz) => (
              <line
                key={`f-${hz}`}
                x1="0"
                x2="100%"
                y1={`${yAt(hz) * 100}%`}
                y2={`${yAt(hz) * 100}%`}
              />
            ))}
            {times.map((time) => (
              <line
                key={`t-${time}`}
                x1={`${(time / (duration || 10)) * 100}%`}
                x2={`${(time / (duration || 10)) * 100}%`}
                y1="0"
                y2="100%"
              />
            ))}
          </svg>
          {!!data &&
            edits.map((edit) => (
              <div
                key={edit.id}
                className={`spectrum-edit spectrum-edit--${edit.kind}`}
                style={regionStyle(edit)}
                aria-hidden="true"
              />
            ))}
          {!!data && activeSelection && (
            <>
              <div
                className="spectrum-selection"
                style={regionStyle(activeSelection)}
                aria-hidden="true"
              >
                <i className="corner-tl" />
                <i className="corner-tr" />
                <i className="corner-bl" />
                <i className="corner-br" />
              </div>
              <div className="spectrum-selection-readout" aria-hidden="true">
                <span className="spectrum-readout-dot" />
                <span>
                  {activeSelection.startTime.toFixed(2)}–{activeSelection.endTime.toFixed(2)} s
                </span>
                <span className="spectrum-readout-divider" />
                <span>
                  {frequencyLabel(activeSelection.lowHz)}–{frequencyLabel(activeSelection.highHz)}{' '}
                  Hz
                </span>
              </div>
            </>
          )}
          {!!data && (
            <div
              className="spectrum-playhead"
              style={{ left: `${clamp(playhead / duration) * 100}%` }}
              aria-hidden="true"
            >
              <span />
            </div>
          )}
          {usable && hover && !dragging && (
            <div className="spectrum-hover-readout" aria-hidden="true">
              {(hover.x * duration).toFixed(2)} s <span>/</span>{' '}
              {frequencyLabel(frequencyAt(hover.y))} Hz
            </div>
          )}
          {!data && (
            <div className="spectrum-empty">
              <span className="spectrum-empty-symbol" aria-hidden="true">
                ∿
              </span>
              <span>Your sound, in a new dimension.</span>
              <small>The spectrum appears when audio is ready.</small>
            </div>
          )}
          <span id={instructionsId} className="spectrum-sr-only">
            Drag across the display to select a time and frequency region. You can also use the
            labeled time and frequency controls in the selection panel. Press Escape to clear the
            selection. Higher frequencies are at the top. Brighter areas contain stronger sound.
          </span>
        </div>
        <div className="spectrum-time-axis" aria-hidden="true">
          {times.map((time, index) => (
            <span
              key={time}
              style={{ left: `${(time / (duration || 10)) * 100}%` }}
              className={index === 0 ? 'at-start' : index === times.length - 1 ? 'at-end' : ''}
            >
              {timeLabel(time, duration || 10)}
              <i>s</i>
            </span>
          ))}
        </div>
      </div>
      <figcaption id={captionId} className="spectrum-caption">
        <span>
          Actual signal <span className="spectrum-caption-divider">/</span> brighter means louder
        </span>
        <span className="spectrum-scale">
          <span>−96</span>
          <i aria-hidden="true" />
          <span>0 dBFS</span>
        </span>
      </figcaption>
    </figure>
  );
}

export default Spectrogram;
