'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export type PublicGeminiInterpretation = {
  id: string;
  modelId: string;
  promptVersion: string;
  inputSnapshotHash: string;
  createdAt: string | Date;
  output: {
    summary: string;
    patterns: Array<{ concept: string; label: string; citation: string }>;
    lowSampleFlags: string[];
    watchNextWeek: string[];
  } | null;
  error: string | null;
};

export function AiInterpretationPanel({
  interpretation,
  regenerateEndpoint,
  regenerateBody,
}: {
  interpretation: PublicGeminiInterpretation | null;
  regenerateEndpoint: string;
  regenerateBody: Record<string, unknown>;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(interpretation);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const regenerate = async () => {
    setIsRegenerating(true);
    setRequestError(null);
    try {
      const response = await fetch(regenerateEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regenerateBody),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to regenerate interpretation');
      }
      setCurrent(data.interpretation);
      router.refresh();
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Failed to regenerate interpretation');
    } finally {
      setIsRegenerating(false);
    }
  };

  const output = current?.output;
  const errorNote = requestError || current?.error;

  return (
    <Card data-testid="ai-interpretation">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>AI interpretation (Gemini)</CardTitle>
            <CardDescription>
              Plain-language reading of the observed stats. Numbers above are the source of truth.
              {current?.modelId ? ` Model: ${current.modelId}` : ''}
              {current?.promptVersion ? ` · prompt ${current.promptVersion}` : ''}
            </CardDescription>
          </div>
          <Button variant="outline" onClick={regenerate} disabled={isRegenerating}>
            {isRegenerating ? 'Regenerating...' : 'Regenerate interpretation'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorNote && (
          <p
            className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2"
            data-testid="ai-interpretation-error"
          >
            Gemini interpretation unavailable: {errorNote}
          </p>
        )}
        {output ? (
          <>
            <p>{output.summary}</p>
            {output.patterns.length > 0 && (
              <div>
                <p className="font-medium mb-2">Patterns</p>
                <ul className="space-y-2 text-sm">
                  {output.patterns.map((pattern) => (
                    <li key={`${pattern.concept}-${pattern.label}`} className="border rounded-md px-3 py-2">
                      <span className="font-medium capitalize">{pattern.concept}</span>
                      {' · '}
                      <span>{pattern.label}</span>
                      <p className="text-muted-foreground mt-1">{pattern.citation}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {output.lowSampleFlags.length > 0 && (
              <div>
                <p className="font-medium mb-1">Low sample sizes</p>
                <ul className="list-disc list-inside text-sm text-muted-foreground">
                  {output.lowSampleFlags.map((flag) => (
                    <li key={flag}>{flag}</li>
                  ))}
                </ul>
              </div>
            )}
            {output.watchNextWeek.length > 0 && (
              <div>
                <p className="font-medium mb-1">Watch next week</p>
                <ul className="list-disc list-inside text-sm">
                  {output.watchNextWeek.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          !errorNote && (
            <p className="text-muted-foreground text-sm">
              No Gemini interpretation yet. Use Regenerate interpretation to create one.
            </p>
          )
        )}
      </CardContent>
    </Card>
  );
}
