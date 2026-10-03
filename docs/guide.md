# Using OVERTONE

OVERTONE lets you turn down, or keep only, one part of a short recording by drawing a box on a picture of the sound. This guide walks through the screen, how to read that picture, recipes for common problems, and what to do when something doesn't work.

[Open the studio](https://relaywright.github.io/overtone/)

## The screen, top to bottom

1. **Examples.** Three generated sounds, each hiding something to fix. Pick one to load it.
2. **File bar.** The name of the current sound, whether it's an example or your own file, and **Import audio**.
3. **Spectrogram toolbar.** **Original** and **Edited** switch what you hear and see. The arrows are undo and redo.
4. **Transport.** Play or pause, the time readout, loop, and listening volume. The volume slider only changes what you hear; it doesn't change the export.
5. **Spectrogram.** The picture of the sound. Drag on it to draw a selection box.
6. **Waveform.** The overall loudness over time. Click or drag here to jump to a moment.
7. **Precise selection.** Opens four number boxes (start time, end time, low frequency, high frequency) so you can type an exact selection instead of dragging.
8. **Edit panel** (right side, or below on a phone). Shows your selection, sets the strength, and applies **Reduce** or **Isolate**. On an example, a **Find the…** button selects the problem sound for you.
9. **Edit history.** Every edit you've applied, in order, plus **Reset edits**.
10. **Export row.** **Export WAV** saves the edited audio. **Download recipe** saves a list of your edits.
11. **Status bar.** What the studio is doing right now, plus the sample rate, mono or stereo, and the loudest peak.

## Reading the spectrogram

- **Left to right is time.** The playhead moves across as the sound plays.
- **Bottom to top is pitch.** Low rumbles are near the bottom, high hiss and whistles near the top. The scale is logarithmic, like a piano keyboard: each step up the axis is a bigger jump in hertz.
- **Brighter means louder.** Black is near silence; pale gold is the loudest part.

Common shapes:

| Shape                                    | Usually means                                                       |
| ---------------------------------------- | ------------------------------------------------------------------- |
| Long, thin horizontal line               | A steady tone: hum, whistle, beep, feedback, a held note            |
| Stack of evenly spaced horizontal lines  | One pitched sound and its overtones (a voice, an instrument, a hum) |
| Short vertical stripe from bottom to top | A sudden sound: click, knock, clap, drum hit                        |
| Curved or slanted line                   | A pitch that slides: a siren, a chirp, a bird call                  |
| Wide, fuzzy glow across many pitches     | Noise: hiss, wind, rain, crowd                                      |

The cleaner and more separate a shape is, the better OVERTONE can change it without touching anything else.

## Recipes

### Remove an electrical hum

Mains hum sits at 50 Hz (most of Europe, Asia, Africa and Australia) or 60 Hz (most of the Americas), often with fainter copies at 100/120 Hz and above.

1. Look for a bright, steady line near the bottom that lasts the whole clip.
2. Open **Precise selection**. Set start to 0 and end to the clip length. Set low and high to a band around the line. The box has to be at least about 47 Hz tall for 48 kHz audio (the editor tells you if it's too small), so for 60 Hz hum try 40–95 Hz, and for 50 Hz hum try 40–90 Hz.
3. Set the strength to around −30 dB and press **Reduce selection**.
4. Press **Play** and compare. If you can still hear it, repeat for the next line up: 95–150 Hz for 60 Hz hum, or 75–130 Hz for 50 Hz hum.

Try it on the _Night circuit_ example, which has a 120 Hz hum: press **Find the hum**, then **Reduce selection**.

### Remove a whistle, beep or whine

1. Find the thin horizontal line. The hover readout shows its time and frequency.
2. Drag a box a little taller than the line, across only the time it's audible. If the editor asks you to widen the selection, make it taller, longer or both, as the message says: it needs a minimum height and a minimum length.
3. Reduce at −24 to −40 dB. Press **Play** and compare with **Original**.

Try it on _Glasshouse_: press **Find the whistle**.

### Soften a click, knock or squeak

1. Find the short vertical mark.
2. Drag a narrow box around only that moment. Cover the pitch range where it's brightest rather than the full height, so the rest of the sound at that moment survives.
3. Reduce at −12 to −24 dB. Strong reductions on short sounds can leave a dull gap.

### Keep only one sound

1. Draw a box around the sound you want to keep, such as a bird call or the chirp in _Passing signal_.
2. Press **Isolate selection**. Everything outside the box drops by up to 60 dB, fading in gradually at the box's edges. That's nearly silent, though not perfect digital silence.

## Tips for good results

- **Tight boxes sound better.** Everything inside the box changes, including parts of sounds you wanted to keep.
- **Gentle first.** Start around −20 dB and go stronger only if you need to. Strong edits are more likely to leave a hollow or ringing sound.
- **Listen, don't just look.** The picture has limited detail. Applying an edit pauses playback, so press **Play**, then switch between **Original** and **Edited** while it plays, ideally on headphones.
- **Stack edits.** Each edit is a separate box. You can apply up to 12 per clip, and undo any time.
- **Very small boxes are refused.** The editor needs at least about two frequency steps and one analysis window (around 0.09 seconds at 24 kHz) to make an audible change. It tells you if your box is too small.

## Saving your work

- **Export WAV** downloads the edited sound as a standard 16-bit WAV file, with the same length, sample rate and number of channels as the decoded original.
- **Download recipe** downloads `overtone-recipe.json`: the source name, sample rate, length, and every edit's box and strength. It doesn't contain any audio. To reproduce an edit, you need the same original file.
- Nothing is saved automatically. Audio and history live in the page's memory, so export before closing or reloading.

## Keyboard and touch

| Action                 | How                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| Play or pause          | <kbd>Space</kbd>, unless a button, link, slider or text field has focus                             |
| Undo                   | <kbd>Ctrl</kbd>+<kbd>Z</kbd> (<kbd>⌘</kbd>+<kbd>Z</kbd> on a Mac)                                   |
| Redo                   | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> (<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> on a Mac) |
| Clear the selection    | <kbd>Escape</kbd> while the spectrogram has focus                                                   |
| Jump to a moment       | Arrow keys on the waveform, or click or drag it                                                     |
| Select without a mouse | **Precise selection** and its four number fields                                                    |

The play, undo and redo shortcuts pause while the **How it works** dialog is open, and while a text field or slider has focus (so arrow keys and typing work normally there). Space also doesn't toggle playback while a button or link has focus.

On a phone or tablet, drag on the spectrogram with one finger. The layout stacks into a single column and the controls are sized for fingers.

## Files and limits

- **Formats:** uncompressed WAV is the most widely supported. MP3, OGG, FLAC and M4A work if your browser can decode them.
- **Size and length:** up to 30 MB and between 0.1 and 60 seconds.
- **Channels:** mono or stereo. Surround files aren't supported.
- **Sample rate:** your browser may convert the file to its own audio rate when opening it. The rate shown in the status bar is the one OVERTONE actually uses.

## When something goes wrong

| Message                                         | What it means and what to do                                                                                                                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "That file is larger than 30 MB"                | Trim the clip or export it at a lower quality, then import again. Your current sound is still loaded.                                                                                                     |
| "Choose a clip between 0.1 and 60 seconds long" | The clip is too long or too short, or its length can't be read. Trim it to between 0.1 and 60 seconds, or convert it to WAV if the length looks right.                                                    |
| "Choose mono or stereo audio"                   | The file has more than two channels. Export a stereo version first.                                                                                                                                       |
| "This file could not be decoded"                | Your browser can't open that format. Convert it to WAV and try again.                                                                                                                                     |
| "This browser could not read its duration"      | The file's length information is missing or unreadable. Convert it to WAV and try again.                                                                                                                  |
| "Widen the selection…"                          | The box is too small to make an audible change. Make it taller, wider, or both.                                                                                                                           |
| "12-edit limit reached"                         | Undo or reset some edits, or export and re-import the result to keep going.                                                                                                                               |
| "Some samples exceed full scale…"               | Parts of the sound are louder than a WAV can hold, so they'll distort on export. If an edit caused it, undo that edit. If the imported file was already that loud, lower its volume in another app first. |
| "This is taking longer than expected"           | The device is struggling with the clip. Try a shorter one, or pick an example to start over.                                                                                                              |
| "The audio processor stopped"                   | The background processor crashed. Press **Restart studio** to load a fresh example. Unsaved edits are lost.                                                                                               |
| "Audio could not start"                         | The browser has no working audio output or blocked sound. Check your output device and site sound permission, then press Play again.                                                                      |

## Privacy

Everything happens in your browser tab. Files are decoded and processed on your device and never uploaded. There are no accounts, no tracking and no analytics. The page only downloads its own code, fonts and icons.

## Want to know how it works?

The [methodology](methodology.md) explains the math, and its [limits and tradeoffs](methodology.md#limits-and-tradeoffs) section covers what spectral editing can't do.
