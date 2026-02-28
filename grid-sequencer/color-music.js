// ============================================================
// color-music.js — Color-to-Pitch Mapping System
// Pure functions, no library dependencies.
// ============================================================

// Scale definitions: semitone offsets from root within one octave
const SCALES = {
  chromatic:        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major:            [0, 2, 4, 5, 7, 9, 11],
  minor:            [0, 2, 3, 5, 7, 8, 10],
  pentatonic_major: [0, 2, 4, 7, 9],
  pentatonic_minor: [0, 3, 5, 7, 10],
  blues:            [0, 3, 5, 6, 7, 10],
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// --- RGB to HSL ---
// Returns { h: 0-360, s: 0-100, l: 0-100 }
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

// --- Is this block "active" (colored, not white/gray)? ---
function isActiveBlock(hsl, satThreshold, lightThreshold) {
  if (satThreshold === undefined) satThreshold = 15;
  if (lightThreshold === undefined) lightThreshold = 85;
  if (hsl.l > lightThreshold) return false;
  if (hsl.s < satThreshold) return false;
  return true;
}

// --- Map hue to a note name with octave ---
// hue: 0-360, rootNote: "C"/"F#"/etc, scaleName: key in SCALES
// row/totalRows determine octave, octaveRange sets span
function hueToNote(hue, rootNote, scaleName, row, totalRows, octaveRange) {
  if (octaveRange === undefined) octaveRange = 4;
  const scale = SCALES[scaleName] || SCALES.pentatonic_major;
  const rootIndex = NOTE_NAMES.indexOf(rootNote);
  if (rootIndex === -1) return 'C4'; // fallback

  // Hue 0 (red) = root, cycles through scale degrees
  const scalePosition = Math.floor((hue / 360) * scale.length) % scale.length;
  const semitoneOffset = scale[scalePosition];

  // Row → octave: top = high, bottom = low
  const baseOctave = 2;
  const octave = baseOctave + octaveRange - 1 - Math.floor((row / totalRows) * octaveRange);
  const clampedOctave = Math.max(baseOctave, Math.min(baseOctave + octaveRange - 1, octave));

  const noteIndex = (rootIndex + semitoneOffset) % 12;
  const noteName = NOTE_NAMES[noteIndex];
  const octaveAdjust = Math.floor((rootIndex + semitoneOffset) / 12);

  return noteName + (clampedOctave + octaveAdjust);
}

// --- Map saturation/lightness to velocity (0-1) ---
function hslToVelocity(hsl) {
  const satFactor = hsl.s / 100;
  const lightFactor = 1 - Math.abs(hsl.l - 50) / 50;
  const velocity = satFactor * 0.7 + lightFactor * 0.3;
  return Math.max(0.1, Math.min(1.0, velocity));
}

// --- Build note data for one block ---
// Returns { note, velocity, hue, saturation, lightness, row, col, r, g, b } or null
function blockToNoteData(avgR, avgG, avgB, row, col, totalRows, rootNote, scaleName, satThreshold, lightThreshold) {
  const hsl = rgbToHsl(avgR, avgG, avgB);
  if (!isActiveBlock(hsl, satThreshold, lightThreshold)) return null;

  const note = hueToNote(hsl.h, rootNote, scaleName, row, totalRows);
  const velocity = hslToVelocity(hsl);

  return {
    note: note,
    velocity: velocity,
    hue: hsl.h,
    saturation: hsl.s,
    lightness: hsl.l,
    row: row,
    col: col,
    r: avgR,
    g: avgG,
    b: avgB
  };
}
