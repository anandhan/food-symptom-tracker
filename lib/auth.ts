// NextAuth configuration with Google OAuth and credentials fallback.
// Node-only: Prisma and bcrypt stay here, never imported by proxy.ts.

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/db';
import { authConfig } from '@/auth.config';

export { authConfig };

function getAllowedEmails() {
  return process.env.ALLOWED_EMAILS
    ?.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean) || [];
}

export function isEmailAllowed(email?: string | null) {
  const allowedEmails = getAllowedEmails();
  if (allowedEmails.length === 0) return true;
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return true;
  return allowedEmails.includes(normalized);
}

// Parse allowed emails from env var
const allowedEmails = getAllowedEmails();

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...(authConfig.providers ?? []),
    Credentials({
      id: 'credentials',
      name: 'Username and Password',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        // Production: Check env vars for admin credentials
        const adminUsername = process.env.ADMIN_USERNAME;
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

        if (adminUsername && adminPasswordHash && credentials.username === adminUsername) {
          const isValid = await compare(credentials.password as string, adminPasswordHash);
          if (isValid) {
            // Find or create admin user
            let user = await prisma.user.findUnique({
              where: { username: adminUsername },
            });

            if (!user) {
              user = await prisma.user.create({
                data: {
                  username: adminUsername,
                  email: process.env.ADMIN_EMAIL || `${adminUsername}@example.com`,
                  passwordHash: adminPasswordHash,
                  authProvider: 'credentials',
                },
              });
            }

            return {
              id: user.id,
              email: user.email || '',
              name: user.name,
            };
          }
          return null;
        }

        // Dev/Test: Check database users (created by seed script)
        const user = await prisma.user.findUnique({
          where: { username: credentials.username as string },
        });

        if (!user || !user.passwordHash) {
          return null;
        }

        const isValid = await compare(credentials.password as string, user.passwordHash);
        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email || '',
          name: user.name,
        };
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      // For Google OAuth, check email allowlist
      if (account?.provider === 'google') {
        const email = user.email?.toLowerCase();

        // If no allowlist configured, deny all OAuth (must use credentials)
        if (allowedEmails.length === 0) {
          console.warn('ALLOWED_EMAILS not configured, denying Google sign-in');
          return false;
        }

        // Check if email is in allowlist
        if (!email || !allowedEmails.includes(email)) {
          console.warn(`Email ${email} not in ALLOWED_EMAILS`);
          return false;
        }

        // Find or create user
        let dbUser = await prisma.user.findUnique({
          where: { email },
        });

        if (!dbUser) {
          dbUser = await prisma.user.create({
            data: {
              email,
              name: user.name,
              authProvider: 'google',
              googleId: account.providerAccountId,
            },
          });
        }

        // Store user ID for session
        user.id = dbUser.id;
      }

      return true;
    },

    async jwt({ token, user, account }) {
      if (user) {
        token.userId = user.id;

        // For credentials login, user is already from DB
        if (account?.provider === 'credentials') {
          token.email = user.email || undefined;
        }

        // For Google login, find user in DB
        if (account?.provider === 'google' && user.email) {
          const dbUser = await prisma.user.findUnique({
            where: { email: user.email },
          });

          if (dbUser) {
            token.userId = dbUser.id;
            token.email = dbUser.email || undefined;
          }
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token.userId) {
        session.userId = token.userId as string;
      }
      if (token.email && typeof token.email === 'string') {
        session.user.email = token.email;
      }
      return session;
    },
  },
});

function isNextDynamicRenderError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    (error as { digest?: string }).digest === 'DYNAMIC_SERVER_USAGE'
  );
}

export async function getAuthorizedSession() {
  try {
    const session = await auth();
    if (!session?.userId) return null;
    if (!isEmailAllowed(session.user?.email)) return null;
    return session;
  } catch (error) {
    if (isNextDynamicRenderError(error)) {
      throw error;
    }
    console.error('getAuthorizedSession failed', error);
    return null;
  }
}
