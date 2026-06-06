import { PencilLine, Check } from 'lucide-react';

interface ProjectStatusChipProps {
  status: 'draft' | 'active';
}

export default function ProjectStatusChip({ status }: ProjectStatusChipProps) {
  if (status === 'draft') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-semibold whitespace-nowrap bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
        <PencilLine className="w-2.5 h-2.5" />Draft
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-semibold whitespace-nowrap bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
      <Check className="w-2.5 h-2.5" />Active
    </span>
  );
}
