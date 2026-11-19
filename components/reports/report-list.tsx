'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, ChevronLeft, FilePlus2, HardHat, Search, Trash2, UserRound, X } from 'lucide-react'
import type { Report } from '@/lib/types'
import { formatDate } from '@/lib/report-utils'
import { StatusBadge } from './status-badge'
import { PdfButton } from './pdf-button'

type ReportListProps = {
  reports: Report[]
  onCreate: () => void
  onOpen: (report: Report) => void
  canDelete?: boolean
  onDelete?: (report: Report) => void
}

const NO_CLIENT = 'ללא שם לקוח'
const naturalOrder = new Intl.Collator('he', { numeric: true, sensitivity: 'base' })

type ClientGroup = { client: string; reports: Report[] }

// Groups reports by client name (A→Z, reports without a client last); inside a group the apartments
// are ordered by building, floor and apartment number.
function groupByClient(reports: Report[]): ClientGroup[] {
  const groups = new Map<string, ClientGroup>()
  for (const report of reports) {
    const name = report.details.clientName.trim()
    const key = name.toLocaleLowerCase('he') || NO_CLIENT
    const group = groups.get(key) ?? { client: name || NO_CLIENT, reports: [] }
    group.reports.push(report)
    groups.set(key, group)
  }
  const unitOrder = (x: Report, y: Report) =>
    naturalOrder.compare(x.details.building, y.details.building) ||
    naturalOrder.compare(x.details.floor, y.details.floor) ||
    naturalOrder.compare(x.details.apartment, y.details.apartment)
  return [...groups.values()]
    .map((group) => ({ ...group, reports: group.reports.sort(unitOrder) }))
    .sort((x, y) => (x.client === NO_CLIENT ? 1 : y.client === NO_CLIENT ? -1 : naturalOrder.compare(x.client, y.client)))
}

export function ReportList({ reports, onCreate, onOpen, canDelete = false, onDelete }: ReportListProps) {
  const [query, setQuery] = useState('')
  const [openClients, setOpenClients] = useState<Set<string>>(() => new Set())

  const groups = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('he')
    const matching = q ? reports.filter((r) => r.details.clientName.toLocaleLowerCase('he').includes(q)) : reports
    return groupByClient(matching)
  }, [reports, query])

  const searching = query.trim() !== ''
  const reportCount = groups.reduce((sum, group) => sum + group.reports.length, 0)

  function toggleClient(client: string) {
    setOpenClients((prev) => {
      const next = new Set(prev)
      if (next.has(client)) next.delete(client)
      else next.add(client)
      return next
    })
  }

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
          חיפוש לפי שם הלקוח
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
          placeholder="חיפוש לפי שם הלקוח"
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
            דוחות לפי לקוח
          </h2>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {groups.length} לקוחות · {reportCount} דוחות
          </span>
        </div>

        {groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-input bg-card px-4 py-10 text-center">
            <p className="font-medium">לא נמצאו דוחות</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {searching ? 'לא נמצא לקוח בשם הזה. נסו שם אחר.' : 'עדיין אין דוחות.'}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {groups.map((group) => {
              // While searching, matching clients open automatically.
              const open = searching || openClients.has(group.client)
              const panelId = `client-${encodeURIComponent(group.client)}`
              return (
                <li key={group.client} className="overflow-hidden rounded-2xl border border-border bg-card">
                  <button
                    type="button"
                    onClick={() => toggleClient(group.client)}
                    aria-expanded={open}
                    aria-controls={panelId}
                    className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-start hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-ring/30"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                      <UserRound className="size-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-bold">{group.client}</span>
                      <span className="block text-sm text-muted-foreground">
                        {group.reports.length === 1 ? 'דירה אחת' : `${group.reports.length} דירות`}
                      </span>
                    </span>
                    <ChevronDown className={`size-5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                  {open && (
                    <ul id={panelId} className="flex flex-col gap-2 border-t border-border bg-muted/30 p-2">
                      {group.reports.map((report) => (
                        <li key={report.id}>
                          <ReportCard report={report} onOpen={() => onOpen(report)} canDelete={canDelete} onDelete={onDelete} />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
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
      <PdfButton report={report} variant="icon" />
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
