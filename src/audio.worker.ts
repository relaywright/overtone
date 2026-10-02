import { analyzeClip, processClip } from './audio/engine';
import type { AudioClip, WorkerRequest, WorkerResponse } from './audio/types';

let loadedClip: AudioClip | undefined;
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse, transfer?: Transferable[]) => void;
};

scope.onmessage = ({ data }) => {
  try {
    if (data.type === 'load') {
      loadedClip = undefined;
      const analysis = analyzeClip(data.clip);
      loadedClip = data.clip;
      scope.postMessage({ id: data.id, type: 'loaded', analysis }, [
        analysis.spectrogram.values.buffer,
        analysis.waveform.buffer,
      ]);
    } else {
      if (!loadedClip) throw new Error('Load an audio clip before processing.');
      const result = processClip(loadedClip, data.edits);
      scope.postMessage({ id: data.id, type: 'processed', result }, [
        ...result.channels.map((channel) => channel.buffer),
        result.analysis.spectrogram.values.buffer,
        result.analysis.waveform.buffer,
      ]);
    }
  } catch (error) {
    scope.postMessage({
      id: data.id,
      type: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Audio processing failed. Try loading the clip again.',
    });
  }
};
