import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useAppStore } from '@/lib/store';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Search, Loader2, Upload, Table2, Plus, Trash2, FileSpreadsheet, X, Sun, Moon,
  FolderOpen, FileText, CheckCircle2, Building2, Globe, Users,
  Sparkles, SendHorizonal, ArrowRight, CheckCheck, RotateCcw, ListFilter, Activity, Square
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { COUNTRIES } from '@/lib/countries';
import ProjectsPanel from '@/components/panels/ProjectsPanel';
import { useSearchStream } from '@/lib/useSearchStream';
import type { InferredIntent, ActivityEvent } from '@shared/schema';
import type { StreamCompany } from '@/lib/useSearchStream';

// ─── Local types ─────────────────────────────────────────────────────────────
type LandingMode = 'search' | 'import';

interface ManualRow {
  id: string;
  company: string;
  name: string;
  title: string;
  country: string;
}

function createEmptyRow(): ManualRow {
  return { id: crypto.randomUUID(), company: '', name: '', title: '', country: '' };
}

// ─── Combobox ─────────────────────────────────────────────────────────────────
function ComboboxCell({ value, onChange, options, placeholder, testId, fetchOptions }: {
  value: string;
  onChange: (val: string) => void;
  options?: string[];
  placeholder?: string;
  testId?: string;
  fetchOptions?: (query: string) => Promise<string[]>;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [dynamicOptions, setDynamicOptions] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!fetchOptions || filter.length < 2) { setDynamicOptions([]); return; }
    const timer = setTimeout(async () => {
      const results = await fetchOptions(filter);
      setDynamicOptions(results);
    }, 200);
    return () => clearTimeout(timer);
  }, [filter, fetchOptions]);

  const allOptions = fetchOptions ? dynamicOptions : (options || []);
  const filtered = filter ? allOptions.filter(o => o.toLowerCase().includes(filter.toLowerCase())) : allOptions;

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={open ? filter : value}
        onFocus={() => { setOpen(true); setFilter(value); }}
        onChange={e => { setFilter(e.target.value); onChange(e.target.value); if (!open) setOpen(true); }}
        className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary/50 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
        placeholder={placeholder}
        data-testid={testId}
        autoComplete="off"
      />
      {open && filtered.slice(0, 30).length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-popover border border-border rounded shadow-lg max-h-48 overflow-y-auto">
          {filtered.slice(0, 30).map(opt => (
            <button
              key={opt}
              type="button"
              className={`w-full text-left px-2 py-1 text-xs hover:bg-accent transition-colors ${opt === value ? 'bg-accent/50 font-medium' : ''}`}
              onMouseDown={e => {
                e.preventDefault();
                onChange(opt);
                setFilter(opt);
                setOpen(false);
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Column detection ─────────────────────────────────────────────────────────
const ALL_FIELD_PATTERNS: Record<string, string[]> = {
  name: ['name', 'full name', 'fullname', 'executive', 'executive name', 'person', 'candidate', 'contact', 'contact name', 'individual', 'first name', 'lastname'],
  company: ['company', 'company name', 'companyname', 'organization', 'organisation', 'employer', 'firm', 'business', 'enterprise', 'corporation', 'entity', 'group', 'current company'],
  title: ['title', 'job title', 'jobtitle', 'position', 'role', 'designation', 'function', 'job role', 'current title', 'current position', 'rank'],
  country: ['country', 'location', 'hq country', 'headquarters', 'hq', 'nation', 'region', 'geography', 'geo', 'territory', 'market'],
  sector: ['sector', 'industry', 'vertical', 'segment', 'business type', 'business sector', 'field', 'domain'],
  revenue: ['revenue', 'annual revenue', 'total revenue', 'turnover', 'sales', 'annual sales', 'gross revenue'],
  employees: ['employees', 'employee count', 'headcount', 'staff count', 'workforce', 'number of employees', 'team size'],
  email: ['email', 'e-mail', 'email address', 'mail', 'email id', 'contact email'],
  phone: ['phone', 'telephone', 'tel', 'mobile', 'cell', 'phone number', 'contact number'],
  linkedin: ['linkedin', 'linkedin url', 'linkedin profile', 'profile url', 'linkedin link'],
  notes: ['notes', 'comments', 'remarks', 'description', 'additional info', 'memo'],
  remunerationNotes: ['remuneration', 'salary', 'compensation', 'pay', 'package', 'total compensation', 'comp'],
  availability: ['availability', 'available', 'status', 'availability status', 'notice period'],
};

function detectColumnMappings(headers: string[]): Record<string, string> {
  const mappings: Record<string, string> = {};
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim().replace(/[_\-\.]/g, ' '));
  const usedIndices = new Set<number>();

  normalizedHeaders.forEach((header, index) => {
    for (const [field, patterns] of Object.entries(ALL_FIELD_PATTERNS)) {
      if (mappings[field]) continue;
      if (patterns.includes(header)) {
        mappings[field] = headers[index];
        usedIndices.add(index);
        break;
      }
    }
  });

  normalizedHeaders.forEach((header, index) => {
    if (usedIndices.has(index)) return;
    for (const [field, patterns] of Object.entries(ALL_FIELD_PATTERNS)) {
      if (mappings[field]) continue;
      if (patterns.some(p => header.includes(p) || p.includes(header))) {
        mappings[field] = headers[index];
        usedIndices.add(index);
        break;
      }
    }
  });
  return mappings;
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Name', company: 'Company', title: 'Title', country: 'Country',
  sector: 'Sector', revenue: 'Revenue', employees: 'Employees',
  email: 'Email', phone: 'Phone', linkedin: 'LinkedIn', notes: 'Notes',
  remunerationNotes: 'Remuneration', availability: 'Status',
};

// ─── Activity Icon ─────────────────────────────────────────────────────────────
function ActivityIcon({ type }: { type: string }) {
  switch (type) {
    case 'intent_extracted': return <Sparkles className="w-3.5 h-3.5 text-violet-500" />;
    case 'company_found': return <Building2 className="w-3.5 h-3.5 text-blue-500" />;
    case 'company_enriched': return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
    case 'adjacent_sector_found': return <ListFilter className="w-3.5 h-3.5 text-amber-500" />;
    case 'executive_found': return <Users className="w-3.5 h-3.5 text-indigo-500" />;
    case 'search_complete': return <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />;
    case 'error': return <X className="w-3.5 h-3.5 text-destructive" />;
    default: return <Activity className="w-3.5 h-3.5 text-muted-foreground" />;
  }
}

// ─── Skeleton Company Card ────────────────────────────────────────────────────
function SkeletonCompanyRow({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3 px-4 h-14 animate-pulse border-b border-border/30" data-testid={`card-skeleton-${name}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{name}</p>
        <div className="h-2.5 bg-muted rounded mt-1 w-20" />
      </div>
      <div className="h-3 bg-muted rounded w-16" />
      <div className="h-4 w-14 bg-muted rounded-full" />
      <div className="h-3 bg-muted rounded w-8" />
      <div className="h-3 bg-muted rounded w-32 hidden md:block" />
      <div className="flex items-center gap-1.5 shrink-0">
        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}

// ─── Company Row (compact list item) ──────────────────────────────────────────
function CompanyRow({ company, onAccept, onReject }: {
  company: StreamCompany;
  onAccept: () => void;
  onReject: () => void;
}) {
  const badgeColor = company.relevanceType === 'Direct'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
    : company.relevanceType === 'Adjacent'
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
    : 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400';

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={{ duration: 0.15 }}
      className={`flex items-center gap-3 px-4 h-14 transition-colors ${
        company.accepted
          ? 'bg-emerald-50/60 dark:bg-emerald-900/10'
          : company.rejected
          ? 'bg-muted/20 opacity-40'
          : 'hover:bg-muted/30'
      }`}
      data-testid={`card-company-${company.id}`}
    >
      <div className="flex-1 min-w-0 flex flex-col justify-center" style={{ minWidth: '140px', maxWidth: '220px' }}>
        <p className="font-semibold text-[13px] text-foreground truncate leading-tight" data-testid={`text-company-name-${company.id}`}>{company.name}</p>
        {company.sector && (
          <span className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">{company.sector}</span>
        )}
      </div>

      <div className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0 w-[100px]">
        {company.country && (
          <>
            <Globe className="w-3 h-3 shrink-0" />
            <span className="truncate">{company.country}</span>
          </>
        )}
      </div>

      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap ${badgeColor}`}>
        {company.relevanceType}
      </span>

      <span className="text-[11px] font-semibold text-foreground shrink-0 w-[40px] text-right tabular-nums">
        {company.confidenceScore}%
      </span>

      <p className="text-[10px] text-muted-foreground italic truncate hidden md:block flex-1 min-w-0 leading-tight" data-testid={`text-relevance-rationale-${company.id}`}>
        {company.relevanceRationale || ''}
      </p>

      {!company.rejected && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onAccept}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              company.accepted
                ? 'bg-emerald-500 text-white'
                : 'bg-muted/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-700 text-muted-foreground'
            }`}
            data-testid={`button-accept-company-${company.id}`}
          >
            <Plus className="w-3 h-3" />
            <span className="hidden sm:inline">{company.accepted ? 'Added' : 'Add'}</span>
          </button>
          {!company.accepted && (
            <button
              onClick={onReject}
              className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
              data-testid={`button-reject-company-${company.id}`}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ─── Intent Summary Badges ────────────────────────────────────────────────────
function IntentBadges({ intent }: { intent: InferredIntent }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {intent.primarySectors.map(s => (
        <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{s}</span>
      ))}
      {intent.targetGeographies.map(g => (
        <span key={g} className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">{g}</span>
      ))}
      {intent.commercialRole && intent.commercialRole !== 'any' && (
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400">{intent.commercialRole}</span>
      )}
    </div>
  );
}

// ─── Main Landing ─────────────────────────────────────────────────────────────
export default function Landing() {
  const [, setLocation] = useLocation();
  const { setProject, loadFromAPI } = useAppStore();

  const [mode, setMode] = useState<LandingMode>('search');
  const [input, setInput] = useState('');
  const [showProjectsPanel, setShowProjectsPanel] = useState(false);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  // Stable session ID for this Landing mount
  const [sessionId] = useState(() => crypto.randomUUID());

  // PD upload state
  const [pdFileName, setPdFileName] = useState('');
  const [pdExtractedPreview, setPdExtractedPreview] = useState('');
  const [pdPreviewExpanded, setPdPreviewExpanded] = useState(false);
  const [isUploadingPd, setIsUploadingPd] = useState(false);
  const [pdConfidential, setPdConfidential] = useState(false);

  // UI state
  const [activeTab, setActiveTab] = useState<'all' | 'direct' | 'adjacent'>('all');
  const [mobileTab, setMobileTab] = useState<'intelligence' | 'results'>('results');
  const [refinementInput, setRefinementInput] = useState('');
  const [debouncedRefinement, setDebouncedRefinement] = useState('');
  const refinementDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [savedProjectId, setSavedProjectId] = useState<number | null>(null);
  const [savedProjectSummary, setSavedProjectSummary] = useState<{ total: number; direct: number; adjacent: number; executives: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Import state
  const [importTab, setImportTab] = useState<'file' | 'paste' | 'manual'>('file');
  const [isImporting, setIsImporting] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [importPreview, setImportPreview] = useState<{
    headers: string[];
    rows: string[][];
    mappings: Record<string, string>;
    fileName?: string;
  } | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [manualRows, setManualRows] = useState<ManualRow[]>(() => Array.from({ length: 5 }, createEmptyRow));

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdFileInputRef = useRef<HTMLInputElement>(null);
  const activityFeedRef = useRef<HTMLDivElement>(null);

  // ─── Search Stream Hook ────────────────────────────────────────────────────
  const {
    phase,
    intent,
    activities,
    companies,
    pendingCompanyNames,
    searchQueryId,
    isStreaming,
    isRefining,
    startSearch,
    stopSearch,
    startRefinement,
    acceptCompany,
    rejectCompany,
    reset,
  } = useSearchStream();

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
  };

  // Auto-scroll activity feed
  useEffect(() => {
    if (activityFeedRef.current) {
      activityFeedRef.current.scrollTop = activityFeedRef.current.scrollHeight;
    }
  }, [activities]);

  // ─── PD Upload ─────────────────────────────────────────────────────────────
  const uploadPdFile = async (file: File) => {
    setIsUploadingPd(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sessionId', sessionId);
      formData.append('pdConfidential', String(pdConfidential));
      const res = await fetch('/api/search/upload-pd', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || 'Upload failed');
      }
      const data = await res.json();
      setPdFileName(data.filename);
      setPdExtractedPreview(data.extractedText?.slice(0, 500) || '');
      toast.success(`Loaded "${data.filename}" — ${data.charCount.toLocaleString()} characters extracted`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload file');
    } finally {
      setIsUploadingPd(false);
      if (pdFileInputRef.current) pdFileInputRef.current.value = '';
    }
  };

  const handlePdUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadPdFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type === 'application/pdf' || file.name.endsWith('.docx') || file.name.endsWith('.txt'))) {
      await uploadPdFile(file);
    } else if (file) {
      toast.error('Please drop a PDF, DOCX, or TXT file');
    }
  };

  // ─── Search ────────────────────────────────────────────────────────────────
  const handleEnhancedSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && !pdFileName) { toast.error('Please describe what you are looking for, or upload a Position Description'); return; }
    startSearch(input.trim() || `PD: ${pdFileName}`, sessionId);
  };

  // ─── Refinement ────────────────────────────────────────────────────────────
  const handleRefinement = async () => {
    if (!refinementInput.trim()) return;
    const msg = refinementInput.trim();
    setRefinementInput('');
    await startRefinement(sessionId, msg);
  };

  // ─── Project Save ─────────────────────────────────────────────────────────
  const saveCompaniesToProject = async (companiesToSave: StreamCompany[]) => {
    const res = await fetch('/api/search/add-to-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyIds: companiesToSave.map(c => c.id),
        sessionId,
        query: input,
      })
    });
    if (!res.ok) throw new Error('Failed to save project');
    const data = await res.json();
    setProject({ id: String(data.searchQueryId), name: input || 'AI Search', search_string: input, created_at: new Date() });
    const fullResults = await fetch(`/api/search-history/${data.searchQueryId}/load`);
    if (fullResults.ok) {
      const loaded = await fullResults.json();
      loadFromAPI(loaded.results || [], loaded.satelliteHierarchies || {}, loaded.tableConfig || null, loaded.mapPositions || {});
    } else {
      loadFromAPI([], {}, null, {});
    }
    return data;
  };

  const handleSaveProject = async () => {
    const accepted = companies.filter(c => c.accepted);
    if (accepted.length === 0) { toast.error('Select at least one company to save'); return; }
    setIsSavingProject(true);
    try {
      const result = await saveCompaniesToProject(accepted);
      toast.success(`Saved ${accepted.length} companies to your project`);
      const direct = accepted.filter(c => c.relevanceType === 'Direct').length;
      const adjacent = accepted.filter(c => c.relevanceType !== 'Direct').length;
      const executives = accepted.reduce((sum, c) => sum + (c.executives?.length ?? 0), 0);
      setSavedProjectSummary({ total: accepted.length, direct, adjacent, executives });
      setSavedProjectId(result?.searchQueryId ?? null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save project');
    } finally {
      setIsSavingProject(false);
    }
  };

  const handleGoToDashboard = async () => {
    const nonRejected = companies.filter(c => !c.rejected);
    if (nonRejected.length === 0) { reset(); return; }
    setIsSavingProject(true);
    try {
      await saveCompaniesToProject(nonRejected);
      setLocation('/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Failed to navigate');
    } finally {
      setIsSavingProject(false);
    }
  };

  // ─── Import handlers ───────────────────────────────────────────────────────
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { header: 1 });
        if (jsonData.length < 2) { toast.error('File must have at least a header row and one data row'); return; }
        const headers = (jsonData[0] as any[]).map(h => String(h || '').trim()).filter(Boolean);
        const rows = (jsonData as any[]).slice(1).map(row => headers.map((_, i) => String((row as any[])[i] ?? '').trim())).filter(row => row.some(cell => cell.length > 0));
        if (rows.length === 0) { toast.error('No data rows found'); return; }
        const mappings = detectColumnMappings(headers);
        setProjectName(file.name.replace(/\.(xlsx|xls|csv)$/i, ''));
        setImportPreview({ headers, rows, mappings, fileName: file.name });
        toast.success(`Loaded ${rows.length} rows from "${file.name}"`);
      } catch { toast.error('Failed to read the file.'); }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handlePastePreview = useCallback(() => {
    if (!pasteText.trim()) { toast.error('Please paste some data'); return; }
    const lines = pasteText.trim().split('\n');
    if (lines.length < 2) { toast.error('Need at least a header row and one data row'); return; }
    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map(line => line.split(delimiter).map(cell => cell.trim().replace(/^"|"$/g, ''))).filter(row => row.some(cell => cell.length > 0));
    if (rows.length === 0) { toast.error('No data rows found'); return; }
    setImportPreview({ headers, rows, mappings: detectColumnMappings(headers) });
    toast.success(`Parsed ${rows.length} rows`);
  }, [pasteText]);

  const submitImport = useCallback(async (records: Record<string, string>[], mappings: Record<string, string>) => {
    setIsImporting(true);
    try {
      loadFromAPI([], {}, null, {});
      toast.loading('Creating project and importing data...', { id: 'import' });
      const response = await fetch('/api/import-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: projectName || `Import ${new Date().toLocaleDateString()}`, records, mappings })
      });
      toast.dismiss('import');
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Import failed' }));
        throw new Error(err.error || 'Import failed');
      }
      const result = await response.json();
      setProject({ id: String(result.searchQueryId), name: result.projectName, search_string: result.projectName, created_at: new Date() });
      loadFromAPI(result.results || [], {}, null, {});
      toast.success(`Imported ${result.recordsImported} records across ${result.companiesCreated} companies`);
      setLocation('/dashboard');
    } catch (error: any) {
      toast.dismiss('import');
      toast.error(error.message || 'Import failed');
    } finally {
      setIsImporting(false);
    }
  }, [projectName, loadFromAPI, setProject, setLocation]);

  const handleConfirmImport = useCallback(async () => {
    if (!importPreview) return;
    const { headers, rows, mappings } = importPreview;
    const records = rows.map(row => {
      const r: Record<string, string> = {};
      headers.forEach((h, i) => { r[h] = row[i] || ''; });
      return r;
    }).filter(r => (mappings.name && r[mappings.name]?.trim()) || (mappings.company && r[mappings.company]?.trim()) || (mappings.title && r[mappings.title]?.trim()));
    if (records.length === 0) { toast.error('No valid records found'); return; }
    await submitImport(records, mappings);
  }, [importPreview, submitImport]);

  const handleManualSubmit = useCallback(async () => {
    const validRows = manualRows.filter(r => r.company.trim() || r.name.trim() || r.title.trim());
    if (validRows.length === 0) { toast.error('Please fill in at least one row'); return; }
    await submitImport(
      validRows.map(r => ({ 'Country': r.country, 'Company': r.company, 'Name': r.name, 'Title': r.title })),
      { country: 'Country', company: 'Company', name: 'Name', title: 'Title' }
    );
  }, [manualRows, submitImport]);

  const fetchCompanyOptions = useCallback(async (q: string): Promise<string[]> => {
    try {
      const res = await fetch(`/api/companies/search?name=${encodeURIComponent(q)}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.from(new Set(data.map((c: any) => c.name).filter(Boolean) as string[]));
    } catch { return []; }
  }, []);

  // ─── Derived state ─────────────────────────────────────────────────────────
  const filteredCompanies = companies.filter(c => {
    if (c.rejected) return false;
    if (activeTab === 'direct') return c.relevanceType === 'Direct';
    if (activeTab === 'adjacent') return c.relevanceType === 'Adjacent' || c.relevanceType === 'AI Inferred';
    return true;
  });

  const acceptedCount = companies.filter(c => c.accepted).length;
  const directCount = companies.filter(c => c.relevanceType === 'Direct' && !c.rejected).length;
  const adjacentCount = companies.filter(c => (c.relevanceType === 'Adjacent' || c.relevanceType === 'AI Inferred') && !c.rejected).length;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen w-screen flex bg-background relative overflow-hidden">
      <TooltipProvider delayDuration={300}>
        {/* Sidebar */}
        <div className="h-full w-12 bg-sidebar border-r border-sidebar-border flex flex-col items-center py-2 shrink-0 z-20" data-testid="landing-sidebar">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setShowProjectsPanel(prev => !prev)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center mb-1 transition-colors ${showProjectsPanel ? 'bg-sidebar-accent text-sidebar-foreground shadow-sm' : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent'}`}
                data-testid="sidebar-projects"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Projects</TooltipContent>
          </Tooltip>
          <div className="flex-1" />
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={toggleTheme} className="w-8 h-8 rounded-lg flex items-center justify-center text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors" data-testid="landing-theme-toggle">
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">{isDark ? 'Light mode' : 'Dark mode'}</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      {showProjectsPanel && (
        <ProjectsPanel onClose={() => setShowProjectsPanel(false)} onProjectLoaded={() => setLocation('/dashboard')} offsetTop={8} />
      )}

      {/* ─── Phase: Input ──────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {phase === 'input' && (
          <motion.div
            key="input"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col overflow-y-auto"
          >
            <div className="absolute inset-0 z-0 opacity-5 pointer-events-none">
              <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary via-background to-background" />
            </div>

            <div className="z-10 w-full max-w-3xl mx-auto px-6 pt-12 pb-16 flex flex-col items-center">
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="text-4xl md:text-5xl font-serif font-bold tracking-tight text-foreground mb-3 text-center"
              >
                Global Talent Map
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="text-base text-muted-foreground mb-6 text-center"
              >
                AI-driven market intelligence for executive search.
              </motion.p>

              {/* Mode Tabs */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="flex items-center justify-center gap-2 mb-6"
              >
                <button
                  onClick={() => { setMode('search'); setImportPreview(null); }}
                  className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${mode === 'search' ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted/60 text-muted-foreground hover:bg-muted'}`}
                  data-testid="tab-search"
                >
                  <Search className="h-3.5 w-3.5 inline mr-1.5" />AI Search
                </button>
                <button
                  onClick={() => setMode('import')}
                  className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${mode === 'import' ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted/60 text-muted-foreground hover:bg-muted'}`}
                  data-testid="tab-import"
                >
                  <Upload className="h-3.5 w-3.5 inline mr-1.5" />Import Data
                </button>
              </motion.div>

              {/* ─── Search Mode ─────────────────────────────────────────── */}
              {mode === 'search' && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="w-full"
                >
                  <div className="relative bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
                    <div className="flex items-center gap-3 px-5 py-3 border-b border-border/40 bg-muted/20">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/20">
                        <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="text-xs font-medium text-primary">AI Intelligence</span>
                      </div>
                      <div className="flex-1" />
                      {pdFileName ? (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-2 py-1 rounded-lg">
                          <FileText className="w-3 h-3 text-primary" />
                          <span className="truncate max-w-[120px]">{pdFileName}</span>
                          <button type="button" onClick={() => setPdFileName('')} className="text-muted-foreground hover:text-foreground" data-testid="button-clear-pd">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => pdFileInputRef.current?.click()}
                              disabled={isUploadingPd}
                              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted px-2.5 py-1.5 rounded-lg transition-colors"
                              data-testid="button-upload-pd"
                            >
                              {isUploadingPd ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                              Upload PD
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">Upload a Position Description (PDF, DOCX, or TXT)</TooltipContent>
                        </Tooltip>
                      )}
                      <input ref={pdFileInputRef} type="file" accept=".pdf,.docx,.txt" onChange={handlePdUpload} className="hidden" data-testid="input-pd-file" />
                    </div>

                    <div
                      className={`p-5 transition-colors ${isDragOver ? 'bg-primary/5' : ''}`}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      data-testid="dropzone-pd-upload"
                    >
                      {isDragOver && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/50 bg-primary/5 pointer-events-none">
                          <div className="flex flex-col items-center gap-2 text-primary">
                            <FileText className="w-8 h-8" />
                            <span className="text-sm font-medium">Drop PD file here</span>
                          </div>
                        </div>
                      )}
                      {/* Example prompt chips */}
                      {!input && !pdFileName && (
                        <div className="flex flex-wrap gap-1.5 mb-3" data-testid="example-prompt-chips">
                          {[
                            'Top FMCG distributors in UAE',
                            'Leading PE firms in Saudi Arabia',
                            'Industrial equipment manufacturers in Egypt',
                            'Retail chains across GCC',
                          ].map(chip => (
                            <button
                              key={chip}
                              type="button"
                              onClick={() => setInput(chip)}
                              className="text-[11px] px-2.5 py-1 rounded-full border border-border/60 bg-muted/40 hover:bg-muted hover:border-primary/30 text-muted-foreground hover:text-foreground transition-colors"
                              data-testid={`chip-example-${chip.slice(0, 20).replace(/\s+/g, '-').toLowerCase()}`}
                            >
                              {chip}
                            </button>
                          ))}
                        </div>
                      )}
                      <Textarea
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder={"Describe what you're looking for...\n\ne.g. 'Top 10 FMCG distributors in UAE' or 'Leading private equity firms in Saudi Arabia'"}
                        className="border-0 shadow-none focus-visible:ring-0 text-base leading-relaxed bg-transparent resize-none min-h-[160px] placeholder:text-muted-foreground/50"
                        data-testid="input-search-query"
                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleEnhancedSearch({ preventDefault: () => {} } as React.FormEvent); } }}
                      />

                      {pdFileName && (
                        <div className="mt-2 space-y-1.5">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-primary/5 rounded-lg px-3 py-2">
                            <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span className="flex-1">Context loaded from <strong>{pdFileName}</strong></span>
                            <button
                              type="button"
                              onClick={() => setPdPreviewExpanded(v => !v)}
                              className="text-primary hover:underline"
                              data-testid="button-toggle-pd-preview"
                            >
                              {pdPreviewExpanded ? 'Hide' : 'Preview'}
                            </button>
                          </div>
                          {pdPreviewExpanded && pdExtractedPreview && (
                            <div className="bg-muted/40 rounded-lg px-3 py-2 max-h-32 overflow-y-auto" data-testid="pd-extracted-preview">
                              <p className="text-[10px] text-muted-foreground leading-relaxed whitespace-pre-wrap">{pdExtractedPreview}…</p>
                            </div>
                          )}
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={pdConfidential}
                              onChange={async e => {
                                const val = e.target.checked;
                                setPdConfidential(val);
                                // Persist flag to server immediately so pipeline uses correct value
                                try {
                                  await fetch(`/api/search/session/${sessionId}/confidential`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ pdConfidential: val }),
                                  });
                                } catch {
                                  // Non-fatal — server will also read flag at upload time
                                }
                              }}
                              className="w-3 h-3 rounded"
                              data-testid="checkbox-pd-confidential"
                            />
                            <span className="text-[11px] text-muted-foreground">Mark as confidential — AI will summarise key criteria only</span>
                          </label>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-4">
                        <p className="text-[11px] text-muted-foreground">
                          <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">⌘Enter</kbd> to search
                        </p>
                        <Button
                          onClick={handleEnhancedSearch}
                          disabled={!input.trim() && !pdFileName}
                          data-testid="button-submit-search"
                          className="gap-2"
                        >
                          <Sparkles className="w-4 h-4" />
                          Discover Companies
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ─── Import Mode ─────────────────────────────────────────── */}
              {mode === 'import' && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="w-full bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
                >
                  <div className="flex items-center gap-4 px-5 py-3 border-b border-border/40 bg-muted/20">
                    <input
                      type="text"
                      value={projectName}
                      onChange={e => setProjectName(e.target.value)}
                      placeholder="Project name (optional)"
                      className="flex-1 bg-transparent border-0 text-sm font-medium placeholder:text-muted-foreground/50 focus:outline-none"
                      data-testid="input-project-name"
                    />
                    <div className="flex gap-1">
                      {(['file', 'paste', 'manual'] as const).map(tab => (
                        <button
                          key={tab}
                          onClick={() => { setImportTab(tab); setImportPreview(null); }}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${importTab === tab ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
                          data-testid={`import-tab-${tab}`}
                        >
                          {tab === 'file' && <><FileSpreadsheet className="h-3.5 w-3.5 inline mr-1" />File</>}
                          {tab === 'paste' && <><Table2 className="h-3.5 w-3.5 inline mr-1" />Paste</>}
                          {tab === 'manual' && <><Plus className="h-3.5 w-3.5 inline mr-1" />Manual Entry</>}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-5 overflow-y-auto max-h-[60vh]">
                    {importTab === 'file' && !importPreview && (
                      <div
                        className="border-2 border-dashed border-border/60 rounded-xl p-10 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                        data-testid="dropzone-file-upload"
                      >
                        <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                        <p className="text-sm font-medium text-foreground mb-1">Upload Excel or CSV file</p>
                        <p className="text-xs text-muted-foreground">Supports .xlsx, .xls, and .csv formats</p>
                        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" data-testid="input-file-upload" />
                      </div>
                    )}

                    {importTab === 'paste' && !importPreview && (
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">Copy rows from Excel/Sheets and paste below. Include the header row.</p>
                        <Textarea value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder="Paste your data here..." className="min-h-[160px] text-sm font-mono" data-testid="input-paste-data" />
                        <Button onClick={handlePastePreview} className="w-full" data-testid="button-preview-paste">Preview Data</Button>
                      </div>
                    )}

                    {importTab === 'manual' && (
                      <div className="space-y-3">
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-border">
                                <th className="text-left py-2 px-2 font-medium text-muted-foreground w-8">#</th>
                                {['Country', 'Company', 'Name', 'Title'].map(h => <th key={h} className="text-left py-2 px-2 font-medium text-muted-foreground">{h}</th>)}
                                <th className="w-8"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {manualRows.map((row, idx) => (
                                <tr key={row.id} className="border-b border-border/30 hover:bg-muted/20">
                                  <td className="py-1 px-2 text-muted-foreground">{idx + 1}</td>
                                  <td className="py-1 px-1">
                                    <ComboboxCell value={row.country} onChange={val => setManualRows(prev => prev.map(r => r.id === row.id ? { ...r, country: val } : r))} options={COUNTRIES} placeholder="Country" testId={`manual-input-country-${idx}`} />
                                  </td>
                                  <td className="py-1 px-1">
                                    <ComboboxCell value={row.company} onChange={val => setManualRows(prev => prev.map(r => r.id === row.id ? { ...r, company: val } : r))} placeholder="Company" testId={`manual-input-company-${idx}`} fetchOptions={fetchCompanyOptions} />
                                  </td>
                                  {(['name', 'title'] as const).map(field => (
                                    <td key={field} className="py-1 px-1">
                                      <input type="text" value={row[field]} onChange={e => setManualRows(prev => prev.map(r => r.id === row.id ? { ...r, [field]: e.target.value } : r))} className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary/50 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30" placeholder={field.charAt(0).toUpperCase() + field.slice(1)} data-testid={`manual-input-${field}-${idx}`} />
                                    </td>
                                  ))}
                                  <td className="py-1 px-1">
                                    <button onClick={() => setManualRows(prev => prev.length > 1 ? prev.filter(r => r.id !== row.id) : prev)} className="p-1 text-muted-foreground hover:text-destructive transition-colors" data-testid={`button-remove-row-${idx}`}><Trash2 className="h-3 w-3" /></button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex items-center justify-between">
                          <Button variant="ghost" size="sm" onClick={() => setManualRows(prev => [...prev, createEmptyRow()])} data-testid="button-add-row"><Plus className="h-3.5 w-3.5 mr-1" /> Add Row</Button>
                          <Button onClick={handleManualSubmit} disabled={isImporting} data-testid="button-submit-manual">
                            {isImporting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Upload className="h-4 w-4 mr-2" />}{isImporting ? 'Importing...' : 'Import & Enrich'}
                          </Button>
                        </div>
                      </div>
                    )}

                    {importPreview && (importTab === 'file' || importTab === 'paste') && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="text-sm">
                            <span className="font-medium">{importPreview.rows.length} rows</span>
                            <span className="text-muted-foreground ml-2">{importPreview.fileName ? `from ${importPreview.fileName}` : 'from pasted data'}</span>
                          </div>
                          <button onClick={() => setImportPreview(null)} className="p-1 text-muted-foreground hover:text-foreground" data-testid="button-clear-preview"><X className="h-4 w-4" /></button>
                        </div>

                        <div>
                          <h4 className="text-xs font-medium text-muted-foreground mb-2">Column Mappings</h4>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {importPreview.headers.map((header, idx) => {
                              const currentMapping = Object.entries(importPreview.mappings).find(([, h]) => h === header)?.[0] || '';
                              return (
                                <div key={idx} className="flex items-center gap-2 bg-muted/30 rounded-lg px-2.5 py-1.5">
                                  <span className="text-xs font-medium truncate flex-1" title={header}>{header}</span>
                                  <select className="text-xs bg-background border border-border rounded px-1.5 py-1 w-28" value={currentMapping} onChange={e => {
                                    const newMappings = { ...importPreview.mappings };
                                    Object.keys(newMappings).forEach(k => { if (newMappings[k] === header) delete newMappings[k]; });
                                    if (e.target.value) newMappings[e.target.value] = header;
                                    setImportPreview({ ...importPreview, mappings: newMappings });
                                  }} data-testid={`mapping-select-${idx}`}>
                                    <option value="">-- skip --</option>
                                    <optgroup label="Executive Fields">
                                      {['name', 'title', 'email', 'phone', 'linkedin', 'notes', 'remunerationNotes', 'availability'].map(key => (
                                        <option key={key} value={key} disabled={!!importPreview.mappings[key] && importPreview.mappings[key] !== header}>{FIELD_LABELS[key]}</option>
                                      ))}
                                    </optgroup>
                                    <optgroup label="Company Fields">
                                      {['company', 'country', 'sector', 'revenue', 'employees'].map(key => (
                                        <option key={key} value={key} disabled={!!importPreview.mappings[key] && importPreview.mappings[key] !== header}>{FIELD_LABELS[key]}</option>
                                      ))}
                                    </optgroup>
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="max-h-40 overflow-auto border border-border rounded-lg">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                              <tr>{importPreview.headers.map((h, i) => <th key={i} className="text-left py-1.5 px-2 font-medium text-muted-foreground whitespace-nowrap">{h}</th>)}</tr>
                            </thead>
                            <tbody>
                              {importPreview.rows.slice(0, 5).map((row, ri) => (
                                <tr key={ri} className="border-t border-border/30">
                                  {row.map((cell, ci) => <td key={ci} className="py-1.5 px-2 text-muted-foreground truncate max-w-[120px]">{cell}</td>)}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">{importPreview.rows.length > 5 ? `Showing 5 of ${importPreview.rows.length} rows` : `${importPreview.rows.length} rows ready`}</p>
                          <Button onClick={handleConfirmImport} disabled={isImporting} data-testid="button-confirm-import">
                            {isImporting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                            {isImporting ? 'Importing...' : 'Import & Enrich'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        {/* ─── Phase: Post-Save Completion Screen ────────────────────────── */}
        {savedProjectSummary && (
          <motion.div
            key="completion"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col items-center justify-center p-8 text-center"
            data-testid="completion-screen"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mb-6">
              <CheckCheck className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Project Saved</h2>
            <p className="text-muted-foreground mb-6 max-w-sm" data-testid="completion-summary">
              {savedProjectSummary.total} companies added — {savedProjectSummary.direct} core matches, {savedProjectSummary.adjacent} AI suggested
              {savedProjectSummary.executives > 0 && (
                <span className="block text-sm mt-1">{savedProjectSummary.executives} executive{savedProjectSummary.executives !== 1 ? 's' : ''} identified</span>
              )}
            </p>
            {intent?.searchRationale && (
              <div className="bg-muted/40 rounded-xl px-5 py-4 mb-6 max-w-md text-sm text-left text-muted-foreground" data-testid="completion-rationale">
                <p className="font-medium text-foreground mb-1 text-xs uppercase tracking-wide">AI Search Rationale</p>
                <p>{intent.searchRationale}</p>
              </div>
            )}
            <div className="flex gap-3">
              <Button onClick={() => setLocation('/dashboard')} className="gap-2" data-testid="button-completion-view-project">
                <ArrowRight className="w-4 h-4" />
                View Project
              </Button>
              <Button variant="outline" onClick={() => { setSavedProjectSummary(null); setSavedProjectId(null); reset(); }} className="gap-2" data-testid="button-completion-new-search">
                <Sparkles className="w-4 h-4" />
                Refine &amp; Search Again
              </Button>
            </div>
          </motion.div>
        )}

        {/* ─── Phase: Streaming / Complete ──────────────────────────────── */}
        {!savedProjectSummary && (phase === 'streaming' || phase === 'complete') && (
          <motion.div
            key="streaming"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            {/* Top bar */}
            <div className="h-12 shrink-0 border-b border-border bg-background/95 backdrop-blur flex items-center px-4 gap-3 z-10">
              <div className="flex items-center gap-2">
                {isStreaming ? (
                  <>
                    <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                      </span>
                      Live Search
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={stopSearch}
                      className="h-6 px-2 gap-1 text-xs"
                      data-testid="button-stop-search"
                    >
                      <Square className="w-3 h-3 fill-current" />
                      Stop
                    </Button>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Search Complete
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground truncate">{input}</p>
              </div>
              <div className="flex items-center gap-2">
                {!isStreaming && companies.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {companies.filter(c => !c.rejected).length} companies found
                  </span>
                )}
                <Button variant="ghost" size="sm" onClick={reset} className="h-7 gap-1.5 text-xs" data-testid="button-reset-search">
                  <RotateCcw className="w-3 h-3" />New Search
                </Button>
              </div>
            </div>

            {/* Mobile tab switcher — only visible on small screens */}
            <div className="flex sm:hidden border-b border-border bg-background/95 backdrop-blur shrink-0">
              <button
                onClick={() => setMobileTab('results')}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${mobileTab === 'results' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'}`}
                data-testid="mobile-tab-results"
              >
                Results ({companies.filter(c => !c.rejected).length})
              </button>
              <button
                onClick={() => setMobileTab('intelligence')}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${mobileTab === 'intelligence' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'}`}
                data-testid="mobile-tab-intelligence"
              >
                Search Intelligence
              </button>
            </div>

            {/* Sticky selected-count action bar */}
            {acceptedCount > 0 && (
              <div className="shrink-0 border-b border-emerald-500/20 bg-emerald-50/80 dark:bg-emerald-950/30 px-4 py-2 flex items-center gap-3" data-testid="sticky-selected-bar">
                <CheckCheck className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{acceptedCount} selected</span>
                <div className="flex-1" />
                <Button size="sm" onClick={handleSaveProject} disabled={isSavingProject} className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700" data-testid="button-sticky-save-project">
                  {isSavingProject ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
                  Save to Project
                </Button>
              </div>
            )}

            {/* Split panel */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left: Activity Feed — hidden on mobile when results tab is active */}
              <div className={`w-72 shrink-0 border-r border-border flex-col overflow-hidden bg-muted/20 ${mobileTab === 'results' ? 'hidden sm:flex' : 'flex w-full sm:w-72'}`}>
                <div className="px-4 py-3 border-b border-border/50">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-primary" />Activity Feed
                  </p>
                </div>

                {/* Intent block */}
                {intent && (
                  <div className="px-3 py-3 border-b border-border/40 bg-primary/5">
                    <p className="text-[11px] font-semibold text-foreground mb-1.5 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-primary" />Extracted Intent
                      {intent.confidenceScore != null && (
                        <span className="ml-auto text-[10px] font-normal text-primary/80" data-testid="text-intent-confidence">
                          {/* Normalize: intent confidence may be 0-1 (float) or 0-100 (int) */}
                          {intent.confidenceScore <= 1
                            ? Math.round(intent.confidenceScore * 100)
                            : Math.round(intent.confidenceScore)}% confident
                        </span>
                      )}
                    </p>
                    <IntentBadges intent={intent} />
                    {intent.searchRationale && (
                      <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">{intent.searchRationale}</p>
                    )}
                  </div>
                )}

                <div ref={activityFeedRef} className="flex-1 overflow-y-auto p-3 space-y-1.5" data-testid="activity-feed">
                  <AnimatePresence initial={false}>
                    {activities.map(item => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-start gap-2"
                        data-testid={`activity-item-${item.type}`}
                      >
                        <div className="mt-0.5 shrink-0"><ActivityIcon type={item.type} /></div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{item.message}</p>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {isStreaming && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
                      <Loader2 className="w-3 h-3 animate-spin" />Searching...
                    </div>
                  )}
                </div>

                {/* Refinement Input — available during streaming and after */}
                <div className="p-3 border-t border-border/50" data-testid="refinement-panel">
                  <p className="text-[10px] text-muted-foreground mb-1.5 font-medium">
                    {isStreaming ? 'Queue a refinement...' : 'Refine your search'}
                  </p>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={refinementInput}
                      onChange={e => {
                        const val = e.target.value;
                        setRefinementInput(val);
                        if (refinementDebounceRef.current) clearTimeout(refinementDebounceRef.current);
                        refinementDebounceRef.current = setTimeout(() => setDebouncedRefinement(val), 300);
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') handleRefinement(); }}
                      placeholder="e.g. only show UAE companies..."
                      className="flex-1 bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/50"
                      data-testid="input-refinement"
                      disabled={isRefining}
                    />
                    <button
                      onClick={handleRefinement}
                      disabled={isRefining || !debouncedRefinement.trim()}
                      className="px-2 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                      data-testid="button-submit-refinement"
                    >
                      {isRefining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SendHorizonal className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right: Company Cards — hidden on mobile when intelligence tab is active */}
              <div className={`flex-1 flex-col overflow-hidden ${mobileTab === 'intelligence' ? 'hidden sm:flex' : 'flex'}`}>
                {/* Tabs + Save CTA */}
                <div className="px-4 py-3 border-b border-border/50 flex items-center gap-3">
                  <div className="flex gap-1">
                    <button
                      onClick={() => setActiveTab('all')}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeTab === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                      data-testid="tab-all-companies"
                    >
                      All ({companies.filter(c => !c.rejected).length})
                    </button>
                    <button
                      onClick={() => setActiveTab('direct')}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeTab === 'direct' ? 'bg-emerald-500 text-white' : 'text-muted-foreground hover:bg-muted'}`}
                      data-testid="tab-direct-companies"
                    >
                      Core ({directCount})
                    </button>
                    <button
                      onClick={() => setActiveTab('adjacent')}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeTab === 'adjacent' ? 'bg-amber-500 text-white' : 'text-muted-foreground hover:bg-muted'}`}
                      data-testid="tab-adjacent-companies"
                    >
                      AI Suggested ({adjacentCount})
                    </button>
                  </div>
                  <div className="flex-1" />
                  {acceptedCount > 0 && (
                    <Button size="sm" onClick={handleSaveProject} disabled={isSavingProject} className="h-7 text-xs gap-1.5" data-testid="button-save-project">
                      {isSavingProject ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
                      Save {acceptedCount} to Project
                    </Button>
                  )}
                  {!isStreaming && phase === 'complete' && companies.length > 0 && (
                    <Button variant="outline" size="sm" onClick={handleGoToDashboard} disabled={isSavingProject} className="h-7 text-xs gap-1.5" data-testid="button-go-dashboard">
                      <ArrowRight className="w-3 h-3" />View All in Dashboard
                    </Button>
                  )}
                </div>

                {/* Completion Summary Card */}
                {phase === 'complete' && companies.length > 0 && (
                  <div className="px-4 py-3 border-b border-border/30 bg-emerald-50/50 dark:bg-emerald-950/20" data-testid="completion-summary">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                        <CheckCheck className="w-4 h-4" />
                        <span className="text-sm font-semibold">Search Complete</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span><strong className="text-foreground">{directCount}</strong> core matches</span>
                        <span><strong className="text-foreground">{adjacentCount}</strong> AI suggested</span>
                        {intent && <span className="hidden sm:inline">{intent.targetGeographies.slice(0, 2).join(', ')}</span>}
                      </div>
                      {intent?.searchRationale && (
                        <p className="hidden md:block text-[11px] text-muted-foreground truncate flex-1">{intent.searchRationale}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Company List (compact rows grouped by tier) */}
                <div className="flex-1 overflow-y-auto" data-testid="company-cards-grid">
                  {filteredCompanies.length === 0 && !isStreaming && (
                    <div className="flex flex-col items-center justify-center h-48 text-center">
                      <Building2 className="w-10 h-10 text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">No companies found yet.</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">Try refining your search in the activity panel.</p>
                    </div>
                  )}
                  {isStreaming && filteredCompanies.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-48 text-center">
                      <div className="w-12 h-12 rounded-full border-2 border-primary/20 flex items-center justify-center mb-4">
                        <Sparkles className="w-5 h-5 text-primary animate-pulse" />
                      </div>
                      <p className="text-sm text-muted-foreground">AI is discovering companies...</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">Companies will appear here as they're classified</p>
                    </div>
                  )}
                  {(() => {
                    const directCompanies = filteredCompanies.filter(c => c.relevanceType === 'Direct');
                    const adjacentCompanies = filteredCompanies.filter(c => c.relevanceType === 'Adjacent');
                    const inferredCompanies = filteredCompanies.filter(c => c.relevanceType === 'AI Inferred');
                    const groups = [
                      { label: 'Direct', companies: directCompanies, color: 'text-emerald-600 dark:text-emerald-400' },
                      { label: 'Adjacent', companies: adjacentCompanies, color: 'text-amber-600 dark:text-amber-400' },
                      { label: 'AI Inferred', companies: inferredCompanies, color: 'text-violet-600 dark:text-violet-400' },
                    ].filter(g => g.companies.length > 0 || (activeTab !== 'all'));
                    const showGroups = activeTab === 'all' && groups.filter(g => g.companies.length > 0).length > 1;

                    return (
                      <div className="divide-y divide-border/20">
                        <AnimatePresence>
                          {showGroups ? (
                            groups.filter(g => g.companies.length > 0).map(group => (
                              <div key={group.label}>
                                <div className="px-4 py-1.5 bg-muted/30 border-b border-border/30 sticky top-0 z-10">
                                  <span className={`text-[11px] font-semibold uppercase tracking-wider ${group.color}`}>
                                    {group.label} ({group.companies.length})
                                  </span>
                                </div>
                                {group.companies.map((company, i) => (
                                  <div key={company.id} className={i % 2 === 1 ? 'bg-muted/10' : ''}>
                                    <CompanyRow
                                      company={company}
                                      onAccept={() => acceptCompany(company.id)}
                                      onReject={() => rejectCompany(company.id)}
                                    />
                                  </div>
                                ))}
                              </div>
                            ))
                          ) : (
                            filteredCompanies.map((company, i) => (
                              <div key={company.id} className={i % 2 === 1 ? 'bg-muted/10' : ''}>
                                <CompanyRow
                                  company={company}
                                  onAccept={() => acceptCompany(company.id)}
                                  onReject={() => rejectCompany(company.id)}
                                />
                              </div>
                            ))
                          )}
                        </AnimatePresence>
                        {isStreaming && pendingCompanyNames.map(name => (
                          <SkeletonCompanyRow key={`skeleton-${name}`} name={name} />
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
