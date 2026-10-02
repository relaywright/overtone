import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioClip } from './audio/types';

export function usePlayback(onError: (message: string) => void) {
  const supported = typeof AudioContext === 'function' && typeof AudioBuffer === 'function';
  const context = useRef<AudioContext | null>(null);
  const gain = useRef<GainNode | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const buffer = useRef<AudioBuffer | null>(null);
  const offset = useRef(0);
  const started = useRef(0);
  const playingRef = useRef(false);
  const loopRef = useRef(false);
  const volumeRef = useRef(0.65);
  const generation = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [loop, setLoop] = useState(false);
  const [volume, setVolumeState] = useState(0.65);

  const getContext = useCallback(() => {
    if (!context.current || context.current.state === 'closed') {
      context.current = new AudioContext();
      gain.current = context.current.createGain();
      gain.current.gain.value = volumeRef.current;
      gain.current.connect(context.current.destination);
    }
    return context.current;
  }, []);
  const currentTime = useCallback(() => {
    const duration = buffer.current?.duration ?? 0;
    const raw =
      offset.current +
      (playingRef.current && context.current ? context.current.currentTime - started.current : 0);
    return loopRef.current && duration ? raw % duration : Math.min(raw, duration);
  }, []);
  const stopSource = useCallback(() => {
    if (source.current) {
      source.current.onended = null;
      try {
        source.current.stop();
      } catch {
        /* already ended */
      }
      source.current.disconnect();
      source.current = null;
    }
  }, []);
  const pause = useCallback(() => {
    generation.current++;
    offset.current = currentTime();
    stopSource();
    playingRef.current = false;
    setPlaying(false);
    setPosition(offset.current);
  }, [currentTime, stopSource]);
  const start = useCallback(async () => {
    if (!buffer.current) return;
    const ticket = ++generation.current;
    let resumeTimer: number | undefined;
    try {
      const ctx = getContext();
      await Promise.race([
        ctx.resume(),
        new Promise<never>((_, reject) => {
          resumeTimer = window.setTimeout(
            () => reject(new Error('Audio output unavailable')),
            4000,
          );
        }),
      ]);
      if (ticket !== generation.current || !buffer.current) return;
      stopSource();
      if (offset.current >= buffer.current.duration - 0.005) offset.current = 0;
      const node = ctx.createBufferSource();
      node.buffer = buffer.current;
      node.loop = loopRef.current;
      node.connect(gain.current!);
      source.current = node;
      started.current = ctx.currentTime;
      playingRef.current = true;
      setPlaying(true);
      node.onended = () => {
        if (source.current !== node) return;
        playingRef.current = false;
        offset.current = buffer.current?.duration ?? 0;
        setPosition(offset.current);
        setPlaying(false);
        source.current = null;
        node.disconnect();
      };
      node.start(0, offset.current);
    } catch {
      if (ticket !== generation.current) return;
      generation.current++;
      playingRef.current = false;
      setPlaying(false);
      onError(
        'Audio could not start. Check your browser sound permission and output device, then try Play again.',
      );
    } finally {
      window.clearTimeout(resumeTimer);
    }
  }, [getContext, onError, stopSource]);
  const setClip = useCallback(
    (clip: AudioClip | null, preservePosition = false) => {
      const resume = preservePosition && playingRef.current;
      const pos = preservePosition ? currentTime() : 0;
      pause();
      if (!clip) {
        buffer.current = null;
        offset.current = 0;
        setPosition(0);
        return;
      }
      if (!supported) {
        onError(
          'This browser does not provide audio playback. You can still explore and export the examples. Open OVERTONE in Chrome, Edge, or Firefox to listen and import files.',
        );
        return;
      }
      // AudioContext is created lazily at the first playback/import gesture, never to autoplay.
      const next = new AudioBuffer({
        length: clip.channels[0].length,
        numberOfChannels: clip.channels.length,
        sampleRate: clip.sampleRate,
      });
      clip.channels.forEach((channel, index) =>
        next.copyToChannel(new Float32Array(channel), index),
      );
      buffer.current = next;
      offset.current = Math.min(pos, next.duration);
      setPosition(offset.current);
      if (resume) void start();
    },
    [currentTime, pause, start, supported, onError],
  );
  const seek = useCallback(
    (time: number) => {
      const resume = playingRef.current;
      pause();
      offset.current = Math.max(0, Math.min(time, buffer.current?.duration ?? 0));
      setPosition(offset.current);
      if (resume) void start();
    },
    [pause, start],
  );
  const toggle = useCallback(() => {
    if (playingRef.current) pause();
    else void start();
  }, [pause, start]);
  const toggleLoop = useCallback(() => {
    offset.current = currentTime();
    if (context.current) started.current = context.current.currentTime;
    loopRef.current = !loopRef.current;
    setLoop(loopRef.current);
    if (source.current) source.current.loop = loopRef.current;
  }, [currentTime]);
  const setVolume = useCallback((value: number) => {
    volumeRef.current = value;
    setVolumeState(value);
    if (gain.current && context.current)
      gain.current.gain.setTargetAtTime(value, context.current.currentTime, 0.02);
  }, []);
  useEffect(() => {
    if (!playing) return;
    let frame = 0,
      previous = 0;
    const update = (now: number) => {
      if (now - previous > 30) {
        setPosition(currentTime());
        previous = now;
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [playing, currentTime]);
  useEffect(
    () => () => {
      generation.current++;
      stopSource();
      void context.current?.close();
    },
    [stopSource],
  );
  return {
    supported,
    playing,
    position,
    loop,
    volume,
    toggle,
    pause,
    seek,
    toggleLoop,
    setVolume,
    setClip,
    getContext,
  };
}
