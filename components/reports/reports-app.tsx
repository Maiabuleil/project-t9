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
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
      const [{ data: currentProfile }, { data: rows, error: reportsError }] = await Promise.all([
        supabase.from('profiles').select('full_name, role').eq('id', userId).single(),
        supabase.from('reports').select('id, status, project, report_number, address, building, apartment, floor, client_name, inspector, report_date, owner_id, inspections(id, inspection_key, result, note), findings(id, location, description, severity, recommendation)').order('updated_at', { ascending: false }),
      ])
      if (reportsError) {
        setMessage('טעינת הדוחות נכשלה. בדקו את החיבור ונסו שוב.')
        setLoading(false)
        return
      }
      const reportRows = rows ?? []
      const reportIds = reportRows.map((row: any) => row.id)
      const { data: mediaRows, error: mediaError } = reportIds.length
        ? await supabase.from('media_assets').select('id, report_id, inspection_id, storage_path, kind, phase, file_name, location, note').in('report_id', reportIds)
        : { data: [] as any[], error: null }
      if (mediaError) {
        console.error('Loading report media failed', mediaError)
        setMessage('טעינת התמונות נכשלה. בדקו את החיבור ונסו שוב.')
      }
      const mediaWithUrls = await Promise.all((mediaRows ?? []).map(async (media: any) => {
        const { data, error } = await supabase.storage.from('report-media').createSignedUrl(media.storage_path, 3600)
        if (error) console.error('Loading stored image failed', media.storage_path, error)
        return { ...media, url: data?.signedUrl ?? '' }
      }))
      setProfile(currentProfile)
      setReports(reportRows.map((row: any) => fromDatabase(row, mediaWithUrls.filter((media: any) => media.report_id === row.id))))
      setLoading(false)
    }
    load()
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

  function openReport(report: Report, fresh: boolean) { setMessage(''); setActiveReport(report); setIsNew(fresh); window.scrollTo({ top: 0 }) }
  function closeReport() { setActiveReport(null); window.scrollTo({ top: 0 }) }

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
    const basePayload = { id: report.id, owner_id: ownerId, status: report.status, project: report.details.project, address: report.details.address, building: report.details.building, apartment: report.details.apartment, floor: report.details.floor, client_name: report.details.clientName, inspector: report.details.inspector, report_date: report.details.date || null, updated_at: new Date().toISOString() }
    // Omit report_number for brand-new reports so the database sequence assigns a unique number (safe under concurrency).
    const payload = report.details.reportNumber ? { ...basePayload, report_number: report.details.reportNumber } : basePayload
    const { data: saved, error } = await supabase.from('reports').upsert(payload).select('id, report_number').single()
    if (error || !saved) { setMessage('שמירת הדוח נכשלה. בדקו את החיבור ונסו שוב.'); return }
    const isFilled = (inspection: Inspection) => inspection.result !== null || inspection.note.trim() !== '' || inspection.media.length > 0
    const filledInspections = report.inspections.filter(isFilled)
    const emptyKeys = report.inspections.filter((inspection) => !isFilled(inspection)).map((inspection) => inspection.id)
    if (emptyKeys.length) await supabase.from('inspections').delete().eq('report_id', saved.id).in('inspection_key', emptyKeys)
    let savedInspections: { id: string; inspection_key: string }[] = []
    if (filledInspections.length) {
      const { data: upserted, error: inspectionError } = await supabase.from('inspections').upsert(filledInspections.map((inspection) => ({ report_id: saved.id, inspection_key: inspection.id, result: inspection.result, note: inspection.note })), { onConflict: 'report_id,inspection_key' }).select('id, inspection_key')
      if (inspectionError) { setMessage('שמירת פרטי הבדיקות נכשלה. נסו שוב.'); return }
      savedInspections = upserted ?? []
    }
    const inspectionIds = new Map(savedInspections.map((item) => [item.inspection_key, item.id]))
    // Persist findings before media so a media upload failure never loses them.
    await supabase.from('findings').delete().eq('report_id', saved.id)
    if (report.findings.length) await supabase.from('findings').insert(report.findings.map((finding) => ({ report_id: saved.id, location: finding.location, description: finding.description, severity: finding.severity, recommendation: finding.recommendation })))
    // Autosave can hold an older form snapshot while another save uploads media.
    // Never infer deletion from a missing item in that snapshot: it can delete a newly uploaded file.
    // Only the explicit save action may reconcile removed, previously persisted files.
    if (close && !report.inspections.some((inspection) => inspection.media.some((media) => media.file))) {
      const { data: previousMedia, error: previousMediaError } = await supabase.from('media_assets').select('id, storage_path').eq('report_id', saved.id)
      if (previousMediaError) { console.error('Reading stored media failed', previousMediaError); setMessage('בדיקת התמונות הקיימות נכשלה. נסו שוב.'); return }
      const keptMediaIds = new Set(report.inspections.flatMap((inspection) => inspection.media.filter((media) => !media.file).map((media) => media.id)))
      const removedMedia = (previousMedia ?? []).filter((media: any) => !keptMediaIds.has(media.id))
      for (const media of removedMedia) {
        const { error: removalError } = await supabase.storage.from('report-media').remove([media.storage_path])
        if (removalError) { console.error('Removing stored media failed', removalError); setMessage('מחיקת תמונה נכשלה. נסו שוב.'); return }
        const { error: rowError } = await supabase.from('media_assets').delete().eq('id', media.id)
        if (rowError) { console.error('Removing media record failed', rowError); setMessage('עדכון התמונות נכשל. נסו שוב.'); return }
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
          const { error: updateError } = await supabase.from('media_assets').update({ location: stored.location, note: stored.note, phase: stored.phase }).eq('id', stored.id).eq('report_id', saved.id)
          if (updateError) { console.error('Updating media details failed', stored.id, updateError); failedNames.push(stored.name) }
          nextMedia.push(stored)
          continue
        }
        if (!media.file) {
          // Existing files still need their editable metadata persisted.
          const { data: updatedMedia, error: updateError } = await supabase.from('media_assets')
            .update({ location: media.location, note: media.note, phase: media.phase })
            .eq('id', media.id).eq('report_id', saved.id).select('id').single()
          if (updateError || !updatedMedia) {
            console.error('Updating media details failed', media.id, updateError)
            failedNames.push(media.name)
          }
          nextMedia.push(media)
          continue
        }
        // Build a Supabase-safe storage key: raw device filenames often contain Hebrew, spaces, or symbols that Storage rejects as an "Invalid key", which fails the upload. The random media.id keeps the key unique; the human-readable name stays in the file_name column.
        const rawExt = media.name.includes('.') ? media.name.split('.').pop() ?? '' : ''
        const safeExt = rawExt.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 8)
        const ext = safeExt || (media.kind === 'video' ? 'mp4' : 'jpg')
        const path = `${session.user.id}/${saved.id}/${media.id}.${ext}`
        console.log('[v0] uploading media', { name: media.name, kind: media.kind, size: media.file.size, path })
        onProgress?.({ fileName: media.name, done: pendingDone, total: pendingTotal, percent: 0 })
        // Insert the media row first: the storage INSERT RLS policy requires a matching media_assets row (same storage_path/user_id/report owner) to exist before the file upload is permitted.
        // Reuse the local id when it is a UUID so the open form can match the pending item to its stored copy.
        const { data: insertedMedia, error: mediaError } = await supabase.from('media_assets').insert({ ...(UUID_PATTERN.test(media.id) ? { id: media.id } : {}), report_id: saved.id, inspection_id: inspectionIds.get(inspection.id) ?? null, user_id: session.user.id, storage_path: path, kind: media.kind, phase: media.phase, file_name: media.name, location: media.location, note: media.note }).select('id').single()
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
        nextMedia.push(storedItem)
      }
      persistedInspections.push({ ...inspection, media: nextMedia })
    }
    const persisted: Report = { ...report, ownerId, details: { ...report.details, reportNumber: saved.report_number ?? report.details.reportNumber }, inspections: persistedInspections }
    setReports((prev) => prev.some((item) => item.id === persisted.id) ? prev.map((item) => item.id === persisted.id ? persisted : item) : [persisted, ...prev])
    if (failedNames.length) {
      setMessage(`הדוח נשמר, אך העלאה או שמירת פרטי הקבצים הבאים נכשלה: ${failedNames.join(', ')}. נסו לשמור שוב לפני רענון הדף.`)
      return persisted
    }
    if (close) { setMessage('הדוח נשמר בהצלחה.'); closeReport() }
    return persisted
  }

  return <div className="mx-auto min-h-dvh w-full max-w-md bg-background"><header className="flex items-center justify-between border-b border-border bg-card px-4 py-3"><div><p className="text-xs font-bold text-primary">שארק רובוטים מתקדמים</p><p className="text-sm font-semibold">{profile?.full_name || session.user.email} · {profile?.role === 'manager' ? 'מנהל' : 'עובד'}</p></div><button type="button" onClick={signOut} disabled={signingOut} className="flex size-10 items-center justify-center rounded-xl hover:bg-muted disabled:opacity-60" aria-label={signingOut ? 'שומר ומתנתק' : 'התנתקות'}>{signingOut ? <Loader2 className="size-5 animate-spin" /> : <LogOut className="size-5" />}</button></header>{activeReport ? <ReportForm key={activeReport.id} initialReport={activeReport} isNew={isNew} onCancel={closeReport} onSave={(report, onProgress) => saveReport(report, true, onProgress)} onAutosave={(draft) => saveReport(draft, false)} flushRef={flushForm} saveMessage={message} /> : <><ReportList reports={reports.length ? reports : SAMPLE_REPORTS} onCreate={() => openReport(createEmptyReport(reports), true)} onOpen={(report) => openReport(report, false)} canDelete={profile?.role === 'manager' && reports.length > 0} onDelete={deleteReport} /><div className="px-4 pb-6"><p className="mb-3 text-xs text-muted-foreground">הדוחות המוצגים ללא התחברות למסד הנתונים מסומנים כדוגמה.</p>{profile?.role === 'manager' && <ManagerInvite />}{message && <p role="status" className="mt-3 rounded-xl bg-success-soft px-3 py-3 text-sm text-success">{message}</p>}</div></>}</div>
}

function fromDatabase(row: any, mediaRows: any[] = []): Report {
  return { id: row.id, ownerId: row.owner_id ?? undefined, status: row.status, details: { project: row.project, reportNumber: row.report_number, address: row.address, building: row.building, apartment: row.apartment, floor: row.floor, clientName: row.client_name, inspector: row.inspector, date: row.report_date ?? '' }, inspections: inspectionNames.map((id) => { const item = row.inspections?.find((entry: any) => entry.inspection_key === id); return { id, result: item?.result ?? null, note: item?.note ?? '', media: mediaRows.filter((media) => media.inspection_id === item?.id).map((media) => ({ id: media.id, url: media.url, kind: media.kind, name: media.file_name, phase: media.phase, location: media.location, note: media.note, storagePath: media.storage_path })) } }), findings: row.findings ?? [] }
}

function ManagerInvite() {
  const [open, setOpen] = useState(false); const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [password, setPassword] = useState(''); const [role, setRole] = useState('worker'); const [status, setStatus] = useState('')
  async function submit(event: React.FormEvent) { event.preventDefault(); const response = await fetch('/api/manager/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, fullName: name, password, role }) }); const data = await response.json(); setStatus(data.ok ? 'המשתמש נוסף בהצלחה.' : data.error); if (data.ok) setOpen(false) }
  return <div className="rounded-2xl border border-border bg-card p-4"><button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-input py-3 font-semibold"><UserPlus className="size-5" />ניהול משתמשים</button>{open && <form onSubmit={submit} className="mt-4 space-y-3"><input required placeholder="שם מלא" value={name} onChange={(e) => setName(e.target.value)} className="h-12 w-full rounded-xl border border-input bg-background px-3" /><input required type="email" placeholder="מייל" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 w-full rounded-xl border border-input bg-background px-3" /><input required minLength={8} type="password" placeholder="סיסמה זמנית" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 w-full rounded-xl border border-input bg-background px-3" /><select value={role} onChange={(e) => setRole(e.target.value)} className="h-12 w-full rounded-xl border border-input bg-background px-3"><option value="worker">עובד</option><option value="manager">מנהל</option></select><button className="h-12 w-full rounded-xl bg-primary font-bold text-primary-foreground">הוספת משתמש מורשה</button>{status && <p role="alert" className="text-sm text-destructive">{status}</p>}</form>}</div>
}
