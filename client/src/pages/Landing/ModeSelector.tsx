import { motion } from 'framer-motion';
import { Search, Upload, FileText } from 'lucide-react';
import type { LandingMode } from './types';

function ModeCard({ selected, onClick, icon, title, desc, testId }: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-pressed={selected}
      className={`text-left p-4 rounded-2xl border bg-card transition-all hover:border-primary/40 ${
        selected ? 'border-2 border-foreground shadow-sm' : 'border-border'
      }`}
    >
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${
          selected ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
        }`}
      >
        {icon}
      </div>
      <div className="text-sm font-semibold text-foreground mb-1">{title}</div>
      <div className="text-xs text-muted-foreground leading-snug">{desc}</div>
    </button>
  );
}

export function ModeSelector({ mode, onSelectMode }: {
  mode: LandingMode;
  onSelectMode: (m: LandingMode) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-7 w-full"
      data-testid="mode-selector"
    >
      <ModeCard
        selected={mode === 'search'}
        onClick={() => onSelectMode('search')}
        icon={<Search className="w-5 h-5" />}
        title="Search"
        desc="Describe what you're looking for. AI builds the company list."
        testId="tab-search"
      />
      <ModeCard
        selected={mode === 'import'}
        onClick={() => onSelectMode('import')}
        icon={<Upload className="w-5 h-5" />}
        title="Import a list"
        desc="Upload an existing company list. Extend it from there."
        testId="tab-import"
      />
      <ModeCard
        selected={mode === 'brief'}
        onClick={() => onSelectMode('brief')}
        icon={<FileText className="w-5 h-5" />}
        title="From brief"
        desc="Upload a JD or brief. AI infers the sectors and companies."
        testId="tab-brief"
      />
    </motion.div>
  );
}
