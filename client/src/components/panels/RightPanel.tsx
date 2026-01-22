import { useAppStore } from '@/lib/store';
import { useUpdateCompany, useUpdateExecutive, useCreateExecutive } from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ExternalLink, MapPin, DollarSign, Users, X, Edit2, Linkedin, Mail } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';

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
      setTempValue(value);
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
  const { selectedCompanyId, companies, executives, selectCompany, updateCompany: updateCompanyLocal, addExecutive: addExecutiveLocal, updateExecutive: updateExecutiveLocal, scalingMetric, setScalingMetric } = useAppStore();
  const updateCompanyMutation = useUpdateCompany();
  const updateExecutiveMutation = useUpdateExecutive();
  const createExecutiveMutation = useCreateExecutive();

  const company = companies.find(c => c.id === selectedCompanyId);
  const companyExecutives = executives.filter(e => e.company_id === selectedCompanyId);

  if (!company) {
    return null;
  }

  const handleUpdateCompany = async (field: string, value: any) => {
    updateCompanyLocal(company.id, { [field]: value });
    
    try {
      const updateData: any = {};
      
      if (field === 'name') updateData.name = value;
      if (field === 'revenue_usd') updateData.revenue = String(value);
      if (field === 'employees') updateData.employees = value;
      
      await updateCompanyMutation.mutateAsync({
        id: parseInt(company.id),
        data: updateData
      });
      toast.success('Company updated');
    } catch (error) {
      toast.error('Failed to update company');
      console.error(error);
    }
  };

  const handleUpdateExecutive = async (execId: string, field: string, value: string) => {
    updateExecutiveLocal(execId, { [field]: value });
    
    try {
      await updateExecutiveMutation.mutateAsync({
        id: parseInt(execId),
        data: { [field]: value }
      });
      toast.success('Executive updated');
    } catch (error) {
      toast.error('Failed to update executive');
      console.error(error);
    }
  };

  const handleAddExecutive = async () => {
    const newExec = {
      id: `temp-${Date.now()}`,
      company_id: company.id,
      name: 'New Executive',
      title: 'Position TBD',
      source: 'Manual' as const,
      confidence: 'Medium' as const
    };
    
    addExecutiveLocal(newExec);
    
    try {
      await createExecutiveMutation.mutateAsync({
        companyId: parseInt(company.id),
        name: 'New Executive',
        title: 'Position TBD'
      });
      toast.success('Executive added');
    } catch (error) {
      toast.error('Failed to add executive');
      console.error(error);
    }
  };

  return (
    <div className="h-full w-96 bg-background/95 backdrop-blur-sm border-l border-border flex flex-col shadow-xl z-20 animate-in slide-in-from-right-10 duration-300">
      
      <div className="p-4 border-b border-border flex justify-between items-center bg-muted/10">
        <Button variant="ghost" size="icon" onClick={() => selectCompany(null)} className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive" data-testid="button-close-panel">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-6">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
             <Badge variant="outline" className="rounded-sm font-normal text-xs uppercase tracking-wide text-muted-foreground border-muted-foreground/30" data-testid="badge-industry">
               {company.industry}
             </Badge>
             <Badge variant="secondary" className={`rounded-sm font-normal text-xs uppercase tracking-wide ${company.confidence === 'High' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`} data-testid="badge-confidence">
               {company.confidence} Confidence
             </Badge>
          </div>
          
          <EditableField
            value={company.name}
            onSave={(val) => handleUpdateCompany('name', String(val))}
            className="text-2xl font-serif font-bold mb-1 block"
            inputClassName="text-2xl font-serif font-bold mb-1 h-10"
          />

          <div className="flex items-center text-sm text-muted-foreground gap-1" data-testid="text-location">
            <MapPin className="w-3 h-3" />
            {company.hq_city}, {company.hq_country}
          </div>
          
          {company.source && (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md" data-testid="text-source">
              <span className="font-medium">Source:</span>
              <span>{company.source}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
           <div 
             onClick={() => setScalingMetric('revenue')}
             className={`
                p-3 rounded border cursor-pointer transition-all duration-200 group relative
                ${scalingMetric === 'revenue' 
                  ? 'bg-primary/5 border-primary shadow-sm ring-1 ring-primary/20' 
                  : 'bg-muted/30 border-border/50 hover:bg-muted/50 hover:border-primary/30'}
             `}
             data-testid="card-revenue"
           >
             <div className={`text-xs uppercase tracking-wider mb-1 flex items-center gap-1 ${scalingMetric === 'revenue' ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
               <DollarSign className="w-3 h-3" /> Revenue
             </div>
             
             <div onClick={(e) => e.stopPropagation()}>
                <EditableField
                  type="number"
                  value={company.revenue_usd}
                  onSave={(val) => handleUpdateCompany('revenue_usd', Number(val))}
                  className="text-lg font-mono font-medium block mt-1"
                  inputClassName="h-7 text-xs font-mono font-medium bg-background mt-1"
                  displayFormatter={(val) => `$${(Number(val) / 1000000000).toFixed(2)}B`}
                />
             </div>

             {scalingMetric === 'revenue' && (
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
             data-testid="card-employees"
           >
             <div className={`text-xs uppercase tracking-wider mb-1 flex items-center gap-1 ${scalingMetric === 'employees' ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
               <Users className="w-3 h-3" /> Employees
             </div>
             
             <div onClick={(e) => e.stopPropagation()}>
                <EditableField
                  type="number"
                  value={company.employees}
                  onSave={(val) => handleUpdateCompany('employees', Number(val))}
                  className="text-lg font-mono font-medium block mt-1"
                  inputClassName="h-7 text-xs font-mono font-medium bg-background mt-1"
                  displayFormatter={(val) => Number(val).toLocaleString()}
                />
             </div>

             {scalingMetric === 'employees' && (
                <div className="text-[10px] text-primary mt-1 font-medium">Map Scaling Active</div>
             )}
           </div>
        </div>

        <Separator className="my-6" />

        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif font-semibold text-lg">Key Executives</h3>
            <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 text-xs text-primary hover:bg-primary/10"
                onClick={handleAddExecutive}
                data-testid="button-add-executive"
            >
                Add New
            </Button>
          </div>

          <div className="space-y-3">
            {companyExecutives.map(exec => (
              <div key={exec.id} className="group p-3 rounded border border-border hover:border-primary/30 hover:bg-muted/30 transition-all bg-card shadow-sm" data-testid={`card-executive-${exec.id}`}>
                <div className="flex justify-between items-start mb-1">
                  <div className="font-semibold text-sm">
                    <EditableField
                      value={exec.name}
                      onSave={(val) => handleUpdateExecutive(exec.id, 'name', String(val))}
                    />
                  </div>
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal bg-background">
                    {exec.source}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground font-medium mb-2">
                  <EditableField
                    value={exec.title}
                    onSave={(val) => handleUpdateExecutive(exec.id, 'title', String(val))}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
