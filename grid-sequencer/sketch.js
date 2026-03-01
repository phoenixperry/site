// ============================================================
// sketch.js — p5.js Canvas, Image Processing, Grid Rendering
// ============================================================

var BLOCK_SIZE = 20;
var sourceImage = null;
var gridRows = 0;
var gridCols = 0;
var gridData = [];
var playheadCol = -1;
var cellDisplaySize = 20;
var gridOffsetX = 0;
var gridOffsetY = 0;
var audioStarted = false;
var imageLoaded = false;

var currentRootNote = 'C';
var currentScale = 'pentatonic_major';
var currentSynthType = 'Synth';
var whitePoint = null;         // { r, g, b } averaged from paper samples
var whiteTolerance = 50;       // RGB distance threshold
var minChroma = 30;            // minimum color intensity to count as colored
var pickingWhitePoint = false; // true while in multi-sample picking mode
var whiteSamples = [];         // array of { r, g, b } — all sampled white points
var paintMode = false;         // true when paint tool is active
var eraseMode = false;         // true when erase tool is active
var paintColor = { r: 255, g: 0, b: 0 };  // current paint color (derived from hue+sat)
var paintHue = 0;              // paint hue 0-360
var paintSat = 100;            // paint saturation 0-100
var sampleOffsetX = 0;         // pixel offset into source image for grid alignment
var sampleOffsetY = 0;
var showPhoto = false;          // show source image behind grid

// Grid measurement mode: click two points to detect cell size
var measuringGrid = false;      // true while in measurement mode
var measurePoint1 = null;       // { sx, sy } — first click in source-image pixel coords
var measureClickCount = 0;      // 0 = waiting for first click, 1 = waiting for second

// Phase 2: Auto-straighten
var originalSourceImage = null;  // unrotated original
var rotationAngle = 0;           // degrees, -15 to +15

// Phase 3: Zoom/pan
var viewZoom = 1.0;
var viewPanX = 0, viewPanY = 0;
var MIN_ZOOM = 0.5, MAX_ZOOM = 10.0;
var isPanning = false;
var panStartX, panStartY, panStartViewX, panStartViewY;

// Phase 4: Touch state
var touchState = {
  lastPinchDist: 0,
  lastMidX: 0,
  lastMidY: 0,
  isPinching: false
};

// --- p5 setup ---
function setup() {
  var container = document.getElementById('canvas-container');
  var cw = container.offsetWidth;
  var ch = container.offsetHeight;
  var canvas = createCanvas(cw, ch);
  canvas.parent('canvas-container');

  // Phase 4: Retina support (capped at 2x for performance)
  pixelDensity(Math.min(window.devicePixelRatio || 1, 2));

  // Phase 4: Prevent iOS Safari bounce/scroll on canvas
  canvas.elt.style.touchAction = 'none';

  background(30);
  wireControls();
  initSequencer();
  renderLegend();
  drawEmptyState();
}

// --- p5 draw loop ---
function draw() {
  if (!imageLoaded) return;
  background(30);

  // Phase 3: Apply zoom/pan transform
  push();
  translate(viewPanX, viewPanY);
  scale(viewZoom);

  drawGrid();
  drawPlayhead();
  drawColumnHeaders();
  drawMeasureOverlay();

  pop();
}

// --- Phase 1: Wire collapsible section toggles ---
function wireSectionToggles() {
  var headers = document.querySelectorAll('.section-header');
  for (var i = 0; i < headers.length; i++) {
    headers[i].addEventListener('click', function() {
      this.parentElement.classList.toggle('collapsed');
    });
  }
}

// --- Wire DOM controls ---
function wireControls() {
  // Phase 1: Section toggles
  wireSectionToggles();

  // Audio start overlay
  document.getElementById('start-audio-btn').addEventListener('click', function() {
    Tone.start().then(function() {
      audioStarted = true;
      document.getElementById('audio-start-overlay').style.display = 'none';
      document.getElementById('play-btn').disabled = false;
      document.getElementById('stop-btn').disabled = false;
      document.getElementById('pause-btn').disabled = false;
    });
  });

  // File input
  document.getElementById('image-input').addEventListener('change', function(e) {
    if (e.target.files && e.target.files[0]) {
      loadImageFromFile(e.target.files[0]);
    }
  });

  // Drag-and-drop
  var dropZone = document.getElementById('drop-zone');
  dropZone.addEventListener('dragover', function(e) {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', function() {
    dropZone.classList.remove('drag-over');
  });
  dropZone.addEventListener('drop', function(e) {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      loadImageFromFile(e.dataTransfer.files[0]);
    }
  });

  // Click drop zone to trigger file input
  dropZone.addEventListener('click', function() {
    document.getElementById('image-input').click();
  });

  // Blank grid — start fresh without a photo
  document.getElementById('blank-grid-btn').addEventListener('click', function() {
    createBlankGrid();
  });

  // Phase 2: Rotation slider
  document.getElementById('rotation-slider').addEventListener('input', function(e) {
    rotationAngle = parseFloat(e.target.value);
    document.getElementById('rotation-display').textContent = rotationAngle.toFixed(1);
    if (originalSourceImage) {
      applyRotation(rotationAngle);
    }
  });

  // Phase 2: Auto straighten button
  document.getElementById('auto-straighten-btn').addEventListener('click', function() {
    if (originalSourceImage) {
      autoStraighten();
    }
  });

  // Paper grid rows — compute block size from target row count
  document.getElementById('target-rows-input').addEventListener('change', function(e) {
    var targetRows = parseInt(e.target.value);
    if (!targetRows || targetRows < 1 || !sourceImage) return;
    var imgH = sourceImage.height - sampleOffsetY;
    var newBlockSize = Math.floor(imgH / targetRows);
    newBlockSize = Math.max(4, Math.min(80, newBlockSize));
    BLOCK_SIZE = newBlockSize;
    document.getElementById('block-size-slider').value = BLOCK_SIZE;
    document.getElementById('block-size-display').textContent = BLOCK_SIZE;
    if (imageLoaded) {
      if (isPlaying) stopPlayback();
      processImage();
    }
  });

  // Cell size slider (fine-tune block size in pixels)
  document.getElementById('block-size-slider').addEventListener('input', function(e) {
    BLOCK_SIZE = parseInt(e.target.value);
    document.getElementById('block-size-display').textContent = BLOCK_SIZE;
    if (imageLoaded) {
      if (isPlaying) stopPlayback();
      processImage();
      syncRowsDisplay();
    }
  });

  // Grid X offset
  document.getElementById('offset-x-slider').addEventListener('input', function(e) {
    sampleOffsetX = parseInt(e.target.value);
    document.getElementById('offset-x-display').textContent = sampleOffsetX;
    if (imageLoaded) {
      if (isPlaying) stopPlayback();
      processImage();
    }
  });

  // Grid Y offset
  document.getElementById('offset-y-slider').addEventListener('input', function(e) {
    sampleOffsetY = parseInt(e.target.value);
    document.getElementById('offset-y-display').textContent = sampleOffsetY;
    if (imageLoaded) {
      if (isPlaying) stopPlayback();
      processImage();
    }
  });

  // Show photo behind grid
  document.getElementById('show-photo-cb').addEventListener('change', function(e) {
    showPhoto = e.target.checked;
  });

  // Measure grid — click two points to detect cell size
  document.getElementById('measure-grid-btn').addEventListener('click', function() {
    if (!sourceImage) {
      document.getElementById('measure-status').textContent = 'Load an image first';
      return;
    }
    measuringGrid = !measuringGrid;
    if (measuringGrid) {
      measureClickCount = 0;
      measurePoint1 = null;
      paintMode = false;
      eraseMode = false;
      deactivateWhitePointPicking();
      document.getElementById('paint-btn').classList.remove('active');
      document.getElementById('erase-btn').classList.remove('active');
      showPhoto = true;
      document.getElementById('show-photo-cb').checked = true;
      this.classList.add('measuring');
      this.textContent = 'Click 1st intersection...';
      document.getElementById('measure-status').textContent = 'Click a grid line intersection on the photo';
    } else {
      deactivateMeasuring();
    }
  });

  // Auto detect grid button
  document.getElementById('auto-detect-grid-btn').addEventListener('click', function() {
    if (!sourceImage) {
      document.getElementById('auto-detect-status').textContent = 'Load an image first';
      return;
    }
    autoDetectGrid();
  });

  // Transport
  document.getElementById('play-btn').addEventListener('click', function() {
    if (!imageLoaded || !audioStarted) return;
    if (isPlaying) return;
    startPlayback(gridData, parseInt(document.getElementById('tempo-slider').value));
  });

  document.getElementById('stop-btn').addEventListener('click', function() {
    stopPlayback();
  });

  document.getElementById('pause-btn').addEventListener('click', function() {
    if (isPlaying) {
      pausePlayback();
    } else {
      resumePlayback();
    }
  });

  // Tempo
  document.getElementById('tempo-slider').addEventListener('input', function(e) {
    var bpm = parseInt(e.target.value);
    document.getElementById('tempo-display').textContent = bpm;
    setTempo(bpm);
  });

  // Volume
  document.getElementById('volume-slider').addEventListener('input', function(e) {
    var vol = parseInt(e.target.value);
    document.getElementById('volume-display').textContent = vol;
    setMasterVolume(vol);
  });

  // Scale — recompute notes + update legend
  document.getElementById('scale-select').addEventListener('change', function(e) {
    currentScale = e.target.value;
    recomputeNoteData();
    renderLegend();
  });

  // Root note — recompute notes + update legend
  document.getElementById('root-select').addEventListener('change', function(e) {
    currentRootNote = e.target.value;
    recomputeNoteData();
    renderLegend();
  });

  // Default synth — rebuild all column synths
  document.getElementById('synth-select').addEventListener('change', function(e) {
    currentSynthType = e.target.value;
    if (gridCols > 0) {
      buildColumnSynths(gridCols, currentSynthType);
    }
  });

  // Paint tool
  document.getElementById('paint-btn').addEventListener('click', function() {
    paintMode = !paintMode;
    if (paintMode) {
      eraseMode = false;
      deactivateWhitePointPicking();
      deactivateMeasuring();
      document.getElementById('erase-btn').classList.remove('active');
    }
    this.classList.toggle('active', paintMode);
  });

  // Erase tool
  document.getElementById('erase-btn').addEventListener('click', function() {
    eraseMode = !eraseMode;
    if (eraseMode) {
      paintMode = false;
      deactivateWhitePointPicking();
      deactivateMeasuring();
      document.getElementById('paint-btn').classList.remove('active');
    }
    this.classList.toggle('active', eraseMode);
  });

  // Paint hue slider
  document.getElementById('paint-hue-slider').addEventListener('input', function(e) {
    paintHue = parseInt(e.target.value);
    document.getElementById('paint-hue-display').textContent = paintHue;
    updatePaintColor();
  });

  // Paint saturation slider
  document.getElementById('paint-sat-slider').addEventListener('input', function(e) {
    paintSat = parseInt(e.target.value);
    document.getElementById('paint-sat-display').textContent = paintSat;
    updatePaintColor();
  });

  // White point picker (multi-sample: stays in picking mode until toggled off)
  document.getElementById('pick-white-btn').addEventListener('click', function() {
    if (!imageLoaded) return;
    pickingWhitePoint = !pickingWhitePoint;
    if (pickingWhitePoint) {
      whiteSamples = [];
      paintMode = false;
      eraseMode = false;
      deactivateMeasuring();
      document.getElementById('paint-btn').classList.remove('active');
      document.getElementById('erase-btn').classList.remove('active');
    } else {
      if (whiteSamples.length > 0) {
        finalizeWhitePoint();
      }
    }
    this.classList.toggle('picking', pickingWhitePoint);
    this.textContent = pickingWhitePoint ? 'Click white areas... (click again to finish)' : 'Pick from grid';
  });

  // Reset white point — clear all samples
  document.getElementById('reset-white-btn').addEventListener('click', function() {
    whiteSamples = [];
    whitePoint = null;
    deactivateWhitePointPicking();
    document.getElementById('white-point-swatch').style.background = '#fff';
    document.getElementById('white-point-label').textContent = 'Click multiple white areas for best results';
    recomputeNoteData();
  });

  // Auto-detect white point (paper color) button
  document.getElementById('auto-detect-white-btn').addEventListener('click', function() {
    if (!sourceImage) {
      document.getElementById('white-point-label').textContent = 'Load an image first';
      return;
    }
    autoDetectWhite();
  });

  // White tolerance
  document.getElementById('white-tolerance').addEventListener('input', function(e) {
    whiteTolerance = parseInt(e.target.value);
    document.getElementById('tolerance-display').textContent = whiteTolerance;
    recomputeNoteData();
  });

  // Chroma (color minimum intensity)
  document.getElementById('chroma-slider').addEventListener('input', function(e) {
    minChroma = parseInt(e.target.value);
    document.getElementById('chroma-display').textContent = minChroma;
    recomputeNoteData();
  });

  // Phase 3: Zoom reset button
  document.getElementById('reset-zoom-btn').addEventListener('click', function() {
    viewZoom = 1.0;
    viewPanX = 0;
    viewPanY = 0;
    updateZoomDisplay();
  });

  // Phase 4: Mobile panel toggle
  // Stop touch events from propagating to p5's window-level handlers
  // (p5.js registers touchStarted on window, which steals touches from UI controls)
  var toggleBtn = document.getElementById('mobile-panel-toggle');
  toggleBtn.addEventListener('touchstart', function(e) { e.stopPropagation(); }, { passive: true });
  toggleBtn.addEventListener('click', function() {
    var panel = document.getElementById('control-panel');
    var isVisible = panel.classList.toggle('mobile-visible');
    this.innerHTML = isVisible ? '&#10005;' : '&#9776;';
    this.classList.toggle('panel-open', isVisible);
    // Recalculate canvas size after panel show/hide
    setTimeout(function() {
      windowResized();
    }, 50);
  });

  // Prevent p5 from intercepting touch events on the control panel (sliders, buttons, etc.)
  var controlPanel = document.getElementById('control-panel');
  controlPanel.addEventListener('touchstart', function(e) { e.stopPropagation(); }, { passive: true });
  controlPanel.addEventListener('touchmove', function(e) { e.stopPropagation(); }, { passive: true });
  controlPanel.addEventListener('touchend', function(e) { e.stopPropagation(); }, { passive: true });

  // Phase 4: Orientation change
  window.addEventListener('orientationchange', function() {
    setTimeout(function() {
      windowResized();
    }, 300);
  });
}

// --- Phase 2: Load image from File object ---
function loadImageFromFile(file) {
  var url = URL.createObjectURL(file);
  loadImage(url, function(img) {
    originalSourceImage = img;  // Store unrotated original
    rotationAngle = 0;
    // Reset rotation slider
    document.getElementById('rotation-slider').value = 0;
    document.getElementById('rotation-display').textContent = '0.0';
    // Reset zoom/pan for new image
    viewZoom = 1.0;
    viewPanX = 0;
    viewPanY = 0;
    updateZoomDisplay();
    sourceImage = img;
    processImage();
    URL.revokeObjectURL(url);
  }, function(err) {
    console.error('Failed to load image:', err);
    alert('Could not load image. Please try a JPG or PNG file.');
  });
}

// --- Create a blank white grid for drawing from scratch ---
function createBlankGrid() {
  var cols = 16, rows = 12;
  var imgW = cols * BLOCK_SIZE;
  var imgH = rows * BLOCK_SIZE;

  // Create white image via p5's createImage
  var img = createImage(imgW, imgH);
  img.loadPixels();
  for (var i = 0; i < img.pixels.length; i += 4) {
    img.pixels[i] = 255;      // R
    img.pixels[i+1] = 255;    // G
    img.pixels[i+2] = 255;    // B
    img.pixels[i+3] = 255;    // A
  }
  img.updatePixels();

  // Set as source (reuses entire pipeline)
  originalSourceImage = img;
  sourceImage = img;
  rotationAngle = 0;
  sampleOffsetX = 0;
  sampleOffsetY = 0;

  // Reset zoom/pan/rotation UI
  viewZoom = 1.0;
  viewPanX = 0;
  viewPanY = 0;
  updateZoomDisplay();
  document.getElementById('rotation-slider').value = 0;
  document.getElementById('rotation-display').textContent = '0.0';

  // Set white point directly (skip auto-detect — we know it's white)
  whitePoint = { r: 255, g: 255, b: 255 };
  whiteSamples = [{ r: 255, g: 255, b: 255 }];
  document.getElementById('white-point-swatch').style.background = '#fff';
  document.getElementById('white-point-label').textContent = 'Blank grid (white)';

  // Process the blank image through normal pipeline
  processImage();

  // Auto-activate paint mode + expand Paint Tools section
  paintMode = true;
  eraseMode = false;
  document.getElementById('paint-btn').classList.add('active');
  document.getElementById('erase-btn').classList.remove('active');
  var paintSection = document.getElementById('section-paint');
  if (paintSection) paintSection.classList.remove('collapsed');
}

// --- Phase 2: Apply rotation to original image ---
function applyRotation(angleDeg) {
  if (!originalSourceImage) return;

  rotationAngle = angleDeg;

  // Skip rotation for tiny angles — use original directly
  if (Math.abs(angleDeg) < 0.05) {
    sourceImage = originalSourceImage;
    processImage();
    return;
  }

  var rad = angleDeg * Math.PI / 180;
  var cosA = Math.abs(Math.cos(rad));
  var sinA = Math.abs(Math.sin(rad));

  var origW = originalSourceImage.width;
  var origH = originalSourceImage.height;

  // Compute rotated bounding box
  var newW = Math.ceil(origW * cosA + origH * sinA);
  var newH = Math.ceil(origH * cosA + origW * sinA);

  // Create offscreen canvas for rotation
  var offCanvas = document.createElement('canvas');
  offCanvas.width = newW;
  offCanvas.height = newH;
  var ctx = offCanvas.getContext('2d');

  // Fill with white background (avoid transparent edges)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, newW, newH);

  // Draw rotated image
  ctx.translate(newW / 2, newH / 2);
  ctx.rotate(rad);
  originalSourceImage.loadPixels();
  ctx.drawImage(originalSourceImage.canvas, -origW / 2, -origH / 2);

  // Convert back to p5 image
  var rotatedImg = createImage(newW, newH);
  rotatedImg.drawingContext.drawImage(offCanvas, 0, 0);
  rotatedImg.loadPixels();

  sourceImage = rotatedImg;
  processImage();
}

// --- Phase 2: Auto-straighten using gradient direction histogram ---
function autoStraighten() {
  if (!originalSourceImage) return;

  originalSourceImage.loadPixels();
  var pixels = originalSourceImage.pixels;
  var origW = originalSourceImage.width;
  var origH = originalSourceImage.height;

  // Downsample to ~400px wide for performance
  var downScale = Math.min(1, 400 / origW);
  var w = Math.floor(origW * downScale);
  var h = Math.floor(origH * downScale);

  // Create grayscale buffer (downsampled)
  var gray = new Float32Array(w * h);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var sx = Math.floor(x / downScale);
      var sy = Math.floor(y / downScale);
      var idx = (sy * origW + sx) * 4;
      gray[y * w + x] = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
    }
  }

  // Sobel edge detection + gradient direction histogram
  var binSize = 0.1; // degrees per bin
  var numBins = Math.ceil(180 / binSize);
  var histogram = new Float32Array(numBins);

  for (var y = 1; y < h - 1; y++) {
    for (var x = 1; x < w - 1; x++) {
      // Sobel kernels
      var gx = -gray[(y - 1) * w + (x - 1)] + gray[(y - 1) * w + (x + 1)]
             - 2 * gray[y * w + (x - 1)]     + 2 * gray[y * w + (x + 1)]
             - gray[(y + 1) * w + (x - 1)]   + gray[(y + 1) * w + (x + 1)];

      var gy = -gray[(y - 1) * w + (x - 1)] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + (x + 1)]
             + gray[(y + 1) * w + (x - 1)]   + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + (x + 1)];

      var magnitude = Math.sqrt(gx * gx + gy * gy);
      if (magnitude < 30) continue; // skip weak edges

      // Gradient direction → edge direction is perpendicular
      var angle = Math.atan2(gy, gx) * 180 / Math.PI;
      // Normalize to 0-180 range
      var edgeAngle = ((angle + 90) % 180 + 180) % 180;

      var bin = Math.floor(edgeAngle / binSize);
      if (bin >= 0 && bin < numBins) {
        histogram[bin] += magnitude;
      }
    }
  }

  // Find dominant angle near 0° (horizontal lines) and 90° (vertical lines)
  // Search within ±15° of horizontal (0°/180°) and vertical (90°)
  var bestAngle = 0;
  var bestScore = 0;

  // Helper to score a bin with smoothing
  function scoreBin(centerBin) {
    var score = 0;
    for (var offset = -3; offset <= 3; offset++) {
      var b = centerBin + offset;
      // Wrap around
      if (b < 0) b += numBins;
      if (b >= numBins) b -= numBins;
      score += histogram[b];
    }
    return score;
  }

  // Search around 0°/180° (horizontal edges)
  for (var deg = -15; deg <= 15; deg += binSize) {
    var normalizedDeg = ((deg % 180) + 180) % 180;
    var bin = Math.floor(normalizedDeg / binSize);
    var score = scoreBin(bin);
    if (score > bestScore) {
      bestScore = score;
      bestAngle = deg;
    }
  }

  // Search around 90° (vertical edges)
  for (var deg = 75; deg <= 105; deg += binSize) {
    var bin = Math.floor(deg / binSize);
    var score = scoreBin(bin);
    if (score > bestScore) {
      bestScore = score;
      bestAngle = deg - 90; // deviation from vertical
    }
  }

  // The correction angle is the negative of the detected deviation
  var correction = -bestAngle;
  correction = Math.max(-15, Math.min(15, correction));

  // Apply the correction
  rotationAngle = correction;
  document.getElementById('rotation-slider').value = correction;
  document.getElementById('rotation-display').textContent = correction.toFixed(1);
  applyRotation(correction);
}

// --- Find dominant period in a 1D projection via autocorrelation ---
// Returns the lag (period) with the strongest peak, or 0 if none found.
function findPeriodByAutocorrelation(projection, minLag, maxLag) {
  var n = projection.length;
  if (maxLag >= n) maxLag = n - 1;
  if (minLag > maxLag) return 0;

  // Subtract mean to remove DC bias
  var mean = 0;
  for (var i = 0; i < n; i++) mean += projection[i];
  mean /= n;

  // Compute lag-0 autocorrelation (total energy) for normalization
  var acZero = 0;
  for (var i = 0; i < n; i++) {
    var v = projection[i] - mean;
    acZero += v * v;
  }
  if (acZero < 1e-6) return 0; // flat signal, no edges

  // Find best lag
  var bestLag = 0;
  var bestScore = 0;

  for (var lag = minLag; lag <= maxLag; lag++) {
    var ac = 0;
    for (var i = 0; i < n - lag; i++) {
      ac += (projection[i] - mean) * (projection[i + lag] - mean);
    }
    var normalized = ac / acZero;
    if (normalized > bestScore) {
      bestScore = normalized;
      bestLag = lag;
    }
  }

  // Confidence check: periodic signal should produce score > 0.10
  if (bestScore < 0.10) return 0;

  // Sub-pixel parabolic refinement around the peak
  if (bestLag > minLag && bestLag < maxLag) {
    var acPrev = 0, acNext = 0;
    for (var i = 0; i < n - bestLag - 1; i++) {
      acPrev += (projection[i] - mean) * (projection[i + bestLag - 1] - mean);
      acNext += (projection[i] - mean) * (projection[i + bestLag + 1] - mean);
    }
    acPrev /= acZero;
    acNext /= acZero;
    var denom = 2 * (2 * bestScore - acPrev - acNext);
    if (Math.abs(denom) > 1e-6) {
      var delta = (acPrev - acNext) / denom;
      if (Math.abs(delta) < 0.5) {
        bestLag = bestLag + delta;
      }
    }
  }

  return bestLag;
}

// --- Find phase offset via epoch folding ---
// Folds the projection modulo the period, averages, finds peak position.
function findPhaseOffset(projection, period) {
  var n = projection.length;
  var intPeriod = Math.round(period);
  if (intPeriod < 2 || intPeriod >= n) return 0;

  // Fold projection into one period and average
  var folded = new Float32Array(intPeriod);
  var counts = new Float32Array(intPeriod);

  for (var i = 0; i < n; i++) {
    var bin = i % intPeriod;
    folded[bin] += projection[i];
    counts[bin]++;
  }

  for (var i = 0; i < intPeriod; i++) {
    if (counts[i] > 0) folded[i] /= counts[i];
  }

  // Find the peak of the folded signal — that's where grid lines fall
  var bestBin = 0;
  var bestVal = folded[0];
  for (var i = 1; i < intPeriod; i++) {
    if (folded[i] > bestVal) {
      bestVal = folded[i];
      bestBin = i;
    }
  }

  return bestBin;
}

// --- Core grid detection: directional edge projection + autocorrelation ---
// Returns { blockSize, offsetX, offsetY } or null if no grid detected.
function detectGridParameters(img) {
  img.loadPixels();
  var pixels = img.pixels;
  var origW = img.width;
  var origH = img.height;

  // Step 1: Downsample to ~400px wide (same approach as autoStraighten)
  var downScale = Math.min(1, 400 / origW);
  var w = Math.floor(origW * downScale);
  var h = Math.floor(origH * downScale);

  // Grayscale buffer
  var gray = new Float32Array(w * h);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var sx = Math.floor(x / downScale);
      var sy = Math.floor(y / downScale);
      var idx = (sy * origW + sx) * 4;
      gray[y * w + x] = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
    }
  }

  // Step 2: Directional Sobel — compute |gx| and |gy| separately
  var absGx = new Float32Array(w * h); // vertical edge strength
  var absGy = new Float32Array(w * h); // horizontal edge strength

  for (var y = 1; y < h - 1; y++) {
    for (var x = 1; x < w - 1; x++) {
      var gx = -gray[(y - 1) * w + (x - 1)] + gray[(y - 1) * w + (x + 1)]
             - 2 * gray[y * w + (x - 1)]     + 2 * gray[y * w + (x + 1)]
             - gray[(y + 1) * w + (x - 1)]   + gray[(y + 1) * w + (x + 1)];

      var gy = -gray[(y - 1) * w + (x - 1)] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + (x + 1)]
             + gray[(y + 1) * w + (x - 1)]   + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + (x + 1)];

      absGx[y * w + x] = Math.abs(gx);
      absGy[y * w + x] = Math.abs(gy);
    }
  }

  // Step 3: 1D Projections
  // X-projection: sum |gx| down each column → peaks at vertical grid lines
  var projX = new Float32Array(w);
  for (var x = 0; x < w; x++) {
    var sum = 0;
    for (var y = 1; y < h - 1; y++) {
      sum += absGx[y * w + x];
    }
    projX[x] = sum;
  }

  // Y-projection: sum |gy| across each row → peaks at horizontal grid lines
  var projY = new Float32Array(h);
  for (var y = 0; y < h; y++) {
    var sum = 0;
    for (var x = 1; x < w - 1; x++) {
      sum += absGy[y * w + x];
    }
    projY[y] = sum;
  }

  // Step 4: Autocorrelation to find period
  var minLag = 4;
  var maxLagX = Math.min(Math.floor(w / 3), Math.round(80 * downScale));
  var maxLagY = Math.min(Math.floor(h / 3), Math.round(80 * downScale));

  var periodX = findPeriodByAutocorrelation(projX, minLag, maxLagX);
  var periodY = findPeriodByAutocorrelation(projY, minLag, maxLagY);

  // Use the average of X and Y periods if they agree (grid should be square)
  var periodDown;
  if (periodX > 0 && periodY > 0) {
    var ratio = periodX / periodY;
    if (ratio > 0.8 && ratio < 1.25) {
      periodDown = (periodX + periodY) / 2;
    } else {
      // They disagree — use whichever is nonzero, prefer X
      periodDown = periodX;
    }
  } else if (periodX > 0) {
    periodDown = periodX;
  } else if (periodY > 0) {
    periodDown = periodY;
  } else {
    return null; // No periodic pattern found
  }

  // Scale back to original image dimensions
  var detectedBlockSize = Math.round(periodDown / downScale);
  detectedBlockSize = Math.max(4, Math.min(80, detectedBlockSize));

  // Step 5: Phase detection for offsets
  var offsetXDown = findPhaseOffset(projX, periodDown);
  var offsetYDown = findPhaseOffset(projY, periodDown);

  var detectedOffsetX = Math.round(offsetXDown / downScale);
  var detectedOffsetY = Math.round(offsetYDown / downScale);

  // Clamp offsets to [0, blockSize-1] then to slider range
  detectedOffsetX = detectedOffsetX % detectedBlockSize;
  detectedOffsetY = detectedOffsetY % detectedBlockSize;
  detectedOffsetX = Math.max(0, Math.min(60, detectedOffsetX));
  detectedOffsetY = Math.max(0, Math.min(60, detectedOffsetY));

  return {
    blockSize: detectedBlockSize,
    offsetX: detectedOffsetX,
    offsetY: detectedOffsetY
  };
}

// --- Auto-detect grid cell size and alignment offsets ---
function autoDetectGrid() {
  if (!sourceImage) return;

  var btn = document.getElementById('auto-detect-grid-btn');
  var statusEl = document.getElementById('auto-detect-status');
  btn.classList.add('detecting');
  btn.disabled = true;
  statusEl.textContent = 'Analyzing grid pattern...';

  // setTimeout lets the UI update before blocking computation
  setTimeout(function() {
    try {
      var result = detectGridParameters(sourceImage);

      if (result === null) {
        statusEl.textContent = 'Could not detect grid. Try Measure Grid instead.';
        btn.classList.remove('detecting');
        btn.disabled = false;
        return;
      }

      // Apply detected values
      BLOCK_SIZE = result.blockSize;
      sampleOffsetX = result.offsetX;
      sampleOffsetY = result.offsetY;

      // Sync all sliders and displays
      document.getElementById('block-size-slider').value = BLOCK_SIZE;
      document.getElementById('block-size-display').textContent = BLOCK_SIZE;
      document.getElementById('offset-x-slider').value = sampleOffsetX;
      document.getElementById('offset-x-display').textContent = sampleOffsetX;
      document.getElementById('offset-y-slider').value = sampleOffsetY;
      document.getElementById('offset-y-display').textContent = sampleOffsetY;

      // Reprocess image with new grid parameters
      if (isPlaying) stopPlayback();
      processImage();

      statusEl.textContent = 'Detected: ' + BLOCK_SIZE + 'px cells, offset (' +
        sampleOffsetX + ', ' + sampleOffsetY + ')';

    } catch (e) {
      console.error('Auto-detect grid error:', e);
      statusEl.textContent = 'Detection failed. Try Measure Grid instead.';
    }

    btn.classList.remove('detecting');
    btn.disabled = false;
  }, 50);
}

// --- Auto-detect paper color (white point) from image ---
// Uses a quantized RGB histogram of bright pixels to find the dominant paper color.
// Returns { r, g, b } or null if detection fails.
function autoDetectWhitePoint(img) {
  img.loadPixels();
  var pixels = img.pixels;
  var origW = img.width;
  var origH = img.height;

  // Step 1: Downsample to ~200px wide for speed
  var downScale = Math.min(1, 200 / origW);
  var w = Math.floor(origW * downScale);
  var h = Math.floor(origH * downScale);

  // Step 2 & 3: Lightness filter + quantized 3D RGB histogram
  // 4-bit quantization: 16 bins per channel = 4096 total bins
  var QUANT_SHIFT = 4;
  var BINS_PER_CH = 16;
  var histSize = BINS_PER_CH * BINS_PER_CH * BINS_PER_CH; // 4096
  var histogram = new Int32Array(histSize);

  var lightnessFloor = 80;
  var totalPixels = w * h;
  var passedPixels = 0;

  // Try with progressively lower lightness threshold if needed (dim photos)
  while (lightnessFloor >= 30) {
    for (var i = 0; i < histSize; i++) histogram[i] = 0;
    passedPixels = 0;

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var sx = Math.floor(x / downScale);
        var sy = Math.floor(y / downScale);
        var idx = (sy * origW + sx) * 4;
        var r = pixels[idx];
        var g = pixels[idx + 1];
        var b = pixels[idx + 2];

        // Weighted luminance check
        var lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum < lightnessFloor) continue;

        passedPixels++;

        // Quantize to 4-bit and index into flat histogram
        var rBin = r >> QUANT_SHIFT;
        var gBin = g >> QUANT_SHIFT;
        var bBin = b >> QUANT_SHIFT;
        var binIdx = (rBin * BINS_PER_CH + gBin) * BINS_PER_CH + bBin;
        histogram[binIdx]++;
      }
    }

    // Need at least 10% of pixels to pass for a reliable result
    if (passedPixels >= totalPixels * 0.10) break;
    lightnessFloor -= 20;
  }

  if (passedPixels < totalPixels * 0.05) return null; // too few bright pixels

  // Step 4: Find the mode bin (most common color cluster)
  var modeBin = 0;
  var modeCount = 0;
  for (var i = 0; i < histSize; i++) {
    if (histogram[i] > modeCount) {
      modeCount = histogram[i];
      modeBin = i;
    }
  }

  // Step 5: Compute mean RGB of all pixels in the mode bin (sub-bin accuracy)
  var modeB = modeBin % BINS_PER_CH;
  var modeG = Math.floor(modeBin / BINS_PER_CH) % BINS_PER_CH;
  var modeR = Math.floor(modeBin / (BINS_PER_CH * BINS_PER_CH));

  var sumR = 0, sumG = 0, sumB = 0, count = 0;

  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var sx = Math.floor(x / downScale);
      var sy = Math.floor(y / downScale);
      var idx = (sy * origW + sx) * 4;
      var r = pixels[idx];
      var g = pixels[idx + 1];
      var b = pixels[idx + 2];

      if ((r >> QUANT_SHIFT) === modeR &&
          (g >> QUANT_SHIFT) === modeG &&
          (b >> QUANT_SHIFT) === modeB) {
        sumR += r;
        sumG += g;
        sumB += b;
        count++;
      }
    }
  }

  if (count === 0) return null;

  return {
    r: Math.round(sumR / count),
    g: Math.round(sumG / count),
    b: Math.round(sumB / count)
  };
}

// --- Auto-detect white point and apply to UI ---
function autoDetectWhite() {
  if (!sourceImage) return;

  var btn = document.getElementById('auto-detect-white-btn');
  var statusEl = document.getElementById('white-point-label');
  if (btn) btn.disabled = true;
  statusEl.textContent = 'Detecting paper color...';

  setTimeout(function() {
    try {
      var result = autoDetectWhitePoint(sourceImage);

      if (result === null) {
        statusEl.textContent = 'Could not detect paper color. Pick manually.';
        if (btn) btn.disabled = false;
        return;
      }

      // Apply as white point
      whiteSamples = [result];
      whitePoint = {
        r: result.r,
        g: result.g,
        b: result.b
      };

      var swatch = document.getElementById('white-point-swatch');
      swatch.style.background = 'rgb(' + whitePoint.r + ',' + whitePoint.g + ',' + whitePoint.b + ')';
      statusEl.textContent =
        'Auto → rgb(' + whitePoint.r + ', ' + whitePoint.g + ', ' + whitePoint.b + ')';

      recomputeNoteData();

    } catch (e) {
      console.error('Auto-detect white point error:', e);
      statusEl.textContent = 'Detection failed. Pick manually.';
    }

    if (btn) btn.disabled = false;
  }, 50);
}

// --- Image processing pipeline ---
function processImage() {
  if (!sourceImage) return;

  sourceImage.loadPixels();

  var imgW = sourceImage.width;
  var imgH = sourceImage.height;

  gridCols = Math.floor((imgW - sampleOffsetX) / BLOCK_SIZE);
  gridRows = Math.floor((imgH - sampleOffsetY) / BLOCK_SIZE);

  if (gridCols < 1 || gridRows < 1) {
    alert('Image is too small. Minimum size is 20x20 pixels.');
    return;
  }

  gridData = [];
  var activeCount = 0;

  for (var row = 0; row < gridRows; row++) {
    gridData[row] = [];
    for (var col = 0; col < gridCols; col++) {
      var avg = sampleBlock(col * BLOCK_SIZE + sampleOffsetX, row * BLOCK_SIZE + sampleOffsetY, BLOCK_SIZE, BLOCK_SIZE);
      var noteData = blockToNoteData(
        avg.r, avg.g, avg.b,
        row, col, gridRows,
        currentRootNote, currentScale,
        whitePoint, whiteTolerance, minChroma
      );

      gridData[row][col] = {
        active: noteData !== null,
        r: avg.r,
        g: avg.g,
        b: avg.b,
        noteData: noteData
      };

      if (noteData) activeCount++;
    }
  }

  calculateCellSize();
  buildColumnSynths(gridCols, currentSynthType);

  document.getElementById('grid-size').textContent = gridCols + ' x ' + gridRows;
  document.getElementById('active-count').textContent = activeCount;
  syncRowsDisplay();

  imageLoaded = true;

  // Auto-detect white point on first load if not already set
  if (!whitePoint) {
    autoDetectWhite();
  }
}

// --- Sync the rows input placeholder with current grid dimensions ---
function syncRowsDisplay() {
  var input = document.getElementById('target-rows-input');
  input.placeholder = gridRows + ' rows';
}

// --- Sample average RGB of a block ---
function sampleBlock(startX, startY, blockW, blockH) {
  var totalR = 0, totalG = 0, totalB = 0;
  var count = 0;
  var imgW = sourceImage.width;
  var pixels = sourceImage.pixels;

  for (var y = startY; y < startY + blockH && y < sourceImage.height; y++) {
    for (var x = startX; x < startX + blockW && x < sourceImage.width; x++) {
      var idx = (y * imgW + x) * 4;
      totalR += pixels[idx];
      totalG += pixels[idx + 1];
      totalB += pixels[idx + 2];
      count++;
    }
  }

  if (count === 0) return { r: 255, g: 255, b: 255 };

  return {
    r: Math.round(totalR / count),
    g: Math.round(totalG / count),
    b: Math.round(totalB / count)
  };
}

// --- Calculate cell display size to fit canvas ---
function calculateCellSize() {
  var container = document.getElementById('canvas-container');
  var cw = container.offsetWidth;
  var ch = container.offsetHeight;

  var headerHeight = 30;
  var availH = ch - headerHeight;

  var scaleX = cw / gridCols;
  var scaleY = availH / gridRows;
  cellDisplaySize = Math.floor(Math.min(scaleX, scaleY));
  cellDisplaySize = Math.max(cellDisplaySize, 4);

  gridOffsetX = Math.floor((cw - gridCols * cellDisplaySize) / 2);
  gridOffsetY = headerHeight + Math.floor((availH - gridRows * cellDisplaySize) / 2);

  resizeCanvas(cw, ch);
}

// --- Recompute note data when scale/root/thresholds change ---
function recomputeNoteData() {
  if (!imageLoaded) return;
  var activeCount = 0;
  for (var row = 0; row < gridRows; row++) {
    for (var col = 0; col < gridCols; col++) {
      var block = gridData[row][col];
      var noteData = blockToNoteData(
        block.r, block.g, block.b,
        row, col, gridRows,
        currentRootNote, currentScale,
        whitePoint, whiteTolerance, minChroma
      );
      block.active = noteData !== null;
      block.noteData = noteData;
      if (noteData) activeCount++;
    }
  }
  var countEl = document.getElementById('active-count');
  countEl.textContent = activeCount;
  countEl.style.color = activeCount === 0 ? '#ff4444' : '#ccc';
}

// --- Hex color to RGB ---
function hexToRgb(hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 255, g: 0, b: 0 };
}

// --- Update paint color from hue + saturation sliders ---
function updatePaintColor() {
  var rgb = hslToRgb(paintHue, paintSat, 50);
  paintColor = rgb;
  var swatch = document.getElementById('paint-swatch');
  if (swatch) {
    swatch.style.background = 'hsl(' + paintHue + ',' + paintSat + '%,50%)';
  }
}

// --- Deactivate white point picking mode ---
function deactivateWhitePointPicking() {
  if (pickingWhitePoint) {
    if (whiteSamples.length > 0) {
      finalizeWhitePoint();
    }
    pickingWhitePoint = false;
    var btn = document.getElementById('pick-white-btn');
    btn.classList.remove('picking');
    btn.textContent = 'Pick from grid';
  }
}

// --- Average all white samples into the final white point ---
function finalizeWhitePoint() {
  if (whiteSamples.length === 0) return;
  var totalR = 0, totalG = 0, totalB = 0;
  for (var i = 0; i < whiteSamples.length; i++) {
    totalR += whiteSamples[i].r;
    totalG += whiteSamples[i].g;
    totalB += whiteSamples[i].b;
  }
  var n = whiteSamples.length;
  whitePoint = {
    r: Math.round(totalR / n),
    g: Math.round(totalG / n),
    b: Math.round(totalB / n)
  };
  var swatch = document.getElementById('white-point-swatch');
  swatch.style.background = 'rgb(' + whitePoint.r + ',' + whitePoint.g + ',' + whitePoint.b + ')';
  document.getElementById('white-point-label').textContent =
    n + ' sample' + (n > 1 ? 's' : '') + ' → avg rgb(' + whitePoint.r + ', ' + whitePoint.g + ', ' + whitePoint.b + ')';
  recomputeNoteData();
}

// --- Deactivate grid measurement mode ---
function deactivateMeasuring() {
  measuringGrid = false;
  measureClickCount = 0;
  measurePoint1 = null;
  var btn = document.getElementById('measure-grid-btn');
  btn.classList.remove('measuring');
  btn.textContent = 'Measure Grid';
  document.getElementById('measure-status').textContent = 'Click two adjacent grid intersections';
}

// --- Phase 3: Convert screen coords to world coords (invert zoom/pan) ---
function screenToWorld(sx, sy) {
  return {
    x: (sx - viewPanX) / viewZoom,
    y: (sy - viewPanY) / viewZoom
  };
}

// --- Convert screen (display) coords to source image pixel coords ---
// Returns { sx, sy } — the pixel position in the original image, or null if outside grid
function screenToSourcePixel(mx, my) {
  // Phase 3: Convert screen to world first
  var world = screenToWorld(mx, my);

  // Check bounds in world space
  var gridRight = gridOffsetX + gridCols * cellDisplaySize;
  var gridBottom = gridOffsetY + gridRows * cellDisplaySize;
  if (world.x < gridOffsetX || world.x >= gridRight || world.y < gridOffsetY || world.y >= gridBottom) return null;

  // World → fraction within grid → source pixel
  var fracX = (world.x - gridOffsetX) / (gridCols * cellDisplaySize);
  var fracY = (world.y - gridOffsetY) / (gridRows * cellDisplaySize);
  var sx = sampleOffsetX + fracX * (gridCols * BLOCK_SIZE);
  var sy = sampleOffsetY + fracY * (gridRows * BLOCK_SIZE);
  return { sx: sx, sy: sy };
}

// --- Convert source image pixel coords back to world coords ---
function sourcePixelToScreen(sx, sy) {
  var fracX = (sx - sampleOffsetX) / (gridCols * BLOCK_SIZE);
  var fracY = (sy - sampleOffsetY) / (gridRows * BLOCK_SIZE);
  var dx = gridOffsetX + fracX * (gridCols * cellDisplaySize);
  var dy = gridOffsetY + fracY * (gridRows * cellDisplaySize);
  return { x: dx, y: dy };
}

// --- Paint or erase a single grid cell ---
function applyPaint(row, col) {
  var block = gridData[row][col];
  if (paintMode) {
    block.r = paintColor.r;
    block.g = paintColor.g;
    block.b = paintColor.b;
  } else if (eraseMode) {
    block.r = 40;
    block.g = 40;
    block.b = 40;
  }
  var noteData = blockToNoteData(
    block.r, block.g, block.b,
    row, col, gridRows,
    currentRootNote, currentScale,
    whitePoint, whiteTolerance, minChroma
  );
  block.active = noteData !== null;
  block.noteData = noteData;
  updateActiveCount();
}

// --- Update active cell count display ---
function updateActiveCount() {
  var count = 0;
  for (var r = 0; r < gridRows; r++) {
    for (var c = 0; c < gridCols; c++) {
      if (gridData[r][c].active) count++;
    }
  }
  var el = document.getElementById('active-count');
  el.textContent = count;
  el.style.color = count === 0 ? '#ff4444' : '#ccc';
}

// --- Hit test: screen coords to grid row/col or null ---
function screenToGrid(mx, my) {
  // Phase 3: Convert screen to world first
  var world = screenToWorld(mx, my);

  var gridBottom = gridOffsetY + gridRows * cellDisplaySize;
  if (world.y < gridOffsetY || world.y >= gridBottom) return null;
  var col = Math.floor((world.x - gridOffsetX) / cellDisplaySize);
  var row = Math.floor((world.y - gridOffsetY) / cellDisplaySize);
  if (col < 0 || col >= gridCols || row < 0 || row >= gridRows) return null;
  return { row: row, col: col };
}

// --- Phase 3: Update zoom display ---
function updateZoomDisplay() {
  var el = document.getElementById('zoom-display');
  if (el) {
    el.textContent = Math.round(viewZoom * 100);
  }
}

// --- Grid rendering ---
function drawGrid() {
  // Background photo (semi-transparent) for grid alignment
  if (showPhoto && sourceImage) {
    var srcX = sampleOffsetX;
    var srcY = sampleOffsetY;
    var srcW = gridCols * BLOCK_SIZE;
    var srcH = gridRows * BLOCK_SIZE;
    var dstX = gridOffsetX;
    var dstY = gridOffsetY;
    var dstW = gridCols * cellDisplaySize;
    var dstH = gridRows * cellDisplaySize;
    tint(255, 180);
    image(sourceImage, dstX, dstY, dstW, dstH, srcX, srcY, srcW, srcH);
    noTint();
  }

  noStroke();

  for (var row = 0; row < gridRows; row++) {
    for (var col = 0; col < gridCols; col++) {
      var x = gridOffsetX + col * cellDisplaySize;
      var y = gridOffsetY + row * cellDisplaySize;
      var block = gridData[row][col];

      if (block.active) {
        if (showPhoto) {
          fill(block.r, block.g, block.b, 160);
        } else {
          fill(block.r, block.g, block.b);
        }
        rect(x, y, cellDisplaySize, cellDisplaySize);
      } else if (!showPhoto) {
        fill(40);
        rect(x, y, cellDisplaySize, cellDisplaySize);
      }
    }
  }

  // Grid lines — scale weight so they stay thin when zoomed
  stroke(60);
  strokeWeight(Math.max(0.5, 1 / viewZoom));
  for (var c = 0; c <= gridCols; c++) {
    var lx = gridOffsetX + c * cellDisplaySize;
    line(lx, gridOffsetY, lx, gridOffsetY + gridRows * cellDisplaySize);
  }
  for (var r = 0; r <= gridRows; r++) {
    var ly = gridOffsetY + r * cellDisplaySize;
    line(gridOffsetX, ly, gridOffsetX + gridCols * cellDisplaySize, ly);
  }
}

// --- Playhead ---
function drawPlayhead() {
  if (playheadCol < 0 || playheadCol >= gridCols) return;

  var x = gridOffsetX + playheadCol * cellDisplaySize;
  var y = gridOffsetY;
  var h = gridRows * cellDisplaySize;

  noStroke();
  fill(255, 255, 255, 50);
  rect(x, y, cellDisplaySize, h);

  noFill();
  stroke(255, 255, 100);
  strokeWeight(Math.max(1, 2 / viewZoom));
  rect(x, y, cellDisplaySize, h);
}

// Called by sequencer.js via Tone.getDraw().schedule()
function updatePlayheadPosition(col) {
  playheadCol = col;
  if (col >= 0) {
    document.getElementById('current-step').textContent = (col + 1) + ' / ' + gridCols;
  } else {
    document.getElementById('current-step').textContent = '--';
  }
}

// --- Column headers (synth type per column) ---
function drawColumnHeaders() {
  if (cellDisplaySize < 12) return;

  var headerH = 18;
  var y = gridOffsetY - headerH - 2;
  var sw = 1 / viewZoom; // scale factor for text

  textSize(Math.min(9, cellDisplaySize - 2));
  textAlign(CENTER, CENTER);
  noStroke();

  for (var col = 0; col < gridCols; col++) {
    var x = gridOffsetX + col * cellDisplaySize;
    fill(55);
    rect(x, y, cellDisplaySize, headerH);

    if (cellDisplaySize >= 16 && columnSynths[col]) {
      fill(180);
      var abbrev = columnSynths[col].synthType.substring(0, 3);
      text(abbrev, x + cellDisplaySize / 2, y + headerH / 2);
    }
  }
}

// --- Draw measurement overlay (world space — inside push/pop) ---
function drawMeasureOverlay() {
  if (!measuringGrid) return;

  // Convert mouse to world coords for drawing inside the transform
  var world = screenToWorld(mouseX, mouseY);
  var hover = screenToSourcePixel(mouseX, mouseY);

  // Scale line weights to be constant on screen regardless of zoom
  var sw = 1 / viewZoom;

  // Draw crosshair at current mouse position when hovering over grid
  if (hover) {
    stroke(255, 255, 0, 150);
    strokeWeight(sw);
    // Vertical crosshair line
    line(world.x, gridOffsetY, world.x, gridOffsetY + gridRows * cellDisplaySize);
    // Horizontal crosshair line
    line(gridOffsetX, world.y, gridOffsetX + gridCols * cellDisplaySize, world.y);
  }

  // Draw first point if placed
  if (measurePoint1) {
    var p1 = sourcePixelToScreen(measurePoint1.sx, measurePoint1.sy);

    // Bright dot at first point
    noStroke();
    fill(255, 255, 0);
    ellipse(p1.x, p1.y, 10 * sw, 10 * sw);

    // If hovering, draw a line from point 1 to cursor
    if (hover) {
      stroke(255, 255, 0, 200);
      strokeWeight(2 * sw);
      line(p1.x, p1.y, world.x, world.y);

      // Show live distance readout near cursor
      var dx = hover.sx - measurePoint1.sx;
      var dy = hover.sy - measurePoint1.sy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      noStroke();
      fill(255, 255, 0);
      textSize(12 * sw);
      textAlign(LEFT, BOTTOM);
      text(Math.round(dist) + 'px', world.x + 12 * sw, world.y - 6 * sw);
    }
  }
}

// --- Click on grid: measure, paint, erase, white point picking, or column header synth cycle ---
function mousePressed() {
  if (!imageLoaded) return;

  // Phase 3: Middle-mouse pan
  if (mouseButton === CENTER) {
    isPanning = true;
    panStartX = mouseX;
    panStartY = mouseY;
    panStartViewX = viewPanX;
    panStartViewY = viewPanY;
    return;
  }

  // Only handle left clicks for tools
  if (mouseButton !== LEFT) return;

  // Phase 3: Use world coords for header click detection
  var world = screenToWorld(mouseX, mouseY);
  var headerH = 18;
  var headerY = gridOffsetY - headerH - 2;
  var cell = screenToGrid(mouseX, mouseY);

  // Measurement mode — click two points
  if (measuringGrid) {
    var srcPt = screenToSourcePixel(mouseX, mouseY);
    if (!srcPt) return;

    if (measureClickCount === 0) {
      measurePoint1 = srcPt;
      measureClickCount = 1;
      var btn = document.getElementById('measure-grid-btn');
      btn.textContent = 'Click 2nd intersection...';
      document.getElementById('measure-status').textContent =
        'Point 1: (' + Math.round(srcPt.sx) + ', ' + Math.round(srcPt.sy) + ') — now click an adjacent intersection';
    } else {
      var dx = srcPt.sx - measurePoint1.sx;
      var dy = srcPt.sy - measurePoint1.sy;
      var dist = Math.sqrt(dx * dx + dy * dy);

      var absDx = Math.abs(dx);
      var absDy = Math.abs(dy);
      var cellSize;

      if (absDx > absDy * 2) {
        cellSize = Math.round(absDx);
      } else if (absDy > absDx * 2) {
        cellSize = Math.round(absDy);
      } else {
        cellSize = Math.round(dist / Math.sqrt(2));
      }

      cellSize = Math.max(4, Math.min(80, cellSize));

      BLOCK_SIZE = cellSize;
      document.getElementById('block-size-slider').value = BLOCK_SIZE;
      document.getElementById('block-size-display').textContent = BLOCK_SIZE;

      deactivateMeasuring();
      document.getElementById('measure-status').textContent =
        'Measured: ' + cellSize + 'px per cell — grid reprocessed';

      if (isPlaying) stopPlayback();
      processImage();
    }
    return;
  }

  // Paint or erase mode — click to apply
  if ((paintMode || eraseMode) && cell) {
    applyPaint(cell.row, cell.col);
    return;
  }

  // White point picking mode — accumulate samples, stay in mode
  if (pickingWhitePoint && cell) {
    var block = gridData[cell.row][cell.col];
    whiteSamples.push({ r: block.r, g: block.g, b: block.b });
    finalizeWhitePoint();
    var btn = document.getElementById('pick-white-btn');
    btn.textContent = whiteSamples.length + ' sampled — click more or click to finish';
    return;
  }

  // Column header click to cycle synth type (use world coords)
  if (world.y >= headerY && world.y <= headerY + headerH) {
    var col = Math.floor((world.x - gridOffsetX) / cellDisplaySize);
    if (col >= 0 && col < gridCols) {
      var types = Object.keys(SYNTH_TYPES);
      var currentType = columnSynths[col] ? columnSynths[col].synthType : 'Synth';
      var currentIdx = types.indexOf(currentType);
      var nextIdx = (currentIdx + 1) % types.length;
      setColumnSynthType(col, types[nextIdx]);
    }
  }
}

// --- Drag to paint/erase multiple cells or pan ---
function mouseDragged() {
  if (!imageLoaded) return;

  // Phase 3: Middle-mouse pan
  if (isPanning) {
    viewPanX = panStartViewX + (mouseX - panStartX);
    viewPanY = panStartViewY + (mouseY - panStartY);
    return;
  }

  if (!paintMode && !eraseMode) return;
  var cell = screenToGrid(mouseX, mouseY);
  if (cell) {
    applyPaint(cell.row, cell.col);
  }
}

// --- Phase 3: Mouse released (end pan) ---
function mouseReleased() {
  isPanning = false;
}

// --- Phase 3: Mouse wheel zoom (Ctrl/Cmd + scroll only) ---
function mouseWheel(event) {
  if (!imageLoaded) return true; // let page scroll normally

  // Only zoom when Ctrl (Windows/Linux) or Cmd (Mac) is held
  if (!event.ctrlKey && !event.metaKey) return true; // let page scroll normally

  // Check if mouse is over the canvas
  if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) return true;

  event.preventDefault(); // prevent browser zoom when Ctrl+scroll

  var zoomFactor = event.delta > 0 ? 0.9 : 1.1;
  var newZoom = viewZoom * zoomFactor;
  newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));

  // Zoom toward mouse position
  viewPanX = mouseX - (mouseX - viewPanX) * (newZoom / viewZoom);
  viewPanY = mouseY - (mouseY - viewPanY) * (newZoom / viewZoom);
  viewZoom = newZoom;

  updateZoomDisplay();
  return false;
}

// --- Phase 4: Touch handlers ---
function touchStarted(e) {
  if (!imageLoaded) return true;

  // Only handle touches on the canvas area — let UI controls (hamburger, sliders) work normally
  if (e && e.target) {
    var canvasContainer = document.getElementById('canvas-container');
    if (!canvasContainer.contains(e.target)) {
      return true;
    }
  }

  // Auto-close mobile panel when tapping on canvas
  var panel = document.getElementById('control-panel');
  if (panel.classList.contains('mobile-visible')) {
    panel.classList.remove('mobile-visible');
    var toggle = document.getElementById('mobile-panel-toggle');
    toggle.innerHTML = '&#9776;';
    toggle.classList.remove('panel-open');
    setTimeout(function() { windowResized(); }, 50);
    return false;
  }

  if (touches.length === 2) {
    // Two-finger: start pinch zoom
    var dx = touches[0].x - touches[1].x;
    var dy = touches[0].y - touches[1].y;
    touchState.lastPinchDist = Math.sqrt(dx * dx + dy * dy);
    touchState.lastMidX = (touches[0].x + touches[1].x) / 2;
    touchState.lastMidY = (touches[0].y + touches[1].y) / 2;
    touchState.isPinching = true;
    return false;
  }

  if (touches.length === 1) {
    touchState.isPinching = false;
    // Single touch — delegate to mousePressed behavior
    // p5.js sets mouseX/mouseY from first touch
    mousePressed();
    return false;
  }

  return true;
}

function touchMoved(e) {
  if (!imageLoaded) return true;

  // Only handle touches on the canvas area
  if (e && e.target) {
    var canvasContainer = document.getElementById('canvas-container');
    if (!canvasContainer.contains(e.target)) {
      return true;
    }
  }

  if (touches.length === 2 && touchState.isPinching) {
    // Pinch zoom + two-finger pan
    var dx = touches[0].x - touches[1].x;
    var dy = touches[0].y - touches[1].y;
    var pinchDist = Math.sqrt(dx * dx + dy * dy);
    var midX = (touches[0].x + touches[1].x) / 2;
    var midY = (touches[0].y + touches[1].y) / 2;

    // Zoom
    if (touchState.lastPinchDist > 0) {
      var zoomFactor = pinchDist / touchState.lastPinchDist;
      var newZoom = viewZoom * zoomFactor;
      newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));

      // Zoom toward pinch midpoint
      viewPanX = midX - (midX - viewPanX) * (newZoom / viewZoom);
      viewPanY = midY - (midY - viewPanY) * (newZoom / viewZoom);
      viewZoom = newZoom;
    }

    // Two-finger pan
    viewPanX += midX - touchState.lastMidX;
    viewPanY += midY - touchState.lastMidY;

    touchState.lastPinchDist = pinchDist;
    touchState.lastMidX = midX;
    touchState.lastMidY = midY;

    updateZoomDisplay();
    return false;
  }

  if (touches.length === 1) {
    // Single touch — delegate to mouseDragged behavior
    mouseDragged();
    return false;
  }

  return true;
}

function touchEnded() {
  touchState.isPinching = false;
  touchState.lastPinchDist = 0;
  return true;
}

// --- Handle window resize ---
function windowResized() {
  var container = document.getElementById('canvas-container');
  if (imageLoaded) {
    calculateCellSize();
  } else {
    resizeCanvas(container.offsetWidth, container.offsetHeight);
    drawEmptyState();
  }
}

// --- Render color-pitch legend in the sidebar ---
function renderLegend() {
  var container = document.getElementById('color-legend');
  if (!container) return;

  var legend = buildLegendData(currentRootNote, currentScale);
  var html = '';

  for (var i = 0; i < legend.length; i++) {
    var entry = legend[i];
    var vivid = entry.color;
    var dim = entry.colorDim;
    var vividCss = 'rgb(' + vivid.r + ',' + vivid.g + ',' + vivid.b + ')';
    var dimCss = 'rgb(' + dim.r + ',' + dim.g + ',' + dim.b + ')';

    html += '<div class="legend-item">';
    html += '  <span class="legend-note">' + entry.noteLetter + '</span>';
    html += '  <div class="legend-swatch">';
    html += '    <div class="legend-swatch-vivid" style="background:' + vividCss + '" title="Vivid = loud"></div>';
    html += '    <div class="legend-swatch-dim" style="background:' + dimCss + '" title="Pale = quiet"></div>';
    html += '  </div>';
    html += '  <span class="legend-hue">' + Math.round(entry.hueStart) + '-' + Math.round(entry.hueEnd) + '°</span>';
    html += '</div>';
  }

  container.innerHTML = html;
}

// --- Empty state ---
function drawEmptyState() {
  background(30);
  fill(120);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(18);
  text('Load a grid paper image or start blank', width / 2, height / 2);
  textSize(12);
  text('Drag & drop, use file picker, or click New Blank Grid', width / 2, height / 2 + 30);
}
