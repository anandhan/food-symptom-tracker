'use client';

import { useState, useRef, useEffect, type MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateISO } from '@/lib/utils';
import { compressImageForUpload } from '@/lib/images/compress-client';
import { parseMfpDiary } from '@/lib/ocr/mfp-parser';
import type { ExtractionResult } from '@/lib/ocr/types';

interface ImageUploaderProps {
  dailyEntryId: string | null;
  userId: string;
  selectedDate: Date | string;
  onExtractionComplete: (result: ExtractionResult) => void;
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
  const [ocrStatus, setOcrStatus] = useState('');
  const [ocrProgress, setOcrProgress] = useState(0);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);
  const [canRetryExtract, setCanRetryExtract] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const handleFileRef = useRef<(file: File) => Promise<void>>(async () => {});
  const dailyEntryIdRef = useRef(dailyEntryId);
  dailyEntryIdRef.current = dailyEntryId;
  const lastFileRef = useRef<File | null>(null);

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

  const persistParsed = async (result: ExtractionResult, file?: File | null) => {
    try {
      const entryId = await ensureDailyEntry();
      let imageId: string | undefined;
      if (file) {
        setIsUploading(true);
        try {
          const compressed = await compressImageForUpload(file);
          if (compressed.size <= 4 * 1024 * 1024) {
            const formData = new FormData();
            formData.append('image', compressed);
            formData.append('dailyEntryId', entryId);
            const uploadResponse = await fetch('/api/upload', {
              method: 'POST',
              body: formData,
            });
            if (uploadResponse.ok) {
              const uploadData = await uploadResponse.json();
              imageId = uploadData.id;
              setUploadedImageUrl(uploadData.url?.startsWith('data:') ? 'inline' : uploadData.url);
            }
          }
        } catch (error) {
          console.warn('Optional image store skipped', error);
        } finally {
          setIsUploading(false);
        }
      }

      await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dailyEntryId: entryId,
          imageId,
          result,
        }),
      });
    } catch (error) {
      console.warn('Could not persist on-device extraction', error);
    }
  };

  const handleFile = async (file: File) => {
    lastFileRef.current = file;
    setIsUploading(false);
    setIsExtracting(true);
    setOcrProgress(0);
    setOcrStatus('Loading OCR');
    setProcessError(null);
    setCanRetryExtract(false);

    try {
      const { extractFoodsFromImage } = await import('@/lib/ocr/client');
      const result = await extractFoodsFromImage(file, ({ status, progress }) => {
        setOcrStatus(status);
        setOcrProgress(Math.round(progress * 100));
      });
      onExtractionComplete(result);
      setIsExtracting(false);
      setOcrStatus('');
      await persistParsed(result, file);
    } catch (error) {
      console.error('OCR error:', error);
      const message =
        error instanceof Error ? error.message : 'Failed to read image. Paste diary text or enter foods manually.';
      setProcessError(message);
      setCanRetryExtract(Boolean(lastFileRef.current));
      setIsUploading(false);
      setIsExtracting(false);
    }
  };

  const handlePasteText = async () => {
    const text = pasteText.trim();
    if (!text) return;
    setProcessError(null);
    const result = parseMfpDiary(text);
    onExtractionComplete(result);
    await persistParsed(result);
  };

  const retryLastExtract = async (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setProcessError(null);
    setCanRetryExtract(false);
    if (lastFileRef.current) {
      await handleFile(lastFileRef.current);
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
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
        return;
      }
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

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

  const progressLabel = ocrStatus || (isUploading ? 'Saving image…' : 'Reading diary');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Food Image</CardTitle>
        <CardDescription>
          Paste or upload a MyFitnessPal screenshot. Text is read on this device — nothing is sent to Gemini.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
          {isExtracting ? (
            <div className="space-y-3" data-testid="ocr-progress">
              <p className="text-muted-foreground">{progressLabel}</p>
              <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-[width] duration-200"
                  style={{ width: `${Math.max(4, ocrProgress)}%` }}
                  role="progressbar"
                  aria-valuenow={ocrProgress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
              <p className="text-sm text-muted-foreground">{ocrProgress}%</p>
            </div>
          ) : processError ? (
            <div className="space-y-3 text-left">
              <p className="text-destructive font-medium">Could not read image</p>
              <p className="text-sm text-destructive/90 whitespace-pre-wrap">{processError}</p>
              <div className="flex flex-wrap gap-2">
                {canRetryExtract && (
                  <Button
                    variant="default"
                    size="sm"
                    data-testid="extract-try-again"
                    onClick={retryLastExtract}
                  >
                    Try again
                  </Button>
                )}
                <Button variant="outline" size="sm">
                  Try another image
                </Button>
              </div>
            </div>
          ) : uploadedImageUrl ? (
            <div className="space-y-2">
              <p className="text-green-600 font-medium">✓ Diary read on this device</p>
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
                  Or press Cmd+V to paste a screenshot
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

        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
          <label htmlFor="mfp-paste-text" className="text-sm font-medium">
            Or paste diary text
          </label>
          <textarea
            id="mfp-paste-text"
            data-testid="mfp-paste-text"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste MyFitnessPal diary text here if you would rather skip the screenshot."
            className="w-full min-h-[96px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="mfp-parse-text"
            onClick={handlePasteText}
            disabled={!pasteText.trim()}
          >
            Parse pasted text
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
