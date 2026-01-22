import { useAppStore } from '@/lib/store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Search, Plus, Filter, Briefcase, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

export default function LeftPanel() {
  const { companies, selectCompany, selectedCompanyId, addCompany, revenueFilter, setRevenueFilter } = useAppStore();
  const [isOpen, setIsOpen] = useState(false); // Default to retracted as requested

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

  // Filter companies based on revenue range slider (percentage of max revenue in set)
  // Or simpler: filter by > $X amount. Let's make slider 0-100 represent $100M to $50B
  const maxRevenue = 50000000000;
  const filterThreshold = (revenueFilter / 100) * maxRevenue;

  const filteredCompanies = companies
    .filter(c => c.revenue_usd >= filterThreshold)
    .sort((a, b) => b.revenue_usd - a.revenue_usd);

  return (
    <div 
      className={`
        h-full bg-background/95 backdrop-blur-sm border-r border-border flex flex-col shadow-xl z-10 transition-all duration-300 relative
        ${isOpen ? 'w-80' : 'w-0 border-r-0'}
      `}
    >
      {/* Retract/Expand Tab */}
      <Button
        variant="secondary"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="absolute -right-8 top-4 h-8 w-8 rounded-l-none rounded-r-md border border-l-0 border-border shadow-md z-50 flex items-center justify-center bg-background"
        aria-label={isOpen ? "Collapse panel" : "Expand panel"}
      >
        {isOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </Button>

      {/* Content Container - Only visible when open */}
      <div className={`flex flex-col h-full overflow-hidden ${!isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        {/* Header */}
        <div className="p-4 border-b border-border min-w-[320px]">
          <h2 className="text-lg font-serif font-bold text-foreground">Talent Map</h2>
          <div className="flex gap-2 mt-2 w-full pr-8">
             <Button 
               variant="default" 
               size="sm" 
               onClick={handleAddCompany}
               className="w-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
             >
               <Plus className="w-3 h-3 mr-2" /> Add Company
             </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-border bg-muted/30 min-w-[320px]">
          <div className="relative mb-3 w-full pr-8">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Filter companies..." className="pl-8 h-9 text-sm bg-background w-full" />
          </div>
          
          <div className="space-y-3 w-full pr-8">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Min Revenue</label>
              <span className="text-xs font-mono text-primary font-medium">
                 ${(filterThreshold / 1000000000).toFixed(1)}B+
              </span>
            </div>
            <Slider 
              value={[revenueFilter]} 
              onValueChange={(vals) => setRevenueFilter(vals[0])}
              max={100} 
              step={1} 
              className="py-2" 
            />
            <div className="flex justify-between text-[10px] text-muted-foreground px-1">
              <span>$100M</span>
              <span>$50B</span>
            </div>
          </div>
        </div>

        {/* Company List */}
        <ScrollArea className="flex-1 w-full">
          <div className="p-2 space-y-1 min-w-[320px]">
            {filteredCompanies.map((company) => (
              <div
                key={company.id}
                onClick={() => selectCompany(company.id)}
                className={`
                  group flex items-start gap-3 p-3 rounded-md cursor-pointer transition-all duration-200 border border-transparent w-[300px]
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
        <div className="p-2 border-t border-border bg-muted/20 text-[10px] text-center text-muted-foreground min-w-[320px]">
          {filteredCompanies.length} Companies • {new Date().toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}
