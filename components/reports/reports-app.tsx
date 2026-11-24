'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, LogOut, UserPlus } from 'lucide-react'
import { SAMPLE_REPORTS } from '@/lib/sample-data'
import { createEmptyReport } from '@/lib/report-utils'
import type { Inspection, MediaItem, Report } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { uploadMediaFile } from '@/lib/upload-media'
import { ReportList } from './report-list'
import { ReportForm } from './report-form'
import { LoginScreen } from '@/components/auth/login-screen'

const inspectionNames = ['flushing', 'flood', 'camera', 'ac-line'] as const
// Saving used to report every failure as a connection problem, even when the database refused the change
// (for example a worker editing a report that belongs to someone else). Each cause now gets its own message.
function saveErrorMessage(error: { code?: string; message?: string } | null, action: string) {
  const message = (error?.message ?? '').toLowerCase()
  if (error?.code === '42501' || message.includes('row-level security') || message.includes('permission denied')) {
    return `${action}: אין לך הרשאה לעדכן את הדוח הזה. כנראה שהוא שייך למשתמש אחר. פנו למנהל המערכת.`
  }
  if (error?.code === 'PGRST301' || message.includes('jwt')) return `${action}: פג תוקף ההתחברות. התנתקו והתחברו מחדש.`
  if (error?.code === '23505') return `${action}: מספר הדוח כבר קיים בדוח אחר.`
  if (!error?.code || message.includes('fetch') || message.includes('network')) return `${action}. בדקו את החיבור לאינטרנט ונסו שוב.`
  return `${action} (קוד ${error.code}). נסו שוב או פנו למנהל המערכת.`
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const REPORT_COLUMNS = 'id, status, project, report_number, address, building, apartment, floor, client_name, inspector, report_date, owner_id, inspections(id, inspection_key, result, note), findings(id, location, description, severity, recommendation)'

// Loads reports with their photos (fresh signed URLs). Pass an id to load a single report.
async function fetchReports(supabase: any, onlyId?: string): Promise<{ reports: Report[]; mediaFailed: boolean }> {
  let query = supabase.from('reports').select(REPORT_COLUMNS)
  query = onlyId ? query.eq('id', onlyId) : query.order('updated_at', { ascending: false })
  const { data: rows, error } = await query
  if (error) throw error
  const reportRows = rows ?? []
  const reportIds = reportRows.map((row: any) => row.id)
  const { data: mediaRows, error: mediaError } = reportIds.length
    ? await supabase.from('media_assets').select('id, report_id, inspection_id, storage_path, kind, phase, file_name, location, note').in('report_id', reportIds)
    : { data: [] as any[], error: null }
  if (mediaError) console.error('Loading report media failed', mediaError)
  // One request signs every photo link (one request per photo made the list slow to open).
  const paths = (mediaRows ?? []).map((media: any) => media.storage_path)
  const { data: signedList, error: signError } = paths.length
    ? await supabase.storage.from('report-media').createSignedUrls(paths, 60 * 60 * 12)
    : { data: [] as any[], error: null }
  if (signError) console.error('Signing photo links failed', signError)
  const urlByPath = new Map<string, string>((signedList ?? []).map((entry: any) => [entry.path, entry.signedUrl ?? '']))
  const mediaWithUrls = (mediaRows ?? []).map((media: any) => ({ ...media, url: urlByPath.get(media.storage_path) ?? '' }))
  return {
    reports: reportRows.map((row: any) => fromDatabase(row, mediaWithUrls.filter((media: any) => media.report_id === row.id))),
    mediaFailed: Boolean(mediaError),
  }
}

type MediaMeta = { location: string; note: string; phase: MediaItem['phase'] }
type DetailValues = ReturnType<typeof detailValues>

// What the database held when the report was opened (or last saved from this device). Saves write only
// what changed against it, so a form opened earlier can never overwrite or delete what another worker
// added meanwhile, and a photo is removed only when it was on screen and the worker deleted it.
type Baseline = {
  details: DetailValues
  inspections: Map<string, { result: Inspection['result']; note: string }>
  findings: string
  media: Map<string, MediaMeta>
}

function detailValues(report: Report) {
  const d = report.details
  return { status: report.status, project: d.project, address: d.address, building: d.building, apartment: d.apartment, floor: d.floor, client_name: d.clientName, inspector: d.inspector, report_date: d.date || null }
}

function findingsKey(report: Report) {
  return JSON.stringify(report.findings.map((f) => [f.location, f.description, f.severity, f.recommendation]))
}

function baselineOf(report: Report): Baseline {
  return {
    details: detailValues(report),
    inspections: new Map(report.inspections.map((inspection) => [inspection.id, { result: inspection.result, note: inspection.note }])),
    findings: findingsKey(report),
    media: new Map(report.inspections.flatMap((inspection) => inspection.media.filter((m) => !m.file).map((m) => [m.id, { location: m.location, note: m.note, phase: m.phase }] as const))),
  }
}

function sameMeta(a: MediaMeta | undefined, b: MediaMeta) {
  return a !== undefined && a.location === b.location && a.note === b.note && a.phase === b.phase
}

export type SaveProgress = { fileName: string; done: number; total: number; percent: number }

export function ReportsApp() {
  const [session, setSession] = useState<any>(null)
  const [profile, setProfile] = useState<{ full_name: string; role: 'worker' | 'manager' } | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const [activeReport, setActiveReport] = useState<Report | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  // Saves run one at a time, in order. Overlapping saves (autosave + manual save) used to finish
  // out of order, so an older snapshot could overwrite newer text and duplicate findings/uploads.
  const saveChain = useRef<Promise<unknown>>(Promise.resolve())
  // Pending local media id -> stored item, so a queued save holding an older snapshot never uploads the same file twice.
  const uploadedMedia = useRef(new Map<string, MediaItem>())
  const baselines = useRef(new Map<string, Baseline>())
  const [openingId, setOpeningId] = useState<string | null>(null)
  const lastListLoad = useRef(0)
  const userId: string | undefined = session?.user?.id
  // Set by the open report form: saves its latest unsaved edits right away.
  const flushForm = useRef<(() => void) | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }: { data: { session: any } }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event: any, next: any) => setSession(next))
    return () => listener.subscription.unsubscribe()
  }, [])

  // Reload only when the signed-in user changes. Supabase emits a new session object on every token
  // refresh and when the tab regains focus; reloading on each one re-signed every image URL and slowed the app.
  useEffect(() => {
    if (!userId) { setLoading(false); return }
    const load = async () => {
      const supabase = createClient()
      const { data: currentProfile } = await supabase.from('profiles').select('full_name, role').eq('id', userId).single()
      setProfile(currentProfile)
      try {
        const { reports: loaded, mediaFailed } = await fetchReports(supabase)
        setReports(loaded)
        lastListLoad.current = Date.now()
        if (mediaFailed) setMessage('טעינת התמונות נכשלה. בדקו את החיבור ונסו שוב.')
      } catch (loadError) {
        console.error('Loading reports failed', loadError)
        setMessage('טעינת הדוחות נכשלה. בדקו את החיבור ונסו שוב.')
      }
      setLoading(false)
    }
    load()
  }, [userId])

  // Show what other workers saved: refresh the list when the app comes back to the screen.
  useEffect(() => {
    if (!userId) return
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastListLoad.current > 60_000) void refreshList()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [userId])

  if (!session) return <LoginScreen />
  if (loading) return <main className="flex min-h-dvh items-center justify-center text-muted-foreground">טוען את הדוחות...</main>

  // Logging out used to cancel the pending autosave, so edits made just before switching users were lost.
  async function signOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      flushForm.current?.()
      await saveChain.current
    } finally {
      await createClient().auth.signOut()
      setSigningOut(false)
    }
  }

  async function refreshList() {
    // Wait for queued saves so the list never shows a version older than what was just saved.
    await saveChain.current
    try {
      const { reports: loaded } = await fetchReports(createClient())
      lastListLoad.current = Date.now()
      setReports(loaded)
    } catch (refreshError) {
      console.error('Refreshing reports failed', refreshError)
    }
  }

  async function openReport(report: Report, fresh: boolean) {
    setMessage('')
    if (fresh) {
      setActiveReport(report); setIsNew(true); window.scrollTo({ top: 0 })
      return
    }
    // Always open the latest version from the database, so photos and text added by other workers show up
    // and the form never starts from an outdated copy.
    setOpeningId(report.id)
    let latest = report
    try {
      await saveChain.current
      const { reports: found, mediaFailed } = await fetchReports(createClient(), report.id)
      if (found[0]) {
        latest = found[0]
        setReports((prev) => prev.map((item) => (item.id === latest.id ? latest : item)))
      }
      if (mediaFailed) setMessage('טעינת התמונות של הדוח נכשלה. התמונות לא נמחקו. נסו לפתוח את הדוח שוב.')
    } catch (openError) {
      console.error('Opening latest report failed', openError)
      setMessage('לא ניתן לטעון את הגרסה העדכנית של הדוח. בדקו את החיבור ונסו שוב.')
    }
    baselines.current.set(latest.id, baselineOf(latest))
    setOpeningId(null)
    setActiveReport(latest); setIsNew(false); window.scrollTo({ top: 0 })
  }

  function closeReport() { setActiveReport(null); window.scrollTo({ top: 0 }); void refreshList() }

  async function deleteReport(report: Report) {
    setMessage('')
    const response = await fetch(`/api/manager/reports/${report.id}`, { method: 'DELETE' })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setMessage(data.error || 'מחיקת הדוח נכשלה. הדוח לא נמחק.')
      return
    }
    setReports((current) => current.filter((item) => item.id !== report.id))
    setMessage('הדוח נמחק בהצלחה.')
  }

  function saveReport(report: Report, close = true, onProgress?: (p: SaveProgress) => void): Promise<Report | void> {
    const run = saveChain.current.then(() => saveReportNow(report, close, onProgress))
    saveChain.current = run.catch((error) => console.error('Saving report failed', error))
    return run
  }

  async function saveReportNow(report: Report, close: boolean, onProgress?: (p: SaveProgress) => void): Promise<Report | void> {
    setMessage('')
    console.log('[v0] saving report', { id: report.id, status: report.status })
    const supabase = createClient()
    const ownerId = report.ownerId ?? session.user.id
    const baseline = baselines.current.get(report.id)
    const values = detailValues(report)

    // Report details: a report already in the database gets only the fields that changed.
    let saved: { id: string; report_number: string | null } | null = null
    let reportError: any = null
    const changedDetails = baseline
      ? Object.fromEntries(Object.entries(values).filter(([key, value]) => baseline.details[key as keyof DetailValues] !== value))
      : {}
    if (baseline && report.details.reportNumber && Object.keys(changedDetails).length === 0) {
      saved = { id: report.id, report_number: report.details.reportNumber }
    } else if (baseline) {
      const result = await supabase.from('reports').update({ ...changedDetails, updated_at: new Date().toISOString() }).eq('id', report.id).select('id, report_number').maybeSingle()
      saved = result.data
      reportError = result.error
    }
    if (!saved && !reportError) {
      // New report (or one that is not in the database yet): write all fields.
      // Omit report_number for brand-new reports so the database sequence assigns a unique number (safe under concurrency).
      const basePayload = { id: report.id, owner_id: ownerId, ...values, updated_at: new Date().toISOString() }
      const payload = report.details.reportNumber ? { ...basePayload, report_number: report.details.reportNumber } : basePayload
      const result = await supabase.from('reports').upsert(payload).select('id, report_number').single()
      saved = result.data
      reportError = result.error
    }
    if (reportError || !saved) {
      console.error('Saving report failed', reportError?.code, reportError?.message, reportError?.details)
      setMessage(saveErrorMessage(reportError, 'שמירת הדוח נכשלה'))
      return
    }
    const reportId = saved.id
    const nextBaseline: Baseline = baseline
      ? { ...baseline, details: values, inspections: new Map(baseline.inspections), media: new Map(baseline.media) }
      : { details: values, inspections: new Map(), findings: '[]', media: new Map() }
    baselines.current.set(reportId, nextBaseline)

    // Inspections: never deleted (that used to take their photos with them); only changed ones are written.
    const pendingKeys = report.inspections.filter((inspection) => inspection.media.some((m) => m.file)).map((inspection) => inspection.id)
    const changedInspections = report.inspections.filter((inspection) => {
      const before = nextBaseline.inspections.get(inspection.id)
      return before ? before.result !== inspection.result || before.note !== inspection.note : inspection.result !== null || inspection.note.trim() !== ''
    })
    if (pendingKeys.length) {
      // Make sure a row exists to attach new photos to, without overwriting one another worker created.
      const { error: ensureError } = await supabase.from('inspections').upsert(report.inspections.filter((inspection) => pendingKeys.includes(inspection.id)).map((inspection) => ({ report_id: reportId, inspection_key: inspection.id, result: inspection.result, note: inspection.note })), { onConflict: 'report_id,inspection_key', ignoreDuplicates: true })
      if (ensureError) {
        console.error('Preparing inspections failed', ensureError.code, ensureError.message)
        setMessage(saveErrorMessage(ensureError, 'שמירת פרטי הבדיקות נכשלה'))
        return
      }
    }
    if (changedInspections.length) {
      const { error: inspectionError } = await supabase.from('inspections').upsert(changedInspections.map((inspection) => ({ report_id: reportId, inspection_key: inspection.id, result: inspection.result, note: inspection.note })), { onConflict: 'report_id,inspection_key' })
      if (inspectionError) {
        console.error('Saving inspections failed', inspectionError.code, inspectionError.message)
        setMessage(saveErrorMessage(inspectionError, 'שמירת פרטי הבדיקות נכשלה'))
        return
      }
      for (const inspection of changedInspections) nextBaseline.inspections.set(inspection.id, { result: inspection.result, note: inspection.note })
    }
    let inspectionIds = new Map<string, string>()
    if (pendingKeys.length) {
      const { data: inspectionRows, error: idsError } = await supabase.from('inspections').select('id, inspection_key').eq('report_id', reportId)
      if (idsError) {
        console.error('Reading inspections failed', idsError.code, idsError.message)
        setMessage(saveErrorMessage(idsError, 'שמירת פרטי הבדיקות נכשלה'))
        return
      }
      inspectionIds = new Map((inspectionRows ?? []).map((row: any) => [row.inspection_key, row.id]))
    }

    // Findings: written only when they changed. New rows go in first and the old ones are removed only after
    // that succeeded, so a failure can never leave the report without its findings.
    const currentFindings = findingsKey(report)
    if (currentFindings !== nextBaseline.findings) {
      const { data: oldFindings, error: oldFindingsError } = await supabase.from('findings').select('id').eq('report_id', reportId)
      const { error: insertFindingsError } = oldFindingsError
        ? { error: oldFindingsError }
        : report.findings.length
          ? await supabase.from('findings').insert(report.findings.map((finding) => ({ report_id: reportId, location: finding.location, description: finding.description, severity: finding.severity, recommendation: finding.recommendation })))
          : { error: null }
      if (insertFindingsError) {
        console.error('Saving findings failed', insertFindingsError)
        setMessage(saveErrorMessage(insertFindingsError, 'שמירת הממצאים נכשלה'))
      } else {
        const oldIds = (oldFindings ?? []).map((row: any) => row.id)
        if (oldIds.length) await supabase.from('findings').delete().in('id', oldIds)
        nextBaseline.findings = currentFindings
      }
    }

    // Photo removal: only photos that were on screen when the report was opened and that the worker deleted.
    // Photos added by someone else after opening, or that failed to load, are never touched. The file itself is
    // kept in storage, so a deleted photo can still be recovered.
    if (close && baseline && !report.inspections.some((inspection) => inspection.media.some((media) => media.file))) {
      const onScreen = new Set(report.inspections.flatMap((inspection) => inspection.media.map((media) => media.id)))
      const removedIds = [...nextBaseline.media.keys()].filter((id) => !onScreen.has(id))
      for (const id of removedIds) {
        const { error: rowError } = await supabase.from('media_assets').delete().eq('id', id).eq('report_id', reportId)
        if (rowError) { console.error('Removing media record failed', rowError); setMessage(saveErrorMessage(rowError, 'מחיקת התמונה נכשלה')); return }
        nextBaseline.media.delete(id)
      }
    }
    // Upload each pending file. On failure keep the item pending so it can be retried from the same report without duplicating already-uploaded files.
    const failedNames: string[] = []
    const persistedInspections: Inspection[] = []
    const pendingTotal = report.inspections.reduce((sum, inspection) => sum + inspection.media.filter((media) => media.file).length, 0)
    let pendingDone = 0
    for (const inspection of report.inspections) {
      const nextMedia: MediaItem[] = []
      for (const media of inspection.media) {
        const alreadyUploaded = media.file ? uploadedMedia.current.get(media.id) : undefined
        if (alreadyUploaded) {
          // An earlier save already uploaded this file; keep the stored copy and its latest details.
          const stored = { ...alreadyUploaded, phase: media.phase, location: media.location, note: media.note }
          const meta = { location: stored.location, note: stored.note, phase: stored.phase }
          if (!sameMeta(nextBaseline.media.get(stored.id), meta)) {
            const { error: updateError } = await supabase.from('media_assets').update(meta).eq('id', stored.id).eq('report_id', reportId)
            if (updateError) { console.error('Updating media details failed', stored.id, updateError); failedNames.push(stored.name) }
            else nextBaseline.media.set(stored.id, meta)
          }
          nextMedia.push(stored)
          continue
        }
        if (!media.file) {
          // Existing photo: write its location/note only when the worker changed them, so an older copy of the
          // report can never overwrite text another worker wrote on the same photo.
          const meta = { location: media.location, note: media.note, phase: media.phase }
          if (!sameMeta(nextBaseline.media.get(media.id), meta)) {
            const { data: updatedMedia, error: updateError } = await supabase.from('media_assets')
              .update(meta)
              .eq('id', media.id).eq('report_id', reportId).select('id').maybeSingle()
            if (updateError || !updatedMedia) {
              console.error('Updating media details failed', media.id, updateError)
              failedNames.push(media.name)
            } else {
              nextBaseline.media.set(media.id, meta)
            }
          }
          nextMedia.push(media)
          continue
        }
        // Build a Supabase-safe storage key: raw device filenames often contain Hebrew, spaces, or symbols that Storage rejects as an "Invalid key", which fails the upload. The random media.id keeps the key unique; the human-readable name stays in the file_name column.
        const rawExt = media.name.includes('.') ? media.name.split('.').pop() ?? '' : ''
        const safeExt = rawExt.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 8)
        const ext = safeExt || (media.kind === 'video' ? 'mp4' : 'jpg')
        const path = `${session.user.id}/${reportId}/${media.id}.${ext}`
        const inspectionRowId = inspectionIds.get(inspection.id)
        if (!inspectionRowId) {
          // Never store a photo without its inspection: it would be invisible in the report.
          console.error('No inspection row for new media', inspection.id)
          failedNames.push(media.name); nextMedia.push(media); pendingDone += 1
          continue
        }
        console.log('[v0] uploading media', { name: media.name, kind: media.kind, size: media.file.size, path })
        onProgress?.({ fileName: media.name, done: pendingDone, total: pendingTotal, percent: 0 })
        // Insert the media row first: the storage INSERT RLS policy requires a matching media_assets row (same storage_path/user_id/report owner) to exist before the file upload is permitted.
        // Reuse the local id when it is a UUID so the open form can match the pending item to its stored copy.
        const { data: insertedMedia, error: mediaError } = await supabase.from('media_assets').insert({ ...(UUID_PATTERN.test(media.id) ? { id: media.id } : {}), report_id: reportId, inspection_id: inspectionRowId, user_id: session.user.id, storage_path: path, kind: media.kind, phase: media.phase, file_name: media.name, location: media.location, note: media.note }).select('id').single()
        if (mediaError || !insertedMedia) { console.log('[v0] media record insert failed', mediaError?.message); failedNames.push(media.name); nextMedia.push(media); pendingDone += 1; continue }
        try {
          await uploadMediaFile({ supabase, path, file: media.file, onProgress: (p) => onProgress?.({ fileName: media.name, done: pendingDone, total: pendingTotal, percent: p.total ? Math.round((p.loaded / p.total) * 100) : 0 }) })
        } catch (uploadError) {
          console.log('[v0] media upload failed', media.name, uploadError instanceof Error ? uploadError.message : uploadError)
          await supabase.from('media_assets').delete().eq('id', insertedMedia.id)
          failedNames.push(media.name)
          nextMedia.push(media)
          pendingDone += 1
          continue
        }
        console.log('[v0] media upload success', media.name)
        pendingDone += 1
        const { data: signed } = await supabase.storage.from('report-media').createSignedUrl(path, 3600)
        const storedItem: MediaItem = { id: insertedMedia.id, url: signed?.signedUrl ?? '', kind: media.kind, name: media.name, phase: media.phase, location: media.location, note: media.note, storagePath: path }
        uploadedMedia.current.set(media.id, storedItem)
        nextBaseline.media.set(storedItem.id, { location: storedItem.location, note: storedItem.note, phase: storedItem.phase })
        nextMedia.push(storedItem)
      }
      persistedInspections.push({ ...inspection, media: nextMedia })
    }
    const persisted: Report = { ...report, ownerId, details: { ...report.details, reportNumber: saved.report_number ?? report.details.reportNumber }, inspections: persistedInspections }
    nextBaseline.details = detailValues(persisted)
    setReports((prev) => prev.some((item) => item.id === persisted.id) ? prev.map((item) => item.id === persisted.id ? persisted : item) : [persisted, ...prev])
    if (failedNames.length) {
      setMessage(`הדוח נשמר, אך העלאה או שמירת פרטי הקבצים הבאים נכשלה: ${failedNames.join(', ')}. נסו לשמור שוב לפני רענון הדף.`)
      return persisted
    }
    if (close) { setMessage('הדוח נשמר בהצלחה.'); closeReport() }
    return persisted
  }

  return <div className="mx-auto min-h-dvh w-full max-w-md bg-background"><header className="flex items-center justify-between border-b border-border bg-card px-4 py-3"><div><p className="text-xs font-bold text-primary">שארק רובוטים מתקדמים</p><p className="text-sm font-semibold">{profile?.full_name || session.user.email} · {profile?.role === 'manager' ? 'מנהל' : 'עובד'}</p></div><button type="button" onClick={signOut} disabled={signingOut} className="flex size-10 items-center justify-center rounded-xl hover:bg-muted disabled:opacity-60" aria-label={signingOut ? 'שומר ומתנתק' : 'התנתקות'}>{signingOut ? <Loader2 className="size-5 animate-spin" /> : <LogOut className="size-5" />}</button></header>{activeReport ? <ReportForm key={activeReport.id} initialReport={activeReport} isNew={isNew} onCancel={closeReport} onSave={(report, onProgress) => saveReport(report, true, onProgress)} onAutosave={(draft) => saveReport(draft, false)} flushRef={flushForm} saveMessage={message} /> : <><ReportList reports={reports.length ? reports : SAMPLE_REPORTS} onCreate={() => openReport(createEmptyReport(reports), true)} onOpen={(report) => openReport(report, false)} canDelete={profile?.role === 'manager' && reports.length > 0} onDelete={deleteReport} />{openingId && <div role="status" className="fixed inset-0 z-40 flex items-center justify-center bg-background/70"><p className="flex items-center gap-2 rounded-xl bg-card px-4 py-3 font-semibold shadow-lg"><Loader2 className="size-5 animate-spin" />פותח את הדוח...</p></div>}<div className="px-4 pb-6"><p className="mb-3 text-xs text-muted-foreground">הדוחות המוצגים ללא התחברות למסד הנתונים מסומנים כדוגמה.</p>{profile?.role === 'manager' && <ManagerInvite />}{message && <p role="status" className="mt-3 rounded-xl bg-success-soft px-3 py-3 text-sm text-success">{message}</p>}</div></>}</div>
}

function fromDatabase(row: any, mediaRows: any[] = []): Report {
  // A photo whose inspection row is missing is shown under the first inspection instead of disappearing.
  const knownInspectionIds = new Set((row.inspections ?? []).map((entry: any) => entry.id))
  const belongsTo = (media: any, id: string, item: any) => (item && media.inspection_id === item.id) || (id === inspectionNames[0] && !knownInspectionIds.has(media.inspection_id))
  return { id: row.id, ownerId: row.owner_id ?? undefined, status: row.status, details: { project: row.project, reportNumber: row.report_number, address: row.address, building: row.building, apartment: row.apartment, floor: row.floor, clientName: row.client_name, inspector: row.inspector, date: row.report_date ?? '' }, inspections: inspectionNames.map((id) => { const item = row.inspections?.find((entry: any) => entry.inspection_key === id); return { id, result: item?.result ?? null, note: item?.note ?? '', media: mediaRows.filter((media) => belongsTo(media, id, item)).map((media) => ({ id: media.id, url: media.url, kind: media.kind, name: media.file_name, phase: media.phase, location: media.location, note: media.note, storagePath: media.storage_path })) } }), findings: row.findings ?? [] }
}

function ManagerInvite() {
  const [open, setOpen] = useState(false); const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [password, setPassword] = useState(''); const [role, setRole] = useState('worker'); const [status, setStatus] = useState('')
  async function submit(event: React.FormEvent) { event.preventDefault(); const response = await fetch('/api/manager/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, fullName: name, password, role }) }); const data = await response.json(); setStatus(data.ok ? 'המשתמש נוסף בהצלחה.' : data.error); if (data.ok) setOpen(false) }
  return <div className="rounded-2xl border border-border bg-card p-4"><button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-input py-3 font-semibold"><UserPlus className="size-5" />ניהול משתמשים</button>{open && <form onSubmit={submit} className="mt-4 space-y-3"><input required placeholder="שם מלא" value={name} onChange={(e) => setName(e.target.value)} className="h-12 w-full rounded-xl border border-input bg-background px-3" /><input required type="email" placeholder="מייל" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 w-full rounded-xl border border-input bg-background px-3" /><input required minLength={8} type="password" placeholder="סיסמה זמנית" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 w-full rounded-xl border border-input bg-background px-3" /><select value={role} onChange={(e) => setRole(e.target.value)} className="h-12 w-full rounded-xl border border-input bg-background px-3"><option value="worker">עובד</option><option value="manager">מנהל</option></select><button className="h-12 w-full rounded-xl bg-primary font-bold text-primary-foreground">הוספת משתמש מורשה</button>{status && <p role="alert" className="text-sm text-destructive">{status}</p>}</form>}</div>
}
