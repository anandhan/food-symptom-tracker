// Analysis page - food-symptom correlations

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { MainNav } from '@/components/main-nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function AnalysisPage() {
  const session = await auth();

  if (!session?.userId) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <MainNav />
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Analysis</h1>
          <p className="text-muted-foreground">
            Statistical food-symptom correlations and patterns
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Analysis Coming Soon</CardTitle>
            <CardDescription>
              This feature will show food-symptom correlations once you have enough data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              The analysis engine will calculate:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
              <li>Foods associated with bad days (relative risk)</li>
              <li>Foods associated with good days</li>
              <li>Delayed reactions (24-48h lag windows)</li>
              <li>Problematic food combinations</li>
              <li>Symptom trends over time</li>
            </ul>
            <p className="mt-4 text-sm text-muted-foreground">
              💡 Track at least 30 days for reliable analysis
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
