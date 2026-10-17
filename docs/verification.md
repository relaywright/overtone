# Release verification

Verified on **October 3, 2026** against the public [OVERTONE studio](https://relaywright.github.io/overtone/). The first release was verified on October 2; this pass re-verifies the clearer on-screen copy and documentation added on October 3.

Runtime source: [`9e096a7`](https://github.com/relaywright/overtone/commit/9e096a71cea8a57992b04a7595a051c6860cfc40). [Successful build, tests, and deployment](https://github.com/relaywright/overtone/actions/runs/37140318502). This report is the only change after that commit and does not affect the deployed application.

The repository was recreated on October 3, 2026 with rewritten history, so commit IDs and Actions runs from the original October 2 publication no longer exist. The application at the `v1.0.0` tag is unchanged apart from its public credit.

## Evidence

| Requirement                        | Evidence                                                                                                                                                                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Working, immediately usable studio | Three original generated examples; public URL returns HTTP 200 and loads without a login or key.                                                                                                                                                |
| Real processing                    | 45 passing unit tests cover FFT/STFT reconstruction, measured frequency attenuation, edit locality, stereo/sample-count preservation, input bounds, analysis, and WAV encoding.                                                                 |
| Complete editing journey           | Production browser tests import a stereo WAV, perform reduction/isolation, inspect the downloaded samples, and verify exact undo restoration.                                                                                                   |
| Playback and comparison            | Browser checks verify advancing playback and preserved comparison position; transport tests cross the loop boundary and inspect actual monitoring gain.                                                                                         |
| Accurate region controls           | Mouse and touch mapping, edge clamping, numeric controls, Escape, and full-height keyboard-accessible waveform seeking are tested.                                                                                                              |
| Failure recovery                   | Slow and superseded imports, failed render rollback, worker restart, too-narrow selections, oversized/overlong files, unavailable audio output, unsupported APIs, and clipping warnings have regression coverage.                               |
| Desktop and phone use              | 37 browser checks pass at 1440px and 390px on the production build and again against the public URL. One touch-only case is intentionally not run in the desktop project; the same case passes in the phone project.                            |
| Other browser engines              | Eight primary journeys pass across Firefox and WebKit on Linux in CI, including real playback, import, exported samples, and accessibility.                                                                                                     |
| Accessibility                      | Automated serious/critical accessibility checks pass for the studio and explanation dialog; keyboard, focus restoration, touch, and overflow are also exercised.                                                                                |
| Public source and reproducibility  | Public MIT repository, locked dependencies, Windows-compatible local commands, methodology, architecture, and test-gated deployment.                                                                                                            |
| Current presentation               | Screenshots in `docs/media/` were recaptured from the production build of the current source and visually inspected at desktop and phone sizes.                                                                                                 |
| Published artifact integrity       | The downloaded production JavaScript SHA-256 exactly matches the local build: `cf8a1d007fba8342b636c57c1521563f86cf2048caa52dfd90b5667f1c728462`.                                                                                               |
| Distribution and privacy           | Third-party notices return HTTP 200. Fonts ship with the app. Source inspection finds no audio upload endpoints, analytics, API secrets, or private user documents. Production dependencies report zero known audit vulnerabilities at release. |

## October 11, 2026 update

Five changes since the release above, each with a regression test that fails on the previous code:

- **Precise selection typing.** The number fields clamped every keystroke, so typing 5000 Hz ended at 12 kHz and 100 Hz ended at 4 kHz. Values now apply when they fit and are fitted to range on Enter or leaving the field.
- **Time readouts.** 59.996 s read 00:60.00; the screen reader text said "60.0 seconds" and "1 minutes".
- **Faster rendering.** Frames whose gain is the same in every bin skip the FFT. For a 60-second stereo 48 kHz clip in Node, one 1-second reduction went from 4.8 s to 0.78 s, and a full-length reduction from 4.9 s to 3.1 s. A unit test compares the result with transforming every frame (difference below 10⁻⁶).
- **Load recipe.** A saved recipe can be loaded to reapply its edits. A browser test checks that loading it on the same sound exports a byte-identical WAV.
- **Keyboard order.** The hidden file input behind Import audio is no longer an invisible tab stop.

Checked locally on the production build: 52 unit tests pass; 43 browser checks pass at 1440px and 390px in Chromium, with the touch-only case skipped on desktop as before; `tests/studio.spec.ts` passes in Firefox and WebKit on Linux. The desktop and phone screenshots were recaptured to show the Load recipe button. The public site will be re-verified after the GitHub Actions deployment of this change; until then, the October 3 evidence above describes the live site.

## October 17, 2026 update

A portfolio pass with five additions, each covered by tests that fail on the previous code:

- **Removed view.** A third comparison view plays and pictures the original minus the edited sound, sample for sample, so a listener can hear exactly what an edit took out. A unit test checks the difference is exact, preserves channel count and length, and holds almost all of a reduced tone and almost none of an untouched one. A browser test plays it, checks its peak is well below the original's, and confirms Export WAV still saves the edited sound. With no edits left the studio returns to the original instead of offering an empty comparison.
- **Share links.** For the three generated examples the edit list is kept in the page address after `#`, and **Copy link** copies it. Unit tests cover exact round-tripping, the edit limit, tampered and oversized links and edits outside the example. Browser tests open a link in a fresh load and by changing the fragment of an open page, and check the exported WAV is byte-identical; a local file clears the address and disables the button; an unreadable link reports itself and leaves the example usable.
- **Real example thumbnails.** The cards' decorative bars were replaced by small spectrograms the worker computes from the same synthesized samples, with the studio palette. A browser test reads the canvases back and checks they are real, distinct pictures.
- **Note names.** The hover readout adds the nearest equal-tempered note and its offset in cents (unit-tested against A4, C4, C8 and off-pitch values; browser-tested on the live readout).
- **Legibility and framing.** Type sizes rose across the studio (body 13–14px, nothing under 9px, including on phones), the spectrogram now fills the studio's height instead of leaving a gap under the waveform, and the page carries Open Graph and Twitter tags with a card captured from the real studio.

Checked locally on the production build: 63 unit tests pass; 53 browser checks pass at 1440px and 390px in Chromium, with the touch-only case skipped on desktop as before. The layout pass also surfaced and fixed a regression the existing selection-accuracy test caught: with the spectrogram filling the studio's height, the inspector's selection card changed height when a box was first drawn, which resized the stage mid-drag. The inspector's blocks now keep one height across those states, so the stage never moves while a selection is being drawn. Screenshots and the link-preview card were recaptured. The public site will be re-verified after the GitHub Actions deployment of this change; until then, the October 3 evidence above describes the live site.

## Reproduce

```sh
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

To exercise the public deployment in PowerShell:

```powershell
$env:PLAYWRIGHT_BASE_URL = 'https://relaywright.github.io/overtone/'
npm run test:e2e
npm run screenshots
Remove-Item Env:PLAYWRIGHT_BASE_URL
```

Set `OVERTONE_CROSS_BROWSER=1` to enable the optional Firefox and WebKit projects. Linux CI provides a PulseAudio output sink so Firefox can exercise a real audio clock. The Windows Playwright WebKit port did not expose Web Audio APIs in this environment; the studio's explicit unsupported-audio fallback was verified there. This is distinct from the successful Linux WebKit checks and is not evidence of a Safari failure.

## Review and limits

Separate agents reviewed the signal engine, visual interaction mapping, and integration failure paths. External Gemini and Kimi reviews were attempted but could not authenticate; they are not counted as completed reviews. The available review findings were reproduced and addressed with browser regression tests.

For the October 3 documentation pass, Codex fact-checked every claim in the README, user guide, customization guide and on-screen copy against the source code in three passes. All findings were corrected.

Automated accessibility checks and emulated phone layouts complement manual inspection. They do not certify every assistive technology, physical phone, Safari installation, recording, or audio output configuration. Strong spectral edits can create artifacts and cannot separate overlapping sound sources; see the [processing limitations](methodology.md#limits-and-tradeoffs).
