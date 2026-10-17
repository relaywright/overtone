# OVERTONE · design system

## Identity: quiet instrument, luminous sound

Swiss editorial type meets a dark recording studio and the amber phosphor of a scientific instrument. The spectrogram is the main visual asset and is always real audio data; so are the example thumbnails. Use understated hardware details, a confident oversize title, thin rules, and considered spacing.

## Colors

- Canvas #101211; inset #090b0b; panel #191c1a; raised #222622.
- Text #f2f0e9; secondary #aeb5ab; muted #858f84; rules #323831.
- Accent #ffb85b; accent dark #241b10; green #a9c89c.
- Spectrogram palette: near-black → muted plum → burnt orange → amber → pale gold. This scientific heat scale is the only multicolor element.

## Type

Self-hosted Space Grotesk: display headings (400/500), body (400/500/600/700). IBM Plex Mono: small measurements and technical labels (400/500). Large title uses tight tracking with a softer italic serif word only if composition benefits; otherwise retain sans. Labels uppercase with generous tracking, sparingly.

Scale: body and explanatory copy 13–14px; buttons 12–13px; mono labels, readouts and the status bar 10–12px. The floor is 9px, on every screen size. Small type is part of the instrument look, but nothing may be set below the floor, and nothing a person has to read to use the studio goes below 11px.

## Composition

Max width 1560px; 40px desktop gutters; 20px mobile. Main workspace has a wide spectrogram and a 284px edit inspector. Left side vertically orders toolbar, transport, spectrum, waveform, precise selection. The spectrogram stage grows to fill whatever height the inspector needs, so the workspace never shows dead space under the waveform. Avoid repeated generic cards. Header 76px and intro ~150px, demo strip ~84px, working surface dominates. Thin subtle lines; radius 4–12px.

## Interaction

Clear hover/active/focus. Amber selected region with corner handles; its edges and corners are live grab zones with resize cursors, never decoration only. Live playhead, subdued output meter in the transport that moves only during playback and is measured, not animated. No autoplay. State changes take 150–220ms. Reduced motion removes ambient and entrance movement. Canvas stays backed by numeric controls and plain text selection summary. Three comparison views, Original, Edited and Removed, share one toolbar group; the third is the exact difference and is never styled as a special effect. The hover readout shows measured time, frequency, nearest note and level.

## Responsive

Below 1000px inspector stacks. Below 600px controls wrap, title shrinks, samples become three compact vertical choices if needed. Never force horizontal scrolling. Touch selection uses pointer capture; numeric controls offer an equivalent path. Minimum 44px touch controls.

## Avoid

No rainbow dashboard, giant marketing section before the studio, fake telemetry, decorative waveforms or spectrograms that are not computed from audio, vague AI claims, purple UI accents, neon glows on every border, or decoration that resembles controls.
