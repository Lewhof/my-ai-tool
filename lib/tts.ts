import { createHash } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-server';

export type TTSProvider = 'openai' | 'elevenlabs' | 'gemini' | 'none';

export interface TTSResult {
  url: string;
  provider: TTSProvider;
  cached: boolean;
  voice: string;
}

function detectProvider(): TTSProvider {
  if (process.env.ELEVENLABS_API_KEY) return 'elevenlabs';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return 'none';
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

export async function generateTTS(
  userId: string,
  text: string,
  voice?: string
): Promise<TTSResult> {
  const provider = detectProvider();
  if (provider === 'none') {
    throw new Error('No TTS provider configured. Set ELEVENLABS_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY.');
  }

  const resolvedVoice = voice || listVoices(provider)[0]?.id || 'default';
  const key = hashText(text, `${provider}:${resolvedVoice}`);
  const storagePath = `${userId}/${key}.mp3`;

  // Cache check
  const { data: existing } = await supabaseAdmin.storage.from('tts').createSignedUrl(storagePath, 3600);
  if (existing?.signedUrl) {
    // Verify the object actually exists (createSignedUrl can succeed for non-existent paths)
    const head = await fetch(existing.signedUrl, { method: 'HEAD' });
    if (head.ok) {
      return { url: existing.signedUrl, provider, cached: true, voice: resolvedVoice };
    }
  }

  // Synthesize
  let audio: Buffer;
  if (provider === 'openai') audio = await synthesizeOpenAI(text, resolvedVoice);
  else if (provider === 'elevenlabs') audio = await synthesizeElevenLabs(text, resolvedVoice);
  else audio = await synthesizeGemini(text, resolvedVoice);

  // Upload
  const { error: upErr } = await supabaseAdmin.storage
    .from('tts')
    .upload(storagePath, audio, { contentType: 'audio/mpeg', upsert: true });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

  const { data: signed } = await supabaseAdmin.storage.from('tts').createSignedUrl(storagePath, 3600);
  if (!signed?.signedUrl) throw new Error('Could not create signed URL');

  return { url: signed.signedUrl, provider, cached: false, voice: resolvedVoice };
}

export function getCurrentProvider(): TTSProvider {
  return detectProvider();
}
