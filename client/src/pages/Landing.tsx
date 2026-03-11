import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useAppStore } from '@/lib/store';
import { useSearch, useSearchHistory } from '@/lib/api';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Search, Loader2, ChevronDown, ChevronUp, History, Upload, Table2, Plus, Trash2, FileSpreadsheet, X, Sun, Moon } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { COUNTRIES } from '@/lib/countries';

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
  const inputRef = useRef<HTMLInputElement>(null);

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

  const baseOptions = options || [];
  const allOptions = fetchOptions ? dynamicOptions : baseOptions;
  const filtered = filter
    ? allOptions.filter(o => o.toLowerCase().includes(filter.toLowerCase()))
    : allOptions;
  const shown = filtered.slice(0, 30);

  return (
    <div ref={ref} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={open ? filter : value}
        onFocus={() => { setOpen(true); setFilter(value); }}
        onChange={e => { setFilter(e.target.value); onChange(e.target.value); if (!open) setOpen(true); }}
        className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary/50 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
        placeholder={placeholder}
        data-testid={testId}
        autoComplete="off"
      />
      {open && shown.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-popover border border-border rounded shadow-lg max-h-48 overflow-y-auto">
          {shown.map(opt => (
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


const ALL_FIELD_PATTERNS: Record<string, string[]> = {
  name: [
    'name', 'full name', 'fullname', 'executive', 'executive name', 'person', 'candidate',
    'contact', 'contact name', 'individual', 'first name', 'firstname', 'last name', 'lastname',
    'employee name', 'staff name', 'member', 'personnel', 'talent', 'prospect',
    'candidate name', 'applicant', 'interviewee', 'nominee', 'person name'
  ],
  company: [
    'company', 'company name', 'companyname', 'organization', 'organisation', 'employer',
    'firm', 'business', 'enterprise', 'corporation', 'corp', 'entity', 'group',
    'current company', 'current employer', 'current organization', 'current organisation',
    'employer name', 'org', 'org name', 'workplace', 'place of work', 'holding',
    'conglomerate', 'parent company', 'subsidiary', 'brand'
  ],
  title: [
    'title', 'job title', 'jobtitle', 'position', 'role', 'designation', 'function',
    'job role', 'current title', 'current position', 'current role', 'job function',
    'rank', 'grade', 'level', 'seniority', 'post', 'appointment', 'office',
    'position title', 'role title', 'job designation', 'professional title'
  ],
  country: [
    'country', 'location', 'hq country', 'headquarters', 'hq', 'nation', 'region',
    'geography', 'geo', 'territory', 'market', 'domicile', 'base', 'based in',
    'country of origin', 'home country', 'operating country', 'jurisdiction',
    'country/region', 'loc', 'city/country', 'headquartered'
  ],
  city: [
    'city', 'hq city', 'headquarters city', 'town', 'municipality', 'metro',
    'metropolitan', 'urban area', 'city/town', 'office city', 'base city'
  ],
  sector: [
    'sector', 'industry', 'vertical', 'segment', 'business type', 'business sector',
    'industry sector', 'field', 'domain', 'category', 'classification', 'niche',
    'market segment', 'business area', 'activity', 'primary activity'
  ],
  revenue: [
    'revenue', 'annual revenue', 'total revenue', 'turnover', 'sales', 'annual sales',
    'gross revenue', 'net revenue', 'revenue usd', 'revenue ($)', 'revenue (usd)',
    'annual turnover', 'yearly revenue', 'company revenue', 'total sales',
    'fiscal revenue', 'top line', 'income'
  ],
  employees: [
    'employees', 'employee count', 'headcount', 'staff count', 'workforce',
    'number of employees', 'team size', 'staff size', 'total employees',
    'employee number', 'no of employees', 'num employees', 'people count',
    'fte', 'full time employees', 'personnel count', 'size'
  ],
  email: [
    'email', 'e-mail', 'email address', 'e-mail address', 'mail', 'email id',
    'contact email', 'work email', 'business email', 'corporate email',
    'personal email', 'primary email', 'emailaddress'
  ],
  phone: [
    'phone', 'telephone', 'tel', 'mobile', 'cell', 'cellphone', 'cell phone',
    'phone number', 'contact number', 'mobile number', 'work phone', 'direct line',
    'landline', 'office phone', 'business phone', 'primary phone', 'phonenumber',
    'mob', 'contact phone'
  ],
  linkedin: [
    'linkedin', 'linkedin url', 'linkedin profile', 'profile url', 'linkedin link',
    'li url', 'li profile', 'linked in', 'social profile', 'linkedin page',
    'professional profile', 'linkedin address'
  ],
  notes: [
    'notes', 'comments', 'remarks', 'description', 'additional info', 'memo',
    'observation', 'info', 'information', 'additional notes', 'general notes',
    'comment', 'remark', 'note', 'detail', 'details', 'other', 'misc',
    'miscellaneous', 'summary', 'overview'
  ],
  careerSummary: [
    'career summary', 'bio', 'biography', 'background', 'career', 'experience',
    'work history', 'professional summary', 'profile summary', 'career history',
    'work experience', 'employment history', 'professional background',
    'career background', 'career profile', 'resume summary', 'cv summary'
  ],
  remunerationNotes: [
    'remuneration', 'salary', 'compensation', 'pay', 'package', 'total compensation',
    'comp', 'tc', 'total comp', 'salary range', 'pay range', 'earnings',
    'remuneration notes', 'comp notes', 'salary notes', 'base salary',
    'base pay', 'annual salary', 'ctc', 'cost to company', 'wage', 'income'
  ],
  availability: [
    'availability', 'available', 'status', 'availability status', 'open to',
    'notice period', 'notice', 'start date', 'available from', 'can start',
    'ready', 'timeline', 'availability date', 'current status', 'employment status'
  ]
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

  if (Object.keys(mappings).length < normalizedHeaders.length) {
    normalizedHeaders.forEach((header, index) => {
      if (usedIndices.has(index)) return;
      for (const [field, patterns] of Object.entries(ALL_FIELD_PATTERNS)) {
        if (mappings[field]) continue;
        const match = patterns.some(p => header.includes(p) || p.includes(header));
        if (match) {
          mappings[field] = headers[index];
          usedIndices.add(index);
          break;
        }
      }
    });
  }

  return mappings;
}

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

export default function Landing() {
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { setProject, loadFromAPI } = useAppStore();
  const searchMutation = useSearch();
  const { data: searchHistory } = useSearchHistory();

  const [mode, setMode] = useState<LandingMode>('search');
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

  const [manualRows, setManualRows] = useState<ManualRow[]>(() => 
    Array.from({ length: 5 }, createEmptyRow)
  );

  const handleLoadHistory = async (item: any) => {
    try {
      loadFromAPI([]);
      toast.loading('Loading previous search results...', { id: 'load-history' });
      const response = await fetch(`/api/search-history/${item.id}/load`);
      if (!response.ok) throw new Error('Failed to load history');
      const data = await response.json();
      toast.dismiss('load-history');

      if (!data.results || data.results.length === 0) {
        toast.error('No results found for this search.');
        return;
      }

      setProject({
        id: String(item.id),
        name: item.query,
        search_string: item.query,
        created_at: new Date(item.createdAt)
      });
      loadFromAPI(data.results, data.satelliteHierarchies || {});
      toast.success(`Loaded ${data.results.length} companies from history`);
      setLocation('/dashboard');
    } catch (error) {
      toast.dismiss('load-history');
      toast.error('Failed to load search history');
      console.error(error);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectHistoryItem = (query: string) => {
    setInput(query);
    setShowHistory(false);
    inputRef.current?.focus();
  };

  const filteredHistory = searchHistory?.filter((item: any) => 
    item.query.toLowerCase().includes(input.toLowerCase())
  ).sort((a: any, b: any) => a.query.localeCompare(b.query)) || [];

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) {
      toast.error('Please enter a search query');
      return;
    }

    setShowHistory(false);
    loadFromAPI([]);
    
    try {
      toast.loading('Searching...', { id: 'search' });
      const result = await searchMutation.mutateAsync({ query: input });
      toast.dismiss('search');
      
      if (!result.results || result.results.length === 0) {
        toast.error('No results found. Try a different search query.');
        return;
      }
      
      setProject({
        id: String(result.searchQueryId),
        name: input,
        search_string: input,
        created_at: new Date()
      });

      loadFromAPI(result.results);
      toast.success(`Found ${result.results.length} companies matching your criteria`);
      setLocation('/dashboard');
    } catch (error: any) {
      toast.dismiss('search');
      const message = error?.message || 'Search failed. Please try again.';
      toast.error(message);
      console.error('Search error:', error);
    }
  };

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

        if (jsonData.length < 2) {
          toast.error('File must have at least a header row and one data row');
          return;
        }

        const headers = (jsonData[0] as any[]).map(h => String(h || '').trim()).filter(Boolean);
        const rows = (jsonData as any[]).slice(1)
          .map(row => headers.map((_, i) => String((row as any[])[i] ?? '').trim()))
          .filter(row => row.some(cell => cell.length > 0));

        if (rows.length === 0) {
          toast.error('No data rows found in the file');
          return;
        }

        const mappings = detectColumnMappings(headers);
        const baseName = file.name.replace(/\.(xlsx|xls|csv)$/i, '');
        setProjectName(baseName);
        setImportPreview({ headers, rows, mappings, fileName: file.name });
        toast.success(`Loaded ${rows.length} rows from "${file.name}"`);
      } catch (err) {
        console.error('File parse error:', err);
        toast.error('Failed to read the file. Please check the format.');
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handlePastePreview = useCallback(() => {
    if (!pasteText.trim()) {
      toast.error('Please paste some data');
      return;
    }
    const lines = pasteText.trim().split('\n');
    if (lines.length < 2) {
      toast.error('Need at least a header row and one data row');
      return;
    }
    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map(line =>
      line.split(delimiter).map(cell => cell.trim().replace(/^"|"$/g, ''))
    ).filter(row => row.some(cell => cell.length > 0));

    if (rows.length === 0) {
      toast.error('No data rows found');
      return;
    }

    const mappings = detectColumnMappings(headers);
    setImportPreview({ headers, rows, mappings });
    toast.success(`Parsed ${rows.length} rows`);
  }, [pasteText]);

  const submitImport = useCallback(async (records: Record<string, string>[], mappings: Record<string, string>) => {
    setIsImporting(true);
    try {
      loadFromAPI([]);
      toast.loading('Creating project and importing data...', { id: 'import' });

      const response = await fetch('/api/import-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: projectName || `Import ${new Date().toLocaleDateString()}`,
          records,
          mappings,
        })
      });

      toast.dismiss('import');
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Import failed' }));
        throw new Error(err.error || 'Import failed');
      }

      const result = await response.json();

      setProject({
        id: String(result.searchQueryId),
        name: result.projectName,
        search_string: result.projectName,
        created_at: new Date()
      });

      loadFromAPI(result.results || []);
      toast.success(`Imported ${result.recordsImported} records across ${result.companiesCreated} companies. Enrichment is running in the background.`);
      setLocation('/dashboard');
    } catch (error: any) {
      toast.dismiss('import');
      toast.error(error.message || 'Import failed');
      console.error('Import error:', error);
    } finally {
      setIsImporting(false);
    }
  }, [projectName, loadFromAPI, setProject, setLocation]);

  const handleConfirmImport = useCallback(async () => {
    if (!importPreview) return;
    const { headers, rows, mappings } = importPreview;

    const records = rows.map(row => {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = row[index] || '';
      });
      return record;
    }).filter(r => {
      const nameField = mappings.name;
      const companyField = mappings.company;
      const titleField = mappings.title;
      return (nameField && r[nameField]?.trim()) || (companyField && r[companyField]?.trim()) || (titleField && r[titleField]?.trim());
    });

    if (records.length === 0) {
      toast.error('No valid records found (need at least a name, company, or title)');
      return;
    }

    await submitImport(records, mappings);
  }, [importPreview, submitImport]);

  const handleManualSubmit = useCallback(async () => {
    const validRows = manualRows.filter(r => r.company.trim() || r.name.trim() || r.title.trim());
    if (validRows.length === 0) {
      toast.error('Please fill in at least one row with a company, name, or title');
      return;
    }

    const headers = ['Country', 'Company', 'Name', 'Title'];
    const mappings: Record<string, string> = {
      country: 'Country',
      company: 'Company',
      name: 'Name',
      title: 'Title',
    };
    const records = validRows.map(r => ({
      'Country': r.country,
      'Company': r.company,
      'Name': r.name,
      'Title': r.title,
    }));

    await submitImport(records, mappings);
  }, [manualRows, submitImport]);

  const fetchCompanyOptions = useCallback(async (q: string): Promise<string[]> => {
    try {
      const res = await fetch(`/api/companies/search?name=${encodeURIComponent(q)}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((c: any) => c.name).filter(Boolean);
    } catch { return []; }
  }, []);

  const updateManualRow = (id: string, field: keyof ManualRow, value: string) => {
    setManualRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const addManualRow = () => {
    setManualRows(prev => [...prev, createEmptyRow()]);
  };

  const removeManualRow = (id: string) => {
    setManualRows(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);
  };

  const FIELD_LABELS: Record<string, string> = {
    name: 'Name', company: 'Company', title: 'Title', country: 'Country',
    city: 'City', sector: 'Sector', revenue: 'Revenue', employees: 'Employees',
    email: 'Email', phone: 'Phone', linkedin: 'LinkedIn', notes: 'Notes',
    careerSummary: 'Career Summary', remunerationNotes: 'Remuneration', availability: 'Status', level: 'Level',
  };

  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-background relative overflow-hidden">
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 z-20 w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        data-testid="landing-theme-toggle"
      >
        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>
      <div className="absolute inset-0 z-0 opacity-5 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary via-background to-background" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="z-10 w-full max-w-3xl px-6 text-center"
      >
        <h1 className="text-4xl md:text-5xl font-serif font-bold tracking-tight text-foreground mb-3">
          Global Talent Map
        </h1>
        <p className="text-base text-muted-foreground mb-6 max-w-lg mx-auto">
          AI-driven market intelligence for executive search.
        </p>

        <div className="flex items-center justify-center gap-2 mb-6">
          <button
            onClick={() => { setMode('search'); setImportPreview(null); }}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
              mode === 'search' 
                ? 'bg-primary text-primary-foreground shadow-md' 
                : 'bg-muted/60 text-muted-foreground hover:bg-muted'
            }`}
            data-testid="tab-search"
          >
            <Search className="h-3.5 w-3.5 inline mr-1.5" />
            AI Search
          </button>
          <button
            onClick={() => setMode('import')}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
              mode === 'import' 
                ? 'bg-primary text-primary-foreground shadow-md' 
                : 'bg-muted/60 text-muted-foreground hover:bg-muted'
            }`}
            data-testid="tab-import"
          >
            <Upload className="h-3.5 w-3.5 inline mr-1.5" />
            Import Data
          </button>
        </div>

        {mode === 'search' && (
          <form onSubmit={handleSearch} className="relative max-w-3xl mx-auto">
            <div className="flex flex-col gap-4">
              <div className="relative" ref={historyRef}>
                <div className={`bg-gradient-to-b from-background to-background/95 backdrop-blur-xl shadow-2xl shadow-primary/5 border border-border/80 overflow-hidden transition-all duration-300 ring-1 ring-black/5 ${isPromptExpanded ? 'rounded-2xl' : 'rounded-3xl'}`}>
                  <div className="flex items-center px-5 py-3 border-b border-border/40 bg-muted/20">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/20">
                      <Search className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-xs font-medium text-primary">AI Search</span>
                    </div>
                    <div className="flex-1" />
                    <div className="flex items-center gap-1">
                      <button 
                        type="button"
                        onClick={() => setIsPromptExpanded(!isPromptExpanded)}
                        className="p-1.5 hover:bg-muted rounded-md transition-colors flex items-center gap-1"
                        title={isPromptExpanded ? "Collapse prompt" : "Expand for detailed prompt"}
                        data-testid="button-toggle-prompt-expand"
                      >
                        {isPromptExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        <span className="text-xs text-muted-foreground">{isPromptExpanded ? 'Collapse' : 'Expand'}</span>
                      </button>
                      <button 
                        type="button"
                        onClick={() => setShowHistory(!showHistory)}
                        className="p-1.5 hover:bg-muted rounded-md transition-colors"
                        title="Search history"
                        data-testid="button-toggle-history"
                      >
                        <History className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                  <div className="px-5 py-4">
                    <Textarea 
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onFocus={() => {
                        if (!isPromptExpanded && input.length < 50) setShowHistory(true);
                      }}
                      placeholder={isPromptExpanded 
                        ? `Enter a detailed search prompt...\n\nExample:\nTask: List exactly 10 operating companies involved in renewable power transmission...\n\nInclusion criteria:\n- Entity must be a company, not a project or SPV\n- Must have operational involvement in target sector\n\nExclusion criteria:\n- Exclude pure contractors with no operating assets\n\nData rules:\n- Revenue must only be included if explicitly stated\n- If data is unclear, return "Unknown"`
                        : "Describe what you're looking for... (e.g., 'Top 5 banks in UAE' or 'FMCG distributors in Saudi Arabia')"
                      }
                      className={`border-0 shadow-none focus-visible:ring-0 text-base leading-relaxed bg-transparent resize-none transition-all duration-300 placeholder:text-muted-foreground/50 ${
                        isPromptExpanded ? 'min-h-[280px] max-h-[500px]' : 'min-h-[72px] max-h-[120px]'
                      }`}
                      disabled={searchMutation.isPending}
                      data-testid="input-search-query"
                    />
                  </div>
                </div>
                
                {showHistory && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-2xl max-h-72 overflow-hidden z-50">
                    <div className="p-3 border-b border-border bg-muted/30">
                      <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <History className="h-4 w-4" /> {input ? 'Matching Searches' : 'Recent Searches'}
                      </span>
                    </div>
                    {filteredHistory.length > 0 ? (
                      <div className="overflow-y-auto max-h-56">
                        {filteredHistory.slice(0, 10).map((item: any, index: number) => (
                          <div
                            key={`${item.id}-${index}`}
                            className="w-full text-left px-4 py-3 hover:bg-primary/5 transition-colors border-b border-border/30 last:border-0 group cursor-pointer"
                            data-testid={`button-history-item-${index}`}
                            onClick={() => selectHistoryItem(item.query)}
                          >
                            <div className="flex items-center gap-3">
                              <Search className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate group-hover:text-primary transition-colors">{item.query}</div>
                                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                                  <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                                  {(item.companyCount || item.resultCount) > 0 && (
                                    <span className="text-primary/70">{item.companyCount || item.resultCount} companies</span>
                                  )}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleLoadHistory(item); }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity bg-transparent hover:bg-primary/10 hover:text-primary px-3 py-1.5 rounded-md text-sm font-medium"
                              >
                                Load
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 text-center text-muted-foreground">
                        <p className="text-sm">{input ? 'No matching searches' : 'No previous searches yet'}</p>
                        <p className="text-xs mt-1">{input ? 'Try a different search term' : 'Your search history will appear here'}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <div className="flex items-center justify-center gap-3">
                <Button 
                  type="submit" 
                  size="lg" 
                  disabled={searchMutation.isPending}
                  className="h-12 rounded-full px-8 text-sm font-semibold shadow-xl shadow-primary/20 bg-gradient-to-r from-primary to-primary/90 hover:shadow-primary/30 hover:scale-[1.02] transition-all duration-200"
                  data-testid="button-submit-search"
                >
                  {searchMutation.isPending ? (
                    <Loader2 className="animate-spin h-5 w-5 mr-2" />
                  ) : (
                    <Search className="h-5 w-5 mr-2" />
                  )}
                  {searchMutation.isPending ? 'Searching...' : 'Search'}
                </Button>
              </div>
            </div>
          </form>
        )}

        {mode === 'import' && (
          <div className="max-w-3xl mx-auto text-left">
            <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
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
                  <button
                    onClick={() => { setImportTab('file'); setImportPreview(null); }}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${importTab === 'file' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
                    data-testid="import-tab-file"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 inline mr-1" />
                    File
                  </button>
                  <button
                    onClick={() => { setImportTab('paste'); setImportPreview(null); }}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${importTab === 'paste' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
                    data-testid="import-tab-paste"
                  >
                    <Table2 className="h-3.5 w-3.5 inline mr-1" />
                    Paste
                  </button>
                  <button
                    onClick={() => { setImportTab('manual'); setImportPreview(null); }}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${importTab === 'manual' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
                    data-testid="import-tab-manual"
                  >
                    <Plus className="h-3.5 w-3.5 inline mr-1" />
                    Manual Entry
                  </button>
                </div>
              </div>

              <div className="p-5">
                {importTab === 'file' && !importPreview && (
                  <div
                    className="border-2 border-dashed border-border/60 rounded-xl p-10 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="dropzone-file-upload"
                  >
                    <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                    <p className="text-sm font-medium text-foreground mb-1">Upload Excel or CSV file</p>
                    <p className="text-xs text-muted-foreground">Supports .xlsx, .xls, and .csv formats</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileUpload}
                      className="hidden"
                      data-testid="input-file-upload"
                    />
                  </div>
                )}

                {importTab === 'paste' && !importPreview && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">Copy rows from Excel/Sheets and paste below. Include the header row.</p>
                    <Textarea
                      value={pasteText}
                      onChange={e => setPasteText(e.target.value)}
                      placeholder="Paste your data here (tab or comma separated)..."
                      className="min-h-[160px] text-sm font-mono"
                      data-testid="input-paste-data"
                    />
                    <Button onClick={handlePastePreview} className="w-full" data-testid="button-preview-paste">
                      Preview Data
                    </Button>
                  </div>
                )}

                {importTab === 'manual' && (
                  <div className="space-y-3">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2 px-2 font-medium text-muted-foreground w-8">#</th>
                            <th className="text-left py-2 px-2 font-medium text-muted-foreground">Country</th>
                            <th className="text-left py-2 px-2 font-medium text-muted-foreground">Company</th>
                            <th className="text-left py-2 px-2 font-medium text-muted-foreground">Name</th>
                            <th className="text-left py-2 px-2 font-medium text-muted-foreground">Title</th>
                            <th className="w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {manualRows.map((row, idx) => (
                            <tr key={row.id} className="border-b border-border/30 hover:bg-muted/20">
                              <td className="py-1 px-2 text-muted-foreground">{idx + 1}</td>
                              <td className="py-1 px-1">
                                <ComboboxCell
                                  value={row.country}
                                  onChange={val => updateManualRow(row.id, 'country', val)}
                                  options={COUNTRIES}
                                  placeholder="Country"
                                  testId={`manual-input-country-${idx}`}
                                />
                              </td>
                              <td className="py-1 px-1">
                                <ComboboxCell
                                  value={row.company}
                                  onChange={val => updateManualRow(row.id, 'company', val)}
                                  placeholder="Company"
                                  testId={`manual-input-company-${idx}`}
                                  fetchOptions={fetchCompanyOptions}
                                />
                              </td>
                              {(['name', 'title'] as const).map(field => (
                                <td key={field} className="py-1 px-1">
                                  <input
                                    type="text"
                                    value={row[field]}
                                    onChange={e => updateManualRow(row.id, field, e.target.value)}
                                    className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary/50 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
                                    placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                                    data-testid={`manual-input-${field}-${idx}`}
                                  />
                                </td>
                              ))}
                              <td className="py-1 px-1">
                                <button
                                  onClick={() => removeManualRow(row.id)}
                                  className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                                  title="Remove row"
                                  data-testid={`button-remove-row-${idx}`}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between">
                      <Button variant="ghost" size="sm" onClick={addManualRow} data-testid="button-add-row">
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Row
                      </Button>
                      <Button 
                        onClick={handleManualSubmit} 
                        disabled={isImporting}
                        data-testid="button-submit-manual"
                      >
                        {isImporting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                        {isImporting ? 'Importing...' : 'Import & Enrich'}
                      </Button>
                    </div>
                  </div>
                )}

                {importPreview && (importTab === 'file' || importTab === 'paste') && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <span className="font-medium">{importPreview.rows.length} rows</span>
                        <span className="text-muted-foreground ml-2">
                          {importPreview.fileName ? `from ${importPreview.fileName}` : 'from pasted data'}
                        </span>
                      </div>
                      <button
                        onClick={() => setImportPreview(null)}
                        className="p-1 text-muted-foreground hover:text-foreground"
                        data-testid="button-clear-preview"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-2">Column Mappings</h4>
                      <p className="text-[11px] text-muted-foreground mb-2">
                        Auto-detected mappings shown below. Use dropdowns to adjust.
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {importPreview.headers.map((header, idx) => {
                          const currentMapping = Object.entries(importPreview.mappings).find(([, h]) => h === header)?.[0] || '';
                          return (
                            <div key={idx} className="flex items-center gap-2 bg-muted/30 rounded-lg px-2.5 py-1.5">
                              <span className="text-xs font-medium truncate flex-1" title={header}>{header}</span>
                              <select
                                className="text-xs bg-background border border-border rounded px-1.5 py-1 w-28"
                                value={currentMapping}
                                onChange={(e) => {
                                  const newMappings = { ...importPreview.mappings };
                                  Object.keys(newMappings).forEach(k => {
                                    if (newMappings[k] === header) delete newMappings[k];
                                  });
                                  if (e.target.value) newMappings[e.target.value] = header;
                                  setImportPreview({ ...importPreview, mappings: newMappings });
                                }}
                                data-testid={`mapping-select-${idx}`}
                              >
                                <option value="">-- skip --</option>
                                <optgroup label="Executive Fields">
                                  {['name', 'title', 'email', 'phone', 'linkedin', 'notes', 'careerSummary', 'remunerationNotes', 'availability'].map(key => (
                                    <option key={key} value={key} disabled={!!importPreview.mappings[key] && importPreview.mappings[key] !== header}>
                                      {FIELD_LABELS[key]}
                                    </option>
                                  ))}
                                </optgroup>
                                <optgroup label="Company Fields">
                                  {['company', 'country', 'city', 'sector', 'revenue', 'employees'].map(key => (
                                    <option key={key} value={key} disabled={!!importPreview.mappings[key] && importPreview.mappings[key] !== header}>
                                      {FIELD_LABELS[key]}
                                    </option>
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
                          <tr>
                            {importPreview.headers.map((h, i) => (
                              <th key={i} className="text-left py-1.5 px-2 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.rows.slice(0, 5).map((row, ri) => (
                            <tr key={ri} className="border-t border-border/30">
                              {row.map((cell, ci) => (
                                <td key={ci} className="py-1 px-2 truncate max-w-[150px]" title={cell}>{cell || '-'}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {importPreview.rows.length > 5 && (
                        <div className="text-center py-1.5 text-xs text-muted-foreground bg-muted/30">
                          ... and {importPreview.rows.length - 5} more rows
                        </div>
                      )}
                    </div>

                    <Button
                      onClick={handleConfirmImport}
                      disabled={isImporting}
                      className="w-full"
                      data-testid="button-confirm-import"
                    >
                      {isImporting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                      {isImporting ? 'Importing...' : `Import ${importPreview.rows.length} Records & Enrich`}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </motion.div>
      
      <div className="absolute bottom-6 text-xs text-muted-foreground opacity-50">
        &copy; 2026 Global Talent Map
      </div>
    </div>
  );
}
