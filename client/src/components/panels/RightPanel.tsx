import { useAppStore, type ExecutiveDetails } from '@/lib/store';
import { useUpdateCompany, useUpdateExecutive, useCreateExecutive } from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { MapPin, DollarSign, Users, X, Edit2, Plus, Trash2, ArrowLeft, Building2, Briefcase, GraduationCap, Banknote, FileText, Loader2, CheckCircle2, Sparkles, Mail, Phone, Linkedin, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

const EditableField = ({ 
  value, 
  onSave, 
  className = "", 
  inputClassName = "",
  type = "text",
  displayFormatter,
  placeholder = ""
}: { 
  value: string | number, 
  onSave: (val: string | number) => void, 
  className?: string,
  inputClassName?: string,
  type?: string,
  displayFormatter?: (val: string | number) => React.ReactNode,
  placeholder?: string
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
    if (e.key === 'Enter') handleBlur();
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
        placeholder={placeholder}
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
      {displayFormatter ? displayFormatter(value) : (value || <span className="text-muted-foreground italic">{placeholder || 'Click to edit'}</span>)}
      <Edit2 className="w-3 h-3 absolute -right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-20 pointer-events-none" />
    </div>
  );
};

interface RightPanelProps {
  width?: number;
  isOpen?: boolean;
  onToggle?: () => void;
}

export default function RightPanel({ width = 384, isOpen = true, onToggle }: RightPanelProps) {
  const { 
    selectedCompanyId, 
    companies, 
    executives, 
    selectCompany, 
    selectExecutive,
    selectedExecutiveId,
    executiveDetails,
    setExecutiveDetails,
    isLoadingExecutiveDetails,
    setLoadingExecutiveDetails,
    panelView,
    setPanelView,
    updateCompany: updateCompanyLocal, 
    addExecutive: addExecutiveLocal, 
    updateExecutive: updateExecutiveLocal, 
    scalingMetric, 
    setScalingMetric 
  } = useAppStore();
  
  const updateCompanyMutation = useUpdateCompany();
  const updateExecutiveMutation = useUpdateExecutive();
  const createExecutiveMutation = useCreateExecutive();

  const company = companies.find(c => c.id === selectedCompanyId);
  const companyExecutives = executives.filter(e => e.company_id === selectedCompanyId);

  const fetchExecutiveDetails = useCallback(async (execId: string) => {
    setLoadingExecutiveDetails(true);
    try {
      const response = await fetch(`/api/executives/${execId}/details`);
      if (!response.ok) throw new Error('Failed to fetch executive details');
      const data = await response.json();
      setExecutiveDetails(data);
    } catch (error) {
      console.error('Error fetching executive details:', error);
      toast.error('Failed to load executive details');
    } finally {
      setLoadingExecutiveDetails(false);
    }
  }, [setExecutiveDetails, setLoadingExecutiveDetails]);

  useEffect(() => {
    if (selectedExecutiveId && panelView === 'executive') {
      fetchExecutiveDetails(selectedExecutiveId);
    }
  }, [selectedExecutiveId, panelView, fetchExecutiveDetails]);

  const handleSelectExecutive = (execId: string) => {
    const exec = executives.find(e => e.id === execId);
    if (exec) {
      selectCompany(exec.company_id);
      selectExecutive(execId);
    }
  };

  const handleBackToCompany = () => {
    setPanelView('company');
    selectExecutive(null);
    setExecutiveDetails(null);
  };

  // When no company selected, show collapsed toggle button only if onToggle is provided
  if (!company && !selectedExecutiveId) {
    if (onToggle) {
      return (
        <div 
          className={`h-full bg-background/95 backdrop-blur-sm border-l border-border flex flex-col shadow-xl z-20 shrink-0 relative transition-all ${!isOpen ? 'w-0 border-l-0 overflow-hidden' : ''}`}
          style={{ width: isOpen ? width : 0, minWidth: isOpen ? 280 : 0 }}
        >
          <Button
            variant="secondary"
            size="icon"
            onClick={onToggle}
            className="absolute -left-8 top-4 h-8 w-8 rounded-r-none rounded-l-md border border-r-0 border-border shadow-md z-50 flex items-center justify-center bg-background hover:bg-accent"
            aria-label={isOpen ? "Collapse panel" : "Expand panel"}
            data-testid="button-toggle-right-panel"
          >
            {isOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
          {isOpen && (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground/20 mb-4" />
              <p className="text-sm text-muted-foreground font-serif">Select a company on the map to view details</p>
            </div>
          )}
        </div>
      );
    }
    return null;
  }

  const handleUpdateCompany = async (field: string, value: any) => {
    if (!company) return;
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
    }
  };

  const handleAddExecutive = async () => {
    if (!company) return;
    const newExec = {
      id: `temp-${Date.now()}`,
      company_id: company.id,
      name: 'New Executive',
      title: 'Position TBD',
      source: 'Manual Entry',
      confidence: 3,
      isEnriched: false
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
    }
  };

  if (panelView === 'executive' && selectedExecutiveId) {
    return (
      <ExecutiveDetailView 
        width={width}
        executiveDetails={executiveDetails}
        isLoading={isLoadingExecutiveDetails}
        onBack={handleBackToCompany}
        onRefresh={() => fetchExecutiveDetails(selectedExecutiveId)}
        isOpen={isOpen}
        onToggle={onToggle}
      />
    );
  }

  if (!company) return null;

  return (
    <div 
      className={`h-full bg-background/95 backdrop-blur-sm border-l border-border flex flex-col shadow-xl z-20 animate-in slide-in-from-right-10 duration-300 shrink-0 relative transition-all ${!isOpen ? 'w-0 border-l-0 overflow-hidden' : ''}`}
      style={{ width: isOpen ? width : 0, minWidth: isOpen ? 280 : 0 }}
    >
      {onToggle && (
        <Button
          variant="secondary"
          size="icon"
          onClick={onToggle}
          className="absolute -left-8 top-4 h-8 w-8 rounded-r-none rounded-l-md border border-r-0 border-border shadow-md z-50 flex items-center justify-center bg-background"
          aria-label={isOpen ? "Collapse panel" : "Expand panel"}
          data-testid="button-toggle-right-panel"
        >
          {isOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      )}
      
      <div className={`flex flex-col h-full ${!isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
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
             <Badge variant="secondary" className={`rounded-sm font-normal text-xs uppercase tracking-wide ${company.confidence >= 7 ? 'bg-green-100 text-green-800' : company.confidence >= 4 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`} data-testid="badge-confidence">
               Confidence: {company.confidence}/10
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
            <p className="mt-2 text-[10px] italic text-muted-foreground" data-testid="text-source">
              Source: {company.source}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
           <div>
             <div 
               onClick={() => setScalingMetric('revenue')}
               className={`p-3 rounded border cursor-pointer transition-all duration-200 group relative
                  ${scalingMetric === 'revenue' 
                    ? 'bg-primary/5 border-primary shadow-sm ring-1 ring-primary/20' 
                    : 'bg-muted/30 border-border/50 hover:bg-muted/50 hover:border-primary/30'}`}
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
             {company.revenueSource && (
               <p className="text-[9px] italic text-muted-foreground mt-1">Source: {company.revenueSource}</p>
             )}
           </div>

           <div>
             <div 
               onClick={() => setScalingMetric('employees')}
               className={`p-3 rounded border cursor-pointer transition-all duration-200 group relative
                  ${scalingMetric === 'employees' 
                    ? 'bg-primary/5 border-primary shadow-sm ring-1 ring-primary/20' 
                    : 'bg-muted/30 border-border/50 hover:bg-muted/50 hover:border-primary/30'}`}
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
             {company.employeesSource && (
               <p className="text-[9px] italic text-muted-foreground mt-1">Source: {company.employeesSource}</p>
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
              <div 
                key={exec.id} 
                className="group p-3 rounded border border-border hover:border-primary/30 hover:bg-muted/30 transition-all bg-card shadow-sm cursor-pointer" 
                onClick={() => handleSelectExecutive(exec.id)}
                data-testid={`card-executive-${exec.id}`}
              >
                <div className="flex gap-3">
                  <div className="flex-shrink-0">
                    {exec.imageUrl ? (
                      <img 
                        src={exec.imageUrl} 
                        alt={exec.name}
                        className="w-10 h-10 rounded-full object-cover border border-border"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div className={`w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm ${exec.imageUrl ? 'hidden' : ''}`}>
                      {exec.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                      <div className="font-semibold text-sm hover:text-primary transition-colors">
                        {exec.name}
                      </div>
                      <span className={`text-[9px] font-medium ${exec.confidence >= 7 ? 'text-green-600' : exec.confidence >= 4 ? 'text-amber-600' : 'text-red-500'}`}>
                        {exec.confidence}/10
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground font-medium mb-1">
                      {exec.title}
                    </div>
                    <p className="text-[9px] text-primary">
                      Click to view details
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
      </div>
    </div>
  );
}

function ExecutiveDetailView({ 
  width, 
  executiveDetails, 
  isLoading, 
  onBack,
  onRefresh,
  isOpen = true,
  onToggle
}: { 
  width: number; 
  executiveDetails: ExecutiveDetails | null;
  isLoading: boolean;
  onBack: () => void;
  onRefresh: () => void;
  isOpen?: boolean;
  onToggle?: () => void;
}) {
  const [notesContent, setNotesContent] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  useEffect(() => {
    if (executiveDetails?.notes?.content) {
      setNotesContent(executiveDetails.notes.content);
    } else {
      setNotesContent('');
    }
  }, [executiveDetails?.notes?.content]);

  const handleSaveNotes = async () => {
    if (!executiveDetails) return;
    setIsSavingNotes(true);
    try {
      await fetch(`/api/executives/${executiveDetails.executive.id}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: notesContent })
      });
      toast.success('Notes saved');
      setIsEditingNotes(false);
    } catch (error) {
      toast.error('Failed to save notes');
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleAddCareerEntry = async () => {
    if (!executiveDetails) return;
    try {
      await fetch(`/api/executives/${executiveDetails.executive.id}/career-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: 'New Company', title: 'New Role' })
      });
      toast.success('Career entry added');
      onRefresh();
    } catch (error) {
      toast.error('Failed to add career entry');
    }
  };

  const handleUpdateCareerEntry = async (id: number, field: string, value: string) => {
    try {
      await fetch(`/api/career-history/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      });
      toast.success('Career entry updated');
      onRefresh();
    } catch (error) {
      toast.error('Failed to update career entry');
    }
  };

  const handleDeleteCareerEntry = async (id: number) => {
    try {
      await fetch(`/api/career-history/${id}`, { method: 'DELETE' });
      toast.success('Career entry deleted');
      onRefresh();
    } catch (error) {
      toast.error('Failed to delete career entry');
    }
  };

  const handleAddEducation = async () => {
    if (!executiveDetails) return;
    try {
      await fetch(`/api/executives/${executiveDetails.executive.id}/education`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institution: 'New Institution' })
      });
      toast.success('Education entry added');
      onRefresh();
    } catch (error) {
      toast.error('Failed to add education entry');
    }
  };

  const handleUpdateEducation = async (id: number, field: string, value: string) => {
    try {
      await fetch(`/api/education/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      });
      toast.success('Education updated');
      onRefresh();
    } catch (error) {
      toast.error('Failed to update education');
    }
  };

  const handleDeleteEducation = async (id: number) => {
    try {
      await fetch(`/api/education/${id}`, { method: 'DELETE' });
      toast.success('Education entry deleted');
      onRefresh();
    } catch (error) {
      toast.error('Failed to delete education entry');
    }
  };

  const handleAddRemuneration = async () => {
    if (!executiveDetails) return;
    try {
      await fetch(`/api/executives/${executiveDetails.executive.id}/remuneration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: new Date().getFullYear().toString(), currency: 'USD' })
      });
      toast.success('Remuneration entry added');
      onRefresh();
    } catch (error) {
      toast.error('Failed to add remuneration entry');
    }
  };

  const handleUpdateRemuneration = async (id: number, field: string, value: string) => {
    try {
      await fetch(`/api/remuneration/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      });
      toast.success('Remuneration updated');
      onRefresh();
    } catch (error) {
      toast.error('Failed to update remuneration');
    }
  };

  const handleDeleteRemuneration = async (id: number) => {
    try {
      await fetch(`/api/remuneration/${id}`, { method: 'DELETE' });
      toast.success('Remuneration entry deleted');
      onRefresh();
    } catch (error) {
      toast.error('Failed to delete remuneration entry');
    }
  };

  if (isLoading) {
    return (
      <div 
        className={`h-full bg-background/95 backdrop-blur-sm border-l border-border flex flex-col items-center justify-center shadow-xl z-20 shrink-0 relative transition-all ${!isOpen ? 'w-0 border-l-0 overflow-hidden' : ''}`} 
        style={{ width: isOpen ? width : 0, minWidth: isOpen ? 280 : 0 }}
      >
        {onToggle && (
          <Button
            variant="secondary"
            size="icon"
            onClick={onToggle}
            className="absolute -left-8 top-4 h-8 w-8 rounded-r-none rounded-l-md border border-r-0 border-border shadow-md z-50 flex items-center justify-center bg-background"
            data-testid="button-toggle-right-panel-loading"
          >
            {isOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        )}
        {isOpen && (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-2 text-sm text-muted-foreground">Loading executive details...</p>
          </>
        )}
      </div>
    );
  }

  if (!executiveDetails) {
    return (
      <div 
        className={`h-full bg-background/95 backdrop-blur-sm border-l border-border flex flex-col items-center justify-center shadow-xl z-20 shrink-0 relative transition-all ${!isOpen ? 'w-0 border-l-0 overflow-hidden' : ''}`} 
        style={{ width: isOpen ? width : 0, minWidth: isOpen ? 280 : 0 }}
      >
        {onToggle && (
          <Button
            variant="secondary"
            size="icon"
            onClick={onToggle}
            className="absolute -left-8 top-4 h-8 w-8 rounded-r-none rounded-l-md border border-r-0 border-border shadow-md z-50 flex items-center justify-center bg-background"
            data-testid="button-toggle-right-panel-empty"
          >
            {isOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        )}
        {isOpen && (
          <>
            <p className="text-sm text-muted-foreground">No executive data available</p>
            <Button variant="ghost" onClick={onBack} className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Company
            </Button>
          </>
        )}
      </div>
    );
  }

  const { executive, company, careerHistory, education, remuneration, notes } = executiveDetails;

  return (
    <div 
      className={`h-full bg-background/95 backdrop-blur-sm border-l border-border flex flex-col shadow-xl z-20 animate-in slide-in-from-right-10 duration-300 shrink-0 relative transition-all ${!isOpen ? 'w-0 border-l-0 overflow-hidden' : ''}`}
      style={{ width: isOpen ? width : 0, minWidth: isOpen ? 280 : 0 }}
    >
      {onToggle && (
        <Button
          variant="secondary"
          size="icon"
          onClick={onToggle}
          className="absolute -left-8 top-4 h-8 w-8 rounded-r-none rounded-l-md border border-r-0 border-border shadow-md z-50 flex items-center justify-center bg-background"
          aria-label={isOpen ? "Collapse panel" : "Expand panel"}
          data-testid="button-toggle-right-panel-exec"
        >
          {isOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      )}
      
      <div className={`flex flex-col h-full ${!isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
      <div className="p-4 border-b border-border flex items-center gap-2 bg-muted/10">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground">Executive Profile</span>
      </div>

      <ScrollArea className="flex-1">
        <div key={executive.id} className="animate-in fade-in-0 duration-300">
        {/* Company Context - Always Visible */}
        {company && (
          <div className="p-4 bg-muted/20 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">{company.name}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Country: </span>
                <span>{company.country || 'N/A'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Revenue: </span>
                <span>{company.revenue ? `$${(parseFloat(company.revenue) / 1000000000).toFixed(1)}B` : 'N/A'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Employees: </span>
                <span>{company.employees?.toLocaleString() || 'N/A'}</span>
              </div>
            </div>
          </div>
        )}

        <div className="p-6 space-y-6">
          {/* Executive Header */}
          <div>
            <div className="flex items-center gap-4 mb-4">
              <div className={`relative w-16 h-16 rounded-full flex items-center justify-center font-bold text-xl transition-all ${executive.isEnriched ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-primary/10 text-primary'}`}>
                {executive.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                {executive.isEnriched && (
                  <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center ring-2 ring-background">
                    <CheckCircle2 className="h-3 w-3 text-white" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-serif font-bold">{executive.name}</h2>
                  {executive.isEnriched && (
                    <span title={`Enriched via ${executive.enrichmentSource || 'external source'}`}>
                      <Sparkles className="h-4 w-4 text-emerald-500" />
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{executive.title}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {executive.confidence && (
                    <Badge variant="secondary" className={`text-xs ${executive.confidence >= 7 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : executive.confidence >= 4 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}`}>
                      Confidence: {executive.confidence}/10
                    </Badge>
                  )}
                  {executive.isEnriched && (
                    <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-700">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Enriched
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Contact Info Section */}
            {(executive.email || executive.phone || executive.linkedin) && (
              <div className="flex flex-wrap gap-2 mt-3 p-3 bg-muted/30 rounded-lg">
                {executive.email && (
                  <a href={`mailto:${executive.email}`} className="flex items-center gap-1.5 px-2.5 py-1 bg-background rounded-md text-xs hover:bg-muted transition-colors">
                    <Mail className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">{executive.email}</span>
                  </a>
                )}
                {executive.phone && (
                  <a href={`tel:${executive.phone}`} className="flex items-center gap-1.5 px-2.5 py-1 bg-background rounded-md text-xs hover:bg-muted transition-colors">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">{executive.phone}</span>
                  </a>
                )}
                {executive.linkedin && (
                  <a href={executive.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2.5 py-1 bg-background rounded-md text-xs hover:bg-muted transition-colors">
                    <Linkedin className="h-3 w-3 text-blue-600" />
                    <span className="text-blue-600">LinkedIn</span>
                  </a>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Career History */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Career History</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={handleAddCareerEntry} className="h-6 text-xs">
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            
            <div className="space-y-3">
              {careerHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No career history yet. Click Add to create an entry.</p>
              ) : (
                careerHistory.map((entry) => (
                  <div key={entry.id} className="p-3 border rounded-lg bg-card group relative">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDeleteCareerEntry(entry.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                    <EditableField
                      value={entry.company}
                      onSave={(val) => handleUpdateCareerEntry(entry.id, 'company', String(val))}
                      className="font-medium text-sm"
                      placeholder="Company name"
                    />
                    <EditableField
                      value={entry.title}
                      onSave={(val) => handleUpdateCareerEntry(entry.id, 'title', String(val))}
                      className="text-xs text-muted-foreground"
                      placeholder="Job title"
                    />
                    <div className="flex gap-2 mt-1">
                      <EditableField
                        value={entry.startDate || ''}
                        onSave={(val) => handleUpdateCareerEntry(entry.id, 'startDate', String(val))}
                        className="text-xs text-muted-foreground"
                        placeholder="Start date"
                      />
                      <span className="text-xs text-muted-foreground">-</span>
                      <EditableField
                        value={entry.endDate || ''}
                        onSave={(val) => handleUpdateCareerEntry(entry.id, 'endDate', String(val))}
                        className="text-xs text-muted-foreground"
                        placeholder="End date"
                      />
                    </div>
                    <EditableField
                      value={entry.description || ''}
                      onSave={(val) => handleUpdateCareerEntry(entry.id, 'description', String(val))}
                      className="text-xs text-muted-foreground mt-1"
                      placeholder="Description (optional)"
                    />
                  </div>
                ))
              )}
            </div>
          </div>

          <Separator />

          {/* Education */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Education</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={handleAddEducation} className="h-6 text-xs">
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            
            <div className="space-y-3">
              {education.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No education history yet. Click Add to create an entry.</p>
              ) : (
                education.map((entry) => (
                  <div key={entry.id} className="p-3 border rounded-lg bg-card group relative">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDeleteEducation(entry.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                    <EditableField
                      value={entry.institution}
                      onSave={(val) => handleUpdateEducation(entry.id, 'institution', String(val))}
                      className="font-medium text-sm"
                      placeholder="Institution"
                    />
                    <div className="flex gap-2">
                      <EditableField
                        value={entry.degree || ''}
                        onSave={(val) => handleUpdateEducation(entry.id, 'degree', String(val))}
                        className="text-xs text-muted-foreground"
                        placeholder="Degree"
                      />
                      <span className="text-xs text-muted-foreground">in</span>
                      <EditableField
                        value={entry.fieldOfStudy || ''}
                        onSave={(val) => handleUpdateEducation(entry.id, 'fieldOfStudy', String(val))}
                        className="text-xs text-muted-foreground"
                        placeholder="Field of study"
                      />
                    </div>
                    <EditableField
                      value={entry.graduationYear || ''}
                      onSave={(val) => handleUpdateEducation(entry.id, 'graduationYear', String(val))}
                      className="text-xs text-muted-foreground"
                      placeholder="Graduation year"
                    />
                  </div>
                ))
              )}
            </div>
          </div>

          <Separator />

          {/* Remuneration */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Banknote className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Remuneration</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={handleAddRemuneration} className="h-6 text-xs">
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            
            <div className="space-y-3">
              {remuneration.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No remuneration data yet. Click Add to create an entry.</p>
              ) : (
                remuneration.map((entry) => (
                  <div key={entry.id} className="p-3 border rounded-lg bg-card group relative">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDeleteRemuneration(entry.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                    <div className="flex items-center gap-2 mb-2">
                      <EditableField
                        value={entry.year || ''}
                        onSave={(val) => handleUpdateRemuneration(entry.id, 'year', String(val))}
                        className="font-medium text-sm"
                        placeholder="Year"
                      />
                      <EditableField
                        value={entry.currency || 'USD'}
                        onSave={(val) => handleUpdateRemuneration(entry.id, 'currency', String(val))}
                        className="text-xs text-muted-foreground"
                        placeholder="Currency"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Base: </span>
                        <EditableField
                          value={entry.baseSalary || ''}
                          onSave={(val) => handleUpdateRemuneration(entry.id, 'baseSalary', String(val))}
                          className="inline"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <span className="text-muted-foreground">Bonus: </span>
                        <EditableField
                          value={entry.bonus || ''}
                          onSave={(val) => handleUpdateRemuneration(entry.id, 'bonus', String(val))}
                          className="inline"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <span className="text-muted-foreground">LTI: </span>
                        <EditableField
                          value={entry.longTermIncentives || ''}
                          onSave={(val) => handleUpdateRemuneration(entry.id, 'longTermIncentives', String(val))}
                          className="inline"
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <EditableField
                      value={entry.notes || ''}
                      onSave={(val) => handleUpdateRemuneration(entry.id, 'notes', String(val))}
                      className="text-xs text-muted-foreground mt-2"
                      placeholder="Notes (optional)"
                    />
                  </div>
                ))
              )}
            </div>
          </div>

          <Separator />

          {/* Notes */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Notes</h3>
              </div>
              {!isEditingNotes && (
                <Button variant="ghost" size="sm" onClick={() => setIsEditingNotes(true)} className="h-6 text-xs">
                  <Edit2 className="h-3 w-3 mr-1" /> Edit
                </Button>
              )}
            </div>
            
            {isEditingNotes ? (
              <div className="space-y-2">
                <Textarea
                  value={notesContent}
                  onChange={(e) => setNotesContent(e.target.value)}
                  placeholder="Add internal notes and assessments..."
                  className="min-h-[100px]"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveNotes} disabled={isSavingNotes}>
                    {isSavingNotes ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    setIsEditingNotes(false);
                    setNotesContent(executiveDetails.notes?.content || '');
                  }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-3 border rounded-lg bg-card min-h-[60px]">
                {notesContent ? (
                  <p className="text-sm whitespace-pre-wrap">{notesContent}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No notes yet. Click Edit to add notes.</p>
                )}
              </div>
            )}
          </div>
        </div>
        </div>
      </ScrollArea>
      </div>
    </div>
  );
}
