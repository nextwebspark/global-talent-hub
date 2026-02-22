import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
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
  Minus, Trash2, X, Plus, Building2, UserPlus,
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
  careerSummary: string;
  remunerationNotes: string;
  availability: string;
  companyId: string;
  companyName: string;
  companyColor: string;
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

function EditableCell({ value, onSave, isNumeric, formatFn }: {
  value: string;
  onSave: (val: string) => void;
  isNumeric?: boolean;
  formatFn?: (val: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (editValue !== value) {
      onSave(editValue);
    }
  };

  if (editing) {
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
    <span
      className="truncate block cursor-text hover:bg-muted/40 rounded px-0.5 -mx-0.5"
      title={value || undefined}
      onDoubleClick={(e) => { e.stopPropagation(); setEditValue(value); setEditing(true); }}
      data-testid="editable-cell-display"
    >
      {display}
    </span>
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

function ResizableHeader({ header, density }: {
  header: Header<TableRowData, unknown>;
  density: DensityMode;
}) {
  const resizeHandler = header.getResizeHandler();

  return (
    <th
      key={header.id}
      className={`relative select-none text-left font-medium text-xs whitespace-nowrap border-r border-border/40 bg-background group
        ${header.column.getCanSort() ? 'cursor-pointer hover:bg-muted/70' : ''}
      `}
      style={{ width: header.getSize(), minWidth: 60 }}
      data-testid={`th-${header.id}`}
    >
      <div
        className={`flex items-center gap-1 ${densityPadding[density]}`}
        onClick={header.column.getToggleSortingHandler()}
      >
        <span className="truncate">
          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
        </span>
        {header.column.getIsSorted() === 'asc' && <ArrowUp className="h-3 w-3 shrink-0 text-primary" />}
        {header.column.getIsSorted() === 'desc' && <ArrowDown className="h-3 w-3 shrink-0 text-primary" />}
        {!header.column.getIsSorted() && header.column.getCanSort() && (
          <ArrowUpDown className="h-3 w-3 shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground/60" />
        )}
      </div>

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
            ${header.column.getIsResizing() ? 'bg-primary' : 'bg-transparent'}
          `}
          data-testid={`resize-${header.id}`}
        />
      )}
    </th>
  );
}

export default function DataTable({ data, selectedCompanyId, selectedExecutiveId, onRowClick }: DataTableProps) {
  const { deleteCompany, deleteExecutive, updateCompany, updateExecutive, addCompany, addExecutive, executives: allExecutives, currentProject } = useAppStore();
  const [sorting, setSorting] = useState<SortingState>([{ id: 'country', desc: false }]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    sector: false,
    email: false,
    phone: false,
    linkedin: false,
    careerSummary: false,
    remunerationNotes: false,
    availability: false,
  });

  const prevDataCountRef = useRef(0);
  useEffect(() => {
    if (data.length === 0) return;
    const prevCount = prevDataCountRef.current;
    prevDataCountRef.current = data.length;
    if (prevCount > 0 && data.length === prevCount) return;
    const optionalFields = ['sector', 'email', 'phone', 'linkedin', 'careerSummary', 'remunerationNotes', 'availability'] as const;
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
        updateCompany(row.companyId, { industry: value });
      } else if (field === 'revenue') {
        updateCompany(row.companyId, { revenue_usd: parseRevenueInput(value) });
      } else if (field === 'employees') {
        const num = parseInt(value.replace(/[^0-9]/g, ''), 10);
        updateCompany(row.companyId, { employees: isNaN(num) ? 0 : num });
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
      }
    }
  }, [updateCompany, updateExecutive]);

  const handleAddCompany = useCallback(async () => {
    try {
      const searchQueryId = currentProject?.id ? parseInt(currentProject.id) : null;
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Company',
          country: 'Unknown',
          sector: 'Unknown',
          ...(searchQueryId ? { searchQueryId } : {}),
        }),
      });
      if (!res.ok) throw new Error('Failed to create company');
      const company = await res.json();
      addCompany(transformAPICompany(company));
      toast.success('New company added');
    } catch {
      toast.error('Failed to add company');
    }
  }, [addCompany, currentProject]);

  const handleAddExecutive = useCallback(async (companyId?: string) => {
    const targetCompanyId = companyId || (data.length > 0 ? data[0].companyId : null);
    if (!targetCompanyId) {
      toast.error('Create a company first');
      return;
    }
    try {
      const res = await fetch('/api/executives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: parseInt(targetCompanyId),
          name: 'New Executive',
          title: 'Title',
        }),
      });
      if (!res.ok) throw new Error('Failed to create executive');
      const exec = await res.json();
      addExecutive(transformAPIExecutive(exec, targetCompanyId));
      toast.success('New executive added');
    } catch {
      toast.error('Failed to add executive');
    }
  }, [addExecutive, data]);
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([]);
  const [grouping, setGrouping] = useState<GroupingState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>(true);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [density, setDensity] = useState<DensityMode>('comfortable');

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
        cell: editableCell('country'),
        size: 100,
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
        cell: editableCell('sector'),
        size: 120,
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
      columnHelper.accessor('careerSummary', { header: 'Career Summary', cell: editableCell('careerSummary'), size: 180, enableGrouping: false }),
      columnHelper.accessor('remunerationNotes', { header: 'Remuneration', cell: editableCell('remunerationNotes'), size: 140, enableGrouping: false }),
      columnHelper.accessor('availability', { header: 'Availability', cell: editableCell('availability'), size: 120, enableGrouping: false }),
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
    columnResizeMode: 'onEnd',
    enableMultiSort: true,
  });

  const allRowIds = useMemo(() => {
    return table.getRowModel().rows
      .filter(r => !r.getIsGrouped() && r.original)
      .map(r => r.original!.id);
  }, [table.getRowModel().rows]);

  const rowElementsRef = useRef<Map<string, HTMLTableRowElement>>(new Map());

  const didDragRef = useRef(false);

  const handleDragSelectStart = useCallback((rowId: string, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-trash-btn]')) return;
    e.preventDefault();
    setIsDragSelecting(true);
    didDragRef.current = false;
    dragStartRowRef.current = rowId;
    setDragSelectedRows(new Set([rowId]));
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
    if (!isDragSelecting) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const container = tableContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const scrollThreshold = 40;
      if (e.clientY < rect.top + scrollThreshold) {
        container.scrollTop -= 8;
      } else if (e.clientY > rect.bottom - scrollThreshold) {
        container.scrollTop += 8;
      }
    };

    const handleMouseUp = () => {
      setIsDragSelecting(false);
      dragStartRowRef.current = null;
      if (!didDragRef.current) {
        setDragSelectedRows(new Set());
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
          onClick={handleAddCompany}
          data-testid="button-add-company"
        >
          <Building2 className="h-3 w-3 mr-1" />
          New Company
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs" data-testid="button-add-executive">
              <UserPlus className="h-3 w-3 mr-1" />
              New Executive
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-60 overflow-auto">
            <DropdownMenuLabel className="text-xs">Add to Company</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {Array.from(new Set(data.map(r => r.companyId))).map(cid => {
              const companyName = data.find(r => r.companyId === cid)?.companyName || 'Unknown';
              return (
                <DropdownMenuItem key={cid} onClick={() => handleAddExecutive(cid)} data-testid={`add-exec-to-${cid}`}>
                  {companyName}
                </DropdownMenuItem>
              );
            })}
            {data.length === 0 && (
              <DropdownMenuItem disabled>No companies yet</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
          {table.getRowModel().rows.length} rows
        </span>
      </div>

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

              return (
                <tr
                  key={row.id}
                  className={`border-b border-border/20 transition-colors group/row
                    ${isGrouped ? 'bg-muted/30 font-medium cursor-pointer' : 'cursor-pointer'}
                    ${!selected && !isDragSelected ? 'hover:bg-muted/20' : ''}
                    ${rowIndex % 2 === 0 && !selected && !isDragSelected && !isGrouped ? 'bg-background' : ''}
                    ${rowIndex % 2 === 1 && !selected && !isDragSelected && !isGrouped ? 'bg-muted/10' : ''}
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
                      onRowClick(original);
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
                        className={`${densityPadding[density]} border-r border-border/20 max-w-0 overflow-hidden`}
                        style={{ width: cell.column.getSize() }}
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
