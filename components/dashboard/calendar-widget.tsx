'use client';

import { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, ExternalLink, Plus } from 'lucide-react';

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
      <div className="bg-card border border-border rounded-lg p-5 h-full">
        <p className="text-muted-foreground text-sm">Loading calendar...</p>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="bg-card border border-border rounded-lg overflow-hidden h-full flex flex-col">
        <div className="widget-handle px-5 py-3 border-b border-border cursor-move">
          <h3 className="text-foreground font-semibold text-sm">Calendar</h3>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-5 gap-3">
          <Calendar size={32} className="text-muted-foreground/60" />
          <p className="text-muted-foreground text-sm text-center">Connect your Microsoft account to see your calendar</p>
          <a
            href="/settings/connections"
            className="bg-primary text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary transition-colors flex items-center gap-2"
          >
            <ExternalLink size={14} />
            Connect in Settings
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
    <div className="bg-card border border-border rounded-lg overflow-hidden h-full flex flex-col">
      <div className="widget-handle px-5 py-3 border-b border-border flex items-center justify-between cursor-move">
        <h3 className="text-foreground font-semibold text-sm">Calendar</h3>
        <div className="flex items-center gap-2">
          <a
            href="https://outlook.live.com/calendar/0/deeplink/compose"
            target="_blank"
            className="text-muted-foreground hover:text-primary transition-colors"
            title="Add event"
          >
            <Plus size={16} />
          </a>
          <span className="text-muted-foreground text-xs">Next 7 days</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-5 gap-2">
            <Calendar size={24} className="text-muted-foreground/60" />
            <p className="text-muted-foreground text-sm">No upcoming events</p>
          </div>
        ) : (
          Object.entries(grouped).map(([dateLabel, dayEvents]) => (
            <div key={dateLabel}>
              <div className="px-5 py-1.5 bg-background/50">
                <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">{dateLabel}</p>
              </div>
              {dayEvents.map((event) => (
                <div key={event.id} className="px-5 py-2.5 border-b border-border hover:bg-secondary/30 transition-colors">
                  <div className="flex items-start gap-2.5">
                    <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${statusColor(event.showAs)}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground text-sm font-medium truncate">{event.subject}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-muted-foreground text-xs flex items-center gap-1">
                          <Clock size={10} />
                          {formatEventTime(event.start, event.end, event.isAllDay)}
                        </span>
                        {event.location && (
                          <span className="text-muted-foreground text-xs flex items-center gap-1 truncate">
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
