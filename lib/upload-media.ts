import * as tus from 'tus-js-client'
import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'report-media'
// Supabase's resumable endpoint requires exactly 6MB chunks.
const TUS_CHUNK_SIZE = 6 * 1024 * 1024
// Files at or below this size go through the simple upload; larger ones use TUS so a
// dropped connection can resume instead of restarting the whole transfer.
const RESUMABLE_THRESHOLD = 6 * 1024 * 1024

export type UploadProgress = { loaded: number; total: number }

type UploadArgs = {
  supabase: SupabaseClient
  path: string
  file: File
  onProgress?: (progress: UploadProgress) => void
}

// Uploads a single file to the private bucket. Small images use the standard upload;
// videos and large files use the resumable TUS protocol with progress + retries.
export async function uploadMediaFile({ supabase, path, file, onProgress }: UploadArgs): Promise<void> {
  const useResumable = file.type.startsWith('video') || file.size > RESUMABLE_THRESHOLD
  if (!useResumable) {
    onProgress?.({ loaded: 0, total: file.size })
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type })
    if (error) throw error
    onProgress?.({ loaded: file.size, total: file.size })
    return
  }

  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) throw new Error('missing-session')

  const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: BUCKET,
        objectName: path,
        contentType: file.type,
        cacheControl: '3600',
      },
      chunkSize: TUS_CHUNK_SIZE,
      onError: (error) => reject(error),
      onProgress: (loaded, total) => onProgress?.({ loaded, total }),
      onSuccess: () => resolve(),
    })
    upload.findPreviousUploads().then((previous) => {
      if (previous.length) upload.resumeFromPreviousUpload(previous[0])
      upload.start()
    })
  })
}
