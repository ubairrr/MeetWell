/**
 * RSCH-04 Spike — renderer.js
 *
 * Renderer process: controls audio capture UI and displays transcript output.
 * Tests Path 1 (native Chromium flags) and Path 2 (AudioTee.js) separately.
 *
 * NOT product code. Throwaway spike per RSCH-04.
 */

// Show environment info on load
window.addEventListener('DOMContentLoaded', async () => {
  const env = await window.spikeAPI.getEnv();
  document.getElementById('env-info').textContent = JSON.stringify(env, null, 2);

  if (!env.deepgramKeySet) {
    document.getElementById('warning').textContent =
      '⚠ DEEPGRAM_API_KEY is not set. Transcript round-trip will not work. ' +
      'Set it with: export DEEPGRAM_API_KEY=your_key_here and restart the spike.';
  }
});

// TODO (T3): Implement Path 1 capture button handler
// document.getElementById('start-path1').addEventListener('click', async () => {
//   await window.spikeAPI.startCapturePath1();
// });

// TODO (T4): Implement Path 2 capture button handler
// document.getElementById('start-path2').addEventListener('click', async () => {
//   await window.spikeAPI.startCapturePath2();
// });

// TODO (T3/T4): Subscribe to transcript events and render in the UI
// window.spikeAPI.onTranscript((data) => {
//   const div = document.createElement('div');
//   div.textContent = `[${data.path}] ${data.speaker}: ${data.text}`;
//   document.getElementById('transcript-output').appendChild(div);
// });
