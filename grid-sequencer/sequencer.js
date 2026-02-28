// ============================================================
// sequencer.js — Tone.js Synthesis Engine
// Manages per-column PolySynths, Transport loop, step triggering.
// ============================================================

var columnSynths = [];
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

// --- Create PolySynths for each column ---
function buildColumnSynths(numCols, defaultSynthType, maxVoices) {
  if (maxVoices === undefined) maxVoices = 8;
  disposeAllSynths();

  columnSynths = [];
  totalSteps = numCols;

  for (var col = 0; col < numCols; col++) {
    var SynthClass = SYNTH_TYPES[defaultSynthType] || Tone.Synth;
    var polySynth = new Tone.PolySynth(SynthClass, { maxPolyphony: maxVoices });

    polySynth.set({
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.3 }
    });

    polySynth.connect(masterVolume);

    columnSynths.push({
      polySynth: polySynth,
      synthType: defaultSynthType || 'Synth'
    });
  }
}

// --- Change synth type for one column ---
function setColumnSynthType(colIndex, synthTypeName) {
  if (colIndex < 0 || colIndex >= columnSynths.length) return;

  var old = columnSynths[colIndex];
  old.polySynth.dispose();

  var SynthClass = SYNTH_TYPES[synthTypeName] || Tone.Synth;
  var polySynth = new Tone.PolySynth(SynthClass, { maxPolyphony: 8 });
  polySynth.set({
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.3 }
  });
  polySynth.connect(masterVolume);

  columnSynths[colIndex] = { polySynth: polySynth, synthType: synthTypeName };
}

// --- Trigger all active notes in one column ---
function triggerColumn(colIndex, time) {
  if (!gridDataRef || colIndex >= totalSteps) return;
  var synth = columnSynths[colIndex];
  if (!synth) return;

  var notes = [];
  var velocities = [];

  for (var row = 0; row < gridDataRef.length; row++) {
    var block = gridDataRef[row][colIndex];
    if (block && block.active && block.noteData) {
      notes.push(block.noteData.note);
      velocities.push(block.noteData.velocity);
    }
  }

  if (notes.length === 0) return;

  // Cap simultaneous voices
  var MAX_SIMULTANEOUS = 8;
  if (notes.length > MAX_SIMULTANEOUS) {
    notes = notes.slice(0, MAX_SIMULTANEOUS);
    velocities = velocities.slice(0, MAX_SIMULTANEOUS);
  }

  var avgVelocity = velocities.reduce(function(a, b) { return a + b; }, 0) / velocities.length;

  try {
    synth.polySynth.triggerAttackRelease(notes, stepDuration, time, avgVelocity);
  } catch (e) {
    // Some synth types may not support certain notes gracefully
    console.warn('Trigger error on column ' + colIndex + ':', e.message);
  }
}

// --- Start playback ---
function startPlayback(gridData, bpm) {
  if (bpm === undefined) bpm = 120;
  gridDataRef = gridData;
  currentStep = 0;

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
  Tone.getTransport().cancel(); // cancel all scheduled events including getDraw callbacks
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
  for (var i = 0; i < columnSynths.length; i++) {
    if (columnSynths[i] && columnSynths[i].polySynth) {
      columnSynths[i].polySynth.dispose();
    }
  }
  columnSynths = [];
}
