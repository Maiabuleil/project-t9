'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, CheckCheck, Save } from 'lucide-react'
import type { Finding, Inspection, Report, ReportDetails } from '@/lib/types'
import { resolveFinalStatus } from '@/lib/report-utils'
import { StatusBadge } from './status-badge'
import { DetailsSection } from './details-section'
import { InspectionCard } from './inspection-card'
import { FindingsSection } from './findings-section'
import { FormSection } from './fields'

type ReportFormProps = {
  initialReport: Report
  isNew: boolean
  onCancel: () => void
  onSave: (report: Report) => void
  onAutosave?: (report: Report) => void
}

export function ReportForm({ initialReport, isNew, onCancel, onSave }: ReportFormProps) {
  const [report, setReport] = useState<Report>(initialReport)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!onAutosave) return
    const timer = window.setTimeout(() => onAutosave({ ...report, status: 'draft' }), 1200)
    return () => window.clearTimeout(timer)
  }, [report, onAutosave])

  function updateDetails(details: ReportDetails) {
    setReport((prev) => ({ ...prev, details }))
  }

  function updateInspection(updated: Inspection) {
    setReport((prev) => ({
      ...prev,
      inspections: prev.inspections.map((i) => (i.id === updated.id ? updated : i)),
    }))
  }

  function updateFindings(findings: Finding[]) {
    setReport((prev) => ({ ...prev, findings }))
  }

  function handleSaveDraft() {
    onSave({ ...report, status: 'draft' })
  }

  function handleFinish() {
    const missing: string[] = []
    if (!report.details.address.trim()) missing.push('כתובת')
    if (!report.details.apartment.trim()) missing.push('מספר דירה')
    if (!report.details.inspector.trim()) missing.push('מבצע הבדיקה')
    const unchecked = report.inspections.filter((i) => i.result === null).length
    if (unchecked > 0) missing.push(`תוצאה ל-${unchecked} בדיקות`)

    if (missing.length > 0) {
      setError(`כדי לסיים את הדוח יש להשלים: ${missing.join(', ')}`)
      return
    }
    onSave({ ...report, status: resolveFinalStatus(report) })
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/95 px-2 py-2 backdrop-blur">
        <button
          type="button"
          onClick={onCancel}
          className="flex size-12 items-center justify-center rounded-xl hover:bg-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30"
        >
          <ArrowRight className="size-6" aria-hidden="true" />
          <span className="sr-only">חזרה לרשימת הדוחות</span>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold">{isNew ? 'דוח חדש' : 'עריכת דוח'}</h1>
          <p className="font-mono text-xs text-muted-foreground">#{report.details.reportNumber}</p>
        </div>
        <StatusBadge status={report.status} />
      </header>

      <main className="flex flex-1 flex-col gap-10 px-4 pb-8 pt-6">
        <DetailsSection details={report.details} onChange={updateDetails} />

        <FormSection
          step={2}
          id="inspections-heading"
          title="בדיקות"
          description="סמנו תוצאה לכל בדיקה, הוסיפו הערה וצרפו תיעוד לפני ואחרי העבודה."
        >
          <div className="flex flex-col gap-4">
            {report.inspections.map((inspection) => (
              <InspectionCard
                key={inspection.id}
                inspection={inspection}
                onChange={updateInspection}
              />
            ))}
          </div>
        </FormSection>

        <FindingsSection findings={report.findings} onChange={updateFindings} />
      </main>

      <footer className="sticky bottom-0 z-20 flex flex-col gap-2 border-t border-border bg-card px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3">
        {error && (
          <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm leading-relaxed text-destructive">
            {error}
          </p>
        )}
        <div className="grid grid-cols-5 gap-2">
          <button
            type="button"
            onClick={handleSaveDraft}
            className="col-span-2 flex h-14 items-center justify-center gap-2 rounded-xl border border-input bg-card text-base font-semibold hover:bg-muted"
          >
            <Save className="size-5" aria-hidden="true" />
            שמירת טיוטה
          </button>
          <button
            type="button"
            onClick={handleFinish}
            className="col-span-3 flex h-14 items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-primary-foreground hover:bg-primary/90"
          >
            <CheckCheck className="size-5" aria-hidden="true" />
            סיום ושמירת דוח
          </button>
        </div>
      </footer>
    </div>
  )
}
