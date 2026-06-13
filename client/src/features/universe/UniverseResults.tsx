import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Plus, Upload, Lock, Loader2, Search, Square, X, Save, Check, PencilLine, Menu, ListFilter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import type { StreamCompany } from '@/lib/store';
import type { ActivityEvent, InferredIntent } from '@shared/schema';

// Match score in StreamCompany is a 0-100 percentage. Legacy drafts may carry a
// 0-1 value; tolerate both.
function confidencePct(score: number): number {
  return Math.round(score <= 1 ? score * 100 : score);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function revenueBand(company: StreamCompany): string {
  if (!company.revenue) return '—';
  const n = Number(company.revenue);
  if (!Number.isFinite(n)) return company.revenue; // already a label
  if (n >= 5e9)  return '>$5B';
  if (n >= 1e9)  return '$1B–5B';
  if (n >= 5e8)  return '$500M–1B';
  if (n >= 1e8)  return '$100M–500M';
  if (n >= 1e7)  return '$10M–100M';
  return '<$10M';
}

function employeeBand(employees: number | null): string {
  if (employees == null) return '—';
  if (employees >= 50000) return '>50K';
  if (employees >= 10000) return '10K–50K';
  if (employees >= 5000)  return '5K–10K';
  if (employees >= 1000)  return '1K–5K';
  if (employees >= 250)   return '250–1K';
  return '<250';
}

const GRID_COLS = '32px minmax(140px,200px) 120px 90px 90px 90px 56px 44px';

type RelevanceFilter = 'all' | 'direct';

export function UniverseResults({
  intent, companies, pendingCompanyNames,
  activities,
  isStreaming,
  query,
  acceptedCount, directCount, adjacentCount,
  isSavingProject,
  draftSaved, resume,
  onStopSearch, onResetSearch,
  onAcceptCompany, onRejectCompany,
  onAddCompany,
  onSaveDraft, onSaveProject, onGoToDashboard,
  onMobileNav,
}: {
  intent: InferredIntent | null;
  companies: StreamCompany[];
  pendingCompanyNames: string[];
  activities: ActivityEvent[];
  isStreaming: boolean;
  query: string;
  acceptedCount: number;
  directCount: number;
  adjacentCount: number;
  isSavingProject: boolean;
  draftSaved: boolean;
  resume?: boolean;
  onStopSearch: () => void;
  onResetSearch: () => void;
  onAcceptCompany: (id: number) => void;
  onRejectCompany: (id: number) => void;
  onAddCompany: (company: { name: string; sector: string; revenueBand: string; employeeBand: string }) => void;
  onSaveDraft: () => void;
  onSaveProject: () => void;
  onGoToDashboard: () => void;
  onMobileNav?: () => void;
}) {
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);
  const [relevanceFilter, setRelevanceFilter] = useState<RelevanceFilter>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [mobileSectorsOpen, setMobileSectorsOpen] = useState(false);
  const isMobile = useIsMobile();

  // Derive no-results reason from activities
  const noResultsReason = useMemo(() => {
    const ev = [...activities].reverse().find((a) => a.type === 'no_results');
    return (ev?.data?.noResultsReason as string | undefined) ?? null;
  }, [activities]);

  // Thinking lines for the AI panel
  const thinkingLines = useMemo(() => {
    return activities
      .filter((a) =>
        a.type === 'status' ||
        a.type === 'intent_extracted' ||
        a.type === 'adjacent_sector_found' ||
        a.type === 'search_complete' ||
        a.type === 'no_results',
      )
      .map((a) => {
        let text = a.message;
        if (a.type === 'intent_extracted' && typeof (a.data as any)?.intent?.searchRationale === 'string') {
          text = (a.data as any).intent.searchRationale as string;
        } else if (a.type === 'adjacent_sector_found' && Array.isArray((a.data as any)?.adjacentSectors)) {
          text = `Found ${((a.data as any).adjacentSectors as string[]).length} adjacent sectors`;
        }
        return { id: a.id, text };
      });
  }, [activities]);


  // non-rejected used for sidebar counts + "X found" badge
  const nonRejected = useMemo(() => companies.filter((c) => !c.rejected), [companies]);

  // Sector groups for the sidebar, split into Direct vs Adjacent buckets.
  const sectorGroups = useMemo(() => {
    const direct = new Map<string, number>();
    const adjacent = new Map<string, number>();
    for (const c of nonRejected) {
      const bucket = c.relevanceType === 'Direct' ? direct : adjacent;
      const key = c.sector || 'Unknown';
      bucket.set(key, (bucket.get(key) ?? 0) + 1);
    }
    return {
      direct: [...direct.entries()].sort((a, b) => b[1] - a[1]),
      adjacent: [...adjacent.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [nonRejected]);

  // rows = ALL companies (including rejected, shown dimmed); filter by sector/relevance
  const rows = useMemo(() => {
    return companies.filter((c) => {
      if (sectorFilter && (c.sector || 'Unknown') !== sectorFilter) return false;
      if (relevanceFilter === 'direct' && c.relevanceType !== 'Direct') return false;
      return true;
    });
  }, [companies, sectorFilter, relevanceFilter]);

  const adjacentSuggestions = intent?.adjacentSectors ?? [];

  // Pick a sector and (on mobile) close the drawer afterwards.
  const pickSector = (s: string | null) => {
    setSectorFilter(s);
    setMobileSectorsOpen(false);
  };

  // Sector sidebar body — Region A (AI thinking) + Region B (sector list).
  // Shared between the inline desktop sidebar and the mobile Sheet.
  const sectorBody = (
    <>
      {/* Region A: AI thinking panel */}
      <div className="shrink-0 border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-1.5 mb-1.5">
          {isStreaming
            ? <Loader2 className="w-3 h-3 animate-spin text-violet-600 dark:text-violet-400" />
            : <Sparkles className="w-3 h-3 text-violet-600 dark:text-violet-400" />}
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {isStreaming ? 'AI thinking' : 'AI rationale'}
          </span>
        </div>
        {isStreaming ? (
          <div className="space-y-0.5">
            {thinkingLines.slice(-4).map((line) => (
              <p key={line.id} className="text-[11px] text-muted-foreground leading-snug truncate">{line.text}</p>
            ))}
            {thinkingLines.length === 0 && (
              <div className="flex gap-1 items-center">
                <span className="w-1 h-1 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground leading-snug">
            {noResultsReason ?? intent?.searchRationale ?? 'Search complete.'}
          </p>
        )}
      </div>

      {/* Region B: sectors or no-results message (scrollable) */}
      <div className="flex-1 overflow-y-auto py-3">
        {noResultsReason && companies.length === 0 && !isStreaming ? (
          <div className="px-4 py-6 text-center">
            <Search className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
            <p className="text-xs text-muted-foreground leading-relaxed">{noResultsReason}</p>
          </div>
        ) : (
          <>
            <button
              onClick={() => pickSector(null)}
              className={`w-full flex items-center justify-between px-4 py-1.5 text-xs ${sectorFilter === null ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:bg-muted/50'}`}
            >
              All <span className="text-[11px] bg-muted px-1.5 rounded-full">{nonRejected.length}</span>
            </button>

            {isStreaming && sectorGroups.direct.length === 0 && sectorGroups.adjacent.length === 0 && (
              <div className="px-4 space-y-2 pt-3">
                {[60, 80, 50, 70].map((w, i) => (
                  <div key={i} className="flex justify-between animate-pulse">
                    <div className="h-2.5 bg-muted rounded" style={{ width: `${w}%` }} />
                    <div className="h-2.5 bg-muted rounded w-6" />
                  </div>
                ))}
              </div>
            )}

            {sectorGroups.direct.length > 0 && (
              <p className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/60 px-4 pt-3 pb-1">Direct</p>
            )}
            {sectorGroups.direct.map(([sector, count]) => (
              <button
                key={`d-${sector}`}
                onClick={() => pickSector(sector)}
                className={`w-full flex items-center justify-between gap-2 px-4 py-1.5 text-xs text-left ${sectorFilter === sector ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:bg-muted/50'}`}
              >
                <span className="truncate">{sector}</span>
                <span className="text-[11px] bg-muted px-1.5 rounded-full shrink-0">{count}</span>
              </button>
            ))}

            {sectorGroups.adjacent.length > 0 && (
              <p className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/60 px-4 pt-3 pb-1">Adjacent</p>
            )}
            {sectorGroups.adjacent.map(([sector, count]) => (
              <button
                key={`a-${sector}`}
                onClick={() => pickSector(sector)}
                className={`w-full flex items-center justify-between gap-2 px-4 py-1.5 text-xs text-left ${sectorFilter === sector ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 font-medium' : 'text-blue-600/80 dark:text-blue-400/80 hover:bg-blue-50/50 dark:hover:bg-blue-950/20'}`}
              >
                <span className="truncate">{sector}</span>
                <span className="text-[11px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1.5 rounded-full shrink-0">{count}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </>
  );

  // Mobile card renderer for a single company row.
  const companyCard = (c: StreamCompany) => (
    <div
      key={c.id}
      className={`border-b border-border/50 px-4 py-3 ${c.rejected ? 'opacity-40' : ''}`}
      data-testid={`universe-row-${c.id}`}
    >
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-md bg-muted border border-border flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
          {initials(c.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground leading-tight">{c.name}</p>
          {c.country && <p className="text-[11px] text-muted-foreground leading-tight">{c.geography || c.country}</p>}
        </div>
        <button
          onClick={() => (c.accepted ? onRejectCompany(c.id) : onAcceptCompany(c.id))}
          className={`relative w-9 h-5 rounded-full transition-colors shrink-0 mt-0.5 ${c.accepted ? 'bg-foreground' : 'bg-muted-foreground/30'}`}
          title={c.accepted ? 'Included — tap to exclude' : 'Excluded — tap to include'}
          data-testid={`universe-toggle-${c.id}`}
        >
          <span className={`absolute top-[3px] w-3.5 h-3.5 rounded-full bg-background transition-all ${c.accepted ? 'left-[19px]' : 'left-[3px]'}`} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2.5 pl-[42px]">
        <div className="flex justify-between gap-2"><span className="text-[10px] text-muted-foreground/70">Sector</span><span className="text-[11px] text-foreground truncate">{c.sector || '—'}</span></div>
        <div className="flex justify-between gap-2"><span className="text-[10px] text-muted-foreground/70">Revenue</span><span className="text-[11px] text-foreground tabular-nums">{revenueBand(c)}</span></div>
        <div className="flex justify-between gap-2"><span className="text-[10px] text-muted-foreground/70">Employees</span><span className="text-[11px] text-foreground tabular-nums">{employeeBand(c.employees)}</span></div>
        <div className="flex justify-between gap-2"><span className="text-[10px] text-muted-foreground/70">Confidence</span><span className="text-[11px] text-foreground tabular-nums">{confidencePct(c.confidenceScore)}%</span></div>
      </div>
      <div className="pl-[42px] mt-2">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
          c.relevanceType === 'Direct'
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
            : c.relevanceType === 'Adjacent'
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
        }`}>
          {c.relevanceType}
        </span>
      </div>
    </div>
  );

  return (
    <motion.div
      key="universe"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 flex flex-col overflow-hidden"
    >
      {/* Topbar */}
      <div className="h-12 shrink-0 border-b border-border bg-background flex items-center px-3 sm:px-4 gap-2 sm:gap-3 z-10">
        <button
          onClick={onMobileNav}
          className="md:hidden p-2 -ml-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
          aria-label="Open navigation"
          data-testid="universe-hamburger"
        >
          <Menu className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-foreground shrink-0">Company universe</span>
        <span className="hidden sm:inline text-xs text-muted-foreground truncate max-w-[160px] md:max-w-[280px]">{query}</span>
        {isStreaming ? (
          <span className="flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900 px-2.5 py-1 rounded-full">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            Discovering · {nonRejected.length} found
          </span>
        ) : resume ? (
          <span className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-900 px-2.5 py-1 rounded-full">
            <PencilLine className="w-3 h-3" />Draft resumed · {nonRejected.length} found
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">{nonRejected.length} found</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {isStreaming && (
            <Button variant="destructive" size="sm" onClick={onStopSearch} className="h-7 px-2.5 gap-1 text-xs" data-testid="button-stop-search">
              <Square className="w-3 h-3 fill-current" />Stop
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowAddModal(true)} className="h-7 gap-1.5 text-xs px-2 sm:px-3" data-testid="button-add-company">
            <Plus className="w-3 h-3" /><span className="hidden sm:inline">Add company</span>
          </Button>
          {!isStreaming && (
            <Button variant="outline" size="sm" onClick={onSaveDraft} className="hidden sm:inline-flex h-7 gap-1.5 text-xs" title="Save your progress without confirming" data-testid="button-save-draft">
              {draftSaved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}{draftSaved ? 'Saved' : 'Save draft'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onResetSearch} className="h-7 gap-1.5 text-xs px-2 sm:px-3" data-testid="button-new-search">
            <Search className="w-3 h-3 sm:hidden" /><span className="hidden sm:inline">New search</span>
          </Button>
          {!isStreaming && companies.length > 0 && (
            <Button variant="outline" size="sm" onClick={onGoToDashboard} disabled={isSavingProject} className="hidden sm:inline-flex h-7 gap-1.5 text-xs" data-testid="button-go-dashboard">
              <Upload className="w-3 h-3" />Dashboard
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sector sidebar — inline on desktop, mobile Sheet below */}
        <div className="w-72 shrink-0 border-r border-border bg-muted/10 flex-col hidden md:flex">
          {sectorBody}
        </div>

        {/* Mobile sector drawer */}
        <Sheet open={mobileSectorsOpen} onOpenChange={setMobileSectorsOpen}>
          <SheetContent side="left" className="w-72 p-0 md:hidden">
            <SheetTitle className="sr-only">Sectors</SheetTitle>
            <div className="h-full flex flex-col pt-6">
              {sectorBody}
            </div>
          </SheetContent>
        </Sheet>

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Filter bar */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border flex-wrap">
            <button
              onClick={() => setMobileSectorsOpen(true)}
              className="md:hidden flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-border/60 text-muted-foreground hover:bg-muted/40"
              data-testid="universe-sectors-trigger"
            >
              <ListFilter className="w-3 h-3" />Sectors
            </button>
            <span className="text-[11px] text-muted-foreground">Filter:</span>
            <button
              onClick={() => setRelevanceFilter('all')}
              className={`text-[11px] px-2.5 py-1 rounded-full border ${relevanceFilter === 'all' ? 'bg-muted border-border text-foreground' : 'border-border/60 text-muted-foreground hover:bg-muted/40'}`}
            >
              All companies
            </button>
            <button
              onClick={() => setRelevanceFilter('direct')}
              className={`text-[11px] px-2.5 py-1 rounded-full border ${relevanceFilter === 'direct' ? 'bg-muted border-border text-foreground' : 'border-border/60 text-muted-foreground hover:bg-muted/40'}`}
            >
              Direct only
            </button>
            {sectorFilter && (
              <button
                onClick={() => setSectorFilter(null)}
                className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-muted text-foreground"
              >
                {sectorFilter} ✕
              </button>
            )}
          </div>

          {/* Adjacent-sector banner */}
          {adjacentSuggestions.length > 0 && (
            <div className="flex items-center gap-2.5 px-4 py-2.5 bg-violet-50 dark:bg-violet-950/30 border-b border-violet-200/70 dark:border-violet-900/50">
              <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0" />
              <span className="text-xs font-medium text-violet-700 dark:text-violet-300 flex-1">
                AI suggests {adjacentSuggestions.length} adjacent sector{adjacentSuggestions.length > 1 ? 's' : ''} with similar talent dynamics
              </span>
              <div className="flex gap-1.5 flex-wrap">
                {adjacentSuggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSectorFilter(s)}
                    className="text-[11px] text-violet-700 dark:text-violet-300 bg-violet-100/70 dark:bg-violet-900/40 border border-violet-200 dark:border-violet-800 px-2.5 py-0.5 rounded-full hover:bg-violet-200/70 dark:hover:bg-violet-900/60"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Column header — desktop only */}
          <div className="hidden md:grid items-center px-4 py-1.5 border-b border-border bg-muted/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70"
               style={{ gridTemplateColumns: GRID_COLS }}>
            <span />
            <span>Company</span>
            <span>Sector</span>
            <span>Revenue</span>
            <span>Employees</span>
            <span>Relevance</span>
            <span className="text-right">Conf.</span>
            <span />
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto" data-testid="universe-table">
            {rows.map((c) => isMobile ? companyCard(c) : (
              <div
                key={c.id}
                className={`grid items-center px-4 py-2.5 border-b border-border/50 hover:bg-muted/30 transition-opacity ${c.rejected ? 'opacity-40' : ''}`}
                style={{ gridTemplateColumns: GRID_COLS }}
                data-testid={`universe-row-${c.id}`}
              >
                <div className="w-7 h-7 rounded-md bg-muted border border-border flex items-center justify-center text-[9px] font-bold text-muted-foreground">
                  {initials(c.name)}
                </div>
                <div className="min-w-0 pr-2">
                  <p className="text-[12px] font-semibold text-foreground truncate leading-tight">{c.name}</p>
                  {c.country && <p className="text-[10px] text-muted-foreground truncate leading-tight">{c.geography || c.country}</p>}
                </div>
                <span className="text-[11px] text-muted-foreground truncate pr-2">{c.sector || '—'}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">{revenueBand(c)}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">{employeeBand(c.employees)}</span>
                <span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                    c.relevanceType === 'Direct'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                      : c.relevanceType === 'Adjacent'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                  }`}>
                    {c.relevanceType}
                  </span>
                </span>
                <div className="flex items-center gap-1.5 justify-end">
                  <div className="w-7 h-[3px] rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-muted-foreground/60 rounded-full" style={{ width: `${confidencePct(c.confidenceScore)}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums w-7 text-right">{confidencePct(c.confidenceScore)}%</span>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => (c.accepted ? onRejectCompany(c.id) : onAcceptCompany(c.id))}
                    className={`relative w-8 h-[18px] rounded-full transition-colors ${c.accepted ? 'bg-foreground' : 'bg-muted-foreground/30'}`}
                    title={c.accepted ? 'Included — click to exclude' : 'Excluded — click to include'}
                    data-testid={`universe-toggle-${c.id}`}
                  >
                    <span className={`absolute top-[3px] w-3 h-3 rounded-full bg-background transition-all ${c.accepted ? 'left-[17px]' : 'left-[3px]'}`} />
                  </button>
                </div>
              </div>
            ))}

            {/* Pending skeletons while streaming */}
            {pendingCompanyNames.map((name) => isMobile ? (
              <div key={`pending-${name}`} className="flex items-center gap-2.5 px-4 py-3 border-b border-border/50 animate-pulse">
                <div className="w-8 h-8 rounded-md bg-muted shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted-foreground truncate">{name}</p>
                  <p className="text-[11px] text-muted-foreground/40">Classifying…</p>
                </div>
              </div>
            ) : (
              <div key={`pending-${name}`} className="grid items-center px-4 py-2.5 border-b border-border/50 animate-pulse"
                   style={{ gridTemplateColumns: GRID_COLS }}>
                <div className="w-7 h-7 rounded-md bg-muted" />
                <div className="min-w-0 pr-2"><p className="text-[12px] text-muted-foreground truncate">{name}</p></div>
                <span className="text-[11px] text-muted-foreground/40">Classifying…</span>
                <span /><span /><span /><span /><span />
              </div>
            ))}

            {/* Skeleton rows when streaming with no data yet */}
            {rows.length === 0 && pendingCompanyNames.length === 0 && isStreaming && (
              Array.from({ length: 8 }).map((_, i) => isMobile ? (
                <div key={`skel-${i}`} className="flex items-center gap-2.5 px-4 py-3 border-b border-border/50 animate-pulse">
                  <div className="w-8 h-8 rounded-md bg-muted shrink-0" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="h-3 bg-muted rounded w-3/4" />
                    <div className="h-2.5 bg-muted rounded w-1/2" />
                  </div>
                  <div className="w-9 h-5 rounded-full bg-muted shrink-0" />
                </div>
              ) : (
                <div key={`skel-${i}`}
                     className="grid items-center px-4 py-2.5 border-b border-border/50 animate-pulse"
                     style={{ gridTemplateColumns: GRID_COLS }}>
                  <div className="w-7 h-7 rounded-md bg-muted" />
                  <div className="h-3 bg-muted rounded w-3/4" />
                  <div className="h-2.5 bg-muted rounded w-2/3" />
                  <div className="h-2.5 bg-muted rounded w-1/2" />
                  <div className="h-2.5 bg-muted rounded w-1/2" />
                  <div className="h-4 bg-muted rounded-full w-14" />
                  <div className="h-2 bg-muted rounded w-8 ml-auto" />
                  <div className="w-8 h-[18px] rounded-full bg-muted" />
                </div>
              ))
            )}

            {rows.length === 0 && pendingCompanyNames.length === 0 && !isStreaming && !noResultsReason && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <Search className="w-5 h-5" />
                <p className="text-xs">No companies match the current filters</p>
              </div>
            )}

            {rows.length === 0 && pendingCompanyNames.length === 0 && !isStreaming && noResultsReason && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <Search className="w-5 h-5" />
                <p className="text-xs text-center max-w-xs">{noResultsReason}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-border bg-background flex items-center justify-between gap-2 px-3 sm:px-4 py-3">
            <div className="flex gap-4 sm:gap-6 overflow-x-auto">
              <div>
                <p className="text-lg font-semibold text-foreground leading-none">{acceptedCount}</p>
                <p className="text-[10px] text-muted-foreground">selected</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-muted-foreground/40 leading-none">{nonRejected.length - acceptedCount}</p>
                <p className="text-[10px] text-muted-foreground">not selected</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-blue-600 dark:text-blue-400 leading-none">{adjacentCount}</p>
                <p className="text-[10px] text-muted-foreground">adjacent</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400 leading-none">{directCount}</p>
                <p className="text-[10px] text-muted-foreground">direct</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <Button
                variant="outline"
                onClick={onSaveDraft}
                disabled={isStreaming}
                className="hidden sm:inline-flex h-9 gap-2"
                title="Save your progress without confirming — resume it later from Projects"
                data-testid="button-save-draft-footer"
              >
                {draftSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {draftSaved ? 'Draft saved' : 'Save draft'}
              </Button>
              <Button
                onClick={onSaveProject}
                disabled={isSavingProject || isStreaming || acceptedCount === 0}
                title={isStreaming ? 'Still discovering companies…' : acceptedCount === 0 ? 'Select at least one company to confirm' : undefined}
                className="h-9 gap-2 font-semibold px-3 sm:px-4"
                data-testid="button-confirm-universe"
              >
                {isStreaming || isSavingProject ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                <span className="sm:hidden">{isStreaming ? 'Discovering…' : `Confirm (${acceptedCount})`}</span>
                <span className="hidden sm:inline">{isStreaming ? 'Discovering…' : `Confirm universe (${acceptedCount})`}</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
      {showAddModal && (
        <AddCompanyModal
          onClose={() => setShowAddModal(false)}
          onAdd={(company) => { onAddCompany(company); setShowAddModal(false); }}
        />
      )}
    </motion.div>
  );
}

const REVENUE_BANDS = ['<$10M', '$10M–100M', '$100M–500M', '$500M–1B', '$1B–5B', '>$5B'];
const EMPLOYEE_BANDS = ['<250', '250–1K', '1K–5K', '5K–10K', '10K–50K', '>50K'];

function AddCompanyModal({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (company: { name: string; sector: string; revenueBand: string; employeeBand: string }) => void;
}) {
  const [name, setName] = useState('');
  const [sector, setSector] = useState('');
  const [rev, setRev] = useState('');
  const [emp, setEmp] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-background border border-border rounded-xl shadow-xl w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold">Add company</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Company name <span className="text-red-500">*</span></label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Corp"
              className="w-full text-sm bg-muted/40 border border-border rounded-md px-3 py-2 outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Sector <span className="text-muted-foreground/50">(optional)</span></label>
            <input
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              placeholder="e.g. FMCG"
              className="w-full text-sm bg-muted/40 border border-border rounded-md px-3 py-2 outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Revenue <span className="text-muted-foreground/50">(optional)</span></label>
              <select
                value={rev}
                onChange={(e) => setRev(e.target.value)}
                className="w-full text-sm bg-muted/40 border border-border rounded-md px-2 py-2 outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">—</option>
                {REVENUE_BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Employees <span className="text-muted-foreground/50">(optional)</span></label>
              <select
                value={emp}
                onChange={(e) => setEmp(e.target.value)}
                className="w-full text-sm bg-muted/40 border border-border rounded-md px-2 py-2 outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">—</option>
                {EMPLOYEE_BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">Cancel</Button>
          <Button
            size="sm"
            disabled={!name.trim()}
            className="h-8 text-xs"
            onClick={() => name.trim() && onAdd({ name: name.trim(), sector, revenueBand: rev, employeeBand: emp })}
          >
            Add company
          </Button>
        </div>
      </div>
    </div>
  );
}
