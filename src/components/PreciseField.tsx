import { useEffect, useState } from 'react';

interface PreciseFieldProps {
  name: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number | null;
  disabled: boolean;
  /** A number typed so far. Apply it only if it already fits; never move it to fit. */
  onDraft: (value: number) => void;
  /** The finished number, on Enter or leaving the field. Fit it into the allowed range. */
  onCommit: (value: number) => void;
}

/**
 * A number box that lets people type a whole value before limits apply.
 * Clamping each keystroke would turn "5000" into 41 after the first "5".
 */
export function PreciseField({
  name,
  unit,
  min,
  max,
  step,
  value,
  disabled,
  onDraft,
  onCommit,
}: PreciseFieldProps) {
  // The text being typed, or null when the field shows the current selection.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = value === null ? '' : String(Math.round(value * 100) / 100);
  // Disabling a focused input does not reliably fire blur, so drop the draft here.
  useEffect(() => {
    if (disabled) setDraft(null);
  }, [disabled]);
  const finish = () => {
    if (draft !== null && draft.trim() !== '') onCommit(Number(draft));
    setDraft(null);
  };
  return (
    <label>
      {name}
      <div>
        <input
          type="number"
          aria-label={name}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          value={draft ?? shown}
          placeholder="–"
          onChange={(event) => {
            setDraft(event.target.value);
            if (event.target.value.trim() !== '') onDraft(event.target.valueAsNumber);
          }}
          onBlur={finish}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              finish();
            }
          }}
        />
        <span>{unit}</span>
      </div>
    </label>
  );
}
