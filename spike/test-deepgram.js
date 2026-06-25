/**
 * RSCH-04 Spike — test-deepgram.js
 *
 * Quick standalone test to validate the Deepgram API key works and
 * confirm SDK version / connection before the full Electron spike.
 * Run: node test-deepgram.js
 */

const { createClient } = require('@deepgram/sdk');

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

if (!DEEPGRAM_API_KEY) {
  console.error('ERROR: DEEPGRAM_API_KEY not set');
  process.exit(1);
}

async function testDeepgramKey() {
  console.log('Testing Deepgram API key...');
  console.log('@deepgram/sdk version:', require('@deepgram/sdk/package.json').version);

  const deepgram = createClient(DEEPGRAM_API_KEY);

  try {
    // Test via a simple prerecorded transcription of a known public URL
    const { result, error } = await deepgram.listen.prerecorded.transcribeUrl(
      { url: 'https://dpgr.am/spacewalk.wav' },
      {
        model: 'nova-3',
        diarize: true,
        smart_format: true,
      }
    );

    if (error) {
      console.error('Deepgram API error:', error);
      process.exit(1);
    }

    const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    const words = result?.results?.channels?.[0]?.alternatives?.[0]?.words?.length ?? 0;
    const speakerCount = new Set(
      (result?.results?.channels?.[0]?.alternatives?.[0]?.words ?? [])
        .map(w => w.speaker)
        .filter(s => s !== undefined)
    ).size;

    console.log('\n✅ Deepgram API key is valid and working!');
    console.log('Model used: nova-3');
    console.log('Diarization: enabled');
    console.log(`Transcript preview: "${transcript?.slice(0, 120)}..."`);
    console.log(`Total words: ${words}`);
    console.log(`Speakers detected: ${speakerCount}`);
    console.log('\nPath 1 & 2 transcript round-trip should work.');
  } catch (err) {
    console.error('Connection error:', err.message);
    process.exit(1);
  }
}

testDeepgramKey();
