// NextAuth configuration with Google OAuth and credentials fallback

import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/db';

// Parse allowed emails from env var
const allowedEmails = process.env.ALLOWED_EMAILS
  ?.split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean) || [];

export const authOptions: NextAuthOptions = {
  providers: [
    // Primary: Google OAuth
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),

    // Fallback: Credentials
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

        const user = await prisma.user.findUnique({
          where: { username: credentials.username },
        });

        if (!user || !user.passwordHash) {
          return null;
        }

        const isValid = await compare(credentials.password, user.passwordHash);
        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
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
          console.warn(`Unauthorized email attempted sign-in: ${email}`);
          return false;
        }

        // Check if user exists, create if not
        const existingUser = await prisma.user.findUnique({
          where: { email },
        });

        if (!existingUser) {
          await prisma.user.create({
            data: {
              email,
              name: user.name || email.split('@')[0],
              authProvider: 'google',
              googleId: user.id,
            },
          });
        }
      }

      return true;
    },

    async jwt({ token, user, account }) {
      // On sign in, fetch user from database
      if (account) {
        let dbUser;
        if (account.provider === 'google') {
          dbUser = await prisma.user.findUnique({
            where: { email: user.email! },
          });
        } else {
          dbUser = await prisma.user.findUnique({
            where: { id: user.id },
          });
        }

        if (dbUser) {
          token.userId = dbUser.id;
          token.email = dbUser.email;
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
