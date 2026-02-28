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
var currentSatThreshold = 15;
var currentLightThreshold = 85;

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
  drawEmptyState();
}

// --- p5 draw loop ---
function draw() {
  if (!imageLoaded) return;
  background(30);
  drawGrid();
  drawPlayhead();
  drawColumnHeaders();
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

  // Scale — recompute notes
  document.getElementById('scale-select').addEventListener('change', function(e) {
    currentScale = e.target.value;
    recomputeNoteData();
  });

  // Root note — recompute notes
  document.getElementById('root-select').addEventListener('change', function(e) {
    currentRootNote = e.target.value;
    recomputeNoteData();
  });

  // Default synth — rebuild all column synths
  document.getElementById('synth-select').addEventListener('change', function(e) {
    currentSynthType = e.target.value;
    if (gridCols > 0) {
      buildColumnSynths(gridCols, currentSynthType);
    }
  });

  // Sensitivity thresholds — reprocess active/inactive
  document.getElementById('sat-threshold').addEventListener('input', function(e) {
    currentSatThreshold = parseInt(e.target.value);
    document.getElementById('sat-display').textContent = currentSatThreshold;
    recomputeNoteData();
  });

  document.getElementById('light-threshold').addEventListener('input', function(e) {
    currentLightThreshold = parseInt(e.target.value);
    document.getElementById('light-display').textContent = currentLightThreshold;
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

  gridCols = Math.floor(imgW / BLOCK_SIZE);
  gridRows = Math.floor(imgH / BLOCK_SIZE);

  if (gridCols < 1 || gridRows < 1) {
    alert('Image is too small. Minimum size is 20x20 pixels.');
    return;
  }

  gridData = [];
  var activeCount = 0;

  for (var row = 0; row < gridRows; row++) {
    gridData[row] = [];
    for (var col = 0; col < gridCols; col++) {
      var avg = sampleBlock(col * BLOCK_SIZE, row * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
      var noteData = blockToNoteData(
        avg.r, avg.g, avg.b,
        row, col, gridRows,
        currentRootNote, currentScale,
        currentSatThreshold, currentLightThreshold
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

  imageLoaded = true;
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
        currentSatThreshold, currentLightThreshold
      );
      block.active = noteData !== null;
      block.noteData = noteData;
      if (noteData) activeCount++;
    }
  }
  document.getElementById('active-count').textContent = activeCount;
}

// --- Grid rendering ---
function drawGrid() {
  noStroke();

  for (var row = 0; row < gridRows; row++) {
    for (var col = 0; col < gridCols; col++) {
      var x = gridOffsetX + col * cellDisplaySize;
      var y = gridOffsetY + row * cellDisplaySize;
      var block = gridData[row][col];

      if (block.active) {
        fill(block.r, block.g, block.b);
      } else {
        fill(40);
      }
      rect(x, y, cellDisplaySize, cellDisplaySize);
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

// --- Click column header to cycle synth type ---
function mousePressed() {
  if (!imageLoaded) return;

  var headerH = 18;
  var headerY = gridOffsetY - headerH - 2;

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
