import { createHash, randomBytes } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-server';

export type TTSProvider = 'edge' | 'azure' | 'openai' | 'elevenlabs' | 'gemini' | 'none';

export interface TTSResult {
  url: string;
  provider: TTSProvider;
  cached: boolean;
  voice: string;
}

function providerChain(): TTSProvider[] {
  const chain: TTSProvider[] = [];
  // ElevenLabs first — if configured, user picked it for premium quality
  if (process.env.ELEVENLABS_API_KEY) chain.push('elevenlabs');
  // Azure second — 500k chars/month free, Audible-tier neural voices
  if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) chain.push('azure');
  // Edge — same underlying voices as Azure, no API key needed (uses Edge browser's endpoint)
  // Enabled by default; set DISABLE_EDGE_TTS=1 to opt out.
  if (!process.env.DISABLE_EDGE_TTS) chain.push('edge');
  // Gemini — also free via existing key, preview quality
  if (process.env.GEMINI_API_KEY) chain.push('gemini');
  // OpenAI last — paid, no free quota
  if (process.env.OPENAI_API_KEY) chain.push('openai');
  return chain;
}

function detectProvider(): TTSProvider {
  return providerChain()[0] ?? 'none';
}

function hashText(text: string, voice: string): string {
  return createHash('sha1').update(`${voice}::${text}`).digest('hex').slice(0, 24);
}

export function listVoices(provider: TTSProvider): Array<{ id: string; label: string }> {
  if (provider === 'openai') {
    return [
      { id: 'nova', label: 'Nova (warm, female)' },
      { id: 'onyx', label: 'Onyx (deep, male)' },
      { id: 'alloy', label: 'Alloy (neutral)' },
      { id: 'shimmer', label: 'Shimmer (bright, female)' },
      { id: 'fable', label: 'Fable (British)' },
      { id: 'echo', label: 'Echo (calm, male)' },
    ];
  }
  if (provider === 'elevenlabs') {
    return [
      { id: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel (female, narrator)' },
      { id: 'TxGEqnHWrfWFTfGW9XjX', label: 'Josh (male, warm)' },
      { id: 'AZnzlk1XvdvUeBnXmlld', label: 'Domi (female, confident)' },
    ];
  }
  if (provider === 'azure' || provider === 'edge') {
    // Same underlying voices; Edge hits the browser endpoint without an API key
    return [
      { id: 'en-US-AndrewNeural', label: 'Andrew (US, male, natural)' },
      { id: 'en-US-AvaNeural', label: 'Ava (US, female, expressive)' },
      { id: 'en-US-BrianNeural', label: 'Brian (US, male, warm)' },
      { id: 'en-US-EmmaNeural', label: 'Emma (US, female, clear)' },
      { id: 'en-US-JennyNeural', label: 'Jenny (US, female, warm)' },
      { id: 'en-US-GuyNeural', label: 'Guy (US, male, neutral)' },
      { id: 'en-GB-RyanNeural', label: 'Ryan (British, male)' },
      { id: 'en-GB-SoniaNeural', label: 'Sonia (British, female)' },
      { id: 'en-GB-LibbyNeural', label: 'Libby (British, female, soft)' },
      { id: 'en-GB-ThomasNeural', label: 'Thomas (British, male)' },
    ];
  }
  if (provider === 'gemini') {
    return [{ id: 'default', label: 'Gemini voice' }];
  }
  return [];
}

async function synthesizeOpenAI(text: string, voice: string): Promise<Buffer> {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1-hd',
      voice,
      input: text,
      response_format: 'mp3',
    }),
  });
  if (!res.ok) throw new Error(`OpenAI TTS failed: ${res.status} ${await res.text().catch(() => '')}`);
  return Buffer.from(await res.arrayBuffer());
}

async function synthesizeElevenLabs(text: string, voiceId: string): Promise<Buffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY!,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs failed: ${res.status} ${await res.text().catch(() => '')}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Microsoft Edge TTS ──────────────────────────────────────────────
// Uses the same WebSocket endpoint Edge browser's Read Aloud feature hits.
// No API key; free forever; identical voices to Azure Neural.
// Microsoft added Sec-MS-GEC header validation in 2024 — must compute it.
const EDGE_TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

function generateSecMsGec(): string {
  // Convert current Unix time to Windows file time ticks (100ns intervals since 1601).
  // Round down to the nearest 5-minute interval (3e9 ticks) to match Edge's behavior.
  const unixSeconds = Math.floor(Date.now() / 1000);
  const ticks = (unixSeconds + 11_644_473_600) * 10_000_000;
  const rounded = Math.floor(ticks / 3_000_000_000) * 3_000_000_000;
  return createHash('sha256').update(`${rounded}${EDGE_TRUSTED_TOKEN}`).digest('hex').toUpperCase();
}

function generateEdgeId(): string {
  return randomBytes(16).toString('hex').toUpperCase();
}

async function synthesizeEdge(text: string, voice: string): Promise<Buffer> {
  const { default: WebSocket } = await import('ws');
  const connectionId = generateEdgeId();
  const secMsGec = generateSecMsGec();
  const url =
    `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` +
    `?TrustedClientToken=${EDGE_TRUSTED_TOKEN}` +
    `&Sec-MS-GEC=${secMsGec}` +
    `&Sec-MS-GEC-Version=1-130.0.2849.68` +
    `&ConnectionId=${connectionId}`;

  return new Promise<Buffer>((resolve, reject) => {
    const ws = new WebSocket(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
        Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      },
    });

    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      try { ws.close(); } catch { /* ignore */ }
      reject(new Error('Edge TTS timeout'));
    }, 60_000);

    ws.on('open', () => {
      const now = new Date().toISOString().slice(0, -1) + 'Z';
      const config = {
        context: {
          synthesis: {
            audio: {
              metadataoptions: {
                sentenceBoundaryEnabled: 'false',
                wordBoundaryEnabled: 'false',
              },
              outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
            },
          },
        },
      };
      ws.send(
        `X-Timestamp:${now}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify(config)}`
      );

      const escape = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const lang = voice.slice(0, 5);
      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>` +
        `<voice name='${voice}'>${escape(text)}</voice></speak>`;
      const requestId = generateEdgeId();
      ws.send(
        `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${now}\r\nPath:ssml\r\n\r\n${ssml}`
      );
    });

    ws.on('message', (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        // Binary frame: first 2 bytes = uint16 BE header length, then header, then audio
        if (data.length < 2) return;
        const headerLen = data.readUInt16BE(0);
        if (data.length > 2 + headerLen) {
          chunks.push(data.subarray(2 + headerLen));
        }
      } else {
        const msg = data.toString('utf-8');
        if (msg.includes('Path:turn.end')) {
          clearTimeout(timer);
          try { ws.close(); } catch { /* ignore */ }
          if (chunks.length === 0) return reject(new Error('Edge TTS returned no audio'));
          resolve(Buffer.concat(chunks));
        }
      }
    });

    ws.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(new Error(`Edge TTS: ${err.message}`));
    });

    ws.on('close', (code: number) => {
      clearTimeout(timer);
      if (chunks.length === 0 && code !== 1000) {
        reject(new Error(`Edge TTS closed unexpectedly (code ${code})`));
      }
    });
  });
}

async function synthesizeAzure(text: string, voice: string): Promise<Buffer> {
  const key = process.env.AZURE_SPEECH_KEY!;
  const region = process.env.AZURE_SPEECH_REGION!;
  // SSML wrapper — allows prosody tweaks later
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const lang = voice.slice(0, 5); // e.g. "en-ZA"
  const ssml = `<speak version='1.0' xml:lang='${lang}'><voice name='${voice}'>${escape(text)}</voice></speak>`;

  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'lewhof-ai-tts',
    },
    body: ssml,
  });
  if (!res.ok) throw new Error(`Azure TTS failed: ${res.status} ${await res.text().catch(() => '')}`);
  return Buffer.from(await res.arrayBuffer());
}

async function synthesizeGemini(text: string, _voice: string): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: { responseModalities: ['AUDIO'] },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini TTS failed: ${res.status} ${await res.text().catch(() => '')}`);
  const data = await res.json();
  const b64 = data.candidates?.[0]?.content?.parts?.find((p: { inlineData?: { data: string } }) => p.inlineData)?.inlineData?.data;
  if (!b64) throw new Error('Gemini returned no audio');
  return Buffer.from(b64, 'base64');
}

async function synthesize(provider: TTSProvider, text: string, voice: string): Promise<Buffer> {
  if (provider === 'edge') return synthesizeEdge(text, voice);
  if (provider === 'azure') return synthesizeAzure(text, voice);
  if (provider === 'openai') return synthesizeOpenAI(text, voice);
  if (provider === 'elevenlabs') return synthesizeElevenLabs(text, voice);
  if (provider === 'gemini') return synthesizeGemini(text, voice);
  throw new Error(`Unknown provider: ${provider}`);
}

export async function generateTTS(
  userId: string,
  text: string,
  voice?: string
): Promise<TTSResult> {
  const chain = providerChain();
  if (chain.length === 0) {
    throw new Error('No TTS provider configured. Set AZURE_SPEECH_KEY+AZURE_SPEECH_REGION, GEMINI_API_KEY, ELEVENLABS_API_KEY, or OPENAI_API_KEY.');
  }

  const primary = chain[0];
  const resolvedVoice = voice || listVoices(primary)[0]?.id || 'default';

  // Cache check against the primary provider + voice (deterministic)
  const cacheKey = hashText(text, `${primary}:${resolvedVoice}`);
  const cachedPath = `${userId}/${cacheKey}.mp3`;
  const { data: existingSigned } = await supabaseAdmin.storage.from('tts').createSignedUrl(cachedPath, 3600);
  if (existingSigned?.signedUrl) {
    const head = await fetch(existingSigned.signedUrl, { method: 'HEAD' });
    if (head.ok) {
      return { url: existingSigned.signedUrl, provider: primary, cached: true, voice: resolvedVoice };
    }
  }

  // Synthesize with provider fallback chain
  let audio: Buffer | null = null;
  let usedProvider: TTSProvider = primary;
  let usedVoice = resolvedVoice;
  const failures: string[] = [];

  for (const p of chain) {
    try {
      const voiceForProvider = p === primary ? resolvedVoice : (listVoices(p)[0]?.id || 'default');
      audio = await synthesize(p, text, voiceForProvider);
      usedProvider = p;
      usedVoice = voiceForProvider;
      break;
    } catch (err) {
      failures.push(`${p}: ${err instanceof Error ? err.message.slice(0, 120) : 'unknown'}`);
      continue;
    }
  }

  if (!audio) {
    throw new Error(`All TTS providers failed. ${failures.join(' | ')}`);
  }

  const finalPath = `${userId}/${hashText(text, `${usedProvider}:${usedVoice}`)}.mp3`;
  const { error: upErr } = await supabaseAdmin.storage
    .from('tts')
    .upload(finalPath, audio, { contentType: 'audio/mpeg', upsert: true });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

  const { data: signed } = await supabaseAdmin.storage.from('tts').createSignedUrl(finalPath, 3600);
  if (!signed?.signedUrl) throw new Error('Could not create signed URL');

  return { url: signed.signedUrl, provider: usedProvider, cached: false, voice: usedVoice };
}

export function getCurrentProvider(): TTSProvider {
  return detectProvider();
}
