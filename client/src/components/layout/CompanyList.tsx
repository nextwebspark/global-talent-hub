import { useState, useMemo, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, ChevronRight, Building2, User, Eye, EyeOff, Trash2, X, CheckCircle2, Sparkles, AlertTriangle, Info, DollarSign, Users, MapPin, ChevronDown, Filter, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import mapboxgl from 'mapbox-gl';

export default function CompanyList() {
  const {
    companies, executives, selectCompany, selectExecutive, selectedCompanyId, selectedExecutiveId,
    deleteCompany, deleteExecutive, currentProject,
    hiddenCountries, hiddenCompanies, toggleCountryVisibility, toggleCompanyVisibility,
    discoveryStatus, degradationReasons, clearDiscoveryStatus,
    revenueFilterRange, setRevenueFilterRange, employeeFilterRange, setEmployeeFilterRange
  } = useAppStore();

  const [searchFilter, setSearchFilter] = useState('');
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set());
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  

  const countriesData = useMemo(() => {
    const countryMap = new Map<string, { name: string; companies: any[] }>();
    companies.forEach(company => {
      const countryName = company.hq_country || 'Unknown';
      if (!countryMap.has(countryName)) {
        countryMap.set(countryName, { name: countryName, companies: [] });
      }
      const companyExecs = executives
        .filter(e => e.company_id === company.id)
        .map(e => ({ id: e.id, name: e.name, title: e.title, confidence: e.confidence, isEnriched: e.isEnriched, enrichmentSource: e.enrichmentSource, availability: e.availability }));
      countryMap.get(countryName)!.companies.push({
        id: company.id, name: company.name, revenue_usd: company.revenue_usd, employees: company.employees,
        confidence: company.confidence, lat: company.lat, lng: company.lng,
        color: company.color, status: company.status, executives: companyExecs
      });
    });
    const sorted = Array.from(countryMap.values()).sort((a, b) => {
      const eA = a.companies.reduce((s, c) => s + c.executives.length, 0);
      const eB = b.companies.reduce((s, c) => s + c.executives.length, 0);
      return eB - eA;
    });
    sorted.forEach(country => {
      country.companies.sort((a: any, b: any) =>
        a.name.localeCompare(b.name)
      );
    });
    return sorted;
  }, [companies, executives]);

  const filteredCountries = useMemo(() => {
    const revMin = revenueFilterRange[0] * 50000000;
    const revMax = revenueFilterRange[1] * 50000000;
    const empMin = employeeFilterRange[0] * 100;
    const empMax = employeeFilterRange[1] * 100;
    let result = countriesData;
    const hasRevFilter = revenueFilterRange[0] > 0 || revenueFilterRange[1] < 100;
    const hasEmpFilter = employeeFilterRange[0] > 0 || employeeFilterRange[1] < 100;
    if (hasRevFilter || hasEmpFilter) {
      result = result.map(c => ({
        ...c,
        companies: c.companies.filter((co: any) => {
          const rev = co.revenue_usd || 0; const emp = co.employees || 0;
          if (hasRevFilter && (rev < revMin || rev > revMax)) return false;
          if (hasEmpFilter && (emp < empMin || emp > empMax)) return false;
          return true;
        })
      })).filter(c => c.companies.length > 0);
    }
    if (searchFilter.trim()) {
      const f = searchFilter.toLowerCase();
      result = result.map(c => ({
        ...c,
        companies: c.companies.filter((co: any) =>
          co.name.toLowerCase().includes(f) || c.name.toLowerCase().includes(f) ||
          co.executives.some((e: any) => e.name.toLowerCase().includes(f) || e.title.toLowerCase().includes(f))
        )
      })).filter(c => c.companies.length > 0 || c.name.toLowerCase().includes(f));
    }
    return result;
  }, [countriesData, searchFilter, revenueFilterRange, employeeFilterRange]);

  const toggleCountry = (countryName: string) => {
    setExpandedCountries(prev => {
      const next = new Set(prev);
      if (next.has(countryName)) { next.delete(countryName); } else {
        next.add(countryName);
        const country = countriesData.find(c => c.name === countryName);
        if (country?.companies.length) {
          const map = window.mapboxMap as mapboxgl.Map | undefined;
          if (map) {
            const coords = country.companies.filter((c: any) => c.lat !== 0 || c.lng !== 0).map((c: any) => [Number(c.lng), Number(c.lat)] as [number, number]);
            if (coords.length > 0) { try { const bounds = coords.reduce((b: mapboxgl.LngLatBounds, c: [number, number]) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0])); map.fitBounds(bounds, { padding: 50, maxZoom: 8, animate: true }); } catch {} }
          }
        }
      }
      return next;
    });
  };

  const toggleCompanyExpand = (id: string) => {
    setExpandedCompanies(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const handleDeleteCompany = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!confirm(`Delete "${name}" from results?`)) return;
    try { await fetch(`/api/companies/${id}`, { method: 'DELETE' }); deleteCompany(id); toast.success(`Removed ${name}`); }
    catch { toast.error('Failed to delete company'); }
  };

  const handleDeleteExecutive = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!confirm(`Delete "${name}"?`)) return;
    try { await fetch(`/api/executives/${id}`, { method: 'DELETE' }); deleteExecutive(id); toast.success(`Removed ${name}`); }
    catch { toast.error('Failed to delete executive'); }
  };

  

  const totalCompanies = companies.length;
  const totalExecs = executives.length;
  const hasActiveFilters = revenueFilterRange[0] > 0 || revenueFilterRange[1] < 100 || employeeFilterRange[0] > 0 || employeeFilterRange[1] < 100;

  if (isCollapsed) {
    return (
      <div className="absolute top-3 left-3 z-30">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setIsCollapsed(false)}
          className="h-8 shadow-lg border border-border bg-background/95 backdrop-blur-sm"
          data-testid="expand-company-list"
        >
          <Building2 className="w-3.5 h-3.5 mr-1.5" />
          {totalCompanies} companies
        </Button>
      </div>
    );
  }

  return (
    <div
      className="absolute top-3 left-3 z-30 w-72 max-h-[calc(100vh-7rem)] bg-background/95 backdrop-blur-xl border border-border rounded-xl shadow-xl flex flex-col overflow-hidden"
      data-testid="company-list-panel"
    >
      <div className="p-2.5 border-b border-border space-y-2">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Filter..."
              className="h-7 pl-7 text-xs bg-muted/50 border-0"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              data-testid="input-filter-panel"
            />
          </div>
          <Button
            variant={hasActiveFilters ? 'default' : 'ghost'}
            size="sm"
            className="h-7 w-7 p-0 shrink-0"
            onClick={() => setShowFilters(!showFilters)}
            data-testid="toggle-filters"
          >
            <Filter className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 shrink-0"
            onClick={() => setIsCollapsed(true)}
            data-testid="collapse-company-list"
          >
            <Minus className="w-3.5 h-3.5" />
          </Button>
        </div>

        {showFilters && (
          <div className="space-y-2 pt-1">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground flex items-center gap-1"><DollarSign className="h-2.5 w-2.5" />Revenue</span>
                <span className="font-medium">
                  {revenueFilterRange[0] === 0 && revenueFilterRange[1] === 100 ? 'All' : `$${revenueFilterRange[0] * 50}M–$${revenueFilterRange[1] >= 100 ? '5B+' : `${revenueFilterRange[1] * 50}M`}`}
                </span>
              </div>
              <Slider value={revenueFilterRange} onValueChange={(v) => setRevenueFilterRange(v as [number, number])} min={0} max={100} step={1} className="cursor-pointer" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground flex items-center gap-1"><Users className="h-2.5 w-2.5" />Employees</span>
                <span className="font-medium">
                  {employeeFilterRange[0] === 0 && employeeFilterRange[1] === 100 ? 'All' : `${(employeeFilterRange[0] * 100).toLocaleString()}–${employeeFilterRange[1] >= 100 ? '10K+' : (employeeFilterRange[1] * 100).toLocaleString()}`}
                </span>
              </div>
              <Slider value={employeeFilterRange} onValueChange={(v) => setEmployeeFilterRange(v as [number, number])} min={0} max={100} step={1} className="cursor-pointer" />
            </div>
          </div>
        )}

        <div className="flex gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{filteredCountries.length}</span>
          <span className="flex items-center gap-0.5"><Building2 className="h-2.5 w-2.5" />{totalCompanies}</span>
          <span className="flex items-center gap-0.5"><User className="h-2.5 w-2.5" />{totalExecs}</span>
        </div>
      </div>

      {discoveryStatus && discoveryStatus !== 'complete' && (
        <div className={`mx-2 mt-2 p-2 rounded-lg border flex items-start gap-1.5 text-xs ${
          discoveryStatus === 'degraded' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
        }`}>
          {discoveryStatus === 'degraded' ? <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" /> : <Info className="h-3 w-3 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />}
          <div className="flex-1 min-w-0">
            <p className="font-medium">{discoveryStatus === 'degraded' ? 'Limited results' : 'Partial results'}</p>
            {degradationReasons?.[0] && <p className="text-muted-foreground mt-0.5">{degradationReasons[0]}</p>}
          </div>
          <button onClick={() => clearDiscoveryStatus()} className="text-muted-foreground hover:text-foreground shrink-0"><X className="h-3 w-3" /></button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-1.5 space-y-0.5">
          {filteredCountries.map(country => {
            const isExpanded = expandedCountries.has(country.name);
            const knownRev = country.companies.filter((c: any) => c.revenue_usd > 0);
            const totalRev = knownRev.reduce((s: number, c: any) => s + (c.revenue_usd || 0), 0);
            const isHidden = hiddenCountries.has(country.name);

            return (
              <div key={country.name} className="rounded-lg">
                <div
                  className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer rounded-md hover:bg-muted/50 transition-colors group/country"
                  onClick={() => toggleCountry(country.name)}
                  data-testid={`row-country-${country.name}`}
                >
                  <ChevronRight className={`h-3 w-3 shrink-0 transition-transform text-muted-foreground ${isExpanded ? 'rotate-90' : ''}`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold truncate block">{country.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {country.companies.length} co{totalRev > 0 ? ` · $${(totalRev / 1e9).toFixed(1)}B` : ''}
                    </span>
                  </div>
                  <button onClick={e => { e.stopPropagation(); toggleCountryVisibility(country.name); }}
                    className={`p-1 rounded opacity-0 group-hover/country:opacity-100 transition-all ${isHidden ? 'text-muted-foreground/50' : 'text-primary/70'}`}>
                    {isHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                </div>

                {isExpanded && (
                  <div className="ml-3 pl-2 border-l border-border/40 space-y-0.5 py-0.5">
                    {country.companies.map((company: any) => {
                      const isCExpanded = expandedCompanies.has(company.id);
                      const isSelected = selectedCompanyId === company.id;
                      const companyColor = company.color || '#1e3a8a';
                      const isCHidden = hiddenCompanies.has(company.id) || isHidden;
                      const companyStatusExcluded = company.status === 'Off-Limits';
                      const allExecsExcluded = company.executives.length > 0 && company.executives.every((e: any) => e.availability === 'Off-Limits');
                      const isCompanyExcluded = companyStatusExcluded || allExecsExcluded;

                      return (
                        <div key={company.id} className="group/company">
                          <div
                            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-all text-xs ${
                              isSelected ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-muted/40'
                            } ${isCompanyExcluded ? 'opacity-40' : ''}`}
                            onClick={() => { toggleCompanyExpand(company.id); selectCompany(company.id); }}
                            data-testid={`row-company-${company.id}`}
                          >
                            <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${isSelected ? 'text-primary' : 'text-muted-foreground'} ${isCExpanded ? 'rotate-90' : ''}`} />
                            <div className="flex-1 min-w-0">
                              <div className={`font-medium truncate ${isSelected ? 'text-primary' : ''}`}>{company.name}</div>
                              <div className="text-[10px] text-muted-foreground truncate">
                                {company.revenue_usd ? `$${(company.revenue_usd / 1e9).toFixed(1)}B · ` : ''}{company.employees ? `${company.employees.toLocaleString()} emp · ` : ''}{company.executives.length} exec
                              </div>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/company:opacity-100">
                              <button onClick={e => { e.stopPropagation(); toggleCompanyVisibility(company.id); }}
                                className={`p-0.5 rounded ${isCHidden ? 'text-muted-foreground/50' : 'text-primary/70'}`}>
                                {isCHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                              </button>
                              <button onClick={e => handleDeleteCompany(e, company.id, company.name)}
                                className="p-0.5 rounded hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                            </div>
                          </div>

                          {isCExpanded && company.executives.map((exec: any) => {
                            const isExecSel = selectedExecutiveId === exec.id;
                            const isFormerExec = /\b(ex|former|fmr|prev|past)\b/i.test(exec.title || '');
                            const isExecExcluded = isFormerExec ? false : (exec.availability === 'Out of Scope' || exec.availability === 'Off-Limits' || exec.availability === 'Not Interested') || companyStatusExcluded;
                            return (
                              <div key={exec.id}
                                className={`flex items-center gap-1.5 ml-5 pl-2 border-l border-border/30 px-2 py-1 rounded-sm cursor-pointer text-xs group/exec ${
                                  isExecSel ? 'bg-primary/10' : 'hover:bg-muted/30'
                                } ${isExecExcluded ? 'opacity-40' : ''}`}
                                onClick={e => { e.stopPropagation(); selectCompany(company.id); selectExecutive(exec.id); }}
                                data-testid={`exec-${exec.id}`}
                              >
                                <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${exec.isEnriched ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-muted'}`}>
                                  <User className={`h-2.5 w-2.5 ${exec.isEnriched ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1">
                                    <span className="font-medium truncate">{exec.name}</span>
                                    {exec.isEnriched && <Sparkles className="h-2.5 w-2.5 text-emerald-500 shrink-0" />}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground truncate">{exec.title}</div>
                                </div>
                                <button onClick={e => handleDeleteExecutive(e, exec.id, exec.name)}
                                  className="opacity-0 group-hover/exec:opacity-100 p-0.5 rounded hover:text-destructive"><Trash2 className="h-2.5 w-2.5" /></button>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {filteredCountries.length === 0 && (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {searchFilter ? 'No matches found' : 'No companies yet'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
