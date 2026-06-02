import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Plus, Upload, Lock, Loader2, Search, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StreamCompany } from '@/lib/useSearchStream';
import type { InferredIntent } from '@shared/schema';

// Confidence in StreamCompany is 0-1; display as a whole percent.
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

export function UniverseView({
  intent, companies, pendingCompanyNames,
  isStreaming, query,
  acceptedCount, directCount, adjacentCount,
  isSavingProject,
  onStopSearch, onResetSearch,
  onAcceptCompany, onRejectCompany,
  onAddCompany,
  onSaveProject, onGoToDashboard,
}: {
  intent: InferredIntent | null;
  companies: StreamCompany[];
  pendingCompanyNames: string[];
  isStreaming: boolean;
  query: string;
  acceptedCount: number;
  directCount: number;
  adjacentCount: number;
  isSavingProject: boolean;
  onStopSearch: () => void;
  onResetSearch: () => void;
  onAcceptCompany: (id: number) => void;
  onRejectCompany: (id: number) => void;
  onAddCompany: (company: { name: string; sector: string; revenueBand: string; employeeBand: string }) => void;
  onSaveProject: () => void;
  onGoToDashboard: () => void;
}) {
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);
  const [relevanceFilter, setRelevanceFilter] = useState<RelevanceFilter>('all');
  const [showAddModal, setShowAddModal] = useState(false);

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

  return (
    <motion.div
      key="universe"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 flex flex-col overflow-hidden"
    >
      {/* Topbar */}
      <div className="h-12 shrink-0 border-b border-border bg-background flex items-center px-4 gap-3 z-10">
        <span className="text-sm font-semibold text-foreground">Company universe</span>
        <span className="text-xs text-muted-foreground truncate max-w-[280px]">{query}</span>
        {isStreaming ? (
          <span className="flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900 px-2.5 py-1 rounded-full">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            Discovering · {nonRejected.length} found
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
          <Button variant="outline" size="sm" onClick={() => setShowAddModal(true)} className="h-7 gap-1.5 text-xs" data-testid="button-add-company">
            <Plus className="w-3 h-3" />Add company
          </Button>
          <Button variant="outline" size="sm" onClick={onResetSearch} className="h-7 gap-1.5 text-xs" data-testid="button-new-search">
            New search
          </Button>
          {!isStreaming && companies.length > 0 && (
            <Button variant="outline" size="sm" onClick={onGoToDashboard} disabled={isSavingProject} className="h-7 gap-1.5 text-xs" data-testid="button-go-dashboard">
              <Upload className="w-3 h-3" />Dashboard
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sector sidebar */}
        <div className="w-56 shrink-0 border-r border-border bg-muted/10 overflow-y-auto py-3 hidden sm:block">
          <button
            onClick={() => setSectorFilter(null)}
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
              onClick={() => setSectorFilter(sector)}
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
              onClick={() => setSectorFilter(sector)}
              className={`w-full flex items-center justify-between gap-2 px-4 py-1.5 text-xs text-left ${sectorFilter === sector ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 font-medium' : 'text-blue-600/80 dark:text-blue-400/80 hover:bg-blue-50/50 dark:hover:bg-blue-950/20'}`}
            >
              <span className="truncate">{sector}</span>
              <span className="text-[11px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1.5 rounded-full shrink-0">{count}</span>
            </button>
          ))}
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Filter bar */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border flex-wrap">
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

          {/* Column header */}
          <div className="grid items-center px-4 py-1.5 border-b border-border bg-muted/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70"
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
            {rows.map((c) => (
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
            {pendingCompanyNames.map((name) => (
              <div key={`pending-${name}`} className="grid items-center px-4 py-2.5 border-b border-border/50 animate-pulse"
                   style={{ gridTemplateColumns: GRID_COLS }}>
                <div className="w-7 h-7 rounded-md bg-muted" />
                <div className="min-w-0 pr-2"><p className="text-[12px] text-muted-foreground truncate">{name}</p></div>
                <span className="text-[11px] text-muted-foreground/40">Classifying…</span>
                <span /><span /><span /><span /><span />
              </div>
            ))}

            {/* Grid skeleton rows when streaming with no data yet */}
            {rows.length === 0 && pendingCompanyNames.length === 0 && isStreaming && (
              Array.from({ length: 8 }).map((_, i) => (
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

            {rows.length === 0 && pendingCompanyNames.length === 0 && !isStreaming && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <Search className="w-5 h-5" />
                <p className="text-xs">No companies match the current filters</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-border bg-background flex items-center justify-between px-4 py-3">
            <div className="flex gap-6">
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
            <Button
              onClick={onSaveProject}
              disabled={isSavingProject || acceptedCount === 0}
              className="h-9 gap-2 font-semibold"
              data-testid="button-confirm-universe"
            >
              {isSavingProject ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              Confirm universe ({acceptedCount})
            </Button>
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
