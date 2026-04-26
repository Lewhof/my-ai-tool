'use client';

import { useEffect, useState } from 'react';
import { Download, Share, Plus, X, Zap } from 'lucide-react';

// LH-Fitness-specific PWA wiring:
//   1. Register the global service worker (existing /sw.js) so /lhfitness pages
//      are cached for offline use. The SW scope is `/`, so it covers /lhfitness
//      automatically — we just need to ensure it's registered when the user
//      lands directly on /lhfitness (the dashboard layout doesn't run here).
//   2. Show an LH-Fitness-branded install prompt when the browser fires
//      `beforeinstallprompt`. This is distinct from the parent app's install
//      prompt so users can install LH Fitness as its own home-screen icon.
//   3. iOS-Safari fallback: Safari never fires beforeinstallprompt; we show a
//      one-time tip with the "Share → Add to Home Screen" instructions.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISSED_KEY = 'lhfitness-pwa-install-dismissed';
const IOS_TIP_KEY = 'lhfitness-pwa-ios-tip-seen';
const DISMISS_COOLDOWN_DAYS = 14;

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari proprietary
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOSSafari(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
  return isIOS && isSafari;
}

function dismissedRecently(key: string): boolean {
  if (typeof window === 'undefined') return true;
  const ts = window.localStorage.getItem(key);
  if (!ts) return false;
  const days = (Date.now() - Number(ts)) / 86400000;
  return days < DISMISS_COOLDOWN_DAYS;
}

export default function LHFitnessPWA() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showIOSTip, setShowIOSTip] = useState(false);

  // ── Register service worker ────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (isStandalone()) return; // Already installed; skip prompts but still register

    // Idempotent — browser dedupes by URL
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(() => { /* silent fail — SW is best-effort */ });
  }, []);

  // ── Listen for install prompt (Chrome/Edge/Android) ────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isStandalone()) return;
    if (dismissedRecently(DISMISSED_KEY)) return;

    const onBefore = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      // Don't pop immediately — wait until user has poked around for a few seconds
      setTimeout(() => setShowPrompt(true), 4000);
    };
    const onInstalled = () => {
      setShowPrompt(false);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onBefore);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBefore);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // ── iOS Safari fallback ────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isStandalone()) return;
    if (!isIOSSafari()) return;
    if (dismissedRecently(IOS_TIP_KEY)) return;
    // Wait until they've engaged with the app for a moment
    const t = setTimeout(() => setShowIOSTip(true), 6000);
    return () => clearTimeout(t);
  }, []);

  const handleInstall = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted') {
        setShowPrompt(false);
      } else {
        // User dismissed via OS dialog — soft-dismiss for cooldown period
        window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
        setShowPrompt(false);
      }
    } finally {
      setDeferred(null);
    }
  };

  const handleDismissPrompt = () => {
    window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setShowPrompt(false);
  };

  const handleDismissIOS = () => {
    window.localStorage.setItem(IOS_TIP_KEY, String(Date.now()));
    setShowIOSTip(false);
  };

  if (showPrompt && deferred) {
    return (
      <InstallCard
        title="Install LH Fitness"
        sub="Home-screen icon. Works offline. No app store."
        primaryLabel="Install"
        onPrimary={handleInstall}
        onDismiss={handleDismissPrompt}
      />
    );
  }

  if (showIOSTip) {
    return <IOSInstallTip onDismiss={handleDismissIOS} />;
  }

  return null;
}

function InstallCard({
  title, sub, primaryLabel, onPrimary, onDismiss,
}: {
  title: string; sub: string; primaryLabel: string;
  onPrimary: () => void; onDismiss: () => void;
}) {
  return (
    <div className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100vw-1.5rem)] max-w-md animate-fade-up">
      <div className="bg-card border border-primary/40 rounded-2xl shadow-2xl p-3.5 flex items-center gap-3 backdrop-blur-md"
           style={{ boxShadow: '0 18px 50px -12px var(--brand-glow), 0 0 1px var(--color-primary)' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-primary text-primary-foreground"
             style={{ boxShadow: '0 0 18px var(--brand-glow)' }}>
          <Zap size={18} fill="currentColor" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-foreground text-sm font-bold truncate">{title}</p>
          <p className="text-muted-foreground text-xs">{sub}</p>
        </div>
        <button
          onClick={onPrimary}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground font-bold btn-brand shrink-0"
        >
          <Download size={12} /> {primaryLabel}
        </button>
        <button
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground p-1 shrink-0"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

function IOSInstallTip({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100vw-1.5rem)] max-w-md animate-fade-up">
      <div className="bg-card border border-primary/40 rounded-2xl shadow-2xl p-4 backdrop-blur-md"
           style={{ boxShadow: '0 18px 50px -12px var(--brand-glow)' }}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-primary text-primary-foreground"
               style={{ boxShadow: '0 0 18px var(--brand-glow)' }}>
            <Zap size={18} fill="currentColor" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-foreground text-sm font-bold">Install LH Fitness</p>
            <p className="text-muted-foreground text-xs mt-0.5">Add to home screen for full-screen workouts.</p>
            <ol className="mt-2.5 space-y-1.5 text-[11px] text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded bg-secondary text-foreground flex items-center justify-center font-bold text-[9px]">1</span>
                Tap <Share size={11} className="inline -mt-0.5 text-blue-400" /> in Safari toolbar
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded bg-secondary text-foreground flex items-center justify-center font-bold text-[9px]">2</span>
                Choose <Plus size={11} className="inline -mt-0.5 text-foreground" /> Add to Home Screen
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded bg-secondary text-foreground flex items-center justify-center font-bold text-[9px]">3</span>
                Confirm — done.
              </li>
            </ol>
          </div>
          <button
            onClick={onDismiss}
            className="text-muted-foreground hover:text-foreground p-1 shrink-0 -mr-1 -mt-1"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
