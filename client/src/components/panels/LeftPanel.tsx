import { useAppStore } from '@/lib/store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, ChevronLeft, ChevronRight, Building2, User, MapPin, Trash2, Plus, X } from 'lucide-react';
import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import logoImage from '@/assets/images/logo.png';
import L from 'leaflet';

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
  const { companies, executives, selectCompany, selectedCompanyId, deleteCompany, addCompany, deleteExecutive, addExecutive, currentProject } = useAppStore();
  const [searchFilter, setSearchFilter] = useState('');
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set());
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddExecForm, setShowAddExecForm] = useState<string | null>(null);
  const [newCompany, setNewCompany] = useState({
    name: '',
    hq_city: '',
    hq_country: '',
    revenue_usd: '',
    employees: ''
  });
  const [newExecutive, setNewExecutive] = useState({
    name: '',
    title: ''
  });
  const [isAdding, setIsAdding] = useState(false);
  const [isAddingExec, setIsAddingExec] = useState(false);

  const handleDeleteCompany = async (e: React.MouseEvent, companyId: string, companyName: string) => {
    e.stopPropagation();
    if (!confirm(`Delete "${companyName}" from results?`)) return;
    
    try {
      await fetch(`/api/companies/${companyId}`, { method: 'DELETE' });
      deleteCompany(companyId);
      toast.success(`Removed ${companyName}`);
    } catch (error) {
      toast.error('Failed to delete company');
    }
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProject?.id || !newCompany.name.trim()) {
      toast.error('Please enter a company name');
      return;
    }

    setIsAdding(true);
    try {
      const response = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCompany.name,
          hqCity: newCompany.hq_city || 'Unknown',
          hqCountry: newCompany.hq_country || 'Unknown',
          revenueUsd: parseFloat(newCompany.revenue_usd) || 0,
          employees: parseInt(newCompany.employees) || 0,
          lat: 0,
          lng: 0,
          confidence: 5,
          searchQueryId: parseInt(currentProject.id)
        })
      });

      if (!response.ok) throw new Error('Failed to add company');
      
      const created = await response.json();
      addCompany({
        id: String(created.id),
        name: created.name,
        industry: created.industry || '',
        hq_city: created.hqCity || 'Unknown',
        hq_country: created.hqCountry || 'Unknown',
        lat: created.lat || 0,
        lng: created.lng || 0,
        revenue_usd: created.revenueUsd || 0,
        employees: created.employees || 0,
        confidence: created.confidence || 5
      });
      
      setNewCompany({ name: '', hq_city: '', hq_country: '', revenue_usd: '', employees: '' });
      setShowAddForm(false);
      toast.success(`Added ${created.name}`);
    } catch (error) {
      toast.error('Failed to add company');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteExecutive = async (e: React.MouseEvent, execId: string, execName: string) => {
    e.stopPropagation();
    if (!confirm(`Delete "${execName}" from results?`)) return;
    
    try {
      await fetch(`/api/executives/${execId}`, { method: 'DELETE' });
      deleteExecutive(execId);
      toast.success(`Removed ${execName}`);
    } catch (error) {
      toast.error('Failed to delete executive');
    }
  };

  const handleAddExecutive = async (e: React.FormEvent, companyId: string) => {
    e.preventDefault();
    if (!newExecutive.name.trim()) {
      toast.error('Please enter an executive name');
      return;
    }

    setIsAddingExec(true);
    try {
      const response = await fetch('/api/executives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newExecutive.name,
          title: newExecutive.title || 'Executive',
          companyId: parseInt(companyId),
          confidence: 5,
          source: 'manual'
        })
      });

      if (!response.ok) throw new Error('Failed to add executive');
      
      const created = await response.json();
      addExecutive({
        id: String(created.id),
        company_id: companyId,
        name: created.name,
        title: created.title || 'Executive',
        source: 'manual',
        confidence: created.confidence || 5
      });
      
      setNewExecutive({ name: '', title: '' });
      setShowAddExecForm(null);
      toast.success(`Added ${created.name}`);
    } catch (error) {
      toast.error('Failed to add executive');
    } finally {
      setIsAddingExec(false);
    }
  };

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

  const toggleCountry = (countryName: string) => {
    setExpandedCountries(prev => {
      const next = new Set(prev);
      if (next.has(countryName)) {
        next.delete(countryName);
      } else {
        next.add(countryName);
        
        // Pan and zoom map to this country
        const country = countriesData.find(c => c.name === countryName);
        if (country && country.companies.length > 0) {
          const map = (window as any).leafletMap;
          if (map) {
            const validCoords = country.companies
              .filter(c => c.lat !== 0 || c.lng !== 0)
              .map(c => [c.lat, c.lng] as [number, number]);
              
            if (validCoords.length > 0) {
              const bounds = L.latLngBounds(validCoords);
              map.fitBounds(bounds, { padding: [50, 50], maxZoom: 8, animate: true });
            }
          }
        }
      }
      
      // If no countries are expanded, zoom out to fit all companies
      if (next.size === 0) {
        const map = (window as any).leafletMap;
        if (map && companies.length > 0) {
          const validCoords = companies
            .filter(c => c.lat !== 0 || c.lng !== 0)
            .map(c => [c.lat, c.lng] as [number, number]);
            
          if (validCoords.length > 0) {
            const bounds = L.latLngBounds(validCoords);
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12, animate: true });
          }
        }
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

  const totalCompanies = companies.length;
  const totalExecutives = executives.length;

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
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <img src={logoImage} alt="Logo" className="h-6 w-auto" />
              <h2 className="text-lg font-serif font-bold text-foreground">Results</h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(!showAddForm)}
              className="h-7 px-2 text-xs"
              data-testid="button-add-company"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {filteredCountries.length} countries
            </span>
            <span className="flex items-center gap-1">
              <Building2 className="h-3 w-3" /> {totalCompanies} companies
            </span>
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" /> {totalExecutives} executives
            </span>
          </div>
          
          {showAddForm && (
            <form onSubmit={handleAddCompany} className="mt-3 p-3 bg-muted/30 rounded-lg border border-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Add New Company</span>
                <button type="button" onClick={() => setShowAddForm(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <Input
                placeholder="Company name *"
                value={newCompany.name}
                onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })}
                className="h-8 text-xs"
                data-testid="input-new-company-name"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="City"
                  value={newCompany.hq_city}
                  onChange={(e) => setNewCompany({ ...newCompany, hq_city: e.target.value })}
                  className="h-8 text-xs"
                />
                <Input
                  placeholder="Country"
                  value={newCompany.hq_country}
                  onChange={(e) => setNewCompany({ ...newCompany, hq_country: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Revenue (USD)"
                  type="number"
                  value={newCompany.revenue_usd}
                  onChange={(e) => setNewCompany({ ...newCompany, revenue_usd: e.target.value })}
                  className="h-8 text-xs"
                />
                <Input
                  placeholder="Employees"
                  type="number"
                  value={newCompany.employees}
                  onChange={(e) => setNewCompany({ ...newCompany, employees: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <Button type="submit" size="sm" className="w-full h-8 text-xs" disabled={isAdding} data-testid="button-submit-add-company">
                {isAdding ? 'Adding...' : 'Add Company'}
              </Button>
            </form>
          )}
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
        </div>

        <ScrollArea className="flex-1 w-full">
          <div className="p-2 space-y-1 min-w-[280px]">
            {filteredCountries.map((country) => {
              const isCountryExpanded = expandedCountries.has(country.name);
              const totalRevenue = country.companies.reduce((sum, c) => sum + c.revenue_usd, 0);
              
              return (
                <div key={country.name} className="rounded-lg overflow-hidden">
                  <div
                    className="flex items-center gap-2 p-3 cursor-pointer transition-all duration-200 rounded-lg hover:bg-muted/50 border border-transparent"
                    onClick={() => toggleCountry(country.name)}
                    data-testid={`row-country-${country.name}`}
                  >
                    <ChevronRight className={`h-4 w-4 shrink-0 transition-transform duration-200 text-muted-foreground ${isCountryExpanded ? 'rotate-90' : ''}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm truncate">
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
                  </div>

                  {isCountryExpanded && (
                    <div className="ml-4 pl-4 border-l-2 border-border/50 space-y-1 py-1">
                      {country.companies.map((company) => {
                        const isCompanyExpanded = expandedCompanies.has(company.id);
                        const isHighlighted = selectedCompanyId === company.id;
                        
                        return (
                          <div key={company.id} className="group/company">
                            <div
                              className={`
                                flex items-center gap-2 p-2.5 rounded-md cursor-pointer transition-all duration-200
                                ${isHighlighted ? 'bg-accent/20 border border-accent/40' : 'hover:bg-muted/40 border border-transparent'}
                              `}
                              onClick={() => {
                                toggleCompany(company.id);
                                selectCompany(company.id);
                              }}
                              data-testid={`row-company-${company.id}`}
                            >
                              <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${isHighlighted ? 'text-accent' : 'text-muted-foreground'} ${isCompanyExpanded ? 'rotate-90' : ''}`} />
                              <div className="flex-1 min-w-0">
                                <div className={`font-medium text-sm truncate ${isHighlighted ? 'text-accent' : ''}`}>
                                  {company.name}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>${(company.revenue_usd / 1000000000).toFixed(1)}B</span>
                                  <span>•</span>
                                  <span>{company.employees.toLocaleString()} employees</span>
                                  <span>•</span>
                                  <span>{company.executives.length} exec{company.executives.length !== 1 ? 's' : ''}</span>
                                </div>
                              </div>
                              <button
                                onClick={(e) => handleDeleteCompany(e, company.id, company.name)}
                                className="opacity-0 group-hover/company:opacity-100 p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-all shrink-0"
                                title="Delete company"
                                data-testid={`button-delete-company-${company.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            {isCompanyExpanded && (
                              <div className="ml-5 pl-3 border-l border-border/30 space-y-0.5 py-1">
                                {company.executives.map((exec) => (
                                  <div
                                    key={exec.id}
                                    className="flex items-center gap-2 p-2 rounded hover:bg-muted/30 transition-colors cursor-pointer group/exec"
                                    onClick={() => exec.profileUrl && window.open(exec.profileUrl, '_blank')}
                                    data-testid={`exec-${exec.id}`}
                                  >
                                    <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                                      <User className="h-3 w-3 text-muted-foreground" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-medium truncate group-hover/exec:text-primary transition-colors">
                                        {exec.name}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground truncate">
                                        {exec.title}
                                      </div>
                                    </div>
                                    <span className={`text-[9px] font-bold ${exec.confidence >= 7 ? 'text-green-600' : exec.confidence >= 4 ? 'text-amber-600' : 'text-red-500'}`}>
                                      {exec.confidence}/10
                                    </span>
                                    <button
                                      onClick={(e) => handleDeleteExecutive(e, exec.id, exec.name)}
                                      className="opacity-0 group-hover/exec:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all shrink-0"
                                      title="Delete executive"
                                      data-testid={`button-delete-exec-${exec.id}`}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                ))}
                                
                                {showAddExecForm === company.id ? (
                                  <form onSubmit={(e) => handleAddExecutive(e, company.id)} className="p-2 bg-muted/20 rounded space-y-1.5">
                                    <Input
                                      placeholder="Name *"
                                      value={newExecutive.name}
                                      onChange={(e) => setNewExecutive({ ...newExecutive, name: e.target.value })}
                                      className="h-7 text-xs"
                                      autoFocus
                                    />
                                    <Input
                                      placeholder="Title"
                                      value={newExecutive.title}
                                      onChange={(e) => setNewExecutive({ ...newExecutive, title: e.target.value })}
                                      className="h-7 text-xs"
                                    />
                                    <div className="flex gap-1">
                                      <Button type="submit" size="sm" className="h-6 text-[10px] flex-1" disabled={isAddingExec}>
                                        {isAddingExec ? 'Adding...' : 'Add'}
                                      </Button>
                                      <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setShowAddExecForm(null)}>
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </form>
                                ) : (
                                  <button
                                    onClick={() => setShowAddExecForm(company.id)}
                                    className="w-full flex items-center gap-1 p-2 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                                    data-testid={`button-add-exec-${company.id}`}
                                  >
                                    <Plus className="h-3 w-3" />
                                    Add Executive
                                  </button>
                                )}
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

            {filteredCountries.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <img src={logoImage} alt="Logo" className="h-10 w-auto mx-auto mb-2 opacity-50" />
                <p className="text-sm">No results found</p>
                <p className="text-xs mt-1">Try a different search term</p>
              </div>
            )}
          </div>
        </ScrollArea>
        
        <div className="p-2 border-t border-border bg-muted/20 text-[10px] text-center text-muted-foreground min-w-[280px]">
          {filteredCountries.reduce((sum, c) => sum + c.companies.length, 0)} Companies in {filteredCountries.length} Countries
        </div>
      </div>
    </div>
  );
}
