// ============================================================
// sequencer.js — Tone.js Synthesis Engine
// Uses a small shared synth pool (not one per column) to avoid
// overwhelming the audio graph on large grids.
// ============================================================

var synthPool = [];             // Small pool of PolySynths (reused across columns)
var synthPoolSize = 4;          // Number of synths in the pool
var currentPoolIndex = 0;       // Round-robin index into pool
var currentSynthTypeName = 'Synth';
var columnSynths = [];          // Kept for per-column type display in headers
var masterVolume = null;
var currentStep = 0;
var totalSteps = 0;
var gridDataRef = null;
var isPlaying = false;
var loopEvent = null;
var stepDuration = '8n';

var SYNTH_TYPES = {
  'Synth':          Tone.Synth,
  'FMSynth':        Tone.FMSynth,
  'AMSynth':        Tone.AMSynth,
  'PluckSynth':     Tone.PluckSynth,
  'MembraneSynth':  Tone.MembraneSynth,
  'MetalSynth':     Tone.MetalSynth,
};

// --- Initialize audio graph ---
function initSequencer() {
  masterVolume = new Tone.Volume(-6).toDestination();
}

// --- Synth types that don't support PolySynth (not Monophonic subclass) ---
var NON_POLY_SYNTHS = { 'PluckSynth': true };

// --- Build the shared synth pool ---
function buildColumnSynths(numCols, defaultSynthType) {
  disposeAllSynths();

  totalSteps = numCols;
  currentSynthTypeName = defaultSynthType || 'Synth';

  var SynthClass = SYNTH_TYPES[currentSynthTypeName] || Tone.Synth;

  for (var i = 0; i < synthPoolSize; i++) {
    try {
      var polySynth;
      if (NON_POLY_SYNTHS[currentSynthTypeName]) {
        // PluckSynth etc. don't support PolySynth — use mono synth directly
        polySynth = new SynthClass();
      } else {
        polySynth = new Tone.PolySynth(SynthClass, { maxPolyphony: 6 });
        polySynth.set({
          envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.3 }
        });
      }
      polySynth.connect(masterVolume);
      synthPool.push(polySynth);
    } catch (e) {
      console.warn('Synth creation failed for ' + currentSynthTypeName + ', falling back to Synth:', e.message);
      // Fallback to basic Synth
      var fallback = new Tone.PolySynth(Tone.Synth, { maxPolyphony: 6 });
      fallback.set({
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.3 }
      });
      fallback.connect(masterVolume);
      synthPool.push(fallback);
    }
  }

  // Keep column display array for header labels
  columnSynths = [];
  for (var col = 0; col < numCols; col++) {
    columnSynths.push({ synthType: currentSynthTypeName });
  }
}

// --- Change synth type for a column (rebuilds entire pool for simplicity) ---
function setColumnSynthType(colIndex, synthTypeName) {
  if (colIndex < 0 || colIndex >= columnSynths.length) return;
  // For v1: changing one column changes the global synth type
  columnSynths[colIndex].synthType = synthTypeName;
  // Rebuild pool with the new type
  currentSynthTypeName = synthTypeName;
  rebuildSynthPool(synthTypeName);
}

function rebuildSynthPool(synthTypeName) {
  // Dispose old pool
  for (var i = 0; i < synthPool.length; i++) {
    synthPool[i].dispose();
  }
  synthPool = [];
  currentPoolIndex = 0;

  var SynthClass = SYNTH_TYPES[synthTypeName] || Tone.Synth;

  for (var i = 0; i < synthPoolSize; i++) {
    try {
      var polySynth;
      if (NON_POLY_SYNTHS[synthTypeName]) {
        polySynth = new SynthClass();
      } else {
        polySynth = new Tone.PolySynth(SynthClass, { maxPolyphony: 6 });
        polySynth.set({
          envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.3 }
        });
      }
      polySynth.connect(masterVolume);
      synthPool.push(polySynth);
    } catch (e) {
      console.warn('Synth rebuild failed for ' + synthTypeName + ', falling back to Synth:', e.message);
      var fallback = new Tone.PolySynth(Tone.Synth, { maxPolyphony: 6 });
      fallback.set({
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.3 }
      });
      fallback.connect(masterVolume);
      synthPool.push(fallback);
    }
  }
}

// --- Trigger all active notes in one column ---
function triggerColumn(colIndex, time) {
  if (!gridDataRef || colIndex >= totalSteps) return;
  if (synthPool.length === 0) return;

  // Collect notes, deduplicate
  var noteSet = {};
  for (var row = 0; row < gridDataRef.length; row++) {
    var block = gridDataRef[row][colIndex];
    if (block && block.active && block.noteData) {
      var note = block.noteData.note;
      // Keep the loudest velocity if duplicate
      if (!noteSet[note] || block.noteData.velocity > noteSet[note]) {
        noteSet[note] = block.noteData.velocity;
      }
    }
  }

  var uniqueNotes = Object.keys(noteSet);
  if (uniqueNotes.length === 0) return;

  // Cap simultaneous voices
  var MAX_SIMULTANEOUS = 6;
  if (uniqueNotes.length > MAX_SIMULTANEOUS) {
    uniqueNotes = uniqueNotes.slice(0, MAX_SIMULTANEOUS);
  }

  var velocities = uniqueNotes.map(function(n) { return noteSet[n]; });
  var avgVelocity = velocities.reduce(function(a, b) { return a + b; }, 0) / velocities.length;

  // Round-robin through the synth pool to allow note overlap between steps
  var synth = synthPool[currentPoolIndex % synthPool.length];
  currentPoolIndex = (currentPoolIndex + 1) % synthPool.length;

  try {
    if (NON_POLY_SYNTHS[currentSynthTypeName]) {
      // Mono synths: play only the first note
      synth.triggerAttackRelease(uniqueNotes[0], stepDuration, time, avgVelocity);
    } else {
      synth.triggerAttackRelease(uniqueNotes, stepDuration, time, avgVelocity);
    }
  } catch (e) {
    console.warn('Trigger error on column ' + colIndex + ':', e.message);
  }
}

// --- Start playback ---
function startPlayback(gridData, bpm) {
  if (bpm === undefined) bpm = 120;
  gridDataRef = gridData;
  currentStep = 0;

  // Always ensure audio context is running (browsers can suspend it)
  Tone.getContext().resume();

  Tone.getTransport().bpm.value = bpm;

  if (loopEvent) {
    loopEvent.dispose();
  }

  loopEvent = new Tone.Loop(function(time) {
    triggerColumn(currentStep, time);

    var step = currentStep;
    Tone.getDraw().schedule(function() {
      if (isPlaying) updatePlayheadPosition(step);
    }, time);

    currentStep = (currentStep + 1) % totalSteps;
  }, stepDuration);

  loopEvent.start(0);
  Tone.getTransport().start();
  isPlaying = true;
}

function stopPlayback() {
  Tone.getTransport().stop();
  Tone.getTransport().cancel();
  Tone.getTransport().position = 0;
  if (loopEvent) {
    loopEvent.stop();
    loopEvent.dispose();
    loopEvent = null;
  }
  currentStep = 0;
  isPlaying = false;
  updatePlayheadPosition(-1);
}

function pausePlayback() {
  Tone.getTransport().pause();
  isPlaying = false;
}

function resumePlayback() {
  Tone.getContext().resume(); // ensure context is running
  Tone.getTransport().start();
  isPlaying = true;
}

function setTempo(bpm) {
  Tone.getTransport().bpm.value = bpm;
}

function setMasterVolume(percent) {
  if (!masterVolume) return;
  if (percent <= 0) {
    masterVolume.volume.value = -Infinity;
  } else {
    masterVolume.volume.value = -60 + (percent / 100) * 60;
  }
}

function disposeAllSynths() {
  for (var i = 0; i < synthPool.length; i++) {
    synthPool[i].dispose();
  }
  synthPool = [];
  currentPoolIndex = 0;
  columnSynths = [];
}
