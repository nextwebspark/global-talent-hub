import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Building2, Users, Trash2 } from 'lucide-react';
import type { TableRowData } from './types';
import { formatRevenue, formatEmployees } from './utils/formatters';

interface MobileCardViewProps {
  data: TableRowData[];
  selectedCompanyId: string | null;
  selectedExecutiveId: string | null;
  onRowClick: (row: TableRowData) => void;
  onDeleteCompany: (companyId: string) => void;
  onDeleteExecutive: (executiveId: string) => void;
}

interface CompanyGroup {
  company: TableRowData;
  executives: TableRowData[];
}

/**
 * Card/stacked rendering of the company+executive table for narrow (mobile) screens.
 * Read-only display with tap-to-open detail; the wide TanStack table is desktop-only.
 */
export function MobileCardView({
  data, selectedCompanyId, selectedExecutiveId, onRowClick, onDeleteCompany, onDeleteExecutive,
}: MobileCardViewProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Group flat rows into companies + their executives, preserving order.
  const groups = useMemo<CompanyGroup[]>(() => {
    const byId = new Map<string, CompanyGroup>();
    const order: string[] = [];
    for (const row of data) {
      const key = row.companyId || row.id;
      if (row.isCompanyRow) {
        if (!byId.has(key)) { byId.set(key, { company: row, executives: [] }); order.push(key); }
        else byId.get(key)!.company = row;
      } else {
        if (!byId.has(key)) { byId.set(key, { company: { ...row, companyName: row.companyName, isCompanyRow: true }, executives: [] }); order.push(key); }
        byId.get(key)!.executives.push(row);
      }
    }
    return order.map(k => byId.get(k)!);
  }, [data]);

  const toggle = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
      {groups.map(({ company, executives }) => {
        const key = company.companyId || company.id;
        const isOpen = expanded[key];
        const isSelected = selectedCompanyId === key;
        return (
          <div key={key} className={`rounded-lg border bg-card overflow-hidden ${isSelected ? 'border-primary ring-1 ring-primary' : 'border-border'}`}>
            <div className="flex items-start gap-2 p-3">
              <button
                onClick={() => toggle(key)}
                className="mt-0.5 p-1 -ml-1 rounded hover:bg-muted text-muted-foreground shrink-0"
                aria-label={isOpen ? 'Collapse' : 'Expand'}
                disabled={executives.length === 0}
              >
                {executives.length === 0
                  ? <Building2 className="w-4 h-4" />
                  : isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              <button onClick={() => onRowClick(company)} className="min-w-0 flex-1 text-left">
                <p className="text-sm font-semibold text-foreground leading-tight truncate">{company.companyName || company.name || 'Unnamed'}</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1.5">
                  <Field label="Country" value={company.country || '—'} />
                  <Field label="Sector" value={company.sector || '—'} />
                  <Field label="Revenue" value={formatRevenue(company.revenue)} />
                  <Field label="Employees" value={formatEmployees(company.employees)} />
                </div>
                <div className="flex items-center gap-1 mt-1.5 text-[11px] text-muted-foreground">
                  <Users className="w-3 h-3" />{executives.length} exec{executives.length === 1 ? '' : 's'}
                </div>
              </button>
              <button
                onClick={() => onDeleteCompany(key)}
                className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0"
                aria-label="Delete company"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {isOpen && executives.length > 0 && (
              <div className="border-t border-border bg-muted/20 divide-y divide-border/60">
                {executives.map(exec => {
                  const execSelected = selectedExecutiveId === exec.id;
                  return (
                    <div key={exec.id} className={`flex items-start gap-2 px-3 py-2.5 ${execSelected ? 'bg-primary/5' : ''}`}>
                      <button onClick={() => onRowClick(exec)} className="min-w-0 flex-1 text-left">
                        <p className="text-[13px] font-medium text-foreground leading-tight truncate">{exec.name || 'Unnamed'}</p>
                        {exec.title && <p className="text-[11px] text-muted-foreground truncate">{exec.title}</p>}
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1">
                          {exec.email && <Field label="Email" value={exec.email} />}
                          {exec.level && <Field label="Level" value={exec.level} />}
                          {exec.availability && <Field label="Status" value={exec.availability} />}
                        </div>
                      </button>
                      <button
                        onClick={() => onDeleteExecutive(exec.id)}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0"
                        aria-label="Delete executive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {groups.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Building2 className="w-5 h-5" />
          <p className="text-xs">No companies yet</p>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 min-w-0">
      <span className="text-[10px] text-muted-foreground/70 shrink-0">{label}</span>
      <span className="text-[11px] text-foreground truncate">{value}</span>
    </div>
  );
}
