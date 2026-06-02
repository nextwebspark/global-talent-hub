import { Loader2 } from 'lucide-react';

export function SkeletonCompanyRow({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3 px-4 h-14 animate-pulse border-b border-border/30" data-testid={`card-skeleton-${name}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{name}</p>
        <div className="h-2.5 bg-muted rounded mt-1 w-20" />
      </div>
      <div className="h-3 bg-muted rounded w-16" />
      <div className="h-4 w-14 bg-muted rounded-full" />
      <div className="h-3 bg-muted rounded w-8" />
      <div className="h-3 bg-muted rounded w-32 hidden md:block" />
      <div className="flex items-center gap-1.5 shrink-0">
        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
