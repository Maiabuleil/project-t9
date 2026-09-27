'use client'

import { useEffect, useRef } from 'react'
import { Trash2, X } from 'lucide-react'
import type { MediaItem, MediaPhase } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Field, TextArea, TextInput } from './fields'

type MediaEditorSheetProps = {
  item: MediaItem | null
  onClose: () => void
  onUpdate: (patch: Partial<MediaItem>) => void
  onRemove: () => void
}

const PHASES: { value: MediaPhase; label: string }[] = [
  { value: 'before', label: 'לפני העבודה' },
  { value: 'after', label: 'אחרי העבודה' },
]

export function MediaEditorSheet({ item, onClose, onUpdate, onRemove }: MediaEditorSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isOpen = item !== null

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (isOpen && !dialog.open) dialog.showModal()
    if (!isOpen && dialog.open) dialog.close()
  }, [isOpen])

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
      aria-labelledby="media-editor-title"
      className="m-0 mx-auto mt-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-0 text-card-foreground backdrop:bg-foreground/50"
    >
      {item && (
        <div className="flex flex-col gap-4 p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <div className="flex items-center justify-between">
            <h2 id="media-editor-title" className="text-lg font-bold">
              פרטי קובץ
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="flex size-11 items-center justify-center rounded-xl hover:bg-muted"
            >
              <X className="size-6" aria-hidden="true" />
              <span className="sr-only">סגירה</span>
            </button>
          </div>

          <div className="overflow-hidden rounded-xl bg-foreground">
            {item.kind === 'image' ? (
              <img src={item.url || '/placeholder.svg'} alt={item.note || 'תצוגה מקדימה'} className="max-h-72 w-full object-contain" />
            ) : (
              <video src={item.url} controls playsInline className="max-h-72 w-full" />
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground" dir="ltr">
            {item.name}
          </p>

          <div role="radiogroup" aria-label="שלב העבודה" className="grid grid-cols-2 gap-2">
            {PHASES.map((phase) => (
              <button
                key={phase.value}
                type="button"
                role="radio"
                aria-checked={item.phase === phase.value}
                onClick={() => onUpdate({ phase: phase.value })}
                className={cn(
                  'h-12 rounded-xl border-2 text-base font-semibold transition-colors',
                  item.phase === phase.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-card text-muted-foreground hover:bg-muted',
                )}
              >
                {phase.label}
              </button>
            ))}
          </div>

          <Field id="media-location" label="מיקום">
            <TextInput
              id="media-location"
              value={item.location}
              onChange={(e) => onUpdate({ location: e.target.value })}
              placeholder="לדוגמה: מקלחת הורים, קו כיור מטבח"
            />
          </Field>

          <Field id="media-note" label="הערה">
            <TextArea
              id="media-note"
              rows={2}
              value={item.note}
              onChange={(e) => onUpdate({ note: e.target.value })}
              placeholder="מה רואים בתיעוד?"
            />
          </Field>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onRemove}
              className="flex h-14 items-center justify-center gap-2 rounded-xl border border-destructive/40 text-base font-semibold text-destructive hover:bg-destructive-soft"
            >
              <Trash2 className="size-5" aria-hidden="true" />
              מחיקה
            </button>
            <button
              type="button"
              onClick={onClose}
              className="col-span-2 h-14 rounded-xl bg-primary text-base font-bold text-primary-foreground hover:bg-primary/90"
            >
              שמירה
            </button>
          </div>
        </div>
      )}
    </dialog>
  )
}
