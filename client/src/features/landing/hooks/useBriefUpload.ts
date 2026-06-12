import { useState } from 'react';
import { toast } from 'sonner';

// Brief upload — owns uploading a job description / company brief (PDF, DOCX, TXT),
// holding the extracted-text preview, and the confidential flag. Used only by the
// "From brief" flow (BriefPanel + useBriefMode); the Search flow is text-only.

/** Accepted brief file formats — keep in sync with the input `accept` attrs and server fileFilter. */
export const BRIEF_ACCEPT = '.pdf,.docx,.txt';

/** True when a dropped file is a PDF, DOCX, or TXT brief. */
export function isAcceptedBriefFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.endsWith('.docx') || file.name.endsWith('.txt');
}

export type BriefUploadHook = ReturnType<typeof useBriefUpload>;

export function useBriefUpload(sessionId: string) {
  const [fileName, setFileName] = useState('');
  const [extractedPreview, setExtractedPreview] = useState('');
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isConfidential, setIsConfidentialState] = useState(false);

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sessionId', sessionId);
      formData.append('pdConfidential', String(isConfidential));
      const res = await fetch('/api/search/upload-brief', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || 'Upload failed');
      }
      const data = await res.json();
      setFileName(data.filename);
      setExtractedPreview(data.extractedText?.slice(0, 500) || '');
      toast.success(`Loaded "${data.filename}" — ${data.charCount.toLocaleString()} characters extracted`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  };

  // Persist the confidential flag immediately so it survives even before the next upload.
  const setConfidential = async (val: boolean) => {
    setIsConfidentialState(val);
    try {
      await fetch(`/api/search/session/${sessionId}/confidential`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdConfidential: val }),
      });
    } catch {
      // Non-fatal — server will also read flag at upload time
    }
  };

  return {
    fileName,
    extractedPreview,
    previewExpanded,
    setPreviewExpanded,
    isUploading,
    isConfidential,
    setConfidential,
    uploadFile,
  };
}
