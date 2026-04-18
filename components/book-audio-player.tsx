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
        const savedVoice = typeof window !== 'undefined' ? localStorage.getItem(VOICE_KEY) : null;
        setVoice(savedVoice || d.voices[0]?.id || '');
      })
      .catch(() => setProvider('none'));

    const savedSpeed = typeof window !== 'undefined' ? Number(localStorage.getItem(SPEED_KEY)) : 0;
    if (savedSpeed && SPEEDS.includes(savedSpeed)) setSpeed(savedSpeed);

    return () => {
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    window.speechSynthesis?.cancel();
    setState('idle');
    setProgress(0);
  };

  const playFallback = () => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = speed * 0.95;
    u.pitch = 1;
    u.lang = 'en-ZA';
    u.onend = () => setState('idle');
    u.onerror = () => setState('idle');
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
      const data = await res.json() as { url: string; cached: boolean };
      const audio = new Audio(data.url);
      audio.playbackRate = speed;
      audio.ontimeupdate = () => {
        setProgress(audio.currentTime);
        setDuration(audio.duration || 0);
      };
      audio.onended = () => { setState('idle'); setProgress(0); };
      audio.onerror = () => { toast.error('Playback error'); setState('idle'); };
      audioRef.current = audio;
      await audio.play();
      setState('playing');
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
        <span className="text-[10px] text-muted-foreground/60" title="Add OPENAI_API_KEY, ELEVENLABS_API_KEY, or GEMINI_API_KEY for natural voices">browser voice</span>
      )}
    </div>
  );
}
