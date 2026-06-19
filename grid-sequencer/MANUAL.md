# Grid Paper Step Sequencer — User Manual

Draw on grid paper. Photograph it. Play your drawing.

---

## Quick Start

1. **Click to Start** — the app needs a click to enable browser audio
2. **Load a photo** of your grid paper drawing (drag & drop or use the file picker)
3. **Press Play** — your drawing plays as music, left to right

That's the basics. The sections below explain every control and how color becomes sound.

---

## How Color Becomes Sound

The sequencer reads your image as a grid of cells. Each cell's color determines whether it plays a note, which note, and how loud.

### Hue → Pitch (which note)

The color wheel is divided evenly among the notes of the selected scale. With **C Major Pentatonic** (5 notes), the mapping is:

| Color          | Hue Range | Note |
|----------------|-----------|------|
| Red / Orange   | 0°–72°    | C    |
| Yellow / Green | 72°–144°  | D    |
| Green / Cyan   | 144°–216° | E    |
| Blue           | 216°–288° | G    |
| Purple / Pink  | 288°–360° | A    |

The **Color → Pitch** legend in the sidebar shows the exact mapping for the current scale and root note. Each swatch shows the vivid (loud) and pale (quiet) version.

Changing the scale changes how many hue slices there are. Blues has 6, Major has 7, Chromatic has 12.

### Row → Octave (high or low)

The vertical position of a colored cell determines the octave register:

- **Top of grid** = high octave (octave 5)
- **Bottom of grid** = low octave (octave 2)

The range spans 4 octaves. The same red at the top plays C5; the same red at the bottom plays C2.

### Saturation & Lightness → Volume

How vivid or saturated a color is determines how loud the note plays:

- **Vivid, saturated colors** (pure red, bright blue) → loud (high velocity)
- **Pale, washed-out colors** (pastel pink, light blue) → quiet (low velocity)
- **Very dark or very light colors** → quieter

The formula weights saturation at 70% and lightness at 30% of the final velocity.

### What Doesn't Play

A cell is silent (inactive) if:

- Its **chroma** (color intensity) is below the **Color Min** threshold — this filters paper texture, gray shadows, and pencil marks
- It's too close in color to the **white point** — this filters the paper itself
- Both checks must pass for a cell to be "active" and produce a note

---

## Grid Alignment

Matching the digital grid to the physical paper grid is the most important step for clean results. If the grid is misaligned, one drawn square might span multiple digital cells (creating duplicate notes) or two squares might merge into one cell.

### Measure Grid (recommended first step)

1. Click **Measure Grid** — the background photo appears automatically with a yellow crosshair
2. Click a **grid line intersection** on the photo — a yellow dot appears
3. Click an **adjacent intersection** (one square away, horizontally or vertically)
4. The app measures the pixel distance and sets the cell size automatically

This works for horizontal, vertical, or diagonal clicks. The app detects the orientation and computes the correct single-cell size.

### Paper Grid Rows (alternative)

If you know the exact number of rows on your paper (e.g., 31 rows), type it in the **Paper Grid Rows** field. The app divides the image height by that number to compute the cell size. This works best for tightly cropped photos with minimal margins.

### Cell Size (fine-tune)

The **Cell Size** slider (4–80 px) sets the pixel dimension of each sampling cell in the source image. Use this to fine-tune after measuring, or set it manually.

### X / Y Offset

After setting the cell size, the grid origin may not align with the paper's grid origin. Use the **X Offset** and **Y Offset** sliders (0–60 px) to nudge the sampling grid until the digital grid lines sit on top of the paper grid lines.

### Show Photo Behind Grid

Check **Show photo behind grid** to see the original photo faintly behind the colored cells. This is essential for alignment — you can visually compare the digital grid lines with the paper grid lines. Active cells become semi-transparent so you can see through them. Inactive cells disappear entirely, letting the paper show through.

### Alignment Workflow

1. Load your photo
2. Check "Show photo behind grid"
3. Click **Measure Grid** and click two adjacent intersections
4. Nudge **X Offset** until vertical lines align
5. Nudge **Y Offset** until horizontal lines align
6. Uncheck "Show photo" when satisfied — you should see clean colored cells

---

## Playback Controls

### Transport

- **Play** — starts playback from the beginning (left to right, looping)
- **Pause** — freezes playback at the current position
- **Stop** — stops and resets to the beginning

The yellow playhead column shows which step is currently playing.

### Tempo

The **Tempo** slider controls speed in BPM (30–300). Each grid column is one eighth-note step. At 120 BPM, the sequencer plays 4 columns per second.

### Volume

The **Volume** slider (0–100%) controls the master output level.

---

## Musical Controls

### Scale

Choose which musical scale the hue-to-pitch mapping uses:

| Scale            | Notes | Character                |
|------------------|-------|--------------------------|
| Major Pentatonic | 5     | Bright, pleasant, safe   |
| Minor Pentatonic | 5     | Bluesy, soulful          |
| Major            | 7     | Happy, complete          |
| Natural Minor    | 7     | Sad, dramatic            |
| Blues             | 6     | Bluesy with a blue note  |
| Chromatic        | 12    | All 12 notes — atonal    |

Fewer notes (pentatonic) = more consonant, harder to sound "wrong." More notes (chromatic) = more variety but can sound dissonant.

### Root Note

Sets the starting note of the scale (C through B). Changing from C to G transposes the entire mapping — all colors shift to notes in the new key.

### Color → Pitch Legend

This visual reference shows the current mapping. Each row displays:

- **Note letter** (e.g., C, D, E)
- **Color swatch** — left half is vivid (loud), right half is pale (quiet)
- **Hue range** in degrees

The legend updates live when you change the scale or root note. Use it to plan which marker colors to draw with.

### Default Synth

Choose the synthesis engine:

| Synth          | Character                        |
|----------------|----------------------------------|
| Synth          | Clean, simple tone               |
| FM Synth       | Metallic, bell-like              |
| AM Synth       | Warm, tremolo-like modulation    |
| Pluck Synth    | Plucked string, guitar-like      |
| Membrane Synth | Drum-like, percussive            |
| Metal Synth    | Harsh, metallic percussion       |

You can also click the **column headers** above the grid to cycle the synth type for individual columns (displayed as 3-letter abbreviations).

---

## Paint & Erase

You can edit the grid directly without reloading the image.

### Paint

1. Choose a color with the **color picker** swatch
2. Click **Paint** (turns green when active)
3. Click or drag on grid cells to color them

Painted cells are immediately active and produce notes based on their color (same hue/saturation rules apply).

### Erase

1. Click **Erase** (turns green when active)
2. Click or drag on grid cells to remove them

Erased cells become dark gray and silent.

Paint and Erase are mutually exclusive — activating one deactivates the other (and any other active tool).

---

## White Point Calibration

Photos of paper are never pure white — they pick up lighting color, shadows, and paper texture. The white point system tells the app "this is what the paper looks like" so it can separate paper from drawn marks.

### Multi-Sample Picking

1. Click **Pick from grid** — the button turns green
2. Click several **white/paper areas** across the image — corners, center, edges with different lighting
3. Each click adds a sample; the average updates live
4. The swatch and label show the running average (e.g., "3 samples → avg rgb(230, 225, 218)")
5. Click the button again (or switch to another tool) to finish

Sampling multiple areas is important for photos with uneven lighting. The average gives a more robust paper color reference than a single point.

### Reset

Click **Reset** to clear all white point samples and start over. The app reverts to chroma-only filtering (no white point distance check).

### Tolerance

The **Tolerance** slider (5–300) sets how far in RGB distance a cell must be from the white point to count as "colored." Higher values = more aggressive filtering (fewer active cells). Lower values = more sensitive (more cells pass).

### Color Min (Chroma)

The **Color Min** slider (5–100) sets the minimum raw color intensity required. This is the difference between the brightest and dimmest RGB channel in a cell. It filters:

- Paper texture and slight color variation
- Gray shadows
- JPEG compression noise
- Pencil marks (which are gray, not colored)

Higher values = only vivid colors pass. Lower values = fainter marks are included.

### Tuning Tips

- Start with **Color Min: 30** and **Tolerance: 50**
- If too many paper cells are active, increase Tolerance or Color Min
- If drawn marks aren't showing, decrease them
- The **Active cells** count in the info display helps — it should roughly match the number of colored squares on your paper

---

## Info Display

At the bottom of the sidebar:

- **Grid** — current grid dimensions (columns x rows)
- **Active cells** — how many cells contain detected color (turns red if zero)
- **Step** — current playback position (e.g., "5 / 20")

---

## Technical Notes

- Built with **p5.js** (canvas/image processing) and **Tone.js** (audio synthesis)
- Uses a shared pool of **4 PolySynths** with round-robin allocation to avoid audio graph overload on large grids
- Maximum **6 simultaneous voices** per step (duplicate notes within a column are deduplicated, keeping the loudest velocity)
- Pitch range spans **octaves 2–5** (C2 to B5)
- Image processing uses **pixel averaging** per cell block — the average RGB of all pixels in a cell determines its color
- All processing is client-side — no images are uploaded anywhere
