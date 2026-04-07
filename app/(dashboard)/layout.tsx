'use client';

import Sidebar from '@/components/sidebar';
import Header from '@/components/header';
import MobileNav from '@/components/mobile-nav';
import MobileHeader from '@/components/mobile-header';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-gray-900">
      {/* Desktop sidebar — hidden on mobile */}
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Desktop header — hidden on mobile */}
        <Header />

        {/* Mobile header — hidden on desktop */}
        <MobileHeader />

        {/* Main content — add bottom padding on mobile for tab bar */}
        <main className="flex-1 overflow-auto min-h-0 pb-16 lg:pb-0">{children}</main>
      </div>

      {/* Mobile bottom tab bar — hidden on desktop */}
      <MobileNav />
    </div>
  );
}
