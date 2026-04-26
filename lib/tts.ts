import { createHash, randomBytes } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-server';

export type TTSProvider = 'openai' | 'elevenlabs' | 'azure' | 'edge' | 'gemini' | 'none';

export interface TTSResult {
  url: string;
  provider: TTSProvider;
  cached: boolean;
  voice: string;
}

// Per-chunk char ceiling. gpt-4o-mini-tts handles ~4096 tokens; 1500 chars
// gives faster TTFB on long articles and lets us parallelise.
const CHUNK_MAX_CHARS = 1500;

function providerChain(): TTSProvider[] {
  const chain: TTSProvider[] = [];
  // OpenAI primary — gpt-4o-mini-tts: cheap (~$0.012/1K chars), 300–600ms TTFB,
  // production-tier voice quality. The default Lew picked.
  if (process.env.OPENAI_API_KEY) chain.push('openai');
  // ElevenLabs Flash v2.5 — premium upgrade if user enables a key
  if (process.env.ELEVENLABS_API_KEY) chain.push('elevenlabs');
  // Azure neural — 500k chars/month free, last commercial fallback
  if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) chain.push('azure');
  // Edge / Gemini — kept available but no longer default. Set DISABLE_EDGE_TTS=1 to opt out.
  if (process.env.GEMINI_API_KEY) chain.push('gemini');
  if (!process.env.DISABLE_EDGE_TTS) chain.push('edge');
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
    // gpt-4o-mini-tts voice library. `ash` is locked default per platform-level-up scope.
    return [
      { id: 'ash', label: 'Ash (warm, grounded — default)' },
      { id: 'sage', label: 'Sage (calm, thoughtful)' },
      { id: 'ballad', label: 'Ballad (expressive, narrator)' },
      { id: 'coral', label: 'Coral (bright, female)' },
      { id: 'nova', label: 'Nova (warm, female)' },
      { id: 'onyx', label: 'Onyx (deep, male)' },
      { id: 'alloy', label: 'Alloy (neutral)' },
      { id: 'shimmer', label: 'Shimmer (bright, female)' },
      { id: 'echo', label: 'Echo (calm, male)' },
      { id: 'fable', label: 'Fable (British)' },
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

// Split long text into MP3-concat-safe chunks. Paragraph-first, sentence-fallback,
// hard-cut as last resort. Each chunk stays under CHUNK_MAX_CHARS.
function chunkText(text: string, max: number = CHUNK_MAX_CHARS): string[] {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Empty TTS input after trim');
  if (trimmed.length <= max) return [trimmed];

  const paragraphs = trimmed.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buf = '';

  const flush = () => { if (buf.trim()) chunks.push(buf.trim()); buf = ''; };

  // Grapheme-aware hard split: Array.from yields code points (no surrogate pair tearing).
  const hardSplit = (s: string): string[] => {
    const cps = Array.from(s);
    const out: string[] = [];
    for (let i = 0; i < cps.length; i += max) out.push(cps.slice(i, i + max).join('').trim());
    return out.filter(Boolean);
  };

  for (const para of paragraphs) {
    if (para.length > max) {
      flush();
      const sentences = para.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [para];
      for (const sent of sentences) {
        if (sent.length > max) {
          for (const piece of hardSplit(sent)) chunks.push(piece);
        } else if ((buf + sent).length > max) {
          flush();
          buf = sent;
        } else {
          buf += sent;
        }
      }
      flush();
    } else if ((buf ? buf.length + 2 : 0) + para.length > max) {
      flush();
      buf = para;
    } else {
      buf = buf ? `${buf}\n\n${para}` : para;
    }
  }
  flush();
  return chunks;
}

// Strip an ID3v2 tag from the head of an MP3 buffer if present. OpenAI's mp3
// response includes ID3v2; concatenating multiple responses leaves headers
// mid-stream and corrupts seek/duration on stricter decoders (Safari, iOS WV).
function stripID3v2(buf: Buffer): Buffer {
  if (buf.length < 10) return buf;
  if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return buf; // not "ID3"
  // Synchsafe int: 4 bytes, top bit of each byte cleared
  const size = (buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9];
  const total = 10 + size;
  if (total >= buf.length) return buf;
  return buf.subarray(total);
}

// Truncate upstream error bodies before they propagate — they sometimes echo
// the request, which here means the user's article content leaking into logs.
function safeUpstreamError(label: string, status: number, body: string): Error {
  const cleaned = body.replace(/"input"\s*:\s*"[^"]*"/g, '"input":"<redacted>"').slice(0, 120);
  return new Error(`${label} ${status} ${cleaned}`);
}

// Per-chunk fetch with one retry on 429/5xx (exponential backoff).
async function fetchOpenAIChunk(chunk: string, voice: string): Promise<Buffer> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 400 * attempt));
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice,
        input: chunk,
        response_format: 'mp3',
      }),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const body = await res.text().catch(() => '');
    lastErr = safeUpstreamError('OpenAI TTS', res.status, body);
    // Only retry on transient errors; 4xx is permanent.
    if (res.status !== 429 && res.status < 500) break;
  }
  throw lastErr ?? new Error('OpenAI TTS failed');
}

async function synthesizeOpenAI(text: string, voice: string): Promise<Buffer> {
  const chunks = chunkText(text);
  const buffers = await Promise.all(chunks.map(chunk => fetchOpenAIChunk(chunk, voice)));
  // Strip ID3v2 from every chunk after the first so the decoder sees one stream.
  const cleaned = buffers.map((b, i) => i === 0 ? b : stripID3v2(b));
  return Buffer.concat(cleaned);
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
  if (!res.ok) throw safeUpstreamError('ElevenLabs', res.status, await res.text().catch(() => ''));
  return Buffer.from(await res.arrayBuffer());
}

const EDGE_TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

function generateSecMsGec(): string {
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
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const lang = voice.slice(0, 5);
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
  if (!res.ok) throw safeUpstreamError('Azure TTS', res.status, await res.text().catch(() => ''));
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
  if (!res.ok) throw safeUpstreamError('Gemini TTS', res.status, await res.text().catch(() => ''));
  const data = await res.json();
  const b64 = data.candidates?.[0]?.content?.parts?.find((p: { inlineData?: { data: string } }) => p.inlineData)?.inlineData?.data;
  if (!b64) throw new Error('Gemini returned no audio');
  return Buffer.from(b64, 'base64');
}

async function synthesize(provider: TTSProvider, text: string, voice: string): Promise<Buffer> {
  if (provider === 'openai') return synthesizeOpenAI(text, voice);
  if (provider === 'elevenlabs') return synthesizeElevenLabs(text, voice);
  if (provider === 'azure') return synthesizeAzure(text, voice);
  if (provider === 'edge') return synthesizeEdge(text, voice);
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
    throw new Error('No TTS provider configured. Set OPENAI_API_KEY (recommended), ELEVENLABS_API_KEY, AZURE_SPEECH_KEY+AZURE_SPEECH_REGION, or GEMINI_API_KEY.');
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
