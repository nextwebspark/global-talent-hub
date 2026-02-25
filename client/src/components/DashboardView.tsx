import { useState, useEffect } from 'react';
import { Loader2, Building2, Users, DollarSign, UserCheck, ChevronDown, ChevronUp, BarChart3, ArrowUpRight, Target } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';

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

interface StepUpEntry {
  level: string;
  median: number;
  count: number;
  stepUpPct?: number;
  stepUpFrom?: string;
}

interface CompRevenueBandRegion {
  band: string;
  originMedian: number | null;
  originCount: number;
  gccMedian: number | null;
  gccCount: number;
  internationalMedian: number | null;
  internationalCount: number;
}

interface ConcentrationIndex {
  label: string;
  top3Pct: number;
  topGeographies: Array<{ country: string; count: number; pct: number }>;
}

interface DashboardData {
  reportTitle: string;
  originCountry: string;
  distinctCountries: number;
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
    stepUpAnalysis: StepUpEntry[];
    compByRevenueBandRegion: CompRevenueBandRegion[];
  };
  revenueBands: Record<string, number>;
  sectorBreakdown: Record<string, number>;
  ownershipBreakdown: Record<string, number>;
  concentrationIndex: ConcentrationIndex;
  productivityMetrics: {
    companies: Array<{ name: string; revenuePerEmployee: number }>;
    median: number | null;
    min: number | null;
    max: number | null;
    count: number;
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

function SectionHeader({ title, icon: Icon }: { title: string; icon: any }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="w-4 h-4 text-primary" />
      <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">{title}</h2>
    </div>
  );
}

function BarRow({ label, value, maxValue, color = 'bg-primary', suffix = '' }: { label: string; value: number; maxValue: number; color?: string; suffix?: string }) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-xs text-muted-foreground w-28 shrink-0 truncate" title={label}>{label}</span>
      <div className="flex-1 h-5 bg-muted/20 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <span className="text-xs font-medium text-foreground w-16 text-right">{typeof value === 'number' && suffix ? `${value}${suffix}` : value}</span>
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

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-xs">
      <p className="font-medium text-foreground mb-1.5">{label}</p>
      {payload.map((entry: any) => (
        entry.value != null && (
          <div key={entry.name} className="flex items-center gap-2 py-0.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-medium text-foreground">{formatCurrency(entry.value)}</span>
            {entry.payload?.[`${entry.dataKey.replace('Median', 'Count')}`] != null && (
              <span className="text-muted-foreground">({entry.payload[`${entry.dataKey.replace('Median', 'Count')}`]} profiles)</span>
            )}
          </div>
        )
      ))}
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

  const { mappingCompletion, executiveUniverse, remuneration, availability, revenueBands, sectorBreakdown, ownershipBreakdown, concentrationIndex } = data;

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

  const sortedRevenueBands = Object.entries(revenueBands).filter(([k]) => k !== 'Unknown');
  const unknownRevCount = revenueBands['Unknown'] || 0;
  const maxRevBand = Math.max(...sortedRevenueBands.map(([, v]) => v), 1);

  const sortedSectors = Object.entries(sectorBreakdown).sort((a, b) => b[1] - a[1]);
  const maxSector = Math.max(...sortedSectors.map(([, v]) => v), 1);
  const sortedOwnership = Object.entries(ownershipBreakdown).sort((a, b) => b[1] - a[1]);
  const maxOwnership = Math.max(...sortedOwnership.map(([, v]) => v), 1);

  const hasLineChartData = remuneration.compByRevenueBandRegion?.some(
    d => d.originMedian != null || d.gccMedian != null || d.internationalMedian != null
  );

  const hasStepUp = remuneration.stepUpAnalysis?.length >= 2;

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6 overflow-y-auto" data-testid="dashboard-view">
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-border rounded-xl p-6" data-testid="executive-summary-banner">
        <div className="mb-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Talent Mapping Report</p>
          <h1 className="text-lg font-semibold text-foreground leading-tight">{data.reportTitle || 'Search Results'}</h1>
        </div>
        <div className="grid grid-cols-5 gap-4 mt-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">{mappingCompletion.totalCompanies}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Companies</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">{executiveUniverse.totalExecutives}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Executives</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">{data.distinctCountries}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Countries</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">{mappingCompletion.completionPct}%</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Mapped</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-400">{availability.availabilityPct}%</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Interested</p>
          </div>
        </div>
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
            {concentrationIndex.topGeographies.length > 0 && (
              <div className="flex items-center gap-3 pb-3 border-b border-border">
                <div className="flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs text-muted-foreground">Talent Pool:</span>
                  <span className={`text-xs font-semibold ${concentrationIndex.label === 'Concentrated' ? 'text-amber-400' : concentrationIndex.label === 'Diversified' ? 'text-emerald-400' : 'text-blue-400'}`}>
                    {concentrationIndex.label}
                  </span>
                </div>
                <div className="flex gap-2 ml-auto">
                  {concentrationIndex.topGeographies.map(g => (
                    <span key={g.country} className="text-[10px] text-muted-foreground">
                      {g.country} <span className="text-foreground font-medium">{g.pct}%</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
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

        <div className="bg-card border border-border rounded-lg p-5" data-testid="section-revenue-bands">
          <SectionHeader title="Revenue Distribution" icon={BarChart3} />
          <div className="space-y-4">
            <div>
              {sortedRevenueBands.map(([band, count]) => (
                <BarRow key={band} label={band} value={count} maxValue={maxRevBand} color="bg-blue-500/70" />
              ))}
              {unknownRevCount > 0 && (
                <BarRow label="Unknown" value={unknownRevCount} maxValue={maxRevBand} color="bg-muted-foreground/30" />
              )}
            </div>
            {sortedSectors.length > 0 && (
              <CollapsibleSection title={`By Sector (${sortedSectors.length})`} defaultOpen={false}>
                <div className="max-h-[140px] overflow-y-auto pr-1">
                  {sortedSectors.map(([sector, count]) => (
                    <BarRow key={sector} label={sector} value={count} maxValue={maxSector} color="bg-emerald-500/70" />
                  ))}
                </div>
              </CollapsibleSection>
            )}
            {sortedOwnership.length > 0 && (
              <CollapsibleSection title={`By Ownership (${sortedOwnership.length})`} defaultOpen={false}>
                <div className="max-h-[140px] overflow-y-auto pr-1">
                  {sortedOwnership.map(([type, count]) => (
                    <BarRow key={type} label={type} value={count} maxValue={maxOwnership} color="bg-amber-500/70" />
                  ))}
                </div>
              </CollapsibleSection>
            )}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-5" data-testid="section-availability">
          <SectionHeader title="Status & Interest" icon={UserCheck} />
          {!hasAvailData ? (
            <div className="text-xs text-muted-foreground py-8 text-center">
              No status data captured yet. Assign levels (Board, C-Suite, N-1, N-2) and mark status to see rates here.
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

      <div className="bg-card border border-border rounded-lg p-5" data-testid="section-remuneration">
        <SectionHeader title="Compensation Analytics (USD)" icon={DollarSign} />
        {!hasRemData ? (
          <div className="text-xs text-muted-foreground py-8 text-center">
            No remuneration data captured yet. Add compensation details to executive profiles and click "Parse with AI" to extract structured data.
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-5 gap-3">
              {(['fixedFees', 'allowances', 'variableBonus', 'ltip'] as const).map(cat => {
                const stats = overallCats[cat];
                const info = CATEGORY_LABELS[cat];
                return (
                  <div key={cat} className="p-3 rounded-lg bg-muted/20 border border-border/50">
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
              {overallCats.totalPackage.count > 0 && (
                <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Package</span>
                  </div>
                  <p className="text-sm font-semibold text-primary">{formatCurrency(overallCats.totalPackage.median)}</p>
                  <p className="text-[10px] text-muted-foreground">{formatCurrency(overallCats.totalPackage.min)} – {formatCurrency(overallCats.totalPackage.max)} ({overallCats.totalPackage.count})</p>
                </div>
              )}
            </div>

            {hasStepUp && (
              <div className="border-t border-border pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Level-to-Level Step-Up</p>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  {remuneration.stepUpAnalysis.map((entry, idx) => (
                    <div key={entry.level} className="flex items-center gap-2">
                      <div className="text-center px-4 py-2.5 rounded-lg bg-muted/20 border border-border/50">
                        <p className="text-[10px] text-muted-foreground uppercase mb-0.5">{entry.level}</p>
                        <p className="text-sm font-semibold text-foreground">{formatCurrency(entry.median)}</p>
                        <p className="text-[10px] text-muted-foreground">{entry.count} profiles</p>
                      </div>
                      {idx < remuneration.stepUpAnalysis.length - 1 && (
                        <div className="flex flex-col items-center px-1">
                          <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                          {remuneration.stepUpAnalysis[idx + 1]?.stepUpPct != null && (
                            <span className="text-[10px] font-semibold text-emerald-400">+{remuneration.stepUpAnalysis[idx + 1].stepUpPct}%</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hasLineChartData && (
              <div className="border-t border-border pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Median Compensation by Revenue Band & Region</p>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={remuneration.compByRevenueBandRegion} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis
                        dataKey="band"
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={{ stroke: 'hsl(var(--border))' }}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v: number) => formatCurrency(v)}
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={{ stroke: 'hsl(var(--border))' }}
                        tickLine={false}
                        width={65}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend
                        wrapperStyle={{ fontSize: 11 }}
                        iconType="circle"
                        iconSize={8}
                      />
                      <Line
                        type="monotone"
                        dataKey="originMedian"
                        name={data.originCountry}
                        stroke="hsl(210, 100%, 60%)"
                        strokeWidth={2.5}
                        dot={{ fill: 'hsl(210, 100%, 60%)', r: 4 }}
                        activeDot={{ r: 6 }}
                        connectNulls={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="gccMedian"
                        name="GCC"
                        stroke="hsl(160, 80%, 50%)"
                        strokeWidth={2.5}
                        dot={{ fill: 'hsl(160, 80%, 50%)', r: 4 }}
                        activeDot={{ r: 6 }}
                        connectNulls={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="internationalMedian"
                        name="International"
                        stroke="hsl(45, 90%, 55%)"
                        strokeWidth={2.5}
                        dot={{ fill: 'hsl(45, 90%, 55%)', r: 4 }}
                        activeDot={{ r: 6 }}
                        connectNulls={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-6 border-t border-border pt-4">
              <CollapsibleSection title={`By Level (${remLevels.length})`}>
                <div className="max-h-[200px] overflow-y-auto pr-1 space-y-1">
                  {remLevels.map(([level, stats]) => (
                    <RangeBar key={level} label={`${level} (${stats.totalPackage.count})`} min={stats.totalPackage.min} median={stats.totalPackage.median} max={stats.totalPackage.max} globalMax={globalMaxRem} />
                  ))}
                </div>
              </CollapsibleSection>
              {remGeos.length > 0 && (
                <CollapsibleSection title={`By Geography (${remGeos.length})`} defaultOpen={false}>
                  <div className="max-h-[200px] overflow-y-auto pr-1 space-y-1">
                    {remGeos.map(([geo, stats]) => (
                      <RangeBar key={geo} label={`${geo} (${stats.totalPackage.count})`} min={stats.totalPackage.min} median={stats.totalPackage.median} max={stats.totalPackage.max} globalMax={globalMaxRem} />
                    ))}
                  </div>
                </CollapsibleSection>
              )}
            </div>
          </div>
        )}
      </div>

      {data.productivityMetrics && data.productivityMetrics.count > 0 && (
        <div className="bg-card border border-border rounded-lg p-5" data-testid="section-productivity">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold uppercase tracking-wider">Revenue per Employee</h3>
            <span className="text-xs text-muted-foreground ml-auto">
              Median: {data.productivityMetrics.median ? formatCurrency(data.productivityMetrics.median) : '—'} · {data.productivityMetrics.count} companies
            </span>
          </div>
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
            {data.productivityMetrics.companies.map((c, i) => {
              const maxVal = data.productivityMetrics.max || 1;
              const pct = Math.round((c.revenuePerEmployee / maxVal) * 100);
              return (
                <div key={i} className="flex items-center gap-2 text-xs" data-testid={`productivity-row-${i}`}>
                  <span className="w-[160px] truncate text-muted-foreground shrink-0" title={c.name}>{c.name}</span>
                  <div className="flex-1 bg-muted/20 rounded h-4 overflow-hidden">
                    <div
                      className="h-full bg-cyan-500/60 rounded transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-[80px] text-right font-medium shrink-0">{formatCurrency(c.revenuePerEmployee)}</span>
                </div>
              );
            })}
          </div>
          {data.productivityMetrics.median && (
            <div className="mt-3 pt-3 border-t border-border flex justify-between text-xs text-muted-foreground">
              <span>Min: {formatCurrency(data.productivityMetrics.min!)}</span>
              <span className="font-medium text-foreground">Median: {formatCurrency(data.productivityMetrics.median)}</span>
              <span>Max: {formatCurrency(data.productivityMetrics.max!)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
