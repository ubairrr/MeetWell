/**
 * RSCH-04 Spike — renderer.js
 *
 * Renderer process: controls audio capture UI and displays transcript output.
 * Tests Path 1 (native Chromium flags) and Path 2 (AudioTee.js) separately.
 *
 * NOT product code. Throwaway spike per RSCH-04.
 */

let activeAudioCtx = null;
let activeMicStream = null;
let activeSystemStream = null;
let activeScriptProcessor = null;
let isCapturing = false;
let currentPath = null;

// UI Elements
const envInfo = document.getElementById('env-info');
const warning = document.getElementById('warning');
const btnPath1 = document.getElementById('start-path1');
const btnPath2 = document.getElementById('start-path2');
const transcriptOutput = document.getElementById('transcript-output');

// Helper to log in the transcript box
function logToUI(message, isSystem = true) {
  const div = document.createElement('div');
  if (isSystem) {
    div.style.color = '#888';
    div.textContent = `[System] ${message}`;
  } else {
    div.textContent = message;
  }
  transcriptOutput.appendChild(div);
  transcriptOutput.scrollTop = transcriptOutput.scrollHeight;
}

// Show environment info on load
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const env = await window.spikeAPI.getEnv();
    envInfo.textContent = JSON.stringify(env, null, 2);

    if (!env.deepgramKeySet) {
      warning.textContent =
        '⚠ DEEPGRAM_API_KEY is not set. Transcript round-trip will not work. ' +
        'Set it with: export DEEPGRAM_API_KEY=your_key_here and restart.';
      btnPath1.disabled = true;
      btnPath2.disabled = true;
    } else {
      btnPath1.disabled = false;
      btnPath2.disabled = false;
    }
  } catch (err) {
    warning.textContent = `Error getting environment: ${err.message}`;
  }
});

// Listen for status updates from main process
window.spikeAPI.onStatusChange((event) => {
  logToUI(`Status updated: ${event.status} (${event.path || event.error || ''})`);
  if (event.status === 'error') {
    logToUI(`❌ Error: ${event.error}`, true);
    stopAllCapture();
  }
});

// Listen for transcripts
window.spikeAPI.onTranscript((data) => {
  const speakerText = `Speaker ${data.speaker}`;
  const statusLabel = data.isFinal ? '[FINAL]' : '[interim]';
  logToUI(`${statusLabel} (${data.path}) ${speakerText}: ${data.text}`, false);
});

// Capture toggle handlers
btnPath1.addEventListener('click', async () => {
  if (isCapturing) {
    await stopAllCapture();
  } else {
    await startCapturePath1();
  }
});

btnPath2.addEventListener('click', async () => {
  if (isCapturing) {
    await stopAllCapture();
  } else {
    await startCapturePath2();
  }
});

async function startCapturePath1() {
  try {
    isCapturing = true;
    currentPath = 'path1';
    btnPath1.textContent = '⏹ Stop Path 1';
    btnPath2.disabled = true;
    transcriptOutput.innerHTML = '';
    logToUI('Starting Path 1 (Native Chromium flags)...');

    // 1. Initialize Deepgram socket in main process
    await window.spikeAPI.startDGConnection('path1');

    // 2. Request mic audio
    logToUI('Requesting microphone permission...');
    activeMicStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });

    // 3. Request system audio via display media
    logToUI('Requesting screen/system audio (Select screen and ensure "Share audio" is checked)...');
    activeSystemStream = await navigator.mediaDevices.getDisplayMedia({
      audio: {
        suppressLocalAudioPlayback: false,
      },
      video: {
        width: 1,
        height: 1,
        frameRate: 1,
      },
    });

    // Stop the video track to avoid rendering/capturing the actual screen
    activeSystemStream.getVideoTracks().forEach(track => track.stop());

    if (activeSystemStream.getAudioTracks().length === 0) {
      throw new Error('No system audio track captured. Did you check "Share audio"?');
    }

    // 4. Mix streams using Web Audio API
    logToUI('Setting up Web Audio mixer...');
    activeAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });

    const micSource = activeAudioCtx.createMediaStreamSource(activeMicStream);
    const systemSource = activeAudioCtx.createMediaStreamSource(activeSystemStream);

    // Create ScriptProcessor to get raw PCM floats
    activeScriptProcessor = activeAudioCtx.createScriptProcessor(4096, 1, 1);

    // Mix source tracks by connecting them to the processor node
    micSource.connect(activeScriptProcessor);
    systemSource.connect(activeScriptProcessor);

    // Must connect script processor to audio context destination to process audio
    activeScriptProcessor.connect(activeAudioCtx.destination);

    activeScriptProcessor.onaudioprocess = (e) => {
      if (!isCapturing) return;
      const floatData = e.inputBuffer.getChannelData(0);

      // Convert Float32 to Int16 PCM (Linear 16)
      const int16Data = new Int16Array(floatData.length);
      for (let i = 0; i < floatData.length; i++) {
        const s = Math.max(-1, Math.min(1, floatData[i]));
        int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      // Send to main process via IPC
      window.spikeAPI.sendAudioChunk(int16Data.buffer);
    };

    logToUI('🎤 Capturing mixed microphone and system audio. Play some audio now!');
  } catch (err) {
    logToUI(`❌ Path 1 error: ${err.message}`);
    await stopAllCapture();
  }
}

async function startCapturePath2() {
  try {
    isCapturing = true;
    currentPath = 'path2';
    btnPath2.textContent = '⏹ Stop Path 2';
    btnPath1.disabled = true;
    transcriptOutput.innerHTML = '';
    logToUI('Starting Path 2 (AudioTee.js Core Audio Taps)...');

    // Start AudioTee.js in main process
    await window.spikeAPI.startPath2AudioTee();
    logToUI('🔊 AudioTee active. Play some audio now!');
  } catch (err) {
    logToUI(`❌ Path 2 error: ${err.message}`);
    await stopAllCapture();
  }
}

async function stopAllCapture() {
  isCapturing = false;
  logToUI('Stopping capture...');

  if (currentPath === 'path1') {
    if (activeScriptProcessor) {
      activeScriptProcessor.disconnect();
      activeScriptProcessor = null;
    }
    if (activeAudioCtx) {
      await activeAudioCtx.close();
      activeAudioCtx = null;
    }
    if (activeMicStream) {
      activeMicStream.getTracks().forEach(t => t.stop());
      activeMicStream = null;
    }
    if (activeSystemStream) {
      activeSystemStream.getTracks().forEach(t => t.stop());
      activeSystemStream = null;
    }
    await window.spikeAPI.stopDGConnection();
    btnPath1.textContent = '▶ Start Path 1 (Chromium flags) [T3]';
    btnPath2.disabled = false;
  } else if (currentPath === 'path2') {
    await window.spikeAPI.stopPath2AudioTee();
    btnPath2.textContent = '▶ Start Path 2 (AudioTee.js) [T4]';
    btnPath1.disabled = false;
  }

  currentPath = null;
  logToUI('Capture stopped.');
}
