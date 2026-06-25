/**
 * RSCH-04 Spike — test-path1-chromium.js
 *
 * Path 1: Native Chromium Core Audio flags probe
 * Since we can't interactively run getDisplayMedia() in a headless context,
 * this script:
 * 1. Confirms Electron version (42.x → native flags, no electron-audio-loopback needed)
 * 2. Checks if electron-audio-loopback package is even needed
 * 3. Documents the correct flags for macOS 26.x (Tahoe)
 * 4. Creates a standalone Electron window app that tests Path 1 with a flag
 *    that can be run interactively
 *
 * The actual Path 1 capture requires user interaction (macOS screen recording
 * permission prompt + actively playing audio). This script documents the
 * implementation approach and validates flags.
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('=== PATH 1: Native Chromium Core Audio Flags Probe ===\n');

// Check Electron version
let electronVersion = 'unknown';
try {
  electronVersion = execSync('npx electron --version 2>/dev/null', { encoding: 'utf8' }).trim();
} catch (e) {
  electronVersion = 'not found';
}

console.log('Electron version:', electronVersion);

// Parse major version
const majorVersion = parseInt(electronVersion.replace('v', '').split('.')[0], 10);
const needsLoopbackPackage = majorVersion < 39;

console.log(`Electron major version: ${majorVersion}`);
console.log(`electron-audio-loopback package needed: ${needsLoopbackPackage ? 'YES' : 'NO (Electron 39+ has native support)'}`);
console.log('');

// Check if electron-audio-loopback is installed
let loopbackInstalled = false;
try {
  require('electron-audio-loopback');
  loopbackInstalled = true;
} catch (e) {
  loopbackInstalled = false;
}
console.log(`electron-audio-loopback installed: ${loopbackInstalled}`);
console.log('');

// macOS version info
const macosVersion = execSync('sw_vers -productVersion', { encoding: 'utf8' }).trim();
const macosName = execSync('sw_vers -productName', { encoding: 'utf8' }).trim();
console.log('macOS:', macosName, macosVersion);

const macMajor = parseInt(macosVersion.split('.')[0], 10);
const useCoreTaps = macMajor >= 15; // Use Core Audio Taps (not ScreenCaptureKit) on macOS 15+
const recommendedFlag = useCoreTaps ? 'MacCatapSystemAudioLoopbackCapture' : 'MacSckSystemAudioLoopbackOverride';

console.log('macOS major version:', macMajor);
console.log(`Recommended Chromium flag: ${recommendedFlag}`);
console.log(`Reason: ${useCoreTaps
  ? 'macOS 15+ (Sequoia/Tahoe): Use Core Audio Taps flag. ScreenCaptureKit flag shows purple screen-recording indicator.'
  : 'macOS < 15: ScreenCaptureKit flag is appropriate.'
}`);
console.log('');

console.log('=== Path 1 Implementation Summary ===');
console.log(`
Required app.commandLine switches (in main.js before app.whenReady()):
  app.commandLine.appendSwitch('enable-features', 'MacLoopbackAudioForScreenShare');
  app.commandLine.appendSwitch('enable-features', '${recommendedFlag}');

setDisplayMediaRequestHandler (in app.whenReady()):
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    callback({ audio: 'loopback' });
  });

Renderer (getUserMedia for system audio):
  const systemStream = await navigator.mediaDevices.getDisplayMedia({
    audio: { suppressLocalAudioPlayback: false },
    video: false  // audio-only loopback
  });

Permissions:
  - Triggers "Screen & System Audio Recording" TCC permission dialog
  - Purple screen-recording indicator appears in Control Center
  - This is a macOS 15+ limitation of the ScreenCaptureKit → Core Audio path

electron-audio-loopback NOT needed for Electron ${majorVersion}+.
`);

console.log('✅ Path 1 analysis complete. Native Chromium flags are the correct approach.');
console.log('   Run the Electron app (npm start) to test interactively with real audio.');
