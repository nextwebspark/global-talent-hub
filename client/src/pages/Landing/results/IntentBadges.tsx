import type { InferredIntent } from '@shared/schema';

export function IntentBadges({ intent }: { intent: InferredIntent }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {intent.primarySectors.map(s => (
        <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{s}</span>
      ))}
      {intent.targetGeographies.map(g => (
        <span key={g} className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">{g}</span>
      ))}
      {intent.commercialRole && intent.commercialRole !== 'any' && (
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400">{intent.commercialRole}</span>
      )}
    </div>
  );
}
