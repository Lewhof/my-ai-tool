import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import ThemeProvider from '@/components/theme-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lewhof Dashboard',
  description: 'Professional SaaS Dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>
      <html lang="en">
        <body className="bg-gray-950 text-white antialiased">
          <ThemeProvider>{children}</ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
