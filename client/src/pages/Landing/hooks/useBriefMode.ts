import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { isAcceptedBriefFile, type BriefUploadHook } from './useBriefUpload';

export type BriefModeHook = ReturnType<typeof useBriefMode>;

// useBriefMode — drives the "From brief" panel: the paste-text box plus the file
// dropzone/picker. Delegates the actual upload + extraction to the shared `upload` hook.
export function useBriefMode({
  upload,
  sessionId,
  startSearch,
}: {
  upload: BriefUploadHook;
  sessionId: string;
  startSearch: (query: string, sessionId: string) => void;
}) {
  const [briefText, setBriefText] = useState('');
  const [isBriefDragOver, setIsBriefDragOver] = useState(false);
  const briefFileInputRef = useRef<HTMLInputElement>(null);

  const handleBriefFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await upload.uploadFile(file);
  };

  const handleBriefDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsBriefDragOver(true); };
  const handleBriefDragLeave = () => setIsBriefDragOver(false);
  const handleBriefDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsBriefDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && isAcceptedBriefFile(file)) {
      await upload.uploadFile(file);
    } else if (file) {
      toast.error('Please drop a PDF, DOCX, or TXT file');
    }
  };

  const handleAnalyseBrief = async () => {
    if (!upload.fileName && !briefText.trim()) {
      toast.error('Upload a brief or paste text');
      return;
    }
    if (!upload.fileName && briefText.trim()) {
      const blob = new File([briefText.trim()], 'pasted-brief.txt', { type: 'text/plain' });
      await upload.uploadFile(blob);
    }
    const query = briefText.trim() || `Brief: ${upload.fileName}`;
    startSearch(query, sessionId);
  };

  return {
    briefText,
    setBriefText,
    isBriefDragOver,
    briefFileInputRef,
    handleBriefFileSelect,
    handleBriefDragOver,
    handleBriefDragLeave,
    handleBriefDrop,
    handleAnalyseBrief,
  };
}
