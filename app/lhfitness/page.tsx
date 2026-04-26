'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { Home, Dumbbell, Sparkles, TrendingUp, User, ArrowLeft, Zap, Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

import { useFitnessState, setProfile, addWorkout, deleteWorkout, updateScheduledStatus } from './store';
import type { Workout, Session, ScheduledSession } from './types';

import Onboarding from './onboarding';
import TodayView from './today';
import LibraryView from './library';
import SessionView from './session';
import CoachView from './coach';
import ProgressView from './progress';
import ProfileView from './profile';
import PlanView from './plan';

type View = 'today' | 'library' | 'plan' | 'coach' | 'progress' | 'profile';

const NAV: Array<{ id: View; label: string; icon: typeof Home }> = [
  { id: 'today', label: 'Today', icon: Home },
  { id: 'library', label: 'Library', icon: Dumbbell },
  { id: 'plan', label: 'Plan', icon: CalendarIcon },
  { id: 'coach', label: 'Coach', icon: Sparkles },
  { id: 'progress', label: 'Progress', icon: TrendingUp },
  { id: 'profile', label: 'Profile', icon: User },
];

export default function LHFitnessPage() {
  const { state, update, hydrated } = useFitnessState();
  const [view, setView] = useState<View>('today');
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);
  const [activeScheduledId, setActiveScheduledId] = useState<string | null>(null);

  // PWA shortcut deep-links (?view=plan|coach|library|today|progress|profile)
  // Lets the home-screen long-press menu jump straight to a section.
  // Reads window.location directly (no useSearchParams) to keep the page out of
  // Next.js 16's Suspense-boundary requirement for static prerendering.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const v = params.get('view');
    if (v && (NAV as Array<{ id: string }>).some(n => n.id === v)) {
      setView(v as View);
    }
  }, []);

  // Find the most recent prior session of the same workout (for "last time" reference in session view)
  const priorSession = useMemo(() => {
    if (!activeWorkout) return undefined;
    return state.sessions.find(s => s.workout_id === activeWorkout.id);
  }, [activeWorkout, state.sessions]);

  const startWorkout = (w: Workout, scheduledId?: string) => {
    setActiveWorkout(w);
    setActiveScheduledId(scheduledId ?? null);
  };

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground text-sm flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          Loading...
        </div>
      </div>
    );
  }

  // First-time user → onboarding flow
  if (!state.profile) {
    return (
      <Onboarding
        onComplete={(profile) => {
          setProfile(profile, update);
          toast.success(`Welcome, ${profile.name}`);
        }}
      />
    );
  }

  // Active session takes over the screen
  if (activeWorkout) {
    return (
      <SessionView
        workout={activeWorkout}
        lastSession={priorSession}
        dispatch={update}
        onCancel={() => { setActiveWorkout(null); setActiveScheduledId(null); }}
        onFinish={(session) => {
          // If this session came from a scheduled day, mark it complete + link
          if (activeScheduledId && session) {
            updateScheduledStatus(activeScheduledId, {
              status: 'completed',
              completed_session_id: session.id,
            }, update);
          }
          setActiveWorkout(null);
          setActiveScheduledId(null);
          if (session) {
            setView('today');
            toast.success(`Session saved · ${Math.floor((session.duration_seconds || 0) / 60)} min`);
          }
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-30 safe-top">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Link
              href="/wellness"
              className="text-muted-foreground hover:text-foreground p-1.5 -ml-1.5 rounded-lg hover:bg-secondary transition-colors"
              title="Back to Lewhofmeyr"
            >
              <ArrowLeft size={18} />
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-[0_0_14px_var(--brand-glow)]">
                <Zap size={14} className="text-primary-foreground" fill="currentColor" />
              </div>
              <span className="font-bold tracking-tight text-foreground">LH Fitness</span>
            </div>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map(n => {
              const Icon = n.icon;
              const active = view === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => setView(n.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  )}
                >
                  <Icon size={14} />
                  {n.label}
                </button>
              );
            })}
          </nav>

          <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 status-dot-green" />
            {state.profile.name}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-8">
          {view === 'today' && (
            <TodayView
              state={state}
              onStartWorkout={(w, sid) => startWorkout(w, sid)}
              onNavigate={(v) => setView(v as View)}
            />
          )}
          {view === 'library' && (
            <LibraryView
              state={state}
              onStartWorkout={(w) => startWorkout(w)}
              onAddWorkout={(w) => addWorkout(w, update)}
              onDeleteWorkout={(id) => deleteWorkout(id, update)}
            />
          )}
          {view === 'plan' && (
            <PlanView
              state={state}
              dispatch={update}
              onStartWorkout={(w) => startWorkout(w)}
              onNavigateToCoach={() => setView('coach')}
            />
          )}
          {view === 'coach' && (
            <CoachView state={state} dispatch={update} onPlanCommitted={() => setView('plan')} />
          )}
          {view === 'progress' && (
            <ProgressView state={state} dispatch={update} />
          )}
          {view === 'profile' && (
            <ProfileView state={state} dispatch={update} />
          )}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 backdrop-blur-md safe-bottom">
        <div className="grid grid-cols-6">
          {NAV.map(n => {
            const Icon = n.icon;
            const active = view === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                className="flex flex-col items-center gap-1 py-2 relative"
              >
                {active && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-b shadow-[0_0_8px_var(--brand-glow)]" />}
                <Icon size={18} className={cn(active ? 'text-primary' : 'text-muted-foreground')} />
                <span className={cn('text-[10px] font-medium', active ? 'text-primary' : 'text-muted-foreground')}>{n.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
