import { useAppStore } from '@/lib/store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Search, Plus, Filter, Briefcase } from 'lucide-react';

export default function LeftPanel() {
  const { companies, selectCompany, selectedCompanyId, addCompany } = useAppStore();

  const handleAddCompany = () => {
    addCompany({
      id: `manual-${Date.now()}`,
      name: 'New Manual Company',
      industry: 'Unknown',
      hq_city: 'London',
      hq_country: 'UK',
      lat: 51.5074,
      lng: -0.1278,
      revenue_usd: 100000000,
      employees: 50,
      confidence: 'Low',
      description: 'Manually added company.'
    });
  };

  const sortedCompanies = [...companies].sort((a, b) => b.revenue_usd - a.revenue_usd);

  return (
    <div className="h-full w-80 bg-background/95 backdrop-blur-sm border-r border-border flex flex-col shadow-xl z-10">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-serif font-bold text-foreground">Talent Map</h2>
        <div className="flex gap-2 mt-2">
           <Button variant="outline" size="sm" className="w-full text-xs font-medium">
             <Briefcase className="w-3 h-3 mr-2" /> Projects
           </Button>
           <Button 
             variant="default" 
             size="sm" 
             onClick={handleAddCompany}
             className="w-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
           >
             <Plus className="w-3 h-3 mr-2" /> New
           </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="p-4 border-b border-border bg-muted/30">
        <div className="relative mb-3">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Filter companies..." className="pl-8 h-9 text-sm bg-background" />
        </div>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Revenue Range</label>
            <Filter className="h-3 w-3 text-muted-foreground" />
          </div>
          <Slider defaultValue={[20]} max={100} step={1} className="py-2" />
        </div>
      </div>

      {/* Company List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {sortedCompanies.map((company) => (
            <div
              key={company.id}
              onClick={() => selectCompany(company.id)}
              className={`
                group flex items-start gap-3 p-3 rounded-md cursor-pointer transition-all duration-200 border border-transparent
                ${selectedCompanyId === company.id 
                  ? 'bg-primary/5 border-primary/20 shadow-sm' 
                  : 'hover:bg-muted/50 hover:border-border/50'}
              `}
            >
              <div className={`mt-1 h-2 w-2 rounded-full shrink-0 transition-colors ${selectedCompanyId === company.id ? 'bg-accent' : 'bg-muted-foreground/30'}`} />
              
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <h3 className={`font-semibold text-sm truncate ${selectedCompanyId === company.id ? 'text-primary' : 'text-foreground'}`}>
                    {company.name}
                  </h3>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground truncate">{company.hq_city}, {company.hq_country}</span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                    ${(company.revenue_usd / 1000000000).toFixed(1)}B
                  </span>
                  <span className={`text-[10px] uppercase font-bold tracking-wider ${company.confidence === 'High' ? 'text-green-600' : 'text-amber-600'}`}>
                    {company.confidence}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      
      {/* Footer Status */}
      <div className="p-2 border-t border-border bg-muted/20 text-[10px] text-center text-muted-foreground">
        {companies.length} Companies Identified • {new Date().toLocaleDateString()}
      </div>
    </div>
  );
}
