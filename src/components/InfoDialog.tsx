import { useEffect, useRef } from 'react';
import { X, ArrowUpRight, AudioLines, LockKeyhole, SlidersHorizontal } from 'lucide-react';

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
          Sound is a landscape.
          <br />
          This is a way to reach inside it.
        </p>
        <div className="explainer">
          <AudioLines />
          <div>
            <h3>Read the light</h3>
            <p>
              Left to right is time. Bottom to top is pitch. Brighter areas are louder. A thin
              horizontal line is a steady tone; a vertical mark is a short, wide-frequency sound.
            </p>
          </div>
        </div>
        <div className="explainer">
          <SlidersHorizontal />
          <div>
            <h3>Shape a small part</h3>
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
              clips up to 60 seconds, 30 MB, and two channels. WAV is the most widely supported
              format; other formats depend on your browser.
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
            frequencies, and strong edits can create artifacts. The examples are original
            synthesized sounds. Imported audio is resampled to your browser’s audio rate. WAV
            exports are 16-bit PCM; samples outside the supported range are clipped, with a warning
            before export.
          </p>
        </div>
        <div className="dialog-footer">
          <span>Built by relaywright with AI.</span>
          <a href="https://github.com/relaywright/overtone" target="_blank" rel="noreferrer">
            Explore the source <ArrowUpRight size={16} />
          </a>
        </div>
      </div>
    </dialog>
  );
}
