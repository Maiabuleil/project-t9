import type {
  Inspection,
  InspectionId,
  Report,
  ReportStatus,
  Severity,
} from './types'

export const INSPECTION_META: Record<
  InspectionId,
  { title: string; description: string }
> = {
  flushing: {
    title: 'שטיפת מערכת הדלוחים',
    description: 'שטיפה בלחץ של קווי הדלוחין מהכיורים, המקלחות ומחסומי הרצפה.',
  },
  flood: {
    title: 'בדיקת הצפה',
    description: 'מילוי נקודות הניקוז במים ובדיקת זרימה, עומדים ודליפות.',
  },
  camera: {
    title: 'צילום פנים צנרת',
    description: 'החדרת מצלמה לצנרת ותיעוד מצב הדפנות, סתימות ושברים.',
  },
  'ac-line': {
    title: 'בדיקת קו מזגן',
    description: 'בדיקת קו ניקוז המזגן וזרימת המים בו. בדיקה אופציונלית.',
  },
}

export const INSPECTION_ORDER: InspectionId[] = ['flushing', 'flood', 'camera', 'ac-line']

export const STATUS_META: Record<ReportStatus, { label: string; className: string }> = {
  draft: { label: 'טיוטה', className: 'bg-muted text-muted-foreground' },
  completed: { label: 'הושלם', className: 'bg-success-soft text-success' },
  'needs-repair': {
    label: 'נדרש תיקון',
    className: 'bg-destructive-soft text-destructive',
  },
}

export const SEVERITY_META: Record<
  Severity,
  { label: string; activeClassName: string; badgeClassName: string }
> = {
  low: {
    label: 'נמוכה',
    activeClassName: 'bg-muted-foreground text-card border-muted-foreground',
    badgeClassName: 'bg-muted text-muted-foreground',
  },
  medium: {
    label: 'בינונית',
    activeClassName: 'bg-primary text-primary-foreground border-primary',
    badgeClassName: 'bg-primary-soft text-primary',
  },
  high: {
    label: 'גבוהה',
    activeClassName: 'bg-destructive-soft text-destructive border-destructive',
    badgeClassName: 'bg-destructive-soft text-destructive',
  },
  critical: {
    label: 'קריטית',
    activeClassName: 'bg-destructive text-primary-foreground border-destructive',
    badgeClassName: 'bg-destructive text-primary-foreground',
  },
}

export const SEVERITY_ORDER: Severity[] = ['low', 'medium', 'high', 'critical']

export const INSPECTORS = ['יוסי כהן', 'מוחמד חסן', 'אבי לוי', 'דנה שמעוני']

export const PROJECTS = [
  'מגדלי הים – בת ים',
  'שכונת הפארק – רמת גן',
  'פרויקט הגפן – פתח תקווה',
]

export function createId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

export function createEmptyInspections(): Inspection[] {
  return INSPECTION_ORDER.map((id) => ({ id, result: null, note: '', media: [] }))
}

export function createEmptyReport(_existing: Report[]): Report {
  return {
    id: createId(),
    status: 'draft',
    details: {
      project: '',
      // Left empty on purpose: the database sequence assigns a unique report number on first save.
      reportNumber: '',
      address: '',
      building: '',
      apartment: '',
      floor: '',
      clientName: '',
      inspector: '',
      date: new Date().toISOString().slice(0, 10),
    },
    inspections: createEmptyInspections(),
    findings: [],
  }
}

export function resolveFinalStatus(report: Report): ReportStatus {
  const hasFailure = report.inspections.some((i) => i.result === 'not-ok')
  const hasSevereFinding = report.findings.some(
    (f) => f.severity === 'high' || f.severity === 'critical',
  )
  return hasFailure || hasSevereFinding ? 'needs-repair' : 'completed'
}

export function formatDate(iso: string) {
  if (!iso) return ''
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}
