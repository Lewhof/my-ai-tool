'use client';

import { WifiOff } from 'lucide-react';

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="text-center">
        <WifiOff size={48} className="mx-auto text-gray-600 mb-4" />
        <h1 className="text-white text-2xl font-bold mb-2">You're Offline</h1>
        <p className="text-gray-400 max-w-sm">
          Lewhof AI needs an internet connection to work. Please check your connection and try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 bg-accent-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-accent-700 transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
