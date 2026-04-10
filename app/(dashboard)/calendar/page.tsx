'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Plus, X, Calendar as CalIcon, ExternalLink, Users, Trash2, MapPin, Clock } from 'lucide-react';

interface CalendarAccount {
  id: string;
  label: string;
  alias: string;
  email: string;
  color: string;
  provider: string;
  is_default: boolean;
  connected: boolean;
}

interface CalendarEvent {
  id: string;
  subject: string;
  start: string;
  end: string;
  location: string | null;
  isAllDay: boolean;
  showAs: string;
  accountId: string;
  accountLabel: string;
  accountColor: string;
}

type View = 'day' | 'week' | 'month';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Timeline config: 6am–9pm (15 hours)
const TIMELINE_START = 6;
const TIMELINE_HOURS = 15;
const HOUR_HEIGHT = 60; // px per hour
const TIMELINE_HEIGHT = TIMELINE_HOURS * HOUR_HEIGHT;
const HOURS = Array.from({ length: TIMELINE_HOURS + 1 }, (_, i) => i + TIMELINE_START);

function formatHour(h: number): string {
  return `${h.toString().padStart(2, '0')}:00`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getWeekDays(date: Date): Date[] {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function getMonthDays(date: Date): Date[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const days: Date[] = [];
  for (let i = startOffset - 1; i >= 0; i--) days.push(new Date(year, month, -i));
  const lastDate = new Date(year, month + 1, 0).getDate();
  for (let i = 1; i <= lastDate; i++) days.push(new Date(year, month, i));
  while (days.length < 42) {
    days.push(new Date(year, month + 1, days.length - lastDate - startOffset + 1));
  }
  return days;
}

function statusBorderColor(showAs: string): string {
  switch (showAs) {
    case 'busy': return 'border-l-red-500';
    case 'tentative': return 'border-l-yellow-500';
    case 'free': return 'border-l-green-500';
    case 'oof': return 'border-l-purple-500';
    default: return 'border-l-primary';
  }
}

// ── Event Layout: position-based with overlap columns ──

interface PositionedEvent extends CalendarEvent {
  top: number;       // px from timeline top
  height: number;    // px
  col: number;       // which column (0-based)
  totalCols: number; // total columns in overlap group
}

function getEventPixelPosition(event: CalendarEvent): { top: number; height: number } {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = end.getHours() * 60 + end.getMinutes();
  const timelineStartMin = TIMELINE_START * 60;
  const top = ((startMin - timelineStartMin) / 60) * HOUR_HEIGHT;
  const height = ((endMin - startMin) / 60) * HOUR_HEIGHT;
  return { top: Math.max(top, 0), height: Math.max(height, HOUR_HEIGHT / 4) };
}

function layoutOverlappingEvents(events: CalendarEvent[]): PositionedEvent[] {
  if (events.length === 0) return [];

  // Sort by start time, then longer events first
  const sorted = [...events].sort((a, b) => {
    const diff = new Date(a.start).getTime() - new Date(b.start).getTime();
    if (diff !== 0) return diff;
    return (new Date(b.end).getTime() - new Date(b.start).getTime()) -
           (new Date(a.end).getTime() - new Date(a.start).getTime());
  });

  // Find overlapping groups (events that form a connected overlap chain)
  const groups: CalendarEvent[][] = [];
  let currentGroup: CalendarEvent[] = [];
  let groupEnd = 0;

  for (const event of sorted) {
    const eStart = new Date(event.start).getTime();
    const eEnd = new Date(event.end).getTime();

    if (currentGroup.length === 0 || eStart < groupEnd) {
      currentGroup.push(event);
      groupEnd = Math.max(groupEnd, eEnd);
    } else {
      groups.push(currentGroup);
      currentGroup = [event];
      groupEnd = eEnd;
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  // Assign columns within each group
  const result: PositionedEvent[] = [];

  for (const group of groups) {
    const columns: CalendarEvent[][] = [];

    for (const event of group) {
      const eStart = new Date(event.start).getTime();
      const eEnd = new Date(event.end).getTime();

      let placed = false;
      for (let col = 0; col < columns.length; col++) {
        const fits = columns[col].every(existing => {
          const oStart = new Date(existing.start).getTime();
          const oEnd = new Date(existing.end).getTime();
          return eStart >= oEnd || eEnd <= oStart;
        });
        if (fits) {
          columns[col].push(event);
          const pos = getEventPixelPosition(event);
          result.push({ ...event, ...pos, col, totalCols: 0 });
          placed = true;
          break;
        }
      }
      if (!placed) {
        columns.push([event]);
        const pos = getEventPixelPosition(event);
        result.push({ ...event, ...pos, col: columns.length - 1, totalCols: 0 });
      }
    }

    const totalCols = columns.length;
    for (const item of result) {
      if (group.some(e => e.id === item.id)) {
        item.totalCols = totalCols;
      }
    }
  }

  return result;
}

// ── Event Card (Teams-style) ──

function EventCard({ event, compact = false }: { event: PositionedEvent; compact?: boolean }) {
  const isShort = event.height < 40;
  return (
    <div
      className={cn(
        'absolute rounded-md border-l-[3px] bg-card/95 backdrop-blur-sm border border-border/50 overflow-hidden transition-shadow hover:shadow-lg hover:z-20 cursor-default group',
        statusBorderColor(event.showAs),
      )}
      style={{
        top: `${event.top}px`,
        height: `${event.height - 2}px`,
        left: compact
          ? `${(event.col / event.totalCols) * 100}%`
          : `${4 + (event.col / event.totalCols) * 94}%`,
        width: compact
          ? `${(1 / event.totalCols) * 100 - 1}%`
          : `${(1 / event.totalCols) * 94 - 1}%`,
      }}
    >
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{ backgroundColor: event.accountColor || '#6366f1' }}
      />
      <div className={cn('relative h-full px-2', isShort ? 'py-0.5 flex items-center gap-2' : 'py-1.5')}>
        <p className={cn(
          'text-foreground font-medium truncate',
          isShort ? 'text-[11px]' : 'text-xs',
        )}>
          {event.subject}
        </p>
        {!isShort && !compact && (
          <div className="flex items-center gap-1 mt-0.5">
            <Clock size={9} className="text-muted-foreground/60 shrink-0" />
            <p className="text-muted-foreground/70 text-[10px] truncate">
              {new Date(event.start).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })}
              {' - '}
              {new Date(event.end).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </p>
          </div>
        )}
        {!isShort && event.location && (
          <div className="flex items-center gap-1 mt-0.5">
            <MapPin size={9} className="text-muted-foreground/60 shrink-0" />
            <p className="text-muted-foreground/60 text-[10px] truncate">{event.location}</p>
          </div>
        )}
        {isShort && (
          <span className="text-muted-foreground/60 text-[10px] shrink-0">
            {new Date(event.start).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Timeline Grid (shared by day & week views) ──

function TimelineGrid({ showCurrentTime, currentPosition }: { showCurrentTime: boolean; currentPosition: number }) {
  return (
    <>
      {HOURS.map((hour) => (
        <div
          key={hour}
          className="absolute left-0 right-0 border-t border-border/20"
          style={{ top: `${(hour - TIMELINE_START) * HOUR_HEIGHT}px` }}
        />
      ))}
      {/* Half-hour lines */}
      {HOURS.slice(0, -1).map((hour) => (
        <div
          key={`half-${hour}`}
          className="absolute left-0 right-0 border-t border-border/10"
          style={{ top: `${(hour - TIMELINE_START) * HOUR_HEIGHT + HOUR_HEIGHT / 2}px` }}
        />
      ))}
      {showCurrentTime && (
        <div
          className="absolute left-0 right-0 z-30 pointer-events-none"
          style={{ top: `${currentPosition}px` }}
        >
          <div className="flex items-center">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1 shadow-sm shadow-red-500/50" />
            <div className="flex-1 h-[2px] bg-red-500/70" />
          </div>
        </div>
      )}
    </>
  );
}

// ── Main Component ──

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [accounts, setAccounts] = useState<CalendarAccount[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [showAccounts, setShowAccounts] = useState(false);
  const [hiddenAccounts, setHiddenAccounts] = useState<Set<string>>(new Set());
  const [addLabel, setAddLabel] = useState('');
  const [view, setView] = useState<View>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newStartTime, setNewStartTime] = useState('09:00');
  const [newEndTime, setNewEndTime] = useState('10:00');
  const [newLocation, setNewLocation] = useState('');

  const fetchEvents = useCallback(async () => {
    const res = await fetch('/api/calendar');
    const data = await res.json();
    setConnected(data.connected);
    setAccounts(data.accounts ?? []);
    setEvents(data.events ?? []);
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Auto-switch to day view on mobile
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    if (mq.matches && view === 'week') setView('day');
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches && view === 'week') setView('day');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [view]);

  const navigate = (direction: -1 | 1) => {
    const d = new Date(currentDate);
    if (view === 'day') d.setDate(d.getDate() + direction);
    else if (view === 'week') d.setDate(d.getDate() + direction * 7);
    else d.setMonth(d.getMonth() + direction);
    setCurrentDate(d);
  };

  const goToday = () => setCurrentDate(new Date());

  const addEvent = async () => {
    if (!newSubject.trim() || !newDate) return;
    await fetch('/api/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: newSubject,
        date: newDate,
        startTime: newStartTime,
        endTime: newEndTime,
        location: newLocation || null,
      }),
    });
    setNewSubject(''); setNewDate(''); setNewStartTime('09:00'); setNewEndTime('10:00'); setNewLocation('');
    setShowAddEvent(false);
    fetchEvents();
  };

  const visibleEvents = useMemo(
    () => events.filter((e) => !hiddenAccounts.has(e.accountId)),
    [events, hiddenAccounts],
  );

  const getEventsForDay = useCallback(
    (date: Date) => visibleEvents.filter((e) => isSameDay(new Date(e.start), date)),
    [visibleEvents],
  );

  const deleteAccount = async (id: string) => {
    if (!confirm('Remove this calendar account?')) return;
    await fetch('/api/calendar/accounts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchEvents();
  };

  const toggleAccount = (id: string) => {
    setHiddenAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const today = new Date();

  // Current time position
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const currentPosition = ((nowMinutes - TIMELINE_START * 60) / 60) * HOUR_HEIGHT;
  const showCurrentTimeLine = currentPosition >= 0 && currentPosition <= TIMELINE_HEIGHT;

  const headerTitle = () => {
    if (view === 'day') return currentDate.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (view === 'week') {
      const week = getWeekDays(currentDate);
      const s = week[0], e = week[6];
      if (s.getMonth() === e.getMonth()) return `${s.getDate()} \u2013 ${e.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
      return `${s.getDate()} ${MONTHS[s.getMonth()].slice(0, 3)} \u2013 ${e.getDate()} ${MONTHS[e.getMonth()].slice(0, 3)} ${e.getFullYear()}`;
    }
    return `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  };

  if (!connected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
        <CalIcon size={48} className="text-muted-foreground/60" />
        <p className="text-muted-foreground text-lg">Connect a Microsoft account to view your calendar</p>
        <a href="/settings/connections" className="bg-primary text-foreground px-6 py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors flex items-center gap-2">
          <ExternalLink size={16} />
          Connect in Settings
        </a>
      </div>
    );
  }

  // ── Day View (Teams-style) ──
  const DayView = () => {
    const dayEvents = getEventsForDay(currentDate);
    const allDayEvents = dayEvents.filter((e) => e.isAllDay);
    const timedEvents = dayEvents.filter((e) => !e.isAllDay);
    const positioned = layoutOverlappingEvents(timedEvents);
    const isViewToday = isSameDay(currentDate, today);

    return (
      <div className="flex-1 overflow-auto">
        {/* All-day bar */}
        {allDayEvents.length > 0 && (
          <div className="px-4 py-2 border-b border-border bg-card/30 sticky top-0 z-10">
            <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1">All day</p>
            <div className="flex gap-2 flex-wrap">
              {allDayEvents.map((e) => (
                <div
                  key={e.id}
                  className="text-foreground text-xs px-2.5 py-1 rounded-md border-l-[3px] bg-card border border-border/50"
                  style={{ borderLeftColor: e.accountColor || '#6366f1' }}
                >
                  {e.subject}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Timeline */}
        <div className="flex">
          {/* Time gutter */}
          <div className="w-14 sm:w-16 shrink-0 relative" style={{ height: `${TIMELINE_HEIGHT}px` }}>
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute w-full text-right pr-2 sm:pr-3"
                style={{ top: `${(hour - TIMELINE_START) * HOUR_HEIGHT}px` }}
              >
                <span className="text-[10px] text-muted-foreground/50 -translate-y-1/2 inline-block font-mono">
                  {formatHour(hour)}
                </span>
              </div>
            ))}
            {/* Current time label */}
            {isViewToday && showCurrentTimeLine && (
              <div className="absolute w-full text-right pr-2 sm:pr-3 z-20" style={{ top: `${currentPosition}px` }}>
                <span className="text-[10px] text-red-500 font-semibold -translate-y-1/2 inline-block font-mono">
                  {now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </span>
              </div>
            )}
          </div>
          {/* Event column */}
          <div className="flex-1 relative border-l border-border/30" style={{ height: `${TIMELINE_HEIGHT}px` }}>
            <TimelineGrid showCurrentTime={isViewToday && showCurrentTimeLine} currentPosition={currentPosition} />
            {positioned.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ── Week View (Teams-style) ──
  const WeekView = () => {
    const weekDays = getWeekDays(currentDate);

    return (
      <div className="flex-1 overflow-auto">
        {/* Day headers — sticky */}
        <div className="flex border-b border-border sticky top-0 bg-background z-20">
          <div className="w-14 sm:w-16 shrink-0" />
          {weekDays.map((d, i) => {
            const isToday = isSameDay(d, today);
            return (
              <div
                key={i}
                className={cn(
                  'flex-1 text-center py-2.5 border-l border-border/30 cursor-pointer transition-colors hover:bg-secondary/30',
                  isToday && 'bg-primary/5',
                )}
                onClick={() => { setCurrentDate(d); setView('day'); }}
              >
                <p className={cn('text-[10px] uppercase tracking-wider', isToday ? 'text-primary font-semibold' : 'text-muted-foreground/60')}>
                  <span className="hidden sm:inline">{WEEKDAYS[d.getDay()]}</span>
                  <span className="sm:hidden">{WEEKDAYS_SHORT[d.getDay()]}</span>
                </p>
                <p className={cn(
                  'text-sm font-semibold mt-0.5',
                  isToday
                    ? 'text-foreground bg-primary w-7 h-7 rounded-full inline-flex items-center justify-center'
                    : 'text-foreground/80',
                )}>
                  {d.getDate()}
                </p>
              </div>
            );
          })}
        </div>
        {/* All-day row */}
        {(() => {
          const hasAllDay = weekDays.some(d => getEventsForDay(d).some(e => e.isAllDay));
          if (!hasAllDay) return null;
          return (
            <div className="flex border-b border-border bg-card/20 sticky top-[62px] z-10">
              <div className="w-14 sm:w-16 shrink-0 flex items-center justify-end pr-2">
                <span className="text-[9px] text-muted-foreground/50 uppercase">All day</span>
              </div>
              {weekDays.map((d, i) => {
                const allDay = getEventsForDay(d).filter(e => e.isAllDay);
                return (
                  <div key={i} className="flex-1 border-l border-border/30 px-0.5 py-1 min-h-[28px]">
                    {allDay.map(e => (
                      <div
                        key={e.id}
                        className="text-[10px] text-foreground px-1.5 py-0.5 rounded truncate mb-0.5 border-l-2 bg-card border border-border/50"
                        style={{ borderLeftColor: e.accountColor || '#6366f1' }}
                      >
                        {e.subject}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })()}
        {/* Timeline grid */}
        <div className="flex">
          {/* Time gutter */}
          <div className="w-14 sm:w-16 shrink-0 relative" style={{ height: `${TIMELINE_HEIGHT}px` }}>
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute w-full text-right pr-2 sm:pr-3"
                style={{ top: `${(hour - TIMELINE_START) * HOUR_HEIGHT}px` }}
              >
                <span className="text-[10px] text-muted-foreground/40 -translate-y-1/2 inline-block font-mono">
                  {formatHour(hour)}
                </span>
              </div>
            ))}
          </div>
          {/* Day columns */}
          {weekDays.map((d, i) => {
            const isToday = isSameDay(d, today);
            const dayTimedEvents = getEventsForDay(d).filter(e => !e.isAllDay);
            const positioned = layoutOverlappingEvents(dayTimedEvents);

            return (
              <div
                key={i}
                className={cn(
                  'flex-1 relative border-l border-border/30',
                  isToday && 'bg-primary/[0.02]',
                )}
                style={{ height: `${TIMELINE_HEIGHT}px` }}
              >
                {i === 0 && (
                  <TimelineGrid
                    showCurrentTime={isSameDay(weekDays.find(wd => isSameDay(wd, today)) ?? new Date(0), today) && showCurrentTimeLine && isToday}
                    currentPosition={currentPosition}
                  />
                )}
                {/* Hour gridlines per column */}
                {i > 0 && HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="absolute left-0 right-0 border-t border-border/20"
                    style={{ top: `${(hour - TIMELINE_START) * HOUR_HEIGHT}px` }}
                  />
                ))}
                {i > 0 && HOURS.slice(0, -1).map((hour) => (
                  <div
                    key={`half-${hour}`}
                    className="absolute left-0 right-0 border-t border-border/10"
                    style={{ top: `${(hour - TIMELINE_START) * HOUR_HEIGHT + HOUR_HEIGHT / 2}px` }}
                  />
                ))}
                {/* Current time line for today column */}
                {isToday && showCurrentTimeLine && (
                  <div
                    className="absolute left-0 right-0 z-30 pointer-events-none"
                    style={{ top: `${currentPosition}px` }}
                  >
                    <div className="h-[2px] bg-red-500/70 w-full" />
                  </div>
                )}
                {/* Events */}
                {positioned.map((event) => (
                  <EventCard key={event.id} event={event} compact />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Month View ──
  const MonthView = () => {
    const monthDays = getMonthDays(currentDate);
    return (
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center py-2 text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-[100px]">
          {monthDays.map((d, i) => {
            const isCurrentMonth = d.getMonth() === currentDate.getMonth();
            const isToday = isSameDay(d, today);
            const dayEvents = getEventsForDay(d);
            return (
              <div
                key={i}
                className={cn(
                  'border-b border-r border-border/30 p-1 cursor-pointer transition-colors hover:bg-secondary/20',
                  !isCurrentMonth && 'opacity-30',
                  isToday && 'bg-primary/5',
                )}
                onClick={() => { setCurrentDate(d); setView('day'); }}
              >
                <p className={cn(
                  'text-xs mb-0.5',
                  isToday
                    ? 'text-foreground bg-primary w-6 h-6 rounded-full inline-flex items-center justify-center font-bold text-[11px]'
                    : 'text-muted-foreground font-medium',
                )}>
                  {d.getDate()}
                </p>
                <div className="space-y-0.5 overflow-hidden">
                  {dayEvents.slice(0, 3).map((e) => (
                    <div
                      key={e.id}
                      className="text-foreground text-[10px] px-1.5 py-0.5 rounded truncate border-l-2 bg-card/80"
                      style={{ borderLeftColor: e.accountColor || '#6366f1' }}
                    >
                      {e.subject}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <p className="text-muted-foreground text-[10px] pl-1">+{dayEvents.length - 3} more</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="px-3 sm:px-6 py-2.5 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={goToday}
            className={cn(
              'text-xs px-3 py-1.5 rounded-lg transition-colors font-medium',
              isSameDay(currentDate, today)
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground border border-border hover:bg-secondary',
            )}
          >
            Today
          </button>
          <div className="flex items-center">
            <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground p-1 transition-colors"><ChevronLeft size={16} /></button>
            <button onClick={() => navigate(1)} className="text-muted-foreground hover:text-foreground p-1 transition-colors"><ChevronRight size={16} /></button>
          </div>
          <h2 className="text-foreground font-semibold text-xs sm:text-sm">{headerTitle()}</h2>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3">
          {/* View toggle */}
          <div className="flex bg-card border border-border rounded-lg overflow-hidden">
            {(['day', 'week', 'month'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium capitalize transition-colors',
                  view === v ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowAccounts(!showAccounts)}
            className={cn(
              'p-1.5 sm:px-3 sm:py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5',
              showAccounts ? 'border-primary/50 text-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            <Users size={14} />
            <span className="hidden sm:inline">Accounts ({accounts.length})</span>
          </button>
          <button
            onClick={() => { setShowAddEvent(true); setNewDate(currentDate.toISOString().split('T')[0]); }}
            className="bg-primary text-foreground p-1.5 sm:px-3 sm:py-1.5 rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors flex items-center gap-1.5"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">New Event</span>
          </button>
        </div>
      </div>

      {/* Accounts Panel */}
      {showAccounts && (
        <div className="px-4 sm:px-6 py-3 border-b border-border shrink-0 bg-card/20">
          <div className="flex items-center justify-between mb-2">
            <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">Calendar Accounts</p>
            <div className="flex gap-2 items-center">
              <input
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
                placeholder="Label (e.g. Work)"
                className="bg-card text-foreground border border-border rounded px-2 py-1 text-xs w-28 sm:w-32 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <a
                href={`/api/auth/microsoft?label=${encodeURIComponent(addLabel || 'Microsoft')}`}
                className="bg-primary text-foreground px-2.5 py-1 rounded text-xs font-medium hover:bg-primary/90 transition-colors flex items-center gap-1"
              >
                <Plus size={12} />
                <span className="hidden sm:inline">Add Account</span>
              </a>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {accounts.map((acc) => (
              <div
                key={acc.id}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-all cursor-pointer',
                  hiddenAccounts.has(acc.id)
                    ? 'border-border text-muted-foreground/60 opacity-50'
                    : 'border-border text-foreground hover:bg-secondary/30',
                )}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0 transition-colors"
                  style={{ backgroundColor: hiddenAccounts.has(acc.id) ? '#4b5563' : acc.color }}
                  onClick={() => toggleAccount(acc.id)}
                />
                <span onClick={() => toggleAccount(acc.id)} className="font-medium">{acc.alias || acc.label}</span>
                {acc.email && <span className="text-muted-foreground hidden sm:inline">{acc.email}</span>}
                {!acc.connected && <span className="text-red-400 text-[10px]">disconnected</span>}
                <button
                  onClick={() => deleteAccount(acc.id)}
                  className="text-muted-foreground/60 hover:text-red-400 transition-colors ml-1"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Event Modal */}
      {showAddEvent && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowAddEvent(false)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-md p-4 sm:p-6 space-y-3 sm:space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-foreground font-semibold">New Event</h3>
              <button onClick={() => setShowAddEvent(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div>
              <label className="text-foreground text-sm block mb-1">Subject</label>
              <input
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder="Meeting with..."
                autoFocus
                className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-foreground text-sm block mb-1">Date</label>
                <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
                  className="w-full bg-secondary text-foreground border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="text-foreground text-sm block mb-1">Start</label>
                <input type="time" value={newStartTime} onChange={(e) => setNewStartTime(e.target.value)}
                  className="w-full bg-secondary text-foreground border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="text-foreground text-sm block mb-1">End</label>
                <input type="time" value={newEndTime} onChange={(e) => setNewEndTime(e.target.value)}
                  className="w-full bg-secondary text-foreground border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
            </div>
            <div>
              <label className="text-foreground text-sm block mb-1">Location (optional)</label>
              <input
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                placeholder="Office, Teams, etc."
                className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <button
              onClick={addEvent}
              disabled={!newSubject.trim() || !newDate}
              className="w-full bg-primary text-foreground py-2.5 rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              Create Event
            </button>
          </div>
        </div>
      )}

      {/* Calendar View */}
      {view === 'day' && <DayView />}
      {view === 'week' && <WeekView />}
      {view === 'month' && <MonthView />}
    </div>
  );
}
