'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Plus, X, Calendar as CalIcon, ExternalLink, Users, Trash2 } from 'lucide-react';

interface CalendarAccount {
  id: string;
  label: string;
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

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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
  // Fill from previous month
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push(d);
  }
  // Current month
  const lastDate = new Date(year, month + 1, 0).getDate();
  for (let i = 1; i <= lastDate; i++) {
    days.push(new Date(year, month, i));
  }
  // Fill to complete grid (42 cells = 6 rows)
  while (days.length < 42) {
    const d = new Date(year, month + 1, days.length - lastDate - startOffset + 1);
    days.push(d);
  }
  return days;
}

function statusColor(showAs: string): string {
  switch (showAs) {
    case 'busy': return 'bg-red-500';
    case 'tentative': return 'bg-yellow-500';
    case 'free': return 'bg-green-500';
    case 'oof': return 'bg-purple-500';
    default: return 'bg-accent-600';
  }
}

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

  const visibleEvents = events.filter((e) => !hiddenAccounts.has(e.accountId));

  const getEventsForDay = (date: Date) =>
    visibleEvents.filter((e) => isSameDay(new Date(e.start), date));

  const getEventsForHour = (date: Date, hour: number) =>
    visibleEvents.filter((e) => {
      const start = new Date(e.start);
      return isSameDay(start, date) && start.getHours() === hour && !e.isAllDay;
    });

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
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const today = new Date();

  const headerTitle = () => {
    if (view === 'day') return currentDate.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (view === 'week') {
      const week = getWeekDays(currentDate);
      const start = week[0];
      const end = week[6];
      if (start.getMonth() === end.getMonth()) {
        return `${start.getDate()} - ${end.getDate()} ${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
      }
      return `${start.getDate()} ${MONTHS[start.getMonth()].slice(0, 3)} - ${end.getDate()} ${MONTHS[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`;
    }
    return `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  };

  if (!connected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
        <CalIcon size={48} className="text-gray-600" />
        <p className="text-gray-400 text-lg">Connect a Microsoft account to view your calendar</p>
        <div className="flex gap-2 items-center">
          <input
            value={addLabel}
            onChange={(e) => setAddLabel(e.target.value)}
            placeholder="Account label (e.g. Work)"
            className="bg-gray-800 text-white border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-600"
          />
          <a href={`/api/auth/microsoft?label=${encodeURIComponent(addLabel || 'Microsoft')}`} className="bg-accent-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-accent-700 transition-colors flex items-center gap-2 text-sm">
            <ExternalLink size={14} />
            Connect
          </a>
        </div>
      </div>
    );
  }

  // ── Day View ──
  const DayView = () => (
    <div className="flex-1 overflow-auto">
      {/* All-day events */}
      {getEventsForDay(currentDate).filter((e) => e.isAllDay).length > 0 && (
        <div className="px-4 py-2 border-b border-gray-700 bg-gray-800/50">
          <p className="text-gray-500 text-xs mb-1">All day</p>
          {getEventsForDay(currentDate).filter((e) => e.isAllDay).map((e) => (
            <div key={e.id} className="text-white text-xs px-2 py-1 rounded mb-1" style={{ backgroundColor: e.accountColor || statusColor(e.showAs).replace('bg-', '') }}>{e.subject}</div>
          ))}
        </div>
      )}
      {/* Hourly grid */}
      <div className="relative">
        {HOURS.map((hour) => {
          const hourEvents = getEventsForHour(currentDate, hour);
          return (
            <div key={hour} className="flex border-b border-gray-800 min-h-[48px]">
              <div className="w-16 shrink-0 text-gray-500 text-xs py-2 text-right pr-3">{formatHour(hour)}</div>
              <div className="flex-1 relative py-1 px-1">
                {hourEvents.map((e) => (
                  <div key={e.id} className={`${statusColor(e.showAs)}/20 border-l-2 ${statusColor(e.showAs).replace('bg-', 'border-')} px-2 py-1 rounded-r text-sm mb-1`}>
                    <p className="text-white text-xs font-medium truncate">{e.subject}</p>
                    {e.location && <p className="text-gray-400 text-xs truncate">{e.location}</p>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Week View ──
  const WeekView = () => {
    const weekDays = getWeekDays(currentDate);
    return (
      <div className="flex-1 overflow-auto">
        {/* Day headers */}
        <div className="flex border-b border-gray-700 sticky top-0 bg-gray-900 z-10">
          <div className="w-16 shrink-0" />
          {weekDays.map((d, i) => (
            <div
              key={i}
              className={cn(
                'flex-1 text-center py-2 border-l border-gray-800',
                isSameDay(d, today) && 'bg-accent-600/10'
              )}
            >
              <p className="text-gray-500 text-xs">{WEEKDAYS[d.getDay()]}</p>
              <p className={cn('text-sm font-medium', isSameDay(d, today) ? 'text-accent-500' : 'text-white')}>{d.getDate()}</p>
            </div>
          ))}
        </div>
        {/* Hourly grid */}
        {HOURS.map((hour) => (
          <div key={hour} className="flex border-b border-gray-800 min-h-[40px]">
            <div className="w-16 shrink-0 text-gray-500 text-xs py-1 text-right pr-3">{formatHour(hour)}</div>
            {weekDays.map((d, i) => {
              const hourEvents = getEventsForHour(d, hour);
              return (
                <div key={i} className={cn('flex-1 border-l border-gray-800 px-0.5 py-0.5', isSameDay(d, today) && 'bg-accent-600/5')}>
                  {hourEvents.map((e) => (
                    <div key={e.id} className={`${statusColor(e.showAs)}/30 border-l-2 ${statusColor(e.showAs).replace('bg-', 'border-')} px-1 py-0.5 rounded-r`}>
                      <p className="text-white text-xs truncate">{e.subject}</p>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  // ── Month View ──
  const MonthView = () => {
    const monthDays = getMonthDays(currentDate);
    return (
      <div className="flex-1 overflow-auto">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-gray-700">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center py-2 text-gray-500 text-xs font-semibold">{d}</div>
          ))}
        </div>
        {/* Day grid */}
        <div className="grid grid-cols-7 auto-rows-[100px]">
          {monthDays.map((d, i) => {
            const isCurrentMonth = d.getMonth() === currentDate.getMonth();
            const isToday = isSameDay(d, today);
            const dayEvents = getEventsForDay(d);
            return (
              <div
                key={i}
                className={cn(
                  'border-b border-r border-gray-800 p-1',
                  !isCurrentMonth && 'opacity-40',
                  isToday && 'bg-accent-600/5'
                )}
              >
                <p className={cn(
                  'text-xs font-medium mb-0.5',
                  isToday ? 'text-accent-500 font-bold' : 'text-gray-400'
                )}>
                  {d.getDate()}
                </p>
                <div className="space-y-0.5 overflow-hidden">
                  {dayEvents.slice(0, 3).map((e) => (
                    <div key={e.id} className="text-white text-xs px-1 py-0.5 rounded truncate" style={{ backgroundColor: e.accountColor || '#6366f1' }}>
                      {e.subject}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <p className="text-gray-500 text-xs">+{dayEvents.length - 3} more</p>
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
      <div className="px-6 py-3 border-b border-gray-700 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={goToday} className="text-gray-400 hover:text-white text-xs px-3 py-1.5 border border-gray-600 rounded-lg transition-colors">
            Today
          </button>
          <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white p-1 transition-colors"><ChevronLeft size={18} /></button>
          <button onClick={() => navigate(1)} className="text-gray-400 hover:text-white p-1 transition-colors"><ChevronRight size={18} /></button>
          <h2 className="text-white font-semibold text-sm">{headerTitle()}</h2>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
            {(['day', 'week', 'month'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                  view === v ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                )}
              >
                {v}
              </button>
            ))}
          </div>
          {/* Accounts toggle */}
          <button
            onClick={() => setShowAccounts(!showAccounts)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5',
              showAccounts ? 'border-accent-600/50 text-accent-400 bg-accent-600/10' : 'border-gray-700 text-gray-400 hover:text-white'
            )}
          >
            <Users size={14} />
            Accounts ({accounts.length})
          </button>
          <button
            onClick={() => { setShowAddEvent(true); setNewDate(currentDate.toISOString().split('T')[0]); }}
            className="bg-accent-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent-700 transition-colors flex items-center gap-1.5"
          >
            <Plus size={14} />
            Add Event
          </button>
        </div>
      </div>

      {/* Accounts Panel */}
      {showAccounts && (
        <div className="px-6 py-3 border-b border-gray-700 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Calendar Accounts</p>
            <div className="flex gap-2 items-center">
              <input
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
                placeholder="Label (e.g. Work)"
                className="bg-gray-800 text-white border border-gray-700 rounded px-2 py-1 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-accent-600"
              />
              <a
                href={`/api/auth/microsoft?label=${encodeURIComponent(addLabel || 'Microsoft')}`}
                className="bg-accent-600 text-white px-2.5 py-1 rounded text-xs font-medium hover:bg-accent-700 transition-colors flex items-center gap-1"
              >
                <Plus size={12} />
                Add Account
              </a>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {accounts.map((acc) => (
              <div
                key={acc.id}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer',
                  hiddenAccounts.has(acc.id)
                    ? 'border-gray-700 text-gray-600 opacity-50'
                    : 'border-gray-600 text-white'
                )}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: hiddenAccounts.has(acc.id) ? '#4b5563' : acc.color }}
                  onClick={() => toggleAccount(acc.id)}
                />
                <span onClick={() => toggleAccount(acc.id)} className="font-medium">{acc.label}</span>
                {acc.email && <span className="text-gray-500">{acc.email}</span>}
                {!acc.connected && <span className="text-red-400">disconnected</span>}
                <button
                  onClick={() => deleteAccount(acc.id)}
                  className="text-gray-600 hover:text-red-400 transition-colors ml-1"
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
          <div className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold">New Event</h3>
              <button onClick={() => setShowAddEvent(false)} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>
            <div>
              <label className="text-gray-300 text-sm block mb-1">Subject</label>
              <input
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder="Meeting with..."
                autoFocus
                className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-600"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-gray-300 text-sm block mb-1">Date</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent-600"
                />
              </div>
              <div>
                <label className="text-gray-300 text-sm block mb-1">Start</label>
                <input
                  type="time"
                  value={newStartTime}
                  onChange={(e) => setNewStartTime(e.target.value)}
                  className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent-600"
                />
              </div>
              <div>
                <label className="text-gray-300 text-sm block mb-1">End</label>
                <input
                  type="time"
                  value={newEndTime}
                  onChange={(e) => setNewEndTime(e.target.value)}
                  className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent-600"
                />
              </div>
            </div>
            <div>
              <label className="text-gray-300 text-sm block mb-1">Location (optional)</label>
              <input
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                placeholder="Office, Teams, etc."
                className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent-600"
              />
            </div>
            <button
              onClick={addEvent}
              disabled={!newSubject.trim() || !newDate}
              className="w-full bg-accent-600 text-white py-2.5 rounded-lg font-medium hover:bg-accent-700 transition-colors disabled:opacity-50"
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
