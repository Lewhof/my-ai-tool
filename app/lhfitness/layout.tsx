import type { Metadata } from 'next';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'LH Fitness — Your AI Trainer',
  description: 'Build, track and progress your training. AI-generated workouts, live session tracking, personal records.',
};

export default function LHFitnessLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lhfit-root min-h-screen bg-background text-foreground">
      {children}
      <Toaster position="top-center" theme="dark" richColors />
    </div>
  );
}
