'use client';

import Sidebar from '@/components/sidebar';
import Header from '@/components/header';
import MobileNav from '@/components/mobile-nav';
import MobileHeader from '@/components/mobile-header';
import GlobalSearch from '@/components/global-search';
import MobileFAB from '@/components/mobile-fab';
import PushPrompt from '@/components/push-prompt';
import OfflineBanner from '@/components/offline-banner';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Desktop sidebar — hidden on mobile */}
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Desktop header — hidden on mobile */}
        <Header />

        {/* Mobile header — hidden on desktop */}
        <MobileHeader />

        {/* Main content — add bottom padding on mobile for tab bar */}
        <main className="flex-1 overflow-y-auto pb-20 lg:pb-0">{children}</main>
      </div>

      {/* Mobile bottom tab bar — hidden on desktop */}
      <MobileNav />

      {/* Mobile FAB (quick-add) */}
      <MobileFAB />

      {/* Offline banner */}
      <OfflineBanner />

      {/* Push notification prompt */}
      <PushPrompt />

      {/* Global search (Cmd+K) */}
      <GlobalSearch />
    </div>
  );
}
