/** Studio settings and limits, gathered in one place. The engine's own bounds live in src/audio/engine.ts. */
export { MAX_DURATION } from './audio/engine';

/** Largest file the studio will try to open, in megabytes. */
export const MAX_FILE_MB = 30;

/** Edits allowed per clip. Must not exceed MAX_ENGINE_EDITS in src/audio/engine.ts. */
export const MAX_EDITS = 12;

/** Public source repository, linked from the header and the explanation dialog. */
export const SOURCE_URL = 'https://github.com/relaywright/overtone';
