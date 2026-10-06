// Image uploader component with paste and file upload

'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateISO } from '@/lib/utils';

interface ImageUploaderProps {
  dailyEntryId: string | null;
  userId: string;
  selectedDate: Date;
  onExtractionComplete: (result: any) => void;
  onDailyEntryCreated: (id: string) => void;
}

export function ImageUploader({
  dailyEntryId,
  userId,
  selectedDate,
  onExtractionComplete,
  onDailyEntryCreated,
}: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Handle paste event
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            await handleFile(file);
          }
          break;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [dailyEntryId]);

  // Ensure daily entry exists
  const ensureDailyEntry = async (): Promise<string> => {
    if (dailyEntryId) return dailyEntryId;

    const response = await fetch('/api/entries/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: formatDateISO(selectedDate),
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create daily entry');
    }

    const data = await response.json();
    onDailyEntryCreated(data.dailyEntryId);
    return data.dailyEntryId;
  };

  // Handle file upload
  const handleFile = async (file: File) => {
    setIsUploading(true);
    setIsExtracting(false);

    try {
      // Ensure daily entry exists
      const entryId = await ensureDailyEntry();

      // Upload image
      const formData = new FormData();
      formData.append('image', file);
      formData.append('dailyEntryId', entryId);

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Upload failed');
      }

      const uploadData = await uploadResponse.json();
      setUploadedImageUrl(uploadData.url);
      setIsUploading(false);

      // Extract foods
      setIsExtracting(true);
      const extractResponse = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageId: uploadData.id,
          imageUrl: uploadData.url,
          dailyEntryId: entryId,
        }),
      });

      if (!extractResponse.ok) {
        throw new Error('Extraction failed');
      }

      const extractData = await extractResponse.json();
      onExtractionComplete(extractData.result);
      setIsExtracting(false);
    } catch (error) {
      console.error('Upload/extraction error:', error);
      alert('Failed to process image. Please try again or enter foods manually.');
      setIsUploading(false);
      setIsExtracting(false);
    }
  };

  // Handle file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  // Handle drag and drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Food Image</CardTitle>
        <CardDescription>
          Paste (Cmd+V) or upload your food diary screenshot
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          ref={dropZoneRef}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? (
            <p className="text-muted-foreground">Uploading image...</p>
          ) : isExtracting ? (
            <p className="text-muted-foreground">
              Extracting foods with AI... This may take a few seconds.
            </p>
          ) : uploadedImageUrl ? (
            <div className="space-y-2">
              <p className="text-green-600 font-medium">✓ Image uploaded and processed</p>
              <Button variant="outline" size="sm">
                Upload Another
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-4xl">📸</div>
              <div>
                <p className="font-medium">Click to upload or drag and drop</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Or press Cmd+V to paste from clipboard
                </p>
              </div>
              <Button variant="outline">
                Choose File
              </Button>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </CardContent>
    </Card>
  );
}
