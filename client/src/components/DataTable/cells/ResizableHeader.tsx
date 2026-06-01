import { flexRender, type Header } from '@tanstack/react-table';
import { ArrowUpDown, ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import type { TableRowData } from '../types';

export type DensityMode = 'compact' | 'comfortable' | 'spacious';

export const densityPadding: Record<DensityMode, string> = {
  compact: 'px-2 py-0.5',
  comfortable: 'px-2 py-1.5',
  spacious: 'px-3 py-2.5',
};

export function ResizableHeader({ header, density, onDragStart, onDragOver, onDrop, isDragTarget }: {
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
