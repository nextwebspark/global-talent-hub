import { useState, useRef, useEffect, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Upload, ClipboardPaste, Plus, Loader2, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { COUNTRIES, getCountryCentroid, normalizeCountryName } from '@/lib/countries';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: 'import' | 'add';
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
  ],
  level: [
    'level', 'seniority', 'seniority level', 'executive level', 'management level',
    'grade', 'band', 'tier', 'rank', 'position level'
  ]
};

function wordSimilarity(a: string, b: string): number {
  const wordsA = a.split(/\s+/).filter(Boolean);
  const wordsB = b.split(/\s+/).filter(Boolean);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  let matches = 0;
  for (const wa of wordsA) {
    for (const wb of wordsB) {
      if (wa === wb || (wa.length > 3 && wb.length > 3 && (wa.startsWith(wb.substring(0, 4)) || wb.startsWith(wa.substring(0, 4))))) {
        matches++;
        break;
      }
    }
  }
  return matches / Math.max(wordsA.length, wordsB.length);
}

function detectContentType(values: string[]): string | null {
  const nonEmpty = values.filter(v => v && v.trim());
  if (nonEmpty.length === 0) return null;
  const sampleSize = Math.min(nonEmpty.length, 10);
  const sample = nonEmpty.slice(0, sampleSize);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (sample.filter(v => emailRegex.test(v.trim())).length >= sampleSize * 0.5) return 'email';

  const phoneRegex = /^[\+]?[\d\s\-\(\)\.]{7,20}$/;
  if (sample.filter(v => phoneRegex.test(v.trim())).length >= sampleSize * 0.5) return 'phone';

  const linkedinRegex = /linkedin\.com/i;
  if (sample.filter(v => linkedinRegex.test(v)).length >= sampleSize * 0.3) return 'linkedin';

  return null;
}

function detectColumnMappings(headers: string[], rows?: string[][]): Record<string, string> {
  const mappings: Record<string, string> = {};
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim().replace(/[_\-\.\/#]/g, ' ').replace(/\s+/g, ' '));
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
      const match = patterns.some(p => header.includes(p) || p.includes(header));
      if (match) {
        mappings[field] = headers[index];
        usedIndices.add(index);
        break;
      }
    }
  });

  normalizedHeaders.forEach((header, index) => {
    if (usedIndices.has(index)) return;
    let bestField = '';
    let bestScore = 0;
    for (const [field, patterns] of Object.entries(ALL_FIELD_PATTERNS)) {
      if (mappings[field]) continue;
      for (const p of patterns) {
        const score = wordSimilarity(header, p);
        if (score > bestScore && score >= 0.5) {
          bestScore = score;
          bestField = field;
        }
      }
    }
    if (bestField) {
      mappings[bestField] = headers[index];
      usedIndices.add(index);
    }
  });

  if (rows && rows.length > 0) {
    normalizedHeaders.forEach((_, index) => {
      if (usedIndices.has(index)) return;
      const colValues = rows.map(row => row[index] || '');
      const detectedType = detectContentType(colValues);
      if (detectedType && !mappings[detectedType]) {
        mappings[detectedType] = headers[index];
        usedIndices.add(index);
      }
    });
  }

  return mappings;
}

export default function ImportModal({ isOpen, onClose, mode: initialMode = 'import' }: ImportModalProps) {
  const { currentProject, addCompany, loadFromAPI } = useAppStore();
  const [activeTab, setActiveTab] = useState<'paste' | 'file' | 'add'>(initialMode === 'add' ? 'add' : 'paste');
  const [importText, setImportText] = useState('');
  const [importPreview, setImportPreview] = useState<{headers: string[], rows: string[][], mappings: Record<string, string>} | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const countryDropdownRef = useRef<HTMLDivElement>(null);
  const [newCompany, setNewCompany] = useState({ name: '', hq_country: '', revenue_usd: '', employees: '' });

  useEffect(() => {
    if (!isOpen) {
      setImportText('');
      setImportPreview(null);
      setActiveTab(initialMode === 'add' ? 'add' : 'paste');
      setNewCompany({ name: '', hq_country: '', revenue_usd: '', employees: '' });
    }
  }, [isOpen, initialMode]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(event.target as Node)) {
        setCountryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const countryOptions = useMemo(() => COUNTRIES, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

        if (jsonData.length < 2) {
          toast.error('File needs at least a header row and one data row');
          return;
        }

        const headers = (jsonData[0] as string[]).map(h => String(h || '').trim());
        const rows = jsonData.slice(1).map(row =>
          headers.map((_, i) => String((row as any[])[i] || '').trim())
        ).filter(row => row.some(cell => cell));

        const mappings = detectColumnMappings(headers, rows);
        setImportPreview({ headers, rows, mappings });
        setActiveTab('file');
      } catch {
        toast.error('Failed to read file');
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePasteData = () => {
    if (!importText.trim()) {
      toast.error('Please paste some data');
      return;
    }

    const lines = importText.trim().split('\n');
    if (lines.length < 2) {
      toast.error('Need at least a header row and one data row');
      return;
    }

    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map(line =>
      line.split(delimiter).map(cell => cell.trim().replace(/^"|"$/g, ''))
    );

    const mappings = detectColumnMappings(headers, rows);
    setImportPreview({ headers, rows, mappings });
  };

  const handleConfirmImport = async () => {
    if (!importPreview || !currentProject?.id) return;

    setIsImporting(true);
    try {
      const { headers, rows, mappings } = importPreview;

      const records = rows.map(row => {
        const record: Record<string, string> = {};
        headers.forEach((header, index) => { record[header] = row[index] || ''; });
        return record;
      }).filter(r => {
        const nameField = mappings.name;
        const companyField = mappings.company;
        const titleField = mappings.title;
        return (nameField && r[nameField]?.trim()) || (companyField && r[companyField]?.trim()) || (titleField && r[titleField]?.trim());
      });

      if (records.length === 0) {
        toast.error('No valid records found (need at least a name, company, or title)');
        setIsImporting(false);
        return;
      }

      const response = await fetch('/api/executives/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchQueryId: parseInt(currentProject.id), mappings, records })
      });

      if (!response.ok) throw new Error('Import failed');
      const result = await response.json();

      if (loadFromAPI && currentProject.id) {
        const res = await fetch(`/api/search-results/${currentProject.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.companies) loadFromAPI(data.companies);
        }
      }

      const parts = [`Imported ${result.imported} executives`];
      if (result.skipped > 0) parts.push(`${result.skipped} duplicates skipped`);
      toast.success(parts.join(', '));
      onClose();
    } catch {
      toast.error('Import failed');
    } finally {
      setIsImporting(false);
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
      const normalizedCountry = normalizeCountryName(newCompany.hq_country);
      const centroid = getCountryCentroid(normalizedCountry);
      const lat = centroid ? centroid.lat : 0;
      const lng = centroid ? centroid.lng : 0;

      const response = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCompany.name,
          country: normalizedCountry,
          revenue: newCompany.revenue_usd ? String(parseFloat(newCompany.revenue_usd)) : null,
          employees: parseInt(newCompany.employees) || 0,
          latitude: String(lat),
          longitude: String(lng),
          confidence: 5,
          searchQueryId: parseInt(currentProject.id)
        })
      });

      if (!response.ok) throw new Error('Failed to add company');
      const created = await response.json();

      addCompany({
        id: String(created.id),
        name: created.name,
        industry: created.sector || '',
        hq_country: normalizeCountryName(created.country || normalizedCountry),
        lat: parseFloat(created.latitude) || 0,
        lng: parseFloat(created.longitude) || 0,
        revenue_usd: parseFloat(created.revenue) || 0,
        employees: created.employees || 0,
        confidence: created.confidence || 5,
        color: created.color || '#1e3a8a'
      });

      setNewCompany({ name: '', hq_country: '', revenue_usd: '', employees: '' });
      toast.success(`Added ${created.name}`);
      onClose();
    } catch {
      toast.error('Failed to add company');
    } finally {
      setIsAdding(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-popover border border-border rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setActiveTab('paste'); setImportPreview(null); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'paste' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
              data-testid="import-tab-paste"
            >
              <ClipboardPaste className="h-3.5 w-3.5 inline mr-1" />
              Paste
            </button>
            <button
              onClick={() => { fileInputRef.current?.click(); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'file' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
              data-testid="import-tab-file"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 inline mr-1" />
              File
            </button>
            <button
              onClick={() => { setActiveTab('add'); setImportPreview(null); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'add' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
              data-testid="import-tab-add"
            >
              <Plus className="h-3.5 w-3.5 inline mr-1" />
              Add Company
            </button>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileUpload}
          className="hidden"
          data-testid="input-file-upload"
        />

        <div className="p-4 flex-1 overflow-auto">
          {activeTab === 'add' && (
            <form onSubmit={handleAddCompany} className="space-y-3">
              <p className="text-sm text-muted-foreground">Add a new company manually to the current project.</p>
              <Input
                placeholder="Company name *"
                value={newCompany.name}
                onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })}
                className="h-9 text-sm"
                autoFocus
                data-testid="input-new-company-name"
              />
              <div>
                <div className="relative" ref={countryDropdownRef}>
                  <Input
                    placeholder="Country"
                    value={newCompany.hq_country}
                    onChange={(e) => { setNewCompany({ ...newCompany, hq_country: e.target.value }); setCountryDropdownOpen(true); }}
                    onFocus={() => setCountryDropdownOpen(true)}
                    className="h-9 text-sm"
                    data-testid="input-country-dropdown"
                  />
                  {countryDropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 border border-border rounded-md shadow-lg max-h-40 overflow-auto" style={{ backgroundColor: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}>
                      {countryOptions.filter(c =>
                        c.toLowerCase().includes(newCompany.hq_country.toLowerCase())
                      ).slice(0, 10).map(country => (
                        <button
                          key={country}
                          type="button"
                          onClick={() => { setNewCompany({ ...newCompany, hq_country: country }); setCountryDropdownOpen(false); }}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                        >
                          {country}
                        </button>
                      ))}
                      {countryOptions.filter(c => c.toLowerCase().includes(newCompany.hq_country.toLowerCase())).length === 0 && (
                        <div className="px-3 py-1.5 text-sm text-muted-foreground">No countries found</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Revenue (USD)"
                  type="number"
                  value={newCompany.revenue_usd}
                  onChange={(e) => setNewCompany({ ...newCompany, revenue_usd: e.target.value })}
                  className="h-9 text-sm"
                />
                <Input
                  placeholder="Employees"
                  type="number"
                  value={newCompany.employees}
                  onChange={(e) => setNewCompany({ ...newCompany, employees: e.target.value })}
                  className="h-9 text-sm"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isAdding} data-testid="button-submit-add-company">
                {isAdding ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Adding...</> : 'Add Company'}
              </Button>
            </form>
          )}

          {activeTab === 'paste' && !importPreview && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Copy rows from Excel and paste below. Include the header row.
                The system will auto-detect columns like Name, Company, Title, LinkedIn, Notes, etc.
              </p>
              <textarea
                className="w-full h-48 p-3 text-sm border border-border rounded-lg font-mono bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Paste your Excel data here..."
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                autoFocus
                data-testid="textarea-import"
              />
              <Button onClick={handlePasteData} className="w-full" data-testid="button-preview-import">
                <Upload className="h-4 w-4 mr-2" />
                Preview Import
              </Button>
            </div>
          )}

          {activeTab === 'file' && !importPreview && (
            <div className="space-y-3 text-center py-8">
              <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Upload an Excel or CSV file to import data.</p>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} data-testid="button-browse-file">
                <Upload className="h-4 w-4 mr-2" />
                Choose File
              </Button>
            </div>
          )}

          {(activeTab === 'paste' || activeTab === 'file') && importPreview && (
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-sm mb-2">Column Mappings</h4>
                <p className="text-xs text-muted-foreground mb-2">
                  Auto-detected mappings shown below. Use the dropdowns to adjust or assign unmapped columns.
                </p>
                <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-auto">
                  {importPreview.headers.map((header, idx) => {
                    const currentMapping = Object.entries(importPreview.mappings).find(([, h]) => h === header)?.[0] || '';
                    return (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        <span className="font-mono bg-muted/50 px-2 py-1 rounded min-w-[120px] truncate" title={header}>
                          {header}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <select
                          className="flex-1 border border-border rounded px-2 py-1 text-xs bg-background"
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
                          <option value="">-- Custom Field (keep as-is) --</option>
                          <optgroup label="Executive Fields">
                            <option value="name" disabled={!!importPreview.mappings.name && importPreview.mappings.name !== header}>Name</option>
                            <option value="title" disabled={!!importPreview.mappings.title && importPreview.mappings.title !== header}>Title</option>
                            <option value="email" disabled={!!importPreview.mappings.email && importPreview.mappings.email !== header}>Email</option>
                            <option value="phone" disabled={!!importPreview.mappings.phone && importPreview.mappings.phone !== header}>Phone</option>
                            <option value="linkedin" disabled={!!importPreview.mappings.linkedin && importPreview.mappings.linkedin !== header}>LinkedIn</option>
                            <option value="notes" disabled={!!importPreview.mappings.notes && importPreview.mappings.notes !== header}>Notes</option>
                            <option value="remunerationNotes" disabled={!!importPreview.mappings.remunerationNotes && importPreview.mappings.remunerationNotes !== header}>Remuneration</option>
                            <option value="availability" disabled={!!importPreview.mappings.availability && importPreview.mappings.availability !== header}>Status</option>
                            <option value="level" disabled={!!importPreview.mappings.level && importPreview.mappings.level !== header}>Level</option>
                          </optgroup>
                          <optgroup label="Company Fields">
                            <option value="company" disabled={!!importPreview.mappings.company && importPreview.mappings.company !== header}>Company</option>
                            <option value="country" disabled={!!importPreview.mappings.country && importPreview.mappings.country !== header}>Country</option>
                            <option value="sector" disabled={!!importPreview.mappings.sector && importPreview.mappings.sector !== header}>Sector / Industry</option>
                            <option value="revenue" disabled={!!importPreview.mappings.revenue && importPreview.mappings.revenue !== header}>Revenue</option>
                            <option value="employees" disabled={!!importPreview.mappings.employees && importPreview.mappings.employees !== header}>Employees</option>
                          </optgroup>
                        </select>
                        {currentMapping && <span className="text-green-500 text-xs shrink-0">Mapped</span>}
                      </div>
                    );
                  })}
                </div>
                {!importPreview.mappings.name && !importPreview.mappings.company && !importPreview.mappings.title && (
                  <p className="text-amber-500 text-xs mt-2">Please map at least one column to Name, Company, or Title to import.</p>
                )}
              </div>

              <div>
                <h4 className="font-medium text-sm mb-2">Preview ({importPreview.rows.length} rows)</h4>
                <div className="border border-border rounded-lg overflow-auto max-h-48">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        {importPreview.headers.map((h, i) => {
                          const mapped = Object.entries(importPreview.mappings).find(([, v]) => v === h)?.[0];
                          return (
                            <th key={i} className={`text-left p-2 font-medium whitespace-nowrap ${mapped ? 'text-green-400' : 'text-muted-foreground'}`}>
                              {h}
                              {mapped && <span className="ml-1 text-[10px] opacity-60">({mapped})</span>}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.rows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-b border-border/30">
                          {row.map((cell, j) => (
                            <td key={j} className="p-2 truncate max-w-[150px]" title={cell}>{cell || '-'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {importPreview.rows.length > 5 && (
                    <div className="p-2 text-center text-xs text-muted-foreground bg-muted/30">
                      ... and {importPreview.rows.length - 5} more rows
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setImportPreview(null)} className="flex-1">
                  Back
                </Button>
                <Button
                  onClick={handleConfirmImport}
                  disabled={isImporting || (!importPreview.mappings.name && !importPreview.mappings.company && !importPreview.mappings.title)}
                  className="flex-1"
                  data-testid="button-confirm-import"
                >
                  {isImporting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Importing...</> : `Import ${importPreview.rows.length} Records`}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
