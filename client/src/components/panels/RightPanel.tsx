import { useAppStore } from '@/lib/store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ExternalLink, MapPin, DollarSign, Users, X } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function RightPanel() {
  const { selectedCompanyId, companies, executives, selectCompany, updateCompany, addExecutive, scalingMetric, setScalingMetric } = useAppStore();
  const [isEditing, setIsEditing] = useState(false);

  const company = companies.find(c => c.id === selectedCompanyId);
  const companyExecutives = executives.filter(e => e.company_id === selectedCompanyId);

  // Reset editing state when selection changes
  useEffect(() => {
    setIsEditing(false);
  }, [selectedCompanyId]);

  if (!company) {
    return null;
  }

  const handleAddExecutive = () => {
    addExecutive({
      id: `new-exec-${Date.now()}`,
      company_id: company.id,
      name: 'New Executive',
      title: 'Position TBD',
      source: 'Manual',
      confidence: 'Medium'
    });
  };

  return (
    <div className="h-full w-96 bg-background/95 backdrop-blur-sm border-l border-border flex flex-col shadow-xl z-20 animate-in slide-in-from-right-10 duration-300">
      
      {/* Header Actions */}
      <div className="p-4 border-b border-border flex justify-between items-center bg-muted/10">
        <Button variant="ghost" size="icon" onClick={() => selectCompany(null)} className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive">
          <X className="h-4 w-4" />
        </Button>
        <div className="flex gap-2">
             <Button 
                variant={isEditing ? "default" : "outline"} 
                size="sm" 
                onClick={() => setIsEditing(!isEditing)}
                className="text-xs h-8"
              >
                {isEditing ? 'Done' : 'Edit Data'}
              </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 p-6">
        {/* Company Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
             <Badge variant="outline" className="rounded-sm font-normal text-xs uppercase tracking-wide text-muted-foreground border-muted-foreground/30">
               {company.industry}
             </Badge>
             <Badge variant="secondary" className={`rounded-sm font-normal text-xs uppercase tracking-wide ${company.confidence === 'High' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
               {company.confidence} Confidence
             </Badge>
          </div>
          
          {isEditing ? (
             <Input 
                value={company.name} 
                onChange={(e) => updateCompany(company.id, { name: e.target.value })}
                className="text-2xl font-serif font-bold mb-2 h-auto py-1 px-2 -ml-2 border-dashed border-primary/50" 
             />
          ) : (
             <h1 className="text-2xl font-serif font-bold text-foreground mb-1">{company.name}</h1>
          )}

          <div className="flex items-center text-sm text-muted-foreground gap-1">
            <MapPin className="w-3 h-3" />
            {company.hq_city}, {company.hq_country}
          </div>
        </div>

        {/* Interactive Metric Cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
           <div 
             onClick={() => setScalingMetric('revenue')}
             className={`
                p-3 rounded border cursor-pointer transition-all duration-200 group relative
                ${scalingMetric === 'revenue' 
                  ? 'bg-primary/5 border-primary shadow-sm ring-1 ring-primary/20' 
                  : 'bg-muted/30 border-border/50 hover:bg-muted/50 hover:border-primary/30'}
             `}
           >
             <div className={`text-xs uppercase tracking-wider mb-1 flex items-center gap-1 ${scalingMetric === 'revenue' ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
               <DollarSign className="w-3 h-3" /> Revenue
             </div>
             
             {isEditing ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <Input 
                    type="number"
                    value={company.revenue_usd}
                    onChange={(e) => updateCompany(company.id, { revenue_usd: Number(e.target.value) })}
                    className="h-7 text-xs font-mono font-medium mt-1 bg-background"
                  />
                  <div className="text-[10px] text-muted-foreground mt-1">
                    ${(company.revenue_usd / 1000000000).toFixed(2)}B
                  </div>
                </div>
             ) : (
                <div className="text-lg font-mono font-medium">
                  ${(company.revenue_usd / 1000000000).toFixed(2)}B
                </div>
             )}

             {scalingMetric === 'revenue' && !isEditing && (
                <div className="text-[10px] text-primary mt-1 font-medium">Map Scaling Active</div>
             )}
           </div>

           <div 
             onClick={() => setScalingMetric('employees')}
             className={`
                p-3 rounded border cursor-pointer transition-all duration-200 group relative
                ${scalingMetric === 'employees' 
                  ? 'bg-primary/5 border-primary shadow-sm ring-1 ring-primary/20' 
                  : 'bg-muted/30 border-border/50 hover:bg-muted/50 hover:border-primary/30'}
             `}
           >
             <div className={`text-xs uppercase tracking-wider mb-1 flex items-center gap-1 ${scalingMetric === 'employees' ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
               <Users className="w-3 h-3" /> Employees
             </div>
             
             {isEditing ? (
               <div onClick={(e) => e.stopPropagation()}>
                 <Input 
                    type="number"
                    value={company.employees}
                    onChange={(e) => updateCompany(company.id, { employees: Number(e.target.value) })}
                    className="h-7 text-xs font-mono font-medium mt-1 bg-background"
                  />
               </div>
             ) : (
                <div className="text-lg font-mono font-medium">
                  {company.employees.toLocaleString()}
                </div>
             )}

             {scalingMetric === 'employees' && !isEditing && (
                <div className="text-[10px] text-primary mt-1 font-medium">Map Scaling Active</div>
             )}
           </div>
        </div>

        <Separator className="my-6" />

        {/* Executives Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif font-semibold text-lg">Key Executives</h3>
            <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 text-xs text-primary hover:bg-primary/10"
                onClick={handleAddExecutive}
            >
                Add New
            </Button>
          </div>

          <div className="space-y-3">
            {companyExecutives.map(exec => (
              <div key={exec.id} className="group p-3 rounded border border-border hover:border-primary/30 hover:bg-muted/30 transition-all bg-card shadow-sm">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-semibold text-sm">{exec.name}</span>
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal bg-background">
                    {exec.source}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground font-medium mb-2">{exec.title}</div>
                
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                   <Button variant="ghost" size="icon" className="h-6 w-6"><ExternalLink className="h-3 w-3" /></Button>
                </div>
              </div>
            ))}
            
            {companyExecutives.length === 0 && (
              <div className="text-center p-4 border border-dashed border-border rounded text-sm text-muted-foreground">
                No executives identified yet.
              </div>
            )}
          </div>
        </div>

        <Separator className="my-6" />

        {/* Source Links */}
        <div>
          <h3 className="font-serif font-semibold text-lg mb-3">Sources</h3>
          <div className="space-y-2">
            <a href="#" className="block text-xs text-primary hover:underline truncate flex items-center gap-2">
              <ExternalLink className="w-3 h-3" />
              en.wikipedia.org/wiki/{company.name.replace(/\s+/g, '_')}
            </a>
            <a href="#" className="block text-xs text-primary hover:underline truncate flex items-center gap-2">
              <ExternalLink className="w-3 h-3" />
              www.bloomberg.com/quote/{company.name.substring(0, 4)}:US
            </a>
          </div>
        </div>

      </ScrollArea>
    </div>
  );
}
