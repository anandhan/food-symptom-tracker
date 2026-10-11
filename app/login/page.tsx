import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { signInWithCredentials, signInWithGoogle } from '@/app/login/actions';
import { SubmitButton } from '@/app/login/submit-button';

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  OAuthSignin: 'Could not start Google sign-in.',
  OAuthCallback: 'Google sign-in failed. Try again.',
  OAuthCreateAccount: 'Could not create an account from Google.',
  OAuthAccountNotLinked: 'This Google account is not linked to an existing user.',
  Callback: 'Sign-in callback failed.',
  AccessDenied: 'Your email is not authorized to access this app.',
  Configuration: 'Sign-in is misconfigured. Check AUTH_SECRET and Google credentials.',
  CredentialsSignin: 'Invalid username or password.',
  SessionRequired: 'Please sign in to continue.',
  Default: 'An error occurred during sign in.',
};

function loginErrorMessage(code: string) {
  return AUTH_ERROR_MESSAGES[code] ?? AUTH_ERROR_MESSAGES.Default;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }> | { error?: string; callbackUrl?: string };
}) {
  const params = await Promise.resolve(searchParams);
  const errorCode = params.error && params.error !== 'undefined' ? params.error : undefined;
  const callbackUrl = params.callbackUrl && params.callbackUrl.startsWith('/') && !params.callbackUrl.startsWith('//')
    ? params.callbackUrl
    : '/';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Food & Symptom Tracker
          </CardTitle>
          <CardDescription className="text-center">
            Sign in to track your meals and symptoms
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorCode && (
            <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">
              <p>{loginErrorMessage(errorCode)}</p>
              <p className="mt-1 font-mono text-xs">error={errorCode}</p>
            </div>
          )}

          <form action={signInWithGoogle}>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <SubmitButton className="w-full" size="lg" pendingLabel="Redirecting to Google...">
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </SubmitButton>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or
              </span>
            </div>
          </div>

          <form action={signInWithCredentials} className="space-y-4">
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                type="text"
                placeholder="Enter your username"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Enter your password"
                required
              />
            </div>
            <SubmitButton className="w-full">
              Sign in
            </SubmitButton>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col space-y-2">
          <p className="text-xs text-center text-muted-foreground">
            This is a private application. Access is restricted to authorized email addresses.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
