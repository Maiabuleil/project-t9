'use client'

import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { MediaItem, Report } from '@/lib/types'
import { INSPECTION_ORDER, SEVERITY_META } from '@/lib/report-utils'
import { createClient } from '@/lib/supabase/client'
import { PAGE_HEIGHT, PAGE_WIDTH, PDF_INSPECTION_LABELS, ReportPdfPages, type PdfData, type PdfPhoto, type PdfPhotoPair } from './report-pdf-pages'

export type PdfProgress = { step: string; done: number; total: number }

// Largest side of a photo inside the PDF. Phone photos are scaled down so the file stays small enough to send.
const MAX_PHOTO_SIDE = 1400

// Builds the report PDF in the browser and downloads it.
// Pages are laid out as HTML (so Hebrew and right-to-left text render correctly), captured as images and placed on A4 pages.
export async function generateReportPdf(report: Report, onProgress?: (progress: PdfProgress) => void): Promise<void> {
  const [{ jsPDF }, { toJpeg }] = await Promise.all([import('jspdf'), import('html-to-image')])

  const photos = report.inspections.flatMap((inspection) => inspection.media.filter((item) => item.kind === 'image'))
  let loaded = 0
  onProgress?.({ step: 'טוען תמונות', done: 0, total: photos.length })

  const [logo, association, watermark] = await Promise.all([
    loadImage('/report/shark-logo.png', 900, 'image/png'),
    loadImage('/report/association-logo.png', 600, 'image/png'),
    loadImage('/report/watermark.png', 900, 'image/png'),
  ])

  const photoSources = new Map<string, string>()
  await runLimited(photos, 3, async (item) => {
    try {
      photoSources.set(item.id, await loadImage(await resolveMediaUrl(item), MAX_PHOTO_SIDE, 'image/jpeg'))
    } catch (error) {
      console.error('Loading photo for PDF failed', item.name, error)
    }
    loaded += 1
    onProgress?.({ step: 'טוען תמונות', done: loaded, total: photos.length })
  })

  const data = buildPdfData(report, photoSources, { logo, association, watermark })

  const container = document.createElement('div')
  container.setAttribute('aria-hidden', 'true')
  container.style.cssText = `position:fixed;top:0;left:-${PAGE_WIDTH * 2}px;width:${PAGE_WIDTH}px;pointer-events:none;z-index:-1;`
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    flushSync(() => root.render(<ReportPdfPages data={data} />))
    await Promise.all(Array.from(container.querySelectorAll('img')).map((img) => img.decode().catch(() => undefined)))

    const pages = Array.from(container.querySelectorAll<HTMLElement>('[data-pdf-page]'))
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
    for (const [index, page] of pages.entries()) {
      onProgress?.({ step: 'יוצר עמודים', done: index, total: pages.length })
      const image = await toJpeg(page, { width: PAGE_WIDTH, height: PAGE_HEIGHT, pixelRatio: 2, quality: 0.85, backgroundColor: '#FFFFFF', skipFonts: true, cacheBust: false })
      if (index > 0) pdf.addPage()
      pdf.addImage(image, 'JPEG', 0, 0, 210, 297, undefined, 'FAST')
    }
    onProgress?.({ step: 'שומר', done: pages.length, total: pages.length })
    pdf.setProperties({ title: `דוח בדיקת קווי דלוחים ${data.reportNumber}`.trim(), author: 'שארק רובוטים מתקדמים בע"מ' })
    pdf.save(pdfFileName(report))
  } finally {
    root.unmount()
    container.remove()
  }
}

function buildPdfData(report: Report, photoSources: Map<string, string>, assets: PdfData['assets']): PdfData {
  const { details } = report
  const unit = [details.building && `בניין ${details.building}`, details.floor && `קומה ${details.floor}`, details.apartment && `דירה ${details.apartment}`].filter(Boolean).join('  ')

  const byId = new Map(report.inspections.map((inspection) => [inspection.id, inspection]))
  const ordered = INSPECTION_ORDER.map((id) => byId.get(id)).filter((inspection) => inspection !== undefined)

  const results = ordered.map((inspection) => ({
    label: PDF_INSPECTION_LABELS[inspection.id],
    result: inspection.result,
    note: inspection.note.trim() || (inspection.result === 'ok' ? 'תקין' : inspection.result === 'not-ok' ? 'לא תקין' : 'לא בוצע'),
  }))

  const photoPairs: PdfPhotoPair[] = []
  for (const inspection of ordered) {
    const toPhoto = (item: MediaItem): PdfPhoto | null => {
      const src = photoSources.get(item.id)
      return src ? { src, caption: item.location, note: item.note } : null
    }
    const before = inspection.media.filter((item) => item.kind === 'image' && item.phase === 'before').map(toPhoto).filter((photo) => photo !== null)
    const after = inspection.media.filter((item) => item.kind === 'image' && item.phase === 'after').map(toPhoto).filter((photo) => photo !== null)
    for (let i = 0; i < Math.max(before.length, after.length); i += 1) {
      photoPairs.push({ inspection: PDF_INSPECTION_LABELS[inspection.id], before: before[i] ?? null, after: after[i] ?? null })
    }
  }

  return {
    reportNumber: details.reportNumber,
    inspectionDate: formatPdfDate(details.date),
    productionDate: formatPdfDate(new Date().toISOString().slice(0, 10)),
    clientName: details.clientName || details.project,
    address: details.address,
    unit,
    inspector: details.inspector,
    results,
    findings: report.findings.filter((finding) => finding.location.trim() || finding.description.trim() || finding.recommendation.trim()),
    findingsSeverity: Object.fromEntries(Object.entries(SEVERITY_META).map(([key, meta]) => [key, meta.label])),
    photoPairs,
    assets,
  }
}

async function resolveMediaUrl(item: MediaItem): Promise<string> {
  if (item.file || !item.storagePath) return item.url
  const { data, error } = await createClient().storage.from('report-media').createSignedUrl(item.storagePath, 600)
  if (error || !data?.signedUrl) throw error ?? new Error('no signed url')
  return data.signedUrl
}

// Fetches an image and re-encodes it as a data URL (scaled to maxSide), so the page capture never hits cross-origin limits.
async function loadImage(url: string, maxSide: number, type: 'image/jpeg' | 'image/png'): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: 'from-image' })
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas unavailable')
  if (type === 'image/jpeg') {
    context.fillStyle = '#FFFFFF'
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL(type, 0.85)
}

async function runLimited<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await task(items[next++])
  })
  await Promise.all(workers)
}

function formatPdfDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso
}

function pdfFileName(report: Report) {
  const parts = ['דוח', report.details.reportNumber, report.details.address, report.details.apartment && `דירה ${report.details.apartment}`]
  return `${parts.filter(Boolean).join(' ').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()}.pdf`
}
