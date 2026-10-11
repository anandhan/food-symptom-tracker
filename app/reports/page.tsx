// Weekly reports page

'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { MainNav } from '@/components/main-nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AiInterpretationPanel } from '@/components/analysis/ai-interpretation-panel';

interface WeeklyReport {
  id: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  summaryText: string;
  observedData: any;
  aiInterpretation: any;
  geminiInterpretation?: {
    id: string;
    modelId: string;
    promptVersion: string;
    inputSnapshotHash: string;
    createdAt: string;
    output: {
      summary: string;
      patterns: Array<{ concept: string; label: string; citation: string }>;
      lowSampleFlags: string[];
      watchNextWeek: string[];
    } | null;
    error: string | null;
  } | null;
}

export default function ReportsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedReport, setSelectedReport] = useState<WeeklyReport | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    const res = await fetch('/api/reports/list');
    if (res.ok) {
      const data = await res.json();
      setReports(data.reports || []);
    }
  };

  const generateReport = async () => {
    setIsGenerating(true);
    const pad = (n: number) => String(n).padStart(2, '0');
    const localIso = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);

    const res = await fetch('/api/reports/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: localIso(start),
        endDate: localIso(end),
      }),
    });

    if (res.ok) {
      await fetchReports();
    }
    setIsGenerating(false);
  };

  if (status === 'loading') {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <MainNav />
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Weekly Reports</h1>
            <p className="text-muted-foreground">
              AI-generated summaries and insights
            </p>
          </div>
          <Button onClick={generateReport} disabled={isGenerating}>
            {isGenerating ? 'Generating...' : 'Generate Report Now'}
          </Button>
        </div>

        {reports.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">
                No reports yet. Generate your first weekly report!
              </p>
              <Button onClick={generateReport} disabled={isGenerating}>
                Generate Week Report
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {!selectedReport ? (
              reports.map((report) => (
                <Card key={report.id} className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => setSelectedReport(report)}>
                  <CardHeader>
                    <CardTitle>
                      Week of {new Date(report.startDate).toLocaleDateString()} - {new Date(report.endDate).toLocaleDateString()}
                    </CardTitle>
                    <CardDescription>
                      Generated {new Date(report.generatedAt).toLocaleDateString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">{report.summaryText}</p>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div>
                <Button variant="ghost" onClick={() => setSelectedReport(null)} className="mb-4">
                  ← Back to all reports
                </Button>
                
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        Week of {new Date(selectedReport.startDate).toLocaleDateString()} - {new Date(selectedReport.endDate).toLocaleDateString()}
                      </CardTitle>
                      <CardDescription>
                        Generated {new Date(selectedReport.generatedAt).toLocaleDateString()}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ObservedReportData observed={selectedReport.observedData} />
                    </CardContent>
                  </Card>
                  <AiInterpretationPanel
                    interpretation={selectedReport.geminiInterpretation || null}
                    regenerateEndpoint="/api/reports/interpret"
                    regenerateBody={{ reportId: selectedReport.id }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function ObservedReportData({ observed }: { observed: any }) {
  const daysTracked = observed?.range?.daysTracked ?? observed?.daysTracked ?? 0;
  const totalDays = observed?.range?.totalDaysInPeriod ?? observed?.totalDaysInPeriod ?? 0;
  const goodDays = observed?.ratings?.goodDays ?? observed?.goodDays ?? 0;
  const badDays = observed?.ratings?.badDays ?? observed?.badDays ?? 0;
  const concepts = Array.isArray(observed?.concepts)
    ? observed.concepts
    : Array.isArray(observed?.topFoods)
      ? observed.topFoods.map((food: { food?: string; concept?: string; count?: number; daysWithFood?: number }) => ({
          concept: food.concept || food.food,
          daysWithFood: food.daysWithFood ?? food.count,
          label: '',
        }))
      : [];

  return (
    <div data-testid="observed-data">
      <h3 className="font-semibold text-lg mb-2">Observed data</h3>
      <div className="bg-gray-50 p-4 rounded-lg space-y-2">
        <p>Days tracked: {daysTracked}/{totalDays}</p>
        <p>Good days: {goodDays}</p>
        <p>Bad days: {badDays}</p>
        {concepts.length > 0 && (
          <div>
            <p className="font-medium mt-2">Concepts</p>
            <ul className="list-disc list-inside text-sm">
              {concepts.slice(0, 10).map((row: { concept: string; daysWithFood?: number; label?: string }) => (
                <li key={row.concept}>
                  {row.concept}
                  {row.daysWithFood != null ? ` (${row.daysWithFood} days)` : ''}
                  {row.label ? ` · ${row.label}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
