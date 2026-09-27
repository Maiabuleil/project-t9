import { cn } from '@/lib/utils'
import { STATUS_META } from '@/lib/report-utils'
import type { ReportStatus } from '@/lib/types'

export function StatusBadge({ status }: { status: ReportStatus }) {
  const meta = STATUS_META[status]
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
        meta.className,
      )}
    >
      {meta.label}
    </span>
  )
}
