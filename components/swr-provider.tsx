'use client';

import { SWRConfig } from 'swr';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`Request failed: ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
};

export default function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        // Dedupe identical requests fired within 10s of each other
        dedupingInterval: 10_000,
        // Revalidate on tab focus — cheap, feels instant
        revalidateOnFocus: true,
        // Don't retry 4xx (auth / client errors)
        onErrorRetry: (err, _key, _cfg, revalidate, { retryCount }) => {
          const status = (err as Error & { status?: number })?.status;
          if (status && status >= 400 && status < 500) return;
          if (retryCount >= 3) return;
          setTimeout(() => revalidate({ retryCount }), 5_000);
        },
        // Refresh stale data in background but serve cache instantly
        revalidateIfStale: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}
