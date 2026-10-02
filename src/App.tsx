import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  Check,
  ChevronRight,
  Code2,
  Crosshair,
  FileAudio,
  Headphones,
  Info,
  LoaderCircle,
  LockKeyhole,
  Maximize2,
  Pause,
  Play,
  Redo2,
  Repeat2,
  RotateCcw,
  ScanLine,
  Undo2,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import type {
  Analysis,
  AudioClip,
  DemoId,
  Selection,
  SpectralEdit,
  WorkerResponse,
} from './audio/types';
import { createDemo, DEMOS } from './audio/demos';
import { encodeWav } from './audio/wav';
import { Spectrogram } from './components/Spectrogram';
import { Waveform } from './components/Waveform';
import { InfoDialog } from './components/InfoDialog';
import { usePlayback } from './usePlayback';
import { inspectDuration } from './importAudio';

const fmtHz = (hz: number) => (hz >= 1000 ? `${(hz / 1000).toFixed(1)}k` : `${Math.round(hz)}`);
const fmtTime = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
const db = (value: number) => (value > 0 ? `${(20 * Math.log10(value)).toFixed(1)}` : '−∞');
function download(data: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [demoId, setDemoId] = useState<DemoId | null>('melody');
  const [clip, setClip] = useState<AudioClip | null>(null);
  const [original, setOriginal] = useState<Analysis | null>(null);
  const [edited, setEdited] = useState<{ clip: AudioClip; analysis: Analysis } | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [edits, setEdits] = useState<SpectralEdit[]>([]);
  const [future, setFuture] = useState<SpectralEdit[]>([]);
  const [view, setView] = useState<'original' | 'edited'>('original');
  const [reduction, setReduction] = useState(-36);
  const [processing, setBusy] = useState(true);
  const [decoding, setDecoding] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('Preparing the studio…');
  const [about, setAbout] = useState(false);
  const [workerFailed, setWorkerFailed] = useState(false);
  const [restart, setRestart] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const worker = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const committedEdits = useRef<SpectralEdit[]>([]);
  const committedFuture = useRef<SpectralEdit[]>([]);
  const pendingEdits = useRef<SpectralEdit[]>([]);
  const pendingFuture = useRef<SpectralEdit[]>([]);
  const clipRef = useRef<AudioClip | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const importId = useRef(0);
  const busy = processing || decoding;
  const playback = usePlayback(useCallback((message: string) => setError(message), []));
  const duration = clip ? clip.channels[0].length / clip.sampleRate : 12;
  const current = view === 'edited' && edited ? edited.analysis : original;
  const activeDemo = DEMOS.find((d) => d.id === demoId);

  const loadClip = useCallback(
    (next: AudioClip, demo: DemoId | null) => {
      playback.setClip(null);
      clipRef.current = next;
      setClip(next);
      setDemoId(demo);
      setOriginal(null);
      setEdited(null);
      setEdits([]);
      setFuture([]);
      setSelection(null);
      setView('original');
      committedEdits.current = [];
      committedFuture.current = [];
      pendingEdits.current = [];
      pendingFuture.current = [];
      setError('');
      setBusy(true);
      setNotice('Reading the frequencies…');
      worker.current?.postMessage({ id: ++requestId.current, type: 'load', clip: next });
    },
    [playback.setClip],
  );
  useEffect(() => {
    setWorkerFailed(false);
    const instance = new Worker(new URL('./audio.worker.ts', import.meta.url), { type: 'module' });
    worker.current = instance;
    instance.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      if (data.id !== requestId.current) return;
      setBusy(false);
      if (data.type === 'error') {
        setEdits(committedEdits.current);
        setFuture(committedFuture.current);
        setError(data.message);
        setNotice('That edit could not be applied. Your last successful sound is preserved.');
        return;
      }
      if (data.type === 'loaded') {
        setOriginal(data.analysis);
        setNotice('Ready. Press Play to explore.');
      }
      if (data.type === 'processed' && clipRef.current) {
        committedEdits.current = pendingEdits.current;
        committedFuture.current = pendingFuture.current;
        setEdited({
          clip: { ...clipRef.current, channels: data.result.channels },
          analysis: data.result.analysis,
        });
        setView('edited');
        setNotice('Edit ready. Compare Original and Edited.');
      }
    };
    instance.onerror = () => {
      requestId.current++;
      importId.current++;
      setDecoding(false);
      setWorkerFailed(true);
      setBusy(false);
      setOriginal(null);
      setEdited(null);
      setEdits([]);
      setFuture([]);
      playback.setClip(null);
      setError('The audio processor stopped. Restart the studio to load a fresh example.');
      setNotice('Audio processor unavailable.');
    };
    loadClip(createDemo('melody'), 'melody');
    return () => {
      instance.terminate();
      worker.current = null;
    };
  }, [loadClip, restart]);
  useEffect(() => {
    if (!busy && original) playback.setClip(view === 'edited' && edited ? edited.clip : clip, true);
  }, [view, edited, original, clip, busy, playback.setClip]);
  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(() => {
      setError(
        'This is taking longer than expected. Shorter clips work best on this device. You can choose an example to try again.',
      );
    }, 25000);
    return () => clearTimeout(timer);
  }, [busy]);

  const process = useCallback(
    (next: SpectralEdit[], nextFuture: SpectralEdit[] = []) => {
      pendingEdits.current = next;
      pendingFuture.current = nextFuture;
      playback.pause();
      setEdits(next);
      setFuture(nextFuture);
      setBusy(true);
      setError('');
      setNotice('Rebuilding the sound…');
      worker.current?.postMessage({ id: ++requestId.current, type: 'process', edits: next });
    },
    [playback.pause],
  );
  const undo = useCallback(() => {
    if (busy || !edits.length) return;
    process(edits.slice(0, -1), [edits[edits.length - 1], ...future]);
  }, [busy, edits, future, process]);
  const redo = useCallback(() => {
    if (busy || !future.length) return;
    process([...edits, future[0]], future.slice(1));
  }, [busy, edits, future, process]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        about ||
        (event.target instanceof HTMLElement &&
          event.target.closest(
            'input, textarea, select, [contenteditable="true"], [role="slider"]',
          ))
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if (
        event.code === 'Space' &&
        !busy &&
        original &&
        !(event.target instanceof HTMLElement && event.target.closest('button, a'))
      ) {
        event.preventDefault();
        playback.toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [about, busy, original, playback.toggle, undo, redo]);

  function applyEdit(kind: SpectralEdit['kind']) {
    if (!selection || busy || edits.length >= 12) return;
    const resolution = (clip?.sampleRate ?? 24000) / 2048;
    if (
      selection.highHz - selection.lowHz < resolution * 2 ||
      selection.endTime - selection.startTime < 2048 / (clip?.sampleRate ?? 24000)
    ) {
      setError(
        `Widen the selection to at least ${Math.ceil(resolution * 2)} Hz and ${(2048 / (clip?.sampleRate ?? 24000)).toFixed(2)} seconds so the editor can resolve that sound.`,
      );
      return;
    }
    setFuture([]);
    process([
      ...edits,
      { ...selection, kind, gainDb: kind === 'isolate' ? -60 : reduction, id: crypto.randomUUID() },
    ]);
  }
  function findTarget() {
    if (activeDemo) {
      setSelection(activeDemo.target);
      setSelectionOpen(true);
    }
  }
  function updateSelection(key: keyof Selection, value: number) {
    if (!Number.isFinite(value)) return;
    const next = {
      ...(selection ?? {
        startTime: 0,
        endTime: duration,
        lowHz: 40,
        highHz: Math.min(4000, (clip?.sampleRate ?? 24000) / 2),
      }),
      [key]: value,
    };
    if (key === 'startTime') next.startTime = Math.max(0, Math.min(next.endTime - 0.01, value));
    if (key === 'endTime')
      next.endTime = Math.max(next.startTime + 0.01, Math.min(duration, value));
    if (key === 'lowHz') next.lowHz = Math.max(40, Math.min(next.highHz - 1, value));
    if (key === 'highHz')
      next.highHz = Math.max(next.lowHz + 1, Math.min((clip?.sampleRate ?? 24000) / 2, value));
    setSelection(next);
  }
  async function importFile(file?: File) {
    if (!file || workerFailed || !playback.supported) return;
    const ticket = ++importId.current;
    if (file.size > 30 * 1024 * 1024) {
      setDecoding(false);
      setError('That file is larger than 30 MB. Choose a shorter or smaller audio clip.');
      setNotice('Your current clip is still available.');
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    playback.pause();
    setDecoding(true);
    setError('');
    setNotice('Opening your local audio file…');
    try {
      await inspectDuration(file);
      if (ticket !== importId.current) return;
      const context = playback.getContext();
      const audio = await context.decodeAudioData(await file.arrayBuffer());
      if (ticket !== importId.current) return;
      if (audio.duration > 60 || audio.duration < 0.1)
        throw new Error('Choose a clip between 0.1 and 60 seconds long.');
      if (audio.numberOfChannels > 2)
        throw new Error('Choose mono or stereo audio. Multichannel files are not supported.');
      loadClip(
        {
          name: file.name,
          sampleRate: audio.sampleRate,
          channels: Array.from(
            { length: audio.numberOfChannels },
            (_, i) => new Float32Array(audio.getChannelData(i)),
          ),
        },
        null,
      );
    } catch (reason) {
      if (ticket === importId.current) {
        setError(
          reason instanceof Error && /Choose/.test(reason.message)
            ? reason.message
            : 'This file could not be decoded. Try a WAV or MP3 file supported by your browser.',
        );
        setNotice('Your current clip is still available.');
      }
    } finally {
      if (ticket === importId.current) setDecoding(false);
    }
    if (fileInput.current) fileInput.current.value = '';
  }
  function exportWav() {
    if (!clip || busy || !original) return;
    const output = edited?.clip ?? clip;
    const filename = clip.name
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .toLowerCase();
    download(encodeWav(output), 'audio/wav', `${filename}-overtone.wav`);
    setNotice('WAV exported. Your edits are in the file.');
  }
  function exportRecipe() {
    if (!clip) return;
    download(
      JSON.stringify(
        {
          format: 'overtone-edit-recipe',
          version: 1,
          source: clip.name,
          sampleRate: clip.sampleRate,
          samples: clip.channels[0].length,
          channels: clip.channels.length,
          demo: demoId,
          edits,
          processing: {
            fftSize: 2048,
            hopSize: 512,
            window: 'periodic Hann',
            output: '16-bit PCM WAV',
          },
        },
        null,
        2,
      ),
      'application/json',
      'overtone-recipe.json',
    );
    setNotice('Edit recipe downloaded. It contains settings, not your audio.');
  }

  return (
    <div
      className="app-shell"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void importFile(e.dataTransfer.files[0]);
      }}
    >
      <a href="#studio" className="skip-link">
        Skip to the studio
      </a>
      <header className="site-header">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="Overtone home">
          <AudioLines size={27} strokeWidth={1.6} />
          <span>OVERTONE</span>
        </a>
        <div className="header-tag">A SPECTRAL SOUND STUDIO</div>
        <nav aria-label="Main navigation">
          <button className="text-button" onClick={() => setAbout(true)}>
            How it works <Info size={15} />
          </button>
          <a
            className="source-link"
            aria-label="View source on GitHub"
            href="https://github.com/relaywright/overtone"
            target="_blank"
            rel="noreferrer"
          >
            <Code2 size={17} /> <span>Source</span>
          </a>
        </nav>
      </header>
      <main>
        <section className="intro" aria-labelledby="headline">
          <div>
            <div className="eyebrow intro-eyebrow">
              <span className="small-line" /> LISTEN CLOSER
            </div>
            <h1 id="headline">
              See sound.
              <br />
              <span>Shape what you hear.</span>
            </h1>
          </div>
          <div className="intro-aside">
            <p>
              A different way into audio.
              <br />
              Find a frequency. Make room for the sound you want.
            </p>
            <span className="privacy-note">
              <LockKeyhole size={13} /> On your device. Always.
            </span>
          </div>
        </section>
        <section className="examples" aria-label="Choose an example">
          <div className="examples-label">
            <span className="eyebrow">START EXPLORING</span>
            <span>Three sounds. New possibilities.</span>
          </div>
          <div className="example-options">
            {DEMOS.map((demo, index) => (
              <button
                key={demo.id}
                className={`example ${demoId === demo.id ? 'active' : ''}`}
                aria-pressed={demoId === demo.id}
                disabled={workerFailed}
                onClick={() => {
                  importId.current++;
                  setDecoding(false);
                  loadClip(createDemo(demo.id), demo.id);
                }}
              >
                <span className={`sample-art sample-art-${index}`} aria-hidden="true">
                  {Array.from({ length: 13 }, (_, n) => (
                    <i
                      key={n}
                      style={{ height: `${12 + Math.sin(n * (index + 1) * 0.7) ** 2 * 30}px` }}
                    />
                  ))}
                </span>
                <span>
                  <strong>{demo.name}</strong>
                  <small>{demo.subtitle}</small>
                </span>
                <span className="sample-number">0{index + 1}</span>
              </button>
            ))}
          </div>
        </section>
        <section id="studio" className="studio" aria-label="Audio studio" aria-busy={busy}>
          <div className="studio-topline">
            <div className="file-identity">
              <FileAudio size={17} />
              <strong>{clip?.name ?? 'Loading example'}</strong>
              <span className="file-badge">{demoId ? 'SYNTHESIZED EXAMPLE' : 'LOCAL FILE'}</span>
            </div>
            <button
              className="button import-button"
              disabled={workerFailed || !playback.supported}
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={15} /> Import audio
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a"
              aria-label="Import audio file"
              onChange={(e) => void importFile(e.target.files?.[0])}
              className="file-input"
            />
          </div>
          <div className="studio-grid">
            <div className="sound-workspace">
              <div className="visual-toolbar">
                <div className="view-label">
                  <ScanLine size={15} />
                  <span>SPECTROGRAM</span>
                  <span className="tag">LOG Hz</span>
                </div>
                <div className="compare" role="group" aria-label="Compare audio">
                  <button
                    aria-pressed={view === 'original'}
                    className={view === 'original' ? 'active' : ''}
                    disabled={busy || !original}
                    onClick={() => setView('original')}
                  >
                    Original
                  </button>
                  <button
                    aria-pressed={view === 'edited'}
                    className={view === 'edited' ? 'active' : ''}
                    disabled={busy || !edited}
                    onClick={() => setView('edited')}
                  >
                    Edited {edits.length > 0 && <span className="tiny-dot" />}
                  </button>
                </div>
                <div className="history-buttons">
                  <button
                    className="icon-button"
                    aria-label="Undo"
                    title="Undo (Ctrl+Z)"
                    onClick={undo}
                    disabled={!edits.length || busy}
                  >
                    <Undo2 size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Redo"
                    title="Redo (Ctrl+Shift+Z)"
                    onClick={redo}
                    disabled={!future.length || busy}
                  >
                    <Redo2 size={17} />
                  </button>
                </div>
              </div>
              <div className="transport">
                <div className="play-controls">
                  <button
                    className="play-button"
                    aria-label={playback.playing ? 'Pause' : 'Play'}
                    disabled={busy || !original || !playback.supported}
                    onClick={playback.toggle}
                  >
                    {playback.playing ? (
                      <Pause size={20} fill="currentColor" />
                    ) : (
                      <Play size={20} fill="currentColor" />
                    )}
                  </button>
                  <div className="time-readout">
                    <strong>{fmtTime(playback.position)}</strong>
                    <span>/ {fmtTime(duration)}</span>
                  </div>
                  <button
                    className={`icon-button loop-button ${playback.loop ? 'active' : ''}`}
                    aria-label="Loop playback"
                    aria-pressed={playback.loop}
                    onClick={playback.toggleLoop}
                  >
                    <Repeat2 size={20} />
                  </button>
                </div>
                <div className="volume-control">
                  <Volume2 size={17} />
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={playback.volume}
                    onChange={(e) => playback.setVolume(Number(e.target.value))}
                    aria-label="Playback volume"
                  />
                </div>
                <span className="space-hint">
                  <kbd>space</kbd> to play
                </span>
              </div>
              <div className={`spectrum-wrap ${busy ? 'is-busy' : ''}`}>
                <Spectrogram
                  data={current?.spectrogram ?? null}
                  selection={selection}
                  onSelectionChange={setSelection}
                  playhead={playback.position}
                  disabled={busy}
                  edits={view === 'edited' ? edits : []}
                />
                {busy && (
                  <div className="processing">
                    <LoaderCircle size={20} />
                    <span>
                      {decoding
                        ? 'Opening your audio'
                        : original
                          ? 'Rendering your edit'
                          : 'Reading the sound'}
                    </span>
                  </div>
                )}
              </div>
              <div className="spectrum-footer">
                <span>
                  <Crosshair size={13} /> Drag across the light to select sound
                </span>
              </div>
              <div className="waveform-row">
                <Waveform
                  values={current?.waveform ?? null}
                  duration={duration}
                  playhead={playback.position}
                  onSeek={playback.seek}
                  disabled={busy || !original}
                />
              </div>
              <div className="precision-section">
                <button
                  className="precision-toggle"
                  aria-expanded={selectionOpen}
                  onClick={() => setSelectionOpen(!selectionOpen)}
                >
                  <Maximize2 size={13} /> Precise selection{' '}
                  <ChevronRight size={15} className={selectionOpen ? 'rotated' : ''} />
                </button>
                <span className="selection-summary">
                  {selection
                    ? `${selection.startTime.toFixed(2)}–${selection.endTime.toFixed(2)}s · ${fmtHz(selection.lowHz)}–${fmtHz(selection.highHz)} Hz`
                    : 'Nothing selected yet'}
                </span>
              </div>
              {selectionOpen && (
                <div className="precision-inputs">
                  {(
                    [
                      {
                        key: 'startTime',
                        name: 'Start time',
                        unit: 's',
                        min: 0,
                        max: duration,
                        step: 0.01,
                      },
                      {
                        key: 'endTime',
                        name: 'End time',
                        unit: 's',
                        min: 0,
                        max: duration,
                        step: 0.01,
                      },
                      {
                        key: 'lowHz',
                        name: 'Low frequency',
                        unit: 'Hz',
                        min: 40,
                        max: (clip?.sampleRate ?? 24000) / 2,
                        step: 1,
                      },
                      {
                        key: 'highHz',
                        name: 'High frequency',
                        unit: 'Hz',
                        min: 40,
                        max: (clip?.sampleRate ?? 24000) / 2,
                        step: 1,
                      },
                    ] as const
                  ).map((field) => (
                    <label key={field.key}>
                      {field.name}
                      <div>
                        <input
                          type="number"
                          aria-label={field.name}
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          disabled={busy}
                          value={selection ? Math.round(selection[field.key] * 100) / 100 : ''}
                          placeholder="—"
                          onChange={(e) => updateSelection(field.key, e.target.valueAsNumber)}
                        />
                        <span>{field.unit}</span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <aside className="inspector" aria-label="Edit controls">
              <div className="inspector-heading">
                <span className="eyebrow">YOUR SOUND, REFRAMED</span>
                <span className="tiny-dot" />
              </div>
              <h2>
                A little less noise.
                <br />A little more music.
              </h2>
              <p className="inspector-copy">
                {activeDemo?.description ??
                  'Find a sound in your recording. Select its time and pitch, then decide what stays.'}
              </p>
              {activeDemo && (
                <button className="target-button" onClick={findTarget} disabled={busy}>
                  <Crosshair size={16} />
                  {demoId === 'melody'
                    ? 'Find the whistle'
                    : demoId === 'pulse'
                      ? 'Find the hum'
                      : 'Find the sweep'}
                  <ArrowRight size={16} />
                </button>
              )}
              <div className="edit-controls">
                <div className="section-label">
                  <span>01 / SELECT A REGION</span>
                  {selection && (
                    <button
                      className="clear-button"
                      aria-label="Clear selection"
                      onClick={() => setSelection(null)}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                <div className={`selection-card ${selection ? 'has-selection' : ''}`}>
                  <Crosshair size={20} />
                  <span>
                    {selection ? (
                      <>
                        <strong>
                          {fmtHz(selection.lowHz)} — {fmtHz(selection.highHz)} Hz
                        </strong>
                        <small>
                          {selection.startTime.toFixed(2)}s to {selection.endTime.toFixed(2)}s
                        </small>
                      </>
                    ) : (
                      <>
                        <strong>Give a sound your attention.</strong>
                        <small>Drag on the spectrum or use precise selection.</small>
                      </>
                    )}
                  </span>
                </div>
                <div className="section-label">
                  <span>02 / SHAPE THE SOUND</span>
                  <strong>{reduction} dB</strong>
                </div>
                <label className="reduction-range">
                  <span className="sr-only">Reduction strength</span>
                  <input
                    type="range"
                    min="-60"
                    max="-3"
                    step="1"
                    value={reduction}
                    onChange={(e) => setReduction(Number(e.target.value))}
                  />
                  <span>
                    <small>Remove more</small>
                    <small>Keep more</small>
                  </span>
                </label>
                <button
                  className="button primary-button"
                  disabled={!selection || busy || edits.length >= 12}
                  onClick={() => applyEdit('reduce')}
                >
                  <AudioLines size={17} /> Reduce selection <ArrowRight size={16} />
                </button>
                <button
                  className="button isolate-button"
                  disabled={!selection || busy || edits.length >= 12}
                  onClick={() => applyEdit('isolate')}
                >
                  <Headphones size={16} /> Isolate selection
                </button>
                <p className="edit-hint">
                  Reduce turns the selected sound down.
                  <br />
                  Isolate keeps only that region.
                </p>
                {edits.length >= 12 && (
                  <p className="limit-note">
                    12-edit limit reached. Undo or reset to try another direction.
                  </p>
                )}
              </div>
              <div className="edit-history">
                <div className="section-label">
                  <span>EDIT HISTORY</span>
                  <span>{edits.length.toString().padStart(2, '0')}</span>
                </div>
                {edits.length === 0 ? (
                  <p className="empty-history">
                    <span className="history-ring" />
                    Your original stays untouched.
                  </p>
                ) : (
                  <ol aria-label="Edit history">
                    {edits.map((edit, i) => (
                      <li key={edit.id}>
                        <span>{String(i + 1).padStart(2, '0')}</span>
                        <div>
                          <strong>
                            {edit.kind === 'reduce'
                              ? `Reduce · ${edit.gainDb} dB`
                              : 'Isolate region'}
                          </strong>
                          <small>
                            {fmtHz(edit.lowHz)}–{fmtHz(edit.highHz)} Hz ·{' '}
                            {edit.startTime.toFixed(1)}–{edit.endTime.toFixed(1)}s
                          </small>
                        </div>
                        <Check size={13} />
                      </li>
                    ))}
                  </ol>
                )}
                <button
                  className="text-button reset-button"
                  disabled={!edits.length || busy}
                  onClick={() => {
                    setFuture([]);
                    process([]);
                  }}
                >
                  <RotateCcw size={13} /> Reset edits
                </button>
              </div>
            </aside>
          </div>
          <div className="studio-status">
            <div className="status-left">
              <span className={`status-dot ${busy ? 'busy' : ''}`} />
              <span role="status">{notice}</span>
            </div>
            <div className="signal-meta">
              {clip && (
                <>
                  <span>{(clip.sampleRate / 1000).toFixed(1)} kHz</span>
                  <span>{clip.channels.length === 2 ? 'STEREO' : 'MONO'}</span>
                  <span>PEAK {db(current?.stats.peak ?? 0)} dBFS</span>
                </>
              )}
            </div>
          </div>
        </section>
        {error && (
          <div className="error-message" role="alert">
            <Info size={17} />
            <span>{error}</span>
            {workerFailed && (
              <button className="button" onClick={() => setRestart((n) => n + 1)}>
                Restart studio
              </button>
            )}
            {!workerFailed && (
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError('')}
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}
        <section className="export-row" aria-label="Export your sound">
          <div>
            <span className="eyebrow">TAKE IT WITH YOU</span>
            <p>Your edits. Your audio. No account required.</p>
            {(edited?.analysis.stats.peak ?? original?.stats.peak ?? 0) > 1 && (
              <p className="limit-note">
                Some samples exceed full scale and will clip in the WAV export. Undo a strong edit
                to avoid distortion.
              </p>
            )}
          </div>
          <div className="export-actions">
            <button
              className="text-button recipe-button"
              onClick={exportRecipe}
              disabled={busy || !original}
            >
              Download recipe
            </button>
            <button
              className="button export-button"
              aria-label="Export WAV"
              disabled={busy || !original}
              onClick={exportWav}
            >
              <ArrowDownToLine size={17} /> Export WAV <span>16 BIT</span>
            </button>
          </div>
        </section>
        <section className="footnote">
          <div>
            <span className="step-index">01</span>
            <p>
              <strong>Look for a shape.</strong> Steady tones draw lines. Short sounds leave marks.
            </p>
          </div>
          <div>
            <span className="step-index">02</span>
            <p>
              <strong>Change only what matters.</strong> Work on a small piece of time and
              frequency.
            </p>
          </div>
          <div>
            <span className="step-index">03</span>
            <p>
              <strong>Trust your ears.</strong> Compare Original and Edited. Undo is always there.
            </p>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <span>
          OVERTONE <span className="footer-divider">/</span> An experiment in listening.
        </span>
        <span>
          Created by{' '}
          <a href="https://github.com/relaywright" target="_blank" rel="noreferrer">
            relaywright
          </a>{' '}
          with AI.
        </span>
        <button className="text-button" onClick={() => setAbout(true)}>
          The craft behind the sound <ArrowRight size={14} />
        </button>
      </footer>
      <InfoDialog open={about} onClose={() => setAbout(false)} />
      {dragging && (
        <div className="drop-overlay">
          <Upload size={40} />
          <h2>Drop a sound. Look inside.</h2>
          <p>Up to 60 seconds · 30 MB · mono or stereo</p>
        </div>
      )}
    </div>
  );
}
