'use client'

import { Plus, Trash2 } from 'lucide-react'
import type { Finding, Severity } from '@/lib/types'
import { createId, SEVERITY_META, SEVERITY_ORDER } from '@/lib/report-utils'
import { cn } from '@/lib/utils'
import { Field, FormSection, TextArea, TextInput } from './fields'

type FindingsSectionProps = {
  findings: Finding[]
  onChange: (findings: Finding[]) => void
}

export function FindingsSection({ findings, onChange }: FindingsSectionProps) {
  function addFinding() {
    onChange([
      ...findings,
      { id: createId(), location: '', description: '', severity: 'medium', recommendation: '' },
    ])
  }

  function updateFinding(id: string, patch: Partial<Finding>) {
    onChange(findings.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  function removeFinding(id: string) {
    onChange(findings.filter((f) => f.id !== id))
  }

  return (
    <FormSection
      step={3}
      id="findings-heading"
      title="ממצאים"
      description="תיעוד ליקויים שנמצאו, דרגת חומרה והמלצה לטיפול."
    >
      {findings.length > 0 && (
        <ol className="flex flex-col gap-4">
          {findings.map((finding, index) => (
            <li key={finding.id}>
              <FindingCard
                index={index + 1}
                finding={finding}
                onChange={(patch) => updateFinding(finding.id, patch)}
                onRemove={() => removeFinding(finding.id)}
              />
            </li>
          ))}
        </ol>
      )}

      <button
        type="button"
        onClick={addFinding}
        className="flex h-16 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/50 bg-primary-soft/50 text-lg font-bold text-primary hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30"
      >
        <Plus className="size-6" aria-hidden="true" />
        הוספת ממצא
      </button>
    </FormSection>
  )
}

function FindingCard({
  index,
  finding,
  onChange,
  onRemove,
}: {
  index: number
  finding: Finding
  onChange: (patch: Partial<Finding>) => void
  onRemove: () => void
}) {
  const base = `finding-${finding.id}`
  const severityLabelId = `${base}-severity`

  return (
    <article aria-label={`ממצא ${index}`} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold">ממצא {index}</h3>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-semibold',
              SEVERITY_META[finding.severity].badgeClassName,
            )}
          >
            {SEVERITY_META[finding.severity].label}
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="flex size-11 items-center justify-center rounded-xl text-destructive hover:bg-destructive-soft"
        >
          <Trash2 className="size-5" aria-hidden="true" />
          <span className="sr-only">מחיקת ממצא {index}</span>
        </button>
      </div>

      <Field id={`${base}-location`} label="מיקום">
        <TextInput
          id={`${base}-location`}
          value={finding.location}
          onChange={(e) => onChange({ location: e.target.value })}
          placeholder="לדוגמה: אמבטיה ראשית – מחסום רצפה"
        />
      </Field>

      <Field id={`${base}-description`} label="תיאור">
        <TextArea
          id={`${base}-description`}
          rows={2}
          value={finding.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="מה נמצא?"
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <span id={severityLabelId} className="text-sm font-medium">
          דרגת חומרה
        </span>
        <div role="radiogroup" aria-labelledby={severityLabelId} className="grid grid-cols-4 gap-1.5">
          {SEVERITY_ORDER.map((severity: Severity) => {
            const active = finding.severity === severity
            return (
              <button
                key={severity}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange({ severity })}
                className={cn(
                  'h-12 rounded-xl border-2 text-sm font-semibold transition-colors',
                  active
                    ? SEVERITY_META[severity].activeClassName
                    : 'border-input bg-card text-muted-foreground hover:bg-muted',
                )}
              >
                {SEVERITY_META[severity].label}
              </button>
            )
          })}
        </div>
      </div>

      <Field id={`${base}-recommendation`} label="המלצה">
        <TextArea
          id={`${base}-recommendation`}
          rows={2}
          value={finding.recommendation}
          onChange={(e) => onChange({ recommendation: e.target.value })}
          placeholder="פעולה מומלצת לתיקון"
        />
      </Field>
    </article>
  )
}
