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
