import { useEffect, useState, useMemo } from 'react';
import { Command } from 'cmdk';
import { useAppStore } from '@/lib/store';
import { Building2, User, Search, Map, Table2, LayoutDashboard, ArrowRight, Hash } from 'lucide-react';

/** Shared command palette — mounted once at the app root, opened from any screen via
 *  the store's commandPaletteOpen flag (Sidebar search icon / Ctrl+K). Navigation items
 *  only appear when a project is loaded (currentProject), since they switch dashboard views. */
export default function CommandPalette() {
  const {
    companies, executives, selectCompany, selectExecutive,
    commandPaletteOpen: isOpen, setCommandPaletteOpen,
    currentProject, setDashboardView,
  } = useAppStore();
  const onClose = () => setCommandPaletteOpen(false);
  const showNav = !!currentProject;
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isOpen) setSearch('');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const filteredCompanies = useMemo(() => {
    if (!search.trim()) return companies.slice(0, 8);
    const q = search.toLowerCase();
    return companies.filter(c => c.name.toLowerCase().includes(q) || c.hq_country?.toLowerCase().includes(q)).slice(0, 8);
  }, [companies, search]);

  const filteredExecutives = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return executives.filter(e => e.name.toLowerCase().includes(q) || e.title?.toLowerCase().includes(q)).slice(0, 6);
  }, [executives, search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative flex items-start justify-center pt-[20vh]">
        <div
          className="w-full max-w-lg bg-popover border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          onClick={e => e.stopPropagation()}
        >
          <Command shouldFilter={false} className="bg-transparent">
            <div className="flex items-center border-b border-border px-3">
              <Search className="w-4 h-4 text-muted-foreground shrink-0 mr-2" />
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder="Search companies, executives, or type a command..."
                className="flex-1 h-11 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                autoFocus
                data-testid="command-palette-input"
              />
              <kbd className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 font-mono">ESC</kbd>
            </div>

            <Command.List className="max-h-[320px] overflow-y-auto p-1.5">
              <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
                No results found.
              </Command.Empty>

              {!search.trim() && showNav && (
                <Command.Group heading="Navigation" className="px-1 pb-1">
                  <PaletteItem icon={Map} label="Map View" shortcut="1" onSelect={() => { setDashboardView('map'); onClose(); }} />
                  <PaletteItem icon={Table2} label="Table View" shortcut="2" onSelect={() => { setDashboardView('table'); onClose(); }} />
                  <PaletteItem icon={LayoutDashboard} label="Dashboard" shortcut="3" onSelect={() => { setDashboardView('dashboard'); onClose(); }} />
                </Command.Group>
              )}

              {filteredCompanies.length > 0 && (
                <Command.Group heading="Companies" className="px-1 pb-1">
                  {filteredCompanies.map(company => (
                    <PaletteItem
                      key={company.id}
                      icon={Building2}
                      label={company.name}
                      subtitle={`${company.hq_country}${company.revenue_usd ? ` · $${(company.revenue_usd / 1e9).toFixed(1)}B` : ''}`}
                      onSelect={() => {
                        selectCompany(company.id);
                        onClose();
                      }}
                    />
                  ))}
                </Command.Group>
              )}

              {filteredExecutives.length > 0 && (
                <Command.Group heading="Executives" className="px-1 pb-1">
                  {filteredExecutives.map(exec => {
                    const company = companies.find(c => c.id === exec.company_id);
                    return (
                      <PaletteItem
                        key={exec.id}
                        icon={User}
                        label={exec.name}
                        subtitle={`${exec.title}${company ? ` · ${company.name}` : ''}`}
                        onSelect={() => {
                          selectExecutive(exec.id, exec.company_id);
                          onClose();
                        }}
                      />
                    );
                  })}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </div>
      </div>
    </div>
  );
}

function PaletteItem({ icon: Icon, label, subtitle, shortcut, onSelect }: {
  icon: any;
  label: string;
  subtitle?: string;
  shortcut?: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm cursor-pointer transition-colors data-[selected=true]:bg-accent/10 data-[selected=true]:text-foreground text-foreground/80 hover:bg-accent/10"
    >
      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium text-[13px]">{label}</div>
        {subtitle && <div className="text-xs text-muted-foreground truncate">{subtitle}</div>}
      </div>
      {shortcut && <kbd className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 font-mono shrink-0">{shortcut}</kbd>}
      <ArrowRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
    </Command.Item>
  );
}
