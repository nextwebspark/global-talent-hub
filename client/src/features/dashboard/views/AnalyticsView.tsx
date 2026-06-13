import { useState, useEffect, useMemo } from 'react';
import { Loader2, Building2, Users, DollarSign, UserCheck, ChevronDown, ChevronUp, BarChart3, ArrowUpRight, Target, Sparkles } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

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

interface CompRevenueEntry {
  fixedFees: number;
  allowances: number;
  variableBonus: number;
  ltip: number;
  totalPackage: number;
  band: string;
  country: string;
}

interface ConcentrationIndex {
  label: string;
  top3Pct: number;
  topGeographies: Array<{ country: string; count: number; pct: number }>;
}

interface DashboardData {
  reportTitle: string;
  originCountry: string;
  availableCountries: string[];
  availableRegions: string[];
  regionDefinitions: Record<string, string[]>;
  revenueBandLabels: string[];
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
    stepUpAnalysis: Record<string, StepUpEntry[]>;
    compRevenueEntries: CompRevenueEntry[];
  };
  revenueBands: Record<string, number>;
  sectorBreakdown: Record<string, number>;
  ownershipBreakdown: Record<string, number>;
  concentrationIndex: ConcentrationIndex;
  availability: {
    totalExecutives: number;
    availableCount: number;
    availabilityPct: number;
    outOfScopeCount: number;
    outOfScopePct: number;
    offLimitsCount: number;
    offLimitsPct: number;
    companyOutOfScopeCount?: number;
    companyOutOfScopePct?: number;
    companyOffLimitsCount?: number;
    companyOffLimitsPct?: number;
    byLevel: Record<string, { total: number; available: number }>;
    byGeography: Record<string, { total: number; available: number }>;
  };
  diversity?: {
    genderBreakdown: Record<string, number>;
    ethnicityBreakdown: Record<string, number>;
    genderByLevel: Record<string, Record<string, number>>;
    ethnicityByLevel: Record<string, Record<string, number>>;
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

export default function AnalyticsView({ searchId }: { searchId?: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('totalPackage');
  const [domiciledCountry, setDomiciledCountry] = useState<string>('');
  const [selectedRegion, setSelectedRegion] = useState<string>('GCC');
  const [showDomiciled, setShowDomiciled] = useState(true);
  const [showRegion, setShowRegion] = useState(true);
  const [showInternational, setShowInternational] = useState(true);

  useEffect(() => {
    if (!searchId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/dashboard/${searchId}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load dashboard');
        return res.json();
      })
      .then(d => {
        setData(d);
        setDomiciledCountry(d.originCountry || '');
        setSelectedRegion('GCC');
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [searchId]);

  const activeLineData = useMemo(() => {
    if (!data) return [];
    const entries = data.remuneration?.compRevenueEntries || [];
    const bandLabels = data.revenueBandLabels || [];
    const regionCountries = (data.regionDefinitions || {})[selectedRegion] || [];
    const regionSet = new Set(regionCountries.map((c: string) => c.toLowerCase()));
    const domLower = domiciledCountry.toLowerCase();
    const catKey = selectedCategory as keyof CompRevenueEntry;

    const medianOf = (arr: number[]) => {
      if (arr.length === 0) return null;
      arr.sort((a, b) => a - b);
      const m = Math.floor(arr.length / 2);
      return arr.length % 2 === 0 ? Math.round((arr[m - 1] + arr[m]) / 2) : arr[m];
    };

    return bandLabels.map((bandLabel: string) => {
      const byRegion: Record<string, number[]> = { origin: [], gcc: [], international: [] };
      for (const entry of entries) {
        if (entry.band !== bandLabel) continue;
        const val = entry[catKey] as number;
        if (!val || val <= 0) continue;
        const cl = entry.country.toLowerCase();
        if (cl === domLower) byRegion.origin.push(val);
        else if (regionSet.has(cl)) byRegion.gcc.push(val);
        else byRegion.international.push(val);
      }
      return {
        band: bandLabel,
        originMedian: medianOf(byRegion.origin), originCount: byRegion.origin.length,
        gccMedian: medianOf(byRegion.gcc), gccCount: byRegion.gcc.length,
        internationalMedian: medianOf(byRegion.international), internationalCount: byRegion.international.length,
      };
    });
  }, [data, selectedRegion, domiciledCountry, selectedCategory]);

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
  const catKey = selectedCategory as keyof CategoryBreakdownStats;
  const remLevels = Object.entries(remuneration.byLevel)
    .filter(([, s]) => s[catKey]?.count > 0)
    .sort((a, b) => b[1][catKey].median - a[1][catKey].median);
  const remGeos = Object.entries(remuneration.byGeography)
    .filter(([, s]) => s[catKey]?.count > 0)
    .sort((a, b) => b[1][catKey].median - a[1][catKey].median);
  const globalMaxRem = Math.max(
    ...Object.values(remuneration.byLevel).map(v => v[catKey]?.max || 0),
    ...Object.values(remuneration.byGeography).map(v => v[catKey]?.max || 0),
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

  const hasAvailData = availability.availableCount > 0 || availability.outOfScopeCount > 0 || availability.offLimitsCount > 0 || availLevels.some(([, v]) => v.available > 0);

  const sortedRevenueBands = Object.entries(revenueBands).filter(([k]) => k !== 'Unknown');
  const unknownRevCount = revenueBands['Unknown'] || 0;
  const maxRevBand = Math.max(...sortedRevenueBands.map(([, v]) => v), 1);

  const sortedSectors = Object.entries(sectorBreakdown).sort((a, b) => b[1] - a[1]);
  const maxSector = Math.max(...sortedSectors.map(([, v]) => v), 1);
  const sortedOwnership = Object.entries(ownershipBreakdown).sort((a, b) => b[1] - a[1]);
  const maxOwnership = Math.max(...sortedOwnership.map(([, v]) => v), 1);

  const activeStepUp = remuneration.stepUpAnalysis?.[selectedCategory] || [];
  const hasLineChartData = activeLineData.some(
    d => d.originMedian != null || d.gccMedian != null || d.internationalMedian != null
  );

  const hasStepUp = activeStepUp.length >= 2;

  return (
    <div className="p-3 md:p-6 max-w-[1400px] mx-auto space-y-6 overflow-y-auto" data-testid="dashboard-view">
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-border rounded-xl p-6" data-testid="executive-summary-banner">
        <div className="mb-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Talent Mapping Report</p>
          <h1 className="text-lg font-semibold text-foreground leading-tight">{data.reportTitle || 'Search Results'}</h1>
        </div>
        <div className="flex flex-wrap justify-center gap-6 mt-4">
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
          <div className="text-center" data-testid="stat-out-of-scope">
            <p className="text-2xl font-bold text-muted-foreground">{availability.outOfScopeCount}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Out of Scope ({availability.outOfScopePct}%)</p>
          </div>
          <div className="text-center" data-testid="stat-off-limits">
            <p className="text-2xl font-bold text-red-400">{availability.offLimitsCount}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Off-Limits ({availability.offLimitsPct}%)</p>
          </div>
          {(availability.companyOutOfScopeCount || 0) + (availability.companyOffLimitsCount || 0) > 0 && (
            <>
              <div className="text-center" data-testid="stat-company-out-of-scope">
                <p className="text-2xl font-bold text-muted-foreground">{availability.companyOutOfScopeCount || 0}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Co. Out of Scope ({availability.companyOutOfScopePct || 0}%)</p>
              </div>
              <div className="text-center" data-testid="stat-company-off-limits">
                <p className="text-2xl font-bold text-red-400">{availability.companyOffLimitsCount || 0}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Co. Off-Limits ({availability.companyOffLimitsPct || 0}%)</p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              <div className="flex items-center gap-4 pb-2 border-b border-border flex-wrap">
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
                {(availability.outOfScopeCount > 0 || availability.offLimitsCount > 0) && (
                  <div className="border-l border-border pl-4 flex items-center gap-4">
                    {availability.outOfScopeCount > 0 && (
                      <div className="text-center" data-testid="avail-out-of-scope">
                        <p className="text-lg font-semibold text-muted-foreground">{availability.outOfScopeCount}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Exec Out of Scope ({availability.outOfScopePct}%)</p>
                      </div>
                    )}
                    {availability.offLimitsCount > 0 && (
                      <div className="text-center" data-testid="avail-off-limits">
                        <p className="text-lg font-semibold text-red-400">{availability.offLimitsCount}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Exec Off-Limits ({availability.offLimitsPct}%)</p>
                      </div>
                    )}
                  </div>
                )}
                {((availability.companyOutOfScopeCount || 0) > 0 || (availability.companyOffLimitsCount || 0) > 0) && (
                  <div className="border-l border-border pl-4 flex items-center gap-4">
                    {(availability.companyOutOfScopeCount || 0) > 0 && (
                      <div className="text-center" data-testid="avail-company-out-of-scope">
                        <p className="text-lg font-semibold text-muted-foreground">{availability.companyOutOfScopeCount}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Co. Out of Scope ({availability.companyOutOfScopePct || 0}%)</p>
                      </div>
                    )}
                    {(availability.companyOffLimitsCount || 0) > 0 && (
                      <div className="text-center" data-testid="avail-company-off-limits">
                        <p className="text-lg font-semibold text-red-400">{availability.companyOffLimitsCount}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Co. Off-Limits ({availability.companyOffLimitsPct || 0}%)</p>
                      </div>
                    )}
                  </div>
                )}
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

      {data.diversity && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-lg p-5" data-testid="section-gender-diversity">
            <SectionHeader title="Gender Distribution" icon={Sparkles} />
            {(() => {
              const gb = data.diversity!.genderBreakdown;
              const total = Object.values(gb).reduce((s, v) => s + v, 0);
              if (total === 0) return (
                <div className="text-xs text-muted-foreground py-8 text-center">
                  No gender data captured yet. Gender is inferred automatically during discovery or can be set manually on executive profiles.
                </div>
              );
              const GENDER_COLORS: Record<string, string> = { Male: '#3b82f6', Female: '#ec4899', 'Non-Binary': '#a855f7', Unknown: '#6b7280' };
              const entries = Object.entries(gb).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
              const gbl = data.diversity!.genderByLevel;
              const levels = Object.keys(gbl).sort((a, b) => {
                const order: Record<string, number> = { Board: 0, 'C-Suite': 1, 'N-1': 2, 'N-2': 3 };
                return (order[a] ?? 99) - (order[b] ?? 99);
              });
              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-6">
                    <div className="relative w-[120px] h-[120px]">
                      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                        {(() => {
                          let offset = 0;
                          return entries.map(([gender, count]) => {
                            const pct = (count / total) * 100;
                            const dashArray = `${pct} ${100 - pct}`;
                            const el = (
                              <circle
                                key={gender}
                                cx="18" cy="18" r="15.9155"
                                fill="none"
                                stroke={GENDER_COLORS[gender] || '#6b7280'}
                                strokeWidth="3.5"
                                strokeDasharray={dashArray}
                                strokeDashoffset={`${-offset}`}
                                className="transition-all duration-500"
                              />
                            );
                            offset += pct;
                            return el;
                          });
                        })()}
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-lg font-bold text-foreground">{total}</span>
                        <span className="text-[9px] text-muted-foreground uppercase">Total</span>
                      </div>
                    </div>
                    <div className="flex-1 space-y-2">
                      {entries.map(([gender, count]) => {
                        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                        return (
                          <div key={gender} className="flex items-center gap-2" data-testid={`gender-stat-${gender.toLowerCase()}`}>
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: GENDER_COLORS[gender] || '#6b7280' }} />
                            <span className="text-xs text-muted-foreground w-20">{gender}</span>
                            <span className="text-xs font-semibold text-foreground">{count}</span>
                            <span className="text-[10px] text-muted-foreground">({pct}%)</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {levels.length > 0 && (
                    <CollapsibleSection title={`Gender by Level (${levels.length} levels)`} defaultOpen={false}>
                      <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                        {levels.map(level => {
                          const levelData = gbl[level];
                          const levelTotal = Object.values(levelData).reduce((s, v) => s + v, 0);
                          if (levelTotal === 0) return null;
                          return (
                            <div key={level} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-foreground">{level}</span>
                                <span className="text-[10px] text-muted-foreground">{levelTotal} executives</span>
                              </div>
                              <div className="flex h-4 rounded-full overflow-hidden bg-muted/20">
                                {Object.entries(levelData).filter(([, v]) => v > 0).map(([g, v]) => (
                                  <div
                                    key={g}
                                    className="h-full transition-all duration-500"
                                    style={{
                                      width: `${(v / levelTotal) * 100}%`,
                                      backgroundColor: GENDER_COLORS[g] || '#6b7280',
                                    }}
                                    title={`${g}: ${v} (${Math.round((v / levelTotal) * 100)}%)`}
                                  />
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CollapsibleSection>
                  )}
                </div>
              );
            })()}
          </div>

          <div className="bg-card border border-border rounded-lg p-5" data-testid="section-ethnicity-diversity">
            <SectionHeader title="Ethnicity Distribution" icon={Sparkles} />
            {(() => {
              const eb = data.diversity!.ethnicityBreakdown;
              const total = Object.values(eb).reduce((s, v) => s + v, 0);
              const knownCount = total - (eb['Unknown'] || 0);
              if (total === 0 || knownCount === 0) return (
                <div className="text-xs text-muted-foreground py-8 text-center">
                  No ethnicity data captured yet. Ethnicity is inferred automatically during discovery or can be set manually on executive profiles.
                </div>
              );
              const ETHNICITY_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#a855f7', '#06b6d4', '#ef4444', '#84cc16', '#f97316', '#6366f1'];
              const entries = Object.entries(eb).filter(([k, v]) => v > 0 && k !== 'Unknown').sort((a, b) => b[1] - a[1]);
              const maxEth = Math.max(...entries.map(([, v]) => v), 1);
              const ebl = data.diversity!.ethnicityByLevel;
              const levels = Object.keys(ebl).sort((a, b) => {
                const order: Record<string, number> = { Board: 0, 'C-Suite': 1, 'N-1': 2, 'N-2': 3 };
                return (order[a] ?? 99) - (order[b] ?? 99);
              });
              const distinctCount = entries.length;
              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 pb-3 border-b border-border">
                    <div className="flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs text-muted-foreground">Diversity Index:</span>
                      <span className={`text-xs font-semibold ${distinctCount >= 5 ? 'text-emerald-400' : distinctCount >= 3 ? 'text-blue-400' : 'text-amber-400'}`}>
                        {distinctCount} {distinctCount === 1 ? 'ethnicity' : 'ethnicities'}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground ml-auto">{knownCount} of {total} identified</span>
                  </div>
                  <div className="max-h-[160px] overflow-y-auto pr-1">
                    {entries.map(([eth, count], i) => {
                      const colors = ['bg-blue-500/70', 'bg-emerald-500/70', 'bg-amber-500/70', 'bg-pink-500/70', 'bg-purple-500/70', 'bg-cyan-500/70', 'bg-red-500/70', 'bg-lime-500/70', 'bg-orange-500/70', 'bg-indigo-500/70'];
                      return <BarRow key={eth} label={eth} value={count} maxValue={maxEth} color={colors[i % colors.length]} />;
                    })}
                  </div>
                  {levels.length > 0 && (
                    <CollapsibleSection title={`Ethnicity by Level (${levels.length} levels)`} defaultOpen={false}>
                      <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                        {levels.map(level => {
                          const levelData = ebl[level];
                          const levelEntries = Object.entries(levelData).filter(([k, v]) => v > 0 && k !== 'Unknown').sort((a, b) => b[1] - a[1]);
                          const levelTotal = levelEntries.reduce((s, [, v]) => s + v, 0);
                          if (levelTotal === 0) return null;
                          return (
                            <div key={level} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-foreground">{level}</span>
                                <span className="text-[10px] text-muted-foreground">{levelTotal} executives</span>
                              </div>
                              <div className="flex h-4 rounded-full overflow-hidden bg-muted/20">
                                {levelEntries.map(([eth, v], i) => (
                                  <div
                                    key={eth}
                                    className="h-full transition-all duration-500"
                                    style={{
                                      width: `${(v / levelTotal) * 100}%`,
                                      backgroundColor: ETHNICITY_COLORS[i % ETHNICITY_COLORS.length],
                                    }}
                                    title={`${eth}: ${v} (${Math.round((v / levelTotal) * 100)}%)`}
                                  />
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CollapsibleSection>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg p-5" data-testid="section-remuneration">
        <SectionHeader title="Compensation Analytics (USD)" icon={DollarSign} />
        {!hasRemData ? (
          <div className="text-xs text-muted-foreground py-8 text-center">
            No remuneration data captured yet. Add compensation details to executive profiles and click "Parse with AI" to extract structured data.
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {(['fixedFees', 'allowances', 'variableBonus', 'ltip', 'totalPackage'] as const).map(cat => {
                const stats = overallCats[cat];
                const info = CATEGORY_LABELS[cat];
                const isSelected = selectedCategory === cat;
                const isTotal = cat === 'totalPackage';
                return (
                  <div
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`p-3 rounded-lg cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-primary/15 border-2 border-primary ring-1 ring-primary/30'
                        : isTotal
                          ? 'bg-primary/10 border border-primary/30 hover:border-primary/50'
                          : 'bg-muted/20 border border-border/50 hover:border-border'
                    }`}
                    data-testid={`category-card-${cat}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className={`w-2 h-2 rounded-full ${info.color}`} />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{info.label}</span>
                    </div>
                    {stats.count > 0 ? (
                      <>
                        <p className={`text-sm font-semibold ${isTotal ? 'text-primary' : 'text-foreground'}`}>{formatCurrency(stats.median)}</p>
                        <p className="text-[10px] text-muted-foreground">{formatCurrency(stats.min)} – {formatCurrency(stats.max)} ({stats.count})</p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No data</p>
                    )}
                  </div>
                );
              })}
            </div>

            {hasStepUp && (
              <div className="border-t border-border pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Level-to-Level Step-Up</p>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  {activeStepUp.map((entry, idx) => (
                    <div key={entry.level} className="flex items-center gap-2">
                      <div className="text-center px-4 py-2.5 rounded-lg bg-muted/20 border border-border/50">
                        <p className="text-[10px] text-muted-foreground uppercase mb-0.5">{entry.level}</p>
                        <p className="text-sm font-semibold text-foreground">{formatCurrency(entry.median)}</p>
                        <p className="text-[10px] text-muted-foreground">{entry.count} profiles</p>
                      </div>
                      {idx < activeStepUp.length - 1 && (
                        <div className="flex flex-col items-center px-1">
                          <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                          {activeStepUp[idx + 1]?.stepUpPct != null && (
                            <span className="text-[10px] font-semibold text-emerald-400">+{activeStepUp[idx + 1].stepUpPct}%</span>
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
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
                  Median {CATEGORY_LABELS[selectedCategory]?.label || 'Compensation'} by Revenue Band & Region
                </p>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <div className="flex items-center gap-1.5">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider whitespace-nowrap">Domiciled Country</label>
                    <select
                      data-testid="select-domiciled-country"
                      className="text-xs bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      value={domiciledCountry}
                      onChange={e => setDomiciledCountry(e.target.value)}
                    >
                      {(data.availableCountries || []).map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider whitespace-nowrap">Region</label>
                    <select
                      data-testid="select-region"
                      className="text-xs bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      value={selectedRegion}
                      onChange={e => setSelectedRegion(e.target.value)}
                    >
                      {(data.availableRegions || []).map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <button
                      data-testid="toggle-domiciled"
                      onClick={() => setShowDomiciled(v => !v)}
                      className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${showDomiciled ? 'bg-[hsl(210,100%,60%)]/15 border-[hsl(210,100%,60%)] text-[hsl(210,100%,60%)]' : 'bg-muted/30 border-border text-muted-foreground line-through'}`}
                    >
                      {domiciledCountry || data.originCountry}
                    </button>
                    <button
                      data-testid="toggle-region"
                      onClick={() => setShowRegion(v => !v)}
                      className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${showRegion ? 'bg-[hsl(160,80%,50%)]/15 border-[hsl(160,80%,50%)] text-[hsl(160,80%,50%)]' : 'bg-muted/30 border-border text-muted-foreground line-through'}`}
                    >
                      {selectedRegion || 'GCC'}
                    </button>
                    <button
                      data-testid="toggle-international"
                      onClick={() => setShowInternational(v => !v)}
                      className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${showInternational ? 'bg-[hsl(45,90%,55%)]/15 border-[hsl(45,90%,55%)] text-[hsl(45,90%,55%)]' : 'bg-muted/30 border-border text-muted-foreground line-through'}`}
                    >
                      International
                    </button>
                  </div>
                </div>
                <div className="h-[220px] md:h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={activeLineData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
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
                      {showDomiciled && (
                        <Line
                          type="monotone"
                          dataKey="originMedian"
                          name={domiciledCountry || data.originCountry}
                          stroke="hsl(210, 100%, 60%)"
                          strokeWidth={2.5}
                          dot={{ fill: 'hsl(210, 100%, 60%)', r: 4 }}
                          activeDot={{ r: 6 }}
                          connectNulls={false}
                        />
                      )}
                      {showRegion && (
                        <Line
                          type="monotone"
                          dataKey="gccMedian"
                          name={selectedRegion || 'GCC'}
                          stroke="hsl(160, 80%, 50%)"
                          strokeWidth={2.5}
                          dot={{ fill: 'hsl(160, 80%, 50%)', r: 4 }}
                          activeDot={{ r: 6 }}
                          connectNulls={false}
                        />
                      )}
                      {showInternational && (
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
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-border pt-4">
              <CollapsibleSection title={`By Level (${remLevels.length})`}>
                <div className="max-h-[200px] overflow-y-auto pr-1 space-y-1">
                  {remLevels.map(([level, stats]) => (
                    <RangeBar key={level} label={`${level} (${stats[catKey].count})`} min={stats[catKey].min} median={stats[catKey].median} max={stats[catKey].max} globalMax={globalMaxRem} />
                  ))}
                </div>
              </CollapsibleSection>
              {remGeos.length > 0 && (
                <CollapsibleSection title={`By Geography (${remGeos.length})`} defaultOpen={false}>
                  <div className="max-h-[200px] overflow-y-auto pr-1 space-y-1">
                    {remGeos.map(([geo, stats]) => (
                      <RangeBar key={geo} label={`${geo} (${stats[catKey].count})`} min={stats[catKey].min} median={stats[catKey].median} max={stats[catKey].max} globalMax={globalMaxRem} />
                    ))}
                  </div>
                </CollapsibleSection>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
