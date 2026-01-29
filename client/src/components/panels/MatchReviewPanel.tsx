import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, X, UserPlus, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface ClockworkExecutive {
  id: string;
  name: string;
  title: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  profileUrl?: string;
  imageUrl?: string;
  company?: string;
}

interface LocalExecutive {
  id: number;
  name: string;
  title: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  profileUrl?: string;
  imageUrl?: string;
  companyId: number;
  companyName?: string;
}


interface ExecutiveMatchItem {
  localExecutiveId: number;
  localExecutiveName: string;
  localExecutiveTitle: string;
  localCompanyName: string;
  clockworkExecutiveId: number | null;
  clockworkExecutiveName: string | null;
  clockworkExecutiveTitle: string | null;
  classification: 'confirmed' | 'possible' | 'no_match';
  confidence: number;
  matchDetails: {
    nameScore: number;
    titleScore: number;
    companyScore: number;
  };
}

interface EndpointTried {
  endpoint: string;
  status: number | null;
  success: boolean;
  candidateCount: number;
  samplePerson?: { id: string; name: string; company: string };
}

interface MatchReviewData {
  enrichmentRunId?: string;
  searchId: number;
  clockworkProjectId: string;
  clockworkFirmSlug?: string;
  timestamp: string;
  totalLocalExecutives: number;
  totalClockworkExecutives: number;
  totalRawCandidates?: number;
  clockworkCandidates?: ClockworkExecutive[];
  matches: {
    confirmed: ExecutiveMatchItem[];
    possible: ExecutiveMatchItem[];
    noMatch: ExecutiveMatchItem[];
  };
  summary: {
    confirmedCount: number;
    possibleCount: number;
    noMatchCount: number;
  };
  fetchStatus?: 'success' | 'error' | 'no_candidates' | 'invalid_data';
  fetchError?: {
    message: string;
    status?: number;
    endpoint?: string;
  };
  endpointsTried?: EndpointTried[];
  warnings?: string[];
  successEndpoint?: string;
  paginationUsed?: boolean;
  pagesFetched?: number;
}

interface MatchReviewPanelProps {
  matchData: MatchReviewData | null;
  isLoading: boolean;
  onClose: () => void;
  onRefreshData?: () => void;
}

export default function MatchReviewPanel({
  matchData,
  isLoading,
  onClose,
  onRefreshData
}: MatchReviewPanelProps) {
  const [processingItems, setProcessingItems] = useState<Set<string>>(new Set());
  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set());
  const [skippedItems, setSkippedItems] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    confirmed: true,
    possible: true,
    noMatch: false,
    unmatchedClockwork: false,
    clockworkCandidates: true,
    clockworkDebug: false
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleConfirmEnrichment = async (match: ExecutiveMatchItem, clockworkProjectId?: string) => {
    const itemKey = `confirm-${match.localExecutiveId}`;
    if (processingItems.has(itemKey)) return;

    setProcessingItems(prev => new Set(prev).add(itemKey));
    try {
      const response = await fetch('/api/enrichment/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executiveId: match.localExecutiveId,
          clockworkData: {
            name: match.clockworkExecutiveName,
            title: match.clockworkExecutiveTitle
          },
          confidence: match.confidence,
          clockworkId: match.clockworkExecutiveId,
          clockworkProjectId
        })
      });

      if (!response.ok) throw new Error('Failed to confirm enrichment');
      
      const result = await response.json();
      setCompletedItems(prev => new Set(prev).add(itemKey));
      
      if (result.alreadyEnriched) {
        toast.info(`${match.localExecutiveName} was already enriched with this profile`);
      } else if (result.enrichedFields.length > 0) {
        toast.success(`Enriched ${result.enrichedFields.length} fields for ${match.localExecutiveName}`);
      } else {
        toast.info(`No new fields to enrich for ${match.localExecutiveName}`);
      }
      onRefreshData?.();
    } catch (error) {
      toast.error('Failed to confirm enrichment');
      console.error('Error confirming enrichment:', error);
    } finally {
      setProcessingItems(prev => {
        const next = new Set(prev);
        next.delete(itemKey);
        return next;
      });
    }
  };

  const handleSkip = (match: ExecutiveMatchItem) => {
    const itemKey = `confirm-${match.localExecutiveId}`;
    setSkippedItems(prev => new Set(prev).add(itemKey));
    toast.info(`Skipped ${match.localExecutiveName}`);
  };

  const handleCreateFromClockwork = async (clockworkExec: ClockworkExecutive, companyId: number, clockworkProjectId?: string) => {
    const itemKey = `create-${clockworkExec.id}`;
    if (processingItems.has(itemKey)) return;

    setProcessingItems(prev => new Set(prev).add(itemKey));
    try {
      const response = await fetch('/api/enrichment/create-from-clockwork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          clockworkData: {
            name: clockworkExec.name,
            title: clockworkExec.title,
            email: clockworkExec.email,
            phone: clockworkExec.phone,
            linkedin: clockworkExec.linkedin,
            profileUrl: clockworkExec.profileUrl,
            imageUrl: clockworkExec.imageUrl
          },
          confidence: 80,
          clockworkId: clockworkExec.id,
          clockworkProjectId
        })
      });

      if (!response.ok) throw new Error('Failed to create executive');
      
      const result = await response.json();
      setCompletedItems(prev => new Set(prev).add(itemKey));
      
      if (result.alreadyExists) {
        toast.info(`${clockworkExec.name} was already imported from Clockwork`);
      } else {
        toast.success(`Created executive ${clockworkExec.name} from Clockwork`);
      }
      onRefreshData?.();
    } catch (error) {
      toast.error('Failed to create executive from Clockwork');
      console.error('Error creating executive:', error);
    } finally {
      setProcessingItems(prev => {
        const next = new Set(prev);
        next.delete(itemKey);
        return next;
      });
    }
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 85) {
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">High ({confidence}%)</Badge>;
    } else if (confidence >= 60) {
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Medium ({confidence}%)</Badge>;
    }
    return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Low ({confidence}%)</Badge>;
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="match-review-loading">
        <Card className="p-8 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            <span className="text-lg">Analyzing matches...</span>
          </div>
        </Card>
      </div>
    );
  }

  if (!matchData) return null;

  // API returns { matches: { confirmed, possible, noMatch }, summary, clockworkCandidates }
  const { matches, summary, clockworkCandidates: rawCandidates } = matchData;
  const confirmed = matches?.confirmed || [];
  const possible = matches?.possible || [];
  const noMatch = matches?.noMatch || [];
  const clockworkCandidates = rawCandidates || [];

  const handleImportCandidate = async (candidate: ClockworkExecutive) => {
    const itemKey = `import-${candidate.id}`;
    if (processingItems.has(itemKey)) return;

    setProcessingItems(prev => new Set(prev).add(itemKey));
    try {
      const response = await fetch('/api/enrichment/import-candidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchId: matchData.searchId,
          clockworkId: candidate.id,
          name: candidate.name,
          title: candidate.title,
          company: candidate.company,
          email: candidate.email,
          linkedin: candidate.linkedin,
          imageUrl: candidate.imageUrl,
          clockworkProjectId: matchData.clockworkProjectId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to import candidate');
      }

      setCompletedItems(prev => new Set(prev).add(itemKey));
      toast.success(`Added ${candidate.name} to search results`);
      onRefreshData?.();
    } catch (error) {
      console.error('Import failed:', error);
      toast.error('Failed to import candidate');
    } finally {
      setProcessingItems(prev => {
        const next = new Set(prev);
        next.delete(itemKey);
        return next;
      });
    }
  };

  // Determine if there's a fetch error
  const hasFetchError = matchData.fetchStatus === 'error';
  const hasNoCandidates = matchData.fetchStatus === 'no_candidates';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" data-testid="match-review-panel">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col bg-white dark:bg-gray-800">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold" data-testid="match-review-title">Match Review</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {matchData.totalLocalExecutives} local executives, {matchData.totalClockworkExecutives} from Clockwork
              {matchData.enrichmentRunId && (
                <span className="ml-2 text-xs text-gray-400">(Run: {matchData.enrichmentRunId})</span>
              )}
            </p>
          </div>
          <Button variant="ghost" onClick={onClose} data-testid="btn-close-review">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Error Banner - Show when Clockwork fetch failed */}
          {hasFetchError && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg" data-testid="fetch-error-banner">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-red-800 dark:text-red-200">Failed to fetch Clockwork candidates</h3>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                    {matchData.fetchError?.message || 'Unknown error occurred while fetching from Clockwork API'}
                  </p>
                  {matchData.fetchError?.status && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      HTTP Status: {matchData.fetchError.status}
                    </p>
                  )}
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                    This is NOT a "no match" result. Check server logs for details.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* No Candidates Banner - Show when API succeeded but returned 0 candidates */}
          {hasNoCandidates && (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg" data-testid="no-candidates-banner">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-yellow-800 dark:text-yellow-200">Clockwork project has no candidates</h3>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                    The selected Clockwork project returned 0 candidates. This could mean:
                  </p>
                  <ul className="text-sm text-yellow-700 dark:text-yellow-300 mt-1 list-disc ml-4">
                    <li>The project is empty</li>
                    <li>All candidates were filtered out (no stable IDs)</li>
                    <li>You may need to select a different project</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Invalid Data Banner - Show when API returns system accounts / wrong data */}
          {matchData.fetchStatus === 'invalid_data' && (
            <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg" data-testid="invalid-data-banner">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-orange-800 dark:text-orange-200">Clockwork API Limitation Detected</h3>
                  <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                    <strong>Issue:</strong> The Clockwork API is returning all firm contacts instead of project-specific candidates.
                    The <code className="bg-orange-100 dark:bg-orange-900 px-1 rounded">project_id</code> filter is being ignored.
                  </p>
                  <div className="text-sm text-orange-700 dark:text-orange-300 mt-2">
                    <strong>What this means:</strong>
                    <ul className="list-disc ml-4 mt-1">
                      <li>The candidates shown are from your entire Clockwork database, not your selected project</li>
                      <li>This is a known limitation in Clockwork API v3.0</li>
                    </ul>
                  </div>
                  <div className="text-sm text-orange-700 dark:text-orange-300 mt-2">
                    <strong>Recommended action:</strong> Contact Clockwork support to ask about:
                    <ul className="list-disc ml-4 mt-1">
                      <li>The correct API endpoint for project-specific candidates</li>
                      <li>Access to a newer API version with this feature</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Warnings Banner - Show any API warnings */}
          {matchData.warnings && matchData.warnings.length > 0 && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg" data-testid="warnings-banner">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-amber-800 dark:text-amber-200 text-sm">Warnings</h4>
                  <ul className="text-xs text-amber-700 dark:text-amber-300 mt-1 list-disc ml-4">
                    {matchData.warnings.map((warning, idx) => (
                      <li key={idx}>{warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Clockwork Debug Section - Expandable details about API calls */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('clockworkDebug')}
              className="w-full p-2 bg-gray-50 dark:bg-gray-800 flex items-center justify-between text-sm"
              data-testid="toggle-clockwork-debug"
            >
              <span className="font-medium text-gray-600 dark:text-gray-400">
                Clockwork Debug Info
              </span>
              {expandedSections.clockworkDebug ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {expandedSections.clockworkDebug && (
              <div className="p-3 bg-gray-50/50 dark:bg-gray-900/50 text-xs font-mono space-y-2">
                <div><span className="text-gray-500">Firm Slug:</span> {matchData.clockworkFirmSlug || 'N/A'}</div>
                <div><span className="text-gray-500">Project ID:</span> {matchData.clockworkProjectId}</div>
                <div><span className="text-gray-500">Run ID:</span> {matchData.enrichmentRunId || 'N/A'}</div>
                <div><span className="text-gray-500">Fetch Status:</span> <span className={matchData.fetchStatus === 'success' ? 'text-green-600' : 'text-red-600'}>{matchData.fetchStatus || 'N/A'}</span></div>
                <div><span className="text-gray-500">Success Endpoint:</span> {matchData.successEndpoint || 'N/A'}</div>
                <div><span className="text-gray-500">Pages Fetched:</span> {matchData.pagesFetched ?? 'N/A'}</div>
                <div><span className="text-gray-500">Raw Candidates:</span> {matchData.totalRawCandidates ?? 'N/A'}</div>
                <div><span className="text-gray-500">Filtered Candidates:</span> {clockworkCandidates.length}</div>
                
                {matchData.endpointsTried && matchData.endpointsTried.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-gray-500 mb-1">Endpoints Tried:</div>
                    {matchData.endpointsTried.map((ep, idx) => (
                      <div key={idx} className={`ml-2 ${ep.success ? 'text-green-600' : 'text-red-500'}`}>
                        {ep.success ? '✓' : '✗'} {ep.endpoint} ({ep.status}) - {ep.candidateCount} candidates
                        {ep.samplePerson && (
                          <span className="text-gray-400 ml-2">Sample: {ep.samplePerson.name}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border-2 border-blue-200 dark:border-blue-800">
              <div className="text-2xl font-bold text-blue-600">{clockworkCandidates.length}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Clockwork Candidates</div>
            </div>
            <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{summary.confirmedCount}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Confirmed</div>
            </div>
            <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">{summary.possibleCount}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Possible</div>
            </div>
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-700/20 rounded-lg">
              <div className="text-2xl font-bold text-gray-600">{summary.noMatchCount}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">No Match</div>
            </div>
          </div>

          {/* Clockwork Candidates Section - Show all candidates fetched from Clockwork project */}
          {clockworkCandidates.length > 0 && (
            <div className="border-2 border-blue-200 dark:border-blue-800 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection('clockworkCandidates')}
                className="w-full p-3 bg-blue-50 dark:bg-blue-900/20 flex items-center justify-between"
                data-testid="toggle-clockwork-candidates-section"
              >
                <div className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-blue-600" />
                  <span className="font-medium text-blue-800 dark:text-blue-200">
                    Clockwork Project Candidates ({clockworkCandidates.length})
                  </span>
                  <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    Available to Import
                  </Badge>
                </div>
                {expandedSections.clockworkCandidates ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </button>
              {expandedSections.clockworkCandidates && (
                <div className="divide-y divide-blue-100 dark:divide-blue-800">
                  {clockworkCandidates.map((candidate) => {
                    const itemKey = `import-${candidate.id}`;
                    const isProcessing = processingItems.has(itemKey);
                    const isCompleted = completedItems.has(itemKey);

                    return (
                      <div 
                        key={candidate.id}
                        className={`p-4 ${isCompleted ? 'bg-green-50 dark:bg-green-900/10' : 'bg-white dark:bg-gray-800'}`}
                        data-testid={`clockwork-candidate-${candidate.id}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium truncate">{candidate.name}</span>
                              <Badge variant="outline" className="text-xs">Clockwork</Badge>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{candidate.title || 'No title'}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {candidate.company && <span>Company: {candidate.company}</span>}
                              {candidate.email && <span className="ml-2">| {candidate.email}</span>}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {!isCompleted && (
                              <Button
                                size="sm"
                                onClick={() => handleImportCandidate(candidate)}
                                disabled={isProcessing}
                                className="bg-blue-600 hover:bg-blue-700"
                                data-testid={`btn-import-${candidate.id}`}
                              >
                                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4 mr-1" />}
                                Add to Search
                              </Button>
                            )}
                            {isCompleted && <Badge className="bg-green-100 text-green-800">Added</Badge>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {confirmed.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection('confirmed')}
                className="w-full p-3 bg-green-50 dark:bg-green-900/20 flex items-center justify-between"
                data-testid="toggle-confirmed-section"
              >
                <div className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-green-600" />
                  <span className="font-medium">Confirmed Matches ({confirmed.length})</span>
                </div>
                {expandedSections.confirmed ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </button>
              {expandedSections.confirmed && (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {confirmed.map((match) => {
                    const itemKey = `confirm-${match.localExecutiveId}`;
                    const isProcessing = processingItems.has(itemKey);
                    const isCompleted = completedItems.has(itemKey);
                    const isSkipped = skippedItems.has(itemKey);

                    return (
                      <div 
                        key={match.localExecutiveId} 
                        className={`p-4 ${isCompleted ? 'bg-green-50 dark:bg-green-900/10' : isSkipped ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
                        data-testid={`match-item-${match.localExecutiveId}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium truncate">{match.localExecutiveName}</span>
                              {getConfidenceBadge(match.confidence)}
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{match.localExecutiveTitle}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              Clockwork: {match.clockworkExecutiveName} - {match.clockworkExecutiveTitle}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {!isCompleted && !isSkipped && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleSkip(match)}
                                  disabled={isProcessing}
                                  data-testid={`btn-skip-${match.localExecutiveId}`}
                                >
                                  Skip
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleConfirmEnrichment(match, matchData?.clockworkProjectId)}
                                  disabled={isProcessing}
                                  data-testid={`btn-confirm-${match.localExecutiveId}`}
                                >
                                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                                  Enrich
                                </Button>
                              </>
                            )}
                            {isCompleted && <Badge className="bg-green-100 text-green-800">Enriched</Badge>}
                            {isSkipped && <Badge variant="secondary">Skipped</Badge>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {possible.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection('possible')}
                className="w-full p-3 bg-yellow-50 dark:bg-yellow-900/20 flex items-center justify-between"
                data-testid="toggle-possible-section"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  <span className="font-medium">Possible Matches ({possible.length})</span>
                </div>
                {expandedSections.possible ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </button>
              {expandedSections.possible && (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {possible.map((match) => {
                    const itemKey = `confirm-${match.localExecutiveId}`;
                    const isProcessing = processingItems.has(itemKey);
                    const isCompleted = completedItems.has(itemKey);
                    const isSkipped = skippedItems.has(itemKey);

                    return (
                      <div 
                        key={match.localExecutiveId}
                        className={`p-4 ${isCompleted ? 'bg-green-50 dark:bg-green-900/10' : isSkipped ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
                        data-testid={`match-item-${match.localExecutiveId}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium truncate">{match.localExecutiveName}</span>
                              {getConfidenceBadge(match.confidence)}
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{match.localExecutiveTitle}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              Possible Clockwork match: {match.clockworkExecutiveName} - {match.clockworkExecutiveTitle}
                            </p>
                            <div className="text-xs text-gray-400 mt-1">
                              Name: {match.matchDetails.nameScore}% | Title: {match.matchDetails.titleScore}%
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {!isCompleted && !isSkipped && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleSkip(match)}
                                  disabled={isProcessing}
                                  data-testid={`btn-skip-${match.localExecutiveId}`}
                                >
                                  Skip
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleConfirmEnrichment(match, matchData?.clockworkProjectId)}
                                  disabled={isProcessing}
                                  data-testid={`btn-confirm-${match.localExecutiveId}`}
                                >
                                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                                  Enrich
                                </Button>
                              </>
                            )}
                            {isCompleted && <Badge className="bg-green-100 text-green-800">Enriched</Badge>}
                            {isSkipped && <Badge variant="secondary">Skipped</Badge>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {clockworkCandidates.length > 0 && (
            <div className="border rounded-lg overflow-hidden border-blue-200 dark:border-blue-800">
              <button
                onClick={() => toggleSection('clockworkCandidates')}
                className="w-full p-3 bg-blue-50 dark:bg-blue-900/20 flex items-center justify-between"
                data-testid="toggle-clockwork-candidates-section"
              >
                <div className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-blue-600" />
                  <span className="font-medium">Clockwork Project Candidates ({clockworkCandidates.length})</span>
                </div>
                {expandedSections.clockworkCandidates ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </button>
              {expandedSections.clockworkCandidates && (
                <div className="p-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    These candidates are from the Clockwork project. Click "Add to Search" to include them in your results.
                  </p>
                  <div className="space-y-2">
                    {clockworkCandidates.map((candidate: ClockworkExecutive) => {
                      const itemKey = `import-${candidate.id}`;
                      const isProcessing = processingItems.has(itemKey);
                      const isCompleted = completedItems.has(itemKey);
                      
                      return (
                        <div 
                          key={candidate.id} 
                          className={`p-3 border rounded-lg ${isCompleted ? 'bg-green-50 dark:bg-green-900/10' : 'bg-white dark:bg-gray-800'}`}
                          data-testid={`clockwork-candidate-${candidate.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium">{candidate.name}</span>
                              <p className="text-sm text-gray-600 dark:text-gray-400">{candidate.title || 'No title'}</p>
                              <p className="text-xs text-gray-500">{candidate.company || 'No company'}</p>
                              {candidate.email && (
                                <p className="text-xs text-blue-600">{candidate.email}</p>
                              )}
                            </div>
                            <div className="flex gap-2">
                              {!isCompleted && (
                                <Button
                                  size="sm"
                                  onClick={() => handleImportCandidate(candidate)}
                                  disabled={isProcessing}
                                  data-testid={`btn-import-${candidate.id}`}
                                >
                                  {isProcessing ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <>
                                      <UserPlus className="h-4 w-4 mr-1" />
                                      Add to Search
                                    </>
                                  )}
                                </Button>
                              )}
                              {isCompleted && (
                                <Badge className="bg-green-100 text-green-800">Added</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {noMatch.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection('noMatch')}
                className="w-full p-3 bg-gray-50 dark:bg-gray-900/20 flex items-center justify-between"
                data-testid="toggle-nomatch-section"
              >
                <div className="flex items-center gap-2">
                  <X className="h-5 w-5 text-gray-600" />
                  <span className="font-medium">No Match ({noMatch.length})</span>
                </div>
                {expandedSections.noMatch ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </button>
              {expandedSections.noMatch && (
                <div className="p-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    These executives have no matching records in Clockwork.
                  </p>
                  <div className="space-y-2">
                    {noMatch.map((exec: ExecutiveMatchItem) => (
                      <div 
                        key={exec.localExecutiveId} 
                        className="p-3 border rounded-lg bg-gray-50 dark:bg-gray-800"
                        data-testid={`nomatch-exec-${exec.localExecutiveId}`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium">{exec.localExecutiveName}</span>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{exec.localExecutiveTitle}</p>
                            <p className="text-xs text-gray-500">{exec.localCompanyName}</p>
                          </div>
                          <Badge variant="secondary">No Match</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} data-testid="btn-done-review">
            Done
          </Button>
        </div>
      </Card>
    </div>
  );
}
