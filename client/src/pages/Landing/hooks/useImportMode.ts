import { useCallback, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { detectColumnMappings, createEmptyRow } from '../utils';
import type { ImportPreview, ManualRow } from '../types';

export type ImportModeHook = ReturnType<typeof useImportMode>;

export function useImportMode({
  setProject,
  loadFromAPI,
  setLocation,
}: {
  setProject: (p: any) => void;
  loadFromAPI: (companies: any[], hierarchies?: any, tableConfig?: any, mapPositions?: any) => void;
  setLocation: (path: string) => void;
}) {
  const [importTab, setImportTab] = useState<'file' | 'paste' | 'manual'>('file');
  const [isImporting, setIsImporting] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [manualRows, setManualRows] = useState<ManualRow[]>(() => Array.from({ length: 5 }, createEmptyRow));
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  return {
    importTab,
    setImportTab,
    isImporting,
    projectName,
    setProjectName,
    importPreview,
    setImportPreview,
    pasteText,
    setPasteText,
    manualRows,
    setManualRows,
    fileInputRef,
    handleFileUpload,
    handlePastePreview,
    handleConfirmImport,
    handleManualSubmit,
    fetchCompanyOptions,
  };
}
