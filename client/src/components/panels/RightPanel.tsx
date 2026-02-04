import { useAppStore, type ExecutiveDetails } from '@/lib/store';
import { useUpdateCompany, useUpdateExecutive, useCreateExecutive } from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, DollarSign, Users, X, Edit2, Plus, Trash2, ArrowLeft, Building2, Briefcase, GraduationCap, Banknote, FileText, Loader2, CheckCircle2, Sparkles, Mail, Phone, Linkedin, ChevronLeft, ChevronRight, TrendingUp, AlertCircle, ShieldCheck, Search, Bot, Camera, Link2, FileDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

const LLM_MODELS = [
  // Auto router - selects best free model automatically
  { id: 'openrouter/free', name: 'Auto (Best Free)', free: true },
  // Free models - verified from OpenRouter Feb 2026
  { id: 'arcee-ai/trinity-large-preview:free', name: 'Arcee Trinity Large 400B', free: true },
  { id: 'tngtech/deepseek-r1t2-chimera:free', name: 'DeepSeek R1T2 Chimera 671B', free: true },
  { id: 'z-ai/glm-4.5-air:free', name: 'GLM 4.5 Air', free: true },
  { id: 'tngtech/deepseek-r1t-chimera:free', name: 'DeepSeek R1T Chimera', free: true },
  { id: 'stepfun/step-3.5-flash:free', name: 'Step 3.5 Flash 196B', free: true },
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free', name: 'Nemotron 3 Nano 30B', free: true },
  { id: 'deepseek/deepseek-r1-0528:free', name: 'DeepSeek R1 0528', free: true },
  { id: 'tngtech/tng-r1t-chimera:free', name: 'TNG R1T Chimera', free: true },
  { id: 'openai/gpt-oss-120b:free', name: 'GPT OSS 120B', free: true },
  { id: 'qwen/qwen3-coder:free', name: 'Qwen3 Coder 480B', free: true },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B', free: true },
  { id: 'upstage/solar-pro-3:free', name: 'Solar Pro 3 102B', free: true },
  { id: 'arcee-ai/trinity-mini:free', name: 'Arcee Trinity Mini 26B', free: true },
  { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B', free: true },
  { id: 'qwen/qwen3-next-80b-a3b-instruct:free', name: 'Qwen3 Next 80B', free: true },
  { id: 'openai/gpt-oss-20b:free', name: 'GPT OSS 20B', free: true },
  // Paid models - more capable
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', free: false },
  { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', free: false },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', free: false },
  { id: 'openai/gpt-4o', name: 'GPT-4o', free: false },
];

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

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (tempValue !== value) {
      onSave(tempValue);
    }
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
      onClick={handleClick} 
      className={`cursor-text hover:bg-muted/30 rounded px-1 -mx-1 transition-colors relative group ${className}`}
      title="Click to edit"
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

  const [companyNotes, setCompanyNotes] = useState('');
  const [isEditingCompanyNotes, setIsEditingCompanyNotes] = useState(false);
  const [isSavingCompanyNotes, setIsSavingCompanyNotes] = useState(false);
  const [isLoadingCompanyNotes, setIsLoadingCompanyNotes] = useState(false);
  const [companyNotesError, setCompanyNotesError] = useState<string | null>(null);
  const [isEnrichingWithBing, setIsEnrichingWithBing] = useState(false);
  const [enrichmentModel, setEnrichmentModel] = useState('openrouter/free');
  
  const company = companies.find(c => c.id === selectedCompanyId);
  const companyExecutives = executives.filter(e => e.company_id === selectedCompanyId);

  const fetchCompanyNotes = useCallback(async (companyId: string) => {
    setIsLoadingCompanyNotes(true);
    setCompanyNotesError(null);
    try {
      const response = await fetch(`/api/companies/${companyId}/notes`);
      if (!response.ok) throw new Error('Failed to fetch company notes');
      const data = await response.json();
      setCompanyNotes(data.content || '');
    } catch (error) {
      console.error('Error fetching company notes:', error);
      setCompanyNotesError('Failed to load notes');
    } finally {
      setIsLoadingCompanyNotes(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCompanyId && panelView === 'company') {
      fetchCompanyNotes(selectedCompanyId);
    }
  }, [selectedCompanyId, panelView, fetchCompanyNotes]);

  const handleSaveCompanyNotes = async () => {
    if (!company) return;
    setIsSavingCompanyNotes(true);
    try {
      await fetch(`/api/companies/${company.id}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: companyNotes })
      });
      toast.success('Notes saved');
      setIsEditingCompanyNotes(false);
    } catch (error) {
      toast.error('Failed to save notes');
    } finally {
      setIsSavingCompanyNotes(false);
    }
  };

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

  const handleUpdateCompany = async (field: string, value: any) => {
    if (!company) return;
    updateCompanyLocal(company.id, { [field]: value });
    
    try {
      const updateData: any = {};
      if (field === 'name') updateData.name = value;
      if (field === 'revenue_usd') updateData.revenue = String(value);
      if (field === 'employees') updateData.employees = value;
      if (field === 'ownershipType') updateData.ownershipType = value;
      if (field === 'geographicFootprint') updateData.geographicFootprint = value;
      if (field === 'customerModel') updateData.customerModel = value;
      if (field === 'coreActivity') updateData.coreActivity = value;
      if (field === 'operatingModel') updateData.operatingModel = value;
      if (field === 'revenueDrivers') updateData.revenueDrivers = value;
      if (field === 'summary') updateData.summary = value;
      
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
    const tempId = `temp-${Date.now()}`;
    const newExec = {
      id: tempId,
      company_id: company.id,
      name: 'New Executive',
      title: 'Position TBD',
      source: 'Manual Entry',
      confidence: 3,
      isEnriched: false
    };
    
    addExecutiveLocal(newExec);
    
    try {
      const createdExecutive = await createExecutiveMutation.mutateAsync({
        companyId: parseInt(company.id),
        name: 'New Executive',
        title: 'Position TBD'
      });
      
      // Update the local executive with the real ID from the server
      // Remove the temp executive and add the real one
      const { executives } = useAppStore.getState();
      const updatedExecutives = executives.filter(e => e.id !== tempId);
      updatedExecutives.push({
        ...newExec,
        id: String(createdExecutive.id),
        company_id: company.id
      });
      useAppStore.getState().setExecutives(updatedExecutives);
      
      // Auto-select the new executive so user can edit their details
      selectExecutive(String(createdExecutive.id));
      
      toast.success('Executive added - you can now edit their details');
    } catch (error) {
      // Remove the temp executive on failure
      const { executives } = useAppStore.getState();
      useAppStore.getState().setExecutives(executives.filter(e => e.id !== tempId));
      toast.error('Failed to add executive');
    }
  };

  const handleEnrichWithAI = async (companyData: typeof company) => {
    if (!companyData) return;
    setIsEnrichingWithBing(true);
    const modelName = LLM_MODELS.find(m => m.id === enrichmentModel)?.name || enrichmentModel;
    toast.info(`Enriching with ${modelName}...`);
    try {
      const response = await fetch(`/api/companies/${companyData.id}/enrich-deepseek`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: companyData.name, country: companyData.hq_country, model: enrichmentModel })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to enrich with DeepSeek');
      }
      
      const enrichedData = await response.json();
      
      if (enrichedData.summary) {
        updateCompanyLocal(companyData.id, { summary: enrichedData.summary });
      }
      if (enrichedData.coreActivity) {
        updateCompanyLocal(companyData.id, { coreActivity: enrichedData.coreActivity });
      }
      if (enrichedData.operatingModel) {
        updateCompanyLocal(companyData.id, { operatingModel: enrichedData.operatingModel });
      }
      if (enrichedData.revenueDrivers) {
        updateCompanyLocal(companyData.id, { revenueDrivers: enrichedData.revenueDrivers });
      }
      
      toast.success(`Company enriched with ${modelName}`);
    } catch (error: any) {
      console.error('Error enriching with DeepSeek:', error);
      toast.error(error.message || 'Failed to enrich with DeepSeek');
    } finally {
      setIsEnrichingWithBing(false);
    }
  };

  // Per §2: RHP hidden ONLY when no entity is selected
  if (!selectedCompanyId && !selectedExecutiveId) {
    if (onToggle) {
      return (
        <div 
          className="h-full flex shrink-0 relative z-20"
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
          <div 
            className={`h-full bg-background/95 backdrop-blur-sm border-l border-border flex flex-col shadow-xl transition-all overflow-hidden ${!isOpen ? 'w-0 border-l-0' : ''}`}
            style={{ width: isOpen ? width : 0, minWidth: isOpen ? 280 : 0 }}
          >
            {isOpen && (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <Building2 className="h-12 w-12 text-muted-foreground/20 mb-4" />
                <p className="text-sm text-muted-foreground font-serif">Select a company on the map to view details</p>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  }

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

  // Company view - Per §4: never show nothing
  if (!company) {
    return (
      <div className="h-full flex shrink-0 relative z-20">
        {onToggle && (
          <Button
            variant="secondary"
            size="icon"
            onClick={onToggle}
            className="absolute -left-8 top-4 h-8 w-8 rounded-r-none rounded-l-md border border-r-0 border-border shadow-md z-50 flex items-center justify-center bg-background"
          >
            {isOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        )}
        <div 
          className={`h-full bg-background/95 backdrop-blur-sm border-l border-border flex flex-col items-center justify-center shadow-xl transition-all overflow-hidden ${!isOpen ? 'w-0 border-l-0' : ''}`}
          style={{ width: isOpen ? width : 0, minWidth: isOpen ? 280 : 0 }}
        >
          {isOpen && (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <AlertCircle className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No company data available</p>
              <Button variant="ghost" size="sm" onClick={() => selectCompany(null)}>
                <X className="h-4 w-4 mr-2" /> Clear Selection
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const getConfidenceLabel = (confidence: number): { label: string; color: string } => {
    if (confidence >= 7) return { label: 'High', color: 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400' };
    if (confidence >= 4) return { label: 'Medium', color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400' };
    return { label: 'Low', color: 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400' };
  };

  const confidenceInfo = getConfidenceLabel(company.confidence);

  return (
    <div className="h-full flex shrink-0 relative z-20 animate-in slide-in-from-right-10 duration-300">
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
      <div 
        className={`h-full bg-background/95 backdrop-blur-sm border-l border-border flex flex-col shadow-xl transition-all overflow-hidden ${!isOpen ? 'w-0 border-l-0' : ''}`}
        style={{ width: isOpen ? width : 0, minWidth: isOpen ? 280 : 0 }}
      >
      
      <div className={`flex flex-col h-full ${!isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        {/* §7.1 Company Header - Sticky */}
        <div className="sticky top-0 z-10 p-4 border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="flex-1 min-w-0">
              <EditableField
                value={company.name}
                onSave={(val) => handleUpdateCompany('name', String(val))}
                className="text-xl font-serif font-bold truncate"
                inputClassName="text-xl font-serif font-bold"
              />
            </div>
            <Button variant="ghost" size="icon" onClick={() => selectCompany(null)} className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive shrink-0 ml-2" data-testid="button-close-panel">
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex items-center text-sm text-muted-foreground gap-1 mb-2" data-testid="text-location">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{company.hq_city}, {company.hq_country}</span>
          </div>
          
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-xs" data-testid="badge-sector">
              {company.industry || 'Unknown Sector'}
            </Badge>
            {company.ownershipType && (
              <Badge variant="secondary" className="text-xs" data-testid="badge-ownership">
                {company.ownershipType}
              </Badge>
            )}
            {company.businessType && (
              <Badge variant="outline" className="text-xs capitalize" data-testid="badge-business-type">
                {company.businessType.replace('_', ' ')}
              </Badge>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            {/* §7.2 Scale Snapshot - Fixed KPI boxes */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Scale Snapshot
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div 
                  onClick={() => setScalingMetric('revenue')}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    scalingMetric === 'revenue' 
                      ? 'bg-primary/5 border-primary ring-1 ring-primary/20' 
                      : 'bg-muted/30 border-border hover:bg-muted/50'
                  }`}
                  data-testid="card-revenue"
                >
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <DollarSign className="w-3 h-3" /> Revenue
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <EditableField
                      type="number"
                      value={company.revenue_usd}
                      onSave={(val) => handleUpdateCompany('revenue_usd', Number(val))}
                      className="text-lg font-mono font-semibold"
                      displayFormatter={(val) => Number(val) > 0 ? `$${(Number(val) / 1000000000).toFixed(2)}B` : 'Unknown'}
                    />
                  </div>
                  {scalingMetric === 'revenue' && (
                    <div className="text-[10px] text-primary mt-1">Map Scaling Active</div>
                  )}
                </div>

                <div 
                  onClick={() => setScalingMetric('employees')}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    scalingMetric === 'employees' 
                      ? 'bg-primary/5 border-primary ring-1 ring-primary/20' 
                      : 'bg-muted/30 border-border hover:bg-muted/50'
                  }`}
                  data-testid="card-employees"
                >
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <Users className="w-3 h-3" /> Employees
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <EditableField
                      type="number"
                      value={company.employees}
                      onSave={(val) => handleUpdateCompany('employees', Number(val))}
                      className="text-lg font-mono font-semibold"
                      displayFormatter={(val) => Number(val) > 0 ? Number(val).toLocaleString() : 'Unknown'}
                    />
                  </div>
                  {scalingMetric === 'employees' && (
                    <div className="text-[10px] text-primary mt-1">Map Scaling Active</div>
                  )}
                </div>

              </div>
            </div>

            <Separator />

            {/* §7.4 Company Summary - Now above Business Profile */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Company Summary
                </h3>
                <div className="flex items-center gap-2">
                  <Select value={enrichmentModel} onValueChange={setEnrichmentModel}>
                    <SelectTrigger className="w-[140px] h-6 text-[10px] bg-background" data-testid="select-enrichment-model">
                      <Bot className="h-3 w-3 mr-1 text-muted-foreground" />
                      <SelectValue placeholder="Model" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[250px]">
                      {LLM_MODELS.map((model) => (
                        <SelectItem key={model.id} value={model.id} className="text-xs">
                          <div className="flex items-center gap-1.5">
                            <span>{model.name}</span>
                            {model.free && (
                              <span className="px-1 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[8px] font-semibold rounded">FREE</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleEnrichWithAI(company)}
                    disabled={isEnrichingWithBing}
                    className="h-6 text-xs"
                  >
                    {isEnrichingWithBing ? (
                      <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Enriching...</>
                    ) : (
                      <><Sparkles className="h-3 w-3 mr-1" /> Enrich</>
                    )}
                  </Button>
                </div>
              </div>
              <EditableField
                value={company.summary || ''}
                onSave={(val) => handleUpdateCompany('summary', String(val))}
                className="text-sm leading-relaxed"
                placeholder="A brief 2-4 sentence description of the company..."
              />
              {company.relevanceReason && (
                <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-blue-700 dark:text-blue-300">
                  <span className="font-medium">Search Relevance:</span> {company.relevanceReason}
                </div>
              )}
            </div>

            <Separator />

            {/* §7.3 Business Profile */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Business Profile
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">Core Activity</label>
                  <EditableField
                    value={company.coreActivity || ''}
                    onSave={(val) => handleUpdateCompany('coreActivity', String(val))}
                    className="text-sm mt-0.5"
                    placeholder="What the company primarily does"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Operating Model</label>
                  <EditableField
                    value={company.operatingModel || ''}
                    onSave={(val) => handleUpdateCompany('operatingModel', String(val))}
                    className="text-sm mt-0.5"
                    placeholder="How the company operates"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Primary Revenue Drivers</label>
                  <EditableField
                    value={company.revenueDrivers || ''}
                    onSave={(val) => handleUpdateCompany('revenueDrivers', String(val))}
                    className="text-sm mt-0.5"
                    placeholder="Main sources of revenue"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* §7.5 Notes (User Editable) */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Notes
                </h3>
                {!isEditingCompanyNotes && (
                  <Button variant="ghost" size="sm" onClick={() => setIsEditingCompanyNotes(true)} className="h-6 text-xs">
                    <Edit2 className="h-3 w-3 mr-1" /> Edit
                  </Button>
                )}
              </div>
              
              {isLoadingCompanyNotes ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading notes...
                </div>
              ) : companyNotesError ? (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" /> {companyNotesError}
                </div>
              ) : isEditingCompanyNotes ? (
                <div className="space-y-2">
                  <Textarea
                    value={companyNotes}
                    onChange={(e) => setCompanyNotes(e.target.value)}
                    placeholder="Add internal notes and insights about this company..."
                    className="min-h-[100px] text-sm"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveCompanyNotes} disabled={isSavingCompanyNotes}>
                      {isSavingCompanyNotes ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => {
                      setIsEditingCompanyNotes(false);
                      fetchCompanyNotes(company.id);
                    }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-3 border rounded-lg bg-muted/20 min-h-[60px]">
                  {companyNotes ? (
                    <p className="text-sm whitespace-pre-wrap">{companyNotes}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No notes yet. Click Edit to add notes.</p>
                  )}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-2 italic">
                Notes are private and not sourced from external data.
              </p>
            </div>

            <Separator />

            {/* Key Executives */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Users className="h-4 w-4" /> Key Executives
                </h3>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-xs text-primary hover:bg-primary/10"
                  onClick={handleAddExecutive}
                  data-testid="button-add-executive"
                >
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>

              <div className="space-y-2">
                {companyExecutives.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No executives found. Click Add to create one.</p>
                ) : (
                  companyExecutives.map(exec => (
                    <div 
                      key={exec.id} 
                      className="group p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/30 transition-all bg-card cursor-pointer" 
                      onClick={() => handleSelectExecutive(exec.id)}
                      data-testid={`card-executive-${exec.id}`}
                    >
                      <div className="flex gap-3">
                        <div className="shrink-0">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${exec.isEnriched ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-primary/10 text-primary'}`}>
                            {exec.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start gap-2">
                            <span className="font-medium text-sm truncate hover:text-primary transition-colors">
                              {exec.name}
                            </span>
                            <span className={`text-[10px] font-medium shrink-0 ${exec.confidence >= 7 ? 'text-green-600' : exec.confidence >= 4 ? 'text-amber-600' : 'text-red-500'}`}>
                              {exec.confidence}/10
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {exec.title}
                          </div>
                          <p className="text-[10px] text-primary mt-1">
                            Click to view details
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* §7.6 Data Confidence Footer - Always visible */}
        <div className="sticky bottom-0 p-3 border-t border-border bg-muted/30 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Data Confidence</span>
            </div>
            <div className="flex items-center gap-2">
              {company.lastVerifiedYear && (
                <span className="text-xs text-muted-foreground">
                  Verified {company.lastVerifiedYear}
                </span>
              )}
              <Badge className={`text-xs ${confidenceInfo.color}`}>
                {confidenceInfo.label} ({company.confidence}/10)
              </Badge>
            </div>
          </div>
          {company.source && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Source: {company.source}
            </p>
          )}
        </div>
      </div>
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
  const [localExecutive, setLocalExecutive] = useState(executiveDetails?.executive);
  
  const [careerSummary, setCareerSummary] = useState('');
  const [notes, setNotes] = useState('');
  const [remunerationNotes, setRemunerationNotes] = useState('');
  const [availability, setAvailability] = useState('');
  
  const [editingField, setEditingField] = useState<string | null>(null);
  
  const [viewMode, setViewMode] = useState<'profile' | 'source'>('profile');
  const [sourceText, setSourceText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedModel, setSelectedModel] = useState('meta-llama/llama-3.3-70b-instruct:free');

  const EXTRACTION_MODELS = [
    { value: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (Free)' },
    { value: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
    { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
    { value: 'openai/gpt-4o', label: 'GPT-4o' },
    { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'deepseek/deepseek-chat', label: 'DeepSeek Chat' },
  ];
  const [editingLinkedIn, setEditingLinkedIn] = useState(false);
  const [linkedInInput, setLinkedInInput] = useState('');

  useEffect(() => {
    if (executiveDetails) {
      setLocalExecutive(executiveDetails.executive);
      setCareerSummary(executiveDetails.executive.careerSummary || '');
      setNotes(executiveDetails.executive.notes || '');
      setRemunerationNotes(executiveDetails.executive.remunerationNotes || '');
      setAvailability(executiveDetails.executive.availability || '');
      setSourceText(executiveDetails.executive.sourceText || '');
      setLinkedInInput(executiveDetails.executive.linkedin || '');
    }
  }, [executiveDetails]);

  const handleUpdateExecutiveField = async (field: string, value: string) => {
    if (!localExecutive) return;
    
    setLocalExecutive(prev => prev ? { ...prev, [field]: value } : prev);
    
    const { executives, setExecutives } = useAppStore.getState();
    const updatedExecutives = executives.map(e => 
      e.id === String(localExecutive.id) ? { ...e, [field]: value } : e
    );
    setExecutives(updatedExecutives);
    
    try {
      await fetch(`/api/executives/${localExecutive.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      });
    } catch (error) {
      toast.error('Failed to update');
    }
  };

  const handleSaveTextField = async (field: string, value: string) => {
    setEditingField(null);
    await handleUpdateExecutiveField(field, value);
    toast.success('Saved');
  };

  const handleExtractProfile = async () => {
    if (!localExecutive || !sourceText.trim()) {
      toast.error('Please paste some text first');
      return;
    }

    setIsExtracting(true);
    try {
      const response = await fetch(`/api/executives/${localExecutive.id}/extract-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceText, model: selectedModel })
      });

      if (!response.ok) {
        throw new Error('Extraction failed');
      }

      const data = await response.json();
      
      setLocalExecutive(data.executive);
      if (data.executive.careerSummary) setCareerSummary(data.executive.careerSummary);
      if (data.executive.remunerationNotes) setRemunerationNotes(data.executive.remunerationNotes);
      if (data.executive.linkedin) setLinkedInInput(data.executive.linkedin);
      
      const { executives, setExecutives } = useAppStore.getState();
      const updatedExecutives = executives.map(e => 
        e.id === String(localExecutive.id) ? { 
          ...e, 
          name: data.executive.name || e.name,
          title: data.executive.title || e.title
        } : e
      );
      setExecutives(updatedExecutives);
      
      setViewMode('profile');
      toast.success('Profile extracted successfully');
      onRefresh();
    } catch (error) {
      console.error('Extraction error:', error);
      toast.error('Failed to extract profile');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSaveLinkedIn = async () => {
    setEditingLinkedIn(false);
    await handleUpdateExecutiveField('linkedin', linkedInInput);
    toast.success('LinkedIn URL saved');
  };

  if (isLoading) {
    return (
      <div className="h-full flex shrink-0 relative z-20">
        {onToggle && (
          <Button variant="secondary" size="icon" onClick={onToggle}
            className="absolute -left-8 top-4 h-8 w-8 rounded-r-none rounded-l-md border border-r-0 border-border shadow-md z-50 flex items-center justify-center bg-background">
            {isOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        )}
        <div className={`h-full bg-background/95 backdrop-blur-sm border-l border-border flex flex-col items-center justify-center shadow-xl transition-all overflow-hidden ${!isOpen ? 'w-0 border-l-0' : ''}`} 
          style={{ width: isOpen ? width : 0, minWidth: isOpen ? 280 : 0 }}>
          {isOpen && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!executiveDetails) {
    return (
      <div className="h-full flex shrink-0 relative z-20">
        {onToggle && (
          <Button variant="secondary" size="icon" onClick={onToggle}
            className="absolute -left-8 top-4 h-8 w-8 rounded-r-none rounded-l-md border border-r-0 border-border shadow-md z-50 flex items-center justify-center bg-background">
            {isOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        )}
        <div className={`h-full bg-background/95 backdrop-blur-sm border-l border-border flex flex-col items-center justify-center shadow-xl transition-all overflow-hidden ${!isOpen ? 'w-0 border-l-0' : ''}`}
          style={{ width: isOpen ? width : 0, minWidth: isOpen ? 280 : 0 }}>
          {isOpen && (
            <>
              <AlertCircle className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No executive data</p>
              <Button variant="ghost" onClick={onBack} className="mt-4">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  const { company } = executiveDetails;
  const executive = localExecutive || executiveDetails.executive;

  return (
    <div className="h-full flex shrink-0 relative z-20 animate-in slide-in-from-right-10 duration-300">
      {onToggle && (
        <Button variant="secondary" size="icon" onClick={onToggle}
          className="absolute -left-8 top-4 h-8 w-8 rounded-r-none rounded-l-md border border-r-0 border-border shadow-md z-50 flex items-center justify-center bg-background"
          data-testid="button-toggle-right-panel-exec">
          {isOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      )}
      <div className={`h-full bg-background/95 backdrop-blur-sm border-l border-border flex flex-col shadow-xl transition-all overflow-hidden ${!isOpen ? 'w-0 border-l-0' : ''}`}
        style={{ width: isOpen ? width : 0, minWidth: isOpen ? 280 : 0 }}>
      
      <div className={`flex flex-col h-full ${!isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/10">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              {viewMode === 'source' ? 'Source Text' : 'Executive Profile'}
            </span>
          </div>
          {viewMode === 'profile' && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setViewMode('source')}
              className="text-xs"
              data-testid="button-edit-source"
            >
              <FileDown className="h-3 w-3 mr-1" /> Edit Source
            </Button>
          )}
        </div>

        {viewMode === 'source' ? (
          <div className="flex-1 flex flex-col p-6">
            <div className="mb-4">
              <h3 className="text-sm font-semibold mb-2">Paste Raw Text</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Paste text from LinkedIn, resumes, or other sources. AI will extract name, title, career history, and compensation data.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <label className="text-xs text-muted-foreground">Model:</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="flex-1 text-xs px-2 py-1 border rounded bg-background"
                  data-testid="select-extraction-model"
                >
                  {EXTRACTION_MODELS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <Textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="Paste executive profile text here...&#10;&#10;Example:&#10;John Smith - Chief Executive Officer at Acme Corp&#10;LinkedIn: linkedin.com/in/johnsmith&#10;Previous: VP at TechCo (2018-2022)..."
              className="flex-1 min-h-[300px] resize-none"
              data-testid="textarea-source-text"
            />
            <div className="flex gap-2 mt-4">
              <Button 
                onClick={handleExtractProfile}
                disabled={isExtracting || !sourceText.trim()}
                className="flex-1"
                data-testid="button-extract-profile"
              >
                {isExtracting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Extract Profile
                  </>
                )}
              </Button>
              {(careerSummary || remunerationNotes || executive.linkedin) && (
                <Button 
                  variant="outline" 
                  onClick={() => setViewMode('profile')}
                  data-testid="button-view-profile"
                >
                  View Profile
                </Button>
              )}
            </div>
          </div>
        ) : (
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            <div className="flex items-start gap-4">
              <div className="relative group">
                <div className="w-20 h-20 rounded-full flex items-center justify-center font-bold text-2xl bg-primary/10 text-primary overflow-hidden">
                  {(() => {
                    const imgUrl = localExecutive?.imageUrl || executive.imageUrl;
                    if (imgUrl && imgUrl.length > 0) {
                      return <img src={imgUrl} alt={executive.name} className="w-full h-full object-cover" />;
                    }
                    return executive.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                  })()}
                </div>
                <label className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                  <Camera className="h-5 w-5 text-white" />
                  <input type="file" accept="image/*" className="hidden" 
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !localExecutive) return;
                      const formData = new FormData();
                      formData.append('image', file);
                      try {
                        const response = await fetch(`/api/executives/${localExecutive.id}/image`, {
                          method: 'POST',
                          body: formData
                        });
                        if (response.ok) {
                          const { imageUrl } = await response.json();
                          setLocalExecutive(prev => prev ? { ...prev, imageUrl } : prev);
                          const { executives, setExecutives } = useAppStore.getState();
                          setExecutives(executives.map(e => 
                            e.id === String(localExecutive.id) ? { ...e, imageUrl } : e
                          ));
                          toast.success('Photo updated');
                        }
                      } catch (error) {
                        toast.error('Failed to upload');
                      }
                    }}
                  />
                </label>
              </div>
              <div className="flex-1">
                <EditableField
                  value={executive.name}
                  onSave={(val) => handleUpdateExecutiveField('name', String(val))}
                  className="text-xl font-serif font-bold"
                  inputClassName="text-xl font-serif font-bold"
                  placeholder="Name"
                />
                <EditableField
                  value={executive.title}
                  onSave={(val) => handleUpdateExecutiveField('title', String(val))}
                  className="text-sm text-muted-foreground"
                  placeholder="Title"
                />
                {company && (
                  <p className="text-xs text-muted-foreground mt-1">{company.name}</p>
                )}
              </div>
            </div>

            {executive.linkedin && !editingLinkedIn ? (
              <div className="flex items-center gap-2">
                <a href={executive.linkedin} target="_blank" rel="noopener noreferrer" 
                  className="flex-1 flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                  <Linkedin className="h-4 w-4 text-blue-600" />
                  <span className="text-blue-600 truncate">LinkedIn Profile</span>
                </a>
                <Button variant="ghost" size="icon" onClick={() => setEditingLinkedIn(true)} className="h-8 w-8">
                  <Edit2 className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="p-3 border border-dashed rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Linkedin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">LinkedIn URL</span>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={linkedInInput}
                    onChange={(e) => setLinkedInInput(e.target.value)}
                    placeholder="https://linkedin.com/in/username"
                    className="text-sm flex-1"
                    data-testid="input-linkedin"
                  />
                  <Button size="sm" onClick={handleSaveLinkedIn}>
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            <Separator />

            <div>
              <div className="flex items-center gap-2 mb-3">
                <Briefcase className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Career History</h3>
              </div>
              {editingField === 'careerSummary' ? (
                <div className="space-y-2">
                  <Textarea
                    autoFocus
                    value={careerSummary}
                    onChange={(e) => setCareerSummary(e.target.value)}
                    onBlur={() => handleSaveTextField('careerSummary', careerSummary)}
                    placeholder="AI-generated career summary or paste from other sources..."
                    className="min-h-[120px]"
                  />
                  <p className="text-xs text-muted-foreground">Click outside to save</p>
                </div>
              ) : (
                <div 
                  className="p-3 border rounded-lg bg-card min-h-[80px] cursor-text hover:bg-muted/30 transition-colors"
                  onClick={() => setEditingField('careerSummary')}>
                  {careerSummary ? (
                    <p className="text-sm whitespace-pre-wrap">{careerSummary}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Click to add career history summary...</p>
                  )}
                </div>
              )}
            </div>

            <Separator />

            <div>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Notes</h3>
              </div>
              {editingField === 'notes' ? (
                <div className="space-y-2">
                  <Textarea
                    autoFocus
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onBlur={() => handleSaveTextField('notes', notes)}
                    placeholder="Internal notes and assessments..."
                    className="min-h-[100px]"
                  />
                  <p className="text-xs text-muted-foreground">Click outside to save</p>
                </div>
              ) : (
                <div 
                  className="p-3 border rounded-lg bg-card min-h-[60px] cursor-text hover:bg-muted/30 transition-colors"
                  onClick={() => setEditingField('notes')}>
                  {notes ? (
                    <p className="text-sm whitespace-pre-wrap">{notes}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Click to add notes...</p>
                  )}
                </div>
              )}
            </div>

            <Separator />

            <div>
              <div className="flex items-center gap-2 mb-3">
                <Banknote className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Remuneration</h3>
              </div>
              {editingField === 'remunerationNotes' ? (
                <div className="space-y-2">
                  <Textarea
                    autoFocus
                    value={remunerationNotes}
                    onChange={(e) => setRemunerationNotes(e.target.value)}
                    onBlur={() => handleSaveTextField('remunerationNotes', remunerationNotes)}
                    placeholder="Compensation details, salary expectations..."
                    className="min-h-[100px]"
                  />
                  <p className="text-xs text-muted-foreground">Click outside to save</p>
                </div>
              ) : (
                <div 
                  className="p-3 border rounded-lg bg-card min-h-[60px] cursor-text hover:bg-muted/30 transition-colors"
                  onClick={() => setEditingField('remunerationNotes')}>
                  {remunerationNotes ? (
                    <p className="text-sm whitespace-pre-wrap">{remunerationNotes}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Click to add remuneration details...</p>
                  )}
                </div>
              )}
            </div>

            <Separator />

            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Availability</h3>
              </div>
              {editingField === 'availability' ? (
                <div className="space-y-2">
                  <Textarea
                    autoFocus
                    value={availability}
                    onChange={(e) => setAvailability(e.target.value)}
                    onBlur={() => handleSaveTextField('availability', availability)}
                    placeholder="Notice period, availability, relocation preferences..."
                    className="min-h-[100px]"
                  />
                  <p className="text-xs text-muted-foreground">Click outside to save</p>
                </div>
              ) : (
                <div 
                  className="p-3 border rounded-lg bg-card min-h-[60px] cursor-text hover:bg-muted/30 transition-colors"
                  onClick={() => setEditingField('availability')}>
                  {availability ? (
                    <p className="text-sm whitespace-pre-wrap">{availability}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Click to add availability info...</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
        )}
      </div>
      </div>
    </div>
  );
}
