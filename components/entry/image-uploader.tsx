// Image uploader component with paste and file upload

'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateISO } from '@/lib/utils';

interface ImageUploaderProps {
  dailyEntryId: string | null;
  userId: string;
  selectedDate: Date | string;
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

  const handleFileRef = useRef<(file: File) => Promise<void>>(async () => {});
  const dailyEntryIdRef = useRef(dailyEntryId);
  dailyEntryIdRef.current = dailyEntryId;

  const ensureDailyEntry = async (): Promise<string> => {
    if (dailyEntryIdRef.current) return dailyEntryIdRef.current;

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
    dailyEntryIdRef.current = data.dailyEntryId;
    return data.dailyEntryId;
  };

  const handleFile = async (file: File) => {
    setIsUploading(true);
    setIsExtracting(false);

    try {
      const entryId = await ensureDailyEntry();

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

  handleFileRef.current = handleFile;

  useEffect(() => {
    const takeImage = (data: DataTransfer | null): File | null => {
      if (!data) return null;
      if (data.files && data.files.length > 0) {
        for (const f of Array.from(data.files)) {
          if (f.type.startsWith('image/')) return f;
        }
      }
      for (const item of Array.from(data.items || [])) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) return file;
        }
      }
      return null;
    };

    const readClipboardApi = async (): Promise<File | null> => {
      if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
        return null;
      }
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const type = item.types.find((t) => t.startsWith('image/'));
          if (!type) continue;
          const blob = await item.getType(type);
          return new File([blob], 'pasted-image.png', { type: blob.type || type });
        }
      } catch (err) {
        console.warn('clipboard.read failed', err);
      }
      return null;
    };

    const handlePaste = async (e: ClipboardEvent) => {
      let file = takeImage(e.clipboardData);
      if (!file) file = await readClipboardApi();
      if (!file) return;
      e.preventDefault();
      e.stopPropagation();
      await handleFileRef.current(file);
    };

    window.addEventListener('paste', handlePaste, true);
    document.addEventListener('paste', handlePaste, true);
    return () => {
      window.removeEventListener('paste', handlePaste, true);
      document.removeEventListener('paste', handlePaste, true);
    };
  }, []);

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
          data-testid="image-dropzone"
          tabIndex={0}
          onPaste={(e) => {
            const dt = e.clipboardData;
            const file =
              (dt?.files && Array.from(dt.files).find((f) => f.type.startsWith('image/'))) ||
              null;
            if (file) {
              e.preventDefault();
              handleFileRef.current(file);
            }
          }}
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
