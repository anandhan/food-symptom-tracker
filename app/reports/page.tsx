// Weekly reports page

'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { MainNav } from '@/components/main-nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface WeeklyReport {
  id: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  summaryText: string;
  observedData: any;
  aiInterpretation: any;
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
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const res = await fetch('/api/reports/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
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
                
                <Card>
                  <CardHeader>
                    <CardTitle>
                      Week of {new Date(selectedReport.startDate).toLocaleDateString()} - {new Date(selectedReport.endDate).toLocaleDateString()}
                    </CardTitle>
                    <CardDescription>
                      Generated {new Date(selectedReport.generatedAt).toLocaleDateString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <h3 className="font-semibold text-lg mb-2">📊 Observed Data</h3>
                      <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                        <p>Days tracked: {selectedReport.observedData.daysTracked}/{selectedReport.observedData.totalDaysInPeriod}</p>
                        <p>Good days: {selectedReport.observedData.goodDays}</p>
                        <p>Bad days: {selectedReport.observedData.badDays}</p>
                        <div>
                          <p className="font-medium mt-2">Top foods:</p>
                          <ul className="list-disc list-inside text-sm">
                            {selectedReport.observedData.topFoods.map((f: any) => (
                              <li key={f.food}>{f.food} ({f.count}x)</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold text-lg mb-2">🤖 AI Interpretation</h3>
                      <div className="space-y-4">
                        {selectedReport.aiInterpretation.foodsToConsiderReducing?.length > 0 && (
                          <div>
                            <p className="font-medium">Foods to consider reducing:</p>
                            <ul className="list-disc list-inside text-sm">
                              {selectedReport.aiInterpretation.foodsToConsiderReducing.map((f: any) => (
                                <li key={f.food}>{f.food} - {f.reason}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {selectedReport.aiInterpretation.foodsAppearingWellTolerated?.length > 0 && (
                          <div>
                            <p className="font-medium">Foods appearing well tolerated:</p>
                            <ul className="list-disc list-inside text-sm">
                              {selectedReport.aiInterpretation.foodsAppearingWellTolerated.map((f: any) => (
                                <li key={f.food}>{f.food} - {f.reason}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {selectedReport.aiInterpretation.recommendations?.length > 0 && (
                          <div>
                            <p className="font-medium">Recommendations:</p>
                            <ul className="list-disc list-inside text-sm">
                              {selectedReport.aiInterpretation.recommendations.map((r: string, i: number) => (
                                <li key={i}>{r}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
