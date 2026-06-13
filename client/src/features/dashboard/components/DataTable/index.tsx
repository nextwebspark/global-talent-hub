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
  Columns3, Group, ChevronRight, ChevronDown,
  Rows3, Maximize2, Minimize2,
  Minus, Trash2, X, Building2, Wand2, SlidersHorizontal,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';

import type { TableRowData, DataTableProps } from './types';
import { formatRevenue, formatEmployees, parseRevenueInput } from './utils/formatters';
import {
  STATUS_OPTIONS,
  COMPANY_STATUS_OPTIONS,
  LEVEL_OPTIONS,
  GENDER_OPTIONS,
  ETHNICITY_OPTIONS,
  SECTOR_TAXONOMY,
  ALL_SUB_SECTORS,
  getSectorCategory,
  COUNTRIES,
} from './utils/constants';
import { SelectCell } from './cells/SelectCell';
import { SearchableSelectCell } from './cells/SearchableSelectCell';
import { CompanyAutocompleteCell } from './cells/CompanyAutocompleteCell';
import { EditableCell } from './cells/EditableCell';
import { ResizableHeader, densityPadding, type DensityMode } from './cells/ResizableHeader';
import { AddCompanyDialog } from './AddCompanyDialog';
import { MobileCardView } from './MobileCardView';

export type { TableRowData } from './types';

const columnHelper = createColumnHelper<TableRowData>();

export default function DataTable({ data, selectedCompanyId, selectedExecutiveId, onRowClick }: DataTableProps) {
  const { deleteCompany, deleteExecutive, updateCompany, updateExecutive, executives: allExecutives, currentProject, companies, tableConfig, setTableConfig } = useAppStore();
  const isMobile = useIsMobile();

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

  const handleReassignExec = useCallback(async (execId: string, targetCompanyId: string) => {
    try {
      const res = await fetch(`/api/executives/${execId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: Number(targetCompanyId) }),
      });
      if (!res.ok) throw new Error('Failed to reassign');
      const targetCompany = useAppStore.getState().companies.find(c => c.id === targetCompanyId);
      useAppStore.setState(state => ({
        executives: state.executives.map(e =>
          e.id === execId ? { ...e, company_id: targetCompanyId } : e
        ),
      }));
      toast.success(`Executive reassigned to ${targetCompany?.name || 'company'}`);
    } catch {
      toast.error('Failed to reassign executive');
    }
  }, []);

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
        : (tableRef.current?.getAllLeafColumns().map((c: { id: string }) => c.id) ?? []);
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
          if (row.isCompanyRow) {
            return (
              <span className="flex items-center">
                <span className="inline-block w-2 h-2 rounded-full mr-1.5 shrink-0" style={{ backgroundColor: color }} />
                <EditableCell
                  value={info.getValue() || ''}
                  onSave={(val) => handleCellSave(row, 'companyName', val)}
                />
              </span>
            );
          }
          return (
            <span className="flex items-center">
              <span className="inline-block w-2 h-2 rounded-full mr-1.5 shrink-0" style={{ backgroundColor: color }} />
              <CompanyAutocompleteCell
                value={info.getValue() || ''}
                companyId={row.companyId}
                execId={row.id}
                row={row}
                onRename={(val) => handleCellSave(row, 'companyName', val)}
                onReassign={(targetCompanyId) => handleReassignExec(row.id, targetCompanyId)}
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
        {/* Secondary controls — collapsed on mobile (card view doesn't use grouping/columns/density) */}
        <div className="hidden md:contents">
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
        </div>

        {/* Mobile overflow: grouping/columns/density don't apply to card view, but Fill Sectors does */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs md:hidden" data-testid="button-table-more">
              <SlidersHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={handleFillSectors} disabled={fillingSectors}>
              <Wand2 className="h-4 w-4" />
              {fillingSectors ? 'Filling…' : 'Fill Sectors'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            setAddCompanyDialogOpen(true);
          }}
          data-testid="button-add-company"
        >
          <Building2 className="h-3 w-3 mr-1" />
          <span className="hidden sm:inline">New Company</span>
          <span className="sm:hidden">New</span>
        </Button>

        <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
          {table.getRowModel().rows.length} rows
        </span>
      </div>

      <AddCompanyDialog
        open={addCompanyDialogOpen}
        onOpenChange={setAddCompanyDialogOpen}
        columnVisibility={columnVisibility}
      />

      {isMobile && (
        <MobileCardView
          data={data}
          selectedCompanyId={selectedCompanyId}
          selectedExecutiveId={selectedExecutiveId}
          onRowClick={onRowClick}
          onDeleteCompany={deleteCompany}
          onDeleteExecutive={deleteExecutive}
        />
      )}

      <div
        ref={tableContainerRef}
        className={`flex-1 overflow-auto relative ${isMobile ? 'hidden' : ''}`}
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
        <div style={{ height: '320px' }} aria-hidden="true" />
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
