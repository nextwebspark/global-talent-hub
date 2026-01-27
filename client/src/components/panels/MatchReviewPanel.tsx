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

interface MatchReviewData {
  searchId: number;
  clockworkProjectId: string;
  timestamp: string;
  totalLocalExecutives: number;
  totalClockworkExecutives: number;
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
    unmatchedClockwork: false
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

  // API returns { matches: { confirmed, possible, noMatch }, summary }
  const { matches, summary } = matchData;
  const confirmed = matches?.confirmed || [];
  const possible = matches?.possible || [];
  const noMatch = matches?.noMatch || [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" data-testid="match-review-panel">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col bg-white dark:bg-gray-800">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold" data-testid="match-review-title">Match Review</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {matchData.totalLocalExecutives} local executives, {matchData.totalClockworkExecutives} from Clockwork
            </p>
          </div>
          <Button variant="ghost" onClick={onClose} data-testid="btn-close-review">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-3 gap-4 mb-6">
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
