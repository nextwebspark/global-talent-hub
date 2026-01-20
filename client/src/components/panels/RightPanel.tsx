import { useAppStore } from '@/lib/store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ExternalLink, MapPin, DollarSign, Users, X, Edit2 } from 'lucide-react';
import { useState, useEffect } from 'react';

// Reusable editable component for double-click editing
const EditableField = ({ 
  value, 
  onSave, 
  className = "", 
  inputClassName = "",
  type = "text",
  displayFormatter
}: { 
  value: string | number, 
  onSave: (val: string | number) => void, 
  className?: string,
  inputClassName?: string,
  type?: string,
  displayFormatter?: (val: string | number) => React.ReactNode
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  // Sync temp value when prop changes (if not editing)
  useEffect(() => {
    if (!isEditing) setTempValue(value);
  }, [value, isEditing]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    onSave(tempValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    }
    if (e.key === 'Escape') {
      setIsEditing(false);
      setTempValue(value); // Revert
    }
  };

  if (isEditing) {
    return (
      <Input
        autoFocus
        type={type}
        value={tempValue}
        onChange={(e) => setTempValue(type === 'number' ? Number(e.target.value) : e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`h-auto py-1 px-2 -ml-2 border-primary/50 ${inputClassName}`}
        onClick={(e) => e.stopPropagation()} 
      />
    );
  }

  return (
    <div 
      onDoubleClick={handleDoubleClick} 
      className={`cursor-text hover:bg-muted/30 rounded px-1 -mx-1 transition-colors relative group ${className}`}
      title="Double click to edit"
    >
      {displayFormatter ? displayFormatter(value) : value}
      <Edit2 className="w-3 h-3 absolute -right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-20 pointer-events-none" />
    </div>
  );
};

export default function RightPanel() {
  const { selectedCompanyId, companies, executives, selectCompany, updateCompany, addExecutive, updateExecutive, scalingMetric, setScalingMetric } = useAppStore();
  const [isGlobalEditing, setIsGlobalEditing] = useState(false);

  const company = companies.find(c => c.id === selectedCompanyId);
  const companyExecutives = executives.filter(e => e.company_id === selectedCompanyId);

  // Reset editing state when selection changes
  useEffect(() => {
    setIsGlobalEditing(false);
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
                variant={isGlobalEditing ? "default" : "outline"} 
                size="sm" 
                onClick={() => setIsGlobalEditing(!isGlobalEditing)}
                className="text-xs h-8"
              >
                {isGlobalEditing ? 'Done' : 'Edit Data'}
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
          
          <EditableField
            value={company.name}
            onSave={(val) => updateCompany(company.id, { name: String(val) })}
            className="text-2xl font-serif font-bold mb-1 block"
            inputClassName="text-2xl font-serif font-bold mb-1 h-10"
          />

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
             
             <div onClick={(e) => {
                  e.stopPropagation();
                  setScalingMetric('revenue');
             }}>
                <EditableField
                  type="number"
                  value={company.revenue_usd}
                  onSave={(val) => updateCompany(company.id, { revenue_usd: Number(val) })}
                  className="text-lg font-mono font-medium block mt-1"
                  inputClassName="h-7 text-xs font-mono font-medium bg-background mt-1"
                  displayFormatter={(val) => `$${(Number(val) / 1000000000).toFixed(2)}B`}
                />
             </div>

             {scalingMetric === 'revenue' && !isGlobalEditing && (
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
             
             <div onClick={(e) => {
                 e.stopPropagation();
                 setScalingMetric('employees');
             }}>
                <EditableField
                  type="number"
                  value={company.employees}
                  onSave={(val) => updateCompany(company.id, { employees: Number(val) })}
                  className="text-lg font-mono font-medium block mt-1"
                  inputClassName="h-7 text-xs font-mono font-medium bg-background mt-1"
                  displayFormatter={(val) => Number(val).toLocaleString()}
                />
             </div>

             {scalingMetric === 'employees' && !isGlobalEditing && (
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
                  <div className="font-semibold text-sm">
                    <EditableField
                      value={exec.name}
                      onSave={(val) => updateExecutive(exec.id, { name: String(val) })}
                    />
                  </div>
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal bg-background">
                    {exec.source}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground font-medium mb-2">
                    <EditableField
                      value={exec.title}
                      onSave={(val) => updateExecutive(exec.id, { title: String(val) })}
                    />
                </div>
                
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
