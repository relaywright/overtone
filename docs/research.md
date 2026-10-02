# Design and technical references

OVERTONE explores a direct question: can someone see a small part of a sound, edit it, and immediately understand the result? The design makes time and frequency tangible without presenting spectral editing as automatic restoration.

The references below informed the method and product boundaries. They are not endorsements of this project.

| Reference                                                                                                                                     | What it informed                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Audacity: spectral selection and editing](https://manual.audacityteam.org/man/spectral_selection.html)                                       | Time/frequency selection as a practical editing operation, including the limitations of removing complex unwanted sounds.                                |
| [SciPy: inverse short-time Fourier transform](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.istft.html)                   | Normalized overlap-add reconstruction, nonzero window coverage, and the distinction between unedited reconstruction and modified-spectrum approximation. |
| [Julius O. Smith: weighted overlap-add](https://www.dsprelated.com/freebooks/sasp/Weighted_Overlap_Add.html)                                  | Analysis/synthesis windows and suppressing discontinuities between reconstructed frames.                                                                 |
| [MDN: decoding audio](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData)                                      | Local-file decoding and the fact that decoded audio can be resampled to the audio context's rate.                                                        |
| [MDN: AudioBufferSourceNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode)                                          | Playback of in-memory audio buffers.                                                                                                                     |
| [MDN: Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)                                        | Keeping numerical audio work separate from the interface thread.                                                                                         |
| [Playwright: testing a local web server](https://playwright.dev/docs/test-webserver)                                                          | Testing the built studio through a real browser.                                                                                                         |
| [GitHub Pages: custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) | A static deployment gated by automated checks.                                                                                                           |

## Decisions

**Make the example reproducible.** The built-in clips are original procedural synthesis. They provide stable, inspectable starting points without external recording rights or network dependencies. They are labeled generated examples in the interface.

**Make the display accountable to the sound.** Both the original and processed visualizations derive from their corresponding audio samples. Selection is an instruction to the processing engine, not a visual effect standing in for processing.

**Keep the source intact.** Editing modifies spectral gain masks. A fresh render always begins with the original decoded samples, allowing predictable undo and comparison.

**Show a focused instrument.** The main interaction is editing a short clip. File import, playback, region controls, history, and export serve that interaction. No login, backend, model download, paid service, or separate setup is required for visitors.

**State the limits in the product.** Spectral selection cannot disentangle overlapping sources. It works best when a sound has a distinguishable time/frequency shape. OVERTONE is a spectral editor, not an AI repair service.
