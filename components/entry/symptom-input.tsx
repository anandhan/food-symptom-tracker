// Symptom input component

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface SymptomInputProps {
  symptomNotes: string;
  setSymptomNotes: (value: string) => void;
  overallRating: string;
  setOverallRating: (value: string) => void;
  bloating: string;
  setBloating: (value: string) => void;
  gas: string;
  setGas: (value: string) => void;
  crampsPain: string;
  setCrampsPain: (value: string) => void;
  diarrhea: boolean;
  setDiarrhea: (value: boolean) => void;
  constipation: boolean;
  setConstipation: (value: boolean) => void;
}

const ratingEmojis = {
  great: '😊',
  good: '🙂',
  okay: '😐',
  bad: '☹️',
  very_bad: '😣',
};

const severityLevels = ['none', 'mild', 'moderate', 'severe'] as const;

export function SymptomInput({
  symptomNotes,
  setSymptomNotes,
  overallRating,
  setOverallRating,
  bloating,
  setBloating,
  gas,
  setGas,
  crampsPain,
  setCrampsPain,
  diarrhea,
  setDiarrhea,
  constipation,
  setConstipation,
}: SymptomInputProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Stomach Symptoms</CardTitle>
        <CardDescription>
          How did your stomach feel today? Be specific about timing if possible.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Free text notes */}
        <div className="space-y-2">
          <Label htmlFor="symptom-notes">Symptom Notes</Label>
          <textarea
            id="symptom-notes"
            className="w-full min-h-[120px] p-3 border rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="E.g., Felt fine in the morning. Some bloating after lunch. Cramps around 7 PM, better later at night."
            value={symptomNotes}
            onChange={(e) => setSymptomNotes(e.target.value)}
          />
        </div>

        {/* Overall rating */}
        <div className="space-y-2">
          <Label>Overall Feeling</Label>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(ratingEmojis).map(([rating, emoji]) => (
              <Button
                key={rating}
                type="button"
                variant={overallRating === rating ? 'default' : 'outline'}
                onClick={() => setOverallRating(rating)}
                className="flex-1 min-w-[100px]"
              >
                <span className="mr-1">{emoji}</span>
                {rating.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
              </Button>
            ))}
          </div>
        </div>

        {/* Structured symptoms */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Bloating */}
          <div className="space-y-2">
            <Label>Bloating</Label>
            <div className="grid grid-cols-2 gap-2">
              {severityLevels.map((level) => (
                <Button
                  key={level}
                  type="button"
                  size="sm"
                  variant={bloating === level ? 'default' : 'outline'}
                  onClick={() => setBloating(level)}
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          {/* Gas */}
          <div className="space-y-2">
            <Label>Gas</Label>
            <div className="grid grid-cols-2 gap-2">
              {severityLevels.map((level) => (
                <Button
                  key={level}
                  type="button"
                  size="sm"
                  variant={gas === level ? 'default' : 'outline'}
                  onClick={() => setGas(level)}
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          {/* Cramps/Pain */}
          <div className="space-y-2">
            <Label>Cramps/Pain</Label>
            <div className="grid grid-cols-2 gap-2">
              {severityLevels.map((level) => (
                <Button
                  key={level}
                  type="button"
                  size="sm"
                  variant={crampsPain === level ? 'default' : 'outline'}
                  onClick={() => setCrampsPain(level)}
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          {/* Checkboxes */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="diarrhea"
                checked={diarrhea}
                onChange={(e) => setDiarrhea(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300"
              />
              <Label htmlFor="diarrhea" className="cursor-pointer">
                Diarrhea / Loose stool
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="constipation"
                checked={constipation}
                onChange={(e) => setConstipation(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300"
              />
              <Label htmlFor="constipation" className="cursor-pointer">
                Constipation
              </Label>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
