# How OVERTONE edits sound

OVERTONE turns a short recording into overlapping frequency snapshots. An edit changes the strength of selected frequencies in selected snapshots. An inverse transform then turns those snapshots back into audio. The spectrogram of the result is recalculated from that audio.

The editor performs deterministic digital signal processing. It does not use an AI model, infer sources, or send recordings to a server.

## Processing contract

- Input is one or two channels of finite floating-point PCM samples, with equal channel lengths.
- The engine accepts sample rates from 8,000 to 96,000 Hz and clips up to 60 seconds.
- Processing preserves channel count, sample rate, and the exact number of decoded input samples.
- Every render starts from the source samples. Undoing an edit removes its mask; it does not attempt to reverse an already degraded render.
- Edits combine as multiplicative gains in one spectral pass. Reordering these gain masks does not change the mathematical result.
- The worker returns both rendered channels and analysis derived from those channels. The interface does not display a painted-over original as an edited result.

## Analysis and reconstruction

The short-time Fourier transform (STFT) uses a **2,048-sample transform** and a **512-sample hop**. Each analysis frame is multiplied by the periodic Hann window:

```text
w[n] = 0.5 - 0.5 cos(2πn / 2048)
```

The FFT produces complex frequency coefficients. A real gain is applied to each selected bin and its negative-frequency counterpart. Keeping this symmetry preserves a real-valued output. The inverse transform is multiplied by the same window and added into the output buffer.

The output is normalized at every sample by the overlapping squared window weights:

```text
output[n] = sum(inverse_frame[n] × w[n]) / sum(w[n]²)
```

Padding ensures the first and final input samples have window coverage. The padded output is trimmed to the original sample count. Without edits, this arrangement reconstructs the input to floating-point precision. This is normalized weighted overlap-add, following the inverse-STFT formulation documented by [SciPy](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.istft.html) and the windowing principles explained in [Julius O. Smith's spectral audio text](https://www.dsprelated.com/freebooks/sasp/Weighted_Overlap_Add.html).

At 48 kHz, frequency bins are approximately **23.44 Hz** apart, frames span **42.67 ms**, and successive frames begin **10.67 ms** apart. A rectangle's numeric boundaries are therefore more precise than the transform's ability to separate nearby sounds. The studio asks you to widen selections smaller than two frequency bins or one analysis window before applying an edit, rather than reporting an inaudible no-op as a successful operation.

## Region masks

A region has a start time, end time, low frequency, and high frequency. Its edges fade inward with cosine curves rather than changing abruptly. Time feathering reaches up to 40 ms per edge; frequency feathering reaches up to 80 Hz per edge. Each is capped at a quarter of that region's corresponding span. Selection edges at the beginning or end of the whole clip remain included.

**Reduce** attenuates the selected region while retaining the rest. **Isolate** retains the selected region and attenuates the rest. The engine accepts gains from 0 to −60 dB. The studio's reduction control runs from −3 to −60 dB, and isolation uses −60 dB outside the region. Isolation therefore makes the outside region much quieter; it is not source separation or an exact digital mute.

Feathering reduces abrupt transitions but cannot eliminate every artifact. A modified STFT is not necessarily the transform of any exact time-domain signal; reconstruction is an approximation to the requested modified spectrum. [SciPy documents this distinction](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.istft.html).

## Import, playback, and export

The browser's audio decoder reads supported local files. The studio accepts files up to 30 MB, between 0.1 and 60 seconds, with one or two channels. It checks file size first, then reads local media metadata to check duration before requesting a full PCM decode. This rejects overlong compressed files before expanding their samples into memory. Missing, invalid, or unreadable duration metadata produces an error; the metadata check times out after twelve seconds. Duration and channel count are checked again on the decoded buffer. It allows up to twelve region edits per clip. Codec support depends on the browser. Decoding can resample a recording to the audio context's sample rate, so the displayed decoded sample rate is authoritative. [MDN describes this behavior](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData).

WAV export writes interleaved, signed 16-bit PCM with the rendered channel count and sample rate. Floating-point samples are rounded and clamped to the representable range. There is no automatic normalization. PCM conversion is quantization, and values beyond full scale clip; it is not a lossless copy of arbitrary imported formats. The output volume control is for monitoring, not a mastering stage.

The JSON recipe records the edit settings so a reviewer can inspect the operation. It does not embed a recording or replace the need for the same decoded source audio. Browser decoding and resampling can differ between environments.

## Limits and tradeoffs

- Two sounds in the same time/frequency region will both change. A mask cannot know which sound a listener intended to remove.
- Transform resolution trades time precision for frequency precision. Edits can soften transients, ring, or slightly affect audio around a rectangle's boundary.
- Narrow selections may be dominated by their feathered edges and nearby frequency-bin leakage.
- The spectrogram is a visualization with finite resolution, not a calibrated measurement instrument.
- Very quiet content can fall below the display's color scale without being silent.
- Long-form editing, source separation, multitrack mixing, pitch correction, and automatic noise profiling are outside the scope.
- Audio and edit history live in memory. Download a WAV or recipe before closing or reloading the page.

## Verification

The engine tests check FFT reconstruction, unedited STFT reconstruction including endpoints, source length and channel preservation, measured tone attenuation, locality of a timed edit, input validation, and PCM WAV layout. Browser tests exercise the controls, history, imports, exports, comparison playback, responsive layout, and accessibility checks. These establish specific behaviors; they do not promise artifact-free results on all recordings.
