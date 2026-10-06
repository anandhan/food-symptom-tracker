// Weekly reports page

import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { MainNav } from '@/components/main-nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function ReportsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.userId) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <MainNav />
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Weekly Reports</h1>
          <p className="text-muted-foreground">
            AI-generated summaries and insights
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Reports Coming Soon</CardTitle>
            <CardDescription>
              Automated weekly summaries will be generated via Vercel Cron
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Each week, the system will automatically generate a report containing:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
              <li>Summary of what you ate and how you felt</li>
              <li>Best and worst days of the week</li>
              <li>Foods potentially associated with symptoms</li>
              <li>Foods appearing well tolerated</li>
              <li>Trends compared to previous weeks</li>
              <li>Actionable recommendations</li>
            </ul>
            <p className="mt-4 text-sm text-muted-foreground">
              🤖 Reports use Gemini 2.5 Pro for high-quality analysis
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
