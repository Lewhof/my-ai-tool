'use client';

import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { toast } from 'sonner';

const DISMISSED_KEY = 'push-prompt-dismissed';
const SUBSCRIBED_KEY = 'push-subscribed';

export default function PushPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Don't show if already dismissed, subscribed, or not supported
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(DISMISSED_KEY)) return;
    if (localStorage.getItem(SUBSCRIBED_KEY)) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    if (Notification.permission === 'granted') {
      // Already granted — subscribe silently
      subscribe();
      return;
    }
    if (Notification.permission === 'denied') return;

    // Show after 5 second delay (let user settle in first)
    const timer = setTimeout(() => setShow(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  const subscribe = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        dismiss();
        return;
      }

      // Get VAPID key
      const res = await fetch('/api/notifications/subscribe');
      const { vapidPublicKey } = await res.json();
      if (!vapidPublicKey) {
        toast.error('Push not configured yet');
        dismiss();
        return;
      }

      // Subscribe via service worker
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });

      // Send subscription to server
      await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
        }),
      });

      localStorage.setItem(SUBSCRIBED_KEY, 'true');
      setShow(false);
      toast('Notifications enabled');
    } catch (err) {
      toast.error('Could not enable notifications');
      dismiss();
    }
  };

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, Date.now().toString());
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-24 lg:bottom-6 left-4 right-4 lg:left-auto lg:right-6 lg:w-80 z-30 animate-fade-up">
      <div
        className="rounded-2xl border border-border p-4 shadow-lg"
        style={{ background: 'var(--color-surface-1)' }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--color-brand-dim)' }}
          >
            <Bell size={18} style={{ color: 'var(--color-brand)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-foreground">Enable notifications?</p>
            <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">
              Get morning briefings, task reminders, and calendar alerts.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={subscribe}
                className="px-4 py-2 rounded-xl text-[12px] font-medium text-white btn-brand"
                style={{ background: 'var(--color-brand)' }}
              >
                Enable
              </button>
              <button
                onClick={dismiss}
                className="px-4 py-2 rounded-xl text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
          <button onClick={dismiss} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
