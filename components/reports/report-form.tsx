'use client'

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { ArrowRight, CheckCheck, Loader2, Save } from 'lucide-react'
import type { Finding, Inspection, Report, ReportDetails } from '@/lib/types'
import type { SaveProgress } from './reports-app'
import { resolveFinalStatus } from '@/lib/report-utils'
import { StatusBadge } from './status-badge'
import { DetailsSection } from './details-section'
import { InspectionCard } from './inspection-card'
import { FindingsSection } from './findings-section'
import { FormSection } from './fields'
import { PdfButton } from './pdf-button'

type ReportFormProps = {
  initialReport: Report
  isNew: boolean
  onCancel: () => void
  onSave: (report: Report, onProgress?: (p: SaveProgress) => void) => Promise<Report | void> | void
  onAutosave?: (report: Report) => Promise<Report | void> | void
  flushRef?: MutableRefObject<(() => void) | null>
  saveMessage?: string
}

export function ReportForm({ initialReport, isNew, onCancel, onSave, onAutosave, flushRef, saveMessage }: ReportFormProps) {
  const [report, setReport] = useState<Report>(initialReport)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [progress, setProgress] = useState<SaveProgress | null>(null)
  const autosaveCallback = useRef(onAutosave)
  autosaveCallback.current = onAutosave
  // The last snapshot handed to a save, used to flush unsaved edits when leaving the form.
  const lastSent = useRef<Report>(initialReport)
  const latestReport = useRef(report)
  latestReport.current = report

  // Merge a finished save into the form without touching what the worker typed meanwhile:
  // only the assigned report number and newly uploaded files are taken from the result.
  const adoptSaved = useCallback((saved: Report) => {
    setReport((prev) => mergeSavedReport(prev, saved))
  }, [])

  useEffect(() => {
    if (!autosaveCallback.current || isSaving) return
    if (report === lastSent.current) return

    const timer = window.setTimeout(() => {
      lastSent.current = report
      void Promise.resolve(autosaveCallback.current?.({ ...report, status: 'draft' })).then((saved) => {
        if (saved) adoptSaved(saved)
      })
    }, 1500)

    return () => window.clearTimeout(timer)
  }, [report, isSaving, adoptSaved])

  // Saves unsaved edits immediately instead of waiting for the autosave timer.
  const flush = useCallback(() => {
    const current = latestReport.current
    if (autosaveCallback.current && current !== lastSent.current) {
      lastSent.current = current
      void autosaveCallback.current({ ...current, status: 'draft' })
    }
  }, [])

  // Expose flush to the app (used before logging out) and save when the phone hides or closes the page.
  useEffect(() => {
    if (flushRef) flushRef.current = flush
    const onHide = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      if (flushRef && flushRef.current === flush) flushRef.current = null
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
    }
  }, [flush, flushRef])

  function handleBack() {
    // Leaving used to cancel the pending autosave, losing the last ~1.5 seconds of typing.
    flush()
    onCancel()
  }

  const updateDetails = useCallback((patch: Partial<ReportDetails>) => {
    setReport((prev) => ({ ...prev, details: { ...prev.details, ...patch } }))
  }, [])

  const updateInspection = useCallback((updated: Inspection) => {
    setReport((prev) => ({
      ...prev,
      inspections: prev.inspections.map((i) => (i.id === updated.id ? updated : i)),
    }))
  }, [])

  const updateFindings = useCallback((findings: Finding[]) => {
    setReport((prev) => ({ ...prev, findings }))
  }, [])

  async function handleSaveDraft() {
    if (isSaving) return
    setError(null)
    setIsSaving(true)
    try {
      lastSent.current = report
      const result = await onSave({ ...report, status: 'draft' }, setProgress)
      if (result) setReport((prev) => ({ ...mergeSavedReport(prev, result), status: result.status }))
    } finally {
      setIsSaving(false)
      setProgress(null)
    }
  }

  async function handleFinish() {
    if (isSaving) return
    const missing: string[] = []
    if (!report.details.address.trim()) missing.push('כתובת')
    if (!report.details.apartment.trim()) missing.push('מספר דירה')
    if (!report.details.inspector.trim()) missing.push('מבצע הבדיקה')

    if (missing.length > 0) {
      setError(`כדי לסיים את הדוח יש להשלים: ${missing.join(', ')}`)
      return
    }
    setError(null)
    setIsSaving(true)
    try {
      lastSent.current = report
      const result = await onSave({ ...report, status: resolveFinalStatus(report) }, setProgress)
      if (result) setReport((prev) => ({ ...mergeSavedReport(prev, result), status: result.status }))
    } finally {
      setIsSaving(false)
      setProgress(null)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/95 px-2 py-2 backdrop-blur">
        <button
          type="button"
          onClick={handleBack}
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

        <section aria-labelledby="pdf-heading" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-col gap-0.5">
            <h2 id="pdf-heading" className="text-lg font-bold">הפקת דוח PDF</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">דוח לפי התבנית של שארק עם פרטי הדירה, תוצאות הבדיקות וכל תמונות לפני ואחרי. אם יש סרטונים, יורד קובץ ZIP עם ה-PDF והסרטונים.</p>
          </div>
          <PdfButton report={report} className="h-14 text-base" />
        </section>
      </main>

      <footer className="sticky bottom-0 z-20 flex flex-col gap-2 border-t border-border bg-card px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3">
        {saveMessage && !isSaving && (
          <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm leading-relaxed text-destructive">
            {saveMessage}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm leading-relaxed text-destructive">
            {error}
          </p>
        )}
        {isSaving && progress && (
          <div role="status" className="flex flex-col gap-1.5 rounded-lg bg-muted px-3 py-2">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span className="truncate">מעלה: {progress.fileName} ({Math.min(progress.done + 1, progress.total)}/{progress.total})</span>
              <span>{progress.percent}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        )}
        <div className="grid grid-cols-5 gap-2">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isSaving}
            className="col-span-2 flex h-14 items-center justify-center gap-2 rounded-xl border border-input bg-card text-base font-semibold hover:bg-muted disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Save className="size-5" aria-hidden="true" />}
            שמירת טיוטה
          </button>
          <button
            type="button"
            onClick={handleFinish}
            disabled={isSaving}
            className="col-span-3 flex h-14 items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <CheckCheck className="size-5" aria-hidden="true" />}
            {isSaving ? 'שומר...' : 'סיום ושמירת דוח'}
          </button>
        </div>
      </footer>
    </div>
  )
}

// Keeps everything the worker typed in `current`; takes from `saved` only the report number the
// database assigned and the stored copies of files that were pending upload.
function mergeSavedReport(current: Report, saved: Report): Report {
  let changed = false
  const reportNumber = current.details.reportNumber || saved.details.reportNumber
  if (reportNumber !== current.details.reportNumber) changed = true
  const inspections = current.inspections.map((inspection) => {
    const savedMedia = saved.inspections.find((item) => item.id === inspection.id)?.media ?? []
    let inspectionChanged = false
    const media = inspection.media.map((item) => {
      if (!item.file) return item
      const stored = savedMedia.find((candidate) => candidate.id === item.id && !candidate.file)
      if (!stored) return item
      inspectionChanged = true
      if (item.url.startsWith('blob:')) URL.revokeObjectURL(item.url)
      return { ...stored, phase: item.phase, location: item.location, note: item.note }
    })
    if (!inspectionChanged) return inspection
    changed = true
    return { ...inspection, media }
  })
  if (!changed) return current
  return { ...current, details: { ...current.details, reportNumber }, inspections }
}
