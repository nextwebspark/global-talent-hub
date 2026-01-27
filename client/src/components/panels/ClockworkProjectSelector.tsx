import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Loader2, X, Database, Check, Lock, AlertCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';

interface ClockworkProject {
  id: string;
  name: string;
  clientCompany?: string;
  status: 'open' | 'closed' | 'retained' | 'special' | 'unknown';
  type?: string;
  candidateCount?: number;
  restricted?: boolean;
  restrictionReason?: string;
}

interface ClockworkProjectSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (projectId: string) => void;
  currentProjectId?: string | null;
}

function StatusBadge({ status }: { status: ClockworkProject['status'] }) {
  const config = {
    open: { label: 'Open', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
    closed: { label: 'Closed', className: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
    retained: { label: 'Retained', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
    special: { label: 'Special', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
    unknown: { label: 'Unknown', className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' }
  };
  
  const { label, className } = config[status] || config.unknown;
  
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

export default function ClockworkProjectSelector({
  isOpen,
  onClose,
  onSelect,
  currentProjectId
}: ClockworkProjectSelectorProps) {
  const [projects, setProjects] = useState<ClockworkProject[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(currentProjectId || null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchProjects();
    }
  }, [isOpen]);

  useEffect(() => {
    if (currentProjectId) {
      setSelectedId(currentProjectId);
    }
  }, [currentProjectId]);

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/clockwork/projects');
      if (!response.ok) throw new Error('Failed to fetch projects');
      const data = await response.json();
      setProjects(data);
    } catch (error) {
      console.error('Error fetching Clockwork projects:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedId) return;
    setIsSubmitting(true);
    try {
      onSelect(selectedId);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      data-testid="clockwork-project-selector"
    >
      <Card className="w-full max-w-md bg-white dark:bg-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Select Clockwork Project</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="btn-close-selector">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Select a Clockwork project to use for enriching executive data. This project will be used for all enrichment operations on this search.
          </p>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <span className="ml-2 text-gray-600">Loading projects...</span>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 text-amber-500" />
              <p>No Clockwork projects available</p>
              <p className="text-xs mt-2">Check your API credentials or permissions</p>
            </div>
          ) : (
            <TooltipProvider>
              <RadioGroup value={selectedId || ''} onValueChange={(val) => {
                const proj = projects.find(p => p.id === val);
                if (!proj?.restricted) setSelectedId(val);
              }} className="space-y-2 max-h-[400px] overflow-y-auto">
                {projects.map((project) => (
                  <Tooltip key={project.id}>
                    <TooltipTrigger asChild>
                      <div
                        className={`flex items-start p-3 border rounded-lg transition-colors ${
                          project.restricted 
                            ? 'border-gray-300 bg-gray-100 dark:bg-gray-800 opacity-60 cursor-not-allowed'
                            : selectedId === project.id 
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 cursor-pointer' 
                              : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer'
                        }`}
                        onClick={() => !project.restricted && setSelectedId(project.id)}
                        data-testid={`project-option-${project.id}`}
                      >
                        <RadioGroupItem 
                          value={project.id} 
                          id={project.id} 
                          className="mr-3 mt-1" 
                          disabled={project.restricted}
                        />
                        <Label htmlFor={project.id} className="flex-1 cursor-pointer">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{project.name}</span>
                            <StatusBadge status={project.status} />
                            {project.type && (
                              <Badge variant="outline" className="text-xs">
                                {project.type}
                              </Badge>
                            )}
                            {project.restricted && (
                              <Lock className="h-3 w-3 text-gray-400" />
                            )}
                          </div>
                          {project.clientCompany && (
                            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              {project.clientCompany}
                            </div>
                          )}
                          {project.candidateCount !== undefined && project.candidateCount > 0 && (
                            <div className="text-xs text-gray-400 mt-1">
                              {project.candidateCount} candidates
                            </div>
                          )}
                        </Label>
                        {selectedId === project.id && !project.restricted && (
                          <Check className="h-4 w-4 text-blue-600 mt-1" />
                        )}
                      </div>
                    </TooltipTrigger>
                    {project.restricted && (
                      <TooltipContent>
                        <p>{project.restrictionReason || 'Insufficient permissions for this project'}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                ))}
              </RadioGroup>
            </TooltipProvider>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} data-testid="btn-cancel-selector">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedId || isSubmitting}
            data-testid="btn-confirm-project"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Use This Project
          </Button>
        </div>
      </Card>
    </div>
  );
}
