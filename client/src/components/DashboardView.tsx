import { useState, useEffect } from 'react';
import { Loader2, Building2, Users, DollarSign, UserCheck, TrendingUp, MapPin, ChevronDown, ChevronUp } from 'lucide-react';

interface CategoryStats {
  min: number;
  median: number;
  max: number;
  count: number;
}

interface CategoryBreakdownStats {
  fixedFees: CategoryStats;
  allowances: CategoryStats;
  variableBonus: CategoryStats;
  ltip: CategoryStats;
  totalPackage: CategoryStats;
}

interface DashboardData {
  mappingCompletion: {
    totalCompanies: number;
    mappedCount: number;
    completionPct: number;
    byCountry: Record<string, { total: number; mapped: number }>;
  };
  executiveUniverse: {
    totalExecutives: number;
    byTitle: Record<string, number>;
    byCountry: Record<string, number>;
  };
  remuneration: {
    overall: CategoryBreakdownStats;
    byLevel: Record<string, CategoryBreakdownStats>;
    byGeography: Record<string, CategoryBreakdownStats>;
    currency: string;
  };
  availability: {
    totalExecutives: number;
    availableCount: number;
    availabilityPct: number;
    byLevel: Record<string, { total: number; available: number }>;
    byGeography: Record<string, { total: number; available: number }>;
  };
}

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  fixedFees: { label: 'Fixed Fees', color: 'bg-blue-500/70' },
  allowances: { label: 'Total Allowances', color: 'bg-emerald-500/70' },
  variableBonus: { label: 'Variable Bonus', color: 'bg-amber-500/70' },
  ltip: { label: 'LTIP', color: 'bg-purple-500/70' },
  totalPackage: { label: 'Total Package', color: 'bg-primary' },
};

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function ProgressRing({ percentage, size = 120, strokeWidth = 10 }: { percentage: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-muted/20" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="text-primary transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-foreground">{percentage}%</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Complete</span>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, subtitle }: { icon: any; label: string; value: string | number; subtitle?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 flex items-start gap-3" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-xl font-semibold text-foreground mt-0.5">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function SectionHeader({ title, icon: Icon }: { title: string; icon: any }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="w-4 h-4 text-primary" />
      <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">{title}</h2>
    </div>
  );
}

function BarRow({ label, value, maxValue, color = 'bg-primary' }: { label: string; value: number; maxValue: number; color?: string }) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-xs text-muted-foreground w-28 shrink-0 truncate" title={label}>{label}</span>
      <div className="flex-1 h-5 bg-muted/20 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <span className="text-xs font-medium text-foreground w-10 text-right">{value}</span>
    </div>
  );
}

function RangeBar({ label, min, median, max, globalMax }: { label: string; min: number; median: number; max: number; globalMax: number }) {
  const minPct = globalMax > 0 ? (min / globalMax) * 100 : 0;
  const maxPct = globalMax > 0 ? (max / globalMax) * 100 : 0;
  const medPct = globalMax > 0 ? (median / globalMax) * 100 : 0;

  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span className="text-[10px] text-muted-foreground">{formatCurrency(min)} - {formatCurrency(max)}</span>
      </div>
      <div className="relative h-6 bg-muted/20 rounded-full overflow-hidden">
        <div className="absolute h-full bg-primary/30 rounded-full" style={{ left: `${minPct}%`, width: `${Math.max(maxPct - minPct, 1)}%` }} />
        <div className="absolute top-0.5 bottom-0.5 w-1 bg-primary rounded-full" style={{ left: `${medPct}%` }} />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[10px] text-muted-foreground">Min: {formatCurrency(min)}</span>
        <span className="text-[10px] text-primary font-medium">Median: {formatCurrency(median)}</span>
        <span className="text-[10px] text-muted-foreground">Max: {formatCurrency(max)}</span>
      </div>
    </div>
  );
}

function AvailabilityRow({ label, available, total }: { label: string; available: number; total: number }) {
  const pct = total > 0 ? Math.round((available / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-xs text-muted-foreground w-28 shrink-0 truncate" title={label}>{label}</span>
      <div className="flex-1 h-5 bg-muted/20 rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500/80 transition-all duration-500" style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <span className="text-xs font-medium text-foreground w-16 text-right">{available}/{total} ({pct}%)</span>
    </div>
  );
}

function CollapsibleSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2">
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        <span>{title}</span>
      </button>
      {open && children}
    </div>
  );
}

export default function DashboardView({ searchId }: { searchId?: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!searchId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/dashboard/${searchId}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load dashboard');
        return res.json();
      })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [searchId]);

  if (!searchId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm" data-testid="dashboard-empty">
        No search loaded. Run a search first to see the dashboard.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" data-testid="dashboard-loading">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm" data-testid="dashboard-error">
        {error || 'Failed to load dashboard data.'}
      </div>
    );
  }

  const { mappingCompletion, executiveUniverse, remuneration, availability } = data;

  const sortedCountries = Object.entries(mappingCompletion.byCountry).sort((a, b) => b[1].total - a[1].total);
  const sortedTitles = Object.entries(executiveUniverse.byTitle).sort((a, b) => b[1] - a[1]);
  const sortedExecCountries = Object.entries(executiveUniverse.byCountry).sort((a, b) => b[1] - a[1]);
  const maxExecByTitle = Math.max(...Object.values(executiveUniverse.byTitle), 1);
  const maxExecByCountry = Math.max(...Object.values(executiveUniverse.byCountry), 1);

  const hasRemData = remuneration.overall.totalPackage.count > 0;
  const overallCats = remuneration.overall;
  const remLevels = Object.entries(remuneration.byLevel).sort((a, b) => b[1].totalPackage.median - a[1].totalPackage.median);
  const remGeos = Object.entries(remuneration.byGeography).sort((a, b) => b[1].totalPackage.median - a[1].totalPackage.median);
  const globalMaxRem = Math.max(
    ...Object.values(remuneration.byLevel).map(v => v.totalPackage.max),
    ...Object.values(remuneration.byGeography).map(v => v.totalPackage.max),
    1
  );

  const availLevels = Object.entries(availability.byLevel).filter(([, v]) => v.total > 0).sort((a, b) => {
    const pctA = a[1].total > 0 ? a[1].available / a[1].total : 0;
    const pctB = b[1].total > 0 ? b[1].available / b[1].total : 0;
    return pctB - pctA;
  });
  const availGeos = Object.entries(availability.byGeography).filter(([, v]) => v.total > 0).sort((a, b) => {
    const pctA = a[1].total > 0 ? a[1].available / a[1].total : 0;
    const pctB = b[1].total > 0 ? b[1].available / b[1].total : 0;
    return pctB - pctA;
  });

  const hasAvailData = availability.availableCount > 0 || availLevels.some(([, v]) => v.available > 0);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6" data-testid="dashboard-view">
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={Building2} label="Total Companies" value={mappingCompletion.totalCompanies} subtitle="In search universe" />
        <StatCard icon={TrendingUp} label="Mapped" value={mappingCompletion.mappedCount} subtitle={`${mappingCompletion.completionPct}% completion`} />
        <StatCard icon={Users} label="Executives" value={executiveUniverse.totalExecutives} subtitle="Identified across all companies" />
        <StatCard icon={UserCheck} label="Interested" value={`${availability.availabilityPct}%`} subtitle={`${availability.availableCount} of ${availability.totalExecutives}`} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-lg p-5" data-testid="section-mapping-completion">
          <SectionHeader title="Mapping Completion" icon={Building2} />
          <div className="flex gap-6">
            <div className="flex flex-col items-center justify-center">
              <ProgressRing percentage={mappingCompletion.completionPct} />
              <p className="text-xs text-muted-foreground mt-2">{mappingCompletion.mappedCount} of {mappingCompletion.totalCompanies}</p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">By Country</p>
              <div className="max-h-[200px] overflow-y-auto pr-1 space-y-0.5">
                {sortedCountries.map(([country, { total, mapped }]) => {
                  const pct = total > 0 ? Math.round((mapped / total) * 100) : 0;
                  return (
                    <div key={country} className="flex items-center gap-2 py-1">
                      <span className="text-xs text-muted-foreground w-28 truncate" title={country}>{country}</span>
                      <div className="flex-1 h-4 bg-muted/20 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-primary/70 transition-all duration-500" style={{ width: `${Math.max(pct, 3)}%` }} />
                      </div>
                      <span className="text-[10px] text-foreground w-16 text-right">{mapped}/{total} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-5" data-testid="section-executive-universe">
          <SectionHeader title="Executive Universe" icon={Users} />
          <div className="space-y-4">
            <CollapsibleSection title={`By Level (${sortedTitles.length} levels)`}>
              <div className="max-h-[120px] overflow-y-auto pr-1">
                {sortedTitles.map(([title, count]) => (
                  <BarRow key={title} label={title} value={count} maxValue={maxExecByTitle} />
                ))}
              </div>
            </CollapsibleSection>
            <CollapsibleSection title={`By Geography (${sortedExecCountries.length} countries)`}>
              <div className="max-h-[120px] overflow-y-auto pr-1">
                {sortedExecCountries.map(([country, count]) => (
                  <BarRow key={country} label={country} value={count} maxValue={maxExecByCountry} color="bg-blue-500/70" />
                ))}
              </div>
            </CollapsibleSection>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-5" data-testid="section-remuneration">
          <SectionHeader title="Remuneration (USD)" icon={DollarSign} />
          {!hasRemData ? (
            <div className="text-xs text-muted-foreground py-8 text-center">
              No remuneration data captured yet. Add compensation details to executive profiles and click "Parse with AI" to extract structured data.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 pb-3 border-b border-border">
                {(['fixedFees', 'allowances', 'variableBonus', 'ltip'] as const).map(cat => {
                  const stats = overallCats[cat];
                  const info = CATEGORY_LABELS[cat];
                  return (
                    <div key={cat} className="p-2.5 rounded-lg bg-muted/20 border border-border/50">
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className={`w-2 h-2 rounded-full ${info.color}`} />
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{info.label}</span>
                      </div>
                      {stats.count > 0 ? (
                        <>
                          <p className="text-sm font-semibold text-foreground">{formatCurrency(stats.median)}</p>
                          <p className="text-[10px] text-muted-foreground">{formatCurrency(stats.min)} – {formatCurrency(stats.max)} ({stats.count})</p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No data</p>
                      )}
                    </div>
                  );
                })}
              </div>
              {overallCats.totalPackage.count > 0 && (
                <div className="flex items-center justify-between text-xs pb-2">
                  <span className="text-muted-foreground">Total Package (median)</span>
                  <span className="font-semibold text-primary text-sm">{formatCurrency(overallCats.totalPackage.median)}</span>
                </div>
              )}
              <CollapsibleSection title={`By Level (${remLevels.length})`}>
                <div className="max-h-[180px] overflow-y-auto pr-1 space-y-1">
                  {remLevels.map(([level, stats]) => (
                    <RangeBar key={level} label={`${level} (${stats.totalPackage.count})`} min={stats.totalPackage.min} median={stats.totalPackage.median} max={stats.totalPackage.max} globalMax={globalMaxRem} />
                  ))}
                </div>
              </CollapsibleSection>
              {remGeos.length > 0 && (
                <CollapsibleSection title={`By Geography (${remGeos.length})`} defaultOpen={false}>
                  <div className="max-h-[180px] overflow-y-auto pr-1 space-y-1">
                    {remGeos.map(([geo, stats]) => (
                      <RangeBar key={geo} label={`${geo} (${stats.totalPackage.count})`} min={stats.totalPackage.min} median={stats.totalPackage.median} max={stats.totalPackage.max} globalMax={globalMaxRem} />
                    ))}
                  </div>
                </CollapsibleSection>
              )}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg p-5" data-testid="section-availability">
          <SectionHeader title="Level" icon={UserCheck} />
          {!hasAvailData ? (
            <div className="text-xs text-muted-foreground py-8 text-center">
              No level data captured yet. Assign levels (Board, C-Suite, N-1, N-2) and mark status to see rates here.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4 pb-2 border-b border-border">
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-400">{availability.availabilityPct}%</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Interest Rate</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-foreground">{availability.availableCount}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Interested</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-foreground">{availability.totalExecutives}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Total</p>
                </div>
              </div>
              <CollapsibleSection title={`By Level (${availLevels.length})`}>
                <div className="max-h-[100px] overflow-y-auto pr-1">
                  {availLevels.map(([level, { available, total }]) => (
                    <AvailabilityRow key={level} label={level} available={available} total={total} />
                  ))}
                </div>
              </CollapsibleSection>
              {availGeos.length > 0 && (
                <CollapsibleSection title={`By Geography (${availGeos.length})`} defaultOpen={false}>
                  <div className="max-h-[100px] overflow-y-auto pr-1">
                    {availGeos.map(([geo, { available, total }]) => (
                      <AvailabilityRow key={geo} label={geo} available={available} total={total} />
                    ))}
                  </div>
                </CollapsibleSection>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
