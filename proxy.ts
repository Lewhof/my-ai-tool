import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/api/telegram(.*)',
  '/api/auth/microsoft/callback(.*)',
  '/api/auth/spotify/callback(.*)',
  '/api/auth/google/callback(.*)',
  '/api/tasks/pending(.*)',
  '/api/diagrams/:id/share(.*)',
  '/api/migrate(.*)',
  '/api/cron(.*)',
  '/api/health(.*)',
  '/api/widget(.*)',
  '/api/webhook(.*)',
  '/diagrams/share(.*)',
]);

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const clerkKeyValid = !!clerkKey && (clerkKey.startsWith('pk_test_') || clerkKey.startsWith('pk_live_'));
const allowFallback = process.env.NODE_ENV !== 'production';

// In non-production sandboxes without valid Clerk keys, skip auth so the app stays viewable.
// Production always uses real clerkMiddleware — failing loud on bad keys beats silent no-auth.
const passThrough = (_req: NextRequest) => NextResponse.next();

export default (clerkKeyValid || !allowFallback)
  ? clerkMiddleware(async (auth, request) => {
      if (!isPublicRoute(request)) {
        await auth.protect();
      }
    })
  : passThrough;

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)'],
};
