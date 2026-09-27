'use client'

import { FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (event.nativeEvent instanceof SubmitEvent && (event.nativeEvent as SubmitEvent).submitter === null) return
    setBusy(true); setError('')
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError(error.message.toLowerCase().includes('confirm') ? 'יש לאשר את כתובת המייל לפני ההתחברות.' : 'כתובת המייל או הסיסמה אינן נכונות.')
    setBusy(false)
  }

  return <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8"><section className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-sm"><p className="mb-2 text-sm font-bold text-primary">שארק רובוטים מתקדמים</p><h1 className="text-2xl font-bold">כניסה למערכת</h1><p className="mt-2 text-sm text-muted-foreground">התחברו עם פרטי העובד האישיים שלכם.</p><form onSubmit={submit} className="mt-8 space-y-5"><label className="block"><span className="mb-2 block text-sm font-semibold">כתובת מייל</span><input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-14 w-full rounded-xl border border-input bg-background px-4 text-base outline-none focus:ring-4 focus:ring-ring/20" /></label><label className="block"><span className="mb-2 block text-sm font-semibold">סיסמה</span><input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-14 w-full rounded-xl border border-input bg-background px-4 text-base outline-none focus:ring-4 focus:ring-ring/20" /></label>{error && <p role="alert" className="rounded-xl bg-destructive-soft px-3 py-3 text-sm text-destructive">{error}</p>}<button disabled={busy} className="h-14 w-full rounded-xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-60">{busy ? 'מתחבר...' : 'כניסה'}</button></form></section></main>
}
