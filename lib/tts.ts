import { createHash } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-server';

export type TTSProvider = 'azure' | 'openai' | 'elevenlabs' | 'gemini' | 'none';

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
  // Azure second — 500k chars/month free, Audible-tier neural voices (incl. en-ZA)
  if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) chain.push('azure');
  // Gemini third — also free via existing key, preview quality
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
  if (provider === 'azure') {
    return [
      { id: 'en-ZA-LeahNeural', label: 'Leah (South African, female)' },
      { id: 'en-ZA-LukeNeural', label: 'Luke (South African, male)' },
      { id: 'en-GB-RyanNeural', label: 'Ryan (British, male)' },
      { id: 'en-GB-SoniaNeural', label: 'Sonia (British, female)' },
      { id: 'en-US-JennyNeural', label: 'Jenny (US, female, warm)' },
      { id: 'en-US-GuyNeural', label: 'Guy (US, male)' },
      { id: 'en-US-AriaNeural', label: 'Aria (US, female, expressive)' },
      { id: 'en-US-DavisNeural', label: 'Davis (US, male, calm)' },
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
