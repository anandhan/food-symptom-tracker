'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ConceptRow {
  id: string;
  name: string;
  itemCount: number;
}

export function ConceptReview() {
  const [concepts, setConcepts] = useState<ConceptRow[]>([]);
  const [fromId, setFromId] = useState('');
  const [intoId, setIntoId] = useState('');
  const [status, setStatus] = useState('');

  const load = async () => {
    const res = await fetch('/api/concepts');
    if (!res.ok) return;
    const data = await res.json();
    setConcepts(data.concepts || []);
  };

  useEffect(() => {
    load();
  }, []);

  const merge = async () => {
    setStatus('');
    const res = await fetch('/api/concepts/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromId, intoId }),
    });
    if (res.ok) {
      setStatus(`Merged into the target concept.`);
      setFromId('');
      setIntoId('');
      await load();
    } else {
      setStatus('Merge failed');
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {concepts.length} active concepts. Latte lines and “coffee with milk” both map to coffee + milk.
      </p>
      <ul className="max-h-48 overflow-auto text-sm space-y-1 border rounded-md p-3 bg-white">
        {concepts.length === 0 ? (
          <li className="text-muted-foreground">No concepts yet. Save an entry or run the backfill.</li>
        ) : (
          concepts.map((c) => (
            <li key={c.id} className="flex justify-between">
              <span className="capitalize">{c.name}</span>
              <span className="text-muted-foreground">{c.itemCount} items</span>
            </li>
          ))
        )}
      </ul>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Merge this concept</Label>
          <Select value={fromId} onValueChange={setFromId}>
            <SelectTrigger>
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              {concepts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Into</Label>
          <Select value={intoId} onValueChange={setIntoId}>
            <SelectTrigger>
              <SelectValue placeholder="Target" />
            </SelectTrigger>
            <SelectContent>
              {concepts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button onClick={merge} disabled={!fromId || !intoId || fromId === intoId} variant="outline">
        Merge concepts
      </Button>
      {status && <p className="text-sm">{status}</p>}
    </div>
  );
}
