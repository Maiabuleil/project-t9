'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { Camera, ImagePlus, MapPin, Play, Video } from 'lucide-react'
import type { InspectionId, MediaItem, MediaPhase } from '@/lib/types'
import { createId } from '@/lib/report-utils'
import { cn } from '@/lib/utils'
import { MediaEditorSheet } from './media-editor-sheet'

type MediaSectionProps = {
  inspectionId: InspectionId
  media: MediaItem[]
  onChange: (media: MediaItem[]) => void
}

export const PHASE_LABEL: Record<MediaPhase, string> = {
  before: 'לפני העבודה',
  after: 'אחרי העבודה',
}

export function MediaSection({ inspectionId, media, onChange }: MediaSectionProps) {
  const [uploadPhase, setUploadPhase] = useState<MediaPhase>('before')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const selected = media.find((m) => m.id === selectedId) ?? null
  const before = media.filter((m) => m.phase === 'before')
  const after = media.filter((m) => m.phase === 'after')

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return

    const items: MediaItem[] = files.map((file) => ({
      id: createId(),
      url: URL.createObjectURL(file),
      kind: file.type.startsWith('video') ? 'video' : 'image',
      name: file.name,
      phase: uploadPhase,
      location: '',
      note: '',
    }))
    onChange([...media, ...items])
    if (items.length === 1) setSelectedId(items[0].id)
  }

  function updateItem(id: string, patch: Partial<MediaItem>) {
    onChange(media.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  function removeItem(id: string) {
    const item = media.find((m) => m.id === id)
    if (item?.url.startsWith('blob:')) URL.revokeObjectURL(item.url)
    setSelectedId(null)
    onChange(media.filter((m) => m.id !== id))
  }

  const phaseGroupId = `${inspectionId}-phase`

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-muted/60 p-3">
      <div className="flex flex-col gap-2">
        <span id={phaseGroupId} className="text-sm font-medium">
          תיעוד — קבצים חדשים ישויכו ל:
        </span>
        <div role="radiogroup" aria-labelledby={phaseGroupId} className="grid grid-cols-2 gap-1 rounded-xl bg-card p-1">
          {(['before', 'after'] as const).map((phase) => (
            <button
              key={phase}
              type="button"
              role="radio"
              aria-checked={uploadPhase === phase}
              onClick={() => setUploadPhase(phase)}
              className={cn(
                'h-11 rounded-lg text-sm font-semibold transition-colors',
                uploadPhase === phase
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {PHASE_LABEL[phase]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <CaptureButton icon={Camera} label="צילום תמונה" onClick={() => photoInputRef.current?.click()} />
        <CaptureButton icon={Video} label="צילום סרטון" onClick={() => videoInputRef.current?.click()} />
        <CaptureButton icon={ImagePlus} label="מהגלריה" onClick={() => galleryInputRef.current?.click()} />
      </div>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleFiles}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleFiles}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleFiles}
      />

      {media.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">השוואת לפני ואחרי</p>
          <div className="grid grid-cols-2 gap-2">
            <PhaseColumn phase="before" items={before} onSelect={setSelectedId} />
            <PhaseColumn phase="after" items={after} onSelect={setSelectedId} />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            לחצו על קובץ כדי לשנות שלב, להוסיף מיקום והערה או למחוק.
          </p>
        </div>
      )}

      <MediaEditorSheet
        item={selected}
        onClose={() => setSelectedId(null)}
        onUpdate={(patch) => selected && updateItem(selected.id, patch)}
        onRemove={() => selected && removeItem(selected.id)}
      />
    </div>
  )
}

function CaptureButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Camera
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl border border-input bg-card text-sm font-semibold text-foreground transition-colors hover:border-primary/50 active:bg-primary-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30"
    >
      <Icon className="size-6 text-primary" aria-hidden="true" />
      {label}
    </button>
  )
}

function PhaseColumn({
  phase,
  items,
  onSelect,
}: {
  phase: MediaPhase
  items: MediaItem[]
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-card p-2">
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'rounded-md px-2 py-0.5 text-xs font-bold',
            phase === 'before' ? 'bg-destructive-soft text-destructive' : 'bg-success-soft text-success',
          )}
        >
          {phase === 'before' ? 'לפני' : 'אחרי'}
        </span>
        <span className="text-xs text-muted-foreground">{items.length} קבצים</span>
      </div>
      {items.length === 0 ? (
        <div className="flex aspect-square items-center justify-center rounded-md border border-dashed border-input px-2 text-center text-xs leading-relaxed text-muted-foreground">
          {phase === 'before' ? 'אין עדיין תיעוד לפני' : 'אין עדיין תיעוד אחרי'}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <MediaThumb item={item} onClick={() => onSelect(item.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function MediaThumb({ item, onClick }: { item: MediaItem; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col gap-1 text-start focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30 rounded-md"
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-muted">
        {item.kind === 'image' ? (
          <img src={item.url || '/placeholder.svg'} alt={item.note || item.location || 'תמונת תיעוד'} className="size-full object-cover" />
        ) : (
          <>
            <video src={item.url} muted playsInline preload="metadata" className="size-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-foreground/25">
              <span className="flex size-10 items-center justify-center rounded-full bg-card/90 text-foreground">
                <Play className="size-5 fill-current" aria-hidden="true" />
                <span className="sr-only">סרטון</span>
              </span>
            </span>
          </>
        )}
      </div>
      <span
        className={cn(
          'flex items-center gap-1 truncate text-xs',
          item.location ? 'text-foreground' : 'text-primary font-medium',
        )}
      >
        <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{item.location || 'הוספת מיקום'}</span>
      </span>
    </button>
  )
}
