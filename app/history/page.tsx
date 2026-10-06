// Complete History page with search, filters, and edit

'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { MainNav } from '@/components/main-nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import Link from 'next/link';

interface HistoryEntry {
  id: string;
  date: string;
  overallRating: string | null;
  symptomNotes: string;
  bloating: string | null;
  foodItems: string[];
}

export default function HistoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<HistoryEntry[]>([]);
  const [foodSearch, setFoodSearch] = useState('');
  const [noteSearch, setNoteSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [bloatingFilter, setBloatingFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated') {
      fetchEntries();
    }
  }, [status, router]);

  const fetchEntries = async () => {
    try {
      const response = await fetch('/api/history/list');
      if (response.ok) {
        const data = await response.json();
        setEntries(data.entries);
        setFilteredEntries(data.entries);
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    applyFilters();
  }, [foodSearch, noteSearch, ratingFilter, bloatingFilter, startDate, endDate, entries]);

  const applyFilters = () => {
    let filtered = [...entries];

    // Food search
    if (foodSearch.trim()) {
      const search = foodSearch.toLowerCase();
      filtered = filtered.filter(entry =>
        entry.foodItems.some(item => item.toLowerCase().includes(search))
      );
    }

    // Note search
    if (noteSearch.trim()) {
      const search = noteSearch.toLowerCase();
      filtered = filtered.filter(entry =>
        entry.symptomNotes?.toLowerCase().includes(search)
      );
    }

    // Rating filter
    if (ratingFilter !== 'all') {
      filtered = filtered.filter(entry => entry.overallRating === ratingFilter);
    }

    // Bloating filter
    if (bloatingFilter !== 'all') {
      filtered = filtered.filter(entry =>
        entry.bloating === bloatingFilter || 
        (bloatingFilter === 'any' && entry.bloating && entry.bloating !== 'none')
      );
    }

    // Date range
    if (startDate) {
      filtered = filtered.filter(entry => entry.date >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(entry => entry.date <= endDate);
    }

    setFilteredEntries(filtered);
  };

  const getRatingEmoji = (rating: string | null) => {
    switch (rating) {
      case 'great': return '😄';
      case 'good': return '🙂';
      case 'okay': return '😐';
      case 'bad': return '😞';
      case 'very_bad': return '😣';
      default: return '❓';
    }
  };

  const clearFilters = () => {
    setFoodSearch('');
    setNoteSearch('');
    setRatingFilter('all');
    setBloatingFilter('all');
    setStartDate('');
    setEndDate('');
  };

  if (status === 'loading' || isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <MainNav />
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">History</h1>
          <p className="text-muted-foreground">
            Search and browse your food diary entries
          </p>
        </div>

        {/* Filters Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Search & Filters</CardTitle>
            <CardDescription>
              Find specific entries by food, symptoms, or date
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Food Search */}
              <div className="space-y-2">
                <Label htmlFor="food-search">Search by Food</Label>
                <Input
                  id="food-search"
                  placeholder="e.g., chicken, milk, coffee..."
                  value={foodSearch}
                  onChange={(e) => setFoodSearch(e.target.value)}
                />
              </div>

              {/* Symptom Notes Search */}
              <div className="space-y-2">
                <Label htmlFor="note-search">Search Symptom Notes</Label>
                <Input
                  id="note-search"
                  placeholder="e.g., bloating, cramps..."
                  value={noteSearch}
                  onChange={(e) => setNoteSearch(e.target.value)}
                />
              </div>

              {/* Overall Rating Filter */}
              <div className="space-y-2">
                <Label htmlFor="rating-filter">Overall Feeling</Label>
                <Select value={ratingFilter} onValueChange={setRatingFilter}>
                  <SelectTrigger id="rating-filter">
                    <SelectValue placeholder="All ratings" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All ratings</SelectItem>
                    <SelectItem value="great">😄 Great</SelectItem>
                    <SelectItem value="good">🙂 Good</SelectItem>
                    <SelectItem value="okay">😐 Okay</SelectItem>
                    <SelectItem value="bad">😞 Bad</SelectItem>
                    <SelectItem value="very_bad">😣 Very Bad</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Bloating Filter */}
              <div className="space-y-2">
                <Label htmlFor="bloating-filter">Bloating Level</Label>
                <Select value={bloatingFilter} onValueChange={setBloatingFilter}>
                  <SelectTrigger id="bloating-filter">
                    <SelectValue placeholder="Any level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All levels</SelectItem>
                    <SelectItem value="any">Any bloating</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="mild">Mild</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="severe">Severe</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date Range */}
              <div className="space-y-2">
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Showing {filteredEntries.length} of {entries.length} entries
              </p>
              <Button variant="outline" onClick={clearFilters}>
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Entries List */}
        <div className="space-y-4">
          {filteredEntries.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  {entries.length === 0
                    ? 'No entries yet. Start tracking!'
                    : 'No entries match your filters.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredEntries.map((entry) => (
              <Card key={entry.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{getRatingEmoji(entry.overallRating)}</span>
                      <div>
                        <CardTitle className="text-lg">
                          {new Date(entry.date).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </CardTitle>
                        <CardDescription>
                          {entry.overallRating ? entry.overallRating.replace('_', ' ') : 'Not rated'}
                        </CardDescription>
                      </div>
                    </div>
                    <Link href={`/entry?date=${entry.date}`}>
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm font-medium">Foods:</p>
                      <div className="flex flex-wrap gap-2">
                        {entry.foodItems.slice(0, 5).map((food, idx) => (
                          <Link
                            key={idx}
                            href={`/food?food=${encodeURIComponent(food)}`}
                            className="text-sm text-blue-600 hover:underline"
                          >
                            {food}
                          </Link>
                        ))}
                        {entry.foodItems.length > 5 && (
                          <span className="text-sm text-muted-foreground">
                            (+{entry.foodItems.length - 5} more)
                          </span>
                        )}
                      </div>
                    </div>
                    {entry.symptomNotes && (
                      <div>
                        <p className="text-sm font-medium">Symptoms:</p>
                        <p className="text-sm text-muted-foreground">
                          {entry.symptomNotes.length > 150
                            ? `${entry.symptomNotes.substring(0, 150)}...`
                            : entry.symptomNotes}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
