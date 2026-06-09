import { Map, Table2, Search, Home, LayoutDashboard, FolderOpen, Sun, Moon, LogOut, Settings } from 'lucide-react';
import { useLocation } from 'wouter';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useAppStore } from '@/lib/store';
import { useAuth } from '@/lib/auth';

export type ViewMode = 'map' | 'table' | 'dashboard';

interface SidebarProps {
  activeView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  onHome: () => void;
  onImport?: () => void;
  onProjects?: () => void;
  isProjectsOpen?: boolean;
  /** When false, the map/table/dashboard nav icons render disabled (no project open). */
  projectOpen?: boolean;
  /** Optional theme control. When omitted, the theme button renders inert. */
  isDark?: boolean;
  onToggleTheme?: () => void;
  /** Controlled open state for the mobile drawer (Sheet). Desktop rail ignores it. */
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
}

export default function Sidebar({ activeView, onViewChange, onHome, onProjects, isProjectsOpen, projectOpen = true, isDark, onToggleTheme, mobileOpen = false, onMobileOpenChange }: SidebarProps) {
  const setCommandPaletteOpen = useAppStore(s => s.setCommandPaletteOpen);
  const { signOut, profile, session } = useAuth();
  const [, navigate] = useLocation();
  const displayName = profile?.fullName || session?.user.email || '';
  const initials = displayName ? displayName.slice(0, 2).toUpperCase() : 'GT';
  const navItems = [
    { id: 'map' as const, icon: Map, label: 'Map View', shortcut: '1' },
    { id: 'table' as const, icon: Table2, label: 'Table View', shortcut: '2' },
    { id: 'dashboard' as const, icon: LayoutDashboard, label: 'Dashboard', shortcut: '3' },
  ];

  const closeMobile = () => onMobileOpenChange?.(false);

  // Rail body — shared between the desktop rail and the mobile Sheet drawer.
  // `mobile` widens tap targets to >=44px without affecting the 32px desktop icons.
  const railBody = (mobile: boolean) => (
    <>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => { onHome(); closeMobile(); }}
              className={`${mobile ? 'w-11 h-11' : 'w-8 h-8'} rounded-lg flex items-center justify-center mb-4 hover:bg-sidebar-accent transition-colors text-sidebar-foreground/60 hover:text-sidebar-foreground`}
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
              onClick={() => { setCommandPaletteOpen(true); closeMobile(); }}
              className={`${mobile ? 'w-11 h-11' : 'w-8 h-8'} rounded-lg flex items-center justify-center mb-1 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors`}
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
              onClick={() => { onProjects?.(); closeMobile(); }}
              className={`${mobile ? 'w-11 h-11' : 'w-8 h-8'} rounded-lg flex items-center justify-center mb-3 transition-colors ${
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
          const isActive = projectOpen && activeView === item.id;
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => { if (projectOpen) { onViewChange(item.id); closeMobile(); } }}
                  disabled={!projectOpen}
                  className={`${mobile ? 'w-11 h-11' : 'w-8 h-8'} rounded-lg flex items-center justify-center mb-1 transition-all ${
                    !projectOpen
                      ? 'text-sidebar-foreground/30 cursor-default'
                      : isActive
                        ? 'bg-sidebar-accent text-sidebar-foreground shadow-sm'
                        : 'text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                  }`}
                  data-testid={`sidebar-${item.id}`}
                >
                  <item.icon className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs flex items-center gap-2">
                {projectOpen ? (
                  <>{item.label} <kbd className="px-1.5 py-0.5 text-[10px] bg-muted rounded font-mono">{item.shortcut}</kbd></>
                ) : (
                  <>{item.label} — open a project first</>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}

        <div className="flex-1" />

        {/* Account avatar — opens Settings */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => { navigate('/settings'); closeMobile(); }}
              className={`${mobile ? 'w-10 h-10' : 'w-7 h-7'} rounded-full flex items-center justify-center text-[10px] font-semibold bg-sidebar-accent text-sidebar-foreground mb-2 hover:ring-2 hover:ring-sidebar-accent transition`}
              data-testid="sidebar-settings"
            >
              {initials}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Settings &amp; account</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => { navigate('/settings'); closeMobile(); }}
              className={`${mobile ? 'w-11 h-11' : 'w-8 h-8'} rounded-lg flex items-center justify-center text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors`}
              data-testid="sidebar-settings-gear"
            >
              <Settings className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Settings</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleTheme}
              disabled={!onToggleTheme}
              className={`${mobile ? 'w-11 h-11' : 'w-8 h-8'} rounded-lg flex items-center justify-center transition-colors ${
                onToggleTheme
                  ? 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent'
                  : 'text-sidebar-foreground/40 cursor-default'
              }`}
              data-testid="sidebar-theme"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            {onToggleTheme ? (isDark ? 'Light mode' : 'Dark mode') : 'Theme (coming soon)'}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => { signOut(); closeMobile(); }}
              className={`${mobile ? 'w-11 h-11' : 'w-8 h-8'} rounded-lg flex items-center justify-center text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors`}
              data-testid="sidebar-signout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Sign out</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  );

  return (
    <>
      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent side="left" className="w-16 p-0 md:hidden">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="h-full bg-sidebar flex flex-col items-center py-2 pt-10">
            {railBody(true)}
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop rail */}
      <div className="h-full w-12 bg-sidebar border-r border-sidebar-border hidden md:flex flex-col items-center py-2 shrink-0" data-testid="sidebar">
        {railBody(false)}
      </div>
    </>
  );
}
