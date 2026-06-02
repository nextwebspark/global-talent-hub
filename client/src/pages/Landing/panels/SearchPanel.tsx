import { motion } from 'framer-motion';
import { Sparkles, FileText, X, Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { PdUploadHook } from '../hooks/usePdUpload';

const EXAMPLE_CHIPS = [
  'Top FMCG distributors in UAE',
  'Leading PE firms in Saudi Arabia',
  'Industrial equipment manufacturers in Egypt',
  'Retail chains across GCC',
];

export function SearchPanel({
  input,
  setInput,
  pd,
  onSubmit,
  inputRef,
}: {
  input: string;
  setInput: (v: string) => void;
  pd: PdUploadHook;
  onSubmit: (e: React.FormEvent) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="w-full"
    >
      <div className="relative bg-muted/40 border border-border rounded-2xl overflow-hidden" data-testid="search-panel">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border/40 bg-card/40">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/20">
            <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-xs font-medium text-primary">AI Intelligence</span>
          </div>
          <div className="flex-1" />
          {pd.pdFileName ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-2 py-1 rounded-lg">
              <FileText className="w-3 h-3 text-primary" />
              <span className="truncate max-w-[120px]">{pd.pdFileName}</span>
              <button type="button" onClick={pd.clearPd} className="text-muted-foreground hover:text-foreground" data-testid="button-clear-pd">
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => pd.pdFileInputRef.current?.click()}
                  disabled={pd.isUploadingPd}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted px-2.5 py-1.5 rounded-lg transition-colors"
                  data-testid="button-upload-pd"
                >
                  {pd.isUploadingPd ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                  Upload PD
                </button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Upload a Position Description (PDF, DOCX, or TXT)</TooltipContent>
            </Tooltip>
          )}
          <input ref={pd.pdFileInputRef} type="file" accept=".pdf,.docx,.txt" onChange={pd.handlePdUpload} className="hidden" data-testid="input-pd-file" />
        </div>

        <div
          className={`p-5 transition-colors ${pd.isDragOver ? 'bg-primary/5' : ''}`}
          onDragOver={pd.handleDragOver}
          onDragLeave={pd.handleDragLeave}
          onDrop={pd.handleDrop}
          data-testid="dropzone-pd-upload"
        >
          {pd.isDragOver && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/50 bg-primary/5 pointer-events-none">
              <div className="flex flex-col items-center gap-2 text-primary">
                <FileText className="w-8 h-8" />
                <span className="text-sm font-medium">Drop PD file here</span>
              </div>
            </div>
          )}
          {!input && !pd.pdFileName && (
            <div className="flex flex-wrap gap-1.5 mb-3" data-testid="example-prompt-chips">
              {EXAMPLE_CHIPS.map(chip => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setInput(chip)}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-border/60 bg-muted/40 hover:bg-muted hover:border-primary/30 text-muted-foreground hover:text-foreground transition-colors"
                  data-testid={`chip-example-${chip.slice(0, 20).replace(/\s+/g, '-').toLowerCase()}`}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}
          <Textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={"Describe the companies you're looking for…\n\ne.g. 'Top FMCG distributors in UAE' or 'Leading PE firms in Saudi Arabia'"}
            className="bg-card border border-border rounded-xl text-sm leading-relaxed resize-none min-h-[120px] placeholder:text-muted-foreground/50"
            data-testid="input-search-query"
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSubmit({ preventDefault: () => {} } as React.FormEvent); } }}
          />

          {pd.pdFileName && (
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-primary/5 rounded-lg px-3 py-2">
                <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="flex-1">Context loaded from <strong>{pd.pdFileName}</strong></span>
                <button
                  type="button"
                  onClick={() => pd.setPdPreviewExpanded(!pd.pdPreviewExpanded)}
                  className="text-primary hover:underline"
                  data-testid="button-toggle-pd-preview"
                >
                  {pd.pdPreviewExpanded ? 'Hide' : 'Preview'}
                </button>
              </div>
              {pd.pdPreviewExpanded && pd.pdExtractedPreview && (
                <div className="bg-muted/40 rounded-lg px-3 py-2 max-h-32 overflow-y-auto" data-testid="pd-extracted-preview">
                  <p className="text-[10px] text-muted-foreground leading-relaxed whitespace-pre-wrap">{pd.pdExtractedPreview}…</p>
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pd.pdConfidential}
                  onChange={e => pd.setConfidentialPersisted(e.target.checked)}
                  className="w-3 h-3 rounded"
                  data-testid="checkbox-pd-confidential"
                />
                <span className="text-[11px] text-muted-foreground">Mark as confidential — AI will summarise key criteria only</span>
              </label>
            </div>
          )}

          <div className="flex items-center justify-between pt-4">
            <p className="text-[11px] text-muted-foreground">
              <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">⌘Enter</kbd> to search
            </p>
            <Button
              onClick={onSubmit}
              disabled={!input.trim() && !pd.pdFileName}
              data-testid="button-submit-search"
              className="gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Discover Companies
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
