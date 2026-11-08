'use client'

import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import type { Report } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { PdfProgress } from './generate-report-pdf'

type PdfButtonProps = {
  report: Report
  variant?: 'full' | 'icon'
  className?: string
}

// Creates and downloads the report as a PDF: details, results, terms and every before/after photo.
export function PdfButton({ report, variant = 'full', className }: PdfButtonProps) {
  const [progress, setProgress] = useState<PdfProgress | null>(null)
  const [error, setError] = useState('')
  const busy = progress !== null

  async function handleClick() {
    if (busy) return
    setError('')
    setProgress({ step: 'מכין', done: 0, total: 0 })
    try {
      const { generateReportPdf } = await import('./generate-report-pdf')
      await generateReportPdf(report, setProgress)
    } catch (failure) {
      console.error('Creating PDF failed', failure)
      setError('יצירת ה-PDF נכשלה. בדקו את החיבור ונסו שוב.')
    } finally {
      setProgress(null)
    }
  }

  const status = progress && progress.total > 0 ? `${progress.step} ${progress.done}/${progress.total}` : progress?.step

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-label={variant === 'icon' ? (busy ? `מכין PDF: ${status}` : 'הפקת PDF') : undefined}
        className={cn(
          'flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30 disabled:opacity-70',
          variant === 'full' ? 'h-12 border border-primary/40 bg-primary-soft px-3 text-sm text-primary hover:bg-primary-soft/70' : 'size-11 shrink-0 text-primary hover:bg-primary-soft',
          className,
        )}
      >
        {busy ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <FileDown className="size-5" aria-hidden="true" />}
        {variant === 'full' && (busy ? status : 'הפקת PDF')}
      </button>
      {(busy || error) && (
        <p
          role={error ? 'alert' : 'status'}
          className={cn(
            'fixed inset-x-4 bottom-24 z-50 mx-auto max-w-sm rounded-xl px-4 py-3 text-center text-sm font-medium shadow-lg',
            error ? 'bg-destructive text-primary-foreground' : 'bg-foreground text-background',
          )}
          onClick={() => setError('')}
        >
          {error || `מכין PDF... ${status}`}
        </p>
      )}
    </>
  )
}
