import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getGroupedRowModel,
  getExpandedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ColumnOrderState,
  type VisibilityState,
  type GroupingState,
  type ExpandedState,
  type ColumnSizingState,
  type Header,
  type Row,
} from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import {
  ArrowUpDown, ArrowUp, ArrowDown,
  Columns3, Group, ChevronRight, ChevronDown,
  Rows3, Maximize2, Minimize2,
  Minus, Trash2, X, Plus, Building2, GripVertical, Wand2,
} from 'lucide-react';
import { useAppStore, transformAPICompany, transformAPIExecutive } from '@/lib/store';
import { toast } from 'sonner';

export interface TableRowData {
  id: string;
  country: string;
  sector: string;
  revenue: number;
  employees: number;
  name: string;
  title: string;
  notes: string;
  email: string;
  phone: string;
  linkedin: string;
  remunerationNotes: string;
  availability: string;
  level: string;
  gender: string;
  ethnicity: string;
  companyId: string;
  companyName: string;
  companyColor: string;
  companyStatus: string;
  isCompanyRow: boolean;
  customFields?: Record<string, string>;
}

function formatRevenue(value: number): string {
  if (!value || value === 0) return '-';
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function formatEmployees(value: number): string {
  if (!value || value === 0) return '-';
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return String(value);
}

function parseRevenueInput(input: string): number {
  const cleaned = input.replace(/[$,\s]/g, '').toLowerCase();
  if (!cleaned) return 0;
  const multipliers: Record<string, number> = { b: 1e9, bn: 1e9, billion: 1e9, m: 1e6, mn: 1e6, mil: 1e6, million: 1e6, k: 1e3, thousand: 1e3 };
  for (const [suffix, mult] of Object.entries(multipliers)) {
    if (cleaned.endsWith(suffix)) {
      const num = parseFloat(cleaned.slice(0, -suffix.length));
      return isNaN(num) ? 0 : num * mult;
    }
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

const STATUS_OPTIONS = ['Interested', 'Not Interested', 'Out of Scope', 'Off-Limits'] as const;
const COMPANY_STATUS_OPTIONS = ['Active', 'Off-Limits'] as const;
const LEVEL_OPTIONS = ['Board', 'C-Suite', 'N-1', 'N-2'] as const;
const GENDER_OPTIONS = ['Male', 'Female', 'Prefer not to say'] as const;
const ETHNICITY_OPTIONS = ['African', 'East Asian', 'European', 'Latin American', 'Middle Eastern', 'Native/Indigenous', 'Pacific Islander', 'South Asian', 'Southeast Asian', 'Mixed/Other'] as const;

const SECTOR_TAXONOMY: Record<string, string[]> = {
  'Energy': ['Oil, Gas & Pipelines', 'Renewable Energy'],
  'Materials': ['Metals & Mining', 'Chemicals', 'Construction Materials'],
  'Industrials': ['Aerospace & Defense', 'Transportation & Logistics', 'Construction & Engineering', 'Industrial Machinery'],
  'Consumer Discretionary': ['Retail & E-Commerce', 'Automotive', 'Travel, Leisure & Hospitality', 'Media & Entertainment'],
  'Consumer Staples': ['Food & Beverage', 'Household & Personal Products', 'Grocery & Drug Retail'],
  'Health Care': ['Pharmaceuticals & Biotech', 'Medical Devices & Equipment', 'Health Care Services'],
  'Financial Services': ['Banking', 'Insurance', 'Asset Management', 'Fintech & Payments'],
  'Information Technology': ['Software & SaaS', 'Hardware & Semiconductors', 'IT Services & Consulting', 'Cybersecurity'],
  'Communication Services': ['Telecom', 'Internet & Digital Platforms', 'Gaming'],
  'Utilities': ['Electric Utilities', 'Water & Waste Management', 'Gas Distribution'],
  'Real Estate': ['Commercial Real Estate', 'Residential Real Estate', 'REITs & Property Management'],
  'Conglomerates & Holding Companies': ['Family Conglomerates', 'Sovereign & State-Owned Holding Companies', 'Private Equity & Investment Holding'],
  'Sovereign Wealth & Government': ['Sovereign Wealth Funds', 'Government & Public Sector', 'Quasi-Government Entities'],
};

const SECTOR_TO_CATEGORY: Record<string, string> = {};
for (const [cat, subs] of Object.entries(SECTOR_TAXONOMY)) {
  for (const s of subs) SECTOR_TO_CATEGORY[s] = cat;
}

const ALL_SUB_SECTORS: readonly string[] = Object.values(SECTOR_TAXONOMY).flat();

function getSectorCategory(sector: string | null | undefined): string | null {
  if (!sector) return null;
  return SECTOR_TO_CATEGORY[sector] || null;
}

const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina', 'Armenia', 'Australia', 'Austria',
  'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan',
  'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cambodia', 'Cameroon',
  'Canada', 'Cape Verde', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Costa Rica',
  'Croatia', 'Cuba', 'Cyprus', 'Czech Republic', 'DR Congo', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic', 'East Timor',
  'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji', 'Finland',
  'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea',
  'Guinea-Bissau', 'Guyana', 'Haiti', 'Honduras', 'Hong Kong', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran',
  'Iraq', 'Ireland', 'Israel', 'Italy', 'Ivory Coast', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya',
  'Kiribati', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein',
  'Lithuania', 'Luxembourg', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania',
  'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar',
  'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia',
  'Norway', 'Oman', 'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines',
  'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa',
  'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia',
  'Solomon Islands', 'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden',
  'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia',
  'Turkey', 'Turkmenistan', 'Tuvalu', 'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan',
  'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe',
];

function FixedDropdown({ anchorRef, onClose, children, minWidth }: {
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  children: React.ReactNode;
  minWidth?: number;
}) {
  const dropRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 2, left: rect.left });
    }
  }, [anchorRef]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, anchorRef]);

  if (!coords) return null;

  return createPortal(
    <div
      ref={dropRef}
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        zIndex: 9999,
        backgroundColor: 'hsl(var(--popover))',
        color: 'hsl(var(--popover-foreground))',
        border: '1px solid hsl(var(--border))',
        borderRadius: '0.375rem',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        minWidth: minWidth ? `${minWidth}px` : '140px',
        maxHeight: '300px',
        overflowY: 'auto',
      }}
      onClick={e => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}

function SelectCell({ value, options, onSave, placeholder }: {
  value: string;
  options: readonly string[];
  onSave: (val: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);

  return (
    <>
      <span
        ref={triggerRef}
        className="truncate block cursor-pointer hover:bg-muted/40 rounded px-0.5 -mx-0.5"
        title={value || undefined}
        onMouseDown={e => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        data-testid="select-cell-display"
        data-no-drag-select
      >
        {value || '-'}
      </span>
      {open && (
        <FixedDropdown anchorRef={triggerRef} onClose={() => setOpen(false)}>
          {options.map(opt => (
            <div
              key={opt}
              className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-accent whitespace-nowrap ${opt === value ? 'font-medium' : ''}`}
              style={opt === value ? { backgroundColor: 'hsl(var(--accent) / 0.5)' } : undefined}
              onMouseDown={e => { e.preventDefault(); onSave(opt); setOpen(false); }}
            >
              {opt}
            </div>
          ))}
          {value && (
            <div
              className="px-3 py-1.5 text-xs cursor-pointer hover:bg-destructive/20 text-muted-foreground italic border-t border-border whitespace-nowrap"
              onMouseDown={e => { e.preventDefault(); onSave(''); setOpen(false); }}
            >
              Clear
            </div>
          )}
        </FixedDropdown>
      )}
    </>
  );
}

function SectorPickerButton({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const btnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!search) return null;
    const lower = search.toLowerCase();
    return ALL_SUB_SECTORS.filter(s => s.toLowerCase().includes(lower));
  }, [search]);

  useEffect(() => {
    if (open) { setSearch(''); setTimeout(() => inputRef.current?.focus(), 10); }
  }, [open]);

  return (
    <div className={className}>
      <button
        ref={btnRef}
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 text-sm border border-input rounded-md bg-background hover:bg-muted/40 transition-colors"
        onClick={() => setOpen(v => !v)}
        data-testid="sector-picker-button"
      >
        <span className={value ? '' : 'text-muted-foreground'}>{value || 'Select sector...'}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
      </button>
      {open && (
        <FixedDropdown anchorRef={btnRef} onClose={() => setOpen(false)} minWidth={240}>
          <input
            ref={inputRef}
            style={{ backgroundColor: 'hsl(var(--background))' }}
            className="w-full border-b border-border rounded-t px-2 py-1.5 text-xs outline-none"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search sector..."
          />
          <div className="max-h-[280px] overflow-y-auto">
            {filtered ? (
              filtered.map(opt => (
                <div
                  key={opt}
                  className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-accent whitespace-nowrap ${opt === value ? 'font-medium bg-accent/50' : ''}`}
                  onMouseDown={e => { e.preventDefault(); onChange(opt); setOpen(false); }}
                >
                  <span className="text-muted-foreground mr-1">{SECTOR_TO_CATEGORY[opt]} ›</span>{opt}
                </div>
              ))
            ) : (
              Object.entries(SECTOR_TAXONOMY).map(([cat, subs]) => (
                <div key={cat}>
                  <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground select-none">
                    {cat}
                  </div>
                  {subs.map(opt => (
                    <div
                      key={opt}
                      className={`pl-5 pr-3 py-1.5 text-xs cursor-pointer hover:bg-accent whitespace-nowrap ${opt === value ? 'font-medium bg-accent/50' : ''}`}
                      onMouseDown={e => { e.preventDefault(); onChange(opt); setOpen(false); }}
                    >
                      {opt}
                    </div>
                  ))}
                </div>
              ))
            )}
            {filtered && filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>
            )}
          </div>
        </FixedDropdown>
      )}
    </div>
  );
}

function SearchableSelectCell({ value, options, onSave, placeholder, groups }: {
  value: string;
  options: readonly string[];
  onSave: (val: string) => void;
  placeholder?: string;
  groups?: Record<string, string[]>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(lower));
  }, [options, search]);

  useEffect(() => {
    if (open) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    if (open && listRef.current && filtered.length > 0) {
      const firstMatch = listRef.current.querySelector('[data-highlighted="true"]');
      if (firstMatch) firstMatch.scrollIntoView({ block: 'nearest' });
    }
  }, [filtered, open]);

  return (
    <>
      <span
        ref={triggerRef}
        className="truncate block cursor-text hover:bg-muted/40 rounded px-0.5 -mx-0.5"
        title={value || undefined}
        onMouseDown={e => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        data-testid="searchable-select-display"
        data-no-drag-select
      >
        {value || '-'}
      </span>
      {open && (
        <FixedDropdown anchorRef={triggerRef} onClose={() => setOpen(false)}>
          <input
            ref={inputRef}
            style={{ backgroundColor: 'hsl(var(--background))' }}
            className="w-full border-b border-border rounded-t px-2 py-1.5 text-xs outline-none"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && filtered.length > 0) { onSave(filtered[0]); setOpen(false); }
              if (e.key === 'Escape') { setSearch(''); setOpen(false); }
            }}
            placeholder={placeholder || 'Type to search...'}
            data-testid="searchable-select-input"
          />
          {filtered.length > 0 && (
            <div ref={listRef} className="max-h-[240px] overflow-y-auto">
              {(groups && !search) ? (
                Object.entries(groups).map(([cat, subs]) => (
                  <div key={cat}>
                    <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground select-none">
                      {cat}
                    </div>
                    {subs.map(opt => (
                      <div
                        key={opt}
                        className={`pl-5 pr-3 py-1.5 text-xs cursor-pointer hover:bg-accent whitespace-nowrap ${opt === value ? 'font-medium bg-accent/50' : ''}`}
                        onMouseDown={e => { e.preventDefault(); onSave(opt); setOpen(false); }}
                      >
                        {opt}
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                filtered.map((opt, i) => (
                  <div
                    key={opt}
                    data-highlighted={i === 0 ? 'true' : 'false'}
                    className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-accent whitespace-nowrap ${opt === value ? 'font-medium' : ''}`}
                    style={(opt === value || i === 0) ? { backgroundColor: `hsl(var(--accent) / ${opt === value ? '0.5' : '0.3'})` } : undefined}
                    onMouseDown={e => { e.preventDefault(); onSave(opt); setOpen(false); }}
                  >
                    {opt}
                  </div>
                ))
              )}
            </div>
          )}
        </FixedDropdown>
      )}
    </>
  );
}

function EditableCell({ value, onSave, isNumeric, formatFn }: {
  value: string;
  onSave: (val: string) => void;
  isNumeric?: boolean;
  formatFn?: (val: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cellRef = useRef<HTMLSpanElement>(null);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);
  const usePopup = !isNumeric && !formatFn;

  useEffect(() => {
    if (editing) {
      if (usePopup && cellRef.current) {
        const rect = cellRef.current.getBoundingClientRect();
        const popupW = 320;
        const popupH = 160;
        let left = rect.left;
        let top = rect.bottom + 4;
        if (left + popupW > window.innerWidth - 16) left = window.innerWidth - popupW - 16;
        if (left < 8) left = 8;
        if (top + popupH > window.innerHeight - 16) top = rect.top - popupH - 4;
        setPopupPos({ top, left });
      }
      requestAnimationFrame(() => {
        if (usePopup && textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length);
        } else if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      });
    } else {
      setPopupPos(null);
    }
  }, [editing, usePopup]);

  const commit = () => {
    setEditing(false);
    if (editValue !== value) {
      onSave(editValue);
    }
  };

  if (editing && !usePopup) {
    return (
      <input
        ref={inputRef}
        className="w-full bg-transparent border border-primary/50 rounded px-1 py-0 text-xs outline-none focus:border-primary"
        value={editValue}
        onChange={e => setEditValue(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setEditValue(value); setEditing(false); }
        }}
        onClick={e => e.stopPropagation()}
        data-testid="editable-cell-input"
      />
    );
  }

  const display = formatFn ? formatFn(value) : (value || '-');
  return (
    <>
      <span
        ref={cellRef}
        className="truncate block cursor-text hover:bg-muted/40 rounded px-0.5 -mx-0.5"
        title={value || undefined}
        onMouseDown={e => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setEditValue(value); setEditing(true); }}
        data-testid="editable-cell-display"
        data-no-drag-select
      >
        {display}
      </span>
      {editing && usePopup && popupPos && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={(e) => { e.stopPropagation(); commit(); }} />
          <div
            className="fixed z-[9999] rounded-lg border border-border shadow-xl"
            style={{ top: popupPos.top, left: popupPos.left, width: 320, backgroundColor: 'hsl(var(--popover))' }}
            onClick={e => e.stopPropagation()}
          >
            <textarea
              ref={textareaRef}
              className="w-full bg-transparent rounded-lg px-3 py-2 text-xs outline-none resize-none"
              style={{ height: 140 }}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
                if (e.key === 'Escape') { setEditValue(value); setEditing(false); }
              }}
              data-testid="editable-cell-textarea"
            />
            <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/50 text-[10px] text-muted-foreground">
              <span>Shift+Enter for new line</span>
              <div className="flex gap-1.5">
                <button className="px-2 py-0.5 rounded hover:bg-muted" onClick={() => { setEditValue(value); setEditing(false); }}>Cancel</button>
                <button className="px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90" onClick={commit}>Save</button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

interface DataTableProps {
  data: TableRowData[];
  selectedCompanyId: string | null;
  selectedExecutiveId: string | null;
  onRowClick: (row: TableRowData) => void;
}

type DensityMode = 'compact' | 'comfortable' | 'spacious';

const densityPadding: Record<DensityMode, string> = {
  compact: 'px-2 py-0.5',
  comfortable: 'px-2 py-1.5',
  spacious: 'px-3 py-2.5',
};

const columnHelper = createColumnHelper<TableRowData>();

function ResizableHeader({ header, density, onDragStart, onDragOver, onDrop, isDragTarget }: {
  header: Header<TableRowData, unknown>;
  density: DensityMode;
  onDragStart: (columnId: string) => void;
  onDragOver: (e: React.DragEvent, columnId: string) => void;
  onDrop: (e: React.DragEvent, columnId: string) => void;
  isDragTarget: boolean;
}) {
  const resizeHandler = header.getResizeHandler();

  return (
    <th
      key={header.id}
      className={`relative select-none text-left font-medium text-xs whitespace-nowrap border-r border-border/40 bg-background group
        ${header.column.getCanSort() ? 'cursor-pointer hover:bg-muted/70' : ''}
        ${isDragTarget ? 'bg-primary/10' : ''}
      `}
      style={{ width: header.getSize(), minWidth: 60 }}
      data-testid={`th-${header.id}`}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e, header.column.id); }}
      onDrop={(e) => onDrop(e, header.column.id)}
    >
      <div
        className={`flex items-center gap-1 ${densityPadding[density]}`}
        onClick={header.column.getToggleSortingHandler()}
      >
        <div
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.effectAllowed = 'move';
            onDragStart(header.column.id);
          }}
          onDragEnd={() => onDragStart('')}
          className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/0 group-hover:text-muted-foreground/50 hover:!text-muted-foreground transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-3 w-3" />
        </div>
        <span className="truncate">
          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
        </span>
        {header.column.getIsSorted() === 'asc' && <ArrowUp className="h-3 w-3 shrink-0 text-primary" />}
        {header.column.getIsSorted() === 'desc' && <ArrowDown className="h-3 w-3 shrink-0 text-primary" />}
        {!header.column.getIsSorted() && header.column.getCanSort() && (
          <ArrowUpDown className="h-3 w-3 shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground/60" />
        )}
      </div>

      {isDragTarget && (
        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary z-20" />
      )}

      {header.column.getCanResize() && (
        <div
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            resizeHandler(e);
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
            resizeHandler(e);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            header.column.resetSize();
          }}
          className={`absolute top-0 right-0 w-[5px] h-full cursor-col-resize select-none touch-none z-10
            hover:bg-primary/60 active:bg-primary
            ${header.column.getIsResizing() ? 'bg-primary w-[3px]' : 'bg-transparent'}
          `}
          data-testid={`resize-${header.id}`}
        />
      )}
    </th>
  );
}

export default function DataTable({ data, selectedCompanyId, selectedExecutiveId, onRowClick }: DataTableProps) {
  const { deleteCompany, deleteExecutive, updateCompany, updateExecutive, addCompany, addExecutive, executives: allExecutives, currentProject, companies, tableConfig, setTableConfig } = useAppStore();

  const defaultVisibility: VisibilityState = {
    sector: false,
    email: false,
    phone: false,
    linkedin: false,
    remunerationNotes: false,
    availability: false,
    level: false,
    gender: false,
    ethnicity: false,
  };

  const [sorting, setSorting] = useState<SortingState>(() =>
    tableConfig?.sorting || [{ id: 'country', desc: false }]
  );
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
    tableConfig?.columnVisibility || defaultVisibility
  );

  const projectId = currentProject?.id;
  const prevProjectIdRef = useRef(projectId);
  const suppressConfigSaveRef = useRef(false);
  useEffect(() => {
    if (prevProjectIdRef.current === projectId) return;
    prevProjectIdRef.current = projectId;
    const cfg = useAppStore.getState().tableConfig;
    suppressConfigSaveRef.current = true;
    if (cfg) {
      setSorting(cfg.sorting || [{ id: 'country', desc: false }]);
      setColumnVisibility(cfg.columnVisibility || defaultVisibility);
      setColumnOrder(cfg.columnOrder || defaultColumnOrder);
      setColumnSizing(cfg.columnSizing || {});
      setDensity(cfg.density || 'comfortable');
    } else {
      setSorting([{ id: 'country', desc: false }]);
      setColumnVisibility(defaultVisibility);
      setColumnOrder(defaultColumnOrder);
      setColumnSizing({});
      setDensity('comfortable');
    }
    requestAnimationFrame(() => { suppressConfigSaveRef.current = false; });
  }, [projectId]);

  const prevDataCountRef = useRef(0);
  const configInitializedRef = useRef(!!tableConfig);
  useEffect(() => {
    if (data.length === 0) return;
    if (configInitializedRef.current) {
      configInitializedRef.current = false;
      prevDataCountRef.current = data.length;
      return;
    }
    const prevCount = prevDataCountRef.current;
    prevDataCountRef.current = data.length;
    if (prevCount > 0 && data.length === prevCount) return;
    const optionalFields = ['sector', 'email', 'phone', 'linkedin', 'remunerationNotes', 'availability', 'level', 'gender', 'ethnicity'] as const;
    setColumnVisibility(prev => {
      const next = { ...prev };
      let changed = false;
      for (const field of optionalFields) {
        if (!prev[field] && data.some(row => row[field] && String(row[field]).trim() !== '')) {
          next[field] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [data]);

  const handleCellSave = useCallback((row: TableRowData, field: string, value: string) => {
    const companyFields = ['companyName', 'country', 'sector', 'revenue', 'employees'];
    if (companyFields.includes(field)) {
      if (field === 'companyName') {
        updateCompany(row.companyId, { name: value });
      } else if (field === 'country') {
        updateCompany(row.companyId, { hq_country: value });
      } else if (field === 'sector') {
        const cat = getSectorCategory(value);
        updateCompany(row.companyId, { industry: value, ...(cat ? { sectorCategory: cat } : {}) });
      } else if (field === 'revenue') {
        updateCompany(row.companyId, { revenue_usd: parseRevenueInput(value) });
      } else if (field === 'employees') {
        const num = parseInt(value.replace(/[^0-9]/g, ''), 10);
        updateCompany(row.companyId, { employees: isNaN(num) ? 0 : num });
      }
    } else if (field === 'companyStatus' && row.isCompanyRow) {
      updateCompany(row.companyId, { status: value || undefined });
      if (value === 'Off-Limits' || value === 'Out of Scope') {
        const noteText = `${row.companyName} - ${value}`;
        fetch(`/api/companies/${row.companyId}/notes`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: noteText }),
        });
        const compExecs = allExecutives.filter(e => e.company_id === row.companyId);
        compExecs.forEach(exec => {
          fetch(`/api/executives/${exec.id}/notes`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: noteText }),
          });
        });
      }
    } else if (!row.isCompanyRow) {
      if (field.startsWith('custom_')) {
        const customKey = field.slice(7);
        const existingCustom = row.customFields || {};
        const updatedCustom = { ...existingCustom, [customKey]: value };
        updateExecutive(row.id, { customFields: updatedCustom });
      } else {
        const updates: Record<string, string> = {};
        updates[field] = value;
        updateExecutive(row.id, updates);
        if (field === 'availability' && (value === 'Off-Limits' || value === 'Out of Scope')) {
          const noteText = `${row.companyName} - ${row.name} - ${value}`;
          fetch(`/api/executives/${row.id}/notes`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: noteText }),
          });
        }
      }
    }
  }, [updateCompany, updateExecutive, allExecutives]);

  const [fillingSectors, setFillingSectors] = useState(false);

  const handleFillSectors = useCallback(async () => {
    const emptySectorCompanies = companies
      .filter(c => !c.industry)
      .map(c => ({ id: Number(c.id), name: c.name }));
    if (emptySectorCompanies.length === 0) {
      toast.info('All companies already have a sector assigned.');
      return;
    }
    setFillingSectors(true);
    try {
      const res = await fetch('/api/companies/infer-sectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companies: emptySectorCompanies }),
      });
      if (!res.ok) throw new Error('Request failed');
      const { results } = await res.json() as { results: { id: number; sector: string; category?: string }[] };
      if (results.length > 0) {
        const filled = new Map(results.map(r => [String(r.id), { sector: r.sector, category: r.category || getSectorCategory(r.sector) || '' }]));
        useAppStore.setState(state => ({
          companies: state.companies.map(c => {
            const match = filled.get(c.id);
            return match ? { ...c, industry: match.sector, sectorCategory: match.category } : c;
          }),
        }));
      }
      toast.success(`${results.length} sector${results.length !== 1 ? 's' : ''} filled automatically.`);
    } catch {
      toast.error('Failed to infer sectors. Please try again.');
    } finally {
      setFillingSectors(false);
    }
  }, [companies]);

  const [addCompanyDialogOpen, setAddCompanyDialogOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyCountry, setNewCompanyCountry] = useState('');
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const countryDropdownRef = useRef<HTMLDivElement>(null);
  const [newExecName, setNewExecName] = useState('');
  const [newExecTitle, setNewExecTitle] = useState('');
  const [newSector, setNewSector] = useState('');
  const [newRevenue, setNewRevenue] = useState('');
  const [newEmployees, setNewEmployees] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newLinkedin, setNewLinkedin] = useState('');
  const [newRemunerationNotes, setNewRemunerationNotes] = useState('');
  const [newAvailability, setNewAvailability] = useState('');
  const [newLevel, setNewLevel] = useState('');
  const [matchedCompany, setMatchedCompany] = useState<any>(null);
  const [companySuggestions, setCompanySuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(event.target as Node)) {
        setCountryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchCompanies = useCallback(async (name: string) => {
    if (name.length < 2) {
      setCompanySuggestions([]);
      setMatchedCompany(null);
      return;
    }
    try {
      const exactLocalMatch = companies.find(c =>
        c.name.toLowerCase() === name.toLowerCase().trim()
      );
      if (exactLocalMatch) {
        setMatchedCompany(exactLocalMatch);
        setCompanySuggestions([]);
        setShowSuggestions(false);
        return;
      }
      const localMatches = companies.filter(c =>
        c.name.toLowerCase().includes(name.toLowerCase())
      );
      if (localMatches.length > 0) {
        setCompanySuggestions(localMatches.slice(0, 8));
        setShowSuggestions(true);
        return;
      }
      const res = await fetch(`/api/companies/search?name=${encodeURIComponent(name)}`);
      if (res.ok) {
        const results = await res.json();
        const transformed = results.map((c: any) => transformAPICompany(c));
        const exactDbMatch = transformed.find((c: any) =>
          c.name.toLowerCase() === name.toLowerCase().trim()
        );
        if (exactDbMatch) {
          setMatchedCompany(exactDbMatch);
          setCompanySuggestions([]);
          setShowSuggestions(false);
        } else {
          setCompanySuggestions(transformed.slice(0, 8));
          setShowSuggestions(transformed.length > 0);
        }
      }
    } catch {
      /* ignore */
    }
  }, [companies]);

  const handleCompanyNameChange = useCallback((val: string) => {
    setNewCompanyName(val);
    setMatchedCompany(null);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => searchCompanies(val), 250);
  }, [searchCompanies]);

  const selectSuggestion = useCallback((company: any) => {
    setNewCompanyName(company.name);
    setMatchedCompany(company);
    setShowSuggestions(false);
    setCompanySuggestions([]);
  }, []);

  const resetDialogFields = useCallback(() => {
    setNewCompanyName('');
    setNewCompanyCountry('');
    setNewExecName('');
    setNewExecTitle('');
    setNewSector('');
    setNewRevenue('');
    setNewEmployees('');
    setNewNotes('');
    setNewEmail('');
    setNewPhone('');
    setNewLinkedin('');
    setNewRemunerationNotes('');
    setNewAvailability('');
    setNewLevel('');
    setMatchedCompany(null);
    setCompanySuggestions([]);
  }, []);

  const handleAddCompanySubmit = useCallback(async () => {
    if (!newCompanyName.trim()) return;
    setIsSubmitting(true);
    try {
      const searchQueryId = currentProject?.id ? parseInt(currentProject.id) : null;
      let companyId: string;

      if (matchedCompany) {
        const existingInProject = companies.find(c =>
          c.name.toLowerCase() === matchedCompany.name.toLowerCase()
        );
        if (existingInProject) {
          companyId = existingInProject.id;
        } else {
          const res = await fetch('/api/companies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: matchedCompany.name,
              country: matchedCompany.hq_country || 'Unknown',
              sector: matchedCompany.industry || newSector.trim() || 'Unknown',
              region: 'Unknown',
              latitude: String(matchedCompany.lat || 0),
              longitude: String(matchedCompany.lng || 0),
              revenue: String(matchedCompany.revenue_usd || (newRevenue.trim() ? parseRevenueInput(newRevenue) : 0)),
              employees: matchedCompany.employees || (newEmployees.trim() ? parseInt(newEmployees.replace(/[^0-9]/g, '')) || 0 : 0),
              ...(searchQueryId ? { searchQueryId } : {}),
            }),
          });
          if (!res.ok) throw new Error('Failed to create company');
          const company = await res.json();
          const transformed = transformAPICompany(company);
          addCompany(transformed);
          companyId = transformed.id;
        }
      } else {
        const res = await fetch('/api/companies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newCompanyName.trim(),
            country: newCompanyCountry.trim() || 'Unknown',
            sector: newSector.trim() || 'Unknown',
            revenue: newRevenue.trim() ? String(parseRevenueInput(newRevenue)) : undefined,
            employees: newEmployees.trim() ? parseInt(newEmployees.replace(/[^0-9]/g, '')) || 0 : undefined,
            ...(searchQueryId ? { searchQueryId } : {}),
          }),
        });
        if (!res.ok) throw new Error('Failed to create company');
        const company = await res.json();
        const transformed = transformAPICompany(company);
        addCompany(transformed);
        companyId = transformed.id;
      }

      if (newExecName.trim()) {
        const execRes = await fetch('/api/executives', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: parseInt(companyId),
            name: newExecName.trim(),
            title: newExecTitle.trim() || 'Unknown',
            notes: newNotes.trim() || undefined,
            email: newEmail.trim() || undefined,
            phone: newPhone.trim() || undefined,
            linkedin: newLinkedin.trim() || undefined,
            remunerationNotes: newRemunerationNotes.trim() || undefined,
            availability: newAvailability || undefined,
            level: newLevel || undefined,
          }),
        });
        if (execRes.ok) {
          const exec = await execRes.json();
          addExecutive(transformAPIExecutive(exec, companyId));
        }
      }

      toast.success(matchedCompany ? `Added executive to "${matchedCompany.name}"` : `Created "${newCompanyName.trim()}"`);
      setAddCompanyDialogOpen(false);
      resetDialogFields();
    } catch {
      toast.error('Failed to add company');
    } finally {
      setIsSubmitting(false);
    }
  }, [newCompanyName, newCompanyCountry, newExecName, newExecTitle, newSector, newRevenue, newEmployees, newNotes, newEmail, newPhone, newLinkedin, newRemunerationNotes, newAvailability, newLevel, matchedCompany, currentProject, addCompany, addExecutive, companies, resetDialogFields]);
  const defaultColumnOrder = [
    'country', 'companyName', 'name', 'title', 'level', 'availability', 'linkedin',
    'sector', 'revenue', 'employees', 'notes', 'email', 'phone',
    'remunerationNotes',
  ];
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(() =>
    tableConfig?.columnOrder || defaultColumnOrder
  );
  const [grouping, setGrouping] = useState<GroupingState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>(true);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() =>
    tableConfig?.columnSizing || {}
  );
  const [density, setDensity] = useState<DensityMode>(() =>
    tableConfig?.density || 'comfortable'
  );

  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  const [dragTargetColumnId, setDragTargetColumnId] = useState<string | null>(null);

  const handleColumnDragStart = useCallback((columnId: string) => {
    if (!columnId) {
      setDraggedColumnId(null);
      setDragTargetColumnId(null);
      return;
    }
    setDraggedColumnId(columnId);
  }, []);

  const handleColumnDragOver = useCallback((_e: React.DragEvent, columnId: string) => {
    if (draggedColumnId && draggedColumnId !== columnId) {
      setDragTargetColumnId(columnId);
    }
  }, [draggedColumnId]);

  const tableRef = useRef<any>(null);

  const handleColumnDrop = useCallback((_e: React.DragEvent, targetColumnId: string) => {
    if (!draggedColumnId || draggedColumnId === targetColumnId) {
      setDraggedColumnId(null);
      setDragTargetColumnId(null);
      return;
    }
    setColumnOrder(prev => {
      const allCols = prev.length > 0
        ? prev
        : (tableRef.current?.getAllLeafColumns().map(c => c.id) ?? []);
      const fromIndex = allCols.indexOf(draggedColumnId);
      const toIndex = allCols.indexOf(targetColumnId);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const next = [...allCols];
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, draggedColumnId);
      return next;
    });
    setDraggedColumnId(null);
    setDragTargetColumnId(null);
  }, [draggedColumnId]);

  const [dragSelectedRows, setDragSelectedRows] = useState<Set<string>>(new Set());
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const dragStartRowRef = useRef<string | null>(null);

  const tableContainerRef = useRef<HTMLDivElement>(null);

  const customFieldKeys = useMemo(() => {
    const keys = new Set<string>();
    data.forEach(row => {
      if (row.customFields) {
        Object.keys(row.customFields).forEach(k => keys.add(k));
      }
    });
    return Array.from(keys);
  }, [data]);

  const editableCell = useCallback((field: string) => (info: any) => {
    const row = info.row.original;
    if (!row) return <span>-</span>;
    if (info.row.getIsGrouped()) {
      if (info.column.getIsGrouped()) {
        return (
          <span className="font-semibold flex items-center gap-1">
            {info.row.getIsExpanded() ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {info.getValue()} ({info.row.subRows.length})
          </span>
        );
      }
      return null;
    }
    return (
      <EditableCell
        value={String(info.getValue() || '')}
        onSave={(val) => handleCellSave(row, field, val)}
      />
    );
  }, [handleCellSave]);

  const columns = useMemo(() => {
    const cols = [
      columnHelper.accessor('country', {
        header: 'Country',
        cell: (info) => {
          const row = info.row.original;
          if (!row) return <span>-</span>;
          if (info.row.getIsGrouped()) {
            if (info.column.getIsGrouped()) {
              return (
                <span className="font-semibold flex items-center gap-1">
                  {info.row.getIsExpanded() ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  {info.getValue()} ({info.row.subRows.length})
                </span>
              );
            }
            return null;
          }
          return (
            <SearchableSelectCell
              value={String(info.getValue() || '')}
              options={COUNTRIES}
              onSave={(val) => handleCellSave(row, 'country', val)}
              placeholder="Search country..."
            />
          );
        },
        size: 140,
        enableGrouping: true,
      }),
      columnHelper.accessor('companyName', {
        header: 'Company',
        cell: (info) => {
          const row = info.row.original;
          if (info.row.getIsGrouped() && info.column.getIsGrouped()) {
            return (
              <span className="font-semibold flex items-center gap-1">
                {info.row.getIsExpanded() ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {info.getValue()} ({info.row.subRows.length})
              </span>
            );
          }
          if (!row) return null;
          const color = row.companyColor || '#1e3a8a';
          return (
            <span className="flex items-center">
              <span className="inline-block w-2 h-2 rounded-full mr-1.5 shrink-0" style={{ backgroundColor: color }} />
              <EditableCell
                value={info.getValue() || ''}
                onSave={(val) => handleCellSave(row, 'companyName', val)}
              />
            </span>
          );
        },
        size: 140,
        enableGrouping: true,
      }),
      columnHelper.accessor('sector', {
        header: 'Sector',
        cell: (info) => {
          const row = info.row.original;
          if (!row) return <span>-</span>;
          if (info.row.getIsGrouped()) {
            if (info.column.getIsGrouped()) {
              return (
                <span className="font-semibold flex items-center gap-1">
                  {info.row.getIsExpanded() ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  {info.getValue()} ({info.row.subRows.length})
                </span>
              );
            }
            return null;
          }
          return (
            <SearchableSelectCell
              value={String(info.getValue() || '')}
              options={ALL_SUB_SECTORS}
              groups={SECTOR_TAXONOMY}
              onSave={(val) => handleCellSave(row, 'sector', val)}
              placeholder="Search sector..."
            />
          );
        },
        size: 140,
        enableGrouping: true,
      }),
      columnHelper.accessor('revenue', {
        header: 'Revenue',
        cell: (info) => {
          const row = info.row.original;
          if (!row || info.row.getIsGrouped()) return null;
          return (
            <EditableCell
              value={info.getValue() ? String(info.getValue()) : ''}
              onSave={(val) => handleCellSave(row, 'revenue', val)}
              formatFn={(v) => formatRevenue(parseFloat(v) || 0)}
            />
          );
        },
        size: 100,
        enableGrouping: false,
        sortingFn: 'basic',
      }),
      columnHelper.accessor('employees', {
        header: 'Employees',
        cell: (info) => {
          const row = info.row.original;
          if (!row || info.row.getIsGrouped()) return null;
          return (
            <EditableCell
              value={info.getValue() ? String(info.getValue()) : ''}
              onSave={(val) => handleCellSave(row, 'employees', val)}
              formatFn={(v) => formatEmployees(parseInt(v) || 0)}
            />
          );
        },
        size: 90,
        enableGrouping: false,
        sortingFn: 'basic',
      }),
      columnHelper.accessor('name', { header: 'Executive', cell: editableCell('name'), size: 130, enableGrouping: false }),
      columnHelper.accessor('title', { header: 'Title', cell: editableCell('title'), size: 140, enableGrouping: false }),
      columnHelper.accessor('notes', { header: 'Notes', cell: editableCell('notes'), size: 120, enableGrouping: false }),
      columnHelper.accessor('email', { header: 'Email', cell: editableCell('email'), size: 160, enableGrouping: false }),
      columnHelper.accessor('phone', { header: 'Phone', cell: editableCell('phone'), size: 120, enableGrouping: false }),
      columnHelper.accessor('linkedin', { header: 'LinkedIn', cell: editableCell('linkedin'), size: 160, enableGrouping: false }),
      columnHelper.accessor('remunerationNotes', { header: 'Remuneration', cell: editableCell('remunerationNotes'), size: 140, enableGrouping: false }),
      columnHelper.accessor('availability', {
        header: 'Status',
        cell: (info) => {
          const row = info.row.original;
          if (!row || info.row.getIsGrouped()) return null;
          if (row.isCompanyRow) {
            return (
              <SelectCell
                value={String(row.companyStatus || '')}
                options={COMPANY_STATUS_OPTIONS}
                onSave={(val) => handleCellSave(row, 'companyStatus', val)}
                placeholder="- Co. Status -"
              />
            );
          }
          return (
            <SelectCell
              value={String(info.getValue() || '')}
              options={STATUS_OPTIONS}
              onSave={(val) => handleCellSave(row, 'availability', val)}
              placeholder="- Select Status -"
            />
          );
        },
        size: 120,
        enableGrouping: false,
      }),
      columnHelper.accessor('level', {
        header: 'Level',
        cell: (info) => {
          const row = info.row.original;
          if (!row || info.row.getIsGrouped()) return null;
          return (
            <SelectCell
              value={String(info.getValue() || '')}
              options={LEVEL_OPTIONS}
              onSave={(val) => handleCellSave(row, 'level', val)}
              placeholder="- Select Level -"
            />
          );
        },
        size: 100,
        enableGrouping: true,
      }),
      columnHelper.accessor('gender', {
        header: 'Gender',
        cell: (info) => {
          const row = info.row.original;
          if (!row || info.row.getIsGrouped()) return null;
          return (
            <SelectCell
              value={String(info.getValue() || '')}
              options={GENDER_OPTIONS}
              onSave={(val) => handleCellSave(row, 'gender', val)}
              placeholder="- Select Gender -"
            />
          );
        },
        size: 120,
        enableGrouping: true,
      }),
      columnHelper.accessor('ethnicity', {
        header: 'Ethnicity',
        cell: (info) => {
          const row = info.row.original;
          if (!row || info.row.getIsGrouped()) return null;
          return (
            <SelectCell
              value={String(info.getValue() || '')}
              options={ETHNICITY_OPTIONS}
              onSave={(val) => handleCellSave(row, 'ethnicity', val)}
              placeholder="- Select Ethnicity -"
            />
          );
        },
        size: 140,
        enableGrouping: true,
      }),
    ];

    customFieldKeys.forEach(key => {
      cols.push(
        columnHelper.accessor(
          (row) => row.customFields?.[key] || '',
          {
            id: `custom_${key}`,
            header: key,
            cell: editableCell(`custom_${key}`),
            size: 120,
            enableGrouping: false,
          }
        ) as any
      );
    });

    return cols;
  }, [customFieldKeys, editableCell]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      columnOrder,
      grouping,
      expanded,
      columnSizing,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onGroupingChange: setGrouping,
    onExpandedChange: setExpanded,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    columnResizeMode: 'onChange',
    enableMultiSort: true,
  });

  tableRef.current = table;

  const configSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configSaveInitRef = useRef(true);
  useEffect(() => {
    if (configSaveInitRef.current) {
      configSaveInitRef.current = false;
      return;
    }
    if (suppressConfigSaveRef.current) return;
    if (configSaveTimerRef.current) clearTimeout(configSaveTimerRef.current);
    configSaveTimerRef.current = setTimeout(() => {
      setTableConfig({
        columnVisibility,
        columnOrder,
        columnSizing,
        sorting,
        density,
      });
    }, 500);
    return () => {
      if (configSaveTimerRef.current) clearTimeout(configSaveTimerRef.current);
    };
  }, [columnVisibility, columnOrder, columnSizing, sorting, density, setTableConfig]);

  const allRowIds = useMemo(() => {
    return table.getRowModel().rows
      .filter(r => !r.getIsGrouped() && r.original)
      .map(r => r.original!.id);
  }, [table.getRowModel().rows]);

  const rowElementsRef = useRef<Map<string, HTMLTableRowElement>>(new Map());

  const didDragRef = useRef(false);
  const dragPendingRef = useRef<{ rowId: string; startX: number; startY: number } | null>(null);

  const handleDragSelectStart = useCallback((rowId: string, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-trash-btn]')) return;
    if ((e.target as HTMLElement).closest('[data-no-drag-select]')) return;
    dragPendingRef.current = { rowId, startX: e.clientX, startY: e.clientY };
    didDragRef.current = false;
  }, []);

  const handleDragSelectMove = useCallback((rowId: string) => {
    if (!isDragSelecting || !dragStartRowRef.current) return;
    if (rowId !== dragStartRowRef.current) {
      didDragRef.current = true;
    }
    const startIdx = allRowIds.indexOf(dragStartRowRef.current);
    const currentIdx = allRowIds.indexOf(rowId);
    if (startIdx === -1 || currentIdx === -1) return;
    const minIdx = Math.min(startIdx, currentIdx);
    const maxIdx = Math.max(startIdx, currentIdx);
    const selected = new Set(allRowIds.slice(minIdx, maxIdx + 1));
    setDragSelectedRows(selected);
  }, [isDragSelecting, allRowIds]);

  useEffect(() => {
    const DRAG_THRESHOLD = 8;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (dragPendingRef.current && !isDragSelecting) {
        const { rowId, startX, startY } = dragPendingRef.current;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD) {
          dragStartRowRef.current = rowId;
          setDragSelectedRows(new Set([rowId]));
          setIsDragSelecting(true);
        }
      }
      if (isDragSelecting) {
        const container = tableContainerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const scrollThreshold = 40;
        if (e.clientY < rect.top + scrollThreshold) {
          container.scrollTop -= 8;
        } else if (e.clientY > rect.bottom - scrollThreshold) {
          container.scrollTop += 8;
        }
      }
    };

    const handleMouseUp = () => {
      dragPendingRef.current = null;
      if (isDragSelecting) {
        setIsDragSelecting(false);
        dragStartRowRef.current = null;
        if (!didDragRef.current) {
          setDragSelectedRows(new Set());
        }
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragSelecting]);

  const deleteRowAndCleanup = useCallback((original: TableRowData, deletedExecIds: Set<string>) => {
    if (original.isCompanyRow) {
      deleteCompany(original.companyId);
    } else {
      deleteExecutive(original.id);
      deletedExecIds.add(original.id);
      const siblingsLeft = allExecutives.filter(
        e => e.company_id === original.companyId && !deletedExecIds.has(e.id)
      );
      if (siblingsLeft.length === 0) {
        deleteCompany(original.companyId);
      }
    }
  }, [allExecutives, deleteCompany, deleteExecutive]);

  const handleDeleteRow = useCallback((original: TableRowData) => {
    if (window.confirm(`Are you sure you want to delete this record?`)) {
      deleteRowAndCleanup(original, new Set());
      toast.success(`Deleted ${original.name || original.companyName}`);
    }
  }, [deleteRowAndCleanup]);

  const handleDeleteSelected = useCallback(() => {
    const count = dragSelectedRows.size;
    if (count === 0) return;
    if (window.confirm(`Are you sure you want to delete ${count} record${count > 1 ? 's' : ''}?`)) {
      const rows = table.getRowModel().rows;
      const deletedExecIds = new Set<string>();
      dragSelectedRows.forEach(id => {
        const row = rows.find(r => r.original?.id === id);
        if (row?.original) {
          deleteRowAndCleanup(row.original, deletedExecIds);
        }
      });
      setDragSelectedRows(new Set());
      toast.success(`Deleted ${count} record${count > 1 ? 's' : ''}`);
    }
  }, [dragSelectedRows, table, deleteRowAndCleanup]);

  const getRowStyles = (row: Row<TableRowData>) => {
    const original = row.original;
    if (!original) return {};

    const isSelected = selectedCompanyId === original.companyId || selectedExecutiveId === original.id;
    const isDragSelected = dragSelectedRows.has(original.id);

    if (isDragSelected) {
      return {
        backgroundColor: 'hsl(var(--primary) / 0.12)',
        borderLeft: '3px solid hsl(var(--primary))',
      };
    }
    if (isSelected) {
      return {
        backgroundColor: `${original.companyColor}20`,
        borderLeft: `3px solid ${original.companyColor}`,
      };
    }
    return {};
  };

  const isRowSelected = (row: Row<TableRowData>) => {
    const original = row.original;
    if (!original) return false;
    return selectedCompanyId === original.companyId || selectedExecutiveId === original.id;
  };

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex items-center gap-1 p-2 border-b border-border bg-muted/20 flex-wrap shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs" data-testid="button-group-by">
              <Group className="h-3 w-3 mr-1" />
              Group
              {grouping.length > 0 && <span className="ml-1 text-primary">({grouping.join(', ')})</span>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel className="text-xs">Group By</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={grouping.includes('country')}
              onCheckedChange={(checked) => {
                setGrouping(prev => checked ? [...prev, 'country'] : prev.filter(g => g !== 'country'));
                setExpanded(true);
              }}
            >
              Country
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={grouping.includes('companyName')}
              onCheckedChange={(checked) => {
                setGrouping(prev => checked ? [...prev, 'companyName'] : prev.filter(g => g !== 'companyName'));
                setExpanded(true);
              }}
            >
              Company
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { setGrouping([]); setExpanded(true); }}>
              <Minus className="h-3 w-3 mr-1" />
              Clear Groups
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs" data-testid="button-columns-visibility">
              <Columns3 className="h-3 w-3 mr-1" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel className="text-xs">Show/Hide Columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table.getAllLeafColumns().map(column => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
              >
                {typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs" data-testid="button-density">
              <Rows3 className="h-3 w-3 mr-1" />
              Density
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel className="text-xs">Row Density</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={density} onValueChange={(v) => setDensity(v as DensityMode)}>
              <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="comfortable">Comfortable</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="spacious">Spacious</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {grouping.length > 0 && (
          <>
            <div className="h-4 w-px bg-border mx-1" />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setExpanded(true)}
              data-testid="button-expand-all"
            >
              <Maximize2 className="h-3 w-3 mr-1" />
              Expand All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setExpanded({})}
              data-testid="button-collapse-all"
            >
              <Minimize2 className="h-3 w-3 mr-1" />
              Collapse All
            </Button>
          </>
        )}

        <div className="h-4 w-px bg-border mx-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={handleFillSectors}
          disabled={fillingSectors}
          title="AI-infer sectors for companies that don't have one yet"
          data-testid="button-fill-sectors"
        >
          <Wand2 className="h-3 w-3 mr-1" />
          {fillingSectors ? 'Filling…' : 'Fill Sectors'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            setAddCompanyDialogOpen(true);
            resetDialogFields();
          }}
          data-testid="button-add-company"
        >
          <Building2 className="h-3 w-3 mr-1" />
          New Company
        </Button>

        <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
          {table.getRowModel().rows.length} rows
        </span>
      </div>

      <Dialog open={addCompanyDialogOpen} onOpenChange={setAddCompanyDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-add-company">
          <DialogHeader>
            <DialogTitle>Add Company & Executive</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Company Details</div>
              <div className="space-y-3">
                <div className="relative">
                  <Label htmlFor="company-name" className="text-xs font-medium">Company Name *</Label>
                  <Input
                    id="company-name"
                    value={newCompanyName}
                    onChange={(e) => handleCompanyNameChange(e.target.value)}
                    onFocus={() => companySuggestions.length > 0 && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    placeholder="Type to search or create new..."
                    className="mt-1"
                    data-testid="input-company-name"
                    autoFocus
                  />
                  {showSuggestions && companySuggestions.length > 0 && (
                    <div
                      ref={suggestionsRef}
                      className="absolute z-50 mt-1 w-full border border-border rounded-md shadow-lg max-h-48 overflow-auto" style={{ backgroundColor: 'hsl(var(--popover))' }}
                    >
                      {companySuggestions.map((c) => (
                        <button
                          key={c.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between"
                          onMouseDown={(e) => { e.preventDefault(); selectSuggestion(c); }}
                          data-testid={`suggestion-${c.id}`}
                        >
                          <span className="font-medium truncate">{c.name}</span>
                          <span className="text-xs text-muted-foreground ml-2 shrink-0">
                            {c.hq_country !== 'Unknown' ? c.hq_country : ''}
                            {c.revenue_usd > 0 ? ` · ${formatRevenue(c.revenue_usd)}` : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {matchedCompany && (
                    <div className="mt-2 p-2 bg-muted/30 rounded-md text-xs space-y-0.5">
                      <div className="text-muted-foreground">Existing company data will be auto-filled:</div>
                      <div>Country: <span className="font-medium">{matchedCompany.hq_country || 'Unknown'}</span></div>
                      <div>Sector: <span className="font-medium">{matchedCompany.industry || 'Unknown'}</span></div>
                      {matchedCompany.revenue_usd > 0 && <div>Revenue: <span className="font-medium">{formatRevenue(matchedCompany.revenue_usd)}</span></div>}
                      {matchedCompany.employees > 0 && <div>Employees: <span className="font-medium">{formatEmployees(matchedCompany.employees)}</span></div>}
                    </div>
                  )}
                </div>
                {!matchedCompany && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="relative" ref={countryDropdownRef}>
                        <Label htmlFor="company-country" className="text-xs font-medium">Country</Label>
                        <Input
                          id="company-country"
                          value={newCompanyCountry}
                          onChange={(e) => {
                            setNewCompanyCountry(e.target.value);
                            setCountryDropdownOpen(true);
                          }}
                          onFocus={() => setCountryDropdownOpen(true)}
                          placeholder="Search country..."
                          className="mt-1"
                          autoComplete="off"
                          data-testid="input-company-country"
                        />
                        {countryDropdownOpen && newCompanyCountry.length > 0 && (
                          <div className="absolute z-50 w-full mt-1 border border-border rounded-md shadow-lg max-h-40 overflow-auto" style={{ backgroundColor: 'hsl(var(--popover))' }}>
                            {COUNTRIES.filter(c =>
                              c.toLowerCase().includes(newCompanyCountry.toLowerCase())
                            ).slice(0, 10).map(country => (
                              <button
                                key={country}
                                type="button"
                                onClick={() => {
                                  setNewCompanyCountry(country);
                                  setCountryDropdownOpen(false);
                                }}
                                className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                              >
                                {country}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {columnVisibility.sector !== false && (
                        <div>
                          <Label className="text-xs font-medium">Sector</Label>
                          <SectorPickerButton value={newSector} onChange={setNewSector} className="mt-1" />
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="company-revenue" className="text-xs font-medium">Revenue (USD)</Label>
                        <Input
                          id="company-revenue"
                          value={newRevenue}
                          onChange={(e) => setNewRevenue(e.target.value)}
                          placeholder="e.g. 500M, 1.2B"
                          className="mt-1"
                          data-testid="input-company-revenue"
                        />
                      </div>
                      <div>
                        <Label htmlFor="company-employees" className="text-xs font-medium">Employees</Label>
                        <Input
                          id="company-employees"
                          value={newEmployees}
                          onChange={(e) => setNewEmployees(e.target.value)}
                          placeholder="e.g. 5000"
                          className="mt-1"
                          data-testid="input-company-employees"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="border-t border-border/40 pt-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Executive Details</div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="exec-name" className="text-xs font-medium">Name</Label>
                    <Input
                      id="exec-name"
                      value={newExecName}
                      onChange={(e) => setNewExecName(e.target.value)}
                      placeholder="e.g. John Smith"
                      className="mt-1"
                      data-testid="input-exec-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="exec-title" className="text-xs font-medium">Title</Label>
                    <Input
                      id="exec-title"
                      value={newExecTitle}
                      onChange={(e) => setNewExecTitle(e.target.value)}
                      placeholder="e.g. CEO, CFO"
                      className="mt-1"
                      data-testid="input-exec-title"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {columnVisibility.level !== false && (
                    <div>
                      <Label htmlFor="exec-level" className="text-xs font-medium">Level</Label>
                      <select
                        id="exec-level"
                        value={newLevel}
                        onChange={(e) => setNewLevel(e.target.value)}
                        className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        data-testid="select-exec-level"
                      >
                        <option value="">Select level...</option>
                        <option value="Board">Board</option>
                        <option value="C-Suite">C-Suite</option>
                        <option value="N-1">N-1</option>
                        <option value="N-2">N-2</option>
                      </select>
                    </div>
                  )}
                  {columnVisibility.availability !== false && (
                    <div>
                      <Label htmlFor="exec-status" className="text-xs font-medium">Status</Label>
                      <select
                        id="exec-status"
                        value={newAvailability}
                        onChange={(e) => setNewAvailability(e.target.value)}
                        className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        data-testid="select-exec-status"
                      >
                        <option value="">Select status...</option>
                        <option value="Interested">Interested</option>
                        <option value="Not Interested">Not Interested</option>
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  <Label htmlFor="exec-notes" className="text-xs font-medium">Notes</Label>
                  <Input
                    id="exec-notes"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="Any notes about the executive"
                    className="mt-1"
                    data-testid="input-exec-notes"
                  />
                </div>
              </div>
            </div>

            {(columnVisibility.email !== false || columnVisibility.phone !== false || columnVisibility.linkedin !== false) && (
              <div className="border-t border-border/40 pt-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Contact Info</div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {columnVisibility.email !== false && (
                      <div>
                        <Label htmlFor="exec-email" className="text-xs font-medium">Email</Label>
                        <Input
                          id="exec-email"
                          type="email"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                          placeholder="john@example.com"
                          className="mt-1"
                          data-testid="input-exec-email"
                        />
                      </div>
                    )}
                    {columnVisibility.phone !== false && (
                      <div>
                        <Label htmlFor="exec-phone" className="text-xs font-medium">Phone</Label>
                        <Input
                          id="exec-phone"
                          value={newPhone}
                          onChange={(e) => setNewPhone(e.target.value)}
                          placeholder="+971 50 123 4567"
                          className="mt-1"
                          data-testid="input-exec-phone"
                        />
                      </div>
                    )}
                  </div>
                  {columnVisibility.linkedin !== false && (
                    <div>
                      <Label htmlFor="exec-linkedin" className="text-xs font-medium">LinkedIn</Label>
                      <Input
                        id="exec-linkedin"
                        value={newLinkedin}
                        onChange={(e) => setNewLinkedin(e.target.value)}
                        placeholder="linkedin.com/in/username"
                        className="mt-1"
                        data-testid="input-exec-linkedin"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {columnVisibility.remunerationNotes !== false && (
              <div className="border-t border-border/40 pt-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Compensation</div>
                <div className="space-y-3">
                  {columnVisibility.remunerationNotes !== false && (
                    <div>
                      <Label htmlFor="exec-remuneration" className="text-xs font-medium">Remuneration Notes</Label>
                      <Input
                        id="exec-remuneration"
                        value={newRemunerationNotes}
                        onChange={(e) => setNewRemunerationNotes(e.target.value)}
                        placeholder="e.g. Base 200k, Bonus 50k"
                        className="mt-1"
                        data-testid="input-exec-remuneration"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddCompanyDialogOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleAddCompanySubmit}
              disabled={!newCompanyName.trim() || isSubmitting}
              data-testid="button-submit-add-company"
            >
              {isSubmitting ? 'Adding...' : matchedCompany ? 'Add Executive' : 'Create Company'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div
        ref={tableContainerRef}
        className="flex-1 overflow-auto relative"
        style={{ userSelect: isDragSelecting ? 'none' : 'auto' }}
      >
        <table
          className="text-xs border-collapse"
          style={{ width: Math.max(table.getTotalSize() + 40, 0), minWidth: '100%' }}
        >
          <thead className="sticky top-0 z-20 bg-background shadow-[0_1px_3px_rgba(0,0,0,0.2)]">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <ResizableHeader
                    key={header.id}
                    header={header}
                    density={density}
                    onDragStart={handleColumnDragStart}
                    onDragOver={handleColumnDragOver}
                    onDrop={handleColumnDrop}
                    isDragTarget={dragTargetColumnId === header.column.id}
                  />
                ))}
                <th className="w-10 bg-background sticky right-0 z-30 border-l border-border/40" />
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, rowIndex) => {
              const isGrouped = row.getIsGrouped();
              const original = row.original;
              const selected = !isGrouped && isRowSelected(row);
              const style = !isGrouped ? getRowStyles(row) : {};
              const isDragSelected = original ? dragSelectedRows.has(original.id) : false;
              const isFormerExec = original && !original.isCompanyRow && /\b(ex|former|fmr|prev|past)\b/i.test(original.title || '');
              const isExecExcluded = !isFormerExec && original && (original.availability === 'Out of Scope' || original.availability === 'Off-Limits' || original.availability === 'Not Interested');
              const isCompanyOffLimits = !isFormerExec && original && original.companyStatus === 'Off-Limits';
              const isExcluded = !isGrouped && (isExecExcluded || isCompanyOffLimits);

              return (
                <tr
                  key={row.id}
                  className={`border-b border-border/20 transition-colors group/row
                    ${isGrouped ? 'bg-muted/30 font-medium cursor-pointer' : 'cursor-pointer'}
                    ${!selected && !isDragSelected ? 'hover:bg-muted/20' : ''}
                    ${rowIndex % 2 === 0 && !selected && !isDragSelected && !isGrouped ? 'bg-background' : ''}
                    ${rowIndex % 2 === 1 && !selected && !isDragSelected && !isGrouped ? 'bg-muted/10' : ''}
                    ${isExcluded ? 'opacity-40' : ''}
                  `}
                  style={style}
                  onMouseDown={(e) => {
                    if (!isGrouped && original) {
                      handleDragSelectStart(original.id, e);
                    }
                  }}
                  onMouseEnter={() => {
                    if (!isGrouped && original) {
                      handleDragSelectMove(original.id);
                    }
                  }}
                  onClick={() => {
                    if (isGrouped) {
                      row.toggleExpanded();
                    } else if (original && !didDragRef.current) {
                      setDragSelectedRows(new Set());
                    }
                  }}
                  data-testid={original ? `table-row-${original.id}` : `table-group-${row.id}`}
                >
                  {row.getVisibleCells().map(cell => {
                    const isGroupedCell = cell.getIsGrouped();
                    const isAggregated = cell.getIsAggregated();
                    const isPlaceholder = cell.getIsPlaceholder();

                    return (
                      <td
                        key={cell.id}
                        className={`${densityPadding[density]} border-r border-border/20 max-w-0 overflow-visible ${cell.column.id === 'name' && original ? 'cursor-pointer' : ''}`}
                        style={{ width: cell.column.getSize() }}
                        onDoubleClick={() => {
                          if (cell.column.id === 'name' && original && !isGroupedCell) {
                            onRowClick(original);
                          }
                        }}
                      >
                        {isGroupedCell ? (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        ) : isAggregated ? (
                          flexRender(cell.column.columnDef.aggregatedCell ?? cell.column.columnDef.cell, cell.getContext())
                        ) : isPlaceholder ? null : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        )}
                      </td>
                    );
                  })}
                  <td className="w-10 sticky right-0 z-10 bg-inherit border-l border-border/20">
                    {isGrouped && (
                      <button
                        className="w-full flex items-center justify-center p-1 text-muted-foreground hover:text-foreground"
                        onClick={(e) => { e.stopPropagation(); row.toggleExpanded(); }}
                        data-testid={`toggle-group-${row.id}`}
                      >
                        {row.getIsExpanded() ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      </button>
                    )}
                    {!isGrouped && original && (
                      <button
                        data-trash-btn
                        className="w-full flex items-center justify-center p-1 text-muted-foreground/0 group-hover/row:text-muted-foreground hover:!text-destructive transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRow(original);
                        }}
                        data-testid={`delete-row-${original.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {dragSelectedRows.size > 1 && !isDragSelecting && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 bg-destructive text-destructive-foreground shadow-lg rounded-lg px-4 py-2 flex items-center gap-3 animate-in slide-in-from-bottom-2 duration-200">
          <span className="text-sm font-medium">{dragSelectedRows.size} records selected</span>
          <Button
            variant="secondary"
            size="sm"
            className="h-7 text-xs"
            onClick={handleDeleteSelected}
            data-testid="button-delete-selected"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Delete
          </Button>
          <button
            className="ml-1 hover:bg-destructive-foreground/20 rounded p-0.5 transition-colors"
            onClick={() => setDragSelectedRows(new Set())}
            data-testid="button-clear-selection"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
