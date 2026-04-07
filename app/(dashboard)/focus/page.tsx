'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Play, Pause, RotateCcw, Coffee, Timer } from 'lucide-react';

const PRESETS = [
  { label: '25 min', work: 25, break: 5, name: 'Pomodoro' },
  { label: '50 min', work: 50, break: 10, name: 'Deep Work' },
  { label: '90 min', work: 90, break: 15, name: 'Flow State' },
];

export default function FocusPage() {
  const [workDuration, setWorkDuration] = useState(25);
  const [breakDuration, setBreakDuration] = useState(5);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [sessions, setSessions] = useState(0);
  const [task, setTask] = useState('');
  const [sessionLog, setSessionLog] = useState<Array<{ task: string; duration: number; completed_at: string }>>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      // Timer completed
      if (!isBreak) {
        setSessions((prev) => prev + 1);
        setSessionLog((prev) => [...prev, { task: task || 'Untitled session', duration: workDuration, completed_at: new Date().toISOString() }]);
        // Play notification sound
        try { new Audio('data:audio/wav;base64,UklGRl9vT19teleWQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRh').play(); } catch { /* silent */ }
        setIsBreak(true);
        setTimeLeft(breakDuration * 60);
      } else {
        setIsBreak(false);
        setTimeLeft(workDuration * 60);
        setIsRunning(false);
      }
    }

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, timeLeft, isBreak, workDuration, breakDuration, task]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progress = isBreak
    ? ((breakDuration * 60 - timeLeft) / (breakDuration * 60)) * 100
    : ((workDuration * 60 - timeLeft) / (workDuration * 60)) * 100;

  const reset = () => {
    setIsRunning(false);
    setIsBreak(false);
    setTimeLeft(workDuration * 60);
  };

  const selectPreset = (preset: typeof PRESETS[0]) => {
    setWorkDuration(preset.work);
    setBreakDuration(preset.break);
    setTimeLeft(preset.work * 60);
    setIsRunning(false);
    setIsBreak(false);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 gap-8">
      {/* Presets */}
      <div className="flex gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => selectPreset(p)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
              workDuration === p.work ? 'bg-accent-600/15 border-accent-600/50 text-accent-400' : 'border-gray-700 text-gray-400 hover:border-gray-600'
            )}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Timer circle */}
      <div className="relative w-64 h-64">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="#1e2330" strokeWidth="4" />
          <circle
            cx="50" cy="50" r="45" fill="none"
            stroke={isBreak ? '#22c55e' : '#ea580c'}
            strokeWidth="4"
            strokeDasharray={`${2 * Math.PI * 45}`}
            strokeDashoffset={`${2 * Math.PI * 45 * (1 - progress / 100)}`}
            strokeLinecap="round"
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-white text-5xl font-bold font-mono">{formatTime(timeLeft)}</p>
          <p className="text-gray-500 text-sm mt-2">
            {isBreak ? 'Break time' : isRunning ? 'Focus' : 'Ready'}
          </p>
          {isBreak && <Coffee size={16} className="text-green-400 mt-1" />}
        </div>
      </div>

      {/* Task input */}
      <input
        value={task}
        onChange={(e) => setTask(e.target.value)}
        placeholder="What are you working on?"
        className="bg-gray-800 text-white border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-center w-64 focus:outline-none focus:ring-2 focus:ring-accent-600 placeholder-gray-500"
      />

      {/* Controls */}
      <div className="flex items-center gap-4">
        <button
          onClick={reset}
          className="p-3 rounded-full bg-gray-800 text-gray-400 hover:text-white border border-gray-700 transition-colors"
          title="Reset"
        >
          <RotateCcw size={20} />
        </button>
        <button
          onClick={() => setIsRunning(!isRunning)}
          className={cn(
            'p-5 rounded-full text-white transition-colors',
            isRunning ? 'bg-gray-700 hover:bg-gray-600' : 'bg-accent-600 hover:bg-accent-700'
          )}
        >
          {isRunning ? <Pause size={28} /> : <Play size={28} className="ml-1" />}
        </button>
        <div className="p-3 rounded-full bg-gray-800 text-gray-400 border border-gray-700 flex items-center gap-1.5">
          <Timer size={16} />
          <span className="text-sm font-medium">{sessions}</span>
        </div>
      </div>

      {/* Session log */}
      {sessionLog.length > 0 && (
        <div className="w-full max-w-md">
          <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">Today&apos;s Sessions</p>
          <div className="space-y-1">
            {sessionLog.map((s, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-2">
                <span className="text-white text-sm">{s.task}</span>
                <span className="text-gray-500 text-xs">{s.duration}min</span>
              </div>
            ))}
          </div>
          <p className="text-gray-600 text-xs mt-2 text-center">
            Total: {sessionLog.reduce((sum, s) => sum + s.duration, 0)} minutes focused
          </p>
        </div>
      )}
    </div>
  );
}
