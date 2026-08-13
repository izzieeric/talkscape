const fs = require('fs');
const os = require('os');
const path = require('path');
const VolcengineSpeechClient = require('../src/services/volcengine-speech-client');

function mockJsonResponse(payload, headers = {}) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: (name) => headers[name.toLowerCase()] || null },
    text: async () => JSON.stringify(payload)
  };
}

function mockSseResponse(items) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => null },
    text: async () => items.map((item) => `data: ${JSON.stringify(item)}`).join('\n\n')
  };
}

describe('VolcengineSpeechClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('sends a TTS request and writes decoded MP3 data', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talkscape-volc-'));
    const outputPath = path.join(tempDir, 'voice.mp3');
    global.fetch = jest.fn().mockResolvedValue(mockSseResponse([
      { data: Buffer.from('mock-').toString('base64') },
      { data: Buffer.from('mp3').toString('base64') },
      { event: 200 }
    ]));
    const client = new VolcengineSpeechClient({ apiKey: 'api-key' });

    const url = await client.textToSpeech('Hello', {
      voice: 'zh_female_vv_uranus_bigtts',
      outputPath,
      outputUrl: '/talkscape/data/voice.mp3'
    });

    expect(url).toBe('/talkscape/data/voice.mp3');
    expect(fs.readFileSync(outputPath, 'utf8')).toBe('mock-mp3');
    const request = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(global.fetch.mock.calls[0][1].headers['X-Api-Key']).toBe('api-key');
    expect(request.req_params.speaker).toBe('zh_female_vv_uranus_bigtts');
  });

  test('uploads base64 audio to the ASR flash endpoint', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talkscape-volc-'));
    const audioPath = path.join(tempDir, 'speech.webm');
    fs.writeFileSync(audioPath, 'mock-audio');
    global.fetch = jest.fn().mockResolvedValue(mockJsonResponse(
      { result: { text: 'hello world' } },
      { 'x-api-status-code': '20000000' }
    ));
    const client = new VolcengineSpeechClient({ apiKey: 'api-key' });

    const text = await client.speechToText(audioPath, 'en');

    expect(text).toBe('hello world');
    const request = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(request.audio.data).toBe(Buffer.from('mock-audio').toString('base64'));
    expect(request.request.language).toBe('en-US');
    expect(global.fetch.mock.calls[0][1].headers['X-Api-Key']).toBe('api-key');
  });
});
