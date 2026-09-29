'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, FilePlus2, HardHat, Search, Trash2, X } from 'lucide-react'
import type { Report } from '@/lib/types'
import { formatDate } from '@/lib/report-utils'
import { StatusBadge } from './status-badge'

type ReportListProps = {
  reports: Report[]
  onCreate: () => void
  onOpen: (report: Report) => void
  canDelete?: boolean
  onDelete?: (report: Report) => void
}

export function ReportList({ reports, onCreate, onOpen, canDelete = false, onDelete }: ReportListProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return reports
    return reports.filter((r) => {
      const { address, apartment } = r.details
      return address.toLowerCase().includes(q) || apartment.toLowerCase().includes(q)
    })
  }, [reports, query])

  return (
    <main className="flex flex-col gap-6 px-4 pb-10 pt-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-primary">דוח בדיקת מערכת דלוחים בדירה</p>
        <h1 className="text-balance text-3xl font-bold leading-tight">דוחות בדיקת מערכת דלוחים</h1>
      </header>

      <button
        type="button"
        onClick={onCreate}
        className="flex h-20 items-center justify-center gap-3 rounded-2xl bg-primary text-xl font-bold text-primary-foreground shadow-md transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/40"
      >
        <FilePlus2 className="size-7" aria-hidden="true" />
        פתיחת דוח חדש
      </button>

      <div className="relative">
        <label htmlFor="report-search" className="sr-only">
          חיפוש לפי כתובת או מספר דירה
        </label>
        <Search
          className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          id="report-search"
          type="search"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש לפי כתובת או מספר דירה"
          className="h-14 w-full rounded-xl border border-input bg-card pe-12 ps-12 text-base outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-ring/20 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute end-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X className="size-5" aria-hidden="true" />
            <span className="sr-only">ניקוי חיפוש</span>
          </button>
        )}
      </div>

      <section aria-labelledby="reports-heading" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 id="reports-heading" className="text-lg font-semibold">
            דוחות אחרונים
          </h2>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {filtered.length} דוחות
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-input bg-card px-4 py-10 text-center">
            <p className="font-medium">לא נמצאו דוחות</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              נסו לחפש כתובת אחרת או מספר דירה.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {filtered.map((report) => (
              <li key={report.id}>
                <ReportCard report={report} onOpen={() => onOpen(report)} canDelete={canDelete} onDelete={onDelete} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

function ReportCard({ report, onOpen, canDelete, onDelete }: { report: Report; onOpen: () => void; canDelete: boolean; onDelete?: (report: Report) => void }) {
  const { details } = report
  const unit = [
    `דירה ${details.apartment || '—'}`,
    details.floor && `קומה ${details.floor}`,
    details.building,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-start transition-colors hover:border-primary/40">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-start focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30"
      >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{details.address || 'כתובת לא הוזנה'}</p>
            <p className="text-sm text-muted-foreground">{unit}</p>
          </div>
          <StatusBadge status={report.status} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-4" aria-hidden="true" />
            {formatDate(details.date)}
          </span>
          <span className="flex items-center gap-1.5">
            <HardHat className="size-4" aria-hidden="true" />
            {details.inspector || 'לא שובץ'}
          </span>
          <span className="ms-auto font-mono text-xs">#{details.reportNumber}</span>
        </div>
      </div>
        <ChevronLeft className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      {canDelete && (
        <button
          type="button"
          aria-label={`מחיקת דוח ${details.address || details.apartment}`}
          onClick={() => {
            if (window.confirm(`האם למחוק את הדוח עבור ${details.address || 'כתובת לא הוזנה'}, דירה ${details.apartment || '—'}?`)) onDelete?.(report)
          }}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30"
        >
          <Trash2 className="size-5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
