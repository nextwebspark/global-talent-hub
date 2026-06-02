import { useRef, useState } from 'react';
import { toast } from 'sonner';

export type PdUploadHook = ReturnType<typeof usePdUpload>;

export function usePdUpload(sessionId: string) {
  const [pdFileName, setPdFileName] = useState('');
  const [pdExtractedPreview, setPdExtractedPreview] = useState('');
  const [pdPreviewExpanded, setPdPreviewExpanded] = useState(false);
  const [isUploadingPd, setIsUploadingPd] = useState(false);
  const [pdConfidential, setPdConfidential] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const pdFileInputRef = useRef<HTMLInputElement>(null);

  const uploadPdFile = async (file: File) => {
    setIsUploadingPd(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sessionId', sessionId);
      formData.append('pdConfidential', String(pdConfidential));
      const res = await fetch('/api/search/upload-pd', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || 'Upload failed');
      }
      const data = await res.json();
      setPdFileName(data.filename);
      setPdExtractedPreview(data.extractedText?.slice(0, 500) || '');
      toast.success(`Loaded "${data.filename}" — ${data.charCount.toLocaleString()} characters extracted`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload file');
    } finally {
      setIsUploadingPd(false);
      if (pdFileInputRef.current) pdFileInputRef.current.value = '';
    }
  };

  const handlePdUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadPdFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type === 'application/pdf' || file.name.endsWith('.docx') || file.name.endsWith('.txt'))) {
      await uploadPdFile(file);
    } else if (file) {
      toast.error('Please drop a PDF, DOCX, or TXT file');
    }
  };

  const setConfidentialPersisted = async (val: boolean) => {
    setPdConfidential(val);
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

  const clearPd = () => setPdFileName('');

  return {
    pdFileName,
    pdExtractedPreview,
    pdPreviewExpanded,
    setPdPreviewExpanded,
    isUploadingPd,
    pdConfidential,
    setConfidentialPersisted,
    isDragOver,
    pdFileInputRef,
    uploadPdFile,
    handlePdUpload,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    clearPd,
  };
}
