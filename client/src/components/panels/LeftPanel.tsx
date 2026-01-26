import { useAppStore } from '@/lib/store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Building2, User, MapPin, Globe } from 'lucide-react';
import { useState, useMemo } from 'react';

interface CountryData {
  name: string;
  companies: {
    id: string;
    name: string;
    revenue_usd: number;
    employees: number;
    confidence: number;
    hq_city: string;
    executives: {
      id: string;
      name: string;
      title: string;
      confidence: number;
      profileUrl?: string;
    }[];
  }[];
}

interface LeftPanelProps {
  width?: number;
  isOpen?: boolean;
  onToggle?: () => void;
}

export default function LeftPanel({ width = 360, isOpen = true, onToggle }: LeftPanelProps) {
  const { companies, executives, selectCompany, selectedCompanyId } = useAppStore();
  const [searchFilter, setSearchFilter] = useState('');
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set());
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());

  const countriesData = useMemo(() => {
    const countryMap = new Map<string, CountryData>();
    
    companies.forEach(company => {
      const countryName = company.hq_country || 'Unknown';
      
      if (!countryMap.has(countryName)) {
        countryMap.set(countryName, {
          name: countryName,
          companies: []
        });
      }
      
      const companyExecs = executives
        .filter(e => e.company_id === company.id)
        .map(e => ({
          id: e.id,
          name: e.name,
          title: e.title,
          confidence: e.confidence,
          profileUrl: e.profileUrl
        }));
      
      countryMap.get(countryName)!.companies.push({
        id: company.id,
        name: company.name,
        revenue_usd: company.revenue_usd,
        employees: company.employees,
        confidence: company.confidence,
        hq_city: company.hq_city,
        executives: companyExecs
      });
    });

    const sorted = Array.from(countryMap.values()).sort((a, b) => {
      const revenueA = a.companies.reduce((sum, c) => sum + c.revenue_usd, 0);
      const revenueB = b.companies.reduce((sum, c) => sum + c.revenue_usd, 0);
      return revenueB - revenueA;
    });

    sorted.forEach(country => {
      country.companies.sort((a, b) => b.revenue_usd - a.revenue_usd);
    });

    return sorted;
  }, [companies, executives]);

  const filteredCountries = useMemo(() => {
    let result = countriesData;
    
    if (searchFilter.trim()) {
      const filter = searchFilter.toLowerCase();
      result = result
        .map(country => ({
          ...country,
          companies: country.companies.filter(c => 
            c.name.toLowerCase().includes(filter) ||
            country.name.toLowerCase().includes(filter) ||
            c.executives.some(e => e.name.toLowerCase().includes(filter) || e.title.toLowerCase().includes(filter))
          )
        }))
        .filter(country => country.companies.length > 0 || country.name.toLowerCase().includes(filter));
    }
    
    return result;
  }, [countriesData, searchFilter]);

  const displayedCountries = useMemo(() => {
    if (selectedCountries.size === 0) return filteredCountries;
    
    return filteredCountries
      .filter(country => selectedCountries.has(country.name))
      .map(country => ({
        ...country,
        companies: selectedCompanies.size > 0 
          ? country.companies.filter(c => selectedCompanies.has(c.id))
          : country.companies
      }))
      .filter(country => country.companies.length > 0);
  }, [filteredCountries, selectedCountries, selectedCompanies]);

  const toggleCountry = (countryName: string) => {
    setExpandedCountries(prev => {
      const next = new Set(prev);
      if (next.has(countryName)) {
        next.delete(countryName);
      } else {
        next.add(countryName);
      }
      return next;
    });
  };

  const toggleCompany = (companyId: string) => {
    setExpandedCompanies(prev => {
      const next = new Set(prev);
      if (next.has(companyId)) {
        next.delete(companyId);
      } else {
        next.add(companyId);
      }
      return next;
    });
  };

  const toggleCountrySelection = (countryName: string) => {
    setSelectedCountries(prev => {
      const next = new Set(prev);
      if (next.has(countryName)) {
        next.delete(countryName);
        const country = countriesData.find(c => c.name === countryName);
        if (country) {
          country.companies.forEach(comp => {
            setSelectedCompanies(p => {
              const n = new Set(p);
              n.delete(comp.id);
              return n;
            });
          });
        }
      } else {
        next.add(countryName);
        setExpandedCountries(p => new Set(Array.from(p).concat(countryName)));
      }
      return next;
    });
  };

  const toggleCompanySelection = (companyId: string, countryName: string) => {
    setSelectedCompanies(prev => {
      const next = new Set(prev);
      if (next.has(companyId)) {
        next.delete(companyId);
      } else {
        next.add(companyId);
        setExpandedCompanies(p => new Set(Array.from(p).concat(companyId)));
        setSelectedCountries(p => new Set(Array.from(p).concat(countryName)));
      }
      return next;
    });
  };

  const totalCompanies = companies.length;
  const totalExecutives = executives.length;
  const selectedCount = selectedCompanies.size;

  return (
    <div 
      className={`
        h-full bg-background/95 backdrop-blur-sm border-r border-border flex flex-col shadow-xl z-10 transition-all duration-300 relative shrink-0
        ${!isOpen ? 'w-0 border-r-0' : ''}
      `}
      style={{ width: isOpen ? width : 0, minWidth: isOpen ? 280 : 0 }}
    >
      <Button
        variant="secondary"
        size="icon"
        onClick={onToggle}
        className="absolute -right-8 top-4 h-8 w-8 rounded-l-none rounded-r-md border border-l-0 border-border shadow-md z-50 flex items-center justify-center bg-background"
        aria-label={isOpen ? "Collapse panel" : "Expand panel"}
        data-testid="button-toggle-left-panel"
      >
        {isOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </Button>

      <div className={`flex flex-col h-full overflow-hidden ${!isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <div className="p-4 border-b border-border min-w-[280px]">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-serif font-bold text-foreground">Results by Region</h2>
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {displayedCountries.length} countries
            </span>
            <span className="flex items-center gap-1">
              <Building2 className="h-3 w-3" /> {totalCompanies} companies
            </span>
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" /> {totalExecutives} executives
            </span>
          </div>
        </div>

        <div className="p-3 border-b border-border bg-muted/30 min-w-[280px]">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search countries, companies, executives..." 
              className="pl-9 h-9 text-sm bg-background"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              data-testid="input-filter-panel"
            />
          </div>
          {selectedCount > 0 && (
            <div className="mt-2 text-xs text-primary font-medium">
              {selectedCount} company{selectedCount > 1 ? 'ies' : ''} selected
            </div>
          )}
        </div>

        <ScrollArea className="flex-1 w-full">
          <div className="p-2 space-y-1 min-w-[280px]">
            {displayedCountries.map((country) => {
              const isCountryExpanded = expandedCountries.has(country.name);
              const isCountrySelected = selectedCountries.has(country.name);
              const totalRevenue = country.companies.reduce((sum, c) => sum + c.revenue_usd, 0);
              
              return (
                <div key={country.name} className="rounded-lg overflow-hidden">
                  <div
                    className={`
                      flex items-center gap-2 p-3 cursor-pointer transition-all duration-200 rounded-lg
                      ${isCountrySelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50 border border-transparent'}
                    `}
                  >
                    <Checkbox
                      checked={isCountrySelected}
                      onCheckedChange={() => toggleCountrySelection(country.name)}
                      className="shrink-0"
                      data-testid={`checkbox-country-${country.name}`}
                    />
                    <div 
                      className="flex-1 flex items-center gap-2 min-w-0"
                      onClick={() => toggleCountry(country.name)}
                      data-testid={`row-country-${country.name}`}
                    >
                      <ChevronRight className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isCountrySelected ? 'text-primary' : 'text-muted-foreground'} ${isCountryExpanded ? 'rotate-90' : ''}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className={`font-semibold text-sm truncate ${isCountrySelected ? 'text-primary' : ''}`}>
                            {country.name}
                          </span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {country.companies.length} {country.companies.length === 1 ? 'company' : 'companies'}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          ${(totalRevenue / 1000000000).toFixed(1)}B total revenue
                        </div>
                      </div>
                      <ChevronRight className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${isCountryExpanded ? 'rotate-90' : ''}`} />
                    </div>
                  </div>

                  {isCountryExpanded && (
                    <div className="ml-4 pl-4 border-l-2 border-border/50 space-y-1 py-1">
                      {country.companies.map((company) => {
                        const isCompanyExpanded = expandedCompanies.has(company.id);
                        const isCompanySelected = selectedCompanies.has(company.id);
                        const isHighlighted = selectedCompanyId === company.id;
                        
                        return (
                          <div key={company.id}>
                            <div
                              className={`
                                flex items-center gap-2 p-2.5 rounded-md cursor-pointer transition-all duration-200
                                ${isHighlighted ? 'bg-accent/20 border border-accent/40' : 
                                  isCompanySelected ? 'bg-primary/5 border border-primary/20' : 
                                  'hover:bg-muted/40 border border-transparent'}
                              `}
                            >
                              <Checkbox
                                checked={isCompanySelected}
                                onCheckedChange={() => toggleCompanySelection(company.id, country.name)}
                                className="shrink-0"
                                data-testid={`checkbox-company-${company.id}`}
                              />
                              <div 
                                className="flex-1 flex items-center gap-2 min-w-0"
                                onClick={() => {
                                  toggleCompany(company.id);
                                  selectCompany(company.id);
                                }}
                                data-testid={`row-company-${company.id}`}
                              >
                                <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${isHighlighted ? 'text-accent' : isCompanySelected ? 'text-primary' : 'text-muted-foreground'} ${isCompanyExpanded ? 'rotate-90' : ''}`} />
                                <div className="flex-1 min-w-0">
                                  <div className={`font-medium text-sm truncate ${isHighlighted ? 'text-accent' : isCompanySelected ? 'text-primary' : ''}`}>
                                    {company.name}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span>${(company.revenue_usd / 1000000000).toFixed(1)}B</span>
                                    <span>•</span>
                                    <span>{company.executives.length} exec{company.executives.length !== 1 ? 's' : ''}</span>
                                  </div>
                                </div>
                                {company.executives.length > 0 && (
                                  <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200 ${isCompanyExpanded ? 'rotate-90' : ''}`} />
                                )}
                              </div>
                            </div>

                            {isCompanyExpanded && company.executives.length > 0 && (
                              <div className="ml-5 pl-3 border-l border-border/30 space-y-0.5 py-1">
                                {company.executives.map((exec) => (
                                  <div
                                    key={exec.id}
                                    className="flex items-center gap-2 p-2 rounded hover:bg-muted/30 transition-colors cursor-pointer group"
                                    onClick={() => exec.profileUrl && window.open(exec.profileUrl, '_blank')}
                                    data-testid={`exec-${exec.id}`}
                                  >
                                    <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                                      <User className="h-3 w-3 text-muted-foreground" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-medium truncate group-hover:text-primary transition-colors">
                                        {exec.name}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground truncate">
                                        {exec.title}
                                      </div>
                                    </div>
                                    <span className={`text-[9px] font-bold ${exec.confidence >= 7 ? 'text-green-600' : exec.confidence >= 4 ? 'text-amber-600' : 'text-red-500'}`}>
                                      {exec.confidence}/10
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {displayedCountries.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Globe className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No results found</p>
                <p className="text-xs mt-1">Try a different search term</p>
              </div>
            )}
          </div>
        </ScrollArea>
        
        <div className="p-2 border-t border-border bg-muted/20 text-[10px] text-center text-muted-foreground min-w-[280px]">
          {displayedCountries.reduce((sum, c) => sum + c.companies.length, 0)} Companies in {displayedCountries.length} Countries
        </div>
      </div>
    </div>
  );
}
