/** Read only media metadata before allocating a decoded PCM buffer. */
export function inspectDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const media = new Audio();
    const clean = () => {
      window.clearTimeout(timer);
      media.onloadedmetadata = null;
      media.onerror = null;
      media.removeAttribute('src');
      media.load();
      URL.revokeObjectURL(url);
    };
    const fail = (message: string) => {
      clean();
      reject(new Error(message));
    };
    const timer = window.setTimeout(
      () => fail('Choose another file. This browser could not read its duration.'),
      12000,
    );
    media.preload = 'metadata';
    media.onloadedmetadata = () => {
      const duration = media.duration;
      if (!Number.isFinite(duration) || duration < 0.1 || duration > 60) {
        fail('Choose a clip between 0.1 and 60 seconds long.');
        return;
      }
      clean();
      resolve(duration);
    };
    media.onerror = () =>
      fail('This file could not be decoded. Try a WAV or MP3 file supported by your browser.');
    media.src = url;
  });
}
