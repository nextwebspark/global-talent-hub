import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { Building2, Users, MapPin, Search, Download, Upload, Zap, Plus, Loader2, ChevronDown, ArrowLeft, Sun, Moon, Pencil, Eye, EyeOff, Menu, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import type { ViewMode } from './Sidebar';

interface TopBarProps {
  activeView: ViewMode;
  onCommandPalette: () => void;
  onExport: () => void;
  onImport: () => void;
  onEnrichAll: () => void;
  onAddCompany: () => void;
  onHome: () => void;
  isEnriching: boolean;
  /** Opens the mobile nav drawer (hamburger). */
  onMobileNav?: () => void;
}

export default function TopBar({ activeView, onCommandPalette, onExport, onImport, onEnrichAll, onAddCompany, onHome, isEnriching, onMobileNav }: TopBarProps) {
  const { currentProject, companies, executives, renameProject, showAllSatellites, toggleAllSatellites } = useAppStore();
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const startEditing = () => {
    setEditName(currentProject?.name || 'Untitled Project');
    setIsEditing(true);
  };

  const saveProjectName = async () => {
    const trimmed = editName.trim();
    if (!trimmed || !currentProject?.id) {
      setIsEditing(false);
      return;
    }

    if (trimmed === currentProject.name) {
      setIsEditing(false);
      return;
    }

    try {
      const res = await fetch(`/api/search/${currentProject.id}/name`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!res.ok) throw new Error('Failed to rename');

      renameProject(trimmed);
      setIsEditing(false);
    } catch {
      toast.error('Failed to rename project');
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveProjectName();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  return (
    <div className="h-11 border-b border-border bg-background flex items-center px-3 gap-2 shrink-0" data-testid="topbar">
      <TooltipProvider delayDuration={300}>
        <button
          onClick={onMobileNav}
          className="md:hidden p-2 -ml-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          data-testid="topbar-hamburger"
          aria-label="Open navigation"
        >
          <Menu className="w-4 h-4" />
        </button>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onHome}
              className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              data-testid="topbar-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Back to home</TooltipContent>
        </Tooltip>

        <div className="h-4 w-px bg-border mx-1" />

        <div className="flex-1 min-w-0 flex items-center gap-3">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={saveProjectName}
              onKeyDown={handleKeyDown}
              className="text-lg font-bold bg-transparent border-b-2 border-primary outline-none max-w-[140px] sm:max-w-[300px] md:max-w-[500px] w-full px-1 py-0"
              data-testid="topbar-project-name-input"
            />
          ) : (
            <h1
              className="text-lg font-bold truncate max-w-[140px] sm:max-w-[300px] md:max-w-[500px] cursor-pointer hover:text-primary transition-colors group flex items-center gap-1.5"
              onClick={startEditing}
              title="Click to rename project"
              data-testid="topbar-project-name"
            >
              {currentProject?.name || 'Untitled Project'}
              <Pencil className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
            </h1>
          )}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {companies.length}
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {executives.length}
            </span>
          </div>
        </div>

        <button
          onClick={onCommandPalette}
          className="hidden sm:flex items-center gap-2 h-7 px-2.5 rounded-md border border-border bg-muted/50 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          data-testid="topbar-search"
        >
          <Search className="w-3 h-3" />
          <span>Search...</span>
          <kbd className="text-[10px] bg-background rounded px-1 py-0.5 font-mono border border-border">Ctrl+K</kbd>
        </button>

        <div className="h-4 w-px bg-border mx-1 hidden sm:block" />

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onAddCompany}
                className="h-7 w-7 p-0"
                data-testid="topbar-add"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Add company</TooltipContent>
          </Tooltip>

          {/* Full action cluster — desktop only */}
          <div className="hidden md:flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onEnrichAll}
                  disabled={isEnriching || companies.length === 0}
                  className="h-7 w-7 p-0"
                  data-testid="topbar-enrich"
                >
                  {isEnriching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {isEnriching ? 'Enriching...' : 'Enrich all companies'}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onImport}
                  className="h-7 w-7 p-0"
                  data-testid="topbar-import"
                >
                  <Upload className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Import data</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onExport}
                  disabled={companies.length === 0}
                  className="h-7 w-7 p-0"
                  data-testid="topbar-export"
                >
                  <Download className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Export to Excel</TooltipContent>
            </Tooltip>

            {activeView === 'map' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showAllSatellites ? 'default' : 'ghost'}
                    size="sm"
                    onClick={toggleAllSatellites}
                    className="h-7 w-7 p-0"
                    data-testid="topbar-satellites"
                  >
                    {showAllSatellites ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {showAllSatellites ? 'Hide executives' : 'Show executives'}
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsDark(!isDark)}
                  className="h-7 w-7 p-0"
                  data-testid="topbar-theme"
                >
                  {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {isDark ? 'Light mode' : 'Dark mode'}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Overflow menu — mobile only */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 md:hidden" data-testid="topbar-more">
                <MoreVertical className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onEnrichAll} disabled={isEnriching || companies.length === 0}>
                {isEnriching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {isEnriching ? 'Enriching...' : 'Enrich all'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onImport}>
                <Upload className="w-4 h-4" />Import data
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExport} disabled={companies.length === 0}>
                <Download className="w-4 h-4" />Export to Excel
              </DropdownMenuItem>
              {activeView === 'map' && (
                <DropdownMenuItem onClick={toggleAllSatellites}>
                  {showAllSatellites ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {showAllSatellites ? 'Hide executives' : 'Show executives'}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setIsDark(!isDark)}>
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                {isDark ? 'Light mode' : 'Dark mode'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TooltipProvider>
    </div>
  );
}
