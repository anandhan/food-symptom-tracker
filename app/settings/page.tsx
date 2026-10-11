// Settings page

'use client';

import { useSession, signOut } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MainNav } from '@/components/main-nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ConceptReview } from '@/components/settings/concept-review';

export default function SettingsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const handleExportJSON = async () => {
    setIsExporting(true);
    try {
      const response = await fetch('/api/export/json');
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `food-tracker-export-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        alert('Export failed');
      }
    } catch (error) {
      alert('Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const response = await fetch('/api/export/csv');
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `food-tracker-export-${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        alert('Export failed');
      }
    } catch (error) {
      alert('Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const confirmed = confirm(
        `Import ${data.entries?.length || 0} entries? This will overwrite existing data. Continue?`
      );
      if (!confirmed) {
        setIsImporting(false);
        return;
      }

      const response = await fetch('/api/import/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, overwrite: true }),
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Successfully imported ${result.importedEntries} entries!`);
        router.refresh();
      } else {
        alert('Import failed');
      }
    } catch (error) {
      alert('Import failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

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
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Export as JSON</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Complete backup with all data (entries, meals, symptoms, reports)
                </p>
                <Button onClick={handleExportJSON} disabled={isExporting}>
                  {isExporting ? 'Exporting...' : 'Download JSON'}
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Export as CSV</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Spreadsheet format (ZIP with 5 CSV files)
                </p>
                <Button onClick={handleExportCSV} disabled={isExporting} variant="outline">
                  {isExporting ? 'Exporting...' : 'Download CSV (ZIP)'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Data Import */}
          <Card>
            <CardHeader>
              <CardTitle>Data Import</CardTitle>
              <CardDescription>Restore from a JSON backup</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="import-file">Import JSON Backup</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  ⚠️ Warning: This will overwrite all existing data
                </p>
                <Input
                  id="import-file"
                  type="file"
                  accept=".json"
                  onChange={handleImportJSON}
                  disabled={isImporting}
                />
                {isImporting && <p className="text-sm text-blue-600">Importing...</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Food concepts</CardTitle>
              <CardDescription>
                Canonical ingredients used in Analysis. Merge duplicates (e.g. dairy → milk).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConceptReview />
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
                  <p className="font-medium">gemini-3.8-flash</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Analysis Model</p>
                  <p className="font-medium">gemini-3.8-flash</p>
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
