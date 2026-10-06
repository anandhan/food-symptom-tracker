// Entry form component - handles image upload, extraction, and symptom entry

'use client';

import { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDate, formatDateISO } from '@/lib/utils';
import { calendarDateFromUnknown, datesMismatch } from '@/lib/dates';
import { ImageUploader } from './image-uploader';
import { FoodList } from './food-list';
import { SymptomInput } from './symptom-input';
import type { FoodEntry } from '@/lib/ai/vision-provider';

interface EntryFormProps {
  userId: string;
  selectedDate: Date | string;
  existingEntry: any;
}

interface MealData {
  [key: string]: FoodEntry[];
}

function toSelectedIso(selectedDate: Date | string): string {
  return calendarDateFromUnknown(selectedDate) || formatDateISO(selectedDate);
}

export function EntryForm({ userId, selectedDate, existingEntry }: EntryFormProps) {
  const router = useRouter();
  const [date, setDate] = useState(() => toSelectedIso(selectedDate));
  const [meals, setMeals] = useState<MealData>({
    breakfast: [],
    lunch: [],
    dinner: [],
    snacks: [],
    drinks: [],
  });
  const [symptomNotes, setSymptomNotes] = useState('');
  const [overallRating, setOverallRating] = useState<string>('');
  const [bloating, setBloating] = useState<string>('none');
  const [gas, setGas] = useState<string>('none');
  const [crampsPain, setCrampsPain] = useState<string>('none');
  const [diarrhea, setDiarrhea] = useState(false);
  const [constipation, setConstipation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dailyEntryId, setDailyEntryId] = useState<string | null>(existingEntry?.id || null);
  const [extractedDate, setExtractedDate] = useState<string | null>(null);
  const [showDateWarning, setShowDateWarning] = useState(false);

  // Load existing entry data
  useEffect(() => {
    if (existingEntry) {
      // Load meals
      const loadedMeals: MealData = {
        breakfast: [],
        lunch: [],
        dinner: [],
        snacks: [],
        drinks: [],
      };

      existingEntry.meals?.forEach((meal: any) => {
        const mealType = meal.mealType.toLowerCase();
        loadedMeals[mealType] = meal.foodItems.map((item: any) => ({
          text: item.rawText,
          brand: item.brand,
          food_name: item.foodName,
          quantity: item.quantity,
          is_drink: item.isDrink,
          calories: item.calories,
          carbs: item.carbs,
          fat: item.fat,
          protein: item.protein,
          fiber: item.fiber,
          sugar: item.sugar,
        }));
      });

      setMeals(loadedMeals);

      // Load symptoms
      if (existingEntry.symptomRecord) {
        setSymptomNotes(existingEntry.symptomRecord.freeTextNotes || '');
        setOverallRating(existingEntry.symptomRecord.overallRating || '');
        setBloating(existingEntry.symptomRecord.bloating || 'none');
        setGas(existingEntry.symptomRecord.gas || 'none');
        setCrampsPain(existingEntry.symptomRecord.crampsPain || 'none');
        setDiarrhea(existingEntry.symptomRecord.diarrhea || false);
        setConstipation(existingEntry.symptomRecord.constipation || false);
      }
      if (existingEntry.ocrExtractions?.[0]?.extractedDate) {
        const check = datesMismatch(
          existingEntry.ocrExtractions[0].extractedDate,
          selectedDate
        );
        if (check.mismatch && check.extracted) {
          setExtractedDate(check.extracted);
          setShowDateWarning(true);
        }
      }
    }
  }, [existingEntry, selectedDate]);

  useEffect(() => {
    setDate(toSelectedIso(selectedDate));
  }, [selectedDate]);

  // Handle extraction result
  const handleExtractionComplete = (result: any) => {
    const newMeals: MealData = {
      breakfast: result.breakfast || [],
      lunch: result.lunch || [],
      dinner: result.dinner || [],
      snacks: result.snacks || [],
      drinks: result.drinks || [],
    };

    setMeals(newMeals);

    const check = datesMismatch(
      result.extracted_date ?? result.extractedDate,
      selectedDate
    );
    const vsDateField = datesMismatch(
      result.extracted_date ?? result.extractedDate,
      date
    );
    if ((check.mismatch || vsDateField.mismatch) && (check.extracted || vsDateField.extracted)) {
      setExtractedDate(check.extracted || vsDateField.extracted);
      setShowDateWarning(true);
    } else {
      setShowDateWarning(false);
    }
  };

  // Handle date change
  const handleDateChange = (newDate: string) => {
    router.push(`/entry?date=${newDate}`);
  };

  // Save entry
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/entries/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dailyEntryId,
          date,
          meals,
          symptomNotes,
          overallRating,
          bloating,
          gas,
          crampsPain,
          diarrhea,
          constipation,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save entry');
      }

      const data = await response.json();
      setDailyEntryId(data.dailyEntryId);

      // Show success and redirect to dashboard
      alert('Entry saved successfully!');
      router.push('/');
      router.refresh();
    } catch (error) {
      console.error('Save failed:', error);
      alert('Failed to save entry. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const hasFoodData = Object.values(meals).some((items) => items.length > 0);

  return (
    <div className="space-y-6">
      {/* Header with Date Selector */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Daily Entry</CardTitle>
              <CardDescription>{formatDate(selectedDate)}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const yesterday = new Date(selectedDate);
                  yesterday.setDate(yesterday.getDate() - 1);
                  handleDateChange(formatDateISO(yesterday));
                }}
              >
                ← Prev
              </Button>
              <Input
                type="date"
                value={date}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-40"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const tomorrow = new Date(selectedDate);
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  handleDateChange(formatDateISO(tomorrow));
                }}
                disabled={(() => {
                  const tomorrow = new Date(selectedDate);
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  return formatDateISO(tomorrow) > formatDateISO(new Date());
                })()}
              >
                Next →
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Date Warning */}
      {showDateWarning && extractedDate && (
        <Card className="border-yellow-500 bg-yellow-50" data-testid="date-mismatch-warning">
          <CardContent className="pt-6">
            <p className="text-sm">
              ⚠️ Date mismatch: the image is from {extractedDate}, but you're editing {date}.{' '}
              <Button
                variant="link"
                className="p-0 h-auto"
                onClick={() => handleDateChange(extractedDate)}
              >
                Switch to {extractedDate}
              </Button>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Image Upload */}
      <ImageUploader
        dailyEntryId={dailyEntryId}
        userId={userId}
        selectedDate={selectedDate}
        onExtractionComplete={handleExtractionComplete}
        onDailyEntryCreated={setDailyEntryId}
      />

      {/* Food Lists */}
      <FoodList meals={meals} onMealsChange={setMeals} />

      {/* Symptom Input */}
      <SymptomInput
        symptomNotes={symptomNotes}
        setSymptomNotes={setSymptomNotes}
        overallRating={overallRating}
        setOverallRating={setOverallRating}
        bloating={bloating}
        setBloating={setBloating}
        gas={gas}
        setGas={setGas}
        crampsPain={crampsPain}
        setCrampsPain={setCrampsPain}
        diarrhea={diarrhea}
        setDiarrhea={setDiarrhea}
        constipation={constipation}
        setConstipation={setConstipation}
      />

      {/* Save Button */}
      <Card>
        <CardContent className="pt-6">
          <Button
            onClick={handleSave}
            disabled={isSaving || (!hasFoodData && !symptomNotes)}
            className="w-full"
            size="lg"
          >
            {isSaving ? 'Saving...' : 'Save Entry'}
          </Button>
          {!hasFoodData && !symptomNotes && (
            <p className="text-sm text-muted-foreground text-center mt-2">
              Add at least one food item or symptom note to save
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
