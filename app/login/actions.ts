'use server';

import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import { signIn } from '@/lib/auth';

function safeCallbackUrl(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }
  return value;
}

function redirectToLoginError(error: unknown): never {
  if (error instanceof AuthError) {
    redirect(`/login?error=${encodeURIComponent(error.type)}`);
  }
  throw error;
}

export async function signInWithGoogle(formData: FormData) {
  const callbackUrl = safeCallbackUrl(formData.get('callbackUrl'));
  try {
    await signIn('google', { redirectTo: callbackUrl });
  } catch (error) {
    redirectToLoginError(error);
  }
}

export async function signInWithCredentials(formData: FormData) {
  const callbackUrl = safeCallbackUrl(formData.get('callbackUrl'));
  try {
    await signIn('credentials', {
      username: String(formData.get('username') ?? ''),
      password: String(formData.get('password') ?? ''),
      redirectTo: callbackUrl,
    });
  } catch (error) {
    redirectToLoginError(error);
  }
}
