'use client'

import { CircleCheck, CircleX, Droplets, ScanEye, Waves } from 'lucide-react'
import type { CheckResult, Inspection, InspectionId } from '@/lib/types'
import { INSPECTION_META } from '@/lib/report-utils'
import { cn } from '@/lib/utils'
import { Field, TextArea } from './fields'
import { MediaSection } from './media-section'

const ICONS: Record<InspectionId, typeof Droplets> = {
  flushing: Droplets,
  flood: Waves,
  camera: ScanEye,
}

type InspectionCardProps = {
  inspection: Inspection
  onChange: (inspection: Inspection) => void
}

export function InspectionCard({ inspection, onChange }: InspectionCardProps) {
  const meta = INSPECTION_META[inspection.id]
  const Icon = ICONS[inspection.id]
  const headingId = `inspection-${inspection.id}`

  function setResult(result: CheckResult) {
    onChange({ ...inspection, result: inspection.result === result ? null : result })
  }

  return (
    <article
      aria-labelledby={headingId}
      className={cn(
        'flex flex-col gap-4 rounded-2xl border-2 bg-card p-4 transition-colors',
        inspection.result === 'ok' && 'border-success/50',
        inspection.result === 'not-ok' && 'border-destructive/50',
        inspection.result === null && 'border-border',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-0.5">
          <h3 id={headingId} className="text-lg font-bold">
            {meta.title}
          </h3>
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{meta.description}</p>
        </div>
      </div>

      <div role="group" aria-label={`תוצאת ${meta.title}`} className="grid grid-cols-2 gap-2">
        <ResultButton
          active={inspection.result === 'ok'}
          onClick={() => setResult('ok')}
          tone="ok"
          label={inspection.id === 'flushing' ? 'כן' : 'תקין'}
        />
        <ResultButton
          active={inspection.result === 'not-ok'}
          onClick={() => setResult('not-ok')}
          tone="not-ok"
          label={inspection.id === 'flushing' ? 'לא' : 'לא תקין'}
        />
      </div>

      <Field id={`${headingId}-note`} label="הערה">
        <TextArea
          id={`${headingId}-note`}
          rows={2}
          value={inspection.note}
          onChange={(e) => onChange({ ...inspection, note: e.target.value })}
          placeholder="תיאור קצר של מה שנמצא בבדיקה"
        />
      </Field>

      <MediaSection
        inspectionId={inspection.id}
        media={inspection.media}
        onChange={(media) => onChange({ ...inspection, media })}
      />
    </article>
  )
}

function ResultButton({
  active,
  onClick,
  tone,
  label,
}: {
  active: boolean
  onClick: () => void
  tone: 'ok' | 'not-ok'
  label: string
}) {
  const isOk = tone === 'ok'
  const Icon = isOk ? CircleCheck : CircleX
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex h-14 items-center justify-center gap-2 rounded-xl border-2 text-base font-bold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30',
        !active && 'border-input bg-card text-muted-foreground hover:bg-muted',
        active && isOk && 'border-success bg-success text-primary-foreground',
        active && !isOk && 'border-destructive bg-destructive text-primary-foreground',
      )}
    >
      <Icon className="size-6" aria-hidden="true" />
      {label}
    </button>
  )
}
