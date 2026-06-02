import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Sparkles, Loader2, SendHorizonal } from 'lucide-react';
import { ActivityIcon } from './ActivityIcon';
import { IntentBadges } from './IntentBadges';
import type { ActivityEvent, InferredIntent } from '@shared/schema';

export function ActivityFeed({
  intent,
  activities,
  isStreaming,
  isRefining,
  refinementInput,
  setRefinementInput,
  debouncedRefinement,
  setDebouncedRefinement,
  onSubmitRefinement,
  refinementDebounceRef,
  activityFeedRef,
}: {
  intent: InferredIntent | null;
  activities: ActivityEvent[];
  isStreaming: boolean;
  isRefining: boolean;
  refinementInput: string;
  setRefinementInput: (v: string) => void;
  debouncedRefinement: string;
  setDebouncedRefinement: (v: string) => void;
  onSubmitRefinement: () => void;
  refinementDebounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  activityFeedRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      <div className="px-4 py-3 border-b border-border/50">
        <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-primary" />Activity Feed
        </p>
      </div>

      {intent && (
        <div className="px-3 py-3 border-b border-border/40 bg-primary/5">
          <p className="text-[11px] font-semibold text-foreground mb-1.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-primary" />Extracted Intent
            {intent.confidenceScore != null && (
              <span className="ml-auto text-[10px] font-normal text-primary/80" data-testid="text-intent-confidence">
                {intent.confidenceScore <= 1
                  ? Math.round(intent.confidenceScore * 100)
                  : Math.round(intent.confidenceScore)}% confident
              </span>
            )}
          </p>
          <IntentBadges intent={intent} />
          {intent.searchRationale && (
            <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">{intent.searchRationale}</p>
          )}
        </div>
      )}

      <div ref={activityFeedRef} className="flex-1 overflow-y-auto p-3 space-y-1.5" data-testid="activity-feed">
        <AnimatePresence initial={false}>
          {activities.map(item => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-start gap-2"
              data-testid={`activity-item-${item.type}`}
            >
              <div className="mt-0.5 shrink-0"><ActivityIcon type={item.type} /></div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{item.message}</p>
            </motion.div>
          ))}
        </AnimatePresence>
        {isStreaming && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
            <Loader2 className="w-3 h-3 animate-spin" />Searching...
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border/50" data-testid="refinement-panel">
        <p className="text-[10px] text-muted-foreground mb-1.5 font-medium">
          {isStreaming ? 'Queue a refinement...' : 'Refine your search'}
        </p>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={refinementInput}
            onChange={e => {
              const val = e.target.value;
              setRefinementInput(val);
              if (refinementDebounceRef.current) clearTimeout(refinementDebounceRef.current);
              refinementDebounceRef.current = setTimeout(() => setDebouncedRefinement(val), 300);
            }}
            onKeyDown={e => { if (e.key === 'Enter') onSubmitRefinement(); }}
            placeholder="e.g. only show UAE companies..."
            className="flex-1 bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/50"
            data-testid="input-refinement"
            disabled={isRefining}
          />
          <button
            onClick={onSubmitRefinement}
            disabled={isRefining || !debouncedRefinement.trim()}
            className="px-2 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            data-testid="button-submit-refinement"
          >
            {isRefining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SendHorizonal className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </>
  );
}
