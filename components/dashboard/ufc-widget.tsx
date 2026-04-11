'use client';

import { useState, useEffect } from 'react';
import { Loader2, Calendar, MapPin, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UfcEvent {
  id: string;
  name: string;
  date: string;
  time: string | null;
  venue: string | null;
  city: string | null;
  country: string | null;
  thumb: string | null;
  status: string;
  isPast: boolean;
}

interface Bout {
  weightClass: string;
  fighter1: string;
  fighter2: string;
  method: string | null;
  round: string | null;
  time: string | null;
  notes: string | null;
}

interface CardSection {
  name: string;
  bouts: Bout[];
}

function formatEventDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const event = new Date(dateStr + 'T00:00:00');
  return Math.ceil((event.getTime() - now.getTime()) / 86400000);
}

function isNumberedEvent(name: string): boolean {
  return /UFC \d+/i.test(name) || /UFC Freedom/i.test(name);
}

function FightCard({ eventName }: { eventName: string }) {
  const [sections, setSections] = useState<CardSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    fetch(`/api/ufc/card?name=${encodeURIComponent(eventName)}`)
      .then(r => r.json())
      .then(d => {
        if (d.sections?.length) {
          setSections(d.sections);
        } else {
          setError(d.error || 'No fight card available');
        }
      })
      .catch(() => setError('Failed to load fight card'))
      .finally(() => setLoading(false));
  }, [eventName]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-4">
        <Loader2 size={12} className="animate-spin text-muted-foreground" />
        <span className="text-muted-foreground text-[11px]">Loading fight card...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-3 text-center">
        <span className="text-muted-foreground text-[11px]">{error}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 py-3">
      {sections.map((section) => (
        <div key={section.name}>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {section.name}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-1.5">
            {section.bouts.map((bout, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-card/50 border border-border/50"
              >
                {/* Weight class */}
                <span className="text-[9px] text-muted-foreground w-[70px] shrink-0 truncate">
                  {bout.weightClass}
                </span>

                {/* Fighter 1 */}
                <span className="flex-1 text-[11px] text-foreground font-medium text-right truncate">
                  {bout.fighter1}
                </span>

                {/* VS */}
                <span className="text-[9px] text-muted-foreground font-bold shrink-0 px-1">
                  vs
                </span>

                {/* Fighter 2 */}
                <span className="flex-1 text-[11px] text-foreground font-medium text-left truncate">
                  {bout.fighter2}
                </span>

                {/* Method (if available — past events) */}
                {bout.method && (
                  <span className="text-[9px] text-muted-foreground w-[60px] shrink-0 truncate text-right hidden sm:block">
                    {bout.method}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function UfcWidget() {
  const [events, setEvents] = useState<UfcEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/ufc?limit=6&filter=upcoming')
      .then(r => r.json())
      .then(d => setEvents(d.events ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-2xl border border-border overflow-hidden" style={{ background: 'var(--color-surface-1)' }}>
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded flex items-center justify-center bg-red-500/20 text-red-400 text-[10px] font-bold">
            UFC
          </div>
          <h3 className="text-[13px] font-semibold text-foreground">Upcoming UFC Events</h3>
        </div>
        <a
          href="https://en.wikipedia.org/wiki/List_of_UFC_events"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Full list <ExternalLink size={9} />
        </a>
      </div>

      <div className="divide-y divide-border">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-6">
            <Loader2 size={14} className="animate-spin text-muted-foreground" />
            <span className="text-muted-foreground text-sm">Loading events...</span>
          </div>
        ) : events.length === 0 ? (
          <p className="text-muted-foreground text-sm p-5">No upcoming events found</p>
        ) : (
          events.map((event) => {
            const days = daysUntil(event.date);
            const isNextUp = days >= 0 && days <= 7;
            const isNumbered = isNumberedEvent(event.name);
            const isExpanded = expandedId === event.id;

            return (
              <div key={event.id}>
                <div
                  className={cn(
                    'px-5 py-3.5 transition-colors cursor-pointer',
                    isNextUp && !isExpanded && 'bg-red-500/[0.03]',
                    isExpanded ? 'bg-surface-2' : 'hover:bg-surface-2',
                  )}
                  onClick={() => setExpandedId(isExpanded ? null : event.id)}
                >
                  <div className="flex items-start gap-3">
                    {/* Date badge */}
                    <div className={cn(
                      'w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 border',
                      isNextUp ? 'border-red-500/30 bg-red-500/10' : 'border-border bg-card',
                    )}>
                      <span className={cn('text-[10px] uppercase font-semibold', isNextUp ? 'text-red-400' : 'text-muted-foreground')}>
                        {new Date(event.date + 'T12:00:00').toLocaleDateString('en-ZA', { month: 'short' })}
                      </span>
                      <span className={cn('text-[15px] font-bold -mt-0.5', isNextUp ? 'text-red-400' : 'text-foreground')}>
                        {new Date(event.date + 'T12:00:00').getDate()}
                      </span>
                    </div>

                    {/* Event details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={cn(
                          'text-[13px] font-medium truncate',
                          isNumbered ? 'text-foreground' : 'text-foreground/80',
                        )}>
                          {event.name}
                        </p>
                        {isNumbered && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 shrink-0 uppercase">
                            PPV
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="flex items-center gap-1 text-muted-foreground text-[11px]">
                          <Calendar size={10} />
                          {formatEventDate(event.date)}
                        </span>
                        {event.venue && (
                          <span className="flex items-center gap-1 text-muted-foreground text-[11px] truncate">
                            <MapPin size={10} className="shrink-0" />
                            {event.venue}
                            {event.country && event.country !== 'United States' ? `, ${event.country}` : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right side: days + expand indicator */}
                    <div className="shrink-0 flex items-center gap-2">
                      {days === 0 ? (
                        <span className="text-[11px] font-bold text-red-400 animate-pulse">TODAY</span>
                      ) : days > 0 ? (
                        <span className={cn('text-[11px] font-medium', days <= 7 ? 'text-red-400' : 'text-muted-foreground')}>
                          {days}d
                        </span>
                      ) : null}
                      {isExpanded ? (
                        <ChevronUp size={12} className="text-muted-foreground" />
                      ) : (
                        <ChevronDown size={12} className="text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded fight card */}
                {isExpanded && (
                  <div className="px-5 pb-4 border-t border-border/50 bg-surface-2">
                    <FightCard eventName={event.name} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
