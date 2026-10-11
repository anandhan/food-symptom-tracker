// Image uploader component with paste and file upload

'use client';

import { useState, useRef, useEffect, type MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateISO } from '@/lib/utils';
import { compressImageForUpload } from '@/lib/images/compress-client';

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
  const [processError, setProcessError] = useState<string | null>(null);
  const [canRetryExtract, setCanRetryExtract] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const handleFileRef = useRef<(file: File) => Promise<void>>(async () => {});
  const dailyEntryIdRef = useRef(dailyEntryId);
  dailyEntryIdRef.current = dailyEntryId;
  const lastExtractBodyRef = useRef<{
    imageId?: string;
    imageUrl?: string;
    dailyEntryId: string;
  } | null>(null);
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

  const readApiError = async (response: Response, fallback: string) => {
    try {
      const data = await response.json();
      const code = typeof data.code === 'string' ? `[${data.code}] ` : '';
      const detail = data.detail || data.error || fallback;
      return `${code}${data.error && data.detail && data.detail !== data.error ? `${data.error} — ${data.detail}` : detail}`;
    } catch {
      return `${fallback} (HTTP ${response.status})`;
    }
  };

  const extractWithBody = async (body: { imageId?: string; imageUrl?: string; dailyEntryId: string }) => {
    lastExtractBodyRef.current = body;
    setIsExtracting(true);
    const extractResponse = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!extractResponse.ok) {
      const data = await extractResponse.json().catch(() => ({} as { code?: string; error?: string; detail?: string }));
      const retryable = data.code === 'gemini-busy' || data.code === 'timeout';
      setCanRetryExtract(retryable && Boolean(lastExtractBodyRef.current || lastFileRef.current));
      const detail = data.detail && data.detail !== data.error ? ` — ${data.detail}` : '';
      const code = typeof data.code === 'string' ? `[${data.code}] ` : '';
      throw new Error(
        data.code === 'gemini-busy'
          ? `${data.error || 'Gemini is busy right now, try again in a minute'}${detail}`
          : `${code}${data.error || data.detail || 'Extraction failed'}${detail}`
      );
    }
    const extractData = await extractResponse.json();
    if (extractData.model) {
      console.log(`[extract] used model=${extractData.model}`);
    }
    onExtractionComplete(extractData.result);
    setIsExtracting(false);
    setCanRetryExtract(false);
  };

  const handleFile = async (file: File) => {
    lastFileRef.current = file;
    setIsUploading(true);
    setIsExtracting(false);
    setProcessError(null);
    setCanRetryExtract(false);

    try {
      const entryId = await ensureDailyEntry();
      const compressed = await compressImageForUpload(file);
      lastFileRef.current = compressed;
      if (compressed.size > 4 * 1024 * 1024) {
        throw new Error(
          `[size] Compressed image is still ${compressed.size} bytes. Try a smaller screenshot.`
        );
      }

      const formData = new FormData();
      formData.append('image', compressed);
      formData.append('dailyEntryId', entryId);

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error(await readApiError(uploadResponse, 'Upload failed'));
      }

      const uploadData = await uploadResponse.json();
      setUploadedImageUrl(uploadData.url?.startsWith('data:') ? 'inline' : uploadData.url);
      setIsUploading(false);

      await extractWithBody({
        imageId: uploadData.id,
        imageUrl: uploadData.url,
        dailyEntryId: entryId,
      });
    } catch (error) {
      console.error('Upload/extraction error:', error);
      const message =
        error instanceof Error ? error.message : 'Failed to process image. Please enter foods manually.';
      setProcessError(message);
      setIsUploading(false);
      setIsExtracting(false);
    }
  };

  const retryLastExtract = async (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setProcessError(null);
    setCanRetryExtract(false);
    try {
      if (lastExtractBodyRef.current) {
        await extractWithBody(lastExtractBodyRef.current);
        return;
      }
      if (lastFileRef.current) {
        await handleFile(lastFileRef.current);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to process image. Please enter foods manually.';
      setProcessError(message);
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
            <p className="text-muted-foreground">Compressing and uploading image...</p>
          ) : isExtracting ? (
            <p className="text-muted-foreground">
              Extracting foods with AI... This may take a few seconds.
            </p>
          ) : processError ? (
            <div className="space-y-3 text-left">
              <p className="text-destructive font-medium">Could not process image</p>
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
