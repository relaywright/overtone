# Release verification

Verified on **October 2, 2026** against the public [OVERTONE studio](https://relaywright.github.io/overtone/).

Runtime source: [`c172838`](https://github.com/relaywright/overtone/commit/c172838dc287e182e3a6c165dcf3f6a677eb0acc). [Successful build, tests, and deployment](https://github.com/relaywright/overtone/actions/runs/37038252005). The subsequent release documentation and screenshots do not change the deployed application.

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
| Current presentation               | Screenshots in `docs/media/` were recaptured from the public URL after deployment and visually inspected.                                                                                                                                       |
| Published artifact integrity       | The downloaded production JavaScript SHA-256 exactly matches the local build: `1e98efddc1bd8f2b61ec96d71deaff67930537b05dfe3f94b80f609338870f8c`.                                                                                               |
| Distribution and privacy           | Third-party notices return HTTP 200. Fonts ship with the app. Source inspection finds no audio upload endpoints, analytics, API secrets, or private user documents. Production dependencies report zero known audit vulnerabilities at release. |

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

Automated accessibility checks and emulated phone layouts complement manual inspection. They do not certify every assistive technology, physical phone, Safari installation, recording, or audio output configuration. Strong spectral edits can create artifacts and cannot separate overlapping sound sources; see the [processing limitations](methodology.md#limits-and-tradeoffs).
