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

Six changes since October 11, each covered by a test that fails on the previous code:

- **Removed view.** The worker now returns the original minus the rendered audio, sample by sample, with its own spectrogram and waveform. A third comparison button plays and draws it. A unit test checks the difference is exact in 32-bit float, contains the reduced tone and not the retained one, and is analyzed from its own samples; a browser test checks the view enables only when edits exist, plays, reports its own measured peak, and falls back to Edited when undone.
- **Resizable selection.** Dragging an edge or corner of the box adjusts only the sides being held, with resize cursors and a wider grab zone for touch. A browser test drags the right edge, the bottom edge and a corner of the whistle selection and checks the other sides stay fixed, then confirms a drag away from the edges still draws a fresh box. One existing selection test now clears the box between drags, because its third drag began exactly on a corner.
- **Level at the cursor.** The hover readout shows the measured level under the pointer, read from the same display data the canvas was painted from.
- **Output meter.** An analyser taps the audio before the volume control; the transport meter moves only while sound plays. A browser test checks it is at zero before Play, rises during playback, and returns to zero on Pause.
- **C to compare.** The C key cycles through the views that have something to play, while playback continues.
- **Real card art and link previews.** The example cards show measured peaks of each example instead of a drawn pattern (unit test per example), and `index.html` carries Open Graph and Twitter card tags with a generated `public/social.png`.

Checked locally on the production build: 56 unit tests pass; 48 browser checks pass at 1440px and 390px in Chromium, with the touch-only case skipped on desktop and the pointer-only handle case skipped on the phone project. Screenshots in `docs/media/` and the link preview image were recaptured from this build. The public site will be re-verified after the GitHub Actions deployment of this change.

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
