import { Map, Table2, Upload, Search, Settings, Home, Zap, LayoutDashboard, FolderOpen } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type ViewMode = 'map' | 'table' | 'dashboard';

interface SidebarProps {
  activeView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  onCommandPalette: () => void;
  onHome: () => void;
  onImport?: () => void;
  onProjects?: () => void;
  isProjectsOpen?: boolean;
}

export default function Sidebar({ activeView, onViewChange, onCommandPalette, onHome, onImport, onProjects, isProjectsOpen }: SidebarProps) {
  const navItems = [
    { id: 'map' as const, icon: Map, label: 'Map View', shortcut: '1' },
    { id: 'table' as const, icon: Table2, label: 'Table View', shortcut: '2' },
    { id: 'dashboard' as const, icon: LayoutDashboard, label: 'Dashboard', shortcut: '3' },
  ];

  return (
    <div className="h-full w-12 bg-sidebar border-r border-sidebar-border flex flex-col items-center py-2 shrink-0" data-testid="sidebar">
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onHome}
              className="w-8 h-8 rounded-lg flex items-center justify-center mb-4 hover:bg-sidebar-accent transition-colors text-sidebar-foreground/60 hover:text-sidebar-foreground"
              data-testid="sidebar-home"
            >
              <Home className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Home</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onCommandPalette}
              className="w-8 h-8 rounded-lg flex items-center justify-center mb-1 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              data-testid="sidebar-search"
            >
              <Search className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs flex items-center gap-2">
            Search <kbd className="px-1.5 py-0.5 text-[10px] bg-muted rounded font-mono">Ctrl+K</kbd>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onProjects}
              className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 transition-colors ${
                isProjectsOpen
                  ? 'bg-sidebar-accent text-sidebar-foreground shadow-sm'
                  : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent'
              }`}
              data-testid="sidebar-projects"
            >
              <FolderOpen className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Projects</TooltipContent>
        </Tooltip>

        <div className="w-6 h-px bg-sidebar-border mb-3" />

        {navItems.map(item => {
          const isActive = activeView === item.id;
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onViewChange(item.id)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center mb-1 transition-all ${
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-foreground shadow-sm'
                      : 'text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                  }`}
                  data-testid={`sidebar-${item.id}`}
                >
                  <item.icon className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs flex items-center gap-2">
                {item.label} <kbd className="px-1.5 py-0.5 text-[10px] bg-muted rounded font-mono">{item.shortcut}</kbd>
              </TooltipContent>
            </Tooltip>
          );
        })}

        <div className="flex-1" />
      </TooltipProvider>
    </div>
  );
}
