import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { useCompanies, useLoadSearchResults, useEnrichmentMatch, EnrichmentMatchResult } from '@/lib/api';
import { transformAPICompany, transformAPIExecutive } from '@/lib/store';
import LeftPanel from '@/components/panels/LeftPanel';
import RightPanel from '@/components/panels/RightPanel';
import MapComponent from '@/components/map/Map';
import MatchReviewPanel from '@/components/panels/MatchReviewPanel';
import ClockworkProjectSelector from '@/components/panels/ClockworkProjectSelector';
import { useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { currentProject, setProject, selectedCompanyId, selectedExecutiveId, setCompanies, setExecutives } = useAppStore();
  const { isLoading } = useCompanies();
  const loadSearchResults = useLoadSearchResults();
  
  const [leftPanelWidth, setLeftPanelWidth] = useState(360);
  const [rightPanelWidth, setRightPanelWidth] = useState(384);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  
  const [showMatchReview, setShowMatchReview] = useState(false);
  const [matchReviewData, setMatchReviewData] = useState<EnrichmentMatchResult | null>(null);
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const enrichmentMatch = useEnrichmentMatch();
  const { refetch: refetchCompanies } = useCompanies();

  // Auto-open RHP when company or executive is selected
  useEffect(() => {
    if (selectedCompanyId || selectedExecutiveId) {
      setIsRightPanelOpen(true);
    }
  }, [selectedCompanyId, selectedExecutiveId]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isResizingLeft) {
      const newWidth = Math.max(280, Math.min(600, e.clientX));
      setLeftPanelWidth(newWidth);
    }
    if (isResizingRight) {
      const newWidth = Math.max(320, Math.min(700, window.innerWidth - e.clientX));
      setRightPanelWidth(newWidth);
    }
  }, [isResizingLeft, isResizingRight]);

  const handleMouseUp = useCallback(() => {
    setIsResizingLeft(false);
    setIsResizingRight(false);
  }, []);

  useEffect(() => {
    if (isResizingLeft || isResizingRight) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingLeft, isResizingRight, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    if (!currentProject) {
      setLocation('/');
    }
  }, [currentProject, setLocation]);

  const handleStartEnrichment = async () => {
    if (!currentProject?.id) {
      toast.error('Please run a search first');
      return;
    }

    // Check if a Clockwork project is already selected for this search
    if (!currentProject.clockworkProjectId) {
      // Show project selector modal
      setShowProjectSelector(true);
      return;
    }

    // Proceed with enrichment using the selected project
    await runEnrichmentWithProject(currentProject.clockworkProjectId);
  };

  const runEnrichmentWithProject = async (clockworkProjectId: string) => {
    if (!currentProject?.id) return;

    setShowMatchReview(true);
    try {
      toast.loading('Analyzing matches...', { id: 'enrichment' });
      const result = await enrichmentMatch.mutateAsync({
        searchId: parseInt(currentProject.id),
        clockworkProjectId
      });
      toast.dismiss('enrichment');
      setMatchReviewData(result);
    } catch (error) {
      toast.dismiss('enrichment');
      toast.error('Failed to analyze matches');
      setShowMatchReview(false);
      console.error('Enrichment error:', error);
    }
  };

  const handleClockworkProjectSelect = async (projectId: string) => {
    if (!currentProject?.id) return;

    try {
      // Persist the selection to the database
      const response = await fetch(`/api/search/${currentProject.id}/clockwork-project`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clockworkProjectId: projectId })
      });

      if (!response.ok) throw new Error('Failed to save project selection');

      // Update the local project state
      setProject({
        ...currentProject,
        clockworkProjectId: projectId
      });

      setShowProjectSelector(false);
      toast.success('Clockwork project selected');

      // Now run the enrichment
      await runEnrichmentWithProject(projectId);
    } catch (error) {
      console.error('Error selecting Clockwork project:', error);
      toast.error('Failed to select Clockwork project');
    }
  };

  const handleCloseMatchReview = () => {
    setShowMatchReview(false);
    setMatchReviewData(null);
  };

  const handleRefreshAfterEnrichment = async () => {
    // Reload the current search results to update map and panels
    console.log('[Refresh] Starting refresh after enrichment, currentProject:', currentProject?.id);
    if (currentProject?.id) {
      try {
        const searchId = parseInt(currentProject.id);
        console.log('[Refresh] Loading search results for ID:', searchId);
        const results = await loadSearchResults.mutateAsync(searchId);
        console.log('[Refresh] Got results, companies:', results.companies?.length);
        
        const companies = results.companies.map((c: any) => transformAPICompany(c));
        const executives = results.companies.flatMap((c: any) => {
          const execs = (c.executives || []).map((e: any) => transformAPIExecutive(e, String(c.id)));
          console.log(`[Refresh] Company ${c.name} has ${execs.length} executives`);
          return execs;
        });
        
        console.log('[Refresh] Total executives after transform:', executives.length);
        setCompanies(companies);
        setExecutives(executives);
        console.log('[Refresh] Store updated');
      } catch (error) {
        console.error('[Refresh] Failed to refresh after enrichment:', error);
        // Fallback to simple refetch
        refetchCompanies();
      }
    } else {
      console.log('[Refresh] No currentProject, falling back to refetchCompanies');
      refetchCompanies();
    }
  };

  if (!currentProject) return null;

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading your companies...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen bg-background overflow-hidden font-sans text-foreground">
      {/* Map as fixed background layer - always fills entire viewport */}
      <div className="absolute inset-0 z-0">
        <MapComponent />
      </div>
      
      {/* Left Panel overlay */}
      <div className="absolute top-0 left-0 h-full z-20 flex">
        <LeftPanel 
          width={leftPanelWidth} 
          isOpen={isLeftPanelOpen} 
          onToggle={() => setIsLeftPanelOpen(!isLeftPanelOpen)} 
        />
        {isLeftPanelOpen && (
          <div 
            className="w-1 bg-transparent hover:bg-primary/30 cursor-col-resize transition-colors relative shrink-0"
            onMouseDown={() => setIsResizingLeft(true)}
            data-testid="resize-handle-left"
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </div>
        )}
      </div>
      
      {/* Right Panel overlay */}
      <div className="absolute top-0 right-0 h-full z-20 flex">
        {isRightPanelOpen && selectedCompanyId && (
          <div 
            className="w-1 bg-transparent hover:bg-primary/30 cursor-col-resize transition-colors relative shrink-0"
            onMouseDown={() => setIsResizingRight(true)}
            data-testid="resize-handle-right"
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </div>
        )}
        <RightPanel 
          width={rightPanelWidth} 
          isOpen={isRightPanelOpen} 
          onToggle={() => setIsRightPanelOpen(!isRightPanelOpen)} 
        />
      </div>
      
      {showMatchReview && (
        <MatchReviewPanel
          matchData={matchReviewData}
          isLoading={enrichmentMatch.isPending && !matchReviewData}
          onClose={handleCloseMatchReview}
          onRefreshData={handleRefreshAfterEnrichment}
        />
      )}

      <ClockworkProjectSelector
        isOpen={showProjectSelector}
        onClose={() => setShowProjectSelector(false)}
        onSelect={handleClockworkProjectSelect}
        currentProjectId={currentProject?.clockworkProjectId}
      />
    </div>
  );
}
