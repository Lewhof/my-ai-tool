'use client';

import { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, ExternalLink } from 'lucide-react';

interface CalendarEvent {
  id: string;
  subject: string;
  start: string;
  end: string;
  location: string | null;
  isAllDay: boolean;
  showAs: string;
}

function formatEventTime(start: string, end: string, isAllDay: boolean): string {
  if (isAllDay) return 'All day';
  const s = new Date(start);
  const e = new Date(end);
  const timeOpts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
  return `${s.toLocaleTimeString('en-ZA', timeOpts)} - ${e.toLocaleTimeString('en-ZA', timeOpts)}`;
}

function formatEventDate(start: string): string {
  const d = new Date(start);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
}

function statusColor(showAs: string): string {
  switch (showAs) {
    case 'busy': return 'bg-red-500';
    case 'tentative': return 'bg-yellow-500';
    case 'free': return 'bg-green-500';
    case 'oof': return 'bg-purple-500';
    default: return 'bg-blue-500';
  }
}

export default function CalendarWidget() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/calendar')
      .then((r) => r.json())
      .then((data) => {
        setConnected(data.connected);
        setEvents(data.events ?? []);
      })
      .catch(() => setConnected(false));
  }, []);

  if (connected === null) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 h-full">
        <p className="text-gray-500 text-sm">Loading calendar...</p>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden h-full flex flex-col">
        <div className="widget-handle px-5 py-3 border-b border-gray-700 cursor-move">
          <h3 className="text-white font-semibold text-sm">Calendar</h3>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-5 gap-3">
          <Calendar size={32} className="text-gray-600" />
          <p className="text-gray-500 text-sm text-center">Connect your Microsoft account to see your calendar</p>
          <a
            href="/api/auth/microsoft"
            className="bg-accent-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-700 transition-colors flex items-center gap-2"
          >
            <ExternalLink size={14} />
            Connect Microsoft
          </a>
        </div>
      </div>
    );
  }

  // Group events by date
  const grouped = events.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
    const dateLabel = formatEventDate(event.start);
    if (!acc[dateLabel]) acc[dateLabel] = [];
    acc[dateLabel].push(event);
    return acc;
  }, {});

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden h-full flex flex-col">
      <div className="widget-handle px-5 py-3 border-b border-gray-700 flex items-center justify-between cursor-move">
        <h3 className="text-white font-semibold text-sm">Calendar</h3>
        <span className="text-gray-500 text-xs">Next 7 days</span>
      </div>
      <div className="flex-1 overflow-auto">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-5 gap-2">
            <Calendar size={24} className="text-gray-600" />
            <p className="text-gray-500 text-sm">No upcoming events</p>
          </div>
        ) : (
          Object.entries(grouped).map(([dateLabel, dayEvents]) => (
            <div key={dateLabel}>
              <div className="px-5 py-1.5 bg-gray-900/50">
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">{dateLabel}</p>
              </div>
              {dayEvents.map((event) => (
                <div key={event.id} className="px-5 py-2.5 border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                  <div className="flex items-start gap-2.5">
                    <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${statusColor(event.showAs)}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm font-medium truncate">{event.subject}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-gray-500 text-xs flex items-center gap-1">
                          <Clock size={10} />
                          {formatEventTime(event.start, event.end, event.isAllDay)}
                        </span>
                        {event.location && (
                          <span className="text-gray-500 text-xs flex items-center gap-1 truncate">
                            <MapPin size={10} />
                            {event.location}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
