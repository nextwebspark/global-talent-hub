import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Upload, Loader2, FileSpreadsheet, Table2, Plus, Trash2, X, Globe, Building2,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { COUNTRIES } from '@/lib/countries';
import { FIELD_LABELS } from '../constants';
import { createEmptyRow } from '../utils';
import type { ImportModeHook } from '../hooks/useImportMode';

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

export function ImportPanel({ importState }: { importState: ImportModeHook }) {
  const {
    importTab, setImportTab,
    isImporting,
    projectName, setProjectName,
    importPreview, setImportPreview,
    pasteText, setPasteText,
    manualRows, setManualRows,
    fileInputRef,
    handleFileUpload,
    handlePastePreview,
    handleConfirmImport,
    handleManualSubmit,
    fetchCompanyOptions,
  } = importState;

  return (
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
          <>
            <div
              className="border-2 border-dashed border-border/60 rounded-xl p-10 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              data-testid="dropzone-file-upload"
            >
              <Upload className="h-9 w-9 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground mb-1">Drop your file here</p>
              <p className="text-xs text-muted-foreground">Drag and drop, or click to browse</p>
              <div className="text-[11px] text-muted-foreground/60 mt-1.5">CSV · XLSX · PDF</div>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" data-testid="input-file-upload" />
            </div>
            <div className="mt-4">
              <p className="text-[11px] text-muted-foreground/70 mb-2">Or connect from</p>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" disabled title="Coming soon" className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-xs text-muted-foreground bg-card opacity-60 cursor-not-allowed" data-testid="connect-excel-csv">
                  <FileSpreadsheet className="w-4 h-4" /> Excel / CSV
                </button>
                <button type="button" disabled title="Coming soon" className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-xs text-muted-foreground bg-card opacity-60 cursor-not-allowed" data-testid="connect-google-sheets">
                  <Globe className="w-4 h-4" /> Google Sheets
                </button>
                <button type="button" disabled title="Coming soon" className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-xs text-muted-foreground bg-card opacity-60 cursor-not-allowed" data-testid="connect-crm-export">
                  <Building2 className="w-4 h-4" /> CRM export
                </button>
              </div>
            </div>
          </>
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
  );
}
