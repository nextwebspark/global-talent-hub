import { Sparkles, Building2, CheckCircle2, ListFilter, Users, CheckCheck, X, Activity } from 'lucide-react';

export function ActivityIcon({ type }: { type: string }) {
  switch (type) {
    case 'intent_extracted': return <Sparkles className="w-3.5 h-3.5 text-violet-500" />;
    case 'company_found': return <Building2 className="w-3.5 h-3.5 text-blue-500" />;
    case 'company_enriched': return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
    case 'adjacent_sector_found': return <ListFilter className="w-3.5 h-3.5 text-amber-500" />;
    case 'executive_found': return <Users className="w-3.5 h-3.5 text-indigo-500" />;
    case 'search_complete': return <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />;
    case 'error': return <X className="w-3.5 h-3.5 text-destructive" />;
    default: return <Activity className="w-3.5 h-3.5 text-muted-foreground" />;
  }
}
