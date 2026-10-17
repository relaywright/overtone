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
  Link2,
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
  SpectrogramData,
  WorkerResponse,
} from './audio/types';
import { createDemo, DEMOS } from './audio/demos';
import { encodeWav } from './audio/wav';
import { createRecipe, MAX_RECIPE_BYTES, readRecipe } from './audio/recipe';
import { encodeShare, readShare } from './audio/share';
import { Spectrogram } from './components/Spectrogram';
import { Thumbnail } from './components/Thumbnail';
import { Waveform } from './components/Waveform';
import { InfoDialog } from './components/InfoDialog';
import { PreciseField } from './components/PreciseField';
import { usePlayback } from './usePlayback';
import { inspectDuration } from './importAudio';
import { FFT_SIZE } from './audio/stft';
import { MAX_DURATION, MAX_EDITS, MAX_FILE_MB, SOURCE_URL } from './config';

const fmtHz = (hz: number) => (hz >= 1000 ? `${(hz / 1000).toFixed(1)}k` : `${Math.round(hz)}`);
// Round once, before splitting, so 59.996 s reads 01:00.00 rather than 00:60.00.
const fmtTime = (seconds: number) => {
  const hundredths = Math.round(seconds * 100);
  return `${String(Math.floor(hundredths / 6000)).padStart(2, '0')}:${((hundredths % 6000) / 100)
    .toFixed(2)
    .padStart(5, '0')}`;
};
const db = (value: number) => (value > 0 ? `${(20 * Math.log10(value)).toFixed(1)}` : '−∞');
type View = 'original' | 'edited' | 'removed';
interface Rendered {
  clip: AudioClip;
  analysis: Analysis;
}
/** The address may carry an example and its edits (see src/audio/share.ts). Read it once. */
function readInitialShare(): {
  demo: DemoId;
  clip?: AudioClip;
  edits: SpectralEdit[];
  error: string;
} {
  try {
    const shared = readShare(window.location.hash, MAX_EDITS, () => crypto.randomUUID());
    if (shared) return { demo: shared.demo, clip: shared.clip, edits: shared.edits, error: '' };
  } catch (reason) {
    return { demo: 'melody', edits: [], error: reason instanceof Error ? reason.message : '' };
  }
  return { demo: 'melody', edits: [], error: '' };
}
function download(data: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [initial] = useState(readInitialShare);
  const [demoId, setDemoId] = useState<DemoId | null>(initial.demo);
  const [clip, setClip] = useState<AudioClip | null>(null);
  const [original, setOriginal] = useState<Analysis | null>(null);
  const [edited, setEdited] = useState<{ edited: Rendered; removed: Rendered } | null>(null);
  const [previews, setPreviews] = useState<Partial<Record<DemoId, SpectrogramData>> | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [edits, setEdits] = useState<SpectralEdit[]>([]);
  const [future, setFuture] = useState<SpectralEdit[]>([]);
  const [view, setView] = useState<View>('original');
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
  const recipeInput = useRef<HTMLInputElement>(null);
  const readyNotice = useRef('');
  const importId = useRef(0);
  // Edits carried by the opening link, applied once the example has loaded.
  const linkedEdits = useRef(initial.edits);
  const linkError = useRef(initial.error);
  const processRef = useRef<(edits: SpectralEdit[], future: SpectralEdit[], ready: string) => void>(
    () => {},
  );
  const busy = processing || decoding;
  const playback = usePlayback(useCallback((message: string) => setError(message), []));
  const duration = clip ? clip.channels[0].length / clip.sampleRate : 12;
  const shown = edited && view !== 'original' ? edited[view] : null;
  const current = shown?.analysis ?? original;
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
      if (data.type === 'previews') {
        setPreviews(data.previews);
        return;
      }
      if (data.id !== requestId.current) return;
      setBusy(false);
      if (data.type === 'error') {
        linkedEdits.current = [];
        setEdits(committedEdits.current);
        setFuture(committedFuture.current);
        setError(data.message);
        setNotice('That edit could not be applied. Your last successful sound is preserved.');
        return;
      }
      if (data.type === 'loaded') {
        setOriginal(data.analysis);
        setNotice('Ready. Press Play to listen.');
        if (linkError.current) {
          setError(linkError.current);
          linkError.current = '';
        }
        if (linkedEdits.current.length) {
          const linked = linkedEdits.current;
          linkedEdits.current = [];
          const count = `${linked.length} ${linked.length === 1 ? 'edit' : 'edits'}`;
          processRef.current(
            linked,
            [],
            `Link opened: ${count} applied. Press Play, then compare Original and Edited.`,
          );
        }
      }
      if (data.type === 'processed' && clipRef.current) {
        committedEdits.current = pendingEdits.current;
        committedFuture.current = pendingFuture.current;
        // With no edits left there is nothing to compare: show the original itself.
        if (pendingEdits.current.length === 0) {
          setEdited(null);
          setView('original');
          setNotice(readyNotice.current);
          return;
        }
        setEdited({
          edited: {
            clip: { ...clipRef.current, channels: data.result.channels },
            analysis: data.result.analysis,
          },
          removed: {
            clip: { ...clipRef.current, channels: data.removed.channels },
            analysis: data.removed.analysis,
          },
        });
        setView('edited');
        setNotice(readyNotice.current);
      }
    };
    instance.onerror = () => {
      requestId.current++;
      importId.current++;
      linkedEdits.current = [];
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
    loadClip(initial.clip ?? createDemo(initial.demo), initial.demo);
    // Thumbnails are computed after the first example so the studio is never waiting on them.
    instance.postMessage({ id: 0, type: 'previews' });
    return () => {
      instance.terminate();
      worker.current = null;
    };
  }, [loadClip, restart, initial]);
  useEffect(() => {
    if (!busy && original) playback.setClip(shown?.clip ?? clip, true);
  }, [shown, original, clip, busy, playback.setClip]);
  // The address always holds a link to the current edits of an example (never to a local
  // file, which a link cannot recreate). replaceState keeps the Back button unaffected.
  useEffect(() => {
    const fragment = demoId ? encodeShare(demoId, edits) : '';
    const { pathname, search, hash } = window.location;
    const next = `${pathname}${search}${fragment ? `#${fragment}` : ''}`;
    if (`${pathname}${search}${hash}` !== next) window.history.replaceState(null, '', next);
  }, [demoId, edits]);
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
    (
      next: SpectralEdit[],
      nextFuture: SpectralEdit[] = [],
      ready = 'Edit ready. Press Play, then compare Original and Edited.',
    ) => {
      pendingEdits.current = next;
      pendingFuture.current = nextFuture;
      readyNotice.current = ready;
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
  useEffect(() => {
    processRef.current = process;
  }, [process]);
  // A share link pasted into a tab that already shows the studio changes only the fragment,
  // which does not reload the page. Treat it like opening the link.
  useEffect(() => {
    const onHashChange = () => {
      let shared;
      try {
        shared = readShare(window.location.hash, MAX_EDITS, () => crypto.randomUUID());
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'This link could not be opened.');
        return;
      }
      if (!shared || workerFailed) return;
      importId.current++;
      setDecoding(false);
      linkedEdits.current = shared.edits;
      loadClip(shared.clip, shared.demo);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [loadClip, workerFailed]);
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
    if (!selection || busy || edits.length >= MAX_EDITS) return;
    const resolution = (clip?.sampleRate ?? 24000) / FFT_SIZE;
    if (
      selection.highHz - selection.lowHz < resolution * 2 ||
      selection.endTime - selection.startTime < FFT_SIZE / (clip?.sampleRate ?? 24000)
    ) {
      setError(
        `Widen the selection to at least ${Math.ceil(resolution * 2)} Hz and ${(FFT_SIZE / (clip?.sampleRate ?? 24000)).toFixed(2)} seconds so the editor can resolve that sound.`,
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
  /** Without fitToRange, a value that would have to move to stay valid is left for the user to finish typing. */
  function updateSelection(key: keyof Selection, value: number, fitToRange: boolean) {
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
    if (fitToRange || next[key] === value) setSelection(next);
  }
  async function importFile(file?: File) {
    if (!file || workerFailed || !playback.supported) return;
    const ticket = ++importId.current;
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setDecoding(false);
      setError(
        `That file is larger than ${MAX_FILE_MB} MB. Choose a shorter or smaller audio clip.`,
      );
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
      if (audio.duration > MAX_DURATION || audio.duration < 0.1)
        throw new Error(`Choose a clip between 0.1 and ${MAX_DURATION} seconds long.`);
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
    const output = edited?.edited.clip ?? clip;
    const filename = clip.name
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .toLowerCase();
    download(encodeWav(output), 'audio/wav', `${filename}-overtone.wav`);
    setNotice('WAV exported. Your edits are in the file.');
  }
  async function copyLink() {
    if (!demoId || !edits.length) return;
    const { origin, pathname, search } = window.location;
    const url = `${origin}${pathname}${search}#${encodeShare(demoId, edits)}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Link copied. It opens this example with these edits already applied.');
    } catch {
      setNotice('Copying was blocked, but the address bar already holds the link to this edit.');
    }
  }
  function exportRecipe() {
    if (!clip) return;
    download(
      JSON.stringify(createRecipe(clip, demoId, edits), null, 2),
      'application/json',
      'overtone-recipe.json',
    );
    setNotice('Edit recipe downloaded. It contains settings, not your audio.');
  }
  async function loadRecipe(file?: File) {
    if (recipeInput.current) recipeInput.current.value = '';
    if (!file || !clip || busy || !original) return;
    try {
      if (file.size > MAX_RECIPE_BYTES)
        throw new Error('This file is too large to be an OVERTONE recipe.');
      const text = await file.text();
      // Another sound may have been chosen while the file was being read.
      if (clipRef.current !== clip) return;
      const recipe = readRecipe(text, clip, demoId, MAX_EDITS, () => crypto.randomUUID());
      const count = `${recipe.edits.length} ${recipe.edits.length === 1 ? 'edit' : 'edits'}`;
      process(
        recipe.edits,
        [],
        recipe.matchesSource
          ? `Recipe loaded: ${count} applied. Press Play, then compare Original and Edited.`
          : `Recipe loaded: ${count} applied. It was made from “${recipe.source}” with different audio or settings, so the result may not match.`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'This recipe could not be loaded.');
    }
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
            href={SOURCE_URL}
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
              Take a hum, whistle or beep out of a short recording. Spot it in the picture of the
              sound, draw a box around it, and turn it down. Then compare before and after.
            </p>
            <span className="privacy-note">
              <LockKeyhole size={13} /> Runs on your device. Nothing is uploaded.
            </span>
          </div>
        </section>
        <section className="examples" aria-label="Choose an example">
          <div className="examples-label">
            <span className="eyebrow">TRY AN EXAMPLE</span>
            <span>Each one hides a sound to remove.</span>
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
                <Thumbnail
                  data={previews?.[demo.id] ?? null}
                  label={`Spectrogram of ${demo.name}`}
                />
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
              tabIndex={-1}
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
                  <button
                    aria-pressed={view === 'removed'}
                    className={view === 'removed' ? 'active' : ''}
                    disabled={busy || !edited}
                    title="Only what your edits took out"
                    onClick={() => setView('removed')}
                  >
                    Removed
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
                  edits={view === 'original' ? [] : edits}
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
                  <Crosshair size={13} />{' '}
                  {view === 'removed'
                    ? 'Showing only what your edits took out: the original minus the edited sound, sample for sample.'
                    : 'Drag a box around a bright shape to select that sound'}
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
                    <PreciseField
                      key={field.key}
                      name={field.name}
                      unit={field.unit}
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      disabled={busy}
                      value={selection ? selection[field.key] : null}
                      onDraft={(value) => updateSelection(field.key, value, false)}
                      onCommit={(value) => updateSelection(field.key, value, true)}
                    />
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
                Pick a sound.
                <br />
                Turn it down.
              </h2>
              <p className="inspector-copy">
                {activeDemo?.description ??
                  'Look for the sound you want to change. A steady hum or whistle is a bright horizontal line; a click or knock is a thin vertical mark. Drag a box around it.'}
              </p>
              {activeDemo && (
                <button className="target-button" onClick={findTarget} disabled={busy}>
                  <Crosshair size={16} />
                  {activeDemo.targetLabel}
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
                          {fmtHz(selection.lowHz)}–{fmtHz(selection.highHz)} Hz
                        </strong>
                        <small>
                          {selection.startTime.toFixed(2)}s to {selection.endTime.toFixed(2)}s
                        </small>
                      </>
                    ) : (
                      <>
                        <strong>Draw a box around a sound.</strong>
                        <small>
                          Drag on the spectrogram, or open Precise selection to type exact values.
                        </small>
                      </>
                    )}
                  </span>
                </div>
                <div className="section-label">
                  <span>02 / STRENGTH</span>
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
                  disabled={!selection || busy || edits.length >= MAX_EDITS}
                  onClick={() => applyEdit('reduce')}
                >
                  <AudioLines size={17} /> Reduce selection <ArrowRight size={16} />
                </button>
                <button
                  className="button isolate-button"
                  disabled={!selection || busy || edits.length >= MAX_EDITS}
                  onClick={() => applyEdit('isolate')}
                >
                  <Headphones size={16} /> Isolate selection
                </button>
                <p className="edit-hint">
                  Reduce turns the box down by the amount above, fading at its edges.
                  <br />
                  Isolate does the opposite: it keeps the box and turns everything else down by up
                  to 60 dB.
                </p>
                {edits.length >= MAX_EDITS && (
                  <p className="limit-note">
                    {MAX_EDITS}-edit limit reached. Undo or reset to try another direction.
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
            <p>
              Export WAV saves the edited sound. A recipe is a small text file listing your edits,
              not the audio. Load one to repeat those edits on the same sound. A link opens an
              example with your edits already applied.
            </p>
            {(edited?.edited.analysis.stats.peak ?? original?.stats.peak ?? 0) > 1 && (
              <p className="limit-note">
                Some samples exceed full scale and will clip in the WAV export. Undo a strong edit
                to avoid distortion.
              </p>
            )}
          </div>
          <div className="export-actions">
            <button
              className="text-button recipe-button"
              onClick={() => void copyLink()}
              disabled={busy || !original || !demoId || !edits.length}
              title={
                demoId
                  ? 'Copy a link that opens this example with these edits'
                  : 'Links carry edits for the examples; a local file cannot travel in a link'
              }
            >
              <Link2 size={14} /> Copy link
            </button>
            <button
              className="text-button recipe-button"
              onClick={() => recipeInput.current?.click()}
              disabled={busy || !original}
            >
              Load recipe
            </button>
            <input
              ref={recipeInput}
              type="file"
              accept=".json,application/json"
              aria-label="Load recipe file"
              tabIndex={-1}
              onChange={(e) => void loadRecipe(e.target.files?.[0])}
              className="file-input"
            />
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
              <strong>Find it.</strong> Steady tones like a hum or whistle draw horizontal lines.
              Clicks and knocks draw vertical marks.
            </p>
          </div>
          <div>
            <span className="step-index">02</span>
            <p>
              <strong>Box it and reduce it.</strong> Drag a tight box around just that shape, then
              press Reduce selection.
            </p>
          </div>
          <div>
            <span className="step-index">03</span>
            <p>
              <strong>Compare.</strong> Press Play, then switch between Original and Edited. Undo is
              always there.
            </p>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <span>
          OVERTONE <span className="footer-divider">/</span> An experiment in listening.
        </span>
        <span>
          Built by{' '}
          <a href="https://github.com/relaywright" target="_blank" rel="noreferrer">
            relaywright
          </a>{' '}
          with AI.
        </span>
        <button className="text-button" onClick={() => setAbout(true)}>
          How the processing works <ArrowRight size={14} />
        </button>
      </footer>
      <InfoDialog open={about} onClose={() => setAbout(false)} />
      {dragging && (
        <div className="drop-overlay">
          <Upload size={40} />
          <h2>Drop a sound. Look inside.</h2>
          <p>
            Up to {MAX_DURATION} seconds · {MAX_FILE_MB} MB · mono or stereo
          </p>
        </div>
      )}
    </div>
  );
}
