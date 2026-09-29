import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'יש להתחבר כדי למחוק דוח.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'manager') return NextResponse.json({ error: 'רק מנהלת יכולה למחוק דוחות.' }, { status: 403 })

  const { id } = await params
  const { data: media, error: mediaError } = await supabase.from('media_assets').select('storage_path').eq('report_id', id)
  if (mediaError) return NextResponse.json({ error: 'לא ניתן לטעון את קובצי המדיה למחיקה.' }, { status: 500 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
  if (!serviceKey) return NextResponse.json({ error: 'חסר מפתח שרת למחיקת קובצי המדיה.' }, { status: 500 })
  const admin = createSupabaseClient(process.env.SUPABASE_URL!, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const paths = (media ?? []).map((item) => item.storage_path)
  if (paths.length) {
    const { error: storageError } = await admin.storage.from('report-media').remove(paths)
    if (storageError) return NextResponse.json({ error: 'מחיקת קובצי המדיה נכשלה. הדוח לא נמחק.' }, { status: 500 })
  }

  const { error: deleteError } = await supabase.from('reports').delete().eq('id', id)
  if (deleteError) {
    const cleanup = paths.length ? await admin.storage.from('report-media').remove(paths) : { error: null }
    const message = cleanup.error
      ? 'מחיקת הדוח נכשלה ונדרש ניקוי קובצי מדיה מצד מנהל המערכת.'
      : 'מחיקת הדוח נכשלה. קובצי המדיה שוחזרו ככל שניתן.'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
