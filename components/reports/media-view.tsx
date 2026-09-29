'use client'

import { useCallback, useEffect, useState } from 'react'
import { ImageOff, Play, RefreshCw } from 'lucide-react'
import type { MediaItem } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

type MediaViewProps = {
  item: MediaItem
  variant?: 'thumb' | 'preview'
}

// Signed URLs from a private bucket expire, so each MediaView resolves its own
// fresh URL from the stored path instead of trusting a URL captured at load time.
const SIGNED_URL_TTL = 3600

export function MediaView({ item, variant = 'thumb' }: MediaViewProps) {
  const isPreview = variant === 'preview'
  // Pending local files carry a ready-to-use blob: URL and have no storage path yet.
  const isPending = Boolean(item.file)
  const [url, setUrl] = useState(isPending ? item.url : '')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(isPending ? 'ready' : 'loading')
  const [attempt, setAttempt] = useState(0)

  const resolve = useCallback(async () => {
    if (item.file) {
      setUrl(item.url)
      setStatus('ready')
      return
    }
    if (!item.storagePath) {
      setStatus('error')
      return
    }
    setStatus('loading')
    const supabase = createClient()
    const { data, error } = await supabase.storage.from('report-media').createSignedUrl(item.storagePath, SIGNED_URL_TTL)
    if (error || !data?.signedUrl) {
      setStatus('error')
      return
    }
    setUrl(data.signedUrl)
    setStatus('ready')
  }, [item.file, item.url, item.storagePath])

  useEffect(() => {
    void resolve()
  }, [resolve])

  // A media element error usually means the signed URL expired mid-session:
  // regenerate it once before giving up so long-open reports keep rendering.
  function handleMediaError() {
    if (!item.file && attempt < 1) {
      setAttempt((count) => count + 1)
      void resolve()
      return
    }
    setStatus('error')
  }

  if (status === 'loading') {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-muted text-xs text-muted-foreground',
          isPreview ? 'min-h-48 w-full' : 'size-full',
        )}
      >
        טוען...
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-1.5 bg-muted p-2 text-center text-muted-foreground',
          isPreview ? 'min-h-48 w-full' : 'size-full',
        )}
      >
        <ImageOff className={isPreview ? 'size-8' : 'size-6'} aria-hidden="true" />
        <span className="text-xs leading-tight">הקובץ חסר או שאין הרשאה</span>
        {isPreview && (
          <button
            type="button"
            onClick={() => {
              setAttempt(0)
              void resolve()
            }}
            className="mt-0.5 flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary-soft"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            נסו שוב
          </button>
        )}
      </div>
    )
  }

  if (item.kind === 'image') {
    return (
      <img
        src={url || '/placeholder.svg'}
        alt={item.note || item.location || 'תמונת תיעוד'}
        className={isPreview ? 'max-h-72 w-full object-contain' : 'size-full object-cover'}
        onError={handleMediaError}
      />
    )
  }

  return (
    <>
      <video
        src={url}
        controls={isPreview}
        muted={!isPreview}
        playsInline
        preload="metadata"
        className={isPreview ? 'max-h-72 w-full' : 'size-full object-cover'}
        onError={handleMediaError}
      />
      {!isPreview && (
        <span className="absolute inset-0 flex items-center justify-center bg-foreground/25">
          <span className="flex size-10 items-center justify-center rounded-full bg-card/90 text-foreground">
            <Play className="size-5 fill-current" aria-hidden="true" />
            <span className="sr-only">סרטון</span>
          </span>
        </span>
      )}
    </>
  )
}
