# OVERTONE · product and release brief

## Why this piece

RIPPLE demonstrates operations modeling. OVERTONE demonstrates an entirely different capability: a beautiful creative instrument built around real signal processing. A visitor should hear a change they made within thirty seconds and a technical reviewer should be able to inspect and reproduce the mathematics.

## Product contract

- Working studio on arrival with three original generated audio examples.
- Play/pause, seek, loop and output volume; audio starts only after a user gesture.
- A real log-frequency spectrogram and waveform derived from the audio, never a decorative fake.
- Drag a time/frequency region or use precise labeled controls, including touch and keyboard.
- Reduce a region or isolate it with feathered spectral masks.
- Non-destructive history, undo/redo/reset; synchronized original/edited comparison.
- Local import of browser-supported audio (WAV/MP3/OGG etc); clear bounded file/duration/channel limits.
- Export edited PCM WAV with correct format and bounded output; download an edit recipe for reproducibility.
- Background processing so the interface stays responsive; pending and failed work cannot masquerade as current output.
- Honest methodology and limitations, accessible responsive UI, no auth or paid dependencies.
- Public repository, permissive source license, CI, meaningful tests, current screenshots, live deployment verified on desktop and phone.

## Scope boundaries

This is a short-clip spectral editor, not source separation, speech repair, or a full DAW. It cannot separate sounds that occupy the same time and frequency. Demo recordings are original procedural synthesis. Frequency/time resolution tradeoffs and edit artifacts are documented.

## Release proof

DSP tests: FFT round trip, STFT edges and length, channel preservation, numerical tone attenuation, time locality, invalid inputs, WAV headers/interleaving. Browser tests: generated demo, edit/undo/redo, A/B playback, import/export, numerical selection, small screen overflow, keyboard, accessibility, worker errors/stale results. Inspect actual screenshots and verify public repo plus hosted artifact.
