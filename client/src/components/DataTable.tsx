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
  ArrowUpDown, ArrowUp, ArrowDown, GripVertical,
  Columns3, Group, ChevronRight, ChevronDown,
  Rows3, Maximize2, Minimize2, Eye, EyeOff,
  Settings2, Minus, Trash2,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { toast } from 'sonner';

export interface TableRowData {
  id: string;
  country: string;
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

function DraggableHeader({ header, onDragStart, onDragOver, onDrop, onDragEnd, isDragging, isDropTarget, density }: {
  header: Header<TableRowData, unknown>;
  onDragStart: (e: React.DragEvent, headerId: string) => void;
  onDragOver: (e: React.DragEvent, headerId: string) => void;
  onDrop: (e: React.DragEvent, headerId: string) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  isDropTarget: boolean;
  density: DensityMode;
}) {
  const resizeHandler = header.getResizeHandler();

  return (
    <th
      key={header.id}
      className={`relative select-none text-left font-medium text-xs whitespace-nowrap border-r border-border/40 bg-muted/50 group
        ${isDragging ? 'opacity-50' : ''}
        ${isDropTarget ? 'bg-primary/10 border-l-2 border-l-primary' : ''}
        ${header.column.getCanSort() ? 'cursor-pointer hover:bg-muted/70' : ''}
      `}
      style={{ width: header.getSize(), minWidth: 60 }}
      draggable={!header.column.getIsGrouped()}
      onDragStart={(e) => onDragStart(e, header.id)}
      onDragOver={(e) => onDragOver(e, header.id)}
      onDrop={(e) => onDrop(e, header.id)}
      onDragEnd={onDragEnd}
      data-testid={`th-${header.id}`}
    >
      <div
        className={`flex items-center gap-1 ${densityPadding[density]}`}
        onClick={header.column.getToggleSortingHandler()}
      >
        <GripVertical className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 cursor-grab" />
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
          onMouseDown={resizeHandler}
          onTouchStart={resizeHandler}
          onDoubleClick={() => header.column.resetSize()}
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize select-none touch-none 
            hover:bg-primary/60 active:bg-primary
            ${header.column.getIsResizing() ? 'bg-primary w-0.5' : ''}
          `}
          data-testid={`resize-${header.id}`}
        />
      )}
    </th>
  );
}

export default function DataTable({ data, selectedCompanyId, selectedExecutiveId, onRowClick }: DataTableProps) {
  const { deleteCompany, deleteExecutive } = useAppStore();
  const [sorting, setSorting] = useState<SortingState>([{ id: 'country', desc: false }]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    email: false,
    phone: false,
    linkedin: false,
    careerSummary: false,
    remunerationNotes: false,
    availability: false,
  });
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([]);
  const [grouping, setGrouping] = useState<GroupingState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>(true);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [density, setDensity] = useState<DensityMode>('comfortable');
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [rowHighlights, setRowHighlights] = useState<Record<string, string>>({});

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

  const textCell = (info: any) => <span className="truncate block" title={info.getValue()}>{info.getValue() || '-'}</span>;

  const groupedCell = (info: any) => {
    if (info.row.getIsGrouped() && info.column.getIsGrouped()) {
      return (
        <span className="font-semibold flex items-center gap-1">
          {info.row.getIsExpanded() ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {info.getValue()} ({info.row.subRows.length})
        </span>
      );
    }
    return <span className="truncate block" title={info.getValue()}>{info.getValue() || '-'}</span>;
  };

  const columns = useMemo(() => {
    const cols = [
      columnHelper.accessor('country', {
        header: 'Country',
        cell: groupedCell,
        size: 100,
        enableGrouping: true,
      }),
      columnHelper.accessor('companyName', {
        header: 'Company',
        cell: (info) => {
          if (info.row.getIsGrouped() && info.column.getIsGrouped()) {
            return (
              <span className="font-semibold flex items-center gap-1">
                {info.row.getIsExpanded() ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {info.getValue()} ({info.row.subRows.length})
              </span>
            );
          }
          const color = info.row.original?.companyColor || '#1e3a8a';
          return (
            <span className="truncate block" title={info.getValue()}>
              <span className="inline-block w-2 h-2 rounded-full mr-1.5 shrink-0" style={{ backgroundColor: color }} />
              {info.getValue()}
            </span>
          );
        },
        size: 140,
        enableGrouping: true,
      }),
      columnHelper.accessor('name', { header: 'Executive', cell: textCell, size: 130, enableGrouping: false }),
      columnHelper.accessor('title', { header: 'Title', cell: textCell, size: 140, enableGrouping: false }),
      columnHelper.accessor('notes', { header: 'Notes', cell: textCell, size: 120, enableGrouping: false }),
      columnHelper.accessor('email', { header: 'Email', cell: textCell, size: 160, enableGrouping: false }),
      columnHelper.accessor('phone', { header: 'Phone', cell: textCell, size: 120, enableGrouping: false }),
      columnHelper.accessor('linkedin', { header: 'LinkedIn', cell: textCell, size: 160, enableGrouping: false }),
      columnHelper.accessor('careerSummary', { header: 'Career Summary', cell: textCell, size: 180, enableGrouping: false }),
      columnHelper.accessor('remunerationNotes', { header: 'Remuneration', cell: textCell, size: 140, enableGrouping: false }),
      columnHelper.accessor('availability', { header: 'Availability', cell: textCell, size: 120, enableGrouping: false }),
    ];

    customFieldKeys.forEach(key => {
      cols.push(
        columnHelper.accessor(
          (row) => row.customFields?.[key] || '',
          {
            id: `custom_${key}`,
            header: key,
            cell: textCell,
            size: 120,
            enableGrouping: false,
          }
        ) as any
      );
    });

    return cols;
  }, [customFieldKeys]);

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

  const handleDragStart = useCallback((e: React.DragEvent, headerId: string) => {
    setDraggedColumn(headerId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', headerId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, headerId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (headerId !== draggedColumn) {
      setDropTarget(headerId);
    }
  }, [draggedColumn]);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    if (sourceId && sourceId !== targetId) {
      const newOrder = [...columnOrder];
      const sourceIndex = newOrder.indexOf(sourceId);
      const targetIndex = newOrder.indexOf(targetId);
      if (sourceIndex !== -1 && targetIndex !== -1) {
        newOrder.splice(sourceIndex, 1);
        newOrder.splice(targetIndex, 0, sourceId);
        setColumnOrder(newOrder);
      }
    }
    setDraggedColumn(null);
    setDropTarget(null);
  }, [columnOrder]);

  const handleDragEnd = useCallback(() => {
    setDraggedColumn(null);
    setDropTarget(null);
  }, []);

  const handleRowHighlight = useCallback((rowId: string, color: string) => {
    setRowHighlights(prev => {
      const next = { ...prev };
      if (next[rowId] === color) {
        delete next[rowId];
      } else {
        next[rowId] = color;
      }
      return next;
    });
  }, []);

  const highlightColors = [
    { name: 'Yellow', value: '#fef9c3' },
    { name: 'Green', value: '#dcfce7' },
    { name: 'Blue', value: '#dbeafe' },
    { name: 'Red', value: '#fecaca' },
    { name: 'Purple', value: '#f3e8ff' },
    { name: 'Orange', value: '#ffedd5' },
  ];

  const getRowStyles = (row: Row<TableRowData>) => {
    const original = row.original;
    if (!original) return {};
    
    const isSelected = selectedCompanyId === original.companyId || selectedExecutiveId === original.id;
    const highlightColor = rowHighlights[original.id];
    
    if (isSelected) {
      return {
        backgroundColor: `${original.companyColor}20`,
        borderLeft: `3px solid ${original.companyColor}`,
      };
    }
    if (highlightColor) {
      return {
        backgroundColor: highlightColor,
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
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 p-2 border-b border-border bg-muted/20 flex-wrap">
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

        <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
          {table.getRowModel().rows.length} rows
        </span>
      </div>

      <div ref={tableContainerRef} className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse" style={{ width: table.getTotalSize() }}>
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <DraggableHeader
                    key={header.id}
                    header={header}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                    isDragging={draggedColumn === header.id}
                    isDropTarget={dropTarget === header.id}
                    density={density}
                  />
                ))}
                <th className="w-8 bg-muted/50 border-b border-border/40" />
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, rowIndex) => {
              const isGrouped = row.getIsGrouped();
              const original = row.original;
              const selected = !isGrouped && isRowSelected(row);
              const style = !isGrouped ? getRowStyles(row) : {};
              const highlightColor = original ? rowHighlights[original.id] : undefined;

              return (
                <tr
                  key={row.id}
                  className={`border-b border-border/20 transition-colors
                    ${isGrouped ? 'bg-muted/30 font-medium cursor-pointer' : 'cursor-pointer'}
                    ${selected ? '' : 'hover:bg-muted/20'}
                    ${rowIndex % 2 === 0 && !selected && !highlightColor && !isGrouped ? 'bg-background' : ''}
                    ${rowIndex % 2 === 1 && !selected && !highlightColor && !isGrouped ? 'bg-muted/10' : ''}
                  `}
                  style={style}
                  onClick={() => {
                    if (isGrouped) {
                      row.toggleExpanded();
                    } else if (original) {
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
                  <td className="w-8 border-r border-border/20">
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="w-full flex items-center justify-center opacity-0 hover:opacity-100 focus:opacity-100 group-hover:opacity-100 transition-opacity p-1"
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`row-actions-${original.id}`}
                          >
                            <div className={`w-3 h-3 rounded-sm border border-border/60 ${highlightColor ? '' : 'bg-transparent'}`} style={highlightColor ? { backgroundColor: highlightColor } : {}} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuLabel className="text-xs">Highlight Row</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <div className="flex gap-1 px-2 py-1">
                            {highlightColors.map(color => (
                              <button
                                key={color.value}
                                className={`w-5 h-5 rounded-sm border transition-all ${highlightColor === color.value ? 'border-primary ring-1 ring-primary scale-110' : 'border-border/60 hover:scale-110'}`}
                                style={{ backgroundColor: color.value }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRowHighlight(original.id, color.value);
                                }}
                                title={color.name}
                                data-testid={`highlight-${color.name.toLowerCase()}-${original.id}`}
                              />
                            ))}
                          </div>
                          {highlightColor && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                data-testid={`clear-highlight-${original.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRowHighlights(prev => {
                                    const next = { ...prev };
                                    delete next[original.id];
                                    return next;
                                  });
                                }}
                              >
                                <Minus className="h-3 w-3 mr-1" />
                                Clear Highlight
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          {!original.isCompanyRow && (
                            <DropdownMenuItem
                              data-testid={`delete-executive-${original.id}`}
                              className="text-destructive focus:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteExecutive(original.id);
                                toast.success(`Deleted ${original.name || 'executive'}`);
                              }}
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              Delete Executive
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            data-testid={`delete-company-${original.id}`}
                            className="text-destructive focus:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteCompany(original.companyId);
                              toast.success(`Deleted ${original.companyName}`);
                            }}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Delete Company
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
