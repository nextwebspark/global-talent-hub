import { motion } from 'framer-motion';
import { Sparkles, FileText, Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { BRIEF_ACCEPT, type BriefUploadHook } from '../hooks/useBriefUpload';
import type { BriefModeHook } from '../hooks/useBriefMode';

export function BriefPanel({ upload, brief }: { upload: BriefUploadHook; brief: BriefModeHook }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="w-full"
      data-testid="brief-panel"
    >
      <div className="bg-muted/40 border border-border rounded-2xl p-5">
        <div className="flex items-start gap-2.5 bg-card border border-border/60 rounded-xl px-3.5 py-3 mb-4">
          <Sparkles className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            AI will read your documents and automatically suggest the most relevant sectors and a starting company universe. You'll review and approve everything on the next screen before any execution begins.
          </p>
        </div>

        <div
          onClick={() => brief.briefFileInputRef.current?.click()}
          onDragOver={brief.handleBriefDragOver}
          onDragLeave={brief.handleBriefDragLeave}
          onDrop={brief.handleBriefDrop}
          className={`border-2 border-dashed rounded-xl px-5 py-7 text-center cursor-pointer transition-colors mb-3 ${
            brief.isBriefDragOver ? 'border-primary/60 bg-primary/5' : 'border-border/70 hover:border-primary/40 bg-card'
          }`}
          data-testid="dropzone-brief-upload"
        >
          {upload.isUploading ? (
            <Loader2 className="w-7 h-7 mx-auto mb-2 text-muted-foreground animate-spin" />
          ) : (
            <FileText className="w-7 h-7 mx-auto mb-2 text-muted-foreground/70" />
          )}
          {upload.fileName ? (
            <>
              <span className="block text-sm font-semibold text-foreground mb-0.5">{upload.fileName}</span>
              <span className="text-xs text-muted-foreground">Loaded — click to replace</span>
            </>
          ) : (
            <>
              <span className="block text-sm font-semibold text-foreground mb-0.5">Upload job description or company brief</span>
              <span className="text-xs text-muted-foreground">Drag and drop, or click to browse</span>
              <div className="text-[11px] text-muted-foreground/60 mt-1.5">PDF · DOCX · TXT</div>
            </>
          )}
          <input
            ref={brief.briefFileInputRef}
            type="file"
            accept={BRIEF_ACCEPT}
            onChange={brief.handleBriefFileSelect}
            className="hidden"
            data-testid="input-brief-file"
          />
        </div>

        {/* Post-upload: preview of extracted text + confidential toggle (brief flow only). */}
        {upload.fileName && (
          <div className="space-y-1.5 mb-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-primary/5 rounded-lg px-3 py-2">
              <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="flex-1">Context loaded from <strong>{upload.fileName}</strong></span>
              <button
                type="button"
                onClick={() => upload.setPreviewExpanded(!upload.previewExpanded)}
                className="text-primary hover:underline"
                data-testid="button-toggle-brief-preview"
              >
                {upload.previewExpanded ? 'Hide' : 'Preview'}
              </button>
            </div>
            {upload.previewExpanded && upload.extractedPreview && (
              <div className="bg-muted/40 rounded-lg px-3 py-2 max-h-32 overflow-y-auto" data-testid="brief-extracted-preview">
                <p className="text-[10px] text-muted-foreground leading-relaxed whitespace-pre-wrap">{upload.extractedPreview}…</p>
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={upload.isConfidential}
                onChange={e => upload.setConfidential(e.target.checked)}
                className="w-3 h-3 rounded"
                data-testid="checkbox-brief-confidential"
              />
              <span className="text-[11px] text-muted-foreground">Mark as confidential — AI will summarise key criteria only</span>
            </label>
          </div>
        )}

        <div className="flex items-center gap-2.5 mb-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[11px] text-muted-foreground/70">or paste below</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <Textarea
          value={brief.briefText}
          onChange={e => brief.setBriefText(e.target.value)}
          placeholder="Paste a role description, company overview, or any context that describes what you're hiring for…"
          className="min-h-[100px] text-sm bg-card resize-none"
          data-testid="input-brief-text"
        />

        <div className="flex items-center justify-between pt-4">
          <p className="text-[11px] text-muted-foreground">Sectors and companies will be inferred automatically</p>
          <Button
            onClick={brief.handleAnalyseBrief}
            disabled={upload.isUploading || (!upload.fileName && !brief.briefText.trim())}
            data-testid="button-analyse-brief"
            className="gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Analyse brief
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
