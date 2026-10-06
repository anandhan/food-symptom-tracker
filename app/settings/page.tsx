// Settings page

'use client';

import { useSession, signOut } from 'next-auth/react';
import { MainNav } from '@/components/main-nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function SettingsPage() {
  const { data: session } = useSession();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <MainNav />
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Settings</h1>
          <p className="text-muted-foreground">
            Export data and manage your account
          </p>
        </div>

        <div className="space-y-6">
          {/* Account Info */}
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>Your account information</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{session?.user?.email || 'Not available'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="font-medium">{session?.user?.name || 'Not set'}</p>
                </div>
              </div>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => signOut({ callbackUrl: '/login' })}
              >
                Sign Out
              </Button>
            </CardContent>
          </Card>

          {/* Data Export */}
          <Card>
            <CardHeader>
              <CardTitle>Data Export</CardTitle>
              <CardDescription>
                Download all your data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Export feature coming soon. Will include:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Complete JSON export of all data</li>
                <li>CSV files per table</li>
                <li>All uploaded images</li>
                <li>Import/restore capability</li>
              </ul>
              <Button variant="outline" className="mt-4" disabled>
                Export All Data (Coming Soon)
              </Button>
            </CardContent>
          </Card>

          {/* AI Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>AI Configuration</CardTitle>
              <CardDescription>
                Vision and analysis settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Provider</p>
                  <p className="font-medium">Google Gemini</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Extraction Model</p>
                  <p className="font-medium">gemini-2.5-flash</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Analysis Model</p>
                  <p className="font-medium">gemini-2.5-pro</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Configuration is managed via environment variables
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
