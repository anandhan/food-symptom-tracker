// NextAuth configuration with Google OAuth and credentials fallback

import NextAuth, { NextAuthConfig } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/db';

// Parse allowed emails from env var
const allowedEmails = process.env.ALLOWED_EMAILS
  ?.split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean) || [];

export const authConfig: NextAuthConfig = {
  providers: [
    // Primary: Google OAuth
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),

    // Fallback: Credentials (uses env vars in production, DB users in dev)
    CredentialsProvider({
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

  session: {
    strategy: 'jwt',
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

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
          token.email = user.email;
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
      if (token.email) {
        session.user.email = token.email as string;
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
