import type { MediaItem } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

// Saves a photo or video to the device under its original file name.
// Stored files get a short-lived signed URL with a download header; files not yet uploaded download from the local copy.
export async function downloadMedia(item: MediaItem): Promise<void> {
  let href = item.url
  if (!item.file) {
    if (!item.storagePath) throw new Error('missing storage path')
    const { data, error } = await createClient().storage.from('report-media').createSignedUrl(item.storagePath, 300, { download: item.name || true })
    if (error || !data?.signedUrl) throw error ?? new Error('no signed url')
    href = data.signedUrl
  }
  const link = document.createElement('a')
  link.href = href
  link.download = item.name || (item.kind === 'video' ? 'video.mp4' : 'image.jpg')
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}
