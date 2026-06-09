import { motion } from 'framer-motion';
import { Sparkles, Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

const EXAMPLE_CHIPS = [
  'Top FMCG distributors in UAE',
  'Leading PE firms in Saudi Arabia',
  'Industrial equipment manufacturers in Egypt',
  'Retail chains across GCC',
];

export function SearchPanel({
  input,
  setInput,
  onSubmit,
  inputRef,
  isSearching = false,
}: {
  input: string;
  setInput: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  isSearching?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="w-full"
    >
      <div className="relative bg-muted/40 border border-border rounded-2xl overflow-hidden" data-testid="search-panel">
        <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-border/40 bg-card/40">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/20">
            <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-xs font-medium text-primary">AI Intelligence</span>
          </div>
          <div className="flex-1" />
        </div>

        <div className="p-4 sm:p-5">
          {!input && (
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
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !isSearching && input.trim()) { e.preventDefault(); onSubmit({ preventDefault: () => {} } as React.FormEvent); } }}
          />

          <div className="flex items-center justify-between pt-4">
            <p className="text-[11px] text-muted-foreground">
              <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">⌘Enter</kbd> to search
            </p>
            <Button
              onClick={onSubmit}
              disabled={!input.trim() || isSearching}
              data-testid="button-submit-search"
              className="gap-2 cursor-pointer"
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Discovering…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Discover Companies
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
