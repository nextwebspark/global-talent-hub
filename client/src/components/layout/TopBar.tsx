import { useAppStore } from '@/lib/store';
import { Building2, Users, MapPin, Search, Download, Upload, Zap, Plus, Loader2, ChevronDown, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
}

export default function TopBar({ activeView, onCommandPalette, onExport, onImport, onEnrichAll, onAddCompany, onHome, isEnriching }: TopBarProps) {
  const { currentProject, companies, executives } = useAppStore();

  return (
    <div className="h-11 border-b border-border bg-background flex items-center px-3 gap-2 shrink-0" data-testid="topbar">
      <TooltipProvider delayDuration={300}>
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
          <h1 className="text-sm font-semibold truncate max-w-[300px]" data-testid="topbar-project-name">
            {currentProject?.name || 'Untitled Project'}
          </h1>
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
        </div>
      </TooltipProvider>
    </div>
  );
}
