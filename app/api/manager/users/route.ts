import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'נדרשת התחברות' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'manager') return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const body = await request.json()
  if (!body.email || !body.password || !['worker', 'manager'].includes(body.role)) return NextResponse.json({ error: 'פרטים חסרים' }, { status: 400 })
  const admin = createAdminClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await admin.auth.admin.createUser({ email: body.email, password: body.password, email_confirm: true, user_metadata: { full_name: body.fullName ?? '' } })
  if (error || !data.user) return NextResponse.json({ error: 'לא ניתן ליצור את המשתמש. ייתכן שהמייל כבר קיים.' }, { status: 400 })
  const { error: profileError } = await admin.from('profiles').update({ full_name: body.fullName ?? '', role: body.role }).eq('id', data.user.id)
  if (profileError) return NextResponse.json({ error: 'המשתמש נוצר אך עדכון התפקיד נכשל.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
