import { AnimatePresence } from 'framer-motion';
import { Building2, Sparkles } from 'lucide-react';
import { CompanyRow } from './CompanyRow';
import { SkeletonCompanyRow } from './SkeletonCompanyRow';
import type { StreamCompany } from '@/lib/useSearchStream';

export type CompanyTab = 'all' | 'direct' | 'adjacent';

export function CompanyList({
  filteredCompanies,
  pendingCompanyNames,
  activeTab,
  isStreaming,
  onAccept,
  onReject,
}: {
  filteredCompanies: StreamCompany[];
  pendingCompanyNames: string[];
  activeTab: CompanyTab;
  isStreaming: boolean;
  onAccept: (id: number) => void;
  onReject: (id: number) => void;
}) {
  if (filteredCompanies.length === 0 && !isStreaming) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center">
        <Building2 className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">No companies found yet.</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Try refining your search in the activity panel.</p>
      </div>
    );
  }
  if (isStreaming && filteredCompanies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center">
        <div className="w-12 h-12 rounded-full border-2 border-primary/20 flex items-center justify-center mb-4">
          <Sparkles className="w-5 h-5 text-primary animate-pulse" />
        </div>
        <p className="text-sm text-muted-foreground">AI is discovering companies...</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Companies will appear here as they're classified</p>
      </div>
    );
  }

  const directCompanies = filteredCompanies.filter(c => c.relevanceType === 'Direct');
  const adjacentCompanies = filteredCompanies.filter(c => c.relevanceType === 'Adjacent');
  const inferredCompanies = filteredCompanies.filter(c => c.relevanceType === 'AI Inferred');
  const groups = [
    { label: 'Direct', companies: directCompanies, color: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Adjacent', companies: adjacentCompanies, color: 'text-amber-600 dark:text-amber-400' },
    { label: 'AI Inferred', companies: inferredCompanies, color: 'text-violet-600 dark:text-violet-400' },
  ].filter(g => g.companies.length > 0 || (activeTab !== 'all'));
  const showGroups = activeTab === 'all' && groups.filter(g => g.companies.length > 0).length > 1;

  return (
    <div className="divide-y divide-border/20">
      <AnimatePresence>
        {showGroups ? (
          groups.filter(g => g.companies.length > 0).map(group => (
            <div key={group.label}>
              <div className="px-4 py-1.5 bg-muted/30 border-b border-border/30 sticky top-0 z-10">
                <span className={`text-[11px] font-semibold uppercase tracking-wider ${group.color}`}>
                  {group.label} ({group.companies.length})
                </span>
              </div>
              {group.companies.map((company, i) => (
                <div key={company.id} className={i % 2 === 1 ? 'bg-muted/10' : ''}>
                  <CompanyRow
                    company={company}
                    onAccept={() => onAccept(company.id)}
                    onReject={() => onReject(company.id)}
                  />
                </div>
              ))}
            </div>
          ))
        ) : (
          filteredCompanies.map((company, i) => (
            <div key={company.id} className={i % 2 === 1 ? 'bg-muted/10' : ''}>
              <CompanyRow
                company={company}
                onAccept={() => onAccept(company.id)}
                onReject={() => onReject(company.id)}
              />
            </div>
          ))
        )}
      </AnimatePresence>
      {isStreaming && pendingCompanyNames.map(name => (
        <SkeletonCompanyRow key={`skeleton-${name}`} name={name} />
      ))}
    </div>
  );
}
