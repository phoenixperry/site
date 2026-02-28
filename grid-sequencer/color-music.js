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

// --- Euclidean RGB distance ---
function rgbDistance(r1, g1, b1, r2, g2, b2) {
  var dr = r1 - r2;
  var dg = g1 - g2;
  var db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// --- Raw chroma: how "colorful" a pixel actually looks ---
// Unlike HSL saturation, this doesn't inflate for near-white pastels.
// Range 0-255: gray/white=0, vivid color=high.
function rgbChroma(r, g, b) {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

// --- Is this block "active" (colored, not close to the white point)? ---
// Uses RGB distance from white point AND chroma (raw colorfulness) to
// robustly separate real colored marks from paper texture/shadows.
// minChroma: minimum raw color difference to count as "colored" (default 30)
function isActiveBlock(r, g, b, whitePoint, tolerance, minChroma) {
  if (minChroma === undefined) minChroma = 30;

  // Chroma check: the block must have meaningful color.
  // This filters paper texture, shadows, and faint JPEG noise.
  var chroma = rgbChroma(r, g, b);
  if (chroma < minChroma) return false;

  if (!whitePoint) {
    // No white point set: chroma check above is the main filter,
    // also reject very light blocks (near-white paper)
    var hsl = rgbToHsl(r, g, b);
    return hsl.l <= 88;
  }

  // With white point: must also be far enough from paper color
  var dist = rgbDistance(r, g, b, whitePoint.r, whitePoint.g, whitePoint.b);
  return dist > tolerance;
}

// --- Build the full list of notes for a given root + scale across octaves ---
// Returns e.g. ['C2','D2','E2','G2','A2','C3','D3',...] for C pentatonic_major
function buildNotePool(rootNote, scaleName, octaveRange) {
  if (octaveRange === undefined) octaveRange = 4;
  var scale = SCALES[scaleName] || SCALES.pentatonic_major;
  var rootIndex = NOTE_NAMES.indexOf(rootNote);
  if (rootIndex === -1) rootIndex = 0;
  var baseOctave = 2;
  var pool = [];

  for (var oct = 0; oct < octaveRange; oct++) {
    for (var d = 0; d < scale.length; d++) {
      var semitone = scale[d];
      var noteIdx = (rootIndex + semitone) % 12;
      var octAdjust = Math.floor((rootIndex + semitone) / 12);
      var noteName = NOTE_NAMES[noteIdx];
      var octave = baseOctave + oct + octAdjust;
      pool.push(noteName + octave);
    }
  }
  return pool;
}

// --- Map hue + row to a note from the full available pitch range ---
// Hue selects the scale degree (which note within the scale), row selects
// the octave register (top row = high, bottom row = low).  This spreads
// notes across ALL available pitches so even a 5-note pentatonic scale
// produces varied, musical results across the grid.
function hueToNote(hue, rootNote, scaleName, row, totalRows, octaveRange) {
  if (octaveRange === undefined) octaveRange = 4;
  const scale = SCALES[scaleName] || SCALES.pentatonic_major;
  const rootIndex = NOTE_NAMES.indexOf(rootNote);
  if (rootIndex === -1) return 'C4'; // fallback

  var pool = buildNotePool(rootNote, scaleName, octaveRange);
  if (pool.length === 0) return 'C4';

  // Hue selects which scale degree (0 to scale.length-1)
  var scaleDegree = Math.floor((hue / 360) * scale.length) % scale.length;

  // Row selects which octave: top row (row 0) = highest octave, bottom = lowest
  var octaveIndex = octaveRange - 1 - Math.floor((row / Math.max(totalRows, 1)) * octaveRange);
  octaveIndex = Math.max(0, Math.min(octaveRange - 1, octaveIndex));

  // Combine: index into the full note pool
  var poolIndex = octaveIndex * scale.length + scaleDegree;
  poolIndex = Math.max(0, Math.min(pool.length - 1, poolIndex));

  return pool[poolIndex];
}

// --- Map saturation/lightness to velocity (0-1) ---
function hslToVelocity(hsl) {
  const satFactor = hsl.s / 100;
  const lightFactor = 1 - Math.abs(hsl.l - 50) / 50;
  const velocity = satFactor * 0.7 + lightFactor * 0.3;
  return Math.max(0.1, Math.min(1.0, velocity));
}

// --- HSL to RGB (for legend swatches) ---
// h: 0-360, s: 0-100, l: 0-100 → { r, g, b } each 0-255
function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  var r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

// --- Build legend data: one entry per scale degree ---
// Returns array of { note, hueStart, hueEnd, hueMid, color: {r,g,b}, colorDim: {r,g,b} }
// note is the note name at a middle octave (octave 3)
// color is vivid (full sat), colorDim is desaturated (showing quiet velocity)
function buildLegendData(rootNote, scaleName) {
  var scale = SCALES[scaleName] || SCALES.pentatonic_major;
  var rootIndex = NOTE_NAMES.indexOf(rootNote);
  if (rootIndex === -1) rootIndex = 0;
  var n = scale.length;
  var legend = [];

  for (var d = 0; d < n; d++) {
    var hueStart = (d / n) * 360;
    var hueEnd = ((d + 1) / n) * 360;
    var hueMid = (hueStart + hueEnd) / 2;

    // Note name at middle octave
    var semitone = scale[d];
    var noteIdx = (rootIndex + semitone) % 12;
    var octAdjust = Math.floor((rootIndex + semitone) / 12);
    var noteName = NOTE_NAMES[noteIdx] + (3 + octAdjust);

    // Vivid color (full saturation, mid lightness) → loud
    var vivid = hslToRgb(hueMid, 100, 50);
    // Dim color (low saturation, lighter) → quiet
    var dim = hslToRgb(hueMid, 35, 70);

    legend.push({
      note: noteName,
      noteLetter: NOTE_NAMES[noteIdx],
      hueStart: hueStart,
      hueEnd: hueEnd,
      hueMid: hueMid,
      color: vivid,
      colorDim: dim
    });
  }
  return legend;
}

// --- Build note data for one block ---
// Returns { note, velocity, hue, saturation, lightness, row, col, r, g, b } or null
function blockToNoteData(avgR, avgG, avgB, row, col, totalRows, rootNote, scaleName, whitePoint, tolerance, minChroma) {
  if (!isActiveBlock(avgR, avgG, avgB, whitePoint, tolerance, minChroma)) return null;
  const hsl = rgbToHsl(avgR, avgG, avgB);

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
