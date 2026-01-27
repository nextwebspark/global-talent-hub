import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Loader2, X, Database, Check } from 'lucide-react';

interface ClockworkProject {
  id: string;
  name: string;
  description?: string;
  executiveCount: number;
}

interface ClockworkProjectSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (projectId: string) => void;
  currentProjectId?: string | null;
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
              No Clockwork projects available
            </div>
          ) : (
            <RadioGroup value={selectedId || ''} onValueChange={setSelectedId} className="space-y-2">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedId === project.id 
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                  onClick={() => setSelectedId(project.id)}
                  data-testid={`project-option-${project.id}`}
                >
                  <RadioGroupItem value={project.id} id={project.id} className="mr-3" />
                  <Label htmlFor={project.id} className="flex-1 cursor-pointer">
                    <div className="font-medium">{project.name}</div>
                    {project.description && (
                      <div className="text-sm text-gray-500">{project.description}</div>
                    )}
                    <div className="text-xs text-gray-400 mt-1">
                      {project.executiveCount} executives
                    </div>
                  </Label>
                  {selectedId === project.id && (
                    <Check className="h-4 w-4 text-blue-600" />
                  )}
                </div>
              ))}
            </RadioGroup>
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
