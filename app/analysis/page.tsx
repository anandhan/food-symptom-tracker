// Analysis page - food-symptom correlations

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { MainNav } from '@/components/main-nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { analyzeFoodSymptomCorrelations, getMealTypeBreakdown } from '@/lib/analysis/correlation-engine';
import { prisma } from '@/lib/db';
import { addCalendarDays, getCalendarDateInTimezone, getConfiguredTimezone, parseCalendarDate } from '@/lib/dates';

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }> | { days?: string };
}) {
  const session = await auth();

  if (!session?.userId) {
    redirect('/login');
  }

  const params = await Promise.resolve(searchParams);
  const daysBack = parseInt(params.days || '30', 10);
  const todayIso = getCalendarDateInTimezone(new Date(), getConfiguredTimezone());
  const endDate = parseCalendarDate(todayIso);
  const startDate = parseCalendarDate(addCalendarDays(todayIso, -(daysBack - 1)));

  // Run analysis
  const [sameDayResults, conceptResults, nextDayResults, mealBreakdown, totalDays] = await Promise.all([
    analyzeFoodSymptomCorrelations({
      userId: session.userId,
      startDate,
      endDate,
      lagDays: 0,
      level: 'item',
    }),
    analyzeFoodSymptomCorrelations({
      userId: session.userId,
      startDate,
      endDate,
      lagDays: 0,
      level: 'concept',
    }),
    analyzeFoodSymptomCorrelations({
      userId: session.userId,
      startDate,
      endDate,
      lagDays: 1,
      level: 'concept',
    }),
    getMealTypeBreakdown(session.userId, startDate, endDate),
    prisma.dailyEntry.count({
      where: {
        userId: session.userId,
        date: { gte: startDate, lte: endDate },
      },
    }),
  ]);

  const problemFoods = conceptResults.filter(r => r.relativeRisk >= 1.5 && r.label !== 'Not enough data yet');
  const wellTolerated = conceptResults.filter(r => r.relativeRisk < 0.8 && r.daysWithFood >= 10);
  const delayed = nextDayResults.filter(r => {
    const sameDay = conceptResults.find(s => s.foodConcept === r.foodConcept);
    return r.relativeRisk > 1.5 && (!sameDay || sameDay.relativeRisk < r.relativeRisk);
  });
  const itemProblems = sameDayResults.filter(r => r.relativeRisk >= 1.5 && r.label !== 'Not enough data yet').slice(0, 8);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <MainNav />
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Analysis</h1>
          <p className="text-muted-foreground">
            Statistical food-symptom correlations (last {daysBack} days, {totalDays} tracked)
          </p>
        </div>

        {totalDays < 10 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">
                Not enough data for analysis yet. Track at least 10 days for initial insights, 30+ days for reliable patterns.
              </p>
              <p className="text-sm text-muted-foreground">
                Currently tracked: {totalDays} days
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Problem Foods */}
            <Card>
              <CardHeader>
                <CardTitle>Ingredient concepts associated with bad days</CardTitle>
                <CardDescription>
                  Canonical ingredients (e.g. coffee, milk) rolled up from every matching food line
                </CardDescription>
              </CardHeader>
              <CardContent>
                {problemFoods.length === 0 ? (
                  <p className="text-muted-foreground">
                    No strong patterns found. Keep tracking!
                  </p>
                ) : (
                  <div className="space-y-4">
                    {problemFoods.map((food) => (
                      <div key={food.foodConcept} className="p-4 border rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="font-semibold text-lg capitalize">{food.foodConcept}</h3>
                            <p className="text-sm text-muted-foreground">{food.label}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-red-600">
                              {food.relativeRisk.toFixed(1)}x
                            </p>
                            <p className="text-xs text-muted-foreground">Relative Risk</p>
                          </div>
                        </div>
                        <p className="text-sm">{food.evidence}</p>
                        {food.relativeRisk >= 2.0 && food.confidence !== 'low' && (
                          <p className="text-sm mt-2 text-orange-600 font-medium">
                            💡 Consider a trial elimination period to test this pattern
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Well Tolerated Foods */}
            <Card>
              <CardHeader>
                <CardTitle>✅ Foods Appearing Well Tolerated</CardTitle>
                <CardDescription>
                  Foods frequently eaten on good days
                </CardDescription>
              </CardHeader>
              <CardContent>
                {wellTolerated.length === 0 ? (
                  <p className="text-muted-foreground">
                    No patterns yet. Foods with 10+ occurrences and low symptom rates will appear here.
                  </p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {wellTolerated.map((food) => (
                      <div key={food.foodConcept} className="p-3 border rounded-lg bg-green-50">
                        <h3 className="font-medium capitalize">{food.foodConcept}</h3>
                        <p className="text-sm text-muted-foreground">
                          Eaten {food.daysWithFood} times • {(food.symptomRateWithFood * 100).toFixed(0)}% symptom rate
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Delayed Reactions */}
            {delayed.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>⏱️ Possible Delayed Reactions (Next Day)</CardTitle>
                  <CardDescription>
                    Foods with stronger correlation to next-day symptoms
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {delayed.map((food) => (
                      <div key={food.foodConcept} className="p-3 border rounded-lg">
                        <h3 className="font-medium capitalize">{food.foodConcept}</h3>
                        <p className="text-sm text-muted-foreground">
                          Next-day RR: {food.relativeRisk.toFixed(1)}x • {food.evidence.split('.')[0]}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Meal Type Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>🍽️ Symptom Rate by Meal Type</CardTitle>
                <CardDescription>
                  Which meals are followed by symptoms most often
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2">
                  {Object.entries(mealBreakdown).map(([meal, stats]) => {
                    const rate = stats.total > 0 ? (stats.withSymptoms / stats.total) * 100 : 0;
                    return (
                      <div key={meal} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="font-medium capitalize">{meal}</span>
                          <span className="text-sm text-muted-foreground">
                            {stats.withSymptoms}/{stats.total} days
                          </span>
                        </div>
                        <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-red-500"
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {rate.toFixed(0)}% symptom rate
                        </p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Logged food names (item level)</CardTitle>
                <CardDescription>
                  Same stats using the exact diary line instead of rolled-up ingredients
                </CardDescription>
              </CardHeader>
              <CardContent>
                {itemProblems.length === 0 ? (
                  <p className="text-muted-foreground">No strong item-level patterns yet.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {itemProblems.map((food) => (
                      <li key={food.foodConcept} className="flex justify-between gap-4">
                        <span>{food.foodConcept}</span>
                        <span className="text-red-600">{food.relativeRisk.toFixed(1)}x · {food.label}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card data-testid="concept-coverage">
              <CardHeader>
                <CardTitle>Ingredient concept coverage</CardTitle>
                <CardDescription>
                  “Coffee with milk” and “Dunkin Latte With Sugar” both count toward coffee and milk
                </CardDescription>
              </CardHeader>
              <CardContent>
                {conceptResults.length === 0 ? (
                  <p className="text-muted-foreground">No linked concepts yet. Save an entry to create them.</p>
                ) : (
                  <ul className="grid gap-2 md:grid-cols-2 text-sm">
                    {conceptResults
                      .slice()
                      .sort((a, b) => b.daysWithFood - a.daysWithFood)
                      .slice(0, 16)
                      .map((food) => (
                        <li
                          key={food.foodConcept}
                          data-testid={`concept-row-${food.foodConcept}`}
                          className="flex justify-between border rounded-md px-3 py-2"
                        >
                          <span className="capitalize">{food.foodConcept}</span>
                          <span className="text-muted-foreground">{food.daysWithFood} days</span>
                        </li>
                      ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Important Notes */}
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="text-blue-900">📊 About This Analysis</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2 text-blue-900">
                <p><strong>Statistical Approach:</strong> Uses relative risk ratios to identify patterns. Values above 1.5x suggest possible association.</p>
                <p><strong>Confidence Levels:</strong> Low (&lt;10 samples), Medium (10-30), High (&gt;30). More data improves reliability.</p>
                <p><strong>Not Causation:</strong> These are correlations and patterns, not proven causes. Use them as clues for elimination trials.</p>
                <p><strong>Evidence-Based:</strong> All conclusions show sample sizes and rates. Ignore patterns with insufficient data.</p>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
