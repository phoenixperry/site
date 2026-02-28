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
var paintColor = { r: 255, g: 0, b: 0 };  // current paint color from picker
var sampleOffsetX = 0;         // pixel offset into source image for grid alignment
var sampleOffsetY = 0;
var showPhoto = false;          // show source image behind grid

// Grid measurement mode: click two points to detect cell size
var measuringGrid = false;      // true while in measurement mode
var measurePoint1 = null;       // { sx, sy } — first click in source-image pixel coords
var measureClickCount = 0;      // 0 = waiting for first click, 1 = waiting for second

// --- p5 setup ---
function setup() {
  var container = document.getElementById('canvas-container');
  var cw = container.offsetWidth;
  var ch = container.offsetHeight;
  var canvas = createCanvas(cw, ch);
  canvas.parent('canvas-container');
  pixelDensity(1);
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
  drawGrid();
  drawPlayhead();
  drawColumnHeaders();
  drawMeasureOverlay();
}

// --- Wire DOM controls ---
function wireControls() {
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

  // Also allow clicking the drop zone to trigger file input
  dropZone.addEventListener('click', function() {
    document.getElementById('image-input').click();
  });

  // Paper grid rows — compute block size from target row count
  document.getElementById('target-rows-input').addEventListener('change', function(e) {
    var targetRows = parseInt(e.target.value);
    if (!targetRows || targetRows < 1 || !sourceImage) return;
    var imgH = sourceImage.height - sampleOffsetY;
    var newBlockSize = Math.floor(imgH / targetRows);
    newBlockSize = Math.max(4, Math.min(80, newBlockSize));
    BLOCK_SIZE = newBlockSize;
    // Sync the cell size slider
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
      // Update the rows display to reflect current block size
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
      // Enter measurement mode
      measureClickCount = 0;
      measurePoint1 = null;
      paintMode = false;
      eraseMode = false;
      deactivateWhitePointPicking();
      document.getElementById('paint-btn').classList.remove('active');
      document.getElementById('erase-btn').classList.remove('active');
      // Auto-enable background photo so user can see the grid lines
      showPhoto = true;
      document.getElementById('show-photo-cb').checked = true;
      this.classList.add('measuring');
      this.textContent = 'Click 1st intersection...';
      document.getElementById('measure-status').textContent = 'Click a grid line intersection on the photo';
    } else {
      // Cancel measurement mode
      deactivateMeasuring();
    }
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

  // Paint color picker
  document.getElementById('paint-color').addEventListener('input', function(e) {
    var hex = e.target.value;
    paintColor = hexToRgb(hex);
  });

  // White point picker (multi-sample: stays in picking mode until toggled off)
  document.getElementById('pick-white-btn').addEventListener('click', function() {
    if (!imageLoaded) return;
    pickingWhitePoint = !pickingWhitePoint;
    if (pickingWhitePoint) {
      whiteSamples = [];  // start fresh each time picking is activated
      paintMode = false;
      eraseMode = false;
      deactivateMeasuring();
      document.getElementById('paint-btn').classList.remove('active');
      document.getElementById('erase-btn').classList.remove('active');
    } else {
      // Toggled off — finalize if we have samples
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
}

// --- Load image from File object ---
function loadImageFromFile(file) {
  var url = URL.createObjectURL(file);
  loadImage(url, function(img) {
    sourceImage = img;
    processImage();
    URL.revokeObjectURL(url);
  }, function(err) {
    console.error('Failed to load image:', err);
    alert('Could not load image. Please try a JPG or PNG file.');
  });
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
}

// --- Sync the rows input placeholder with current grid dimensions ---
function syncRowsDisplay() {
  var input = document.getElementById('target-rows-input');
  // Only update the placeholder, not the value — let the user keep their typed number
  input.placeholder = gridRows + ' rows';
}

// --- Sample average RGB of a 20x20 block ---
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

// --- Deactivate white point picking mode ---
function deactivateWhitePointPicking() {
  if (pickingWhitePoint) {
    // If we have samples, finalize before deactivating
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
  // Update UI
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

// --- Convert screen (display) coords to source image pixel coords ---
// Returns { sx, sy } — the pixel position in the original image, or null if outside grid
function screenToSourcePixel(mx, my) {
  // Check bounds
  var gridRight = gridOffsetX + gridCols * cellDisplaySize;
  var gridBottom = gridOffsetY + gridRows * cellDisplaySize;
  if (mx < gridOffsetX || mx >= gridRight || my < gridOffsetY || my >= gridBottom) return null;

  // Display → fraction within grid → source pixel
  var fracX = (mx - gridOffsetX) / (gridCols * cellDisplaySize);
  var fracY = (my - gridOffsetY) / (gridRows * cellDisplaySize);
  var sx = sampleOffsetX + fracX * (gridCols * BLOCK_SIZE);
  var sy = sampleOffsetY + fracY * (gridRows * BLOCK_SIZE);
  return { sx: sx, sy: sy };
}

// --- Convert source image pixel coords back to display coords ---
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
  // Re-derive note data for this single cell
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
  var gridBottom = gridOffsetY + gridRows * cellDisplaySize;
  if (my < gridOffsetY || my >= gridBottom) return null;
  var col = Math.floor((mx - gridOffsetX) / cellDisplaySize);
  var row = Math.floor((my - gridOffsetY) / cellDisplaySize);
  if (col < 0 || col >= gridCols || row < 0 || row >= gridRows) return null;
  return { row: row, col: col };
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
      // When showPhoto && !active: skip drawing — let photo show through
    }
  }

  // Grid lines
  stroke(60);
  strokeWeight(1);
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

  // Semi-transparent overlay
  noStroke();
  fill(255, 255, 255, 50);
  rect(x, y, cellDisplaySize, h);

  // Bright border
  noFill();
  stroke(255, 255, 100);
  strokeWeight(2);
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
  if (cellDisplaySize < 12) return; // too narrow to show headers

  var headerH = 18;
  var y = gridOffsetY - headerH - 2;

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

// --- Draw measurement overlay (dots + line + crosshair) ---
function drawMeasureOverlay() {
  if (!measuringGrid) return;

  // Draw crosshair at current mouse position when hovering over grid
  var hover = screenToSourcePixel(mouseX, mouseY);
  if (hover) {
    stroke(255, 255, 0, 150);
    strokeWeight(1);
    // Vertical crosshair line
    line(mouseX, gridOffsetY, mouseX, gridOffsetY + gridRows * cellDisplaySize);
    // Horizontal crosshair line
    line(gridOffsetX, mouseY, gridOffsetX + gridCols * cellDisplaySize, mouseY);
  }

  // Draw first point if placed
  if (measurePoint1) {
    var p1Screen = sourcePixelToScreen(measurePoint1.sx, measurePoint1.sy);

    // Bright dot at first point
    noStroke();
    fill(255, 255, 0);
    ellipse(p1Screen.x, p1Screen.y, 10, 10);

    // If hovering, draw a line from point 1 to cursor
    if (hover) {
      stroke(255, 255, 0, 200);
      strokeWeight(2);
      line(p1Screen.x, p1Screen.y, mouseX, mouseY);

      // Show live distance readout near cursor
      var dx = hover.sx - measurePoint1.sx;
      var dy = hover.sy - measurePoint1.sy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      noStroke();
      fill(255, 255, 0);
      textSize(12);
      textAlign(LEFT, BOTTOM);
      text(Math.round(dist) + 'px', mouseX + 12, mouseY - 6);
    }
  }
}

// --- Click on grid: measure, paint, erase, white point picking, or column header synth cycle ---
function mousePressed() {
  if (!imageLoaded) return;

  var headerH = 18;
  var headerY = gridOffsetY - headerH - 2;
  var cell = screenToGrid(mouseX, mouseY);

  // Measurement mode — click two points
  if (measuringGrid) {
    var srcPt = screenToSourcePixel(mouseX, mouseY);
    if (!srcPt) return; // clicked outside grid area

    if (measureClickCount === 0) {
      // First click — record point
      measurePoint1 = srcPt;
      measureClickCount = 1;
      var btn = document.getElementById('measure-grid-btn');
      btn.textContent = 'Click 2nd intersection...';
      document.getElementById('measure-status').textContent =
        'Point 1: (' + Math.round(srcPt.sx) + ', ' + Math.round(srcPt.sy) + ') — now click an adjacent intersection';
    } else {
      // Second click — compute distance and set BLOCK_SIZE
      var dx = srcPt.sx - measurePoint1.sx;
      var dy = srcPt.sy - measurePoint1.sy;
      var dist = Math.sqrt(dx * dx + dy * dy);

      // Use the larger axis delta (user may click horizontally or vertically)
      // If they clicked diagonally, use Euclidean / sqrt(2) for one cell
      var absDx = Math.abs(dx);
      var absDy = Math.abs(dy);
      var cellSize;

      if (absDx > absDy * 2) {
        // Mostly horizontal click
        cellSize = Math.round(absDx);
      } else if (absDy > absDx * 2) {
        // Mostly vertical click
        cellSize = Math.round(absDy);
      } else {
        // Diagonal — assume one cell diagonal, so divide by sqrt(2)
        cellSize = Math.round(dist / Math.sqrt(2));
      }

      cellSize = Math.max(4, Math.min(80, cellSize));

      // Apply the measured cell size
      BLOCK_SIZE = cellSize;
      document.getElementById('block-size-slider').value = BLOCK_SIZE;
      document.getElementById('block-size-display').textContent = BLOCK_SIZE;

      document.getElementById('measure-status').textContent =
        'Measured: ' + cellSize + 'px per cell — grid reprocessed';

      // Exit measurement mode
      deactivateMeasuring();
      // Keep the status message (don't reset it)
      document.getElementById('measure-status').textContent =
        'Measured: ' + cellSize + 'px per cell — grid reprocessed';

      // Reprocess
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

    // Live-update: compute running average and show it
    finalizeWhitePoint();

    // Update button to show count
    var btn = document.getElementById('pick-white-btn');
    btn.textContent = whiteSamples.length + ' sampled — click more or click to finish';
    return;
  }

  // Column header click to cycle synth type
  if (mouseY >= headerY && mouseY <= headerY + headerH) {
    var col = Math.floor((mouseX - gridOffsetX) / cellDisplaySize);
    if (col >= 0 && col < gridCols) {
      var types = Object.keys(SYNTH_TYPES);
      var currentType = columnSynths[col] ? columnSynths[col].synthType : 'Synth';
      var currentIdx = types.indexOf(currentType);
      var nextIdx = (currentIdx + 1) % types.length;
      setColumnSynthType(col, types[nextIdx]);
    }
  }
}

// --- Drag to paint/erase multiple cells ---
function mouseDragged() {
  if (!imageLoaded || (!paintMode && !eraseMode)) return;
  var cell = screenToGrid(mouseX, mouseY);
  if (cell) {
    applyPaint(cell.row, cell.col);
  }
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
  text('Load a grid paper image to begin', width / 2, height / 2);
  textSize(12);
  text('Drag & drop or use the file picker', width / 2, height / 2 + 30);
}
