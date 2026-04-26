'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Voice {
  id: string;
  label: string;
}

interface Props {
  text: string;
  storageKey?: string;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
const SPEED_KEY = 'book-audio-speed';
const VOICE_KEY = 'book-audio-voice';

export default function BookAudioPlayer({ text }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fallbackUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [provider, setProvider] = useState<string>('none');
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voice, setVoice] = useState<string>('');
  const [speed, setSpeed] = useState<number>(1);
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'paused'>('idle');
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    fetch('/api/tts')
      .then(r => r.json())
      .then((d: { provider: string; voices: Voice[] }) => {
        setProvider(d.provider);
        setVoices(d.voices);
        // Validate any persisted voice against the current provider's voice list.
        // A stale ID from a previous provider would silently route through the
        // fallback chain and degrade quality.
        const savedVoice = typeof window !== 'undefined' ? localStorage.getItem(VOICE_KEY) : null;
        const validSaved = savedVoice && d.voices.some(v => v.id === savedVoice) ? savedVoice : null;
        setVoice(validSaved || d.voices[0]?.id || '');
      })
      .catch(() => setProvider('none'));

    const raw = typeof window !== 'undefined' ? localStorage.getItem(SPEED_KEY) : null;
    const parsed = raw ? parseFloat(raw) : NaN;
    if (Number.isFinite(parsed) && SPEEDS.includes(parsed)) setSpeed(parsed);

    return () => {
      audioRef.current?.pause();
      // Only cancel the utterance this player created — speechSynthesis is
      // global and a blanket cancel kills concurrent players' audio too.
      const ours = fallbackUtteranceRef.current;
      if (ours && window.speechSynthesis) {
        if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
      }
      fallbackUtteranceRef.current = null;
    };
  }, []);

  // Reset on text prop change — different article means different audio.
  useEffect(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (fallbackUtteranceRef.current && window.speechSynthesis?.speaking) {
      window.speechSynthesis.cancel();
    }
    fallbackUtteranceRef.current = null;
    setState('idle');
    setProgress(0);
    setDuration(0);
  }, [text]);

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (fallbackUtteranceRef.current && window.speechSynthesis?.speaking) {
      window.speechSynthesis.cancel();
    }
    fallbackUtteranceRef.current = null;
    setState('idle');
    setProgress(0);
  };

  const playFallback = () => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = speed * 0.95;
    u.pitch = 1;
    u.lang = 'en-ZA';
    u.onend = () => { setState('idle'); fallbackUtteranceRef.current = null; };
    u.onerror = () => { setState('idle'); fallbackUtteranceRef.current = null; };
    fallbackUtteranceRef.current = u;
    window.speechSynthesis.speak(u);
    setState('playing');
  };

  const play = async () => {
    if (state === 'playing') {
      if (audioRef.current) {
        audioRef.current.pause();
        setState('paused');
      } else {
        window.speechSynthesis?.cancel();
        setState('idle');
      }
      return;
    }

    if (state === 'paused' && audioRef.current) {
      audioRef.current.play();
      setState('playing');
      return;
    }

    if (provider === 'none') {
      playFallback();
      return;
    }

    setState('loading');
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice }),
      });
      if (!res.ok) {
        toast('Using browser voice', { description: 'Neural TTS unavailable — check your API quota in Settings.', duration: 3000 });
        setState('idle');
        playFallback();
        return;
      }
      const data = await res.json() as { url: string; cached: boolean; provider: string };
      // If the server fell through to a non-primary provider, the user is
      // hearing degraded audio. Tell them why so they can fix it.
      if (data.provider !== provider) {
        toast(`Using ${data.provider} voice`, {
          description: `Primary TTS provider unavailable; quality may differ.`,
          duration: 3500,
        });
      }
      const audio = new Audio(data.url);
      audio.playbackRate = speed;
      audio.ontimeupdate = () => {
        setProgress(audio.currentTime);
        setDuration(audio.duration || 0);
      };
      audio.onended = () => { setState('idle'); setProgress(0); };
      audio.onerror = () => { toast.error('Playback error'); setState('idle'); };
      audioRef.current = audio;
      try {
        await audio.play();
        setState('playing');
      } catch {
        // Autoplay policy or user gesture missing — distinguish from load error.
        toast('Tap play again', { description: 'Browser blocked autoplay.', duration: 2500 });
        setState('idle');
        return;
      }
      if (data.cached) toast('Audio loaded from cache', { duration: 1500 });
    } catch {
      toast.error('Could not load audio — using browser voice');
      setState('idle');
      playFallback();
    }
  };

  const changeSpeed = (s: number) => {
    setSpeed(s);
    localStorage.setItem(SPEED_KEY, String(s));
    if (audioRef.current) audioRef.current.playbackRate = s;
  };

  const changeVoice = (v: string) => {
    setVoice(v);
    localStorage.setItem(VOICE_KEY, v);
    stop();
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = pct * duration;
  };

  const format = (s: number) => {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const playIcon = state === 'playing' ? (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
  ) : state === 'loading' ? (
    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2 a10 10 0 0 1 10 10"/></svg>
  ) : (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
  );

  const label = state === 'loading' ? 'Loading...' : state === 'playing' ? 'Pause' : state === 'paused' ? 'Resume' : 'Read aloud';

  const isActive = state === 'playing' || state === 'paused' || state === 'loading';

  return (
    <div className={cn('flex items-center gap-1.5 flex-wrap', isActive && 'bg-primary/5 rounded-lg px-1.5 py-1')}>
      <button
        onClick={play}
        disabled={state === 'loading'}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors',
          isActive
            ? 'border-primary/50 text-primary bg-primary/10'
            : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
        )}
      >
        {playIcon}
        {label}
      </button>

      {isActive && (
        <button
          onClick={stop}
          className="text-[11px] px-2 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
        >
          Stop
        </button>
      )}

      {provider !== 'none' && voices.length > 1 && (
        <select
          value={voice}
          onChange={(e) => changeVoice(e.target.value)}
          disabled={isActive}
          className="text-[11px] bg-transparent border border-border rounded-lg px-2 py-1 text-muted-foreground focus:outline-none disabled:opacity-50"
          title="Voice"
        >
          {voices.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
      )}

      <select
        value={speed}
        onChange={(e) => changeSpeed(Number(e.target.value))}
        className="text-[11px] bg-transparent border border-border rounded-lg px-1.5 py-1 text-muted-foreground focus:outline-none"
        title="Speed"
      >
        {SPEEDS.map(s => <option key={s} value={s}>{s}x</option>)}
      </select>

      {isActive && duration > 0 && audioRef.current && (
        <div className="flex items-center gap-1.5 min-w-[140px]">
          <span className="text-[10px] text-muted-foreground tabular-nums">{format(progress)}</span>
          <div
            className="flex-1 h-1 bg-border rounded cursor-pointer"
            onClick={seek}
          >
            <div
              className="h-full bg-primary rounded"
              style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums">{format(duration)}</span>
        </div>
      )}

      {provider === 'none' && (
        <span className="text-[10px] text-muted-foreground/60" title="No TTS provider configured. Set OPENAI_API_KEY for natural voices.">browser voice</span>
      )}
    </div>
  );
}
