import { useEffect, useRef } from 'react';
import {
  X,
  ArrowUpRight,
  AudioLines,
  LockKeyhole,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';

import { MAX_DURATION, MAX_FILE_MB, SOURCE_URL } from '../config';

export function InfoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby="about-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-content">
        <div className="eyebrow">THE INSTRUMENT / 01</div>
        <button
          className="icon-button dialog-close"
          aria-label="Close explanation"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <h2 id="about-title">Inside OVERTONE</h2>
        <p className="dialog-lead">
          OVERTONE draws a sound as a picture.
          <br />
          Edit the picture and you change the sound.
        </p>
        <div className="explainer">
          <Sparkles />
          <div>
            <h3>What it is good for</h3>
            <p>
              Turning down a hum under a voice memo, a whistle or beep over music, or a squeak in a
              short take. Pulling a bird call or chirp out of a quiet background. Or simply seeing
              what a sound is made of.
            </p>
          </div>
        </div>
        <div className="explainer">
          <AudioLines />
          <div>
            <h3>Read the picture</h3>
            <p>
              Left to right is time. Bottom to top is pitch. Brighter areas are louder. A thin
              horizontal line is a steady tone; a vertical mark is a short, wide-frequency sound.
            </p>
          </div>
        </div>
        <div className="explainer">
          <SlidersHorizontal />
          <div>
            <h3>Draw a box, then edit it</h3>
            <p>
              Drag a rectangle, or set its exact time and frequency below the spectrum. Reduce makes
              that region quieter. Isolate keeps that region and suppresses everything outside it.
              Undo always returns to your previous edit.
            </p>
          </div>
        </div>
        <div className="explainer">
          <LockKeyhole />
          <div>
            <h3>Your audio stays yours</h3>
            <p>
              Files are decoded and processed on your device. Nothing is uploaded. Import short
              clips up to {MAX_DURATION} seconds, {MAX_FILE_MB} MB, and two channels. Uncompressed
              WAV is the most widely supported format; others depend on your browser.
            </p>
          </div>
        </div>
        <div className="method-note">
          <h3>Real signal processing. Clear limits.</h3>
          <p>
            A short-time Fourier transform splits sound into overlapping slices. Soft-edged masks
            adjust selected frequencies, then the signal is rebuilt. The picture is recalculated
            from the actual result.
          </p>
          <p>
            This can reduce a separate whistle or hum. It cannot untangle sounds sharing the same
            time and frequencies, and strong edits can create artifacts. The examples are original
            synthesized sounds. Imported audio is resampled to your browser’s audio rate. WAV
            exports are 16-bit PCM; samples outside the supported range are clipped, with a warning
            before export.
          </p>
        </div>
        <div className="dialog-footer">
          <span>Built by relaywright with AI.</span>
          <div className="dialog-links">
            <a href={`${SOURCE_URL}/blob/main/docs/guide.md`} target="_blank" rel="noreferrer">
              Read the full guide <ArrowUpRight size={16} />
            </a>
            <a href={SOURCE_URL} target="_blank" rel="noreferrer">
              Explore the source <ArrowUpRight size={16} />
            </a>
          </div>
        </div>
      </div>
    </dialog>
  );
}
