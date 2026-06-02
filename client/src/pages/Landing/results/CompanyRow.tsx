import { motion } from 'framer-motion';
import { Globe, Plus, X } from 'lucide-react';
import type { StreamCompany } from '@/lib/useSearchStream';

export function CompanyRow({ company, onAccept, onReject }: {
  company: StreamCompany;
  onAccept: () => void;
  onReject: () => void;
}) {
  const badgeColor = company.relevanceType === 'Direct'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
    : company.relevanceType === 'Adjacent'
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
    : 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400';

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={{ duration: 0.15 }}
      className={`flex items-center gap-3 px-4 h-14 transition-colors ${
        company.accepted
          ? 'bg-emerald-50/60 dark:bg-emerald-900/10'
          : company.rejected
          ? 'bg-muted/20 opacity-40'
          : 'hover:bg-muted/30'
      }`}
      data-testid={`card-company-${company.id}`}
    >
      <div className="flex-1 min-w-0 flex flex-col justify-center" style={{ minWidth: '140px', maxWidth: '220px' }}>
        <p className="font-semibold text-[13px] text-foreground truncate leading-tight" data-testid={`text-company-name-${company.id}`}>{company.name}</p>
        {company.sector && (
          <span className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">{company.sector}</span>
        )}
      </div>

      <div className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0 w-[100px]">
        {company.country && (
          <>
            <Globe className="w-3 h-3 shrink-0" />
            <span className="truncate">{company.country}</span>
          </>
        )}
      </div>

      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap ${badgeColor}`}>
        {company.relevanceType}
      </span>

      <span className="text-[11px] font-semibold text-foreground shrink-0 w-[40px] text-right tabular-nums">
        {company.confidenceScore}%
      </span>

      <p className="text-[10px] text-muted-foreground italic truncate hidden md:block flex-1 min-w-0 leading-tight" data-testid={`text-relevance-rationale-${company.id}`}>
        {company.relevanceRationale || ''}
      </p>

      {!company.rejected && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onAccept}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              company.accepted
                ? 'bg-emerald-500 text-white'
                : 'bg-muted/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-700 text-muted-foreground'
            }`}
            data-testid={`button-accept-company-${company.id}`}
          >
            <Plus className="w-3 h-3" />
            <span className="hidden sm:inline">{company.accepted ? 'Added' : 'Add'}</span>
          </button>
          {!company.accepted && (
            <button
              onClick={onReject}
              className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
              data-testid={`button-reject-company-${company.id}`}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}
