import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE_NAMES = [
  'authjs.session-token',
  '__Secure-authjs.session-token',
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
];

function isPublicPath(pathname: string) {
  if (pathname === '/login' || pathname.startsWith('/login/')) return true;
  if (pathname.startsWith('/api/auth')) return true;
  if (pathname.startsWith('/api/cron')) return true;
  if (pathname.startsWith('/_next')) return true;
  if (pathname === '/manifest.json' || pathname === '/sw.js') return true;
  if (pathname === '/favicon.ico' || pathname.startsWith('/favicon')) return true;
  if (pathname === '/apple-touch-icon.png' || pathname.startsWith('/apple-touch-icon')) return true;
  if (pathname.startsWith('/icon-')) return true;
  if (/\.[a-zA-Z0-9]+$/.test(pathname)) return true;
  return false;
}

function hasSessionCookie(request: NextRequest) {
  for (const name of SESSION_COOKIE_NAMES) {
    if (request.cookies.get(name)?.value) return true;
  }

  for (const cookie of request.cookies.getAll()) {
    if (SESSION_COOKIE_NAMES.some((base) => cookie.name === base || cookie.name.startsWith(`${base}.`))) {
      if (cookie.value) return true;
    }
  }

  return false;
}

export function proxy(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;

    if (isPublicPath(pathname)) {
      return NextResponse.next();
    }

    if (hasSessionCookie(request)) {
      return NextResponse.next();
    }

    const loginUrl = new URL('/login', request.url);
    const callback = `${pathname}${request.nextUrl.search}`;
    if (callback && callback !== '/login') {
      loginUrl.searchParams.set('callbackUrl', callback);
    }
    return NextResponse.redirect(loginUrl);
  } catch (error) {
    console.error('proxy auth check failed', error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\..*).*)',
  ],
};
