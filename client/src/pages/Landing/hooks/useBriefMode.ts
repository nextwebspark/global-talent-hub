import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type { PdUploadHook } from './usePdUpload';

export type BriefModeHook = ReturnType<typeof useBriefMode>;

export function useBriefMode({
  pd,
  sessionId,
  startSearch,
}: {
  pd: PdUploadHook;
  sessionId: string;
  startSearch: (query: string, sessionId: string) => void;
}) {
  const [briefText, setBriefText] = useState('');
  const [isBriefDragOver, setIsBriefDragOver] = useState(false);
  const briefFileInputRef = useRef<HTMLInputElement>(null);

  const handleBriefFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await pd.uploadPdFile(file);
  };

  const handleBriefDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsBriefDragOver(true); };
  const handleBriefDragLeave = () => setIsBriefDragOver(false);
  const handleBriefDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsBriefDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type === 'application/pdf' || file.name.endsWith('.docx') || file.name.endsWith('.txt'))) {
      await pd.uploadPdFile(file);
    } else if (file) {
      toast.error('Please drop a PDF, DOCX, or TXT file');
    }
  };

  const handleAnalyseBrief = async () => {
    if (!pd.pdFileName && !briefText.trim()) {
      toast.error('Upload a brief or paste text');
      return;
    }
    if (!pd.pdFileName && briefText.trim()) {
      const blob = new File([briefText.trim()], 'pasted-brief.txt', { type: 'text/plain' });
      await pd.uploadPdFile(blob);
    }
    const query = briefText.trim() || `Brief: ${pd.pdFileName}`;
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
