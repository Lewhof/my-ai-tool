import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import LHFitnessPWA from './pwa';

export const metadata: Metadata = {
  title: 'LH Fitness — Your AI Trainer',
  description: 'AI-generated workouts, live session tracking, training plans, and personal records. Your AI personal trainer.',
  manifest: '/lhfitness/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'LH Fitness',
  },
  applicationName: 'LH Fitness',
};

export const viewport: Viewport = {
  // Brand orange — matches manifest theme_color so the iOS/Android status bar
  // and the PWA splash adopt the LH Fitness identity, not the parent app's.
  themeColor: '#E07A2E',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function LHFitnessLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lhfit-root min-h-screen bg-background text-foreground">
      {children}
      <LHFitnessPWA />
      <Toaster position="top-center" theme="dark" richColors />
    </div>
  );
}
