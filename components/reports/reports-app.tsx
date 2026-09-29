'use client'

import { useEffect, useState } from 'react'
import { LogOut, UserPlus } from 'lucide-react'
import { SAMPLE_REPORTS } from '@/lib/sample-data'
import { createEmptyReport } from '@/lib/report-utils'
import type { Report } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { ReportList } from './report-list'
import { ReportForm } from './report-form'
import { LoginScreen } from '@/components/auth/login-screen'

const inspectionNames = ['flushing', 'flood', 'camera'] as const

export function ReportsApp() {
  const [session, setSession] = useState<any>(null)
  const [profile, setProfile] = useState<{ full_name: string; role: 'worker' | 'manager' } | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const [activeReport, setActiveReport] = useState<Report | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }: { data: { session: any } }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event: any, next: any) => setSession(next))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) { setLoading(false); return }
    const load = async () => {
      const supabase = createClient()
      const [{ data: currentProfile }, { data: rows, error: reportsError }] = await Promise.all([
        supabase.from('profiles').select('full_name, role').eq('id', session.user.id).single(),
        supabase.from('reports').select('id, status, project, report_number, address, building, apartment, floor, client_name, inspector, report_date, owner_id, inspections(id, inspection_key, result, note), findings(id, location, description, severity, recommendation)').order('updated_at', { ascending: false }),
      ])
      if (reportsError) {
        setMessage('טעינת הדוחות נכשלה. בדקו את החיבור ונסו שוב.')
        setLoading(false)
        return
      }
      const reportRows = rows ?? []
      const reportIds = reportRows.map((row: any) => row.id)
      const { data: mediaRows } = reportIds.length
        ? await supabase.from('media_assets').select('id, report_id, inspection_id, storage_path, kind, phase, file_name, location, note').in('report_id', reportIds)
        : { data: [] as any[] }
      const mediaWithUrls = await Promise.all((mediaRows ?? []).map(async (media: any) => {
        const { data } = await supabase.storage.from('report-media').createSignedUrl(media.storage_path, 3600)
        return { ...media, url: data?.signedUrl ?? '' }
      }))
      setProfile(currentProfile)
      setReports(reportRows.map((row: any) => fromDatabase(row, mediaWithUrls.filter((media: any) => media.report_id === row.id))))
      setLoading(false)
    }
    load()
  }, [session])

  if (!session) return <LoginScreen />
  if (loading) return <main className="flex min-h-dvh items-center justify-center text-muted-foreground">טוען את הדוחות...</main>

  function openReport(report: Report, fresh: boolean) { setActiveReport(report); setIsNew(fresh); window.scrollTo({ top: 0 }) }
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

  async function saveReport(report: Report, close = true) {
    setMessage('')
    const supabase = createClient()
    const { data: saved, error } = await supabase.from('reports').upsert({ id: report.id, owner_id: session.user.id, status: report.status, project: report.details.project, report_number: report.details.reportNumber, address: report.details.address, building: report.details.building, apartment: report.details.apartment, floor: report.details.floor, client_name: report.details.clientName, inspector: report.details.inspector, report_date: report.details.date || null, updated_at: new Date().toISOString() }).select('id').single()
    if (error || !saved) { setMessage('שמירת הדוח נכשלה. בדקו את החיבור ונסו שוב.'); return }
    const { data: savedInspections } = await supabase.from('inspections').upsert(report.inspections.map((inspection) => ({ report_id: saved.id, inspection_key: inspection.id, result: inspection.result, note: inspection.note })), { onConflict: 'report_id,inspection_key' }).select('id, inspection_key')
    const inspectionIds = new Map((savedInspections ?? []).map((item: { inspection_key: string; id: string }) => [item.inspection_key, item.id]))
    const { data: previousMedia } = await supabase.from('media_assets').select('id, storage_path').eq('report_id', saved.id)
    const keptMediaIds = new Set(report.inspections.flatMap((inspection) => inspection.media.filter((media) => !media.file).map((media) => media.id)))
    const removedMedia = (previousMedia ?? []).filter((media: any) => !keptMediaIds.has(media.id))
    for (const media of removedMedia) await supabase.storage.from('report-media').remove([media.storage_path])
    if (removedMedia.length) await supabase.from('media_assets').delete().in('id', removedMedia.map((media: any) => media.id))
    for (const inspection of report.inspections) for (const media of inspection.media) if (media.file) {
      const path = `${session.user.id}/${saved.id}/${media.id}-${media.name}`
      const inspectionId = inspectionIds.get(inspection.id)
      const { error: mediaError } = await supabase.from('media_assets').insert({ report_id: saved.id, inspection_id: inspectionId, user_id: session.user.id, storage_path: path, kind: media.kind, phase: media.phase, file_name: media.name, location: media.location, note: media.note })
      if (mediaError) { setMessage('הדוח נשמר, אך שמירת פרטי המדיה נכשלה.'); return }
      const upload = await supabase.storage.from('report-media').upload(path, media.file, { upsert: true, contentType: media.file.type })
      if (upload.error) {
        await supabase.from('media_assets').delete().eq('storage_path', path)
        setMessage('הדוח נשמר, אך העלאת אחד מקובצי המדיה נכשלה.')
        return
      }
    }
    await supabase.from('findings').delete().eq('report_id', saved.id)
    if (report.findings.length) await supabase.from('findings').insert(report.findings.map((finding) => ({ report_id: saved.id, location: finding.location, description: finding.description, severity: finding.severity, recommendation: finding.recommendation })))
    setReports((prev) => prev.some((item) => item.id === report.id) ? prev.map((item) => item.id === report.id ? report : item) : [report, ...prev])
    setMessage('הדוח נשמר בהצלחה.')
    if (close) closeReport()
  }

  return <div className="mx-auto min-h-dvh w-full max-w-md bg-background"><header className="flex items-center justify-between border-b border-border bg-card px-4 py-3"><div><p className="text-xs font-bold text-primary">שארק רובוטים מתקדמים</p><p className="text-sm font-semibold">{profile?.full_name || session.user.email} · {profile?.role === 'manager' ? 'מנהל' : 'עובד'}</p></div><button type="button" onClick={() => createClient().auth.signOut()} className="flex size-10 items-center justify-center rounded-xl hover:bg-muted" aria-label="התנתקות"><LogOut className="size-5" /></button></header>{activeReport ? <ReportForm key={activeReport.id} initialReport={activeReport} isNew={isNew} onCancel={closeReport} onSave={saveReport} onAutosave={(draft) => saveReport(draft, false)} /> : <><ReportList reports={reports.length ? reports : SAMPLE_REPORTS} onCreate={() => openReport(createEmptyReport(reports), true)} onOpen={(report) => openReport(report, false)} canDelete={profile?.role === 'manager' && reports.length > 0} onDelete={deleteReport} /><div className="px-4 pb-6"><p className="mb-3 text-xs text-muted-foreground">הדוחות המוצגים ללא התחברות למסד הנתונים מסומנים כדוגמה.</p>{profile?.role === 'manager' && <ManagerInvite />}{message && <p role="status" className="mt-3 rounded-xl bg-success-soft px-3 py-3 text-sm text-success">{message}</p>}</div></>}</div>
}

function fromDatabase(row: any, mediaRows: any[] = []): Report {
  return { id: row.id, status: row.status, details: { project: row.project, reportNumber: row.report_number, address: row.address, building: row.building, apartment: row.apartment, floor: row.floor, clientName: row.client_name, inspector: row.inspector, date: row.report_date ?? '' }, inspections: inspectionNames.map((id) => { const item = row.inspections?.find((entry: any) => entry.inspection_key === id); return { id, result: item?.result ?? null, note: item?.note ?? '', media: mediaRows.filter((media) => media.inspection_id === item?.id).map((media) => ({ id: media.id, url: media.url, kind: media.kind, name: media.file_name, phase: media.phase, location: media.location, note: media.note, storagePath: media.storage_path })) } }), findings: row.findings ?? [] }
}

function ManagerInvite() {
  const [open, setOpen] = useState(false); const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [password, setPassword] = useState(''); const [role, setRole] = useState('worker'); const [status, setStatus] = useState('')
  async function submit(event: React.FormEvent) { event.preventDefault(); const response = await fetch('/api/manager/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, fullName: name, password, role }) }); const data = await response.json(); setStatus(data.ok ? 'המשתמש נוסף בהצלחה.' : data.error); if (data.ok) setOpen(false) }
  return <div className="rounded-2xl border border-border bg-card p-4"><button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-input py-3 font-semibold"><UserPlus className="size-5" />ניהול משתמשים</button>{open && <form onSubmit={submit} className="mt-4 space-y-3"><input required placeholder="שם מלא" value={name} onChange={(e) => setName(e.target.value)} className="h-12 w-full rounded-xl border border-input bg-background px-3" /><input required type="email" placeholder="מייל" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 w-full rounded-xl border border-input bg-background px-3" /><input required minLength={8} type="password" placeholder="סיסמה זמנית" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 w-full rounded-xl border border-input bg-background px-3" /><select value={role} onChange={(e) => setRole(e.target.value)} className="h-12 w-full rounded-xl border border-input bg-background px-3"><option value="worker">עובד</option><option value="manager">מנהל</option></select><button className="h-12 w-full rounded-xl bg-primary font-bold text-primary-foreground">הוספת משתמש מורשה</button>{status && <p role="alert" className="text-sm text-destructive">{status}</p>}</form>}</div>
}
