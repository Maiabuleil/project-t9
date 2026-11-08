export type ReportStatus = 'draft' | 'completed' | 'needs-repair'

export type CheckResult = 'ok' | 'not-ok' | null

export type MediaPhase = 'before' | 'after'

export type MediaKind = 'image' | 'video'

export type MediaItem = {
  id: string
  url: string
  kind: MediaKind
  name: string
  phase: MediaPhase
  location: string
  note: string
  file?: File
  storagePath?: string
}

export type InspectionId = 'flushing' | 'flood' | 'camera' | 'ac-line'

export type Inspection = {
  id: InspectionId
  result: CheckResult
  note: string
  media: MediaItem[]
}

export type Severity = 'low' | 'medium' | 'high' | 'critical'

export type Finding = {
  id: string
  location: string
  description: string
  severity: Severity
  recommendation: string
}

export type ReportDetails = {
  project: string
  reportNumber: string
  address: string
  building: string
  apartment: string
  floor: string
  clientName: string
  inspector: string
  date: string
}

export type Report = {
  id: string
  // The worker who owns the report. Kept on save so a manager editing it does not take over ownership.
  ownerId?: string
  status: ReportStatus
  details: ReportDetails
  inspections: Inspection[]
  findings: Finding[]
}
