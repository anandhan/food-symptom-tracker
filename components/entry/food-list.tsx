// Food list component for displaying and editing meals

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { FoodEntry } from '@/lib/ai/vision-provider';
import { X } from 'lucide-react';

interface FoodListProps {
  meals: {
    [key: string]: FoodEntry[];
  };
  onMealsChange: (meals: any) => void;
}

const mealTypes = ['breakfast', 'lunch', 'dinner', 'snacks', 'drinks'] as const;
const mealLabels: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
  drinks: 'Drinks',
};

export function FoodList({ meals, onMealsChange }: FoodListProps) {
  const [newItems, setNewItems] = useState<Record<string, string>>({});

  const handleAddItem = (mealType: string) => {
    const text = newItems[mealType]?.trim();
    if (!text) return;

    const newMeals = { ...meals };
    newMeals[mealType] = [
      ...newMeals[mealType],
      {
        text,
        is_drink: mealType === 'drinks',
      },
    ];

    onMealsChange(newMeals);
    setNewItems({ ...newItems, [mealType]: '' });
  };

  const handleRemoveItem = (mealType: string, index: number) => {
    const newMeals = { ...meals };
    newMeals[mealType] = newMeals[mealType].filter((_, i) => i !== index);
    onMealsChange(newMeals);
  };

  const handleEditItem = (mealType: string, index: number, newText: string) => {
    const newMeals = { ...meals };
    newMeals[mealType][index] = {
      ...newMeals[mealType][index],
      text: newText,
    };
    onMealsChange(newMeals);
  };

  const totalItems = Object.values(meals).reduce((sum, items) => sum + items.length, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Food Items</CardTitle>
        <CardDescription>
          {totalItems === 0 ? 'Add your meals manually or upload an image above' : `${totalItems} items logged`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {mealTypes.map((mealType) => (
          <div key={mealType} className="space-y-2">
            <h3 className="font-semibold text-lg">{mealLabels[mealType]}</h3>
            
            {/* Existing items */}
            {meals[mealType]?.length > 0 ? (
              <div className="space-y-2">
                {meals[mealType].map((item, index) => (
                  <div key={index} className="flex items-start gap-2 group">
                    <div className="flex-1 p-3 border rounded-md bg-white">
                      <Input
                        value={item.text}
                        onChange={(e) => handleEditItem(mealType, index, e.target.value)}
                        className="border-0 p-0 h-auto focus-visible:ring-0"
                      />
                      {item.brand && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Brand: {item.brand}
                        </p>
                      )}
                      {item.calories && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {item.calories} cal
                          {item.protein ? ` • ${item.protein}g protein` : ''}
                          {item.carbs ? ` • ${item.carbs}g carbs` : ''}
                          {item.fat ? ` • ${item.fat}g fat` : ''}
                        </p>
                      )}
                      {item.is_drink && (
                        <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">
                          Drink
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveItem(mealType, index)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">No items yet</p>
            )}

            {/* Add new item */}
            <div className="flex gap-2">
              <Input
                placeholder={`Add ${mealLabels[mealType].toLowerCase()} item...`}
                value={newItems[mealType] || ''}
                onChange={(e) => setNewItems({ ...newItems, [mealType]: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddItem(mealType);
                  }
                }}
              />
              <Button
                variant="outline"
                onClick={() => handleAddItem(mealType)}
                disabled={!newItems[mealType]?.trim()}
              >
                Add
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
