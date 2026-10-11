// Middleware for route protection.
// Uses the edge-safe auth config only — never import lib/auth or Prisma here.

import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';

export default NextAuth(authConfig).auth;

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
