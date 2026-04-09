'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Zap, Bookmark, Smartphone, Send, Copy, Check, ExternalLink, Info,
} from 'lucide-react';

const BOOKMARKLET_CODE = `javascript:(function(){var u=location.href,t=document.title,s=getSelection().toString();window.open('https://lewhofmeyr.co.za/capture?url='+encodeURIComponent(u)+'&title='+encodeURIComponent(t)+'&selection='+encodeURIComponent(s.slice(0,2000)),'cap','width=520,height=760');})();`;

export default function CaptureSettingsPage() {
  const [copied, setCopied] = useState(false);

  const copyBookmarklet = () => {
    navigator.clipboard.writeText(BOOKMARKLET_CODE);
    setCopied(true);
    toast.success('Bookmarklet copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Capture</h2>
        <p className="text-muted-foreground text-sm mt-1">Clip articles, quotes, and URLs from anywhere into your Lewhof AI.</p>
      </div>

      {/* How it works */}
      <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
        <Info size={16} className="text-primary shrink-0 mt-0.5" />
        <div className="text-muted-foreground text-xs leading-relaxed space-y-1">
          <p>
            <span className="text-foreground font-medium">How it works:</span> Every capture method sends the URL to /capture, where the AI extracts the content, classifies it, and routes it to the right module &mdash; Knowledge Base, Mind Library, Highlights, Tasks, Whiteboard, or Notes.
          </p>
          <p>You can always override the destination before saving.</p>
        </div>
      </div>

      {/* 1. Bookmarklet */}
      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2" style={{ background: 'var(--color-surface-2)' }}>
          <Bookmark size={14} className="text-blue-400" />
          <h3 className="text-foreground font-semibold text-sm">Desktop Bookmarklet</h3>
          <span className="ml-auto text-[10px] text-muted-foreground">Chrome / Firefox / Safari / Edge</span>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-muted-foreground text-sm">
            One-click capture from any page. Works with text selections (saves as a highlight).
          </p>

          <div className="space-y-2">
            <p className="text-[11px] text-foreground font-semibold">Option A &mdash; Drag to bookmarks bar</p>
            <p className="text-muted-foreground text-xs">
              Show your bookmarks bar (Ctrl+Shift+B), then drag the button below onto it.
            </p>
            <div className="flex gap-2">
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href={BOOKMARKLET_CODE}
                onClick={(e) => e.preventDefault()}
                className="px-4 py-2 rounded-lg bg-primary text-foreground font-semibold text-xs flex items-center gap-2 cursor-grab active:cursor-grabbing select-none"
                draggable="true"
              >
                <Zap size={12} />
                Clip to Lewhof
              </a>
            </div>
          </div>

          <div className="space-y-2 pt-3 border-t border-border">
            <p className="text-[11px] text-foreground font-semibold">Option B &mdash; Copy the code</p>
            <p className="text-muted-foreground text-xs">
              Create a new bookmark manually and paste this as the URL:
            </p>
            <div className="relative">
              <pre className="bg-background border border-border rounded-lg p-3 text-[10px] text-muted-foreground font-mono whitespace-pre-wrap break-all max-h-24 overflow-auto">
                {BOOKMARKLET_CODE}
              </pre>
              <button
                onClick={copyBookmarklet}
                className="absolute top-2 right-2 p-1.5 rounded bg-secondary hover:bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
                title="Copy"
              >
                {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              </button>
            </div>
          </div>

          <div className="text-[11px] text-muted-foreground/70 pt-2">
            <span className="text-yellow-400">Note:</span> Some sites (GitHub, X, banks) have strict Content Security Policies that block bookmarklets. For those, use the Telegram method below.
          </div>
        </div>
      </section>

      {/* 2. Mobile share target */}
      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2" style={{ background: 'var(--color-surface-2)' }}>
          <Smartphone size={14} className="text-green-400" />
          <h3 className="text-foreground font-semibold text-sm">Mobile Share Sheet (Android)</h3>
          <span className="ml-auto text-[10px] text-muted-foreground">Android only</span>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-muted-foreground text-sm">
            Install Lewhof AI as a PWA on Android, then share any URL from any app directly to it.
          </p>

          <ol className="space-y-2 text-muted-foreground text-xs list-decimal list-inside pl-2">
            <li>Open <span className="text-foreground">lewhofmeyr.co.za</span> in Chrome on your Android phone</li>
            <li>Tap the menu (&vellip;) &rarr; &quot;Add to Home screen&quot;</li>
            <li>Confirm install. Lewhof AI now appears as an app on your home screen.</li>
            <li>In any other app (Chrome, X, Telegram), tap Share &rarr; Lewhof AI will appear in the share sheet.</li>
            <li>The Capture screen opens with the URL pre-filled.</li>
          </ol>

          <div className="text-[11px] text-muted-foreground/70 pt-2">
            <span className="text-yellow-400">iOS users:</span> Apple doesn&apos;t support PWA share targets. Use the Telegram method below instead &mdash; it works on iOS and everywhere.
          </div>
        </div>
      </section>

      {/* 3. Telegram */}
      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2" style={{ background: 'var(--color-surface-2)' }}>
          <Send size={14} className="text-purple-400" />
          <h3 className="text-foreground font-semibold text-sm">Telegram Bot</h3>
          <span className="ml-auto text-[10px] text-muted-foreground">iOS, Android, Desktop</span>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-muted-foreground text-sm">
            Forward or share any URL to your Lewhof Telegram bot. The bot extracts content, classifies it, and saves it automatically.
          </p>

          <ol className="space-y-2 text-muted-foreground text-xs list-decimal list-inside pl-2">
            <li>Open your existing Lewhof Telegram bot chat</li>
            <li>Share or forward any URL to the bot (or paste it)</li>
            <li>The bot replies with what was saved and where</li>
          </ol>

          <div className="bg-background border border-border rounded-lg p-3 space-y-1.5">
            <p className="text-[11px] text-muted-foreground font-semibold">Examples:</p>
            <p className="text-[11px] text-muted-foreground/80 font-mono">https://example.com/article</p>
            <p className="text-[11px] text-muted-foreground/80 font-mono">clip https://example.com/article</p>
            <p className="text-[11px] text-muted-foreground/80 font-mono">save this https://example.com/article</p>
          </div>

          <div className="text-[11px] text-muted-foreground/70 pt-2">
            <span className="text-green-400">Tip:</span> The bot only accepts URLs from your configured chat ID (security). If you have multiple chats, only the primary one can capture.
          </div>
        </div>
      </section>

      {/* Test it */}
      <section className="bg-card border border-border rounded-xl p-5 flex items-center justify-between">
        <div>
          <p className="text-foreground text-sm font-semibold">Test the capture flow</p>
          <p className="text-muted-foreground text-xs mt-0.5">Open the capture page with a test URL</p>
        </div>
        <a
          href="/capture?url=https://en.wikipedia.org/wiki/Stoicism&title=Stoicism%20-%20Wikipedia"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <ExternalLink size={12} />
          Test capture
        </a>
      </section>
    </div>
  );
}
