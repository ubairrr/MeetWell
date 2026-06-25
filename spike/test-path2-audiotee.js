/**
 * RSCH-04 Spike — test-path2-audiotee.js
 *
 * Path 2: AudioTee.js (Core Audio Taps) → Deepgram Nova-3 live streaming
 * Tests whether system audio captured via AudioTee.js produces a coherent
 * Deepgram transcript.
 *
 * Run: DEEPGRAM_API_KEY=xxx node test-path2-audiotee.js
 *
 * Requires: play audio on the Mac while this is running (e.g. a video/music).
 * Test duration: 15 seconds of capture, then stop and report.
 */

const { AudioTee } = require('audiotee');
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
if (!DEEPGRAM_API_KEY) {
  console.error('ERROR: DEEPGRAM_API_KEY not set');
  process.exit(1);
}

const CAPTURE_DURATION_MS = 15000; // 15 seconds

async function testPath2() {
  console.log('=== PATH 2: AudioTee.js (Core Audio Taps) ===');
  console.log('Capture duration: 15 seconds');
  console.log('Sample rate: 16000 Hz (mono)');
  console.log('');
  console.log('▶ Play audio on your Mac now (a video, music, or any sound)...');
  console.log('');

  const deepgram = createClient(DEEPGRAM_API_KEY);

  // Deepgram live streaming connection
  // AudioTee outputs PCM float32, but Deepgram streaming expects linear16 or mulaw
  // We request 16kHz, which is the standard for Deepgram streaming
  const connection = deepgram.listen.live({
    model: 'nova-3',
    diarize: true,
    smart_format: true,
    encoding: 'linear16',
    sample_rate: 16000,
    channels: 1,
    mip_opt_out: true, // DEC-02 compliance
  });

  let transcriptChunks = [];
  let connected = false;
  let bytesReceived = 0;

  connection.on(LiveTranscriptionEvents.Open, () => {
    console.log('✅ Deepgram WebSocket connected (Path 2)');
    connected = true;

    // Start AudioTee capture
    const audiotee = new AudioTee({
      sampleRate: 16000,
      chunkDurationMs: 100, // 100ms chunks
    });

    audiotee.on('start', () => {
      console.log('✅ AudioTee.js started — Core Audio Tap active');
      console.log('   (Check System Preferences → Privacy → Microphone for permission prompt)');
    });

    audiotee.on('error', (err) => {
      console.error('❌ AudioTee error:', err.message);
    });

    audiotee.on('log', (level, msg) => {
      if (level === 'info') console.log('AudioTee log:', msg.message || msg);
    });

    let firstChunk = true;
    audiotee.on('data', (chunk) => {
      if (!chunk?.data) return;
      bytesReceived += chunk.data.length;

      if (firstChunk) {
        console.log(`\n🎙  First audio chunk received! Size: ${chunk.data.length} bytes`);
        firstChunk = false;
      }
      
      // Print visual progress dot every 10 chunks (~1 second)
      if (bytesReceived % (chunk.data.length * 10) === 0) {
        process.stdout.write('.');
      }

      // Since sampleRate was specified, AudioTee Swift binary outputs pcm_s16le.
      // We can forward this buffer directly to Deepgram without any float32->int16 conversion.
      connection.send(chunk.data);
    });

    audiotee.on('stop', () => {
      console.log('\nAudioTee stopped');
    });

    // Start capture
    audiotee.start().then(() => {
      console.log('Capturing system audio for 15 seconds (play something on your Mac)...');
    }).catch(err => {
      console.error('❌ Failed to start AudioTee:', err.message);
    });

    // Stop after CAPTURE_DURATION_MS
    setTimeout(async () => {
      console.log('\n--- Stopping capture ---');
      await audiotee.stop();
      console.log('Closing Deepgram connection...');
      connection.requestClose();
      
      // Fallback timeout to display results if Close event doesn't fire
      setTimeout(() => {
        console.log('\n(Close event fallback triggered)');
        printResults();
        process.exit(0);
      }, 2000);
    }, CAPTURE_DURATION_MS);
  });

  function printResults() {
    console.log('\n=== Path 2 Results ===');
    console.log(`Total audio bytes received by Deepgram: ${bytesReceived.toLocaleString()}`);
    console.log(`Final transcript chunks: ${transcriptChunks.length}`);

    if (transcriptChunks.length > 0) {
      console.log('\n✅ RESULT: Coherent transcript returned from Deepgram via AudioTee.js');
      console.log('\nFull transcript:');
      transcriptChunks.forEach(c => console.log(`  Speaker ${c.speaker}: ${c.text}`));
    } else if (bytesReceived > 0) {
      console.log('\n⚠ RESULT: Audio was captured but no transcript returned');
      console.log('   Possible causes: silence, Deepgram processing delay, or encoding mismatch');
    } else {
      console.log('\n❌ RESULT: No audio bytes received — AudioTee.js capture may have failed');
    }
  }

  connection.on(LiveTranscriptionEvents.Transcript, (data) => {
    const alt = data?.channel?.alternatives?.[0];
    if (!alt?.transcript?.trim()) return;

    const isFinal = data.is_final;
    const speaker = alt.words?.[0]?.speaker ?? '?';
    const text = alt.transcript;

    if (isFinal) {
      transcriptChunks.push({ speaker, text });
      console.log(`\n[FINAL Speaker ${speaker}]: ${text}`);
    } else {
      process.stdout.write(`\n[interim]: ${text}\r`);
    }
  });

  connection.on(LiveTranscriptionEvents.Error, (err) => {
    console.error('\n❌ Deepgram error:', err);
  });

  connection.on(LiveTranscriptionEvents.Close, () => {
    console.log('\n✅ Deepgram socket closed');
    printResults();
    process.exit(0);
  });
}

testPath2().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

